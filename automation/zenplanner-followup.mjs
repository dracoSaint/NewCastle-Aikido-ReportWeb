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
import { env, exportSavedReport as exportReport, exportCsv, withZenPlanner, studioFrame, STUDIO, MEMBERSHIP_REPORT } from './zenplanner.mjs';

const require = createRequire(import.meta.url);
const { fuAttendanceFromText, fuMembershipsFromText, fuNextReport, fuBuild, fuReturns, fuApplyTiers, fuParseTable, fuIso } = require('../js/followUpCore.js');
const { BEGINNER_PACKAGE_LABELS } = require('../js/mondayImportCore.js');
const { gmComputeWeek } = require('../js/geronimoCore.js');

// Geronimo Metrics (js/geronimoMetrics.js): the week's attendance and cancels, saved to geronimo_weekly.
const addDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const weekFriday = iso => addDays(iso, (5 - new Date(`${iso}T00:00:00Z`).getUTCDay() + 7) % 7); // weeks run Saturday to Friday

// Attendance > "on or after" the week's Saturday, attendances only, totals by program: read the grid's Total row.
async function weekAttendance(page, saturday) {
  const [y, m, d] = saturday.split('-');
  const mdy = `${m}/${d}/${y.slice(2)}`;
  await page.goto(`${STUDIO}#/main/iframe/zenplanner/studio/attendance/index.cfm?ATTENDANCEDATE=today&_w=Aggregate&_s=`
    + `&_c=attendanceDate%252CfirstName%252ClastName%252CprogramId&_g=programId&_f1=attendanceDate&_o1=on+or+after`
    + `&_v1=${encodeURIComponent(encodeURIComponent(mdy))}&_f2=isAttendance&_o2=is+true&_v2=true`);
  // The Red/Orange report also opens attendance/index.cfm: wait for the frame showing this date.
  const decoded = url => { try { return decodeURIComponent(decodeURIComponent(url)); } catch { return url; } };
  const frame = await studioFrame(page, url => url.includes('/attendance/index.cfm') && decoded(url).includes(`_v1=${mdy}`));
  const total = frame.locator('#idSearchResultsGrid tr').last().locator('td, th').last();
  await total.waitFor({ timeout: 60000 });
  const count = Number((await total.textContent()).replace(/[^\d]/g, ''));
  if (!Number.isInteger(count)) throw new Error('attendance total not found');
  return count;
}

// Members > Drops (cancelled memberships). Its CSV export ignores the date filter, so dates are checked here.
// Counted as a cancel: a real reason on a full membership. Not counted: "Membership Upgrade" (a switch),
// "Administrative Drop" (housekeeping), beginner packages (a non-rollover shows on Trial waves) and Gratis.
async function weekCancels(page, friday) {
  const monthStart = `${friday.slice(0, 7)}-01`;
  const [y, m, d] = (monthStart < addDays(friday, -6) ? monthStart : addDays(friday, -6)).split('-');
  await page.goto(`${STUDIO}#/main/iframe/zenplanner/studio/drop/index.cfm?_w=Grid&_s=`
    + '&_c=effectiveDate%252CdropReason%252CCancelledBy%252CsubDropReason%252CfirstName%252ClastName%252CisTrial%252CprimaryEmail%252Cstatus%252CmembershipTemplateId%252CmembershipTemplateCategoryId'
    + `&_g=&_f1=effectiveDate&_o1=on+or+after&_v1=${encodeURIComponent(encodeURIComponent(`${m}/${d}/${y.slice(2)}`))}`);
  const text = await exportCsv(page, await studioFrame(page, url => url.includes('/drop/index.cfm')), 'geronimo-drops');
  const rows = fuParseTable(text, 'cancel_date');
  if (!rows) throw new Error('no "Cancel Date" column in the drops export');
  const packages = new Set(BEGINNER_PACKAGE_LABELS.map(label => label.toLowerCase()));
  const dates = rows
    .filter(row => !/membership upgrade|administrative drop/i.test(row.reason || '')
      && !packages.has((row.membership_label || '').trim().toLowerCase()) && !/gratis/i.test(row.membership_label || ''))
    .map(row => fuIso(row.cancel_date)).filter(Boolean);
  const between = from => dates.filter(date => date >= from && date <= friday).length;
  return { weekly_cancels: between(addDays(friday, -6)), cancels_mtd: between(monthStart) };
}

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

// Monday Board > ALL MEMBERS: every membership in Zen Planner's membership grid, any status.
async function allMemberships(page) {
  await page.goto(`${STUDIO}#/main/iframe/zenplanner/studio/membership/index.cfm?_w=Grid&_s=beginDate+DESC`
    + '&_c=friendlyId%252CfirstName%252ClastName%252CmembershipTemplateId%252Cstatus%252CbeginDate%252CendDate%252CattendanceMaximum%252CattendanceMaximumDuration%252CsharedPersonCount%252CautopayStatus'
    + '&_g=&_f1=status&_o1=is+one+of&_v1=CURRENT&_v1=NOT%252520STARTED&_v1=HOLD&_v1=CANCELED&_v1=CANCEL%252520PENDING&_v1=COMPLETED');
  const rows = fuParseTable(await exportCsv(page, await studioFrame(page, url => url.includes('/membership/index.cfm')), 'all-memberships'), 'mbr_status');
  if (!rows) throw new Error('no "Mbr. Status" column in the memberships export');
  const blank = value => (value || '').trim() || null;
  return rows.filter(row => blank(row.number)).map(row => ({
    number: row.number.trim(), first_name: blank(row.first_name), last_name: blank(row.last_name),
    membership_label: blank(row.membership_label), mbr_status: blank(row.mbr_status)?.toUpperCase() || null,
    mbr_begin_date: fuIso(row.mbr_begin_date) || null, mbr_end_date: fuIso(row.mbr_end_date) || null, autopay: blank(row.autopay)
  }));
}

// Upsert every exported membership, then remove the ones the export no longer has. A short export (a
// failed or filtered page) never wipes the table: removal only runs when the export looks complete.
async function saveAllMemberships(supabase, rows) {
  if (!rows?.length) return 'nothing exported';
  if (process.env.DRY_RUN) return `not saved (DRY_RUN): ${rows.length} memberships`;
  const syncedAt = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('membership_all').upsert(rows.slice(i, i + 500).map(row => ({ ...row, synced_at: syncedAt })), { onConflict: 'number' });
    if (error) return `not saved: ${error.message}`;
  }
  const { count } = await supabase.from('membership_all').select('number', { count: 'exact', head: true });
  if (rows.length < (count || 0) * 0.9) return `saved ${rows.length}; old rows kept (export much shorter than the ${count} on file)`;
  const { error } = await supabase.from('membership_all').delete().lt('synced_at', syncedAt);
  return error ? `saved ${rows.length}; old rows not removed: ${error.message}` : `saved ${rows.length}`;
}

// The Geronimo steps never stop the follow-up report: a failure is logged and that figure skipped.
const downloadReports = friday => withZenPlanner(async (page, step) => {
  step(ATTENDANCE_REPORT.name);
  const attendanceText = await exportReport(page, ATTENDANCE_REPORT);
  step(MEMBERSHIP_REPORT.name);
  const membershipText = await exportReport(page, MEMBERSHIP_REPORT);
  const geronimo = { week_ending: friday };
  step('Geronimo attendance');
  try { geronimo.attendance = await weekAttendance(page, addDays(friday, -6)); } catch (error) { console.warn(`Geronimo attendance skipped: ${error.message}`); }
  step('Geronimo cancels');
  try { Object.assign(geronimo, await weekCancels(page, friday)); } catch (error) { console.warn(`Geronimo cancels skipped: ${error.message}`); }
  step('All memberships');
  let everyMembership = null;
  try { everyMembership = await allMemberships(page); } catch (error) { console.warn(`All memberships skipped: ${error.message}`); }
  return { attendanceText, membershipText, geronimo, everyMembership };
});

// Lock in each week once it has ended: the figures worked out from the other reports (js/geronimoCore.js)
// fill its empty boxes, anything already saved (by hand or by this job) stays, and locked_at is set.
// The two weeks before this one are checked every night, so a late figure (e.g. rollover %) still fills a blank.
async function lockGeronimo(supabase, thisFriday) {
  const out = [];
  for (const friday of [addDays(thisFriday, -7), addDays(thisFriday, -14)]) {
    const { data: saved, error } = await supabase.from('geronimo_weekly').select('*').eq('week_ending', friday).maybeSingle();
    if (error) { out.push(`${friday}: ${error.message}`); continue; }
    const { values } = await gmComputeWeek(supabase, friday, () => true);
    const patch = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== null && value !== undefined && (saved?.[key] ?? null) === null));
    if (!saved?.locked_at) patch.locked_at = new Date().toISOString();
    if (!Object.keys(patch).length) { out.push(`${friday}: nothing new`); continue; }
    if (process.env.DRY_RUN) { out.push(`${friday}: not saved (DRY_RUN) ${JSON.stringify(patch)}`); continue; }
    const { error: saveError } = await supabase.from('geronimo_weekly').upsert({ week_ending: friday, ...patch }, { onConflict: 'week_ending' });
    out.push(`${friday}: ${saveError ? `not saved: ${saveError.message}` : `saved ${Object.keys(patch).join(', ')}`}`);
  }
  return out.join('; ');
}

// Only the columns found are written, so the figures staff entered for the week stay as they are.
async function saveGeronimo(supabase, geronimo) {
  if (Object.keys(geronimo).length < 2) return 'nothing to save';
  if (process.env.DRY_RUN) return `not saved (DRY_RUN): ${JSON.stringify(geronimo)}`;
  const { error } = await supabase.from('geronimo_weekly').upsert(geronimo, { onConflict: 'week_ending' });
  return error ? `not saved: ${error.message}` : `saved ${JSON.stringify(geronimo)}`;
}

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

  // Geronimo lock-in needs no Zen Planner, so it runs every night, even when the report below is already saved.
  try { console.log(`Geronimo lock-in: ${await lockGeronimo(supabase, weekFriday(reportDate))}`); } catch (error) { console.warn(`Geronimo lock-in skipped: ${error.message}`); }

  const { data: already } = await supabase.from('follow_up_reports').select('id')
    .eq('report_date', reportDate).eq('attendance_file', AUTO_ATTENDANCE).limit(1);
  if (already?.length && process.env.FORCE_RUN !== 'true') {
    console.log(`Report for ${reportDate} already saved (id ${already[0].id}). Nothing to do.`);
    return;
  }

  const { attendanceText, membershipText, geronimo, everyMembership } = await downloadReports(weekFriday(reportDate));
  console.log(`Geronimo week ending ${geronimo.week_ending}: ${await saveGeronimo(supabase, geronimo)}`);
  console.log(`All memberships: ${await saveAllMemberships(supabase, everyMembership)}`);
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
