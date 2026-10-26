import { createServiceClient } from "@tallocpa/db";
import { handleUpdate, type BotDeps } from "./bot.js";
import { loadConfig } from "./config.js";
import { GeminiClient } from "@tallocpa/photo-parser";
import { TelegramClient } from "./telegram.js";

/**
 * Entry point: build the dependencies, then long-poll Telegram forever,
 * dispatching each update to the handler. Updates are processed sequentially so
 * a single-file bot never runs two Gemini calls over the same chat at once; the
 * offset is advanced past every update so none is re-delivered.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const telegram = new TelegramClient(config.telegramToken);
  const gemini = new GeminiClient(config.geminiApiKey, config.geminiModel);
  const supabase = config.persistenceEnabled ? createServiceClient() : null;

  const deps: BotDeps = { config, telegram, gemini, supabase };

  console.log(
    `[bot] started · model=${config.geminiModel} · persistence=${
      config.persistenceEnabled ? "on" : "off (reply-only)"
    }`,
  );

  let offset = 0;
  let running = true;
  process.on("SIGINT", () => {
    console.log("\n[bot] shutting down…");
    running = false;
  });

  while (running) {
    let updates;
    try {
      updates = await telegram.getUpdates(offset, config.pollTimeoutSeconds);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[bot] getUpdates error: ${detail} — retrying in 3s`);
      await sleep(3000);
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      await handleUpdate(deps, update);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[bot] fatal:", err);
  process.exit(1);
});
