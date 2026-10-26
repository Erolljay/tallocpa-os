/**
 * A minimal Telegram Bot API client over native fetch — just the surface this
 * bot needs: long-poll for updates, resolve + download a file, send a reply.
 * No third-party SDK, so the bot stays dependency-light and easy to audit.
 */

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface DownloadedFile {
  bytes: Buffer;
  mimeType: string;
}

const API_BASE = "https://api.telegram.org";

export class TelegramClient {
  constructor(private readonly token: string) {}

  private apiUrl(method: string): string {
    return `${API_BASE}/bot${this.token}/${method}`;
  }

  private async call<T>(method: string, body: unknown): Promise<T> {
    const res = await fetch(this.apiUrl(method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) {
      throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
    }
    return json.result as T;
  }

  /** Long-poll for new updates starting at `offset`. */
  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message"],
    });
  }

  /** Resolve a file_id to a downloadable relative path. */
  private async getFilePath(fileId: string): Promise<string> {
    const file = await this.call<{ file_path?: string }>("getFile", {
      file_id: fileId,
    });
    if (!file.file_path) throw new Error(`No file_path for file_id ${fileId}`);
    return file.file_path;
  }

  /** Download a file by file_id, returning its bytes and best-known MIME type. */
  async downloadFile(fileId: string, mimeHint?: string): Promise<DownloadedFile> {
    const path = await this.getFilePath(fileId);
    const res = await fetch(`${API_BASE}/file/bot${this.token}/${path}`);
    if (!res.ok) {
      throw new Error(`File download failed: ${res.status} ${res.statusText}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const mimeType =
      mimeHint ?? res.headers.get("content-type") ?? guessMime(path);
    return { bytes, mimeType };
  }

  /** Send a plain-text reply to a chat. */
  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.call<TelegramMessage>("sendMessage", { chat_id: chatId, text });
  }
}

/** Guess a MIME type from a file path extension (fallback for downloads). */
function guessMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
