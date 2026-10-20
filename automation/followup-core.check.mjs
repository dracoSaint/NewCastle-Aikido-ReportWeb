// Self-check for js/followUpCore.js: `node automation/followup-core.check.mjs`.
// Runs before the weekly job, so a broken rule never produces a report.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { fuAttendanceFromText, fuMembershipsFromText, fuNextReport, fuBuild, fuReturns, fuPhone } =createRequire(import.meta.url)('../js/followUpCore.js');

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

const base = { report_date: '2026-10-07', notes: { 'olly orange': 'Sick', 'amy active': 'Trained last night, not sure why on list' } };
const report = fuNextReport(base, { attendance, memberships, report_date: '2026-10-07' });
const r = fuBuild(report);
const names = list => list.map(row => `${row.name}:${row.days}`);

assert.deepEqual(names(r.orange), ['Olly Orange:7']);
assert.deepEqual(names(r.red), ['Pat Past:14', 'Ruth Red:17']);          // newest record CURRENT wins; tie -> CURRENT
assert.deepEqual(names(r.none), ['Nina None:null']);
assert.deepEqual(r.excluded.map(row => row.reason), ['Gratis Training member, on HOLD', 'Gratis Training member', 'Membership on HOLD']);
assert.deepEqual(report.notes, { 'olly orange': 'Sick' });              // same day: resolved note dropped, rest kept
assert.deepEqual(fuNextReport(base, { attendance, memberships, report_date: '2026-10-08' }).notes, {}); // new day: notes cleared
// Returned: off the list next day because they trained again, unless their membership is on HOLD.
const nextAttendance = attendance.map(person => (['Olly Orange', 'Nina None'].includes(person.name) ? { ...person, lastAtt: '2026-10-08' } : person));
const nextMemberships = [...memberships, { name: 'Nina None', label: 'Regular Adult', status: 'HOLD', begin: '2026-01-01', end: '' }];
const nextReport = fuNextReport(report, { attendance: nextAttendance, memberships: nextMemberships, report_date: '2026-10-08' });
assert.deepEqual(fuReturns(report, nextReport).map(row => `${row.member_name}:${row.tier}:${row.returned_on}`), ['Olly Orange:orange:2026-10-08']);
assert.deepEqual(fuReturns(report, report), []);
// Not returns: missing from the new export (Ruth), cancelled membership (Pat). A no-record member who trains is.
const att2 = attendance.filter(person => person.name !== 'Ruth Red').map(person => (['Pat Past', 'Nina None'].includes(person.name) ? { ...person, lastAtt: '2026-10-08' } : person));
const mem2 = [...memberships.filter(record => record.name !== 'Pat Past'), { name: 'Pat Past', label: 'Regular Adult', status: 'CANCELED', begin: '2026-01-01', end: '' }];
assert.deepEqual(fuReturns(report, fuNextReport(report, { attendance: att2, memberships: mem2, report_date: '2026-10-08' }))
  .map(row => `${row.member_name}:${row.tier}:${row.last_class_before}`), ['Nina None:none:null']);
// Removals: kept on a same-day refresh, cleared on a new day; a first report starts empty.
const withRemoved = { ...base, removed: ['ruth red'] };
assert.deepEqual(fuNextReport(withRemoved, { attendance, memberships, report_date: '2026-10-07' }).removed, ['ruth red']);
assert.deepEqual(fuNextReport(withRemoved, { attendance, memberships, report_date: '2026-10-08' }).removed, []);
assert.deepEqual(fuNextReport(null, { attendance, memberships, report_date: '2026-10-07' }).notes, {});
assert.equal(fuPhone('412345678.0'), '0412345678');
assert.equal(fuPhone(' 61412345678 '), '+61412345678');

// Settings > Report rules: bad days keep the defaults; good ones move both tiers (last, it changes them).
const { fuApplyTiers, FU_ORANGE, FU_RED } = createRequire(import.meta.url)('../js/followUpCore.js');
assert.equal(fuApplyTiers(null), false);
assert.equal(fuApplyTiers({ orange: { from: 10 }, red: { from: 10 } }), false, 'orange must start before red');
assert.deepEqual([FU_ORANGE.from, FU_ORANGE.to, FU_RED.from], [7, 13, 14]);
assert.equal(fuApplyTiers({ orange: { from: 5, owner: ' Sam ' }, red: { from: 21, owner: 'Darius' } }), true);
assert.deepEqual([FU_ORANGE.from, FU_ORANGE.to, FU_ORANGE.owner, FU_RED.from], [5, 20, 'Sam', 21]);
console.log('followUpCore rules: OK');
