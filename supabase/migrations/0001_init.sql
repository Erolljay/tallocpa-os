-- TalloCPA OS — initial schema for the intake wedge.
-- Forward-compatible with the full data model: only the intake tables are used
-- today, but the shapes carry the fields the routing spine and Manager.io
-- export will need, so no migration is required later.
--
-- Money is stored as BIGINT centavos (1 peso = 100 centavos) to keep accounting
-- math exact. RLS is enabled on every table from day one; firm staff (rows in
-- app_user) may read/write firm data. Client-facing access (the read-only PWA)
-- gets its own narrower policies in a later migration.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type intake_source as enum ('photo', 'template', 'manual');
create type doc_type      as enum ('official_receipt', 'sales_invoice', 'unknown');
create type vat_class     as enum ('vatable', 'vat_exempt', 'zero_rated');
create type review_status as enum (
  'received', 'extract_failed', 'unreadable',
  'needs_review', 'approved', 'rejected', 'exported'
);
create type staff_role    as enum ('owner', 'manager', 'reviewer', 'staff');

-- ---------------------------------------------------------------------------
-- Staff registry + access helper (RLS foundation)
-- ---------------------------------------------------------------------------
create table app_user (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  role       staff_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER so the policy check can read app_user without recursing
-- through app_user's own RLS.
create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_user where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  tin        text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Telegram bindings (chat -> client). chat_id unique so one chat maps to one client.
-- ---------------------------------------------------------------------------
create table telegram_bindings (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  chat_id    text not null unique,
  bound_at   timestamptz,
  active     boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Intake inbox — the queue the webhook writes and the worker drains.
-- telegram_update_id is unique to make Telegram retries idempotent.
-- ---------------------------------------------------------------------------
create table intake_inbox (
  id                  uuid primary key default gen_random_uuid(),
  source              intake_source not null,
  client_id           uuid references clients (id) on delete set null,
  telegram_update_id  text unique,
  storage_path        text,
  processed_at        timestamptz,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Template batches (one submitted Excel/CSV file).
-- ---------------------------------------------------------------------------
create table intake_batches (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  source     intake_source not null default 'template',
  file_name  text,
  row_count  integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Intake items — the reviewable transaction drafts (both lanes converge here).
-- ---------------------------------------------------------------------------
create table intake_items (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients (id) on delete cascade,
  batch_id      uuid references intake_batches (id) on delete set null,
  source        intake_source not null,
  period        text,                              -- e.g. '2026-07'
  review_status review_status not null default 'needs_review',

  txn_date      date,
  supplier_name text,
  gross         bigint,                            -- centavos
  vat           bigint,                            -- centavos
  vat_class     vat_class not null default 'vatable',
  tin           text,
  or_number     text,
  doc_type      doc_type not null default 'unknown',
  category      text,
  account_code  text,

  confidence    real,                              -- 0..1
  bir_valid     boolean,
  review_notes  text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint gross_non_negative check (gross is null or gross >= 0),
  constraint vat_non_negative   check (vat   is null or vat   >= 0),
  constraint confidence_range   check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create trigger intake_items_set_updated_at
  before update on intake_items
  for each row execute function set_updated_at();

-- The review queue and future dashboard both filter on (client, period, status).
create index intake_items_client_period_status_idx
  on intake_items (client_id, period, review_status);

-- ---------------------------------------------------------------------------
-- Documents (stored receipt images / template files).
-- ---------------------------------------------------------------------------
create table documents (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients (id) on delete cascade,
  intake_item_id uuid references intake_items (id) on delete set null,
  storage_path   text not null,
  mime_type      text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — enable everywhere, staff-only access for the wedge.
-- ---------------------------------------------------------------------------
alter table app_user          enable row level security;
alter table clients           enable row level security;
alter table telegram_bindings enable row level security;
alter table intake_inbox      enable row level security;
alter table intake_batches    enable row level security;
alter table intake_items      enable row level security;
alter table documents         enable row level security;

-- A user can always see their own app_user row (needed for is_staff bootstrap).
create policy app_user_self_read on app_user
  for select using (id = auth.uid());

-- Staff have full access to firm data. (Client-facing read policies arrive with
-- the PWA phase; the Telegram lane writes via a service-role key, bypassing RLS.)
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'telegram_bindings', 'intake_inbox',
    'intake_batches', 'intake_items', 'documents'
  ]
  loop
    execute format(
      'create policy %I_staff_all on %I for all using (is_staff()) with check (is_staff());',
      t, t
    );
  end loop;
end $$;
