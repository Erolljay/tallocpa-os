# Client Portal

Steps 1–5 of the workflow in [CLAUDE.md](../../CLAUDE.md): clients upload source
documents, **n8n orchestrates** reading them, clean ones are auto-cleared by an
n8n rule, staff review the rest, and cleared items are **posted to the books in
Supabase** (view `client_books`).

```
client /upload ──▶ Storage client-uploads/<client_id>/…  + item "uploaded"
      └─ event document.uploaded ──▶ n8n intake router
            ├─ POST /api/n8n/parse ──▶ Gemini → mapExtraction → flags → duplicate check
            │                          → item "needs_review" | "flagged"
            ├─ (Drive copy /{Client}/{Year}/Intake/)
            └─ auto-clear rule ──▶ POST /api/n8n/items/{id} {action:"clear"}
                                   (portal re-checks canAutoClear on the stored row)
staff /review ── edit · Clear & post · Return · Approve hold (practice lead)
clear ──▶ period = hold month, else document month ──▶ "posted" ──event item.posted──▶ n8n
n8n monthly (1st, 6 AM) ──▶ POST /api/n8n/holds: release due holds, aging alert
```

Status names follow the spec, except `needs_review` = *in_review* and
`approved` = *cleared* (a transient step before *posted*).

## What gets checked (no AI computes tax)

| | |
|---|---|
| **Category** | `sales` · `purchases` · `expenses` (or `other`). A document issued under the client's own TIN is always `sales`. |
| **Amounts** | The **printed** total, VATable, VAT-exempt, zero-rated, VAT, withholding and ATC are stored as-is. Code checks that VAT = 12% of VATable and that the lines add up to the total (₱1 tolerance). The split is derived only for a VAT-registered seller who printed just a total, and that's noted. |
| **Flags** | Invalid TIN format · VAT doesn't compute · lines don't add up · missing required fields · withholding without ATC · not a BIR invoice/OR · duplicate invoice no. per counterparty. Any flag puts the item in **flagged**. |
| **Tax validity** | `valid_vat_and_it` (VAT-registered issuer, complete invoice, VAT computes) · `valid_it_only` · `not_valid` (not a BIR invoice/OR, or no valid issuer TIN/name). |
| **Recommendation** | `approve` = no flags, ≥ 85% confident, a real category. `reject` = unreadable or `not_valid`. Otherwise `review`. n8n's rule uses it; staff decide the rest. |

**Holds** (hard rules 2–3): a client can push an item in review to a later month
of the same year. Purchases and expenses are held at once. Sales wait for a
practice lead (owner/manager) to approve with a logged reason. The monthly run
releases a hold once its month arrives, and emails about held purchases older
than 30 days.

**Notes**: `review_notes` holds the internal flags. `client_note` is what staff
write for the client, including the reason when an item is returned.

## Setup

1. Apply `supabase/migrations/0005_portal.sql` and `0006_workflow_alignment.sql`.
2. Fill the repo-root `.env` (see `.env.example`).
3. Supabase → Authentication → URL Configuration: set the Site URL to the portal
   and add `<PORTAL_URL>/auth/callback`.
4. Staff: a row in `app_user` per staff user. `role` owner/manager = practice lead.
5. Clients: `npm run invite-client -- owner@client.ph <client-id>`. Login is
   invite-only.
6. n8n: see [infra/n8n/README.md](../../infra/n8n/README.md).

## Run

```bash
npm run dev --workspace @tallocpa/portal
```

Staff land on `/review`, clients on `/upload`. If n8n is down, uploads wait as
"uploaded". After 10 minutes `/review` shows them under **Not read yet** with
**Parse now**. Next runs in webpack mode because the workspace packages use
`./x.js` imports for `.ts` files.

## n8n endpoints (header `x-tallocpa-secret`)

| Endpoint | Body | Result |
|---|---|---|
| `POST /api/n8n/parse` | `{ id }` | the `item.parsed` payload (status, flags, validity, recommendation, signed file URL) |
| `POST /api/n8n/items/{id}` | `{ action: "clear" }` | 200 cleared + posted, or 409 if `canAutoClear` says no |
| `POST /api/n8n/items/{id}` | `{ action: "drive", fileId }` | stores the Drive copy's id |
| `POST /api/n8n/holds` | `{ period: "YYYY-MM" }` | `{ released: [ids], aging: [rows] }` |

Events the portal sends (one webhook, `event` field): `document.uploaded` and
`item.posted`. Payloads carry each amount as `{ centavos, pesos }`; do math on
the centavos. The shape is `N8nPayload` in
[packages/db/src/n8n.ts](../../packages/db/src/n8n.ts).
