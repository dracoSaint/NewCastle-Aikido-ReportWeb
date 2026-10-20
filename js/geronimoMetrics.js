// Geronimo Metrics Report (was the GRN_Metrics Google Sheet): weekly figures, trial waves, daily scoreboard.
// Tables: supabase/geronimo_metrics.sql (history: geronimo_metrics_seed.sql). Figures from the other
// reports: js/geronimoCore.js (loaded first).

const GM_WEEKLY = 'geronimo_weekly';
const GM_WAVES = 'geronimo_wave_members';
const GM_SCORE = 'geronimo_scoreboard';
const GM_SCORE_FIELDS = [['rollovers', 'Rollovers'], ['memberships', 'Memberships'], ['organic_leads', 'Organic leads'], ['cancels', 'Cancels'], ['kickstarts', 'Kickstarts']];
const GM_REVENUE = 'revenue_30d'; // Scoreboard money column: averaged, not summed, and blank stays blank

const gmRatio = (a, b) => (a === null || !b ? null : a / b);
const gmSum = (...values) => (values.every(value => value === null) ? null : values.reduce((total, value) => total + (value || 0), 0));

// Weekly rows in the sheet's order. Rows with calc are worked out, the rest are entered.
// fill: the "Fill from the app" button can supply it. ok: meets the sheet's KPI.
const GM_ROWS = [
  { head: 'Members' },
  { key: 'revenue_30d', label: 'Rolling 30 day revenue', kind: 'money', fill: true },
  { key: 'revenue_est', label: 'Expected 30 day revenue (Monday Board × pricing)', kind: 'money', calc: w => gmRevenueEstimate(gmWeeklyLog, gmPricing, w.week_ending) },
  { key: 'autopay_members', label: 'Autopay members', kind: 'int', fill: true },
  { key: 'suspended_members', label: 'Suspended members', kind: 'int', fill: true },
  { head: '1. Lead gen' },
  { key: 'fb_spend', label: 'Facebook budget spent', kind: 'money', fill: true },
  { key: 'cpl', label: 'Average cost per lead', kind: 'money', calc: w => gmRatio(w.fb_spend, w.meta_leads) },
  { key: 'meta_leads', label: 'Meta paid leads', kind: 'int', fill: true },
  { key: 'organic_leads', label: 'Organic leads', kind: 'int', fill: true },
  { head: '2. Lead follow up / sales' },
  { key: 'intro_pack_sales', label: 'Intro + Pack sales', kind: 'int', fill: true },
  { key: 'membership_sales', label: 'Membership sales', kind: 'int', fill: true },
  { key: 'conversion', label: 'Sales conversion', kind: 'pct', target: '30%', ok: v => v >= 0.3,
    calc: w => gmRatio(gmSum(w.intro_pack_sales, w.membership_sales), gmSum(w.meta_leads, w.organic_leads)) },
  { key: 'sales_value', label: 'Sales value', kind: 'money', fill: true },
  { head: '3. Trial to member' },
  { key: 'rollovers', label: 'Rollovers', kind: 'int', fill: true },
  { key: 'rollover_pct', label: 'Rollover %', kind: 'pct', target: '80%', ok: v => v >= 0.8, fill: true },
  { head: '4. Engagement' },
  { key: 'attendance', label: 'Attendance', kind: 'int' }, // saved nightly by the Zen Planner bot
  { key: 'visits', label: 'Average visits per member', kind: 'dec', target: '3–4', ok: v => v >= 3, calc: w => gmRatio(w.attendance, w.autopay_members) },
  { head: '5. Churn' },
  { key: 'weekly_cancels', label: 'Weekly cancels', kind: 'int', fill: true },
  { key: 'cancels_mtd', label: 'Cancels this month', kind: 'int', fill: true },
  { key: 'churn', label: 'Monthly churn', kind: 'pct', target: '5% or less', ok: v => v <= 0.05, calc: w => gmRatio(w.cancels_mtd, w.autopay_members) },
  { head: 'Growth' },
  { key: 'net', label: 'Net gain or loss', kind: 'signed', ok: v => v >= 0, calc: w => gmSum(w.membership_sales, w.rollovers, w.weekly_cancels === null ? null : -w.weekly_cancels) }
];
const GM_INPUTS = GM_ROWS.filter(row => row.key && !row.calc);
const gmRow = key => GM_ROWS.find(row => row.key === key);

let gmWeeks = [];          // geronimo_weekly rows, newest first; open weeks merged with their live figures (gmLiveWeeks)
let gmMembers = [];        // geronimo_wave_members rows
let gmScore = new Map();   // day -> geronimo_scoreboard row
let gmCanEdit = true;
let gmCan = () => true;    // role switch check (js/access.js); open until roles are set up
let gmEditingMember = null;
let gmWeeklyLog = [];      // membership_weekly_log rows (Monday Board), newest first
let gmPricing = {};        // pricing_settings key -> value
let gmStored = new Map();  // week_ending -> geronimo_weekly row as saved (what the edit form starts from)

// ── Helpers ──────────────────────────────────────────────────────────────────

const gmEsc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

function gmFormat(kind, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  if (kind === 'money') return value.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  if (kind === 'pct') return `${Math.round(value * 100)}%`;
  if (kind === 'dec') return value.toFixed(2);
  if (kind === 'signed') return value > 0 ? `+${value}` : String(value);
  return value.toLocaleString('en-AU');
}

const gmValue = (row, week) => (row.calc ? row.calc(week) : gmNum(week[row.key]));
const gmTone = (row, value) => (!row.ok || value === null ? '' : row.ok(value) ? ' is-good' : ' is-bad');

function gmToast(message, isError = false, isLong = false) {
  const toast = document.getElementById('gmToast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  clearTimeout(gmToast.timer);
  gmToast.timer = setTimeout(() => { toast.hidden = true; }, isError || isLong ? 8000 : 2500);
}

async function gmClient() {
  if (window.authReady) await window.authReady;
  if (!window.supabaseClient) throw new Error('Your session has ended. Please sign in again.');
  return window.supabaseClient;
}

const gmNeedsSetup = error => /relation|does not exist|schema cache/i.test(error?.message || '');
const gmSetupNotice = '<p class="pd-notice">This report needs a one-time database update: run <code>supabase/geronimo_metrics.sql</code>, then <code>supabase/geronimo_metrics_seed.sql</code> for the history.</p>';

// ── Weekly ───────────────────────────────────────────────────────────────────

function gmWeekOptions() {
  const select = document.getElementById('gmWeek');
  const chosen = select.value || gmFriday(gmToday());
  const fridays = new Set(gmWeeks.map(week => week.week_ending));
  const oldest = gmWeeks.length ? gmWeeks[gmWeeks.length - 1].week_ending : gmFriday(gmToday());
  const options = [];
  for (let friday = gmFriday(gmToday()); friday >= oldest; friday = gmAddDays(friday, -7)) {
    options.push(`<option value="${friday}"${friday === chosen ? ' selected' : ''}>${gmDate(friday, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${fridays.has(friday) ? '' : ' · no figures yet'}</option>`);
  }
  select.innerHTML = options.join('');
}

function gmRenderWeekMetrics() {
  const friday = document.getElementById('gmWeek').value;
  const week = gmWeeks.find(row => row.week_ending === friday);
  const before = gmWeeks.find(row => row.week_ending === gmAddDays(friday, -7));
  document.getElementById('gmEditWeek').textContent = week ? 'Edit this week' : 'Enter this week';
  const stored = gmStored.get(friday);
  document.getElementById('gmWeekState').textContent = week?.live
    ? 'Week to date: worked out live from the other reports. It locks in after Friday; edits you save always win.'
    : stored?.locked_at ? `Locked in ${gmDate(stored.locked_at.slice(0, 10), { day: 'numeric', month: 'short' })}. Use Edit to correct a figure.` : '';
  const box = document.getElementById('gmWeekMetrics');
  if (!week) {
    box.innerHTML = '<div class="past-due-metric key"><span>This week</span><strong>No figures yet</strong></div>';
    return;
  }
  const tile = (key, extra = '') => {
    const row = gmRow(key);
    const value = gmValue(row, week);
    return `<div class="past-due-metric${extra}${gmTone(row, value)}"><span>${gmEsc(row.label)}${row.target ? ` · target ${row.target}` : ''}</span><strong>${gmFormat(row.kind, value)}</strong></div>`;
  };
  const autopay = gmNum(week.autopay_members);
  const change = before && autopay !== null && gmNum(before.autopay_members) !== null ? autopay - before.autopay_members : null;
  box.innerHTML = tile('net', ' key') +
    `<div class="past-due-metric"><span>Autopay members${change === null ? '' : ` · ${gmFormat('signed', change)} on last week`}</span><strong>${gmFormat('int', autopay)}</strong></div>` +
    tile('conversion') + tile('rollover_pct') + tile('churn') + tile('visits');
}

function gmRenderWeekTable() {
  const box = document.getElementById('gmWeekTable');
  document.getElementById('gmWeekCount').textContent = `${gmWeeks.length} week${gmWeeks.length === 1 ? '' : 's'}`;
  if (!gmWeeks.length) { box.innerHTML = '<p class="pd-notice">No weeks entered yet.</p>'; return; }
  const selected = document.getElementById('gmWeek').value;
  const head = gmWeeks.map(week => `<th scope="col"${week.week_ending === selected ? ' class="is-selected"' : ''}>
      <button type="button" class="gm-week-pick" data-week="${week.week_ending}" title="Show this week">${gmDate(week.week_ending, { day: 'numeric', month: 'short' })}</button>
      ${week.live ? '<small class="gm-live">to date</small>' : gmStored.get(week.week_ending)?.locked_at ? '<small>locked</small>' : ''}</th>`).join('');
  const body = GM_ROWS.map(row => {
    if (row.head) return `<tr class="gm-head"><th scope="rowgroup" colspan="${gmWeeks.length + 1}">${gmEsc(row.head)}</th></tr>`;
    const cells = gmWeeks.map(week => {
      const value = gmValue(row, week);
      return `<td class="${(gmTone(row, value) + (week.week_ending === selected ? ' is-selected' : '')).trim()}">${gmFormat(row.kind, value)}</td>`;
    }).join('');
    return `<tr><th scope="row">${gmEsc(row.label)}${row.target ? ` <small>(${row.target})</small>` : ''}</th>${cells}</tr>`;
  }).join('');
  box.innerHTML = `<table class="gm-grid"><thead><tr><th scope="col">Week ending</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// Saved weeks, with the open ones (this week, and last week until the bot locks it) worked out live from the
// other reports. A figure saved by hand or by the bot always wins over the live one.
const gmLive = new Map(); // week_ending -> live figures (gmComputeWeek)
function gmBuildWeeks() {
  const weeks = new Map([...gmStored].map(([friday, row]) => [friday, row]));
  gmLive.forEach((values, friday) => {
    const saved = Object.fromEntries(Object.entries(gmStored.get(friday) || {}).filter(([, value]) => value !== null));
    weeks.set(friday, { ...values, ...saved, week_ending: friday, live: true });
  });
  gmWeeks = [...weeks.values()].sort((a, b) => b.week_ending.localeCompare(a.week_ending));
}

async function gmLoadLive() {
  const client = await gmClient();
  const thisWeek = gmFriday(gmToday());
  const open = [thisWeek, gmAddDays(thisWeek, -7)].filter(friday => !gmStored.get(friday)?.locked_at);
  const ctx = { score: [...gmScore.values()], weeklyLog: gmWeeklyLog, pricing: gmPricing };
  for (const friday of open) gmLive.set(friday, (await gmComputeWeek(client, friday, gmCan, ctx)).values);
  gmBuildWeeks();
  gmRenderWeekly();
}

function gmRenderWeekly() {
  gmWeekOptions();
  gmRenderWeekMetrics();
  gmRenderWeekTable();
  gmRenderExtras();
}

// End of week from the other reports, worked out live (nothing stored): Red / Orange, Past Due, ads.
// Each tile needs that report's view switch.
async function gmRenderExtras() {
  const box = document.getElementById('gmExtras');
  const friday = document.getElementById('gmWeek').value;
  const start = gmAddDays(friday, -6);
  const tile = (label, value, tone = '') => `<div class="past-due-metric${tone && value ? ` is-${tone}` : ''}"><span>${gmEsc(label)}</span><strong>${gmEsc(value)}</strong></div>`; // tone: bad / warn / good, only when not 0
  const client = await gmClient();
  const jobs = [];

  if (gmCan('followup.view')) jobs.push((async () => {
    const [report, returns, tiers] = await Promise.all([
      client.from('follow_up_reports').select('report_date, attendance, memberships, removed').lte('report_date', friday)
        .order('report_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      client.from('follow_up_returns').select('id', { count: 'exact', head: true }).gte('returned_on', start).lte('returned_on', friday).is('removed_at', null),
      client.from('app_settings').select('value').eq('key', 'followup_tiers').maybeSingle()
    ]);
    const out = [];
    if (report.data && report.data.report_date >= start) {
      fuApplyTiers(tiers.data?.value);
      const result = fuBuild(report.data);
      const on = gmDate(report.data.report_date, { day: 'numeric', month: 'short' });
      out.push(tile(`Red (to call) · ${on}`, result.red.length, 'bad'), tile(`Orange (to call) · ${on}`, result.orange.length, 'warn'));
    }
    if (!returns.error) out.push(tile('Back training (Red / Orange returns)', returns.count, 'good'));
    return out;
  })());

  if (gmCan('pastdue.view')) jobs.push((async () => {
    const { data, error } = await client.from('past_due_import_runs').select('bills_added, bills_cleared')
      .gte('ran_at', gmSydneyMidnight(start)).lt('ran_at', gmSydneyMidnight(gmAddDays(friday, 1)));
    const out = error ? [] : [
      tile('New past due bills', data.reduce((sum, row) => sum + row.bills_added, 0)),
      tile('Past due bills cleared', data.reduce((sum, row) => sum + row.bills_cleared, 0), 'good')
    ];
    // Only today's balance is kept, so "owing" shows for the current week only.
    if (gmToday() >= start && gmToday() <= friday) {
      const owing = await client.from('past_due_member_log').select('amount_due').eq('status', 'PAST DUE');
      if (!owing.error) out.push(tile(`Past due owing now · ${owing.data.length} bills`, gmFormat('money', owing.data.reduce((sum, row) => sum + Number(row.amount_due || 0), 0)), 'warn'));
    }
    return out;
  })());

  if (gmCan('ads.view')) jobs.push(gmAdWeek(client, start).then(ads => (ads ? [
    tile(`Ads delivering · ${ads.range}`, ads.active),
    ...(ads.top ? [tile(`Most leads · ${ads.top.name}`, ads.top.leads)] : [])
  ] : [])));

  const results = await Promise.allSettled(jobs);
  if (document.getElementById('gmWeek').value !== friday) return; // the week changed while loading
  const tiles = results.flatMap(result => result.value || []);
  box.innerHTML = tiles.length ? tiles.join('') : '<p class="pd-notice">Nothing from the other reports for this week.</p>';
}

// The form starts from what is saved. Empty boxes get the figure from the other reports, tagged "from the
// app". On an open week those stay live (not saved) unless changed, so they keep updating; on a closed
// week saving stores them. Any week, locked or not, can be corrected here.
async function gmOpenWeek() {
  const friday = document.getElementById('gmWeek').value;
  const week = gmStored.get(friday) || {};
  document.getElementById('gmWeekTitle').textContent = `Week ending ${gmDate(friday, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
  let group = '';
  const sections = [];
  GM_ROWS.forEach(row => {
    if (row.head) { group = row.head; return; }
    if (row.calc) return;
    let value = gmNum(week[row.key]);
    if (row.kind === 'pct' && value !== null) value = Math.round(value * 1000) / 10;
    const field = `<label><span>${gmEsc(row.label)}${row.kind === 'pct' ? ' (%)' : row.kind === 'money' ? ' ($)' : ''}<em class="gm-filled" hidden>from the app</em></span>
      <input type="number" name="${row.key}" min="0" step="${row.kind === 'int' ? '1' : 'any'}" inputmode="decimal" value="${value ?? ''}"></label>`;
    const last = sections[sections.length - 1];
    if (last && last.group === group) last.fields.push(field);
    else sections.push({ group, fields: [field] });
  });
  document.getElementById('gmWeekFields').innerHTML = sections.map(section =>
    `<fieldset class="gm-fieldset"><legend>${gmEsc(section.group)}</legend><div class="gm-fields">${section.fields.join('')}</div></fieldset>`).join('');
  document.getElementById('gmWeekDialog').showModal();

  const form = document.getElementById('gmWeekForm');
  const { values, notes } = gmLive.has(friday)
    ? { values: gmLive.get(friday), notes: [] }
    : await gmComputeWeek(await gmClient(), friday, gmCan, { score: [...gmScore.values()], weeklyLog: gmWeeklyLog, pricing: gmPricing });
  Object.entries(values).forEach(([key, value]) => {
    const input = form.elements[key];
    if (!input || input.value !== '' || value === null || value === undefined) return;
    input.value = gmRow(key).kind === 'pct' ? Math.round(value * 1000) / 10 : value;
    input.dataset.auto = input.value;
    input.closest('label').querySelector('.gm-filled').hidden = false;
  });
  if (notes.length) gmToast(`Note: ${notes.join('; ')}.`, false, true);
}

async function gmSaveWeek(event) {
  event.preventDefault();
  const form = event.target;
  const friday = document.getElementById('gmWeek').value;
  const row = { week_ending: friday };
  GM_INPUTS.forEach(field => {
    const input = form.elements[field.key];
    // Left as the app filled it on an open week: not saved, so it stays live.
    if (gmLive.has(friday) && input.dataset.auto !== undefined && input.value === input.dataset.auto) { row[field.key] = null; return; }
    let value = gmNum(input.value);
    if (field.kind === 'pct' && value !== null) value /= 100;
    row[field.key] = value;
  });
  try {
    const client = await gmClient();
    const { data, error } = await client.from(GM_WEEKLY).upsert(row, { onConflict: 'week_ending' }).select().single();
    if (error) throw error;
    gmStored.set(friday, data);
    gmBuildWeeks();
    document.getElementById('gmWeekDialog').close();
    gmRenderWeekly();
    gmToast('Week saved.');
  } catch (error) {
    gmToast(`Could not save the week: ${error.message}`, true);
  }
}

// ── Trial waves ──────────────────────────────────────────────────────────────

function gmWaveOptions() {
  const select = document.getElementById('gmWave');
  const thisMonth = gmMonthStart(gmToday());
  const chosen = select.value || thisMonth;
  const months = new Set([thisMonth, gmMonthStart(gmAddDays(thisMonth, 32)), ...gmMembers.map(member => member.wave_month)]);
  select.innerHTML = [...months].sort().reverse().map(month => {
    const count = gmMembers.filter(member => member.wave_month === month).length;
    return `<option value="${month}"${month === chosen ? ' selected' : ''}>${gmDate(month, { month: 'long', year: 'numeric' })}${count ? ` · ${count}` : ''}</option>`;
  }).join('');
}

// Wave tiles double as filters: click one to show only those people (click again, or All, to clear).
let gmWaveFilter = 'all';
const GM_WAVE_FILTERS = {
  all: () => true,
  yes: member => member.rolled_over === true,
  no: member => member.rolled_over === false,
  open: member => member.rolled_over === null,
  notInducted: member => !member.inducted
};
const gmRolledChip = member => (member.rolled_over === true ? '<span class="fu-chip is-done">Yes</span>'
  : member.rolled_over === false ? '<span class="fu-chip is-no">No</span>' : '<span class="fu-chip is-tried">In progress</span>');

function gmRenderWaves() {
  gmWaveOptions();
  const month = document.getElementById('gmWave').value;
  const wave = gmMembers.filter(member => member.wave_month === month)
    .sort((a, b) => (a.induction_date || '9').localeCompare(b.induction_date || '9') || a.first_name.localeCompare(b.first_name));
  const rolled = wave.filter(GM_WAVE_FILTERS.yes).length;
  const target = Math.round(wave.length * 0.8);
  const pct = wave.length ? rolled / wave.length : null;
  const tile = (filter, label, value, extra = '') => `<button type="button" class="past-due-metric member-view-tile${extra}${gmWaveFilter === filter ? ' is-active' : ''}"
      data-wave-filter="${filter}" aria-pressed="${gmWaveFilter === filter}"><span>${label}</span><strong>${value}</strong></button>`;
  document.getElementById('gmWaveMetrics').innerHTML =
    tile('all', `Rollover % · target 80% · ${wave.length} in the wave`, gmFormat('pct', pct), ` key${pct === null ? '' : pct >= 0.8 ? ' is-good' : ' is-bad'}`)
    + tile('yes', `Rolled over · target ${target}`, rolled)
    + tile('no', 'Did not roll over', wave.filter(GM_WAVE_FILTERS.no).length)
    + tile('open', 'In progress', wave.filter(GM_WAVE_FILTERS.open).length)
    + tile('notInducted', 'Not inducted yet', wave.filter(GM_WAVE_FILTERS.notInducted).length);

  const query = document.getElementById('gmWaveSearch').value.trim().toLowerCase();
  const shown = wave.filter(GM_WAVE_FILTERS[gmWaveFilter])
    .filter(member => !query || `${member.first_name} ${member.last_name || ''} ${member.phone || ''} ${member.email || ''}`.toLowerCase().includes(query));
  document.getElementById('gmWaveCount').textContent = shown.length === wave.length
    ? `${wave.length} ${wave.length === 1 ? 'person' : 'people'}` : `${shown.length} of ${wave.length} people`;

  const box = document.getElementById('gmWaveTable');
  if (!wave.length) { box.innerHTML = '<p class="pd-notice">No one in this wave yet.</p>'; return; }
  if (!shown.length) { box.innerHTML = '<p class="pd-notice">No one matches. Clear the search or pick another tile.</p>'; return; }
  const choice = member => (member.rolled_over === true ? 'true' : member.rolled_over === false ? 'false' : '');
  box.innerHTML = `<table class="gm-waves"><thead><tr><th scope="col">Name</th><th scope="col">Inducted</th><th scope="col">Phone</th><th scope="col">Email</th>
      <th scope="col">Goal</th><th scope="col">Why</th><th scope="col">Notes</th><th scope="col">Rolled over</th>${gmCanEdit ? '<th scope="col"><span class="sr-only">Edit</span></th>' : ''}</tr></thead><tbody>
    ${shown.map(member => `<tr>
      <td>${gmCanEdit ? `<button type="button" class="gm-link" data-member="${member.id}">${gmEsc(`${member.first_name} ${member.last_name || ''}`.trim())}</button>` : gmEsc(`${member.first_name} ${member.last_name || ''}`.trim())}</td>
      <td>${member.inducted ? '<span class="fu-chip is-done">Inducted</span>' : '<span class="fu-chip is-todo">Not yet</span>'}${member.induction_date ? `<small class="pd-sub">${gmDate(member.induction_date, { day: 'numeric', month: 'short' })}</small>` : ''}</td>
      <td>${member.phone ? `<a href="tel:${gmEsc(member.phone.replace(/[^\d+]/g, ''))}">${gmEsc(member.phone)}</a>` : ''}</td>
      <td>${member.email ? `<a href="mailto:${gmEsc(member.email)}">${gmEsc(member.email)}</a>` : ''}</td>
      <td>${gmEsc(member.goal)}</td><td>${gmEsc(member.why)}</td><td>${gmEsc(member.notes)}</td>
      <td>${gmCanEdit
        ? `<select class="gm-rolled is-${{ true: 'yes', false: 'no', '': 'open' }[choice(member)]}" data-rolled="${member.id}" aria-label="Rolled over: ${gmEsc(member.first_name)}">
            ${[['', 'In progress'], ['true', 'Yes'], ['false', 'No']].map(([v, label]) => `<option value="${v}"${choice(member) === v ? ' selected' : ''}>${label}</option>`).join('')}</select>`
        : gmRolledChip(member)}</td>
      ${gmCanEdit ? `<td><button type="button" class="sop-action-button secondary pd-small" data-member="${member.id}" aria-label="Edit ${gmEsc(member.first_name)}">Edit</button></td>` : ''}
    </tr>`).join('')}</tbody></table>`;
}

function gmOpenMember(member) {
  gmEditingMember = member;
  const form = document.getElementById('gmMemberForm');
  form.reset();
  document.getElementById('gmMemberTitle').textContent = member ? 'Edit person' : `Add person · ${gmDate(document.getElementById('gmWave').value, { month: 'long', year: 'numeric' })} wave`;
  document.getElementById('gmMemberDelete').hidden = !member;
  if (member) {
    ['first_name', 'last_name', 'induction_date', 'email', 'phone', 'goal', 'why', 'notes'].forEach(key => { form.elements[key].value = member[key] || ''; });
    form.elements.inducted.checked = member.inducted;
    form.elements.rolled_over.value = member.rolled_over === null ? '' : String(member.rolled_over);
  }
  document.getElementById('gmMemberDialog').showModal();
}

async function gmSaveMember(event) {
  event.preventDefault();
  const form = event.target;
  const text = key => form.elements[key].value.trim() || null;
  const row = {
    first_name: text('first_name'), last_name: text('last_name'), induction_date: text('induction_date'),
    email: text('email'), phone: text('phone'), goal: text('goal'), why: text('why'), notes: text('notes'),
    inducted: form.elements.inducted.checked,
    rolled_over: form.elements.rolled_over.value === '' ? null : form.elements.rolled_over.value === 'true'
  };
  if (!row.first_name) return;
  try {
    const client = await gmClient();
    const query = gmEditingMember
      ? client.from(GM_WAVES).update(row).eq('id', gmEditingMember.id)
      : client.from(GM_WAVES).insert({ ...row, wave_month: document.getElementById('gmWave').value });
    const { data, error } = await query.select().single();
    if (error) throw error;
    gmMembers = [...gmMembers.filter(member => member.id !== data.id), data];
    document.getElementById('gmMemberDialog').close();
    gmRenderWaves();
    gmToast('Saved.');
  } catch (error) {
    gmToast(`Could not save: ${error.message}`, true);
  }
}

async function gmDeleteMember() {
  const member = gmEditingMember;
  if (!member || !window.confirm(`Remove ${member.first_name} from this wave? This can't be undone.`)) return;
  try {
    const client = await gmClient();
    const { error } = await client.from(GM_WAVES).delete().eq('id', member.id);
    if (error) throw error;
    gmMembers = gmMembers.filter(item => item.id !== member.id);
    document.getElementById('gmMemberDialog').close();
    gmRenderWaves();
    gmToast('Removed.');
  } catch (error) {
    gmToast(`Could not remove: ${error.message}`, true);
  }
}

// The nightly job does this too (js/geronimoCore.js gmSyncWaves); the button runs it now.
async function gmRunWaveSync() {
  const button = document.getElementById('gmSyncWaves');
  button.disabled = true;
  try {
    const client = await gmClient();
    const { added, updated } = await gmSyncWaves(client);
    const { data, error } = await client.from(GM_WAVES).select('*');
    if (error) throw error;
    gmMembers = data;
    gmRenderWaves();
    gmToast(`Added ${added} starter${added === 1 ? '' : 's'}, filled in details for ${updated} ${updated === 1 ? 'person' : 'people'}.`);
  } catch (error) {
    gmToast(`Could not update the waves: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function gmSaveRolled(select) {
  const member = gmMembers.find(item => String(item.id) === select.dataset.rolled);
  const rolled = select.value === '' ? null : select.value === 'true';
  try {
    const client = await gmClient();
    const { data, error } = await client.from(GM_WAVES).update({ rolled_over: rolled }).eq('id', member.id).select().single();
    if (error) throw error;
    Object.assign(member, data);
    gmRenderWaves();
    gmToast('Saved.');
  } catch (error) {
    gmToast(`Could not save: ${error.message}`, true);
    gmRenderWaves();
  }
}

// ── Scoreboard ───────────────────────────────────────────────────────────────

function gmMonthOptions() {
  const select = document.getElementById('gmMonth');
  const thisMonth = gmMonthStart(gmToday());
  const chosen = select.value || thisMonth;
  const months = new Set([thisMonth, ...[...gmScore.keys()].map(gmMonthStart)]);
  // Every month between the oldest on record and now, so empty months can be filled in too.
  const oldest = [...months].sort()[0];
  for (let month = oldest; month < thisMonth; month = gmMonthStart(gmAddDays(month, 32))) months.add(month);
  select.innerHTML = [...months].sort().reverse().map(month =>
    `<option value="${month}"${month === chosen ? ' selected' : ''}>${gmDate(month, { month: 'long', year: 'numeric' })}</option>`).join('');
}

function gmRenderScoreboard() {
  gmMonthOptions();
  const month = document.getElementById('gmMonth').value;
  const days = [];
  for (let day = month; day.startsWith(month.slice(0, 7)); day = gmAddDays(day, 1)) days.push(day);
  const rows = days.map(day => gmScore.get(day) || { day });
  const total = key => rows.reduce((sum, row) => sum + (row[key] || 0), 0);
  const net = row => (row.rollovers || 0) + (row.memberships || 0) - (row.cancels || 0);
  const monthNet = rows.reduce((sum, row) => sum + net(row), 0);
  const revenues = rows.map(row => gmNum(row[GM_REVENUE])).filter(value => value !== null);
  const revenueAvg = revenues.length ? revenues.reduce((a, b) => a + b, 0) / revenues.length : null;

  document.getElementById('gmScoreMetrics').innerHTML = `
    <div class="past-due-metric key${monthNet >= 0 ? ' is-good' : ' is-bad'}"><span>Net gain · ${gmDate(month, { month: 'long' })}</span><strong>${gmFormat('signed', monthNet)}</strong></div>
    ${GM_SCORE_FIELDS.map(([key, label]) => `<div class="past-due-metric"><span>${label}</span><strong>${total(key)}</strong></div>`).join('')}`;

  const today = gmToday();
  const dayLabel = day => gmDate(day, { day: 'numeric', month: 'long' });
  document.getElementById('gmScoreTable').innerHTML = `<table class="gm-score"><thead><tr><th scope="col">Day</th>
      ${GM_SCORE_FIELDS.map(([, label]) => `<th scope="col">${label}</th>`).join('')}<th scope="col">Net</th><th scope="col">30-day revenue ($)</th></tr></thead><tbody>
    ${rows.map(row => `<tr${row.day === today ? ' class="is-today"' : ''}><th scope="row">${gmDate(row.day, { weekday: 'short', day: 'numeric' })}</th>
      ${GM_SCORE_FIELDS.map(([key, label]) => `<td>${gmCanEdit
        ? `<input type="number" min="0" step="1" inputmode="numeric" data-day="${row.day}" data-field="${key}" value="${row[key] || ''}" placeholder="0" aria-label="${label}, ${dayLabel(row.day)}">`
        : row[key] || 0}</td>`).join('')}
      <td class="gm-net${net(row) > 0 ? ' is-good' : net(row) < 0 ? ' is-bad' : ''}">${gmFormat('signed', net(row))}</td>
      <td>${gmCanEdit
        ? `<input type="number" min="0" step="1" inputmode="numeric" class="gm-money" data-day="${row.day}" data-field="${GM_REVENUE}" value="${row[GM_REVENUE] ?? ''}" aria-label="Rolling 30 day revenue, ${dayLabel(row.day)}">`
        : gmFormat('money', gmNum(row[GM_REVENUE]))}</td></tr>`).join('')}
    </tbody><tfoot><tr><th scope="row">Total</th>${GM_SCORE_FIELDS.map(([key]) => `<td>${total(key)}</td>`).join('')}<td class="gm-net">${gmFormat('signed', monthNet)}</td>
      <td title="Average of the days entered">${revenueAvg === null ? '–' : `avg ${gmFormat('money', revenueAvg)}`}</td></tr></tfoot></table>`;
}

async function gmSaveScore(input) {
  const day = input.dataset.day;
  const row = { day };
  GM_SCORE_FIELDS.forEach(([key]) => {
    const box = document.querySelector(`[data-day="${day}"][data-field="${key}"]`);
    row[key] = Math.max(0, Math.round(Number(box.value) || 0));
  });
  const revenueBox = document.querySelector(`[data-day="${day}"][data-field="${GM_REVENUE}"]`);
  row[GM_REVENUE] = revenueBox.value === '' ? null : Math.max(0, Math.round(Number(revenueBox.value) || 0));
  const before = gmScore.get(day);
  if (before && GM_SCORE_FIELDS.every(([key]) => (before[key] || 0) === row[key]) && gmNum(before[GM_REVENUE]) === row[GM_REVENUE]) return;
  try {
    const client = await gmClient();
    const { data, error } = await client.from(GM_SCORE).upsert(row, { onConflict: 'day' }).select().single();
    if (error) throw error;
    gmScore.set(day, data);
    // Re-rendering replaces the boxes: keep focus on the one the user tabbed to.
    const focus = document.activeElement?.dataset || {};
    gmRenderScoreboard();
    if (focus.day) document.querySelector(`[data-day="${focus.day}"][data-field="${focus.field}"]`)?.focus();
  } catch (error) {
    gmToast(`Could not save ${gmDate(day, { day: 'numeric', month: 'short' })}: ${error.message}`, true);
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

async function gmLoad() {
  try {
    const client = await gmClient();
    const monday = gmCan('monday.view');
    const [weeks, members, score, log, pricing] = await Promise.all([
      client.from(GM_WEEKLY).select('*').order('week_ending', { ascending: false }),
      client.from(GM_WAVES).select('*'),
      client.from(GM_SCORE).select('*'),
      // Monday Board figures for the expected-revenue row; optional, so their errors only blank that row.
      monday ? client.from('membership_weekly_log').select('*').order('report_date', { ascending: false }) : {},
      monday ? client.from('pricing_settings').select('key, value') : {}
    ]);
    const error = weeks.error || members.error || score.error;
    if (error) throw error;
    gmStored = new Map(weeks.data.map(row => [row.week_ending, row]));
    gmMembers = members.data;
    gmScore = new Map(score.data.map(row => [row.day, row]));
    gmWeeklyLog = log.data || [];
    gmPricing = Object.fromEntries((pricing.data || []).map(row => [row.key, row.value]));
    gmBuildWeeks();
    gmRenderWeekly();
    gmRenderWaves();
    gmRenderScoreboard();
    gmLoadLive().catch(error => gmToast(`Could not work out this week's figures: ${error.message}`, true));
  } catch (error) {
    const notice = gmNeedsSetup(error) ? gmSetupNotice : `<p class="pd-notice">Could not load the report: ${gmEsc(error.message)}</p>`;
    ['gmWeekTable', 'gmWaveTable', 'gmScoreTable', 'gmExtras'].forEach(id => { document.getElementById(id).innerHTML = notice; });
  }
}

async function gmInit() {
  // Roles not set up yet (null) keep today's open access; the database enforces the same switches.
  // No view switch: js/access.js has already replaced the page with a "No access" card.
  // js/auth.js adds js/access.js after sign-in without waiting for it, so give it a moment to appear.
  // ponytail: short poll; an "access ready" event from auth.js would remove it.
  if (window.authReady) await window.authReady;
  for (let i = 0; i < 40 && !window.portalAccess; i++) await new Promise(resolve => setTimeout(resolve, 50));
  const access = window.portalAccess ? await window.portalAccess : null;
  if (access && !access.can('geronimo.view')) return;
  if (access) gmCan = access.can;
  gmCanEdit = gmCan('geronimo.edit');

  const tabs = document.querySelectorAll('nav.site-nav button');
  tabs.forEach(button => button.addEventListener('click', () => {
    tabs.forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${button.dataset.tab}`));
  }));

  document.getElementById('gmWeek').addEventListener('change', () => { gmRenderWeekMetrics(); gmRenderWeekTable(); gmRenderExtras(); });
  document.getElementById('gmWeekTable').addEventListener('click', event => {
    const pick = event.target.closest('[data-week]');
    if (!pick) return;
    document.getElementById('gmWeek').value = pick.dataset.week;
    gmRenderWeekMetrics();
    gmRenderWeekTable();
    gmRenderExtras();
  });
  const sync = document.getElementById('gmSyncWaves');
  if (gmCan('monday.view')) sync.addEventListener('click', gmRunWaveSync);
  else sync.hidden = true;
  document.getElementById('gmEditWeek').addEventListener('click', () => gmOpenWeek().catch(error => gmToast(error.message, true)));
  document.getElementById('gmWeekCancel').addEventListener('click', () => document.getElementById('gmWeekDialog').close());
  document.getElementById('gmWeekForm').addEventListener('submit', gmSaveWeek);

  document.getElementById('gmWave').addEventListener('change', gmRenderWaves);
  document.getElementById('gmWaveSearch').addEventListener('input', gmRenderWaves);
  document.getElementById('gmWaveMetrics').addEventListener('click', event => {
    const tile = event.target.closest('[data-wave-filter]');
    if (!tile) return;
    gmWaveFilter = gmWaveFilter === tile.dataset.waveFilter ? 'all' : tile.dataset.waveFilter;
    gmRenderWaves();
  });
  document.getElementById('gmAddMember').addEventListener('click', () => gmOpenMember(null));
  document.getElementById('gmWaveTable').addEventListener('click', event => {
    const button = event.target.closest('[data-member]');
    if (button) gmOpenMember(gmMembers.find(member => String(member.id) === button.dataset.member));
  });
  document.getElementById('gmWaveTable').addEventListener('change', event => { if (event.target.dataset.rolled) gmSaveRolled(event.target); });
  document.getElementById('gmMemberCancel').addEventListener('click', () => document.getElementById('gmMemberDialog').close());
  document.getElementById('gmMemberDelete').addEventListener('click', gmDeleteMember);
  document.getElementById('gmMemberForm').addEventListener('submit', gmSaveMember);

  document.getElementById('gmMonth').addEventListener('change', gmRenderScoreboard);
  document.getElementById('gmScoreTable').addEventListener('change', event => { if (event.target.dataset.day) gmSaveScore(event.target); });

  gmLoad();
}

document.addEventListener('DOMContentLoaded', gmInit);
