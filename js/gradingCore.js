// Grading rules, shared by the Grading page (js/gradingScripts.js) and the nightly Zen Planner job
// (automation/zenplanner-grading.mjs). No page code here. Same rules as the old Grading Report sheet:
// - hours needed = the required hours of the member's current rank (grading_ranks);
// - eligible = attendance since the last test reaches the hours needed;
// - weeks left = whole weeks until the rank's testing-date group date (grading_test_dates);
// - weekly hour goal = hours still needed / weeks left, rounded up;
// - left out: Blue Zone Fitness members, and juniors aged 17 or more (gradingIncluded);
// - under 17 and in both programs: Juniors only (gradingOneProgram);
// - a Current or Hold Blue Zone Fitness membership: left out (gradingBlueZoneKeys).

// Rank names compared loosely: case, spacing and punctuation ignored ("10th kyu Red White Belt").
const gradingRankKey = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// 'adults' or 'juniors' from Zen Planner's program name.
const gradingProgram = name => (/junior/i.test(String(name || '')) ? 'juniors' : 'adults');

// Zen Planner grid export (CSV text) -> grading_members rows. Columns are found by name so a
// renamed or reordered export column still lands in the right place.
function gradingFromExport(text, parseTable, toIso) {
  const rows = parseTable(text, 'first_name') || [];
  const find = (row, test) => Object.keys(row).find(test);
  const members = rows.map(row => {
    const key = {
      program: find(row, k => /program/.test(k) && !/status/.test(k)),
      status: find(row, k => /status/.test(k)),
      // Export headers today: Rank, Att. Total, Att. Since Test, Enough Att. For Rank?, Last Test Date.
      rank: find(row, k => /rank/.test(k) && !/enough|next|passed|att/.test(k)),
      total: find(row, k => /att_total|sign_?up/.test(k)),
      since: find(row, k => /since_test|since_last|promotional/.test(k) && !/date/.test(k)),
      passed: find(row, k => /enough|next_rank|passed/.test(k)),
      lastTest: find(row, k => /test/.test(k) && /date/.test(k))
    };
    const number = value => (String(value ?? '').trim() === '' ? null : Number(String(value).replace(/[^0-9.-]/g, '')) || 0);
    const first = (row.first_name || '').trim();
    const last = (row.last_name || '').trim();
    return {
      member_key: `${first} ${last}`.trim().replace(/\s+/g, ' ').toLowerCase(),
      first_name: first || null,
      last_name: last || null,
      age: number(row.age),
      program: gradingProgram(row[key.program]),
      program_name: (row[key.program] || '').trim() || null,
      status: (row[key.status] || '').trim() || null,
      rank: (row[key.rank] || '').trim() || null,
      att_total: number(row[key.total]),
      att_since_test: number(row[key.since]),
      rank_attendance_passed: key.passed ? /^(y|yes|true|1)$/i.test(String(row[key.passed]).trim()) : null,
      last_test_date: toIso(row[key.lastTest]) || null
    };
  }).filter(row => row.member_key && gradingIncluded(row));
  return gradingOneProgram(members);
}

// Blue Zone Fitness members are exempt (user's rule, 2026-10-21): anyone with a Current or Hold Blue Zone
// membership in Zen Planner's memberships list (membership_all, synced nightly), matched by name, is left
// out of the Grading report in both programs. Returns the set of member keys to leave out.
function gradingBlueZoneKeys(memberships) {
  return new Set((memberships || [])
    .filter(row => /blue\s*zone/i.test(row.membership_label || '') && ['CURRENT', 'HOLD'].includes(String(row.mbr_status || '').toUpperCase()))
    .map(row => `${row.first_name || ''} ${row.last_name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase()));
}

// Someone under 17 (or with no age in Zen Planner) who is in both Juniors and Regular Adult is listed
// in Juniors only (user's rule, 2026-10-21). An under-17 who is only in Regular Adult stays there.
function gradingOneProgram(rows) {
  const juniors = new Set(rows.filter(row => row.program === 'juniors').map(row => row.member_key));
  return rows.filter(row => !(row.program === 'adults' && juniors.has(row.member_key) && (row.age == null || row.age <= GRADING_JUNIOR_MAX_AGE)));
}

// Who the report counts (user's rules, 2026-10-21): Blue Zone Fitness members are left out, and the
// Juniors are under 17 only. A junior with no age in Zen Planner is kept.
const GRADING_JUNIOR_MAX_AGE = 16;
function gradingIncluded(row) {
  if (/blue\s*zone/i.test(row.program_name || '')) return false;
  return !(row.program === 'juniors' && row.age != null && row.age > GRADING_JUNIOR_MAX_AGE);
}

// One member's grading figures. ranks: grading_ranks rows; dates: grading_test_dates rows; today: YYYY-MM-DD.
function gradingStatus(member, ranks, dates, today) {
  const rank = ranks.find(item => item.program === member.program && gradingRankKey(item.rank) === gradingRankKey(member.rank));
  const needed = rank && rank.req_hours != null ? Number(rank.req_hours) : null;
  const testDate = rank ? (dates.find(item => item.test_group === rank.test_group) || {}).test_date || null : null;
  const days = testDate ? Math.round((Date.parse(`${testDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
  const weeksLeft = days == null || days < 0 ? null : Math.floor(days / 7);
  const since = Number(member.att_since_test) || 0;
  const eligible = needed != null && since >= needed;
  const short = needed == null ? null : Math.max(0, needed - since);
  const weeklyGoal = needed == null || eligible || weeksLeft == null ? null : weeksLeft > 0 ? Math.ceil(short / weeksLeft) : short;
  return { rankFound: Boolean(rank), order: rank ? rank.sort_order : 999, testGroup: rank ? rank.test_group : null, needed, short, eligible, testDate, weeksLeft, weeklyGoal };
}

if (typeof module !== 'undefined') {
  module.exports = { gradingRankKey, gradingProgram, gradingFromExport, gradingStatus, gradingIncluded, gradingOneProgram, gradingBlueZoneKeys };
}
