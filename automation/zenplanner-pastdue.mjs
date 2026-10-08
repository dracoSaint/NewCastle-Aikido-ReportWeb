// Daily job: export Zen Planner's unpaid bills due today or earlier (Bills list, StatusNot=PAID,
// dueMax=today) and add new ones to the Past Due report (past_due_member_log), exactly as the page's
// "Import billing CSV" does: bills already on file are skipped. Run by
// .github/workflows/zenplanner-pastdue.yml at 7 am Newcastle time, or from the page's "Sync now" button.
//
// Secrets: same as zenplanner-followup.mjs (ZP_USERNAME, ZP_PASSWORD, BOT_EMAIL, BOT_PASSWORD).
// Local test (nothing saved): DRY_RUN=1 node --env-file=automation/.env automation/zenplanner-pastdue.mjs

import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { STUDIO, env, studioFrame, exportCsv, withZenPlanner } from './zenplanner.mjs';

const { pastDueImportBatch } = createRequire(import.meta.url)('../js/pastDueCore.js');

const BILLS = 'zenplanner/studio/bill/index.cfm?StatusNot=PAID&dueMax=today&BillType=Bill';

// The schedule fires at 20:00 and 21:00 UTC (7 am in daylight saving and outside it);
// keep only the run that is 7 am in Sydney.
function wrongDaylightSavingRun() {
  if (!process.env.SCHEDULE) return false;
  const offset = 31 - Number(process.env.SCHEDULE.split(' ')[1]); // 20 -> +11, 21 -> +10
  const zone = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find(part => part.type === 'timeZoneName').value;
  return zone !== `GMT+${offset}`;
}

async function main() {
  if (wrongDaylightSavingRun()) {
    console.log('Not 7 am in Newcastle (the other daylight-saving run). Nothing to do.');
    return;
  }
  const importDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

  const text = await withZenPlanner(async (page, step) => {
    step('unpaid bills');
    await page.goto(`${STUDIO}#/main/iframe/${BILLS}`);
    return exportCsv(page, await studioFrame(page, url => url.startsWith(`https://studio.zenplanner.com/${BILLS.split('?')[0]}`)), 'pastdue');
  });
  const batch = pastDueImportBatch(text, importDate);
  if (!batch.length) {
    console.log('No unpaid bills in Zen Planner. Nothing to add.');
    return;
  }
  if (process.env.DRY_RUN) {
    console.log(`DRY_RUN: ${batch.length} unpaid bills found for ${importDate}; nothing saved.`);
    return;
  }

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL').trim(), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

  const { data, error } = await supabase.from('past_due_member_log')
    .upsert(batch, { onConflict: 'member_key', ignoreDuplicates: true }).select('id');
  if (error) throw error;
  console.log(`${importDate}: ${batch.length} unpaid bills in Zen Planner; ${data.length} new, ${batch.length - data.length} already on file.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
