// Zen Planner browser steps shared by the Zen Planner jobs (zenplanner-followup.mjs, zenplanner-pastdue.mjs).
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

export const STUDIO = 'https://studio.zenplanner.com/zenplanner/studio/index.html';
export const OUT = 'automation-output';

export const env = name => {
  if (!process.env[name]) throw new Error(`Missing ${name}. Add it under GitHub repository secrets.`);
  return process.env[name];
};

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

// 7 am jobs are scheduled at 20:00 and 21:00 UTC (7 am Sydney in daylight saving and outside it);
// true for the scheduled run that is not 7 am in Sydney. Manual runs (no SCHEDULE) always go.
export function wrongDaylightSavingRun() {
  if (!process.env.SCHEDULE) return false;
  const offset = 31 - Number(process.env.SCHEDULE.split(' ')[1]); // 20 -> +11, 21 -> +10
  const zone = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find(part => part.type === 'timeZoneName').value;
  return zone !== `GMT+${offset}`;
}

export const sydneyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });

// Zen Planner pages load in an inner frame (beside a support-chat frame); wait for the one we want.
export async function studioFrame(page, test) {
  for (let i = 0; i < 120; i++) {
    const frame = page.frames().find(f => f !== page.mainFrame() && f.url().startsWith('https://studio.zenplanner.com/') && test(f.url()));
    if (frame) return frame;
    await page.waitForTimeout(500);
  }
  throw new Error('page did not load');
}

// Fetch a page's CSV export (the address behind its download icon > "CSV" link) with the
// signed-in session, and keep a copy in automation-output/<file>.csv.
export async function exportCsv(page, frame, file) {
  const link = frame.locator('a[href*="export=CSV"]').first();
  await link.waitFor({ state: 'attached', timeout: 60000 });
  const response = await page.context().request.get(new URL(await link.getAttribute('href'), frame.url()).href);
  const text = await response.text();
  if (!response.ok() || !text.includes('","')) throw new Error(`CSV export failed (HTTP ${response.status()})`);
  await writeFile(`${OUT}/${file}.csv`, text);
  return text;
}

// Open a saved report from its category list (HOME > category) and fetch its CSV export.
export async function exportSavedReport(page, { category, name, file }) {
  await page.goto(`${STUDIO}#/main/iframe/zenplanner/studio/welcome/index-reports.cfm?Category=${category}`);
  const list = await studioFrame(page, url => url.includes('/welcome/index-reports.cfm'));
  await list.getByText(name, { exact: true }).first().click({ timeout: 60000 });
  return exportCsv(page, await studioFrame(page, url => !url.includes('/welcome/index-reports.cfm')), file);
}

// Saved "Members > MEMBERSHIP REPORT (CURRENT/HOLD)", used by the follow-up and Monday report jobs.
export const MEMBERSHIP_REPORT = { category: 'Members', name: 'MEMBERSHIP REPORT (CURRENT/HOLD)', file: 'membership' };

// Sign in, then run work(page, setStep). On failure, leave a screenshot of the visible screen only
// for the workflow artifacts, so selectors can be fixed. No page HTML: it would hold member data.
export async function withZenPlanner(work) {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ acceptDownloads: true, timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  // Pendo (Zen Planner's in-app tours) pops a lightbox over the page that blocks clicks. Never load it.
  await page.context().route(/\bpendo/i, route => route.abort());
  let step = 'signing in';
  try {
    await signIn(page);
    return await work(page, name => { step = name; });
  } catch (error) {
    await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
    throw new Error(`Zen Planner, ${step}: ${error.message}`);
  } finally {
    await browser.close();
  }
}
