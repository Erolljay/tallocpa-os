/**
 * Environment-driven configuration for the invoice bot. Read once at startup so
 * a missing credential fails loudly and immediately, never mid-conversation.
 */
export interface BotConfig {
  telegramToken: string;
  geminiApiKey: string;
  geminiModel: string;
  /** When false, the bot runs reply-only (no Supabase creds present). */
  persistenceEnabled: boolean;
  receiptsBucket: string;
  /** getUpdates long-poll timeout, seconds. */
  pollTimeoutSeconds: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. See apps/telegram-invoice-bot/README.md.`,
    );
  }
  return v;
}

/** Build the runtime config from the environment, validating required keys. */
export function loadConfig(): BotConfig {
  const telegramToken = required("TELEGRAM_BOT_TOKEN");
  const geminiApiKey = required("GEMINI_API_KEY");

  const hasSupabase =
    !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    telegramToken,
    geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
    persistenceEnabled: hasSupabase,
    receiptsBucket: process.env.SUPABASE_RECEIPTS_BUCKET?.trim() || "receipts",
    pollTimeoutSeconds: 50,
  };
}
