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
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const { fuAttendanceFromText, fuMembershipsFromText, fuNextReport, fuBuild } = require('../js/followUpCore.js');

const STUDIO = 'https://studio.zenplanner.com/zenplanner/studio/index.html';
// Saved reports, opened by category and name exactly as Zen Planner lists them.
const ATTENDANCE_REPORT = { category: 'Attendance', name: 'RED/ORANGE ATTENDANCE (30 DAYS COUNT)', file: 'attendance' };
const MEMBERSHIP_REPORT = { category: 'Members', name: 'MEMBERSHIP REPORT (CURRENT/HOLD)', file: 'membership' };
const OUT = 'automation-output';
const AUTO_ATTENDANCE = 'Zen Planner auto-export (Red/Orange Attendance (30 Days Count))';
const AUTO_MEMBERSHIP = 'Zen Planner auto-export (membership status)';

const env = name => {
  if (!process.env[name]) throw new Error(`Missing ${name}. Add it under GitHub repository secrets.`);
  return process.env[name];
};

// Runs at 11:59 pm Sydney. The schedule fires twice (daylight saving) and GitHub can run late,
// so accept 11 pm to 3 am Sydney time, and date the report the evening it covers.
function sydneyReportDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  if (hour >= 23) return today;
  if (hour < 3) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  return null;
}

async function signIn(page) {
  await page.goto(STUDIO, { waitUntil: 'domcontentloaded' });
  // The login form only reads typed keys (fill() leaves it empty), so type the values.
  await page.locator('input[type="email"], input[name*="user" i], input[id*="user" i], input[name*="login" i]').first().pressSequentially(env('ZP_USERNAME'));
  const password = page.locator('input[type="password"]').first();
  await password.pressSequentially(env('ZP_PASSWORD'));
  await password.press('Enter');
  if (!await password.waitFor({ state: 'hidden', timeout: 30000 }).then(() => true, () => false)) {
    throw new Error('Still on the login page after signing in: check ZP_USERNAME / ZP_PASSWORD (or a captcha / 2-step check).');
  }
}

// Zen Planner pages load in an inner frame (beside a support-chat frame); wait for the one we want.
async function studioFrame(page, test) {
  for (let i = 0; i < 120; i++) {
    const frame = page.frames().find(f => f !== page.mainFrame() && f.url().startsWith('https://studio.zenplanner.com/') && test(f.url()));
    if (frame) return frame;
    await page.waitForTimeout(500);
  }
  throw new Error('page did not load');
}

// Open a saved report from its category list and fetch its CSV export: the address behind the
// report's download icon > "CSV" link, requested with the signed-in session.
async function exportReport(page, { category, name, file }) {
  await page.goto(`${STUDIO}#/main/iframe/zenplanner/studio/welcome/index-reports.cfm?Category=${category}`);
  const list = await studioFrame(page, url => url.includes('/welcome/index-reports.cfm'));
  await list.getByText(name, { exact: true }).first().click({ timeout: 60000 });

  const report = await studioFrame(page, url => !url.includes('/welcome/index-reports.cfm'));
  const link = report.locator('a[href*="export=CSV"]').first();
  await link.waitFor({ state: 'attached', timeout: 60000 });
  const response = await page.context().request.get(new URL(await link.getAttribute('href'), report.url()).href);
  const text = await response.text();
  if (!response.ok() || !text.includes('","')) throw new Error(`CSV export failed (HTTP ${response.status()})`);
  await writeFile(`${OUT}/${file}.csv`, text);
  return text;
}

async function downloadReports() {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ acceptDownloads: true, timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  let step = 'signing in';
  try {
    await signIn(page);
    step = ATTENDANCE_REPORT.name;
    const attendanceText = await exportReport(page, ATTENDANCE_REPORT);
    step = MEMBERSHIP_REPORT.name;
    const membershipText = await exportReport(page, MEMBERSHIP_REPORT);
    return { attendanceText, membershipText };
  } catch (error) {
    // Leave a screenshot and the page for the workflow artifacts, so selectors can be fixed.
    await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${OUT}/failure.html`, await page.content().catch(() => '')).catch(() => {});
    throw new Error(`Zen Planner, ${step}: ${error.message}`);
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const reportDate = process.env.FORCE_RUN === 'true'
    ? new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
    : sydneyReportDate();
  if (!reportDate) {
    console.log('Outside the 11:59 pm Newcastle window (the other daylight-saving run). Nothing to do.');
    return;
  }

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL').trim(), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

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
