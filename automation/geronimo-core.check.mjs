// Check for js/geronimoCore.js gmMemberFacts (Geronimo sales and rollovers). Run: node automation/geronimo-core.check.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { gmMemberFacts, gmFriday } = createRequire(import.meta.url)('../js/geronimoCore.js');

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
console.log('geronimo-core check passed');
