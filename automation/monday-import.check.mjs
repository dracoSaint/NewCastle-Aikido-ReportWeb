// Self-check for js/mondayImportCore.js: `node automation/monday-import.check.mjs`.
// Runs before the weekly job: counts come out right, and a second import in the same week
// refreshes that week without archiving this week's list over last week's.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { mondayImportCsv } = createRequire(import.meta.url)('../js/mondayImportCore.js');

// Stand-in for the Supabase client: records writes, and answers selects from `tables`.
function fakeClient(tables) {
  const writes = [];
  const client = {
    from(table) {
      let op = 'select';
      const query = {
        select: () => query, eq: () => query, neq: () => query, in: () => query,
        delete: () => { op = 'delete'; return query; },
        insert: () => { op = 'insert'; return query; },
        update: () => { op = 'update'; return query; },
        then: resolve => { if (op !== 'select') writes.push(`${op} ${table}`); resolve({ data: op === 'select' ? tables[table] || [] : null, error: null }); }
      };
      return query;
    }
  };
  return { client, writes };
}

const csv = [
  '"Number","First Name","Last Name","Membership Label","Mbr. Status","Mbr. Create Date","Mbr. Begin Date","Mbr. End Date","Att. Limit","Att. Limit Type","People (count)","Autopay?"',
  '"1","Amy","Adams","Regular Adult","CURRENT","01/01/2026","01/01/2026","","","","1","ON"',
  '"2","Bob","Brown","Regular Adult","HOLD","01/01/2026","01/01/2026","","","","1","ON"',
  '"3","Cat","Cole","Regular Adult","CURRENT","01/01/2026","01/01/2026","","","","1","ON"',
  '"4","Cat","Cole","Chiisai Kai Beginners Package","CURRENT","01/10/2026","01/10/2026","","","","1","ON"'
].join('\n');

// New week: archive last week, replace the list, save counts. Cat keeps only the beginner package.
const fresh = fakeClient({ membership_data: [{ number: '9' }] });
const rows = await mondayImportCsv(fresh.client, csv, '2026-10-12');
assert.equal(rows.length, 3);
assert.ok(fresh.writes.includes('insert membership_data_log'), 'new week archives last week');
assert.equal(fresh.writes.at(-1), 'insert membership_weekly_log');

// Same week again: no archive, the week's old counts are replaced.
const again = fakeClient({ membership_data: [{ number: '1' }], membership_weekly_log: [{ id: 5 }] });
await mondayImportCsv(again.client, csv, '2026-10-12');
assert.ok(!again.writes.some(write => write.includes('membership_data_log') || write.includes('membership_data_previous')), 'same week does not archive');
assert.deepEqual(again.writes.slice(-2), ['delete membership_weekly_log', 'insert membership_weekly_log']);
console.log('mondayImportCore: ok');
