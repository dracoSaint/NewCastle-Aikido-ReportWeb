-- Monday Board > ALL MEMBERS: every Zen Planner membership (current, not started, hold, cancelled,
-- cancel pending and completed), from Zen Planner's membership grid. The nightly Zen Planner job
-- (automation/zenplanner-followup.mjs) refreshes it: it upserts every row it exported, then removes rows
-- the export no longer has. One row per membership (Zen Planner's membership number), not per person.
--
-- Holds member names, so signed-in staff only, behind the Monday Board switches (monday.view to read,
-- monday.edit to change; the Bot role has both). Run after access_control.sql. Safe to re-run.
-- Rollback: drop table public.membership_all;

create table if not exists public.membership_all (
  number text primary key,            -- Zen Planner membership number (one per membership)
  first_name text,
  last_name text,
  membership_label text,              -- blank on older memberships whose template was removed
  mbr_status text,                    -- CURRENT | NOT STARTED | HOLD | CANCELED | CANCEL PENDING | COMPLETED
  mbr_begin_date date,
  mbr_end_date date,
  autopay text,                       -- ON | OFF | ERROR
  synced_at timestamptz not null default now()
);

create index if not exists membership_all_status_idx on public.membership_all (mbr_status);
create index if not exists membership_all_label_idx on public.membership_all (membership_label);
create index if not exists membership_all_begin_idx on public.membership_all (mbr_begin_date desc);

revoke all on table public.membership_all from anon;
alter table public.membership_all enable row level security;
grant select, insert, update, delete on table public.membership_all to authenticated;

drop policy if exists "Signed-in staff" on public.membership_all;
create policy "Signed-in staff" on public.membership_all for all to authenticated using (true) with check (true);
drop policy if exists "Role can view" on public.membership_all;
create policy "Role can view" on public.membership_all as restrictive for select to authenticated using ((select public.has_permission('monday.view')));
drop policy if exists "Role can add" on public.membership_all;
create policy "Role can add" on public.membership_all as restrictive for insert to authenticated with check ((select public.has_permission('monday.edit')));
drop policy if exists "Role can change" on public.membership_all;
create policy "Role can change" on public.membership_all as restrictive for update to authenticated using ((select public.has_permission('monday.edit'))) with check ((select public.has_permission('monday.edit')));
drop policy if exists "Role can remove" on public.membership_all;
create policy "Role can remove" on public.membership_all as restrictive for delete to authenticated using ((select public.has_permission('monday.edit')));
