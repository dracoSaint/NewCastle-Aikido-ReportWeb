-- Roles, permission switches and bot settings for the portal (Settings page, pages/Settings.html).
--
-- Every signed-in user has one role. A role is a set of switches (permissions) such as
-- "pastdue.view" or "bots.manage". The dev role always has every switch, so the dev can never be
-- locked out. Users without a role row count as "staff", which starts with today's access.
--
-- Data tables keep their existing rules; this adds RESTRICTIVE rules on top ("and the role allows
-- it"), so view/edit switches are enforced by the database, not just hidden on screen.
--
-- Safe to re-run: switches already set are never reset. Run in the Supabase SQL editor.
-- Before running: check the two emails in step 6 (dev account and the bots' BOT_EMAIL account).

-- 1. Tables -------------------------------------------------------------------------------------

create table if not exists public.app_roles (
  key text primary key check (key ~ '^[a-z0-9_]{2,32}$'),
  name text not null check (length(trim(name)) between 1 and 40),
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.app_role_permissions (
  role_key text not null references public.app_roles(key) on delete cascade,
  permission text not null check (permission ~ '^[a-z]+\.[a-z]+$'),
  primary key (role_key, permission)
);

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null references public.app_roles(key),
  updated_at timestamptz not null default now(),
  updated_by text default (auth.jwt() ->> 'email')
);

create table if not exists public.bot_settings (
  job text primary key check (job in ('followup', 'pastdue', 'monday')),
  label text not null,
  enabled boolean not null default true,
  run_days smallint[] not null default '{0,1,2,3,4,5,6}', -- 0 = Sunday ... 6 = Saturday
  run_time time not null,                                   -- Sydney time
  cooldown_minutes integer not null default 15 check (cooldown_minutes between 0 and 1440),
  last_started_at timestamptz,
  last_started_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 2. Permission checks ----------------------------------------------------------------------------

create or replace function public.current_role_key() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role_key from public.app_user_roles where user_id = auth.uid()), 'staff')
$$;

create or replace function public.has_permission(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.current_role_key() = 'dev'
    or exists (select 1 from public.app_role_permissions where role_key = public.current_role_key() and permission = p)
  )
$$;

-- What the signed-in user may do; the pages use this to hide what the database would refuse.
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'role', r.key,
    'role_name', r.name,
    'is_dev', r.key = 'dev',
    'permissions', coalesce((select jsonb_agg(permission) from public.app_role_permissions where role_key = r.key), '[]'::jsonb)
  )
  from public.app_roles r
  where r.key = public.current_role_key() and auth.uid() is not null
$$;

-- Users list for Settings > Users (auth.users is not readable from the browser).
create or replace function public.list_portal_users()
returns table (user_id uuid, email text, last_sign_in_at timestamptz, role_key text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_permission('access.manage') then
    raise exception 'You don''t have permission to manage users.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.last_sign_in_at, coalesce(r.role_key, 'staff')
    from auth.users u left join public.app_user_roles r on r.user_id = u.id
    order by u.email;
end
$$;

-- Starts a bot run: Sync buttons (needs sync.run, respects the cooldown) and the scheduler
-- (needs bots.schedule). A bot switched off in Settings never runs.
create or replace function public.claim_bot_run(p_job text, p_scheduled boolean default false)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  s public.bot_settings;
  wait_minutes integer;
begin
  if not public.has_permission(case when p_scheduled then 'bots.schedule' else 'sync.run' end) then
    raise exception 'Your role can''t start bots. Ask the dev to switch it on in Settings.' using errcode = '42501';
  end if;
  select * into s from public.bot_settings where job = p_job for update;
  if not found then
    raise exception 'Unknown bot.';
  end if;
  if not s.enabled then
    raise exception '% is switched off in Settings.', s.label;
  end if;
  if not p_scheduled and s.last_started_at > now() - make_interval(mins => s.cooldown_minutes) then
    wait_minutes := ceil(extract(epoch from (s.last_started_at + make_interval(mins => s.cooldown_minutes) - now())) / 60);
    raise exception '% started a few minutes ago. Try again in % min.', s.label, wait_minutes;
  end if;
  update public.bot_settings
    set last_started_at = now(), last_started_by = coalesce(auth.jwt() ->> 'email', 'scheduler')
    where job = p_job;
  return now();
end
$$;

revoke all on function public.current_role_key(), public.has_permission(text), public.my_access(),
  public.list_portal_users(), public.claim_bot_run(text, boolean) from public, anon;
grant execute on function public.current_role_key(), public.has_permission(text), public.my_access(),
  public.list_portal_users(), public.claim_bot_run(text, boolean) to authenticated;

-- 3. Rules on the new tables ---------------------------------------------------------------------

revoke all on public.app_roles, public.app_role_permissions, public.app_user_roles,
  public.bot_settings, public.app_settings from anon;
alter table public.app_roles enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.bot_settings enable row level security;
alter table public.app_settings enable row level security;

-- Roles: names are readable by staff; only access managers change them. The dev role and the
-- built-in roles can't be deleted.
drop policy if exists "Read roles" on public.app_roles;
create policy "Read roles" on public.app_roles for select to authenticated using (true);
drop policy if exists "Manage roles" on public.app_roles;
create policy "Manage roles" on public.app_roles for insert to authenticated
  with check (public.has_permission('access.manage') and key <> 'dev' and not is_system);
drop policy if exists "Rename roles" on public.app_roles;
create policy "Rename roles" on public.app_roles for update to authenticated
  using (public.has_permission('access.manage') and key <> 'dev')
  with check (public.has_permission('access.manage') and key <> 'dev');
drop policy if exists "Delete roles" on public.app_roles;
create policy "Delete roles" on public.app_roles for delete to authenticated
  using (public.has_permission('access.manage') and not is_system);

-- Switches: you can read your own role's switches; access managers read and flip any role's,
-- except the dev role (always everything).
drop policy if exists "Read switches" on public.app_role_permissions;
create policy "Read switches" on public.app_role_permissions for select to authenticated
  using (role_key = public.current_role_key() or public.has_permission('access.manage'));
drop policy if exists "Add switches" on public.app_role_permissions;
create policy "Add switches" on public.app_role_permissions for insert to authenticated
  with check (public.has_permission('access.manage') and role_key <> 'dev');
drop policy if exists "Remove switches" on public.app_role_permissions;
create policy "Remove switches" on public.app_role_permissions for delete to authenticated
  using (public.has_permission('access.manage') and role_key <> 'dev');

-- Who has which role: managers assign roles, but nobody changes their own, and only the dev
-- can give or take away the dev role.
drop policy if exists "Read user roles" on public.app_user_roles;
create policy "Read user roles" on public.app_user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('access.manage'));
drop policy if exists "Assign roles" on public.app_user_roles;
create policy "Assign roles" on public.app_user_roles for insert to authenticated
  with check (public.has_permission('access.manage') and user_id <> auth.uid()
    and (role_key <> 'dev' or public.current_role_key() = 'dev'));
drop policy if exists "Change roles" on public.app_user_roles;
create policy "Change roles" on public.app_user_roles for update to authenticated
  using (public.has_permission('access.manage') and user_id <> auth.uid()
    and (role_key <> 'dev' or public.current_role_key() = 'dev'))
  with check (public.has_permission('access.manage') and user_id <> auth.uid()
    and (role_key <> 'dev' or public.current_role_key() = 'dev'));

revoke update on public.app_roles from authenticated;
grant select, insert, delete on public.app_roles to authenticated;
grant update (name, description) on public.app_roles to authenticated;
grant select, insert, delete on public.app_role_permissions to authenticated;
grant select, insert, update on public.app_user_roles to authenticated;

-- Bot settings and report rules: readable by every signed-in user (the pages and bots need
-- them), changed only with bots.manage. Runs are stamped through claim_bot_run.
drop policy if exists "Read bot settings" on public.bot_settings;
create policy "Read bot settings" on public.bot_settings for select to authenticated using (true);
drop policy if exists "Manage bot settings" on public.bot_settings;
create policy "Manage bot settings" on public.bot_settings for update to authenticated
  using (public.has_permission('bots.manage')) with check (public.has_permission('bots.manage'));
revoke update on public.bot_settings from authenticated;
grant select on public.bot_settings to authenticated;
grant update (enabled, run_days, run_time, cooldown_minutes, updated_at, updated_by) on public.bot_settings to authenticated;

drop policy if exists "Read app settings" on public.app_settings;
create policy "Read app settings" on public.app_settings for select to authenticated using (true);
drop policy if exists "Add app settings" on public.app_settings;
create policy "Add app settings" on public.app_settings for insert to authenticated
  with check (public.has_permission('bots.manage'));
drop policy if exists "Change app settings" on public.app_settings;
create policy "Change app settings" on public.app_settings for update to authenticated
  using (public.has_permission('bots.manage')) with check (public.has_permission('bots.manage'));
grant select, insert, update on public.app_settings to authenticated;

-- 4. Starting roles, switches and bot settings (only added if missing) -----------------------------

insert into public.app_roles (key, name, description, is_system) values
  ('dev', 'Dev', 'Full access, always. Sets up roles and permissions.', true),
  ('owner', 'Owner', 'All reports, bot settings and report rules.', true),
  ('staff', 'Staff', 'Default for new accounts. All reports.', true),
  ('bot', 'Bot', 'The automated Zen Planner jobs.', true)
on conflict (key) do nothing;

insert into public.app_role_permissions (role_key, permission)
select role_key, permission from (values
  ('owner', 'monday.view'), ('owner', 'monday.edit'), ('owner', 'pastdue.view'), ('owner', 'pastdue.edit'),
  ('owner', 'followup.view'), ('owner', 'followup.edit'), ('owner', 'ads.view'), ('owner', 'ads.edit'),
  ('owner', 'grading.view'), ('owner', 'sops.view'), ('owner', 'sops.edit'), ('owner', 'sync.run'), ('owner', 'bots.manage'),
  ('staff', 'monday.view'), ('staff', 'monday.edit'), ('staff', 'pastdue.view'), ('staff', 'pastdue.edit'),
  ('staff', 'followup.view'), ('staff', 'followup.edit'), ('staff', 'ads.view'), ('staff', 'ads.edit'),
  ('staff', 'grading.view'), ('staff', 'sops.view'), ('staff', 'sops.edit'), ('staff', 'sync.run'),
  ('bot', 'monday.view'), ('bot', 'monday.edit'), ('bot', 'pastdue.view'), ('bot', 'pastdue.edit'),
  ('bot', 'followup.view'), ('bot', 'followup.edit'), ('bot', 'bots.schedule')
) as v(role_key, permission)
where not exists (select 1 from public.app_role_permissions p where p.role_key = v.role_key)
on conflict do nothing;

insert into public.bot_settings (job, label, run_days, run_time, cooldown_minutes) values
  ('followup', 'Red / Orange follow-up', '{0,1,2,3,4,5,6}', '23:30', 15),
  ('pastdue', 'Past due sync', '{0,1,2,3,4,5,6}', '07:00', 15),
  ('monday', 'Monday report', '{1}', '07:00', 15)
on conflict (job) do nothing;

insert into public.app_settings (key, value) values
  ('followup_tiers', '{"orange": {"from": 7, "to": 13, "owner": "Rachelle"}, "red": {"from": 14, "owner": "Darius"}}')
on conflict (key) do nothing;

-- 5. Role rules on every data table ---------------------------------------------------------------
-- "view" governs reading, "edit" governs adding, changing and removing. A table that had row
-- level security off gets it on, with the old "any signed-in user" rule kept as the base.

do $$
declare
  rec record;
begin
  for rec in select * from (values
    ('past_due_member_log', 'pastdue'), ('past_due_exempted_members', 'pastdue'), ('past_due_failure_reason', 'pastdue'),
    ('past_due_member_notes', 'pastdue'), ('past_due_import_runs', 'pastdue'),
    ('membership_data', 'monday'), ('membership_data_previous', 'monday'), ('membership_data_log', 'monday'),
    ('membership_weekly_log', 'monday'), ('pricing_settings', 'monday'),
    ('follow_up_reports', 'followup'), ('follow_up_contacts', 'followup'),
    ('ad_review_ads', 'ads'), ('ad_review_snapshots', 'ads'), ('ad_review_actions', 'ads'),
    ('ad_review_leads', 'ads'), ('ad_review_playbook', 'ads'),
    ('sop_documents', 'sops')
  ) as v(tbl, area) loop
    if to_regclass('public.' || rec.tbl) is null then
      raise notice 'Skipped %, table not found', rec.tbl;
      continue;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || rec.tbl)::regclass) then
      execute format('alter table public.%I enable row level security', rec.tbl);
      execute format('drop policy if exists "Signed-in staff" on public.%I', rec.tbl);
      execute format('create policy "Signed-in staff" on public.%I for all to authenticated using (true) with check (true)', rec.tbl);
    end if;
    execute format('drop policy if exists "Role can view" on public.%I', rec.tbl);
    execute format('create policy "Role can view" on public.%I as restrictive for select to authenticated using ((select public.has_permission(%L)))', rec.tbl, rec.area || '.view');
    execute format('drop policy if exists "Role can add" on public.%I', rec.tbl);
    execute format('create policy "Role can add" on public.%I as restrictive for insert to authenticated with check ((select public.has_permission(%L)))', rec.tbl, rec.area || '.edit');
    execute format('drop policy if exists "Role can change" on public.%I', rec.tbl);
    execute format('create policy "Role can change" on public.%I as restrictive for update to authenticated using ((select public.has_permission(%L))) with check ((select public.has_permission(%L)))', rec.tbl, rec.area || '.edit', rec.area || '.edit');
    execute format('drop policy if exists "Role can remove" on public.%I', rec.tbl);
    execute format('create policy "Role can remove" on public.%I as restrictive for delete to authenticated using ((select public.has_permission(%L)))', rec.tbl, rec.area || '.edit');
  end loop;
end
$$;

-- 6. Who is dev, and which account the bots sign in as ---------------------------------------------
-- Change the bot email if your GitHub secret BOT_EMAIL is a different account.

insert into public.app_user_roles (user_id, role_key, updated_by)
select id, 'dev', 'setup' from auth.users where lower(email) = 'admin@newcastleaikido.com'
on conflict (user_id) do update set role_key = 'dev', updated_at = now(), updated_by = 'setup';

insert into public.app_user_roles (user_id, role_key, updated_by)
select id, 'bot', 'setup' from auth.users where lower(email) = 'reports-bot@newcastleaikido.com'
on conflict (user_id) do update set role_key = 'bot', updated_at = now(), updated_by = 'setup';

-- Check afterwards: this should list your dev and bot accounts.
-- select u.email, r.role_key from public.app_user_roles r join auth.users u on u.id = r.user_id;

-- 7. Activity log: who changed roles, switches, user roles, bot settings and report rules ----------
-- Written by triggers only; readable with "Users, roles and permissions". Bot run stamps aren't logged.

create table if not exists public.app_audit_log (
  id bigint generated by default as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  table_name text not null,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index if not exists app_audit_log_at_idx on public.app_audit_log (at desc);

create or replace function public.app_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'bot_settings' and tg_op = 'UPDATE'
     and (to_jsonb(new) - array['last_started_at', 'last_started_by']) = (to_jsonb(old) - array['last_started_at', 'last_started_by']) then
    return new;
  end if;
  insert into public.app_audit_log (actor, table_name, action, old_row, new_row)
  values (coalesce(auth.jwt() ->> 'email', 'setup'), tg_table_name, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end
$$;
revoke all on function public.app_audit() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['app_roles', 'app_role_permissions', 'app_user_roles', 'bot_settings', 'app_settings'] loop
    execute format('drop trigger if exists app_audit on public.%I', t);
    execute format('create trigger app_audit after insert or update or delete on public.%I for each row execute function public.app_audit()', t);
  end loop;
end
$$;

revoke all on public.app_audit_log from anon, authenticated;
alter table public.app_audit_log enable row level security;
drop policy if exists "Read activity" on public.app_audit_log;
create policy "Read activity" on public.app_audit_log for select to authenticated
  using ((select public.has_permission('access.manage')));
grant select on public.app_audit_log to authenticated;

-- 8. Audit log for the reports: every staff edit, and bot imports as one line each -----------------
-- Who can read the log: the "View the audit log" switch (audit.view): on for Owner and Bot; Dev has it
-- always. One line per statement: a single-row change keeps its before/after; a bulk change (a bot
-- import of hundreds of rows) is one line with the row count.

alter table public.app_audit_log add column if not exists row_count integer not null default 1;
create index if not exists app_audit_log_table_at_idx on public.app_audit_log (table_name, at desc);
create index if not exists app_audit_log_actor_at_idx on public.app_audit_log (actor, at desc);

-- First run only: once any role has the switch, re-running never turns it back on.
insert into public.app_role_permissions (role_key, permission)
select v.role_key, 'audit.view' from (values ('owner'), ('bot')) as v(role_key)
where not exists (select 1 from public.app_role_permissions where permission = 'audit.view')
on conflict do nothing;

drop policy if exists "Read activity" on public.app_audit_log;
create policy "Read activity" on public.app_audit_log for select to authenticated
  using ((select public.has_permission('audit.view')));

create or replace function public.app_audit_rows() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n integer;
  before_row jsonb;
  after_row jsonb;
  quiet text[] := case when tg_table_name like 'membership_data%'
    then array['imported_at', 'updated_at', 'archived_at', 'report_date', 'snapshot_label']
    else array['imported_at', 'updated_at', 'archived_at'] end;
begin
  if tg_op = 'DELETE' then
    select count(*), (array_agg(to_jsonb(r)))[1] into n, before_row from old_rows r;
  else
    select count(*), (array_agg(to_jsonb(r)))[1] into n, after_row from new_rows r;
    if tg_op = 'UPDATE' then
      select (array_agg(to_jsonb(r)))[1] into before_row from old_rows r;
    end if;
  end if;
  if n = 0 then
    return null;
  end if;
  -- A row rewritten with only its import stamps changed (the Monday import refreshes every member
  -- one by one) is not a change worth a line.
  if tg_op = 'UPDATE' and n = 1 and (after_row - quiet) = (before_row - quiet) then
    return null;
  end if;
  insert into public.app_audit_log (actor, table_name, action, row_count, old_row, new_row)
  values (coalesce(auth.jwt() ->> 'email', 'system'), tg_table_name, lower(tg_op), n,
          case when n = 1 then before_row end, case when n = 1 then after_row end);
  return null;
end
$$;
revoke all on function public.app_audit_rows() from public, anon, authenticated;

-- Triggers with "transition tables" (the changed rows) take one event each, so three per table.
do $$
declare
  t text;
  ev text;
begin
  foreach t in array array[
    'past_due_member_log', 'past_due_exempted_members', 'past_due_failure_reason', 'past_due_member_notes', 'past_due_import_runs',
    'membership_data', 'membership_data_previous', 'membership_data_log', 'membership_weekly_log', 'pricing_settings',
    'follow_up_reports', 'follow_up_contacts',
    'ad_review_ads', 'ad_review_snapshots', 'ad_review_actions', 'ad_review_leads', 'ad_review_playbook',
    'sop_documents'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
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
