// Self-check for automation/bot-scheduler.mjs: `node automation/bot-scheduler.check.mjs`.
// Runs before the scheduler, so a broken rule never starts (or skips) a bot.
import assert from 'node:assert/strict';
import { botsDue, sydneyClock } from './bot-scheduler.mjs';

// 20:10 UTC Monday 12 Oct 2026 = 7:10 am Tuesday 13 Oct in Sydney (daylight saving, +11).
const now = new Date('2026-10-12T20:10:00Z');
assert.deepEqual(sydneyClock(now), { day: 2, minutes: 430 });

const bot = (job, extra) => ({ job, enabled: true, run_days: [0, 1, 2, 3, 4, 5, 6], run_time: '07:00:00', last_started_at: null, ...extra });
const due = settings => botsDue(settings, now).map(item => item.job);

assert.deepEqual(due([bot('pastdue')]), ['pastdue'], 'run time passed, not started yet');
assert.deepEqual(due([bot('pastdue', { last_started_at: '2026-10-12T20:05:00Z' })]), [], 'already started after 7 am');
assert.deepEqual(due([bot('pastdue', { last_started_at: '2026-10-11T20:05:00Z' })]), ['pastdue'], 'yesterday\'s run does not count');
assert.deepEqual(due([bot('pastdue', { enabled: false })]), [], 'switched off');
assert.deepEqual(due([bot('monday', { run_days: [1] })]), [], 'Monday-only bot on a Tuesday');
assert.deepEqual(due([bot('followup', { run_time: '08:00:00', last_started_at: '2026-10-11T22:00:00Z' })]), [], 'not time yet (ran yesterday morning)');
assert.deepEqual(due([bot('pastdue', { run_time: '03:00:00' })]), ['pastdue'], 'GitHub ran late (4 h): still caught up');
// 7:10 am Tuesday: Monday's 23:00 run was missed overnight, so it is still caught up (8 h late)...
assert.deepEqual(due([bot('geronimo', { run_time: '23:00:00' })]), ['geronimo'], 'last night\'s 23:00 run, caught up after midnight');
// ...unless it already ran after Monday 23:00 Sydney (12:00 UTC Monday), or Monday isn't a run day.
assert.deepEqual(due([bot('geronimo', { run_time: '23:00:00', last_started_at: '2026-10-12T12:05:00Z' })]), [], 'already ran last night');
assert.deepEqual(due([bot('geronimo', { run_time: '23:00:00', run_days: [2] })]), [], 'Tuesday-only: tonight, not now');
assert.deepEqual(botsDue([bot('pastdue', { run_time: '18:00:00' })], new Date('2026-10-13T20:10:00Z')).map(item => item.job), [], 'more than 12 hours late: wait for tomorrow');
console.log('bot scheduler: ok');
