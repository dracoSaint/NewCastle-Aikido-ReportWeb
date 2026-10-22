// Nightly job: export two saved Zen Planner reports, "Red/Orange Attendance (30 Days Count)"
// and "Membership Report (Current/Hold)", and save the next Red / Orange Follow-Up report to
// the portal. Run by .github/workflows/zenplanner-followup.yml at the time set in Settings > Bots.
//
// Secrets (GitHub > Settings > Secrets and variables > Actions), never in code:
//   ZP_USERNAME, ZP_PASSWORD    Zen Planner staff login
//   BOT_EMAIL, BOT_PASSWORD     a portal (Supabase) user made just for this job
//
// Local test (nothing saved, visible browser): copy automation/.env.example to automation/.env, fill it, then
//   node --env-file=automation/.env automation/zenplanner-followup.mjs

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { env, exportSavedReport as exportReport, withZenPlanner, MEMBERSHIP_REPORT } from './zenplanner.mjs';

const require = createRequire(import.meta.url);
const { fuAttendanceFromText, fuMembershipsFromText, fuNextReport, fuBuild, fuReturns, fuApplyTiers } = require('../js/followUpCore.js');

// Saved reports, opened by category and name exactly as Zen Planner lists them.
const ATTENDANCE_REPORT = { category: 'Attendance', name: 'RED/ORANGE ATTENDANCE (30 DAYS COUNT)', file: 'attendance' };
const AUTO_ATTENDANCE = 'Zen Planner auto-export (Red/Orange Attendance (30 Days Count))';
const AUTO_MEMBERSHIP = 'Zen Planner auto-export (membership status)';

// Started at the time set in Settings > Bots (automation/bot-scheduler.mjs). A run just after
// midnight (GitHub can start late) still belongs to the evening before, so date it then.
function sydneyReportDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (Number(parts.hour) >= 3) return today;
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// Geronimo's figures, the all-members list and trial waves are their own nightly job (zenplanner-geronimo.mjs).
const downloadReports = () => withZenPlanner(async (page, step) => {
  step(ATTENDANCE_REPORT.name);
  const attendanceText = await exportReport(page, ATTENDANCE_REPORT);
  step(MEMBERSHIP_REPORT.name);
  const membershipText = await exportReport(page, MEMBERSHIP_REPORT);
  return { attendanceText, membershipText };
});

async function main() {
  // A manual run (FORCE_RUN) uses the same date, so re-running on the same day (or before 3 am)
  // refreshes that day's list in place and keeps its top-level notes.
  const reportDate = sydneyReportDate();

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL').trim(), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

  // Tier days and owners from Settings > Report rules (built-in defaults until that's set up).
  const { data: tiers } = await supabase.from('app_settings').select('value').eq('key', 'followup_tiers').maybeSingle();
  fuApplyTiers(tiers?.value);

  const { data: already } = await supabase.from('follow_up_reports').select('id')
    .eq('report_date', reportDate).eq('attendance_file', AUTO_ATTENDANCE).limit(1);
  if (already?.length && process.env.FORCE_RUN !== 'true') {
    console.log(`Report for ${reportDate} already saved (id ${already[0].id}). Nothing to do.`);
    return;
  }

  const { attendanceText, membershipText } = await downloadReports();
  const attendance = fuAttendanceFromText(attendanceText);
  const memberships = fuMembershipsFromText(membershipText);

  // One report per day: a same-day run updates that day's report (keeping its notes);
  // otherwise a new report starts with the top-level notes cleared (they live on in the notes log).
  const { data: sameDay, error: sameDayError } = await supabase.from('follow_up_reports').select('*')
    .eq('report_date', reportDate).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (sameDayError) throw sameDayError;

  const next = fuNextReport(sameDay, {
    attendance, memberships, report_date: reportDate,
    attendance_file: AUTO_ATTENDANCE, membership_file: AUTO_MEMBERSHIP
  });
  const result = fuBuild(next);
  let id = 'not saved (DRY_RUN)';
  let returned = 0;
  if (!process.env.DRY_RUN) {
    // A same-day update writes only the inputs, so notes staff save during the run are never overwritten.
    const { notes: _notes, removed: _removed, ...inputs } = next;
    const save = sameDay
      ? supabase.from('follow_up_reports').update(inputs).eq('id', sameDay.id)
      : supabase.from('follow_up_reports').insert(next);
    const { data, error } = await save.select('id').single();
    if (error) throw error;
    id = sameDay ? `${data.id} (updated)` : data.id;
    returned = await saveReturns(supabase, reportDate, next, data.id);
  }
  console.log(`Report ${id} for ${reportDate}: ${attendance.length} attendance rows, ${memberships.length} membership records; `
    + `orange ${result.orange.length}, red ${result.red.length}, no record ${result.none.length}, `
    + `excluded ${result.excluded.length}; ${Object.keys(next.notes).length} notes kept; ${returned} returned.`);
}

// Returned: anyone on the previous day's list who is off this one because they trained again.
// A missing follow_up_returns table only skips this step; the report itself is already saved.
async function saveReturns(supabase, reportDate, next, reportId) {
  const { data: previous, error } = await supabase.from('follow_up_reports').select('*')
    .lt('report_date', reportDate).order('report_date', { ascending: false }).order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  const rows = fuReturns(previous, next).map(row => ({ ...row, report_id: reportId }));
  if (!rows.length) return 0;
  const { error: saveError } = await supabase.from('follow_up_returns').upsert(rows, { onConflict: 'member_key,returned_on', ignoreDuplicates: true });
  if (saveError) {
    console.warn(`Returned not recorded: ${saveError.message}`);
    return 0;
  }
  return rows.length;
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
