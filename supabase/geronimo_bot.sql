-- The Geronimo Metrics bot in Settings > Bots (automation/zenplanner-geronimo.mjs), nightly at 23:00.
-- It used to ride on the Red / Orange bot, which can now run on its own (e.g. weekly) schedule.
-- Safe to re-run. Run in the Supabase SQL editor (after access_control.sql and grading.sql).
-- Rollback: delete from public.bot_settings where job = 'geronimo';

alter table public.bot_settings drop constraint if exists bot_settings_job_check;
alter table public.bot_settings add constraint bot_settings_job_check check (job in ('followup', 'pastdue', 'monday', 'grading', 'geronimo'));
insert into public.bot_settings (job, label, run_days, run_time, cooldown_minutes) values
  ('geronimo', 'Geronimo metrics', '{0,1,2,3,4,5,6}', '23:00', 15)
on conflict (job) do nothing;

-- The bot account writes the all-members list (Monday Board) and the Geronimo tables.
insert into public.app_role_permissions (role_key, permission) values
  ('bot', 'monday.view'), ('bot', 'monday.edit'), ('bot', 'geronimo.view'), ('bot', 'geronimo.edit'), ('bot', 'ads.view'), ('bot', 'followup.view')
on conflict do nothing;
