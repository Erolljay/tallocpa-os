import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bindChatToClient,
  findClient,
  ingestPhotoInvoice,
  resolveClientForChat,
} from "@tallocpa/db";
import { formatInvoiceSummary, mapExtraction } from "@tallocpa/photo-parser";
import type { BotConfig } from "./config.js";
import type { GeminiClient } from "@tallocpa/photo-parser";
import { uploadReceipt } from "./storage.js";
import type {
  TelegramClient,
  TelegramMessage,
  TelegramUpdate,
} from "./telegram.js";

export interface BotDeps {
  config: BotConfig;
  telegram: TelegramClient;
  gemini: GeminiClient;
  /** null when running reply-only (no Supabase credentials). */
  supabase: SupabaseClient | null;
}

const HELP = [
  "📷 TalloCPA Invoice Bot",
  "",
  "Send a photo or PDF of a supplier's invoice / official receipt and I'll read:",
  "Date · Supplier · TIN · Branch · Amount (VAT incl.) · VAT · Net of VAT.",
  "",
  "Commands:",
  "/bind <client name or TIN> — link this chat to a client so drafts are saved",
  "/whoami — show which client this chat is linked to",
  "/help — show this message",
].join("\n");

const SUPPORTED_MIME = /^(image\/|application\/pdf)/;

/** Route one Telegram update. Never throws — errors are reported to the chat. */
export async function handleUpdate(
  deps: BotDeps,
  update: TelegramUpdate,
): Promise<void> {
  const msg = update.message;
  if (!msg) return;
  try {
    const text = (msg.text ?? "").trim();
    if (text.startsWith("/")) {
      await handleCommand(deps, msg, text);
      return;
    }
    const file = pickFile(msg);
    if (file) {
      await handleInvoice(deps, msg, update.update_id, file);
      return;
    }
    await deps.telegram.sendMessage(
      msg.chat.id,
      "Send a photo or PDF of a supplier invoice. /help for details.",
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await deps.telegram
      .sendMessage(msg.chat.id, `⚠️ Something went wrong: ${detail}`)
      .catch(() => undefined);
  }
}

interface PickedFile {
  fileId: string;
  mimeHint?: string;
}

/** Choose the file to read: the largest photo, or a supported document. */
function pickFile(msg: TelegramMessage): PickedFile | null {
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1]!;
    return { fileId: largest.file_id };
  }
  if (msg.document && SUPPORTED_MIME.test(msg.document.mime_type ?? "")) {
    return { fileId: msg.document.file_id, mimeHint: msg.document.mime_type };
  }
  return null;
}

async function handleCommand(
  deps: BotDeps,
  msg: TelegramMessage,
  text: string,
): Promise<void> {
  const [command, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();
  switch (command) {
    case "/start":
    case "/help":
      await deps.telegram.sendMessage(msg.chat.id, HELP);
      return;
    case "/bind":
      await handleBind(deps, msg, arg);
      return;
    case "/whoami":
      await handleWhoami(deps, msg);
      return;
    default:
      await deps.telegram.sendMessage(msg.chat.id, `Unknown command. ${HELP}`);
  }
}

async function handleBind(
  deps: BotDeps,
  msg: TelegramMessage,
  arg: string,
): Promise<void> {
  if (!deps.supabase) {
    await deps.telegram.sendMessage(
      msg.chat.id,
      "Saving is disabled (no database configured). Running in reply-only mode.",
    );
    return;
  }
  if (arg === "") {
    await deps.telegram.sendMessage(msg.chat.id, "Usage: /bind <client name or TIN>");
    return;
  }
  const client = await findClient(deps.supabase, arg);
  if (!client) {
    await deps.telegram.sendMessage(
      msg.chat.id,
      `No single client matched "${arg}". Try the exact registered name or full TIN.`,
    );
    return;
  }
  await bindChatToClient(deps.supabase, {
    chatId: String(msg.chat.id),
    clientId: client.id,
  });
  await deps.telegram.sendMessage(
    msg.chat.id,
    `✅ This chat is now linked to ${client.name}. Invoices will be saved for review.`,
  );
}

async function handleWhoami(deps: BotDeps, msg: TelegramMessage): Promise<void> {
  if (!deps.supabase) {
    await deps.telegram.sendMessage(msg.chat.id, "Reply-only mode (no database).");
    return;
  }
  const clientId = await resolveClientForChat(deps.supabase, String(msg.chat.id));
  await deps.telegram.sendMessage(
    msg.chat.id,
    clientId
      ? `This chat is linked to client ${clientId}.`
      : "This chat isn't linked to a client yet. Use /bind <client name or TIN>.",
  );
}

async function handleInvoice(
  deps: BotDeps,
  msg: TelegramMessage,
  updateId: number,
  file: PickedFile,
): Promise<void> {
  const chatId = msg.chat.id;
  await deps.telegram.sendMessage(chatId, "📄 Reading invoice…");

  const { bytes, mimeType } = await deps.telegram.downloadFile(
    file.fileId,
    file.mimeHint,
  );
  const raw = await deps.gemini.extractInvoice(bytes, mimeType);
  const result = mapExtraction(raw);

  const header =
    result.status === "unreadable"
      ? "⚠️ Couldn't read this clearly — please check:\n\n"
      : "🧾 Extracted invoice:\n\n";
  let reply = header + formatInvoiceSummary(result);

  if (deps.supabase) {
    reply += "\n\n" + (await persist(deps, msg, updateId, bytes, mimeType, result));
  }
  await deps.telegram.sendMessage(chatId, reply);
}

/** Persist the draft and return a one-line status for the reply. */
async function persist(
  deps: BotDeps,
  msg: TelegramMessage,
  updateId: number,
  bytes: Buffer,
  mimeType: string,
  result: ReturnType<typeof mapExtraction>,
): Promise<string> {
  const supabase = deps.supabase!;
  const storagePath = await uploadReceipt(supabase, {
    bucket: deps.config.receiptsBucket,
    chatId: msg.chat.id,
    updateId,
    bytes,
    mimeType,
  });
  const outcome = await ingestPhotoInvoice(supabase, {
    chatId: String(msg.chat.id),
    telegramUpdateId: String(updateId),
    result,
    storagePath,
    mimeType,
  });
  switch (outcome.status) {
    case "saved":
      return "💾 Saved for review.";
    case "duplicate":
      return "↩️ Already recorded (duplicate).";
    case "unbound":
      return "ℹ️ Not saved — link this chat first with /bind <client name or TIN>.";
  }
}
