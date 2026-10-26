# Telegram Invoice Bot

Parses supplier invoices sent to a Telegram bot using **Gemini vision**, replies
in-chat with the seven BIR fields, and saves each one as a reviewable draft in
the intake pipeline (`intake_items`, status `needs_review`).

Extracted fields:

| Field | Source on the invoice |
|-------|-----------------------|
| Date | Invoice / transaction date |
| Supplier's name | Registered supplier name |
| TIN | Supplier TIN (branch digits preserved) |
| Branch | Branch code (from the TIN, or a printed branch code) |
| Amount (VAT inclusive) | Printed grand total |
| VAT | 12% component — **derived** from the gross, printed VAT reconciled against it |
| Net of VAT | Gross − VAT, so `net + vat === gross` exactly |

The VAT split is always computed by the shared PH VAT math in
[`@tallocpa/validation`](../../packages/validation) and
[`@tallocpa/photo-parser`](../../packages/photo-parser) — the model's arithmetic
is never trusted; a printed VAT that doesn't reconcile is flagged for review.

## Architecture

Mirrors the template lane: a **pure package** does the deterministic work, the
**app** does I/O.

```
Telegram photo/PDF
   │  (long-poll getUpdates)
   ▼
telegram.ts ──download──▶ gemini.ts ──raw fields──▶ @tallocpa/photo-parser
   │                                                    │ (VAT math, TIN, branch,
   │                                                    │  reconciliation)
   ▼                                                    ▼
reply in chat  ◀────────── format ───────────────  InvoiceParseResult
   │
   └── persist ──▶ intake_inbox (dedup) + intake_items (needs_review) + documents
```

## Setup

1. **Create a bot**: message [@BotFather](https://t.me/BotFather), `/newbot`, copy
   the token.
2. **Get a Gemini key**: <https://aistudio.google.com/apikey>.
3. **Fill `.env`** at the repo root (see `.env.example`):
   ```
   TELEGRAM_BOT_TOKEN=...
   GEMINI_API_KEY=...
   SUPABASE_URL=...              # already set for the intake wedge
   SUPABASE_SERVICE_ROLE_KEY=... # already set
   ```
4. **Run migrations** (once): apply `supabase/migrations/0004_receipts_bucket.sql`
   so receipt images have somewhere to go. Persistence still works without it —
   image upload just gets skipped.

## Run

```bash
npm start --workspace @tallocpa/telegram-invoice-bot
```

The bot long-polls, so it works from your machine with **no public URL**. Leave
it running; `Ctrl+C` stops it cleanly.

Without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` it runs **reply-only** (parse
and reply, no database writes).

## Using it

1. Open a chat with your bot, send `/start`.
2. Link the chat to a client so drafts are saved:
   ```
   /bind ACME Trading Corp
   ```
   (exact registered name or full TIN — must match one client)
3. Send a **photo or PDF** of a supplier invoice. The bot replies with the seven
   fields and `💾 Saved for review.`
4. `/whoami` shows the current link.

An unlinked chat still gets the parsed reply — it just isn't saved (the bot tells
you to `/bind`). Telegram retries are idempotent via `telegram_update_id`.

## Notes

- Reply-only vs. saved is decided by whether Supabase creds are present.
- The bot processes updates sequentially — simple and safe for a single-file
  workflow. For higher volume, move to the webhook + worker design the schema
  already supports (`intake_inbox` is the queue).
