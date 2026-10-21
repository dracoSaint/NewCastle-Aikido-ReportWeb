// Check for js/gradingCore.js (Grading report rules). Run: node automation/grading-core.check.mjs
// Expected values are the old Grading Report sheet's, on 21 Oct 2026 (7 Nov = 2 weeks left, 1 Jan = 10).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { gradingStatus, gradingFromExport, gradingRankKey, gradingIncluded, gradingOneProgram } = require('../js/gradingCore.js');
const { fuParseTable, fuIso } = require('../js/followUpCore.js');

const dates = [
  { test_group: 'adults-1', test_date: '2026-11-07' },
  { test_group: 'adults-2', test_date: '2027-01-01' },
  { test_group: 'juniors-1', test_date: '2026-11-07' }
];
const ranks = [
  { program: 'adults', rank: 'Unranked', sort_order: 1, req_hours: 25, test_group: 'adults-1' },
  { program: 'adults', rank: '6th Kyu', sort_order: 2, req_hours: 50, test_group: 'adults-1' },
  { program: 'adults', rank: '4th Kyu', sort_order: 4, req_hours: 100, test_group: 'adults-2' },
  { program: 'adults', rank: 'Yondan', sort_order: 11, req_hours: null, test_group: 'adults-2' },
  { program: 'juniors', rank: 'Red Belt', sort_order: 1, req_hours: 20, test_group: 'juniors-1' },
  { program: 'juniors', rank: '10th Kyu Red White Belt', sort_order: 2, req_hours: 25, test_group: 'juniors-1' }
];
const today = '2026-10-21';
const member = (program, rank, since) => ({ program, rank, att_since_test: since });

// Vinay: Unranked, 0 of 25, 2 weeks left -> 13 a week. David: 1 of 25 -> 12.
assert.equal(gradingStatus(member('adults', 'Unranked', 0), ranks, dates, today).weeklyGoal, 13);
assert.equal(gradingStatus(member('adults', 'Unranked', 1), ranks, dates, today).weeklyGoal, 12);
// Zoe: Red Belt, 0 of 20 -> 10. Nathan: 10th kyu (lower-case in Zen Planner), 5 of 25 -> 10.
assert.equal(gradingStatus(member('juniors', 'Red Belt', 0), ranks, dates, today).weeklyGoal, 10);
assert.equal(gradingStatus(member('juniors', '10th kyu Red White Belt', 5), ranks, dates, today).weeklyGoal, 10);
// Liam: 6th Kyu, 51 of 50 -> eligible, no goal.
const liam = gradingStatus(member('adults', '6th Kyu', 51), ranks, dates, today);
assert.equal(liam.eligible, true);
assert.equal(liam.weeklyGoal, null);
// 4th Kyu tests on 1 Jan: 10 weeks left.
assert.equal(gradingStatus(member('adults', '4th Kyu', 0), ranks, dates, today).weeksLeft, 10);
// Yondan: no hours needed -> never eligible, no goal. Unknown rank -> flagged.
assert.equal(gradingStatus(member('adults', 'Yondan', 500), ranks, dates, today).eligible, false);
assert.equal(gradingStatus(member('adults', 'Purple Belt', 5), ranks, dates, today).rankFound, false);
// Testing date passed: no weeks left or goal.
assert.equal(gradingStatus(member('adults', 'Unranked', 0), ranks, dates, '2026-11-08').weeklyGoal, null);
assert.equal(gradingRankKey(' 8th Kyu  Yellow-White Belt '), '8th kyu yellow white belt');

// Export -> rows (Zen Planner's grid headers as of Oct 2026).
const csv = '"First Name","Last Name","Age","Program","Program Status","Rank","Att. Total","Att. Since Test","Enough Att. For Rank?","Last Test Date"\n'
  + '"Aaron","Cannon","45","Regular Adult","Student","Unranked","25","25","No","31/08/2026"\n'
  + '"Zoe","Tse","16","Juniors","Student","Red Belt","","0","No","21/09/2026"\n';
const [aaron, zoe] = gradingFromExport(csv, fuParseTable, fuIso);
assert.deepEqual(
  { key: aaron.member_key, program: aaron.program, rank: aaron.rank, total: aaron.att_total, since: aaron.att_since_test, passed: aaron.rank_attendance_passed, last: aaron.last_test_date },
  { key: 'aaron cannon', program: 'adults', rank: 'Unranked', total: 25, since: 25, passed: false, last: '2026-08-31' }
);
assert.deepEqual([zoe.program, zoe.att_total, zoe.att_since_test], ['juniors', null, 0]);
// Left out: Blue Zone Fitness, and juniors aged 17 or more (no age = kept).
assert.equal(gradingIncluded({ program: 'adults', program_name: 'Blue Zone Fitness', age: 40 }), false);
assert.equal(gradingIncluded({ program: 'juniors', program_name: 'Juniors', age: 17 }), false);
assert.equal(gradingIncluded({ program: 'juniors', program_name: 'Juniors', age: 16 }), true);
assert.equal(gradingIncluded({ program: 'juniors', program_name: 'Juniors', age: null }), true);
assert.equal(gradingIncluded({ program: 'adults', program_name: 'Regular Adult', age: 70 }), true);
// In both programs and under 17 (or no age): Juniors only. Adult-only under-17s and 17+ stay.
const dual = gradingOneProgram([
  { member_key: 'kid', program: 'juniors', age: 14 }, { member_key: 'kid', program: 'adults', age: 14 },
  { member_key: 'noage', program: 'juniors', age: null }, { member_key: 'noage', program: 'adults', age: null },
  { member_key: 'teen', program: 'adults', age: 16 },
  { member_key: 'adult', program: 'adults', age: 30 }
]);
assert.deepEqual(dual.map(row => row.member_key + ':' + row.program), ['kid:juniors', 'noage:juniors', 'teen:adults', 'adult:adults']);
console.log('grading-core check passed');
