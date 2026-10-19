// Monday Board > ALL MEMBERS: every Zen Planner membership, any status (supabase/membership_all.sql),
// refreshed nightly by automation/zenplanner-followup.mjs. 3,000+ rows, so filtering, sorting, counting
// and paging all run in the database; only one page of rows is ever loaded.

const AM_TABLE = 'membership_all';
const AM_PAGE = 50;
const AM_STATUSES = [['CURRENT', 'Current'], ['NOT STARTED', 'Not started'], ['HOLD', 'Hold'], ['CANCEL PENDING', 'Cancel pending'], ['CANCELED', 'Cancelled'], ['COMPLETED', 'Completed']];
const AM_SORTS = {
  begin_desc: ['mbr_begin_date', false], begin_asc: ['mbr_begin_date', true],
  end_asc: ['mbr_end_date', true], end_desc: ['mbr_end_date', false], name: ['last_name', true]
};
let amPage = 0;
let amSearchTimer = null;
let amRun = 0; // latest load wins when filters change quickly

const amEsc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const amDate = iso => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const amEl = id => document.getElementById(id);

async function amClient() {
  if (window.authReady) await window.authReady;
  if (!window.supabaseClient) throw new Error('Your session has ended. Please sign in again.');
  return window.supabaseClient;
}

function amFilters() {
  return {
    q: amEl('amSearch').value.trim(), status: amEl('amStatusFilter').value, label: amEl('amLabelFilter').value,
    autopay: amEl('amAutopayFilter').value, dateField: amEl('amDateField').value, from: amEl('amFrom').value, to: amEl('amTo').value
  };
}

// The filters as a query. Each search word must match the first name, last name or number.
function amQuery(client, select, options, skipStatus = false) {
  const f = amFilters();
  let query = client.from(AM_TABLE).select(select, options);
  f.q.split(/\s+/).map(word => word.replace(/[%*,().\\:"']/g, '')).filter(Boolean).forEach(word => {
    query = query.or(`first_name.ilike.*${word}*,last_name.ilike.*${word}*,number.ilike.*${word}*`);
  });
  if (f.status && !skipStatus) query = query.eq('mbr_status', f.status);
  if (f.label === '__none') query = query.is('membership_label', null);
  else if (f.label) query = query.eq('membership_label', f.label);
  if (f.autopay) query = query.eq('autopay', f.autopay);
  if (f.from) query = query.gte(f.dateField, f.from);
  if (f.to) query = query.lte(f.dateField, f.to);
  return query;
}

const amSorted = query => {
  const [column, ascending] = AM_SORTS[amEl('amSort').value] || AM_SORTS.begin_desc;
  return query.order(column, { ascending, nullsFirst: false }).order('number', { ascending: false });
};

// Status tiles: how many memberships of each status match the other filters. Click one to filter by it.
async function amRenderStatus(client, run) {
  const counts = await Promise.all(AM_STATUSES.map(([status]) =>
    amQuery(client, 'number', { count: 'exact', head: true }, true).eq('mbr_status', status).then(({ count }) => count || 0)));
  if (run !== amRun) return;
  const chosen = amEl('amStatusFilter').value;
  const total = counts.reduce((a, b) => a + b, 0);
  const tile = (status, label, count, extra = '') => `<button type="button" class="past-due-metric member-view-tile${extra}${chosen === status ? ' is-active' : ''}"
      data-am-status="${amEsc(status)}" aria-pressed="${chosen === status}"><span>${amEsc(label)}</span><strong>${count.toLocaleString('en-AU')}</strong></button>`;
  amEl('amStatus').innerHTML = tile('', 'All memberships', total, ' key') + AM_STATUSES.map(([status, label], i) => tile(status, label, counts[i])).join('');
}

async function amLoad() {
  const run = ++amRun;
  const wrap = amEl('amTable');
  try {
    const client = await amClient();
    amRenderStatus(client, run).catch(() => {});
    const { data, count, error } = await amSorted(amQuery(client, '*', { count: 'exact' })).range(amPage * AM_PAGE, amPage * AM_PAGE + AM_PAGE - 1);
    if (error) throw error;
    if (run !== amRun) return;
    const first = count ? amPage * AM_PAGE + 1 : 0;
    const last = Math.min((amPage + 1) * AM_PAGE, count || 0);
    amEl('amCount').textContent = `${(count || 0).toLocaleString('en-AU')} membership${count === 1 ? '' : 's'}`;
    amEl('amPageInfo').textContent = count ? `${first.toLocaleString('en-AU')}–${last.toLocaleString('en-AU')} of ${count.toLocaleString('en-AU')}` : '';
    amEl('amPrev').disabled = amPage === 0;
    amEl('amNext').disabled = last >= (count || 0);
    wrap.innerHTML = data.length ? `<table class="stack">
        <thead><tr><th>Number</th><th>Name</th><th>Membership</th><th>Status</th><th>Begins</th><th>Ends</th><th>Autopay</th></tr></thead>
        <tbody>${data.map(row => `<tr>
          <td data-label="Number">${amEsc(row.number)}</td>
          <td data-label="Name"><strong>${amEsc([row.first_name, row.last_name].filter(Boolean).join(' ') || '—')}</strong></td>
          <td data-label="Membership">${amEsc(row.membership_label || '—')}</td>
          <td data-label="Status">${amEsc((AM_STATUSES.find(([status]) => status === row.mbr_status) || [, row.mbr_status || '—'])[1])}</td>
          <td data-label="Begins">${amDate(row.mbr_begin_date)}</td>
          <td data-label="Ends">${amDate(row.mbr_end_date)}</td>
          <td data-label="Autopay">${amEsc(row.autopay || '—')}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No memberships match these filters.</div>';
  } catch (error) {
    const missing = /does not exist|schema cache/i.test(error.message || '');
    wrap.innerHTML = `<div class="empty">${missing ? 'This tab needs a one-time database update: run <code>supabase/membership_all.sql</code>. The nightly Zen Planner job fills it.' : amEsc(error.message)}</div>`;
  }
}

const amReload = () => { amPage = 0; amLoad(); };

// Membership names for the filter, and when the list was last refreshed.
async function amLoadOptions() {
  const client = await amClient();
  const labels = new Set();
  let blank = false;
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await client.from(AM_TABLE).select('membership_label').range(from, from + 999);
    if (error) return;
    data.forEach(row => (row.membership_label ? labels.add(row.membership_label) : (blank = true)));
    if (data.length < 1000) break;
  }
  amEl('amLabelFilter').innerHTML = '<option value="">All memberships</option>'
    + [...labels].sort().map(label => `<option value="${amEsc(label)}">${amEsc(label)}</option>`).join('')
    + (blank ? '<option value="__none">(no membership name)</option>' : '');
  const { data } = await client.from(AM_TABLE).select('synced_at').order('synced_at', { ascending: false }).limit(1);
  if (data?.[0]) amEl('amSynced').textContent = `Updated from Zen Planner ${new Date(data[0].synced_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

// Export every matching membership (not just this page), 1,000 rows at a time.
async function amExport() {
  const button = amEl('amExport');
  button.disabled = true;
  try {
    const client = await amClient();
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await amSorted(amQuery(client, '*')).range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const cols = [['Number', 'number'], ['First name', 'first_name'], ['Last name', 'last_name'], ['Membership', 'membership_label'],
      ['Status', 'mbr_status'], ['Begins', 'mbr_begin_date'], ['Ends', 'mbr_end_date'], ['Autopay', 'autopay']];
    // Quote every cell; a leading = + - @ is defused so a spreadsheet never runs it as a formula.
    const cell = value => `"${String(value ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
    const csv = [cols.map(([label]) => cell(label)), ...rows.map(row => cols.map(([, key]) => cell(row[key])))].map(line => line.join(',')).join('\r\n');
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `all-members-${new Date().toISOString().slice(0, 10)}.csv` });
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    window.alert(`Export failed: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function amInit() {
  amEl('amSearch').addEventListener('input', () => { clearTimeout(amSearchTimer); amSearchTimer = setTimeout(amReload, 300); });
  ['amStatusFilter', 'amLabelFilter', 'amAutopayFilter', 'amDateField', 'amFrom', 'amTo', 'amSort'].forEach(id => amEl(id).addEventListener('change', amReload));
  amEl('amFilters').addEventListener('submit', event => event.preventDefault());
  amEl('amClear').addEventListener('click', () => { amEl('amFilters').reset(); amReload(); });
  amEl('amStatus').addEventListener('click', event => {
    const tile = event.target.closest('[data-am-status]');
    if (!tile) return;
    amEl('amStatusFilter').value = tile.dataset.amStatus;
    amReload();
  });
  amEl('amPrev').addEventListener('click', () => { amPage = Math.max(0, amPage - 1); amLoad(); });
  amEl('amNext').addEventListener('click', () => { amPage += 1; amLoad(); });
  amEl('amExport').addEventListener('click', amExport);
  amLoadOptions().catch(() => {});
  amLoad();
}

// Loads the first time the tab is opened.
document.addEventListener('DOMContentLoaded', () => {
  const tab = document.querySelector('nav.site-nav [data-tab="allMembers"]');
  tab?.addEventListener('click', () => { if (!amInit.done) { amInit.done = true; amInit(); } });
});
