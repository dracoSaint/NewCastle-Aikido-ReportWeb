// Self-check for js/pastDueCore.js: `node automation/pastdue-core.check.mjs`.
// Runs before the daily job, so a broken rule never writes bad bills.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { pastDueImportBatch, pastDueSopFollowUp, pastDueMemberFollowUp, pastDueOpenMembers } = createRequire(import.meta.url)('../js/pastDueCore.js');

// Due Thu 8 Oct 2026. Each note moves the follow-up to the next SOP step, on a Mon/Wed/Fri.
assert.deepEqual(pastDueSopFollowUp('2026-10-08', null), { date: '2026-10-12', step: 'Retry debit' });
assert.deepEqual(pastDueSopFollowUp('2026-10-08', '2026-10-12'), { date: '2026-10-14', step: 'Stage 1: retry debit' });
assert.deepEqual(pastDueSopFollowUp('2026-10-08', '2026-10-14'), { date: '2026-10-16', step: 'Stage 2: retry debit, send reminder' });
assert.deepEqual(pastDueSopFollowUp('2026-10-08', '2026-10-16'), { date: '2026-10-23', step: 'Stage 3: invoice via Engage, flag to Darius' });
assert.deepEqual(pastDueSopFollowUp('2026-10-08', '2026-10-23'), { date: '2026-10-30', step: 'Stage 3: invoice via Engage, flag to Darius' });
assert.equal(pastDueSopFollowUp('2026-10-08', '2026-10-01').date, '2026-10-12', 'a note before the due date is ignored');
assert.equal(pastDueSopFollowUp(null, null), null);

// Zen Planner's Bills list export: a blank first line, then the header.
const batch = pastDueImportBatch([
  '',
  '"Bill Type","First Name","Last Name","Bill #","Income Category","Status","Due Date","Amount Due","Amount Unpaid","Autopay?","Autopay Account"',
  '"Bill","Amy","Adams","47741","Kids 4-7","Unpaid","08/10/2026","$1,045.00","$45.00","Yes",""',
  '"Bill","Amy","Adams","47741","Kids 4-7","Unpaid","08/10/2026","$45.00","$45.00","Yes",""',
  '"Bill","No","Number","","Adult","Unpaid","08/10/2026","$45.00","$45.00","No",""',
  '"Bill","Bob","Brown","47742","Adult","Unpaid","1/9/26","$90.00","$30.00","No",""'
].join('\r\n'), '2026-10-09');

assert.equal(batch.length, 2, 'duplicate bill and bill without a number are dropped');
assert.deepEqual(
  batch.map(({ member_key, member_name, member_number, due_date, amount_due, amount, status, imported_at }) =>
    ({ member_key, member_name, member_number, due_date, amount_due, amount, status, imported_at })),
  [
    { member_key: '47741', member_name: 'Amy Adams', member_number: '47741', due_date: '2026-10-08', amount_due: 1045, amount: 45, status: 'PAST DUE', imported_at: '2026-10-09T12:00:00.000Z' },
    { member_key: '47742', member_name: 'Bob Brown', member_number: '47742', due_date: '2026-09-01', amount_due: 90, amount: 30, status: 'PAST DUE', imported_at: '2026-10-09T12:00:00.000Z' }
  ]
);
// Follow-up: a staff date holds until a note on or after it; escalated pauses; else the SOP.
const bill = { due_date: '2026-10-01', status: 'PAST DUE' };
assert.deepEqual(pastDueMemberFollowUp([{ ...bill, next_follow_up: '2026-10-22' }], '2026-10-20', '2026-10-20'), { date: '2026-10-22', step: 'Set by staff' });
assert.equal(pastDueMemberFollowUp([{ ...bill, next_follow_up: '2026-10-22' }], '2026-10-22', '2026-10-22').step === 'Set by staff', false);
assert.deepEqual(pastDueMemberFollowUp([{ ...bill, escalated_to_darius: true }], null, '2026-10-20'), { date: null, step: 'With Darius' });
assert.equal(pastDueMemberFollowUp([bill], null, '2026-10-20').date, pastDueSopFollowUp('2026-10-01', null).date);
// Open members: exempt left out, grouped by name, only PAST DUE bills kept.
const open = pastDueOpenMembers([
  { member_key: '1', member_name: 'Amy Adams', amount: 10, status: 'PAST DUE' },
  { member_key: '2', member_name: 'amy  adams', amount: 5, status: 'CLEARED' },
  { member_key: '3', member_name: 'Bob Brown', amount: 7, status: 'CLEARED' },
  { member_key: '4', member_name: 'Cat Cole', amount: 9, status: 'PAST DUE' }
], [{ member_key: '4' }]);
assert.deepEqual(open.map(member => [member.member_name, member.bills.length]), [['Amy Adams', 1]]);
console.log('pastDueCore: ok');
