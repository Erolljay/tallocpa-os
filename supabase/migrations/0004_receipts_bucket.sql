-- TalloCPA OS — storage bucket for receipt images from the Telegram photo lane.
-- Private bucket; the bot writes via the service-role key (bypasses RLS), and
-- firm staff may read the stored receipts from the app.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Staff-only access to objects in the receipts bucket. is_staff() is defined in
-- 0001_init.sql. The service-role key used by the bot bypasses these policies.
create policy receipts_staff_all on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and is_staff())
  with check (bucket_id = 'receipts' and is_staff());
