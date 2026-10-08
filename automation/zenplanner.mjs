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

// Sign in, then run work(page, setStep). On failure, leave a screenshot and the page for the
// workflow artifacts (no passwords are captured), so selectors can be fixed.
export async function withZenPlanner(work) {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const page = await browser.newPage({ acceptDownloads: true, timezoneId: 'Australia/Sydney', locale: 'en-AU' });
  let step = 'signing in';
  try {
    await signIn(page);
    return await work(page, name => { step = name; });
  } catch (error) {
    await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
    await writeFile(`${OUT}/failure.html`, await page.content().catch(() => '')).catch(() => {});
    throw new Error(`Zen Planner, ${step}: ${error.message}`);
  } finally {
    await browser.close();
  }
}
