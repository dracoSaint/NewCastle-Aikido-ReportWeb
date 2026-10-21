-- Grading report data (replaces the Grading Report Google Sheet).
--
-- grading_members: the nightly Zen Planner export (automation/zenplanner-grading.mjs), one row per
--   student per program (Regular Adult / Juniors): rank, attendance total and since the last test,
--   last test date. Replaced on every sync.
-- grading_ranks: required hours per rank and which testing-date group the rank tests in.
-- grading_test_dates: the next testing date of each group (3 groups; edited on the Grading page).
-- The page works out hours needed, eligibility, weeks left and weekly goals (js/gradingCore.js).
--
-- Reading needs "grading.view"; changing ranks and dates needs "grading.edit" (Settings > Roles).
-- Safe to re-run: rank hours and dates already set are never reset. Run in the Supabase SQL editor
-- (after access_control.sql).
-- Rollback: drop table public.grading_members, public.grading_ranks, public.grading_test_dates;
--   delete from public.bot_settings where job = 'grading';

create table if not exists public.grading_members (
  member_key text not null,
  program text not null check (program in ('adults', 'juniors')),
  first_name text,
  last_name text,
  age integer,
  program_name text,
  status text,
  rank text,
  att_total numeric,
  att_since_test numeric,
  rank_attendance_passed boolean,
  last_test_date date,
  synced_at timestamptz not null default now(),
  primary key (member_key, program)
);

create table if not exists public.grading_test_dates (
  test_group text primary key,
  label text not null,
  program text not null check (program in ('adults', 'juniors')),
  test_date date,
  updated_at timestamptz not null default now(),
  updated_by text default (auth.jwt() ->> 'email')
);

create table if not exists public.grading_ranks (
  program text not null check (program in ('adults', 'juniors')),
  rank text not null,
  sort_order integer not null,
  req_hours numeric check (req_hours >= 0), -- empty = no next grading (e.g. Yondan)
  test_group text not null references public.grading_test_dates(test_group),
  updated_at timestamptz not null default now(),
  updated_by text default (auth.jwt() ->> 'email'),
  primary key (program, rank)
);

-- Starting values from the sheet's RANK & REQUIRED HRS tab (only added if missing).
insert into public.grading_test_dates (test_group, label, program, test_date) values
  ('adults-1', 'Regular Adult: Unranked to 5th Kyu', 'adults', '2026-11-07'),
  ('adults-2', 'Regular Adult: 4th Kyu and up', 'adults', '2027-01-01'),
  ('juniors-1', 'Juniors', 'juniors', '2026-11-07')
on conflict (test_group) do nothing;

insert into public.grading_ranks (program, rank, sort_order, req_hours, test_group) values
  ('adults', 'Unranked', 1, 25, 'adults-1'),
  ('adults', '6th Kyu', 2, 50, 'adults-1'),
  ('adults', '5th Kyu', 3, 80, 'adults-1'),
  ('adults', '4th Kyu', 4, 100, 'adults-2'),
  ('adults', '3rd Kyu', 5, 150, 'adults-2'),
  ('adults', '2nd Kyu', 6, 200, 'adults-2'),
  ('adults', '1st Kyu', 7, 250, 'adults-2'),
  ('adults', 'Shodan', 8, 250, 'adults-2'),
  ('adults', 'Nidan', 9, 300, 'adults-2'),
  ('adults', 'Sandan', 10, 400, 'adults-2'),
  ('adults', 'Yondan', 11, null, 'adults-2'),
  ('juniors', 'Red Belt', 1, 20, 'juniors-1'),
  ('juniors', '10th Kyu Red White Belt', 2, 25, 'juniors-1'),
  ('juniors', '9th Kyu White Belt', 3, 25, 'juniors-1'),
  ('juniors', '8th Kyu Yellow White Belt', 4, 30, 'juniors-1'),
  ('juniors', '7th Kyu Yellow Belt', 5, 40, 'juniors-1'),
  ('juniors', '6th Kyu Orange White Belt', 6, 40, 'juniors-1'),
  ('juniors', '5th Kyu Orange Belt', 7, 50, 'juniors-1'),
  ('juniors', '4th Kyu Green White Belt', 8, 100, 'juniors-1'),
  ('juniors', '3rd Green Belt', 9, 100, 'juniors-1'),
  ('juniors', '2nd Kyu Blue Belt', 10, 200, 'juniors-1'),
  ('juniors', '1st Kyu Brown Belt', 11, 200, 'juniors-1')
on conflict (program, rank) do nothing;

-- Who changed a rank or date: stamped by the database.
create or replace function public.grading_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.jwt() ->> 'email';
  return new;
end
$$;

do $$
declare
  t text;
  ev text;
begin
  foreach t in array array['grading_members', 'grading_ranks', 'grading_test_dates'] loop
    execute format('revoke all on table public.%I from anon', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    -- Base rule, then the role switches narrow it (same as every report table).
    execute format('drop policy if exists "Signed-in staff" on public.%I', t);
    execute format('create policy "Signed-in staff" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('drop policy if exists "Role can view" on public.%I', t);
    execute format('create policy "Role can view" on public.%I as restrictive for select to authenticated using ((select public.has_permission(%L)))', t, 'grading.view');
    execute format('drop policy if exists "Role can add" on public.%I', t);
    execute format('create policy "Role can add" on public.%I as restrictive for insert to authenticated with check ((select public.has_permission(%L)))', t, 'grading.edit');
    execute format('drop policy if exists "Role can change" on public.%I', t);
    execute format('create policy "Role can change" on public.%I as restrictive for update to authenticated using ((select public.has_permission(%L))) with check ((select public.has_permission(%L)))', t, 'grading.edit', 'grading.edit');
    execute format('drop policy if exists "Role can remove" on public.%I', t);
    execute format('create policy "Role can remove" on public.%I as restrictive for delete to authenticated using ((select public.has_permission(%L)))', t, 'grading.edit');
  end loop;

  -- Ranks and dates: stamped and in the audit log (the nightly member snapshot is not).
  foreach t in array array['grading_ranks', 'grading_test_dates'] loop
    execute format('drop trigger if exists grading_stamp on public.%I', t);
    execute format('create trigger grading_stamp before update on public.%I for each row execute function public.grading_stamp()', t);
    foreach ev in array array['insert', 'update', 'delete'] loop
      execute format('drop trigger if exists app_audit_%s on public.%I', ev, t);
      execute format(
        'create trigger app_audit_%1$s after %1$s on public.%2$I referencing %3$s for each statement execute function public.app_audit_rows()',
        ev, t,
        case ev when 'insert' then 'new table as new_rows' when 'delete' then 'old table as old_rows' else 'old table as old_rows new table as new_rows' end
      );
    end loop;
  end loop;
end
$$;

-- Switches. Owner and Staff get "grading.edit" on the first run only (re-running never turns it back on);
-- the bot account always needs to read and write the snapshot.
insert into public.app_role_permissions (role_key, permission)
select v.role_key, v.permission from (values ('owner', 'grading.edit'), ('staff', 'grading.edit')) as v(role_key, permission)
where not exists (select 1 from public.app_role_permissions where permission = 'grading.edit')
on conflict do nothing;
insert into public.app_role_permissions (role_key, permission) values ('bot', 'grading.view'), ('bot', 'grading.edit')
on conflict do nothing;

-- The Grading bot in Settings > Bots: nightly, after the Red / Orange bot.
alter table public.bot_settings drop constraint if exists bot_settings_job_check;
alter table public.bot_settings add constraint bot_settings_job_check check (job in ('followup', 'pastdue', 'monday', 'grading'));
insert into public.bot_settings (job, label, run_days, run_time, cooldown_minutes) values
  ('grading', 'Grading report', '{0,1,2,3,4,5,6}', '23:45', 15)
on conflict (job) do nothing;
