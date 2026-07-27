# Reference — database schema

Supabase Postgres. Money is stored as **BIGINT centavos**. Every table has Row-Level
Security (RLS) enabled; firm staff (rows in `app_user`) get access via `is_staff()`.
Server-side workers use the service-role key, which bypasses RLS. Migrations live in
`supabase/migrations/` and are applied in order.

See [how-to/develop.md](../how-to/develop.md) for applying migrations, and
[explanation/architecture.md](../explanation/architecture.md) for the RLS rationale.

## Migrations

| File | Adds |
|------|------|
| `0001_init.sql` | staff + clients + intake tables, `is_staff()`, `set_updated_at()` |
| `0002_jobs.sql` | `jobs` + `job_steps` (the routing spine persistence) |
| `0003_sops.sql` | `sops` + `sop_revisions` (SOP library, versioned) |

## Helpers

- `is_staff() → boolean` — `security definer`; true when `auth.uid()` has an `app_user`
  row. Used by every staff RLS policy.
- `set_updated_at()` — trigger that stamps `updated_at = now()` on update.

## Enums

- `0001`: `intake_source`, `doc_type`, `vat_class`, `review_status`, `staff_role`
- `0002`: `service_type` (6 services), `service_archetype`
  (`recurring|project|assurance`), `job_role`, `step_status`, `job_status`

## Tables

### app_user
Staff registry linking `auth.users` to a `staff_role`. The basis for `is_staff()`.
A user can always read their own row (`app_user_self_read`).

### clients
`id`, `name`, `tin`, `created_at`. The entity everything keys to.

### telegram_bindings
Binds a Telegram `chat_id` (unique) to a `client_id` — so the bot knows whose books a
photo hits. `active`, `bound_at`.

### intake_inbox
The queue the webhook writes and the worker drains. `source`, `client_id`,
`telegram_update_id` (unique — makes Telegram retries idempotent), `storage_path`,
`processed_at`.

### intake_batches
One submitted template file. `client_id`, `source`, `file_name`, `row_count`.

### intake_items
The reviewable transaction drafts — where both intake lanes converge. Key columns:
`client_id`, `batch_id`, `source`, `period` (e.g. `2026-07`), `review_status`,
`txn_date`, `supplier_name`, `gross` (centavos), `vat` (centavos), `vat_class`, `tin`,
`or_number`, `doc_type`, `category`, `account_code`, `confidence` (0..1),
`bir_valid`, `review_notes`. Check constraints keep `gross`/`vat` non-negative and
`confidence` in `[0,1]`. Indexed on `(client_id, period, review_status)`.

### documents
Stored receipt images / template files. `client_id`, `intake_item_id`, `storage_path`,
`mime_type`.

### jobs
A live instance of a service route for a client. `client_id`, `service_type`,
`archetype`, `template_version`, `period`, `status` (`job_status`). Indexed on
`(client_id, status)` and `period`.

### job_steps
The materialized route steps for a job. `job_id`, `step_key`, `name`, `step_order`,
`owner_role`, `owner_user_id`, `is_review_gate`, `status` (`step_status`), `due_at`,
`completed_at`, `notes`. Unique on `(job_id, step_key)`; indexed on `(job_id,
step_order)` and `(owner_user_id, status)` ("what's on my plate").

### sops
Versioned SOP content per route step. `key` (unique, `${service_type}.${step_key}`),
`service_type`, `step_key`, `title`, `purpose`, `procedure` (jsonb), `checklist`
(jsonb), `version`, `status` (`draft|active|retired`), `updated_by`.

### sop_revisions
Append-only history of every SOP version (`sop_key`, `version`, `snapshot`) — the
quality-management evidence trail. Unique on `(sop_key, version)`.
