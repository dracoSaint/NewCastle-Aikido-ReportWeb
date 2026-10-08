// Self-check for js/pastDueCore.js: `node automation/pastdue-core.check.mjs`.
// Runs before the daily job, so a broken rule never writes bad bills.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { pastDueImportBatch } = createRequire(import.meta.url)('../js/pastDueCore.js');

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
console.log('pastDueCore: ok');
