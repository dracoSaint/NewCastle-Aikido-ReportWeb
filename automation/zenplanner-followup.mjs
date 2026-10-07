// Nightly job: download two saved Zen Planner reports, the attendance report
// ("Red/Orange Attendance (30 Days Count)") and the membership status export, and save the
// next Red / Orange Follow-Up report to the portal. Run by
// .github/workflows/zenplanner-followup.yml every night at 11:59 pm Newcastle time.
//
// Secrets (GitHub > Settings > Secrets and variables > Actions), never in code:
//   ZP_USERNAME, ZP_PASSWORD    Zen Planner staff login
//   BOT_EMAIL, BOT_PASSWORD     a portal (Supabase) user made just for this job
// Variables (same page, Variables tab):
//   ZP_REPORT_URL               the attendance report's own address (else the menus are clicked)
//   ZP_MEMBERSHIP_URL           the membership status report's own address (else the last
//                               report's membership list is reused)
//   ZP_LOGIN_URL                Zen Planner login page (optional)

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const { fuAttendanceFromText, fuMembershipsFromText, fuNextReport, fuBuild } = require('../js/followUpCore.js');

const REPORT_NAME = 'Red/Orange Attendance (30 Days Count)';
const LOGIN_URL = process.env.ZP_LOGIN_URL || 'https://studio.zenplanner.com/zenplanner/studio/index.html';
const OUT = 'automation-output';
const AUTO_ATTENDANCE = `Zen Planner auto-export (${REPORT_NAME})`;
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
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="user" i], input[id*="user" i], input[name*="login" i]').first().fill(env('ZP_USERNAME'));
  await page.locator('input[type="password"]').first().fill(env('ZP_PASSWORD'));
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first().click()
  ]);
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    throw new Error('Still on the login page after signing in: check ZP_USERNAME / ZP_PASSWORD (or a captcha / 2-step check).');
  }
}

// Open a saved report (by its address, or the staff route through the menus) and export it as CSV text.
async function exportReport(page, { url, category, name, file }) {
  if (url) {
    await page.goto(url, { waitUntil: 'networkidle' });
  } else {
    await page.getByText('Dashboard', { exact: true }).first().click().catch(() => {});
    await page.getByText(category, { exact: true }).first().click();
    await page.getByText(name, { exact: true }).first().click();
    await page.waitForLoadState('networkidle');
  }
  await page.getByText(/\d+\s*[–-]\s*\d+\s+of\s+\d+/).first().waitFor({ timeout: 60000 }); // "1 – 202 of 202"

  // The download icon sits top right, next to the "1 – 202 of 202" counter.
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.locator('[title*="download" i], [aria-label*="download" i], [title*="export" i], [aria-label*="export" i], .fa-download, [class*="download" i]').first().click()
  ]);
  const suggested = download.suggestedFilename() || `${file}.csv`;
  if (!/\.(csv|tsv|txt)$/i.test(suggested)) {
    throw new Error(`Zen Planner sent "${suggested}" for the ${name}. The job reads CSV only; choose CSV in the export options.`);
  }
  const path = `${OUT}/${file}-${suggested}`;
  await download.saveAs(path);
  return readFile(path, 'utf8');
}

async function downloadReports() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  let step = 'signing in';
  try {
    await signIn(page);
    step = 'attendance report';
    const attendanceText = await exportReport(page, { url: process.env.ZP_REPORT_URL, category: 'Attendance', name: REPORT_NAME, file: 'attendance' });
    let membershipText = null;
    if (process.env.ZP_MEMBERSHIP_URL) {
      step = 'membership status export';
      membershipText = await exportReport(page, { url: process.env.ZP_MEMBERSHIP_URL, name: 'membership status export', file: 'membership' });
    }
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
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: env('BOT_EMAIL'), password: env('BOT_PASSWORD') });
  if (signInError) throw new Error(`Portal sign-in failed for BOT_EMAIL: ${signInError.message}`);

  const { data: already } = await supabase.from('follow_up_reports').select('id')
    .eq('report_date', reportDate).eq('attendance_file', AUTO_ATTENDANCE).limit(1);
  if (already?.length && process.env.FORCE_RUN !== 'true') {
    console.log(`Report for ${reportDate} already saved (id ${already[0].id}). Nothing to do.`);
    return;
  }

  const { attendanceText, membershipText } = await downloadReports();
  const attendance = fuAttendanceFromText(attendanceText);
  const memberships = membershipText ? fuMembershipsFromText(membershipText) : null;

  // Without ZP_MEMBERSHIP_URL, Gratis / HOLD come from the latest report's membership list.
  const { data: latest, error: latestError } = await supabase.from('follow_up_reports').select('*')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw latestError;
  if (!memberships && !latest?.memberships) {
    throw new Error('No membership list yet. Set ZP_MEMBERSHIP_URL, or upload the membership status export on the portal once.');
  }

  const next = fuNextReport(latest, {
    attendance,
    attendance_file: AUTO_ATTENDANCE,
    report_date: reportDate,
    ...(memberships && { memberships, membership_file: AUTO_MEMBERSHIP })
  });
  const { data, error } = await supabase.from('follow_up_reports').insert(next).select('id').single();
  if (error) throw error;

  const result = fuBuild(next);
  console.log(`Saved report ${data.id} for ${reportDate}: ${attendance.length} attendance rows, `
    + `${memberships ? `${memberships.length} membership records` : 'membership list reused'}; `
    + `orange ${result.orange.length}, red ${result.red.length}, no record ${result.none.length}, `
    + `excluded ${result.excluded.length}; ${Object.keys(next.notes).length} notes carried over.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
