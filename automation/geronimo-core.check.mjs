// Check for js/geronimoCore.js gmMemberFacts (Geronimo sales and rollovers). Run: node automation/geronimo-core.check.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { gmMemberFacts, gmFriday, gmWavePeople, gmWaveMerge, gmWaveRollovers } = createRequire(import.meta.url)('../js/geronimoCore.js');

const row = (number, first, label, made, begin, end, report) => ({
  number, first_name: first, last_name: 'Test', membership_label: label, mbr_status: 'CURRENT',
  mbr_create_date: made, mbr_begin_date: begin, mbr_end_date: end, report_date: report
});
const rows = [
  row('1', 'Old', 'Regular Adult', '2025-01-01', '2025-01-01', '2026-12-31', '2026-09-07'),            // on the oldest list: not a sale
  row('2', 'Ann', 'BECOME - 6 Week transformation journey', '2026-09-10', '2026-09-12', '2026-10-24', '2026-09-14'),
  row('3', 'Ann', 'Beginner Adult', '2026-10-20', '2026-09-12', '2027-09-12', '2026-10-26'),          // new number, backdated begin: rollover
  row('4', 'Ann', 'Regular Adult', '2026-12-01', '2026-12-01', '2027-12-01', '2026-12-07'),           // promotion: not counted again
  row('5', 'Bob', 'Junior Beginner Package', '2026-09-20', '2026-09-21', '2026-11-02', '2026-09-21'), // no rollover yet
  row('6', 'Cat', '8-14 Junior Member', '2026-09-15', '2026-10-01', '2027-10-01', '2026-09-21'),      // direct join: sale on its create date
  row('7', 'Dan', 'Beginner Adult', '2026-09-16', '2026-09-16', '2027-09-16', '2026-09-21'),          // BECOME before the lists: rollover
  row('8', 'Eve', 'Gratis Training', '2026-09-17', '2026-09-17', '2027-09-17', '2026-09-21')          // Gratis: never a sale
];
const facts = gmMemberFacts(rows);

assert.equal(facts.historyStart, '2026-09-07');
assert.equal(facts.packages.length, 2);
assert.equal(facts.packages.find(item => item.first_name === 'Ann').rolledOn, '2026-10-20');
assert.equal(facts.packages.find(item => item.first_name === 'Bob').rolledOn, null);
assert.deepEqual(facts.sales.map(item => [item.label, item.on]), [['8-14 Junior Member', '2026-09-15']]);
assert.deepEqual(facts.rollovers.sort(), ['2026-09-16', '2026-10-20']);
assert.equal(gmFriday('2026-10-17'), '2026-10-23'); // Saturday belongs to the week ending the next Friday
assert.equal(gmFriday('2026-10-23'), '2026-10-23');
// Waves: one row per person (first beginner package); doubled-up rows merge into the first package's row.
const key = row => `${row.first_name} ${row.last_name}`.toLowerCase();
const people = gmWavePeople([
  { number: '4362', first_name: 'Camilla', last_name: 'Smith', mbr_begin_date: '2026-07-03' },
  { number: '4361', first_name: 'Camilla', last_name: 'Smith', mbr_begin_date: '2026-07-18' },
  { number: '4400', first_name: 'Ann', last_name: 'Lee', mbr_begin_date: '2026-08-01' }
], key);
assert.deepEqual(people.map(list => [list[0].number, list.length]), [['4362', 2], ['4400', 1]]);
const merge = gmWaveMerge([
  { id: 1, wave_month: '2026-07-01', member_number: '4361', first_name: 'Camilla', last_name: 'Smith', induction_date: '2026-07-18', phone: '0400', notes: 'Keen', goal: null, rolled_over: true, inducted: true },
  { id: 2, wave_month: '2026-07-01', member_number: '4362', first_name: 'Camilla', last_name: 'Smith', induction_date: '2026-07-03', phone: null, notes: 'Called', goal: 'Fitness', rolled_over: null, inducted: false },
  { id: 3, wave_month: '2026-08-01', member_number: '4400', first_name: 'Ann', last_name: 'Lee', induction_date: '2026-08-01', notes: null, rolled_over: null, inducted: false }
], key, [{ wave_month: '2026-07-01', member_number: '4362', first_name: 'Camilla', last_name: 'Smith' }, { wave_month: '2026-08-01', member_number: '4400', first_name: 'Ann', last_name: 'Lee' }]);
assert.deepEqual(merge.keep.map(row => row.id), [2, 3]);           // the first package's row is kept
assert.deepEqual(merge.removals, [1]);
assert.deepEqual(merge.merges.get(2), { phone: '0400', notes: 'Called / Keen', rolled_over: true, inducted: true });
// Rollovers from the wave list: counted the week the full membership began (or the trial ended, if marked by hand);
// rollover % = of trials ending that week, the share marked Yes (blank = not counted).
const waves = [
  { member_number: '1', first_name: 'Ann', last_name: 'A', induction_date: '2026-09-01', rolled_over: true },
  { member_number: '2', first_name: 'Bo', last_name: 'B', induction_date: '2026-09-01', rolled_over: false },
  { member_number: '3', first_name: 'Cy', last_name: 'C', induction_date: '2026-09-01', rolled_over: true },
  { member_number: '4', first_name: 'Di', last_name: 'D', induction_date: '2026-09-01', rolled_over: null }
];
const list = [
  { number: '1', first_name: 'Ann', last_name: 'A', membership_label: 'BECOME - 6 Week transformation journey', mbr_begin_date: '2026-09-01', mbr_end_date: '2026-10-14' },
  { number: '9', first_name: 'Ann', last_name: 'A', membership_label: 'Beginner Adult', mbr_begin_date: '2026-10-15' },
  { number: '2', first_name: 'Bo', last_name: 'B', membership_label: 'BECOME - 6 Week transformation journey', mbr_begin_date: '2026-09-01', mbr_end_date: '2026-10-13' },
  { number: '3', first_name: 'Cy', last_name: 'C', membership_label: 'BECOME - 6 Week transformation journey', mbr_begin_date: '2026-09-01', mbr_end_date: '2026-10-16' },
  { number: '4', first_name: 'Di', last_name: 'D', membership_label: 'BECOME - 6 Week transformation journey', mbr_begin_date: '2026-09-01', mbr_end_date: '2026-10-12' }
];
// Week Sat 10 Oct - Fri 16 Oct: Ann joined 15 Oct, Cy marked Yes by hand (trial ended 16 Oct); 3 decided trials ended, 2 Yes.
assert.deepEqual(gmWaveRollovers(waves, list, '2026-10-10', '2026-10-16', '2026-10-21'), { rollovers: 2, rollover_pct: 0.667 });
assert.deepEqual(gmWaveRollovers(waves, list, '2026-10-10', '2026-10-16', '2026-10-14'), { rollovers: 0, rollover_pct: 0.5 }); // 14 Oct: Bo (No) and Ann (Yes) ended; Ann's membership starts 15 Oct
assert.deepEqual(gmWaveRollovers(waves, list, '2026-10-17', '2026-10-23', '2026-10-21'), { rollovers: 0, rollover_pct: null });
console.log('geronimo-core check passed');
