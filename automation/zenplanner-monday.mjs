// Weekly job: export Zen Planner's saved "Members > MEMBERSHIP REPORT (CURRENT/HOLD)" and import it
// into the Monday report, exactly as the page's "Upload CSV" does, dated today (Sydney). Run by
// .github/workflows/zenplanner-monday.yml every Monday at 7 am Newcastle time, or the page's "Sync data".
//
// Secrets: same as zenplanner-followup.mjs (ZP_USERNAME, ZP_PASSWORD, BOT_EMAIL, BOT_PASSWORD).
// Local test (nothing saved): DRY_RUN=1 node --env-file=automation/.env automation/zenplanner-monday.mjs

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { env, exportSavedReport, withZenPlanner, wrongDaylightSavingRun, sydneyToday, MEMBERSHIP_REPORT } from './zenplanner.mjs';

const { parseUploadedCsv, normalizeMembershipCsvRow, dedupeImportedMemberRows, buildWeeklySummaryLogFromRows, mondayImportCsv }
  = createRequire(import.meta.url)('../js/mondayImportCore.js');

async function main() {
  if (wrongDaylightSavingRun()) {
    console.log('Not 7 am in Newcastle (the other daylight-saving run). Nothing to do.');
    return;
  }
  const reportDate = sydneyToday();
  const text = await withZenPlanner(async (page, step) => {
    step(MEMBERSHIP_REPORT.name);
    return exportSavedReport(page, MEMBERSHIP_REPORT);
  });

  if (process.env.DRY_RUN) {
    const rows = dedupeImportedMemberRows(parseUploadedCsv(text).map(normalizeMembershipCsvRow).filter(row => row.number || row.first_name || row.last_name));
    const { members_total, beginner_totals } = buildWeeklySummaryLogFromRows(rows);
    console.log(`DRY_RUN ${reportDate}: ${rows.length} memberships; members total ${members_total}, beginners ${beginner_totals}; nothing saved.`);
    return;
  }

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL').trim(), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

  const rows = await mondayImportCsv(supabase, text, reportDate);
  const { members_total, beginner_totals } = buildWeeklySummaryLogFromRows(rows);
  console.log(`Monday report ${reportDate}: ${rows.length} memberships imported; members total ${members_total}, beginners ${beginner_totals}.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
