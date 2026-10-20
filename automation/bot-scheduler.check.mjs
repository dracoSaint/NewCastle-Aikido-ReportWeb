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
assert.deepEqual(due([bot('followup', { run_time: '23:30:00' })]), [], 'not time yet');
assert.deepEqual(due([bot('pastdue', { run_time: '03:00:00' })]), [], 'more than 3 hours late: wait for tomorrow');
console.log('bot scheduler: ok');
