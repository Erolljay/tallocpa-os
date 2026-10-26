-- TalloCPA OS — align intake with the workflow spec (CLAUDE.md steps 1–5).
-- Status names: needs_review = spec "in_review", approved = spec "cleared".

alter type review_status add value if not exists 'uploaded';
alter type review_status add value if not exists 'flagged';
alter type review_status add value if not exists 'held';
alter type review_status add value if not exists 'posted';

create type tax_validity as enum ('valid_vat_and_it', 'valid_it_only', 'not_valid');

alter table intake_items
  add column tax_validity     tax_validity,
  -- Printed amounts, centavos. gross = vatable + vat + vat_exempt + zero_rated.
  add column vatable          bigint check (vatable    is null or vatable    >= 0),
  add column vat_exempt       bigint check (vat_exempt is null or vat_exempt >= 0),
  add column zero_rated       bigint check (zero_rated is null or zero_rated >= 0),
  add column wht_amount       bigint check (wht_amount is null or wht_amount >= 0),
  add column atc              text,
  -- Holds: the client defers an item to a later month of the SAME taxable year.
  add column hold_period      text check (hold_period ~ '^\d{4}-\d{2}$'),
  add column hold_reason      text,
  add column hold_approved_by uuid references auth.users (id) on delete set null,
  add column hold_approved_at timestamptz,
  -- Staff note shown to the client; review_notes stays internal flags.
  add column client_note      text,
  add column approval_source  text check (approval_source in ('staff', 'rule')),
  add column drive_file_id    text,
  -- Hard rule 2: a hold never crosses the taxable year (calendar year for now).
  add constraint hold_within_taxable_year check (
    hold_period is null
    or (txn_date is not null and left(hold_period, 4)::int = extract(year from txn_date)::int)
  );

-- Duplicate invoice number per counterparty (per client).
create index intake_items_dup_idx on intake_items (client_id, tin, or_number);

-- The books (CLAUDE.md step 5): posted items by period. Step 6 tax computation
-- reads from here. security_invoker keeps the caller's RLS in force.
create view client_books with (security_invoker = true) as
select
  id, client_id, ledger, period,
  left(period, 4) || '-Q' || ceil(substring(period, 6, 2)::int / 3.0)::int as quarter,
  txn_date, supplier_name, tin, counterparty_address, or_number, doc_type, tax_validity,
  gross, vatable, vat_exempt, zero_rated, vat, wht_amount, atc,
  approval_source, approved_by, approved_at
from intake_items
where review_status = 'posted';
