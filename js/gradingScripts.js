// Grading report (pages/REPORTs/GradingReport.html). Data: the nightly Zen Planner snapshot
// (grading_members, automation/zenplanner-grading.mjs) with rank hours and testing dates kept in the
// portal (grading_ranks, grading_test_dates; supabase/grading.sql). Rules: js/gradingCore.js.
// Replaces the Grading Report Google Sheet.

let gradingMembers = [];
let gradingRanks = [];
let gradingDates = [];

const gradingToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const gradingDmy = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const gradingName = member => [member.first_name, member.last_name].filter(Boolean).join(' ');
const PROGRAM_LABEL = { adults: 'Regular Adult', juniors: 'Juniors' };

// Every member with their figures, in rank order then by hours since the last test.
function gradingRows(program) {
  const today = gradingToday();
  return gradingMembers
    .filter(member => !program || member.program === program)
    .map(member => ({ member, status: gradingStatus(member, gradingRanks, gradingDates, today) }))
    .sort((a, b) => (a.member.program === b.member.program ? 0 : a.member.program === 'adults' ? -1 : 1)
      || a.status.order - b.status.order || (Number(a.member.att_since_test) || 0) - (Number(b.member.att_since_test) || 0)
      || gradingName(a.member).localeCompare(gradingName(b.member)));
}

const cellNumber = value => (value == null || value === '' ? '' : String(value));

function classify(headerLower, cellLower) {
  if (headerLower.indexOf('eligib') !== -1) {
    return cellLower === 'eligible' ? 'eligible' : 'not-eligible';
  }
  if (cellLower === 'eligible') return 'eligible'; // Weekly Hour Goal shows "Eligible" once the hours are met
  if (headerLower.indexOf('enough att') !== -1) {
    return cellLower === 'yes' ? 'yes' : 'no';
  }
  return '';
}

function renderTable(container, block) {
  if (!block.rows.length) {
    container.innerHTML = '<div class="empty">No data found.</div>';
    return;
  }
  // Attendance since the last test is drawn as a stitch run toward the hours needed.
  const sinceIdx = block.headers.findIndex(h => /since test/i.test(h));
  const neededIdx = block.headers.findIndex(h => /hours needed/i.test(h));
  const numCols = numericColumns(block);
  let html = '<table class="filterable stack"><thead><tr>';
  block.headers.forEach((h, c) => { html += '<th' + (numCols[c] ? ' class="num"' : '') + '>' + escapeHtml(h) + '</th>'; });
  html += '</tr></thead><tbody>';
  block.rows.forEach(row => {
    html += '<tr>';
    row.forEach((cell, c) => {
      const cls = classify(String(block.headers[c] || '').toLowerCase(), String(cell).toLowerCase()) + (numCols[c] ? ' num' : '');
      const label = ' data-label="' + escapeHtml(block.headers[c] || '') + '"';
      const needed = neededIdx >= 0 ? parseFloat(row[neededIdx]) : NaN;
      if (c === sinceIdx && needed > 0 && !isNaN(parseFloat(cell))) {
        const p = Math.min(parseFloat(cell) / needed, 1);
        html += '<td class="measure ' + cls + '"' + label + '>' + escapeHtml(cell) + ' / ' + escapeHtml(row[neededIdx]) +
          '<span class="stitch-meter' + (p >= 1 ? ' done' : '') + '" style="--p:' + p.toFixed(2) + '" aria-hidden="true"></span></td>';
        return;
      }
      // Eligible / Yes as a green chip, Not eligible / No as a grey one (same chips as the other reports).
      const text = escapeHtml(String(cell ?? '').trim() || '—');
      const chip = { eligible: 'is-done', yes: 'is-done', 'not-eligible': 'is-todo', no: 'is-todo' }[cls.trim().split(' ')[0]];
      html += '<td class="' + cls + '"' + label + '>' + (chip && text !== '—' ? '<span class="fu-chip ' + chip + '">' + text + '</span>' : text) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// A column is numeric when every non-empty cell is a plain number.
function numericColumns(block) {
  const isNum = v => /^-?\d+(\.\d+)?$/.test(String(v).trim());
  return block.headers.map((_, c) => {
    const values = block.rows.map(r => r[c]).filter(v => String(v).trim() !== '');
    return values.length > 0 && values.every(isNum);
  });
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function renderHome() {
  const all = gradingRows();
  const eligible = program => all.filter(({ member, status }) => member.program === program && status.eligible);
  const block = list => ({
    headers: ['Name', 'Rank', 'Att. Total', 'Att. Since Test', 'Hours Needed', 'Eligibility'],
    rows: list.map(({ member, status }) => [gradingName(member), member.rank, cellNumber(member.att_total), cellNumber(member.att_since_test), cellNumber(status.needed), 'Eligible'])
  });
  const adults = eligible('adults');
  const juniors = eligible('juniors');
  renderTable(document.getElementById('home-adults-wrap'), block(adults));
  renderTable(document.getElementById('home-juniors-wrap'), block(juniors));
  document.getElementById('gradingKeyFigure').innerHTML =
    '<div class="past-due-metric key"><span>Eligible to grade</span><strong>' + (adults.length + juniors.length) + '</strong></div>' +
    '<div class="past-due-metric"><span>Regular adults</span><strong>' + adults.length + '</strong></div>' +
    '<div class="past-due-metric"><span>Juniors</span><strong>' + juniors.length + '</strong></div>';

  // Members within 3 hours of the hours needed: who to line up for the next grading.
  const close = all.filter(({ status }) => status.short > 0 && status.short <= CLOSE_HOURS)
    .sort((a, b) => a.status.short - b.status.short);
  const wrap = document.getElementById('home-close-wrap');
  renderTable(wrap, {
    headers: ['Name', 'Group', 'Rank', 'Att. Since Test', 'Hours Needed'],
    rows: close.map(({ member, status }) => [gradingName(member), PROGRAM_LABEL[member.program], member.rank, cellNumber(member.att_since_test), cellNumber(status.needed)])
  });
  if (!close.length) wrap.innerHTML = '<div class="empty">Nobody is within ' + CLOSE_HOURS + ' hours yet.</div>';
}
const CLOSE_HOURS = 3;

function renderProgram(program) {
  renderTable(document.getElementById(`${program}-wrap`), {
    headers: ['Name', 'Rank', 'Att. Total', 'Att. Since Test', 'Hours Needed', 'Weekly Hour Goal', 'Next Test Date'],
    rows: gradingRows(program).map(({ member, status }) => [
      gradingName(member), member.rank, cellNumber(member.att_total), cellNumber(member.att_since_test), cellNumber(status.needed),
      status.eligible ? 'Eligible' : cellNumber(status.weeklyGoal), gradingDmy(status.testDate)
    ])
  });
}

function renderMembers() {
  renderTable(document.getElementById('members-wrap'), {
    headers: ['Name', 'Rank', 'Att. Total', 'Att. Since Test', 'Enough Att. For Rank?', 'Last Test Date', 'Age', 'Program', 'Program Status'],
    rows: gradingRows().map(({ member, status }) => [
      gradingName(member), member.rank, cellNumber(member.att_total), cellNumber(member.att_since_test), status.eligible ? 'Yes' : 'No',
      gradingDmy(member.last_test_date), cellNumber(member.age), member.program_name || PROGRAM_LABEL[member.program], member.status
    ])
  });
}

// Ranks & dates: required hours and testing-date groups (edited with "grading.edit").
function renderRanks() {
  const canEdit = !window.gradingAccess || window.gradingAccess.can('grading.edit');
  const lock = canEdit ? '' : ' disabled';
  const groupOptions = program => gradingDates.filter(date => date.program === program);
  document.getElementById('ranks-dates').innerHTML = `<div class="grading-dates">${gradingDates.map(date => `
    <label class="grading-date"><span>${escapeHtml(date.label)}</span>
      <input type="date" data-date-group="${escapeHtml(date.test_group)}" value="${escapeHtml(date.test_date || '')}"${lock}></label>`).join('')}</div>`;
  ['adults', 'juniors'].forEach(program => {
    const rows = gradingRanks.filter(rank => rank.program === program).sort((a, b) => a.sort_order - b.sort_order);
    const counts = gradingMembers.filter(member => member.program === program)
      .reduce((all, member) => all.set(gradingRankKey(member.rank), (all.get(gradingRankKey(member.rank)) || 0) + 1), new Map());
    document.getElementById(`ranks-${program}`).innerHTML = `<table class="grading-rank-table"><thead><tr><th>Rank</th><th class="num">Hours needed</th><th>Testing date</th><th class="num">Members</th></tr></thead><tbody>${rows.map(rank => `
      <tr data-rank-program="${program}" data-rank="${escapeHtml(rank.rank)}">
        <td data-label="Rank">${escapeHtml(rank.rank)}</td>
        <td class="num" data-label="Hours needed"><input type="number" min="0" step="1" inputmode="numeric" aria-label="Hours needed, ${escapeHtml(rank.rank)}" data-field="req_hours" value="${rank.req_hours ?? ''}" placeholder="None"${lock}></td>
        <td data-label="Testing date"><select aria-label="Testing date group, ${escapeHtml(rank.rank)}" data-field="test_group"${lock}>${groupOptions(program).map(date => `<option value="${escapeHtml(date.test_group)}"${date.test_group === rank.test_group ? ' selected' : ''}>${escapeHtml(date.label)}</option>`).join('')}</select></td>
        <td class="num" data-label="Members">${counts.get(gradingRankKey(rank.rank)) || 0}</td>
      </tr>`).join('')}</tbody></table>`;
  });
  // Zen Planner ranks with no row here would silently get no hours needed: list them.
  const unknown = [...new Set(gradingMembers.filter(member => member.rank && !gradingStatus(member, gradingRanks, gradingDates, gradingToday()).rankFound)
    .map(member => `${PROGRAM_LABEL[member.program]}: ${member.rank}`))];
  const box = document.getElementById('ranks-unknown');
  box.hidden = !unknown.length;
  box.innerHTML = unknown.length ? `<p class="pd-notice">These Zen Planner ranks aren't in the table, so their members show no hours needed: ${unknown.map(escapeHtml).join(', ')}. Ask the dev to add them.</p>` : '';
  document.getElementById('ranksSave').hidden = !canEdit;
}

async function saveRanks() {
  const button = document.getElementById('ranksSave');
  button.disabled = true;
  try {
    const client = window.supabaseClient;
    const changes = [];
    document.querySelectorAll('[data-date-group]').forEach(input => {
      const date = gradingDates.find(item => item.test_group === input.dataset.dateGroup);
      if ((date.test_date || '') !== input.value) changes.push(client.from('grading_test_dates').update({ test_date: input.value || null }).eq('test_group', date.test_group).select('test_group'));
    });
    document.querySelectorAll('[data-rank-program]').forEach(row => {
      const rank = gradingRanks.find(item => item.program === row.dataset.rankProgram && item.rank === row.dataset.rank);
      const hours = row.querySelector('[data-field="req_hours"]').value;
      const group = row.querySelector('[data-field="test_group"]').value;
      const patch = {};
      if (String(rank.req_hours ?? '') !== hours) patch.req_hours = hours === '' ? null : Number(hours);
      if (rank.test_group !== group) patch.test_group = group;
      if (Object.keys(patch).length) changes.push(client.from('grading_ranks').update(patch).eq('program', rank.program).eq('rank', rank.rank).select('rank'));
    });
    if (!changes.length) { gradingSay('Nothing changed.'); return; }
    const results = await Promise.all(changes);
    const failed = results.find(result => result.error || !result.data?.length);
    if (failed) throw new Error(failed.error?.message || 'Not saved: your role can\'t change ranks or dates.');
    await gradingLoad();
    gradingSay(`Saved ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}. Every tab now uses them.`);
  } catch (error) {
    gradingSay(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function gradingSay(text, bad) {
  const status = document.getElementById('gradingStatus');
  status.textContent = text;
  status.classList.toggle('is-bad', Boolean(bad));
}

async function gradingSync(button) {
  button.disabled = true;
  try {
    const { error } = await window.supabaseClient.functions.invoke('run-pastdue-sync', { body: { job: 'grading' } });
    if (error) throw new Error(await error.context?.text?.().catch(() => '') || error.message);
    gradingSay('Sync started. The report updates in about 3 minutes; refresh the page then.');
  } catch (error) {
    gradingSay(error.message || 'Could not start the sync.', true);
  } finally {
    button.disabled = false;
  }
}

function showError(elId, err) {
  document.getElementById(elId).innerHTML = '<div class="error">' + escapeHtml(err.message || err) + '</div>';
}

// ── Load ─────────────────────────────────────────────────────────────────────

const RENDER = { home: renderHome, adults: () => renderProgram('adults'), juniors: () => renderProgram('juniors'), members: renderMembers, ranks: renderRanks };
let gradingTab = 'home';

async function gradingLoad() {
  await window.authReady;
  const client = window.supabaseClient;
  const [members, ranks, dates] = await Promise.all([
    client.from('grading_members').select('*'),
    client.from('grading_ranks').select('*'),
    client.from('grading_test_dates').select('*').order('test_group')
  ]);
  const error = members.error || ranks.error || dates.error;
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? 'The Grading report needs a one-time database update: run supabase/grading.sql in Supabase.' : error.message);
  gradingMembers = members.data.filter(gradingIncluded); // same rules as the sync, for rows saved before a rule changed
  gradingRanks = ranks.data;
  gradingDates = dates.data;
  const synced = gradingMembers.map(member => member.synced_at).sort().pop();
  document.getElementById('updatedLine').textContent = synced
    ? `Zen Planner data from ${new Date(synced).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${gradingMembers.length} students`
    : 'No Zen Planner data yet: press Sync now, or wait for tonight\'s sync.';
  RENDER[gradingTab]();
}

function initGradingPage() {
  const navButtons = document.querySelectorAll('nav.site-nav button');
  if (!navButtons.length || !document.querySelector('.tab-panel')) return;

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      gradingTab = btn.dataset.tab;
      if (gradingMembers.length || gradingRanks.length) RENDER[gradingTab]();
    });
  });

  const filterInput = document.getElementById('filterInput');
  if (filterInput) {
    filterInput.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('.tab-panel.active table.filterable').forEach(table => {
        table.querySelectorAll('tbody tr').forEach(row => {
          row.style.display = row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
        });
      });
    });
  }

  document.getElementById('gradingSyncBtn')?.addEventListener('click', event => gradingSync(event.currentTarget));
  document.getElementById('ranksSave')?.addEventListener('click', saveRanks);

  (async () => {
    window.gradingAccess = await window.portalAccess?.catch(() => null);
  })();
  gradingLoad().catch(error => {
    document.getElementById('updatedLine').textContent = 'Could not load the Grading report.';
    ['home-adults-wrap', 'home-juniors-wrap', 'home-close-wrap', 'adults-wrap', 'juniors-wrap', 'members-wrap'].forEach(id => showError(id, error));
  });
}

initGradingPage();
