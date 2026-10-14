// Nightly job: export two saved Zen Planner reports, "Red/Orange Attendance (30 Days Count)"
// and "Membership Report (Current/Hold)", and save the next Red / Orange Follow-Up report to
// the portal. Run by .github/workflows/zenplanner-followup.yml every night at 11:59 pm Newcastle time.
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
const { fuAttendanceFromText, fuMembershipsFromText, fuNextReport, fuBuild, fuApplyTiers } = require('../js/followUpCore.js');

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

const downloadReports = () => withZenPlanner(async (page, step) => {
  step(ATTENDANCE_REPORT.name);
  const attendanceText = await exportReport(page, ATTENDANCE_REPORT);
  step(MEMBERSHIP_REPORT.name);
  const membershipText = await exportReport(page, MEMBERSHIP_REPORT);
  return { attendanceText, membershipText };
});

async function main() {
  const reportDate = process.env.FORCE_RUN === 'true'
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
    : sydneyReportDate();

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

  // The latest report supplies the notes to carry over.
  const { data: latest, error: latestError } = await supabase.from('follow_up_reports').select('*')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;

  const next = fuNextReport(latest, {
    attendance, memberships, report_date: reportDate,
    attendance_file: AUTO_ATTENDANCE, membership_file: AUTO_MEMBERSHIP
  });
  const result = fuBuild(next);
  let id = 'not saved (DRY_RUN)';
  if (!process.env.DRY_RUN) {
    const { data, error } = await supabase.from('follow_up_reports').insert(next).select('id').single();
    if (error) throw error;
    id = data.id;
  }
  console.log(`Report ${id} for ${reportDate}: ${attendance.length} attendance rows, ${memberships.length} membership records; `
    + `orange ${result.orange.length}, red ${result.red.length}, no record ${result.none.length}, `
    + `excluded ${result.excluded.length}; ${Object.keys(next.notes).length} notes carried over.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
