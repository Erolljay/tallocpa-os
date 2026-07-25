# Setup: Supabase + first real ingest

This wires the template lane to a real database. ~10 minutes. You do the account
steps (they need your login and keys); Claude built everything else.

> **Never paste the service_role key into chat.** It goes only in your local
> `.env`, which is gitignored. It bypasses all security — treat it like a password.

## 1. Create the project

1. Go to <https://supabase.com> and sign in.
2. **New project.**
   - Name: `tallocpa-os`
   - Database password: click **Generate**, then save it in your password manager.
   - **Region: Southeast Asia (Singapore)** — closest to the Philippines.
3. Create it and wait ~2 minutes for provisioning.

## 2. Apply the schema

1. Left sidebar → **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_init.sql` in this repo, copy the whole file,
   paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned."

## 3. Add your keys to `.env`

1. Project → **Settings** → **API**.
2. Copy **Project URL** and the **`service_role`** secret.
3. In the repo root:
   ```bash
   cp .env.example .env
   ```
4. Open `.env` and paste the two values:
   ```
   SUPABASE_URL=https://your-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...   (the service_role secret)
   ```

## 4. Create a test client

In the SQL Editor, run:

```sql
insert into clients (name, tin)
values ('Test Client', '123-456-789-000')
returning id;
```

Copy the `id` it returns (a UUID).

## 5. Ingest the sample template

```bash
npm run ingest -- docs/templates/intake-template.csv <paste-the-client-id>
```

Expected output:

```
✓ Ingested template
  batch:    <uuid>
  inserted: 2 item(s) (all as needs_review)
  summary:  ok=2 needsFix=0 duplicates=0
```

## 6. Verify it landed

SQL Editor:

```sql
select supplier_name, gross, vat, review_status, review_notes
from intake_items
order by created_at desc;
```

You should see Mercury Drug (11200 / 1200) and Meralco (560000 / 60000), both
`needs_review`. That is a client's file, decoded, validated, and saved for review
— the template lane, working end to end.

## Troubleshooting

- **"SUPABASE_URL ... must be set"** — `.env` missing or empty; recheck step 3.
- **"relation intake_items does not exist"** — schema not applied; redo step 2.
- **auth / permission errors** — make sure you used the `service_role` key, not
  the `anon` key.
