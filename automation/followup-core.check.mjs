// Self-check for js/followUpCore.js: `node automation/followup-core.check.mjs`.
// Runs before the weekly job, so a broken rule never produces a report.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { fuAttendanceFromText, fuMembershipsFromText, fuNextReport, fuBuild, fuPhone } = createRequire(import.meta.url)('../js/followUpCore.js');

const attendance = fuAttendanceFromText([
  'Attendance Report,,,,',
  'Name,Phone,Status,Days Since Att.,Last Att. Date',
  'Amy Active,412345678.0,Active,1,05/10/2026',
  'Olly Orange,412345678,Active,99,30/09/2026',
  'Ruth Red, 61412345678 ,Active,3,20/09/2026',
  'Gina Gratis,0400000000,Active,,01/09/2026',
  'Hank Hold,0400000001,Active,,',
  'Bob Both,0400000002,Active,,25/09/2026',
  'Nina None,0400000003,Active,,',
  'Pat Past,0400000004,Active,,23/09/2026',
  'Hal ActiveHold,0400000005,Active,,06/10/2026'
].join('\n'));
const memberships = fuMembershipsFromText([
  'First Name,Last Name,Membership Label,Mbr. Status,Mbr. Begin Date,Mbr. End Date',
  'Gina,Gratis,Gratis Training,CURRENT,01/01/2026,01/01/2027',
  'Hank,Hold,Regular Adult,HOLD,01/02/2026,01/02/2027',
  'Bob,Both,Gratis Training,HOLD,01/03/2026,',
  'Pat,Past,Regular Adult,HOLD,01/01/2025,01/01/2026',
  'Pat,Past,Regular Adult,CURRENT,01/01/2026,01/01/2027',
  'Ruth,Red,Regular Adult,CANCELED,01/05/2026,01/05/2027',
  'Ruth,Red,Regular Adult,CURRENT,01/05/2026,01/05/2027',
  'Hal,ActiveHold,Regular Adult,HOLD,01/01/2026,'
].join('\n'));

const base = { notes: { 'olly orange': 'Sick', 'amy active': 'Trained last night, not sure why on list' } };
const report = fuNextReport(base, { attendance, memberships, report_date: '2026-10-07' });
const r = fuBuild(report);
const names = list => list.map(row => `${row.name}:${row.days}`);

assert.deepEqual(names(r.orange), ['Olly Orange:7']);
assert.deepEqual(names(r.red), ['Pat Past:14', 'Ruth Red:17']);          // newest record CURRENT wins; tie -> CURRENT
assert.deepEqual(names(r.none), ['Nina None:null']);
assert.deepEqual(r.excluded.map(row => row.reason), ['Gratis Training member, on HOLD', 'Gratis Training member', 'Membership on HOLD']);
assert.deepEqual(report.notes, { 'olly orange': 'Sick' });              // resolved note dropped
assert.equal(fuPhone('412345678.0'), '0412345678');
assert.equal(fuPhone(' 61412345678 '), '+61412345678');
console.log('followUpCore rules: OK');
