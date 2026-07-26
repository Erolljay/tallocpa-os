-- SOP library — versioned procedures attached to route steps (PSQM 1 component 6).
-- Route templates live in code; SOP *content* is editable by the firm and lives
-- here, versioned, with an append-only revision history for SOQM evidence.
-- RLS: staff-only, reusing is_staff() from 0001. service_type enum from 0002.

create table sops (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,            -- '${service_type}.${step_key}'
  service_type service_type not null,
  step_key     text not null,
  title        text not null,
  purpose      text not null default '',
  procedure    jsonb not null default '[]'::jsonb,   -- ordered how-to steps
  checklist    jsonb not null default '[]'::jsonb,   -- done-when items
  version      integer not null default 1,
  status       text not null default 'active',       -- draft | active | retired
  updated_at   timestamptz not null default now(),
  updated_by   uuid references app_user (id) on delete set null
);

create index sops_service_step_idx on sops (service_type, step_key);

create trigger sops_set_updated_at
  before update on sops
  for each row execute function set_updated_at();

-- Append-only history: every version of an SOP, for quality-management evidence.
create table sop_revisions (
  id         uuid primary key default gen_random_uuid(),
  sop_key    text not null,
  version    integer not null,
  snapshot   jsonb not null,                     -- full SOP content at that version
  created_at timestamptz not null default now(),
  created_by uuid references app_user (id) on delete set null,
  unique (sop_key, version)
);

alter table sops          enable row level security;
alter table sop_revisions enable row level security;

create policy sops_staff_all on sops
  for all using (is_staff()) with check (is_staff());
create policy sop_revisions_staff_all on sop_revisions
  for all using (is_staff()) with check (is_staff());
