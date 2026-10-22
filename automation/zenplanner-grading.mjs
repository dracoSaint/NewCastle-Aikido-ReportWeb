// Nightly job: export Zen Planner's student programs grid (Regular Adult and Juniors, status Student:
// rank, attendance since sign-up and since the last promotional test, last test date) and replace the
// Grading report's snapshot (grading_members). The page works out hours needed, eligibility and weekly
// goals from it (js/gradingCore.js) with the rank hours and test dates kept in the portal.
// Run by .github/workflows/zenplanner-grading.yml (Settings > Bots time) or the page's "Sync now".
//
// Secrets: same as zenplanner-followup.mjs (ZP_USERNAME, ZP_PASSWORD, BOT_EMAIL, BOT_PASSWORD).
// Local test (nothing saved): DRY_RUN=1 node --env-file=automation/.env automation/zenplanner-grading.mjs

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { STUDIO, env, studioFrame, exportCsv, withZenPlanner } from './zenplanner.mjs';

const { fuParseTable, fuIso } = createRequire(import.meta.url)('../js/followUpCore.js');
const { gradingFromExport, gradingBlueZoneKeys } = createRequire(import.meta.url)('../js/gradingCore.js');

// The user's saved grid (Students in the two grading programs), filters double-encoded as Zen Planner expects.
const GRID = 'zenplanner/studio/personProgram/index.cfm?%255Fo1=is&%255Fv1=STUDENT&%255Fo2=is%2520one%2520of&%255Ff1=status'
  + '&%255Fw=Grid&%255Fv2=43A07BEC%252D25FB%252D4EF4%252D963C%252DD5D37D330F5D%252C9AB7B5A5%252DBFDE%252D4580%252D8662%252D418940050548'
  + '&%255Ff2=programId&%255Fc=firstName%252ClastName%252Cage%252CprogramId%252Cstatus%252CrankId%252CattendanceSinceSignupDate'
  + '%252CattendanceSinceLastPromotionalTest%252CnextRankAttendancePassed%252ClastPromotionalTestDate&BOOKMARKID=1BD860C2%252D0645%252D4548%252D8739%252D0F299EA3D3C9';

async function main() {
  const text = await withZenPlanner(async (page, step) => {
    step('student programs grid');
    await page.goto(`${STUDIO}#/main/iframe/${GRID}`);
    return exportCsv(page, await studioFrame(page, url => url.includes('/personProgram/index.cfm')), 'grading');
  });

  const rows = gradingFromExport(text, fuParseTable, fuIso);
  if (process.env.DRY_RUN) {
    const header = fuParseTable(text, 'first_name')?.[0];
    console.log('Columns:', header ? Object.keys(header).join(', ') : '(no "First Name" column)');
    const count = key => Object.entries(rows.reduce((all, row) => ({ ...all, [row[key]]: (all[row[key]] || 0) + 1 }), {}));
    console.log(`DRY_RUN: ${rows.length} students. Programs:`, count('program'), 'Ranks:', count('rank'));
    return;
  }
  // A near-empty export is more likely a Zen Planner hiccup than everyone leaving: keep what's on file.
  if (rows.length < 20) throw new Error(`Only ${rows.length} students exported; nothing changed.`);

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL').trim(), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

  // Blue Zone Fitness members (Current or Hold, from the nightly memberships list) are left out.
  const { data: blueZone, error: blueZoneError } = await supabase.from('membership_all')
    .select('first_name, last_name, membership_label, mbr_status').ilike('membership_label', '%blue zone%').in('mbr_status', ['CURRENT', 'HOLD']);
  if (blueZoneError) throw new Error(`Blue Zone list not read, nothing changed: ${blueZoneError.message}`);
  const exempt = gradingBlueZoneKeys(blueZone);
  const kept = rows.filter(row => !exempt.has(row.member_key));

  const syncedAt = new Date().toISOString();
  const { error } = await supabase.from('grading_members').upsert(kept.map(row => ({ ...row, synced_at: syncedAt })), { onConflict: 'member_key,program' });
  if (error) throw new Error(`Not saved: ${error.message}`);
  // Students no longer in the grid (graded out of the program, left, changed status, Blue Zone) drop off.
  const { error: removeError } = await supabase.from('grading_members').delete().lt('synced_at', syncedAt);
  console.log(`Saved ${kept.length} students (${rows.length - kept.length} Blue Zone left out)${removeError ? `; old rows not removed: ${removeError.message}` : ''}.`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
