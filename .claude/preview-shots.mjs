// Usage (with `npm start` running): node .claude/preview-shots.mjs .claude/shots [width] [height]
// Env: ONLY=home,monday (subset)  WAIT=ms  FULL=0 (viewport only)  EVAL="js expr" (print result per page)
// Drives local Chrome over CDP, plants a fake Supabase session so auth-gated pages render (layout only:
// data calls fail without a real login), screenshots each page and prints console errors.
// With .claude/preview.env (PREVIEW_EMAIL/PREVIEW_PASSWORD, gitignored) it logs in for real instead.
// Logged in = live Supabase data: only view pages, never click save/delete/import.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [outDir = 'shots', width = '1440', height = '900'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const BASE = 'http://127.0.0.1:8000/';
const PAGES = {
  login: 'pages/login.html',
  home: 'index.html',
  grading: 'pages/REPORTs/GradingReport.html',
  monday: 'pages/REPORTs/MondayBoardReport.html',
  attendance: 'pages/REPORTs/AttendanceReport.html',
  pastdue: 'pages/REPORTs/PastDueMembers.html',
  sop: 'pages/SOPs/SOPDocuments.html?sop=billing-account-query',
  profile: 'pages/profile.html',
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
await send('Emulation.setDeviceMetricsOverride', { width: +width, height: +height, deviceScaleFactor: 1, mobile: +width < 600 });
const TOKEN_KEY = 'sb-knnzybqudpdxhddcaxcv-auth-token';
let session = JSON.stringify({
  access_token: 'local-preview', refresh_token: 'local-preview', token_type: 'bearer',
  expires_in: 3600, expires_at: 4102444800,
  user: { id: '00000000-0000-0000-0000-000000000000', email: 'preview@example.com', user_metadata: { full_name: 'Preview User' } },
});

// Real login when .claude/preview.env (gitignored) has PREVIEW_EMAIL / PREVIEW_PASSWORD.
const envFile = new URL('./preview.env', import.meta.url);
if (existsSync(envFile)) {
  const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).map(l => l.match(/^\s*(\w+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]));
  await send('Page.navigate', { url: BASE + 'pages/register-error.html' });
  await sleep(600);
  await send('Runtime.evaluate', { expression: 'localStorage.clear()' });
  await send('Page.navigate', { url: BASE + 'pages/login.html' });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: `document.getElementById('email').value=${JSON.stringify(env.PREVIEW_EMAIL)};document.getElementById('password').value=${JSON.stringify(env.PREVIEW_PASSWORD)};document.getElementById('loginForm').requestSubmit()` });
  await sleep(5000);
  const real = (await send('Runtime.evaluate', { expression: `localStorage.getItem('${TOKEN_KEY}')`, returnByValue: true })).result.result.value;
  if (real) { session = real; console.log('logged in as preview user'); } else console.log('LOGIN FAILED, using fake session');
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
  const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify({u: location.pathname, h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth})', returnByValue: true });
  const info = JSON.parse(result.result.value);
  if (process.env.EVAL) console.log('EVAL', (await send('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true })).result.result.value);
  const full = process.env.FULL !== '0';
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full,
    clip: { x: 0, y: 0, width: +width, height: full ? Math.min(info.h, 6000) : +height, scale: 1 } });
  writeFileSync(join(outDir, `${name}-${width}.png`), Buffer.from(shot.result.data, 'base64'));
  console.log(`${name}: ${info.u} h=${info.h} scrollW=${info.sw}${info.sw > +width ? ' (H-OVERFLOW)' : ''}${logs.length ? '\n   ' + [...new Set(logs)].slice(0, 6).join('\n   ') : ''}`);
}
ws.close(); chrome.kill();
