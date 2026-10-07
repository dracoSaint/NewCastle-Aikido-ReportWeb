// Red / Orange Follow-Up Report: the page. The rules live in js/followUpCore.js
// (shared with the weekly Zen Planner job), which must load before this file.

const FU_TABLE = 'follow_up_reports';

let fuReports = [];      // history: [{ id, report_date, created_at, created_by }]
let fuCurrent = null;    // the report on screen (full row)

// ── Small helpers ────────────────────────────────────────────────────────────

const fuEsc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
function fuToast(message, isError = false) {
  const toast = document.getElementById('fuToast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  clearTimeout(fuToast.timer);
  fuToast.timer = setTimeout(() => { toast.hidden = true; }, isError ? 6000 : 2500);
}

async function fuClient() {
  if (window.authReady) await window.authReady;
  if (!window.supabaseClient) throw new Error('Your session has ended. Please sign in again.');
  return window.supabaseClient;
}

// Read an uploaded file as text (Meta and Zen Planner exports may be UTF-16).
async function fuFileText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new TextDecoder(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : 'utf-8').decode(bytes);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function fuTierCard(title, owner, tone, rows, withDays) {
  const body = rows.length
    ? `<table class="stack ar-table fu-table">
        <thead><tr><th>Name</th><th>Phone</th>${withDays ? '<th>Last att.</th><th class="num">Days</th>' : ''}<th>Note</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${rows.map(row => `
          <tr data-key="${fuEsc(row.key)}">
            <td data-label="Name"><strong>${fuEsc(row.name)}</strong>${row.membership?.label ? `<small class="pd-sub">${fuEsc(row.membership.label)}</small>` : ''}</td>
            <td data-label="Phone">${row.phone ? `<a href="tel:${fuEsc(row.phone)}">${fuEsc(row.phone)}</a>` : '—'}</td>
            ${withDays ? `<td data-label="Last att.">${fuDmy(row.lastAtt)}</td><td class="num" data-label="Days"><strong>${row.days}</strong></td>` : ''}
            <td data-label="Note" class="fu-note"><input type="text" maxlength="300" data-note="${fuEsc(row.key)}" value="${fuEsc(row.note)}" placeholder="Add a note" aria-label="Note for ${fuEsc(row.name)}"></td>
            <td data-label=""><button type="button" class="pd-link" data-remove="${fuEsc(row.key)}">Remove</button></td>
          </tr>`).join('')}</tbody>
      </table>`
    : '<div class="empty">Nobody in this tier.</div>';
  return `
    <div class="card fu-tier is-${tone}">
      <div class="card-heading-row">
        <h2>${title} · ${rows.length}</h2>
        ${owner ? `<span class="member-count">${owner} to follow up</span>` : ''}
      </div>
      <div class="table-wrap">${body}</div>
    </div>`;
}

function fuRender() {
  const container = document.getElementById('fuReport');
  const toolbar = document.getElementById('fuToolbar');
  const updated = document.getElementById('updatedLine');
  if (!fuCurrent) {
    toolbar.hidden = true;
    updated.textContent = 'No report yet';
    container.innerHTML = '<div class="card"><div class="empty">Upload the attendance export and the membership status export to build the first report.</div></div>';
    return;
  }

  toolbar.hidden = false;
  updated.textContent = `Report ${fuLongDate(fuCurrent.report_date)}`;
  document.getElementById('fuReportDate').value = fuCurrent.report_date;
  document.getElementById('fuHistory').innerHTML = fuReports.map(report => `
    <option value="${report.id}"${report.id === fuCurrent.id ? ' selected' : ''}>${fuLongDate(report.report_date)} · made ${new Date(report.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</option>`).join('');

  const result = fuBuild(fuCurrent);
  const files = [fuCurrent.attendance_file && `Attendance: ${fuCurrent.attendance_file}`, fuCurrent.membership_file && `Membership: ${fuCurrent.membership_file}`].filter(Boolean).join(' · ');
  container.innerHTML = `
    <div class="past-due-metrics fu-metrics">
      <div class="past-due-metric key"><span>To follow up</span><strong>${result.orange.length + result.red.length + result.none.length}</strong></div>
      <div class="past-due-metric fu-metric-orange"><span>Orange · ${FU_ORANGE.from}–${FU_ORANGE.to} days</span><strong>${result.orange.length}</strong></div>
      <div class="past-due-metric fu-metric-red"><span>Red · ${FU_RED.from}+ days</span><strong>${result.red.length}</strong></div>
      <div class="past-due-metric"><span>Excluded · Gratis / HOLD</span><strong>${result.excluded.length}</strong></div>
    </div>
    <p class="fu-hint">${fuEsc(files)}${fuCurrent.updated_by ? ` · last edited by ${fuEsc(fuCurrent.updated_by)}` : ''}</p>
    ${fuTierCard('Orange tier', FU_ORANGE.owner, 'orange', result.orange, true)}
    ${fuTierCard('Red tier', FU_RED.owner, 'red', result.red, true)}
    ${fuTierCard('No attendance record', '', 'none', result.none, false)}
    <div class="card">
      <div class="card-heading-row">
        <h2>Excluded · ${result.excluded.length}</h2>
        <span class="member-count">Gratis / HOLD on the latest membership record</span>
      </div>
      <div class="table-wrap">${result.excluded.length
        ? `<table class="stack ar-table"><thead><tr><th>Name</th><th>Reason excluded</th><th>Would otherwise be</th></tr></thead><tbody>${result.excluded.map(row => `
            <tr><td data-label="Name"><strong>${fuEsc(row.name)}</strong></td><td data-label="Reason">${fuEsc(row.reason)}</td><td data-label="Would otherwise be">${fuEsc(fuWouldBe(row))}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">Nobody excluded.</div>'}</div>
    </div>
    ${result.removed.length ? `
    <details class="card fu-removed">
      <summary><h2>Removed by hand · ${result.removed.length}</h2></summary>
      <table class="stack ar-table"><thead><tr><th>Name</th><th>Note</th><th><span class="sr-only">Restore</span></th></tr></thead><tbody>${result.removed.map(row => `
        <tr><td data-label="Name"><strong>${fuEsc(row.name)}</strong></td><td data-label="Note">${fuEsc(row.note || '—')}</td><td data-label=""><button type="button" class="pd-link" data-restore="${fuEsc(row.key)}">Put back</button></td></tr>`).join('')}</tbody></table>
    </details>` : ''}
    ${fuNoteGroupsHtml(result)}`;
}

// Step 7.5: remove everyone carrying a given note in one go.
function fuNoteGroupsHtml(result) {
  const counts = {};
  [...result.orange, ...result.red, ...result.none].forEach(row => {
    if (row.note.trim()) counts[row.note.trim()] = (counts[row.note.trim()] || 0) + 1;
  });
  const notes = Object.entries(counts).filter(([, count]) => count > 1);
  if (!notes.length) return '';
  return `
    <div class="card">
      <h2>Notes shared by several members</h2>
      <ul class="fu-note-groups">${notes.map(([note, count]) => `
        <li><span>“${fuEsc(note)}” · ${fuPlural(count, 'member')}</span><button type="button" class="pd-link" data-remove-note="${fuEsc(note)}">Remove all from report</button></li>`).join('')}</ul>
    </div>`;
}

// ── Saving ───────────────────────────────────────────────────────────────────

async function fuLoadHistory() {
  const client = await fuClient();
  const { data, error } = await client.from(FU_TABLE).select('id, report_date, created_at, created_by').order('created_at', { ascending: false }).limit(60);
  if (error) {
    throw new Error(/does not exist|schema cache/i.test(error.message) ? 'Run supabase/follow_up_reports.sql in Supabase to set up this report.' : error.message);
  }
  fuReports = data || [];
}

async function fuOpen(id) {
  const client = await fuClient();
  const { data, error } = await client.from(FU_TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  fuCurrent = data;
  fuRender();
}

async function fuUpdate(patch, message) {
  try {
    const client = await fuClient();
    const { data, error } = await client.from(FU_TABLE).update(patch).eq('id', fuCurrent.id).select().single();
    if (error) throw error;
    fuCurrent = data;
    if (message) fuToast(message);
  } catch (error) {
    fuToast(error.message || 'Could not save.', true);
  }
}

// Steps 7.1-7.4: a new file means a fresh report, carrying notes forward from the one on screen.
async function fuRegenerate(changes, status) {
  const next = fuNextReport(fuCurrent, { ...changes, report_date: changes.report_date || fuCurrent?.report_date || new Date().toLocaleDateString('en-CA') });
  if (!next) {
    status.textContent += changes.attendance || fuPending.attendance ? ' Now add the membership status export.' : ' Now add the attendance export.';
    fuPending = { ...fuPending, ...changes };
    return;
  }
  const client = await fuClient();
  const { data, error } = await client.from(FU_TABLE).insert(next).select().single();
  if (error) throw error;
  fuCurrent = data;
  fuPending = {};
  await fuLoadHistory();
  fuRender();
  const carried = Object.keys(next.notes).length;
  fuToast(`Report built${carried ? `; ${fuPlural(carried, 'note')} carried over` : ''}.`);
}

// Holds the first file when the other one hasn't been supplied yet (very first report).
let fuPending = {};

async function fuHandleFile(kind, file) {
  if (!file) return;
  const status = document.getElementById(kind === 'attendance' ? 'fuAttendanceStatus' : 'fuMembershipStatus');
  status.classList.remove('upload-status-error');
  status.textContent = `Reading ${file.name}…`;
  try {
    let changes;
    if (kind === 'attendance') {
      const attendance = fuAttendanceFromText(await fuFileText(file));
      const date = fuDateFromFileName(file.name);
      changes = { attendance, attendance_file: file.name, report_date: date || new Date().toLocaleDateString('en-CA') };
      status.textContent = `${file.name}: ${fuPlural(attendance.length, 'member')}${date ? `, report date ${fuLongDate(date)} (from the file name)` : ', report date set to today. Change it above if needed.'}.`;
    } else {
      const memberships = fuMembershipsFromText(await fuFileText(file));
      changes = { memberships, membership_file: file.name };
      status.textContent = `${file.name}: latest record for ${fuPlural(memberships.length, 'person', 'people')}.`;
    }
    await fuRegenerate({ ...fuPending, ...changes }, status);
  } catch (error) {
    status.textContent = error.message || 'Could not read that file.';
    status.classList.add('upload-status-error');
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

function fuInit() {
  document.querySelectorAll('[data-pick]').forEach(button => {
    const input = document.getElementById(button.dataset.pick);
    const kind = input.id === 'fuAttendanceFile' ? 'attendance' : 'membership';
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { const file = input.files[0]; input.value = ''; fuHandleFile(kind, file); });
    button.addEventListener('dragover', event => { event.preventDefault(); button.classList.add('is-over'); });
    button.addEventListener('dragleave', () => button.classList.remove('is-over'));
    button.addEventListener('drop', event => { event.preventDefault(); button.classList.remove('is-over'); fuHandleFile(kind, event.dataTransfer.files[0]); });
  });

  document.getElementById('fuHistory').addEventListener('change', event => fuOpen(Number(event.target.value)).catch(error => fuToast(error.message, true)));

  // Changing the date re-runs the tiers for this report (same files, same notes).
  document.getElementById('fuReportDate').addEventListener('change', async event => {
    if (!fuCurrent || !event.target.value || event.target.value === fuCurrent.report_date) return;
    await fuUpdate({ report_date: event.target.value }, 'Report date changed; tiers recalculated.');
    await fuLoadHistory();
    fuRender();
  });

  const report = document.getElementById('fuReport');
  report.addEventListener('change', event => {
    const key = event.target.dataset.note;
    if (key === undefined) return;
    const notes = { ...(fuCurrent.notes || {}) };
    const value = event.target.value.trim();
    if (value) notes[key] = value; else delete notes[key];
    fuUpdate({ notes }, 'Note saved.').then(fuRenderKeepFocus);
  });
  report.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove]')?.dataset.remove;
    const restore = event.target.closest('[data-restore]')?.dataset.restore;
    const note = event.target.closest('[data-remove-note]')?.dataset.removeNote;
    if (remove) fuUpdate({ removed: [...new Set([...(fuCurrent.removed || []), remove])] }, 'Removed from this report.').then(fuRender);
    if (restore) fuUpdate({ removed: (fuCurrent.removed || []).filter(key => key !== restore) }, 'Put back on the report.').then(fuRender);
    if (note) {
      const keys = Object.entries(fuCurrent.notes || {}).filter(([, value]) => value.trim() === note).map(([key]) => key);
      if (!window.confirm(`Remove ${fuPlural(keys.length, 'member')} with the note “${note}” from this report?`)) return;
      fuUpdate({ removed: [...new Set([...(fuCurrent.removed || []), ...keys])] }, `${fuPlural(keys.length, 'member')} removed.`).then(fuRender);
    }
  });

  document.getElementById('fuCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(fuMarkdown(fuCurrent, fuBuild(fuCurrent)));
      fuToast('Report copied as Markdown.');
    } catch {
      fuToast('Copying was blocked by the browser. Use Download instead.', true);
    }
  });
  document.getElementById('fuDownload').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([fuMarkdown(fuCurrent, fuBuild(fuCurrent))], { type: 'text/markdown;charset=utf-8' }));
    link.download = `red-orange-follow-up-${fuCurrent.report_date}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  fuLoadHistory()
    .then(() => (fuReports[0] ? fuOpen(fuReports[0].id) : fuRender()))
    .catch(error => {
      document.getElementById('fuReport').innerHTML = `<div class="card"><div class="error">${fuEsc(error.message)}</div></div>`;
      document.getElementById('updatedLine').textContent = 'Could not load the report';
    });
}

// Re-render after a note change, keeping the cursor where the user tabbed to.
function fuRenderKeepFocus() {
  const key = document.activeElement?.dataset?.note;
  fuRender();
  if (key !== undefined) document.querySelector(`[data-note="${CSS.escape(key)}"]`)?.focus();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fuInit);
else fuInit();
