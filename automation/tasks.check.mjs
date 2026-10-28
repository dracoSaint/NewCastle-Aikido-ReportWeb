// Check for js/tasks.js repeat rules (Home page task list). Run: node automation/tasks.check.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { taskIsOn, taskDaysLate, taskUpcoming, taskOrder, taskState, taskChanges, taskReport } =createRequire(import.meta.url)('../js/tasks.js');

const task = (repeat, start_date) => ({ repeat, start_date });
// 2026-10-20 is a Tuesday.
assert.equal(taskIsOn(task('daily', '2026-10-21'), '2026-10-20'), false);        // not started yet
assert.equal(taskIsOn(task('daily', '2026-10-01'), '2026-10-20'), true);
assert.equal(taskIsOn(task('weekdays', '2026-10-01'), '2026-10-24'), false);     // Saturday
assert.equal(taskIsOn(task('weekdays', '2026-10-01'), '2026-10-20'), true);
assert.equal(taskIsOn(task('weekly', '2026-10-06'), '2026-10-20'), true);        // Tuesday to Tuesday
assert.equal(taskIsOn(task('weekly', '2026-10-07'), '2026-10-20'), false);
assert.equal(taskIsOn(task('monthly', '2026-01-31'), '2026-02-28'), true);       // short month: last day
assert.equal(taskIsOn(task('monthly', '2026-01-31'), '2026-03-30'), false);
assert.equal(taskIsOn(task('none', '2026-11-01'), '2026-10-20'), false);         // one-off: not before its due date
assert.equal(taskIsOn(task('none', '2026-10-01'), '2026-10-20'), true);          // overdue: stays until done
assert.equal(taskDaysLate(task('none', '2026-10-18'), '2026-10-20'), 2);
assert.equal(taskDaysLate(task('daily', '2026-10-18'), '2026-10-20'), 0);
// Next 7 days from Tue 2026-10-20: weekly (Tuesday) lands on 27 Oct; a one-off on its due date unless done.
const upcoming = taskUpcoming([{ id: 1, ...task('weekly', '2026-10-06') }, { id: 2, ...task('none', '2026-10-22') }, { id: 3, ...task('none', '2026-10-23') }],
  '2026-10-20', 7, item => item.id === 3);
assert.deepEqual(upcoming.map(([day, list]) => [day, list.map(item => item.id)]), [['2026-10-22', [2]], ['2026-10-27', [1]]]);
// Order: high priority first, then earliest date, then oldest.
const order = [{ id: 1, priority: 'normal', start_date: '2026-10-01' }, { id: 2, priority: 'high', start_date: '2026-10-30' }, { id: 3, priority: 'normal', start_date: '2026-09-01' }].sort(taskOrder);
assert.deepEqual(order.map(item => item.id), [2, 3, 1]);
// Status tabs: ticked beats status; old rows and unknown values are pending; every task lands in exactly one tab.
assert.equal(taskState({ status: null }), 'pending');
assert.equal(taskState({ status: 'bogus' }), 'pending');
assert.equal(taskState({ status: 'on_hold' }), 'on_hold');
assert.equal(taskState({ status: 'in_progress' }, { done_on: '2026-10-27' }), 'done');
const mix = [[{ status: 'pending' }], [{ status: 'in_progress' }], [{ status: 'on_hold' }], [{ status: 'on_hold' }, {}], [{}]];
assert.equal(['pending', 'in_progress', 'on_hold', 'done'].reduce((sum, key) => sum + mix.filter(([t, tick]) => taskState(t, tick) === key).length, 0), mix.length);
// Edits send only what changed.
const form = { title: 'Call Ann', details: null, assigned_to: 'u1', repeat: 'none', start_date: '2026-10-27', priority: 'normal', status: 'pending', link: null, watchers: ['b', 'a'] };
assert.deepEqual(taskChanges({ ...form, title: ' Call Ann ', watchers: ['a', 'b'], id: 7 }, form), {});          // same task, followers reordered
assert.deepEqual(taskChanges({ ...form, details: '', link: undefined, status: null, priority: null, watchers: null }, { ...form, watchers: [] }), {}); // old row, blank fields
assert.deepEqual(taskChanges(form, { ...form, status: 'on_hold' }), { status: 'on_hold' });
assert.equal(taskChanges(null, form), form);                                                                     // new task: everything
// Day report: done count, status label, details indented, comments, an Update line per task.
assert.equal(taskReport('Tasks report', [
  { task: { title: 'E12', details: 'Line 1\nLine 2' }, state: 'in_progress', who: 'Drahcir', when: '4 days overdue', comments: [{ by: 'Darius', on: 'Mon 26 Oct', body: 'Price is $90' }] },
  { task: { title: 'Call Ann' }, state: 'done', who: 'Whole team', when: 'done by leisa', comments: [] }
]), 'Tasks report\n1 of 2 done\n\nIN PROGRESS: E12\nFor Drahcir · 4 days overdue\n  Line 1\n  Line 2\nComments:\n  - Darius (Mon 26 Oct): Price is $90\nUpdate: \n\nDONE: Call Ann\nFor Whole team · done by leisa\nUpdate: ');
assert.equal(taskReport('H', []), 'H\n0 of 0 done');
assert.equal(taskReport('H', [{ task: { title: 'A' }, state: 'pending', who: 'X', when: 'today', comments: [] },
  { task: { title: 'B' }, state: 'on_hold', who: 'X', when: 'today', comments: [] }]),
  'H\n0 of 2 done\n\nPENDING: A\nFor X · today\nUpdate: \n\nON HOLD: B\nFor X · today\nUpdate: ');
console.log('tasks check passed');
