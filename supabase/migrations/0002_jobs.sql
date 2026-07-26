-- Routes & Jobs engine — persistence for the spine.
-- Route templates live in code (packages/routes); this stores live jobs and
-- their materialized steps. RLS: staff-only, reusing is_staff() from 0001.

create type service_type as enum (
  'tax_compliance', 'bookkeeping', 'audit',
  'agreed_upon_procedures', 'business_processing', 'systems_implementation'
);
create type service_archetype as enum ('recurring', 'project', 'assurance');
create type job_role   as enum ('preparer', 'reviewer', 'manager', 'partner', 'eqr', 'client');
create type step_status as enum ('pending', 'active', 'done', 'skipped', 'blocked');
create type job_status  as enum ('not_started', 'in_progress', 'in_review', 'blocked', 'done');

-- ---------------------------------------------------------------------------
-- Jobs — a live instance of a service route for a client (+ period if recurring).
-- ---------------------------------------------------------------------------
create table jobs (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients (id) on delete cascade,
  service_type     service_type not null,
  archetype        service_archetype not null,
  template_version integer not null default 1,
  period           text,                       -- e.g. '2026-07' for recurring
  status           job_status not null default 'not_started',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- The command center + jobs board filter on client + status.
create index jobs_client_status_idx on jobs (client_id, status);
create index jobs_period_idx on jobs (period);

-- ---------------------------------------------------------------------------
-- Job steps — the materialized route steps for a job.
-- ---------------------------------------------------------------------------
create table job_steps (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references jobs (id) on delete cascade,
  step_key       text not null,
  name           text not null,
  step_order     integer not null,
  owner_role     job_role not null,
  owner_user_id  uuid references app_user (id) on delete set null,
  is_review_gate boolean not null default false,
  status         step_status not null default 'pending',
  due_at         timestamptz,
  completed_at   timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),

  unique (job_id, step_key)
);

create index job_steps_job_order_idx on job_steps (job_id, step_order);
-- "what's on my plate" — active/blocked steps by owner.
create index job_steps_owner_status_idx on job_steps (owner_user_id, status);

-- ---------------------------------------------------------------------------
-- RLS — staff-only (client-facing read policies arrive with the PWA phase).
-- ---------------------------------------------------------------------------
alter table jobs      enable row level security;
alter table job_steps enable row level security;

create policy jobs_staff_all on jobs
  for all using (is_staff()) with check (is_staff());
create policy job_steps_staff_all on job_steps
  for all using (is_staff()) with check (is_staff());
