// Usage (with `npm start` running): node .claude/preview-shots.mjs .claude/shots [width] [height]
// Env: ONLY=home,monday (subset)  WAIT=ms  FULL=1 (whole page; default is the viewport, cheaper to view)
//      INIT="js" (runs before page scripts, e.g. stub data)  EVAL="js expr" (print result per page)  PRE="js" + PREWAIT=ms (run after load, e.g. click a tab)
// Drives local Chrome over CDP and screenshots each page, printing console errors.
// Signs in for real through the Supabase API with .claude/preview.env (PREVIEW_EMAIL/PREVIEW_PASSWORD,
// gitignored); without it, or if login fails, it plants a fake session (layout only: data calls fail).
// Logged in = live Supabase data: only view pages, never click save/delete/import.
// PREVIEW_AS=bot signs in as the bot (automation/.env BOT_EMAIL/BOT_PASSWORD) for pages the preview role can't open.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [outDir = 'shots', width = '1440', height = '900'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:8000/'; // BASE=http://127.0.0.1:8788/ for npm run preview (Cloudflare)
const PAGES = {
  login: 'pages/login.html',
  home: 'index.html',
  welcome: 'index.html?welcome=1',
  grading: 'pages/REPORTs/GradingReport.html',
  monday: 'pages/REPORTs/MondayBoardReport.html',
  followup: 'pages/REPORTs/FollowUpReport.html',
  pastdue: 'pages/REPORTs/PastDueMembers.html',
  pastduemember: 'pages/REPORTs/PastDueMembers.html?member=Denise%20Nguyen',
  sop: 'pages/SOPs/SOPDocuments.html?sop=billing-account-query',
  ads: 'pages/REPORTs/DailyAdReview.html',
  geronimo: 'pages/REPORTs/GeronimoMetrics.html',
  tasks: 'pages/Tasks.html',
  profile: 'pages/profile.html',
  settings: 'pages/Settings.html',
  reset: 'pages/reset-password.html',
  regerror: 'pages/register-error.html',
};
const only = process.env.ONLY?.split(',');

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9333', '--no-first-run', '--hide-scrollbars',
  `--user-data-dir=${join(tmpdir(), 'cdp-shots-profile')}`, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page'); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
if (process.env.INIT) { await send('Page.enable'); await send('Page.addScriptToEvaluateOnNewDocument', { source: process.env.INIT }); }
await send('Network.setCacheDisabled', { cacheDisabled: true }); // always load the files as edited
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: +width < 600 });
const TOKEN_KEY = 'sb-knnzybqudpdxhddcaxcv-auth-token';
let session = JSON.stringify({
  access_token: 'local-preview', refresh_token: 'local-preview', token_type: 'bearer',
  expires_in: 3600, expires_at: 4102444800,
  user: { id: '00000000-0000-0000-0000-000000000000', email: 'preview@example.com', user_metadata: { full_name: 'Preview User' } },
});

const asBot = process.env.PREVIEW_AS === 'bot';
const envFile = new URL(asBot ? '../automation/.env' : './preview.env', import.meta.url);
if (existsSync(envFile)) {
  const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).map(l => l.match(/^\s*(\w+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
  const response = await fetch('https://knnzybqudpdxhddcaxcv.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: 'sb_publishable_fPh3JNTjI5Loc32jDzhJkw_i5YHeS9l', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: (env[asBot ? 'BOT_EMAIL' : 'PREVIEW_EMAIL'] || '').trim(), password: env[asBot ? 'BOT_PASSWORD' : 'PREVIEW_PASSWORD'] || '' })
  });
  if (response.ok) { session = JSON.stringify(await response.json()); console.log('logged in as preview user'); }
  else console.log(`preview login failed (${response.status}), using fake session (layout only)`);
}

for (const [name, path] of Object.entries(PAGES)) {
  if (only && !only.includes(name)) continue;
  await send('Page.navigate', { url: BASE + 'pages/register-error.html' });
  await sleep(600);
  const seed = name === 'login' ? 'localStorage.clear()' : `localStorage.setItem('${TOKEN_KEY}', ${JSON.stringify(session)})`;
  await send('Runtime.evaluate', { expression: seed });
  logs.length = 0;
  await send('Page.navigate', { url: BASE + path });
  await sleep(+(process.env.WAIT || 3500));
  // PRE: JS to run after load (e.g. click a tab), then PREWAIT ms before capture.
  if (process.env.PRE) {
    await send('Runtime.evaluate', { expression: process.env.PRE });
    await sleep(+(process.env.PREWAIT || 3000));
  }
  const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify({u: location.pathname, h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, sy: Math.round(scrollY)})', returnByValue: true });
  const info = JSON.parse(result.result.value);
  if (process.env.EVAL) console.log('EVAL', (await send('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true })).result.result.value);
  const full = process.env.FULL === '1';
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full,
    clip: { x: 0, y: full ? 0 : info.sy, width: +width, height: full ? Math.min(info.h, 6000) : +height, scale: 1 } });
  writeFileSync(join(outDir, `${name}-${width}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log(`${name}: ${info.u} h=${info.h} scrollW=${info.sw}${info.sw > +width ? ' (H-OVERFLOW)' : ''}${logs.length ? '\n   ' + [...new Set(logs)].slice(0, 6).join('\n   ') : ''}`);
}
ws.close(); chrome.kill();
