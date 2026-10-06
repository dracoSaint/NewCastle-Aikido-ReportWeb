-- Lock member data to signed-in staff.
--
-- Before this, membership_data and membership_data_log answered requests made
-- with the public anon key (the key shipped in js/config.js), so anyone could
-- read member names, memberships and dates. The portal now reads these tables
-- through the signed-in session, so the anon role needs no access at all.
--
-- Safe to re-run. Run in the Supabase SQL editor.

-- 1. The public (anon) role gets nothing on member tables.
revoke all on table public.membership_data from anon;
revoke all on table public.membership_data_previous from anon;
revoke all on table public.membership_data_log from anon;

-- 2. Row level security on, so only the policies below apply.
alter table public.membership_data enable row level security;
alter table public.membership_data_previous enable row level security;
alter table public.membership_data_log enable row level security;

-- 3. Signed-in staff can read and maintain the lists (the CSV upload deletes,
--    inserts and archives rows across all three tables).
do $$
declare
  t text;
begin
  foreach t in array array['membership_data', 'membership_data_previous', 'membership_data_log'] loop
    execute format('drop policy if exists "Staff manage %1$s" on public.%1$I', t);
    execute format(
      'create policy "Staff manage %1$s" on public.%1$I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end
$$;

grant select, insert, update, delete on table public.membership_data to authenticated;
grant select, insert, update, delete on table public.membership_data_previous to authenticated;
grant select, insert, update, delete on table public.membership_data_log to authenticated;

-- Check afterwards: this should return 0 rows / a permission error when run
-- with the anon key, and the Current Member List tab should still load.
