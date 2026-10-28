// Guards the vendored ui-ux-pro-max skill (third-party Python, .claude/skills/): fails if any script gains
// network, shell or dynamic-code calls, or if the skill files change from the reviewed copy (upstream 28b3b8d).
// After a deliberate, reviewed update: re-read the scripts, then put the new hash printed below into EXPECTED.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.claude/skills/ui-ux-pro-max';
const EXPECTED = '0b99f3ac9ba3db2aa592587a0e08111cf947a8b059648f6864be9003a3db3676';
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.name === '__pycache__' ? [] : e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
const all = files(ROOT).sort();

const risky = /\b(subprocess|socket|urllib\.request|http\.client|requests|ftplib|smtplib)\b|os\.(system|popen|exec)|\beval\(|\bexec\(|__import__/;
for (const f of all.filter(f => f.endsWith('.py'))) {
  const hit = readFileSync(f, 'utf8').split('\n').findIndex(line => risky.test(line));
  assert.equal(hit, -1, `${f}:${hit + 1} uses network/shell/dynamic code`);
}

const hash = createHash('sha256');
// CRLF -> LF first, so git's line-ending conversion on another PC doesn't change the hash.
for (const f of all) hash.update(f.replaceAll('\\', '/')).update(readFileSync(f, 'latin1').replaceAll('\r\n', '\n'), 'latin1');
const digest = hash.digest('hex');
assert.equal(digest, EXPECTED, `skill files changed from the reviewed copy (hash ${digest})`);
console.log('skill safety check passed');
