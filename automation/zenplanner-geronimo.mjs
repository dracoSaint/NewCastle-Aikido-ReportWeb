// Nightly job for the Geronimo Metrics report (js/geronimoMetrics.js), on its own schedule in Settings > Bots
// (the Red / Orange bot it used to ride on can run weekly). In order:
//   1. Zen Planner: this week's attendance total and cancels -> geronimo_weekly (only those columns).
//   2. Zen Planner: every membership in any status -> membership_all (Monday Board > All Members too).
//   3. Trial waves from the fresh membership list (gmSyncWaves): new starters, rolled over, inducted, contacts.
//   4. Lock in the weeks that have ended (blanks only; anything entered by hand stays).
// A failed step is logged and skipped; the others still run.
// Run by .github/workflows/zenplanner-geronimo.yml (started by bot-scheduler.yml) or the Geronimo page's sync.
//
// Secrets: same as zenplanner-followup.mjs (ZP_USERNAME, ZP_PASSWORD, BOT_EMAIL, BOT_PASSWORD).
// Local test (nothing saved): DRY_RUN=1 node --env-file=automation/.env automation/zenplanner-geronimo.mjs

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { env, exportCsv, withZenPlanner, studioFrame, STUDIO, sydneyToday } from './zenplanner.mjs';

const require = createRequire(import.meta.url);
const { fuParseTable, fuIso } = require('../js/followUpCore.js');
const { BEGINNER_PACKAGE_LABELS } = require('../js/mondayImportCore.js');
const { gmComputeWeek, gmSyncWaves } = require('../js/geronimoCore.js');

const addDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const weekFriday = iso => addDays(iso, (5 - new Date(`${iso}T00:00:00Z`).getUTCDay() + 7) % 7); // weeks run Saturday to Friday

// Attendance > "on or after" the Saturday after last Friday (the week's first day), attendances only, totals by
// program: read the grid's Total row. The user's report link (Oct 2026), date as Zen Planner shows it: DD/MM/YYYY.
async function weekAttendance(page, saturday) {
  const [y, m, d] = saturday.split('-');
  const dmy = `${d}/${m}/${y}`;
  await page.goto(`${STUDIO}#/main/iframe/zenplanner/studio/attendance/index.cfm?ATTENDANCEDATE=today&_w=Aggregate&_s=`
    + `&_c=attendanceDate%252CfirstName%252ClastName%252CprogramId&_g=programId&_f1=attendanceDate&_o1=on+or+after`
    + `&_v1=${encodeURIComponent(encodeURIComponent(dmy))}&_f2=isAttendance&_o2=is+true&_v2=true`);
  // Wait for the frame showing this date (another attendance page may still be loaded).
  const decoded = url => { try { return decodeURIComponent(decodeURIComponent(url)); } catch { return url; } };
  const frame = await studioFrame(page, url => url.includes('/attendance/index.cfm') && decoded(url).includes(`_v1=${dmy}`));
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

// Only the columns found are written, so the figures staff entered for the week stay as they are.
async function saveWeek(supabase, week) {
  if (Object.keys(week).length < 2) return 'nothing to save';
  if (process.env.DRY_RUN) return `not saved (DRY_RUN): ${JSON.stringify(week)}`;
  const { error } = await supabase.from('geronimo_weekly').upsert(week, { onConflict: 'week_ending' });
  return error ? `not saved: ${error.message}` : `saved ${JSON.stringify(week)}`;
}

// Lock in each week once it has ended: the figures worked out from the other reports (js/geronimoCore.js)
// fill its empty boxes, anything already saved (by hand or by this job) stays, and locked_at is set.
// The two weeks before this one are checked every night, so a late figure (e.g. rollover %) still fills a blank.
async function lockWeeks(supabase, thisFriday) {
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

async function main() {
  const friday = weekFriday(sydneyToday());
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL').trim(), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

  const { week, everyMembership } = await withZenPlanner(async (page, step) => {
    const week = { week_ending: friday };
    step('attendance');
    // The first Zen Planner page after signing in sometimes loads too slowly (seen on GitHub): try twice.
    for (let attempt = 1; attempt <= 2 && week.attendance === undefined; attempt++) {
      try { week.attendance = await weekAttendance(page, addDays(friday, -6)); } catch (error) { console.warn(`Attendance attempt ${attempt} failed: ${error.message}`); }
    }
    step('cancels');
    try { Object.assign(week, await weekCancels(page, friday)); } catch (error) { console.warn(`Cancels skipped: ${error.message}`); }
    step('all memberships');
    let everyMembership = null;
    try { everyMembership = await allMemberships(page); } catch (error) { console.warn(`All memberships skipped: ${error.message}`); }
    return { week, everyMembership };
  });
  console.log(`Week ending ${friday}: ${await saveWeek(supabase, week)}`);
  console.log(`All memberships: ${await saveAllMemberships(supabase, everyMembership)}`);

  // Waves and lock-in read the tables just saved, so they run after.
  try {
    const { added, updated, merged } = await gmSyncWaves(supabase, Boolean(process.env.DRY_RUN));
    console.log(`Trial waves${process.env.DRY_RUN ? ' (DRY_RUN, not saved)' : ''}: ${added} starters added, ${updated} filled in, ${merged} doubled-up rows merged`);
  } catch (error) { console.warn(`Trial waves skipped: ${error.message}`); }
  try { console.log(`Lock-in: ${await lockWeeks(supabase, friday)}`); } catch (error) { console.warn(`Lock-in skipped: ${error.message}`); }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
