// Geronimo Metrics: a week's figures worked out from the other reports. Shared by the page
// (js/geronimoMetrics.js: the live week-to-date column and the edit form) and the nightly Zen Planner job
// (automation/zenplanner-followup.mjs: locks each week in once it ends). No page code here.

// Monday Board beginner packages (js/mondayImportCore.js BEGINNER_PACKAGE_LABELS), lower-case.
const GM_BEGINNER = ['become - 6 week transformation journey', 'chiisai kai beginners package', 'junior beginner package',
  'blue zone- new beginnings 6 week life change introduction only', 'combat pilates become'];
// membership_weekly_log columns -> Pricing Settings category (js/mondayBoardScripts.js).
const GM_CATEGORY_FIELDS = { regular_adult: 'Regular Adult', beginner_adult: 'Beginner Adult', concession_adult: 'Concession Adult',
  chiisai_kai: 'Chiisai Kai', kids_8_14: '8-14 Junior Member', kids_15_17: '15-17 Junior Member', blue_zone: 'Blue Zone Fitness ongoing', combat_pilates: 'Combat Pilates' };

const gmNum = value => (value === null || value === undefined || value === '' ? null : Number(value));
const gmAddDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const gmFriday = iso => gmAddDays(iso, (5 - new Date(`${iso}T00:00:00Z`).getUTCDay() + 7) % 7); // the Friday that ends iso's week
const gmMonthStart = iso => `${iso.slice(0, 7)}-01`;
const gmToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const gmDate = (iso, opts) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', ...opts });
// Midnight in Sydney on a day, as a timestamp the database compares correctly (AEST or AEDT).
const gmSydneyMidnight = iso => {
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${iso}T12:00:00Z`)).find(part => part.type === 'timeZoneName').value.replace('GMT', '') || '+10:00';
  return `${iso}T00:00:00${zone}`;
};

const gmIsBeginner = label => GM_BEGINNER.includes(String(label || '').trim().toLowerCase());
const gmIsFull = label => Boolean(label) && !gmIsBeginner(label) && !/gratis/i.test(label);

// Every member list the Monday Board kept: the weekly snapshots (membership_data_log) plus the current list.
let gmMemberRows = null; // loaded once per page or job
async function gmMemberHistory(client) {
  if (gmMemberRows) return gmMemberRows;
  const cols = 'number, first_name, last_name, membership_label, mbr_status, mbr_create_date, mbr_begin_date, mbr_end_date, report_date';
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from('membership_data_log').select(cols).order('id').range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const { data, error } = await client.from('membership_data').select(cols);
  if (error) throw error;
  gmMemberRows = [...rows, ...data].filter(row => row.number !== null && row.report_date).map(row => ({ ...row, number: String(row.number) }));
  return gmMemberRows;
}

// From the member lists: beginner packages (with their rollover, if any) and new full memberships.
// `number` is the membership's own id (a rollover gets a new one), so people are matched by name, as the
// Monday import does. Rollover = the person later holds a full membership (not Gratis); it counts in the
// month the package started. A sale = someone first seen after the oldest list, with no package.
// Beginner Adult only ever follows BECOME Adult, so it is never a sale: without a package on file (the BECOME
// ended before the oldest list) it counts as a rollover. Beginner Adult -> Regular Adult is a promotion, not counted.
// Sales and rollovers are dated by when the membership was created (its begin date can be backdated).
function gmMemberFacts(rows) {
  const historyStart = rows.reduce((min, row) => (row.report_date < min ? row.report_date : min), '9999');
  const latest = rows.reduce((max, row) => (row.report_date > max ? row.report_date : max), '');
  const person = row => `${row.first_name || ''} ${row.last_name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
  const byPerson = new Map();
  rows.forEach(row => { const key = person(row); if (!key) return; if (!byPerson.has(key)) byPerson.set(key, []); byPerson.get(key).push(row); });
  const packages = [];
  const sales = [];
  const rollovers = []; // dates: every package's rollover, plus Beginner Adults whose BECOME predates the lists
  byPerson.forEach(list => {
    list.sort((a, b) => b.report_date.localeCompare(a.report_date)); // newest list first: its names and dates win
    const firstSeen = {};
    list.forEach(row => { firstSeen[row.number] = row.report_date; }); // ends on the oldest list each membership is on
    const made = row => row.mbr_create_date || row.mbr_begin_date || firstSeen[row.number];
    const fulls = [...new Map(list.filter(row => gmIsFull(row.membership_label) && row.mbr_begin_date).map(row => [row.number, row])).values()]
      .sort((a, b) => made(a).localeCompare(made(b)));
    const seen = new Set();
    list.filter(row => gmIsBeginner(row.membership_label) && row.mbr_begin_date).forEach(row => {
      if (seen.has(row.number)) return;
      seen.add(row.number);
      const full = fulls.find(item => item.mbr_begin_date >= row.mbr_begin_date);
      packages.push({ number: row.number, first_name: row.first_name, last_name: row.last_name, label: row.membership_label,
        made: made(row), begin: row.mbr_begin_date, end: row.mbr_end_date, rolledOn: full ? made(full) : null });
    });
    const first = list.reduce((min, row) => (row.report_date < min ? row.report_date : min), '9999');
    if (!seen.size && fulls.length && first > historyStart) {
      if (/^beginner adult$/i.test(fulls[0].membership_label.trim())) rollovers.push(made(fulls[0]));
      else sales.push({ number: fulls[0].number, label: fulls[0].membership_label, on: made(fulls[0]) });
    }
  });
  packages.forEach(item => { if (item.rolledOn) rollovers.push(item.rolledOn); });
  return { historyStart, latest, packages, sales, rollovers };
}

// The Monday Board snapshot for a week ending Friday: the latest one taken that week (log is newest first).
const gmWeekLog = (log, friday) => log.find(row => row.report_date >= gmAddDays(friday, -8) && row.report_date <= friday) || null;

// Reference only: members per category × their weekly fee, over 30 days. Expected, not banked.
function gmRevenueEstimate(log, pricing, friday) {
  const week = gmWeekLog(log, friday);
  if (!week) return null;
  let total = 0;
  for (const [field, category] of Object.entries(GM_CATEGORY_FIELDS)) {
    const fee = gmNum(pricing[`weekly_fee__${category}`]);
    if (fee === null) return null;
    total += Number(week[field] || 0) * fee;
  }
  return total * 30 / 7;
}

// Daily Ad Review: each import is Meta's rolling last 7 days. Use the latest import dated in the week
// (Saturday to Friday), so the spend is as up to date as the Ad Review; before this week's first import,
// the latest one before it (stale: true). Spend sums every ad on that import, traffic ads included.
async function gmAdWeek(client, start) {
  const friday = gmAddDays(start, 6);
  const { data: latest, error: latestError } = await client.from('ad_review_snapshots').select('report_date')
    .lte('report_date', friday).gte('report_date', gmAddDays(start, -14)).order('report_date', { ascending: false }).limit(1);
  if (latestError || !latest.length) return null;
  const date = latest[0].report_date;
  const { data: rows, error } = await client.from('ad_review_snapshots')
    .select('report_date, range_start, amount_spent, leads, delivery, ad_review_ads(ad_name)').eq('report_date', date);
  if (error || !rows.length) return null;
  const best = rows[0];
  const top = rows.reduce((a, b) => ((b.leads || 0) > (a.leads || 0) ? b : a));
  return {
    stale: date < start,
    range: `${gmDate(best.range_start || gmAddDays(date, -7), { day: 'numeric', month: 'short' })}–${gmDate(date, { day: 'numeric', month: 'short' })}`,
    spend: rows.reduce((sum, row) => sum + Number(row.amount_spent || 0), 0),
    active: rows.filter(row => /active/i.test(row.delivery || '') && !/inactive/i.test(row.delivery || '')).length,
    top: top.leads ? { name: top.ad_review_ads?.ad_name || 'Unnamed ad', leads: top.leads } : null
  };
}

// A week's figures (Saturday to Friday) from the Scoreboard, the Monday Board and Daily Ad Review, as
// geronimo_weekly columns (rollover_pct as a fraction). Attendance and cancels come from Zen Planner (the bot).
// can(permission): sources the role can't read are skipped, so they never read as a false 0.
// ctx: { score, weeklyLog, pricing } already loaded by the page; anything missing is fetched.
async function gmComputeWeek(client, friday, can, ctx = {}) {
  const start = gmAddDays(friday, -6);
  const inWeek = iso => Boolean(iso) && iso >= start && iso <= friday;
  const values = {};
  const notes = [];

  // Scoreboard: organic leads, the average 30-day revenue, and fallbacks for the member-list rows below.
  let score = ctx.score;
  if (!score && can('geronimo.view')) {
    const { data } = await client.from('geronimo_scoreboard').select('*').gte('day', gmMonthStart(start)).lte('day', friday);
    score = data || [];
  }
  const days = (score || []).filter(row => inWeek(row.day));
  const total = key => days.reduce((sum, row) => sum + (row[key] || 0), 0);
  const revenue = days.map(row => gmNum(row.revenue_30d)).filter(value => value !== null);
  if (revenue.length) values.revenue_30d = Math.round(revenue.reduce((a, b) => a + b, 0) / revenue.length);
  if (days.length) {
    Object.assign(values, { rollovers: total('rollovers'), membership_sales: total('memberships'), organic_leads: total('organic_leads'), weekly_cancels: total('cancels') });
    values.cancels_mtd = (score || []).filter(row => row.day >= gmMonthStart(friday) && row.day <= friday).reduce((sum, row) => sum + (row.cancels || 0), 0);
  }

  if (can('monday.view')) {
    try {
      const [log, pricing, rows] = await Promise.all([
        ctx.weeklyLog || client.from('membership_weekly_log').select('*').order('report_date', { ascending: false }).then(({ data }) => data || []),
        ctx.pricing || client.from('pricing_settings').select('key, value').then(({ data }) => Object.fromEntries((data || []).map(row => [row.key, row.value]))),
        gmMemberHistory(client)
      ]);
      const week = gmWeekLog(log, friday);
      if (week) values.autopay_members = week.members_total;
      // Autopay members = Zen Planner's autopay report: autopay ON, any status but Completed (membership_all,
      // synced nightly). It is today's list only, so it is used for this week and last week (lock-in);
      // older weeks keep the Monday Board total.
      if (friday >= gmAddDays(gmToday(), -7)) {
        const { count, error } = await client.from('membership_all').select('number', { count: 'exact', head: true })
          .eq('autopay', 'ON').in('mbr_status', ['CURRENT', 'NOT STARTED', 'HOLD', 'CANCELED', 'CANCEL PENDING']);
        if (!error && count) values.autopay_members = count;
      }
      const snapshot = rows.reduce((best, row) => (row.report_date >= gmAddDays(friday, -8) && row.report_date <= friday && row.report_date > best ? row.report_date : best), '');
      if (snapshot) values.suspended_members = rows.filter(row => row.report_date === snapshot && /hold/i.test(row.mbr_status || '')).length;
      const facts = gmMemberFacts(rows);
      if (start <= facts.historyStart) {
        notes.push(`sales and rollovers need the member list from before ${gmDate(start, { day: 'numeric', month: 'short' })} (it starts ${gmDate(facts.historyStart, { day: 'numeric', month: 'short' })})`);
      } else if (start <= facts.latest) {
        const packs = facts.packages.filter(item => inWeek(item.made));
        const sales = facts.sales.filter(item => inWeek(item.on));
        Object.assign(values, { intro_pack_sales: packs.length, membership_sales: sales.length });
        // Sales value: package fee per intro pack + one week's fee per new membership (Pricing Settings).
        const prices = [...packs.map(item => gmNum(pricing[`beginner_fee__${item.label}`])), ...sales.map(item => gmNum(pricing[`weekly_fee__${item.label}`]))];
        if (prices.every(price => price !== null)) values.sales_value = prices.reduce((a, b) => a + b, 0);
        else notes.push('sales value skipped: a membership has no price in Monday Board > Pricing Settings');
      }
    } catch (error) {
      notes.push(`member list not read (${error.message})`);
    }
  }

  // Rollovers and rollover % from the Trial waves list (user's choice, 2026-10-21), so they match it,
  // hand edits included. Dates from the nightly all-members list (membership_all).
  if (can('geronimo.view') && can('monday.view')) {
    try {
      const [{ data: waves, error }, memberships] = await Promise.all([
        client.from('geronimo_wave_members').select('member_number, first_name, last_name, induction_date, rolled_over'),
        gmAllMemberships(client)
      ]);
      if (error) throw error;
      Object.assign(values, gmWaveRollovers(waves, memberships, start, friday));
    } catch (error) {
      notes.push(`rollovers not worked out (${error.message})`);
    }
  }

  if (can('ads.view')) {
    const [leads, ads] = await Promise.all([
      client.from('ad_review_leads').select('id', { count: 'exact', head: true })
        .gte('created_time', gmSydneyMidnight(start)).lt('created_time', gmSydneyMidnight(gmAddDays(friday, 1))),
      gmAdWeek(client, start)
    ]);
    if (!leads.error && typeof leads.count === 'number') values.meta_leads = leads.count;
    // A finished week with no import of its own is left blank, so last week's spend is never counted twice.
    if (ads && (!ads.stale || friday >= gmToday())) {
      values.fb_spend = Math.round(ads.spend * 100) / 100;
      notes.push(`Facebook spend is the Ad Review's last 7 days, ${ads.range}${ads.stale ? ' (no import this week yet)' : ''}`);
    }
  }
  return { values, notes };
}

// Every Zen Planner membership, any status (membership_all, synced nightly), paged; loaded once per page or job.
let gmAllRows = null;
async function gmAllMemberships(client) {
  if (gmAllRows) return gmAllRows;
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from('membership_all').select('number, first_name, last_name, membership_label, mbr_status, mbr_begin_date, mbr_end_date').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return (gmAllRows = all);
}

// The week's rollovers from the Trial waves list:
//   rollovers    = wave members marked Yes, in the week their trial ended (or their full membership began, if
//                  later: they joined after a gap); marked Yes by hand with no full membership -> trial end too.
//   rollover_pct = of wave members whose trial package ended this week, the share marked Yes (still blank = not counted).
// The trial is the wave row's package (member_number); its end date comes from the member list.
// today: nothing later than today counts yet (a trial ending later this week waits for its day).
function gmWaveRollovers(waves, memberships, start, friday, today = gmToday()) {
  const inWeek = iso => Boolean(iso) && iso >= start && iso <= friday && iso <= today;
  const person = row => `${row.first_name || ''} ${row.last_name || ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
  const byNumber = new Map(memberships.map(row => [String(row.number), row]));
  const fullBegins = new Map();
  memberships.filter(row => gmIsFull(row.membership_label) && row.mbr_begin_date).forEach(row => {
    if (!fullBegins.has(person(row))) fullBegins.set(person(row), []);
    fullBegins.get(person(row)).push(row.mbr_begin_date);
  });
  let rollovers = 0;
  const ended = [];
  waves.forEach(member => {
    const trialEnd = byNumber.get(String(member.member_number))?.mbr_end_date || null;
    if (inWeek(trialEnd) && member.rolled_over !== null) ended.push(member);
    if (member.rolled_over !== true) return;
    // Zen Planner backdates the follow-on membership to the trial's start, so its begin date can't date the
    // rollover: it counts when the trial ends, or when the full membership begins if that is later (joined after a gap).
    const from = member.induction_date || '0000';
    const fullBegin = (fullBegins.get(person(member)) || []).filter(begin => begin >= from).sort()[0] || null;
    const joined = [trialEnd, fullBegin].filter(Boolean).sort().pop() || null;
    if (inWeek(joined)) rollovers += 1;
  });
  return {
    rollovers,
    rollover_pct: ended.length ? Math.round(ended.filter(member => member.rolled_over).length / ended.length * 1000) / 1000 : null
  };
}

const GM_WAVES_FROM = '2026-01-01'; // waves start with the 2026 sheet

// Trial waves, run nightly by the Zen Planner job and by the Trial waves button. Source: every Zen Planner
// membership in any status (membership_all, synced nightly), so future starters ("Not started") are in too.
// Each person whose first beginner package begins in 2026 or later joins the wave of that month (one row
// per person: a re-created or follow-on package is the same trial; rows doubled up before this rule are
// merged, keeping what staff typed). Same name = same person (ponytail: two different people with one name
// would share a row; match on Zen Planner person id if that ever happens). Filled from the data pulled,
// blanks only, so anything staff typed is kept:
//   Rolled over: yes if the same person (by name) has a full membership (not Gratis) beginning on or after
//     the package (also turns an earlier "No" into "Yes");
//     no if every package is completed or cancelled without one; blank while one is running.
//   Inducted: ticked once the package has begun and is current, on hold or completed.
//   Email / phone: the Daily Ad Review lead with that name; phone also from the latest Red / Orange export.
// dryRun: count, write nothing.
async function gmSyncWaves(client, dryRun = false) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from('membership_all').select('number, first_name, last_name, membership_label, mbr_status, mbr_begin_date').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  const [{ data: existing, error }, { data: report }, { data: leads }] = await Promise.all([
    client.from('geronimo_wave_members').select('id, wave_month, member_number, first_name, last_name, induction_date, phone, email, goal, why, notes, rolled_over, inducted'),
    client.from('follow_up_reports').select('attendance').order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('ad_review_leads').select('first_name, last_name, email, phone')
  ]);
  if (error) throw error;

  const nameKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const personKey = row => nameKey(`${row.first_name || ''} ${row.last_name || ''}`);
  // Same tidy-up as fuPhone (js/followUpCore.js): p:+61..., 4xxxxxxxx -> 04xxxxxxxx, 61xxxxxxxxx -> +61xxxxxxxxx.
  const tidy = phone => { const raw = String(phone || '').replace(/^p:/, '').trim(); const digits = raw.replace(/\D/g, ''); return /^4\d{8}$/.test(digits) ? `0${digits}` : /^61\d{9}$/.test(digits) ? `+${digits}` : raw; };
  const contact = new Map();
  (leads || []).forEach(lead => contact.set(personKey(lead), { email: lead.email || null, phone: lead.phone ? tidy(lead.phone) : null }));
  (report?.attendance || []).filter(person => person.phone).forEach(person => {
    const known = contact.get(nameKey(person.name)) || { email: null, phone: null };
    contact.set(nameKey(person.name), { ...known, phone: known.phone || tidy(person.phone) });
  });

  const fulls = new Map(); // person -> begin dates of their full memberships
  all.filter(row => gmIsFull(row.membership_label) && row.mbr_begin_date).forEach(row => {
    if (!fulls.has(personKey(row))) fulls.set(personKey(row), []);
    fulls.get(personKey(row)).push(row.mbr_begin_date);
  });
  const today = gmToday();
  const rows = gmWavePeople(all.filter(row => gmIsBeginner(row.membership_label) && row.mbr_begin_date >= GM_WAVES_FROM), personKey).map(list => {
    const first = list[0];
    const rolledOver = (fulls.get(personKey(first)) || []).some(begin => begin >= first.mbr_begin_date)
      ? true : list.every(row => ['COMPLETED', 'CANCELED'].includes(row.mbr_status)) ? false : null;
    const found = contact.get(personKey(first)) || {};
    return {
      wave_month: gmMonthStart(first.mbr_begin_date), member_number: first.number, first_name: first.first_name || 'Unknown', last_name: first.last_name,
      induction_date: first.mbr_begin_date, inducted: list.some(row => row.mbr_begin_date <= today && ['CURRENT', 'HOLD', 'COMPLETED'].includes(row.mbr_status)),
      rolled_over: rolledOver, phone: found.phone || null, email: found.email || null
    };
  });

  // Rows already on file from before one-row-per-person: merge each person's extra rows into one.
  const { keep, merges, removals } = gmWaveMerge(existing, personKey, rows);
  const people = new Set(keep.map(personKey));
  // A package number already on file is the same person even if Zen Planner's name changed since.
  const numbers = new Set(existing.map(member => member.member_number).filter(Boolean));
  const fresh = rows.filter(row => !people.has(personKey(row)) && !numbers.has(row.member_number));
  const byPerson = new Map(rows.map(row => [personKey(row), row]));
  const patches = keep.map(member => {
    const patch = { ...(merges.get(member.id) || {}) };
    const merged = { ...member, ...patch };
    const auto = byPerson.get(personKey(member));
    const found = contact.get(personKey(member)) || {};
    member = merged;
    if (member.rolled_over === null && auto && auto.rolled_over !== null) patch.rolled_over = auto.rolled_over;
    // A "No" turns into "Yes" once a full membership shows up (they joined after all); never Yes -> No.
    if (member.rolled_over === false && auto?.rolled_over === true) patch.rolled_over = true;
    // ponytail: inducted has no blank, so it is only ever ticked, never unticked; an untick on a started package comes back.
    if (!member.inducted && auto?.inducted) patch.inducted = true;
    if (!member.phone && found.phone) patch.phone = found.phone;
    if (!member.email && found.email) patch.email = found.email;
    return [member.id, patch];
  }).filter(([, patch]) => Object.keys(patch).length);

  if (!dryRun) {
    if (fresh.length) {
      const { error: addError } = await client.from('geronimo_wave_members').upsert(fresh, { onConflict: 'wave_month,member_number', ignoreDuplicates: true });
      if (addError) throw addError;
    }
    for (const [id, patch] of patches) {
      const { error: updateError } = await client.from('geronimo_wave_members').update(patch).eq('id', id);
      if (updateError) throw updateError;
    }
    // Only after the kept row holds everything typed on the extras.
    if (removals.length) {
      const { error: removeError } = await client.from('geronimo_wave_members').delete().in('id', removals);
      if (removeError) throw removeError;
    }
  }
  return { added: fresh.length, updated: patches.length, merged: removals.length };
}

// Beginner packages grouped by person, each list oldest first: one wave row per person, for their first
// package (a re-created or follow-on beginner package is the same trial, not a second one).
function gmWavePeople(packages, personKey) {
  const by = new Map();
  packages.forEach(row => {
    if (!by.has(personKey(row))) by.set(personKey(row), []);
    by.get(personKey(row)).push(row);
  });
  return [...by.values()].map(list => list.sort((a, b) => a.mbr_begin_date.localeCompare(b.mbr_begin_date) || String(a.number).localeCompare(String(b.number))));
}

// Existing wave rows -> one per person. Kept: the row for the person's first package, else their earliest
// row. Anything typed on the extras (phone, email, goal, why, notes, rolled over, inducted) fills the kept
// row's blanks (two different notes are joined), then the extras are removed.
function gmWaveMerge(existing, personKey, wanted) {
  const first = new Map(wanted.map(row => [personKey(row), `${row.wave_month}|${row.member_number}`]));
  const by = new Map();
  existing.forEach(row => {
    if (!by.has(personKey(row))) by.set(personKey(row), []);
    by.get(personKey(row)).push(row);
  });
  const keep = [];
  const merges = new Map();
  const removals = [];
  by.forEach((list, person) => {
    list.sort((a, b) => (first.get(person) === `${b.wave_month}|${b.member_number}`) - (first.get(person) === `${a.wave_month}|${a.member_number}`)
      || String(a.induction_date || a.wave_month).localeCompare(String(b.induction_date || b.wave_month)) || a.id - b.id);
    const [kept, ...extras] = list;
    keep.push(kept);
    if (!extras.length) return;
    const patch = {};
    extras.forEach(extra => {
      ['phone', 'email', 'goal', 'why'].forEach(field => { if (!kept[field] && !patch[field] && extra[field]) patch[field] = extra[field]; });
      const notes = patch.notes ?? kept.notes;
      if (extra.notes && extra.notes !== notes) patch.notes = notes ? `${notes} / ${extra.notes}` : extra.notes;
      if (kept.rolled_over === null && patch.rolled_over == null && extra.rolled_over !== null) patch.rolled_over = extra.rolled_over;
      if (!kept.inducted && extra.inducted) patch.inducted = true;
      removals.push(extra.id);
    });
    if (Object.keys(patch).length) merges.set(kept.id, patch);
  });
  return { keep, merges, removals };
}

if (typeof module !== 'undefined') {
  module.exports = { gmAddDays, gmFriday, gmNum, gmComputeWeek, gmMemberFacts, gmSyncWaves, gmWavePeople, gmWaveMerge, gmWaveRollovers };
}
