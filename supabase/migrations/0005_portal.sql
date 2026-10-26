-- TalloCPA OS — customer portal lane.
-- Clients upload source documents from the web portal; AI classifies and
-- extracts them; staff approve; approved items are pushed to n8n.
--
-- Clients get a narrow, read-only view of their own items. Every write (intake
-- rows, approvals) goes through server code holding the service-role key, so
-- clients never insert or update rows directly — only upload files to their own
-- storage folder.

alter type intake_source add value if not exists 'portal';

create type ledger as enum ('sales', 'purchases', 'payroll', 'expenses', 'other');

alter table intake_items
  add column ledger               ledger,
  add column counterparty_address text,
  add column ai_recommendation    text
    check (ai_recommendation in ('approve', 'review', 'reject')),
  add column approved_by          uuid references auth.users (id) on delete set null,
  add column approved_at          timestamptz,
  add column n8n_sent_at          timestamptz;

-- ---------------------------------------------------------------------------
-- Client portal users (auth user -> one client).
-- ---------------------------------------------------------------------------
create table client_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  client_id  uuid not null references clients (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table client_users enable row level security;

create policy client_users_self_read on client_users
  for select using (user_id = auth.uid());
create policy client_users_staff_all on client_users
  for all using (is_staff()) with check (is_staff());

-- SECURITY DEFINER for the same reason as is_staff(): policies on other tables
-- must read client_users without recursing through its RLS.
create or replace function my_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from client_users where user_id = auth.uid();
$$;

-- Clients read their own uploads and their status; nothing else.
create policy intake_items_client_read on intake_items
  for select using (client_id = my_client_id());
create policy documents_client_read on documents
  for select using (client_id = my_client_id());
create policy clients_client_read on clients
  for select using (id = my_client_id());

-- ---------------------------------------------------------------------------
-- Storage: private bucket; each client uploads only under "<client_id>/...".
-- ---------------------------------------------------------------------------
-- 15 MB keeps every file under Gemini's 20 MB inline request limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-uploads', 'client-uploads', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;

create policy client_uploads_client_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'client-uploads'
    and (storage.foldername(name))[1] = my_client_id()::text
  );

create policy client_uploads_staff_all on storage.objects
  for all to authenticated
  using (bucket_id = 'client-uploads' and is_staff())
  with check (bucket_id = 'client-uploads' and is_staff());
