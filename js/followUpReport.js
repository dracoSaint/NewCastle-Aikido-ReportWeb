// Red / Orange Follow-Up Report: the page. The rules live in js/followUpCore.js
// (shared with the nightly Zen Planner job), which must load before this file.

const FU_TABLE = 'follow_up_reports';
const FU_CONTACTS = 'follow_up_contacts';
const FU_OUTCOMES = {
  spoke: 'Spoke to them',
  voicemail: 'Left voicemail',
  no_answer: 'No answer',
  text: 'Sent text',
  wrong_number: 'Wrong number'
};
const FU_TIER_NAMES = { orange: 'Orange', red: 'Red', none: 'No record' };

let fuReports = [];      // history: [{ id, report_date, created_at, created_by }]
let fuCurrent = null;    // the report on screen (full row)
let fuContacts = [];     // contact log, newest first
let fuContactsError = '';
let fuShow = 'all';      // all | todo | done
let fuDialogRow = null;  // the member the contact dialog is open for

// ── Small helpers ────────────────────────────────────────────────────────────

const fuEsc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const fuSydneyDay = stamp => new Date(stamp).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const fuWhen = stamp => new Date(stamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney' });
const fuStaff = email => String(email || '').split('@')[0];

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

// A member counts as contacted once a call is logged on or after their last class:
// the tag survives the nightly rebuild and lapses when they train again.
function fuContactsFor(row) {
  return fuContacts.filter(contact => contact.member_key === row.key && (!row.lastAtt || fuSydneyDay(contact.contacted_at) >= row.lastAtt));
}

// ── Rendering: report ────────────────────────────────────────────────────────

function fuContactCell(row) {
  const contacts = fuContactsFor(row);
  if (!contacts.length) return '<span class="fu-chip is-todo">Not contacted</span>';
  const last = contacts[0];
  return `<span class="fu-chip is-${last.outcome === 'spoke' ? 'done' : 'tried'}">${fuEsc(FU_OUTCOMES[last.outcome] || last.outcome)}</span>
    <small class="pd-sub">${fuWhen(last.contacted_at)} · ${fuEsc(fuStaff(last.contacted_by))}${contacts.length > 1 ? ` · ${contacts.length} attempts` : ''}</small>`;
}

function fuTierCard(title, owner, tone, rows, total, withDays) {
  const body = rows.length
    ? `<table class="stack ar-table fu-table">
        <thead><tr><th>Member</th><th>Phone</th>${withDays ? '<th>Last class</th><th class="num">Days</th>' : ''}<th>Contact</th><th>Note</th><th class="fu-actions-col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map(row => `
          <tr data-key="${fuEsc(row.key)}"${fuContactsFor(row).length ? ' class="is-contacted"' : ''}>
            <td data-label="Member"><strong>${fuEsc(row.name)}</strong>${row.membership?.label ? `<small class="pd-sub">${fuEsc(row.membership.label)}</small>` : ''}</td>
            <td data-label="Phone">${row.phone ? `<a class="fu-phone" href="tel:${fuEsc(row.phone.replace(/\s/g, ''))}">${fuEsc(row.phone)}</a>` : '—'}</td>
            ${withDays ? `<td data-label="Last class">${fuDmy(row.lastAtt)}</td><td class="num" data-label="Days"><strong>${row.days}</strong></td>` : ''}
            <td data-label="Contact" class="fu-contact">${fuContactCell(row)}</td>
            <td data-label="Note" class="fu-note">
              <input type="text" maxlength="300" data-note="${fuEsc(row.key)}" value="${fuEsc(row.note)}" placeholder="Add a note" aria-label="Note for ${fuEsc(row.name)}">
              <span class="fu-print-only">${fuEsc(row.note)}</span>
            </td>
            <td data-label="" class="fu-actions">
              <button type="button" class="sop-action-button secondary fu-log-btn" data-log="${fuEsc(row.key)}">Log contact</button>
              <button type="button" class="pd-link" data-remove="${fuEsc(row.key)}">Remove</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>`
    : `<div class="empty">${total ? 'Nobody here matches the search or filter.' : 'Nobody in this tier.'}</div>`;
  return `
    <div class="card fu-tier is-${tone}">
      <div class="card-heading-row">
        <h2>${title} · ${rows.length === total ? total : `${rows.length} of ${total}`}</h2>
        ${owner ? `<span class="member-count">${owner} to follow up</span>` : ''}
      </div>
      <div class="table-wrap">${body}</div>
    </div>`;
}

function fuFilterRows(rows) {
  const query = document.getElementById('fuSearch').value.trim().toLowerCase();
  return rows.filter(row => {
    if (query && !`${row.name} ${row.phone}`.toLowerCase().includes(query)) return false;
    if (fuShow === 'all') return true;
    return (fuShow === 'done') === fuContactsFor(row).length > 0;
  });
}

function fuRender() {
  const container = document.getElementById('fuReport');
  const toolbar = document.getElementById('fuToolbar');
  const filters = document.getElementById('fuFilters');
  const updated = document.getElementById('updatedLine');
  if (!fuCurrent) {
    toolbar.hidden = true;
    filters.hidden = true;
    updated.textContent = 'No report yet';
    container.innerHTML = '<div class="card"><div class="empty">No report yet. It builds itself every night from Zen Planner, or upload both exports on the Upload tab.</div></div>';
    return;
  }

  toolbar.hidden = false;
  filters.hidden = false;
  updated.textContent = `Report ${fuLongDate(fuCurrent.report_date)}`;
  document.getElementById('fuReportDate').value = fuCurrent.report_date;
  document.getElementById('fuHistory').innerHTML = fuReports.map(report => `
    <option value="${report.id}"${report.id === fuCurrent.id ? ' selected' : ''}>${fuLongDate(report.report_date)} · made ${new Date(report.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</option>`).join('');

  const result = fuBuild(fuCurrent);
  const open = [...result.orange, ...result.red, ...result.none];
  const contacted = open.filter(row => fuContactsFor(row).length).length;
  const percent = open.length ? Math.round((contacted / open.length) * 100) : 0;
  const files = [fuCurrent.attendance_file && `Attendance: ${fuCurrent.attendance_file}`, fuCurrent.membership_file && `Membership: ${fuCurrent.membership_file}`].filter(Boolean).join(' · ');
  container.innerHTML = `
    <div class="past-due-metrics fu-metrics">
      <div class="past-due-metric key"><span>To follow up</span><strong>${open.length}</strong></div>
      <div class="past-due-metric fu-metric-progress"><span>Contacted</span><strong>${contacted}<small> of ${open.length}</small></strong>
        <span class="fu-progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Contacted"><span style="width:${percent}%"></span></span></div>
      <div class="past-due-metric fu-metric-orange"><span>Orange · ${FU_ORANGE.from}–${FU_ORANGE.to} days</span><strong>${result.orange.length}</strong></div>
      <div class="past-due-metric fu-metric-red"><span>Red · ${FU_RED.from}+ days</span><strong>${result.red.length}</strong></div>
      <div class="past-due-metric"><span>Excluded · Gratis / HOLD</span><strong>${result.excluded.length}</strong></div>
    </div>
    <p class="fu-hint">${fuEsc(files)}${fuCurrent.updated_by ? ` · last edited by ${fuEsc(fuCurrent.updated_by)}` : ''}</p>
    ${fuContactsError ? `<div class="card fu-warning"><div class="error">${fuEsc(fuContactsError)}</div></div>` : ''}
    ${fuTierCard('Orange tier', FU_ORANGE.owner, 'orange', fuFilterRows(result.orange), result.orange.length, true)}
    ${fuTierCard('Red tier', FU_RED.owner, 'red', fuFilterRows(result.red), result.red.length, true)}
    ${fuTierCard('No attendance record', '', 'none', fuFilterRows(result.none), result.none.length, false)}
    <div class="card fu-excluded">
      <div class="card-heading-row">
        <h2>Excluded · ${result.excluded.length}</h2>
        <span class="member-count">Gratis / HOLD on the latest membership record</span>
      </div>
      <div class="table-wrap">${result.excluded.length
        ? `<table class="stack ar-table"><thead><tr><th>Member</th><th>Reason excluded</th><th>Would otherwise be</th></tr></thead><tbody>${result.excluded.map(row => `
            <tr><td data-label="Member"><strong>${fuEsc(row.name)}</strong></td><td data-label="Reason">${fuEsc(row.reason)}</td><td data-label="Would otherwise be">${fuEsc(fuWouldBe(row))}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">Nobody excluded.</div>'}</div>
    </div>
    ${result.removed.length ? `
    <details class="card fu-removed">
      <summary><h2>Removed by hand · ${result.removed.length}</h2></summary>
      <table class="stack ar-table"><thead><tr><th>Member</th><th>Note</th><th><span class="sr-only">Restore</span></th></tr></thead><tbody>${result.removed.map(row => `
        <tr><td data-label="Member"><strong>${fuEsc(row.name)}</strong></td><td data-label="Note">${fuEsc(row.note || '—')}</td><td data-label=""><button type="button" class="pd-link" data-restore="${fuEsc(row.key)}">Put back</button></td></tr>`).join('')}</tbody></table>
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
    <div class="card fu-note-card">
      <h2>Notes shared by several members</h2>
      <ul class="fu-note-groups">${notes.map(([note, count]) => `
        <li><span>“${fuEsc(note)}” · ${fuPlural(count, 'member')}</span><button type="button" class="pd-link" data-remove-note="${fuEsc(note)}">Remove all from report</button></li>`).join('')}</ul>
    </div>`;
}

// ── Rendering: contact log ───────────────────────────────────────────────────

function fuRenderLog() {
  const table = document.getElementById('fuLogTable');
  const count = document.getElementById('fuLogCount');
  if (fuContactsError) {
    table.innerHTML = `<div class="error">${fuEsc(fuContactsError)}</div>`;
    count.textContent = '';
    return;
  }
  const query = document.getElementById('fuLogSearch').value.trim().toLowerCase();
  const outcome = document.getElementById('fuLogOutcome').value;
  const from = document.getElementById('fuLogFrom').value;
  const to = document.getElementById('fuLogTo').value;
  const rows = fuContacts.filter(contact => {
    const day = fuSydneyDay(contact.contacted_at);
    return (!outcome || contact.outcome === outcome)
      && (!from || day >= from) && (!to || day <= to)
      && (!query || `${contact.member_name} ${contact.phone} ${contact.note} ${contact.contacted_by}`.toLowerCase().includes(query));
  });
  count.textContent = `${fuPlural(rows.length, 'contact')} · ${fuPlural(new Set(rows.map(row => row.member_key)).size, 'member')}`;
  table.innerHTML = rows.length
    ? `<table class="stack ar-table fu-log">
        <thead><tr><th>When</th><th>Member</th><th>Tier</th><th>Outcome</th><th>Note</th><th>By</th><th><span class="sr-only">Delete</span></th></tr></thead>
        <tbody>${rows.map(contact => `
          <tr>
            <td data-label="When">${fuWhen(contact.contacted_at)}</td>
            <td data-label="Member"><strong>${fuEsc(contact.member_name)}</strong>${contact.phone ? `<small class="pd-sub">${fuEsc(contact.phone)}</small>` : ''}</td>
            <td data-label="Tier">${contact.tier ? `<span class="fu-tier-tag is-${fuEsc(contact.tier)}">${FU_TIER_NAMES[contact.tier] || fuEsc(contact.tier)}${contact.days != null ? ` · ${contact.days} d` : ''}</span>` : '—'}</td>
            <td data-label="Outcome"><span class="fu-chip is-${contact.outcome === 'spoke' ? 'done' : 'tried'}">${fuEsc(FU_OUTCOMES[contact.outcome] || contact.outcome)}</span></td>
            <td data-label="Note">${fuEsc(contact.note || '—')}</td>
            <td data-label="By">${fuEsc(fuStaff(contact.contacted_by))}</td>
            <td data-label=""><button type="button" class="pd-link" data-delete-contact="${contact.id}">Delete</button></td>
          </tr>`).join('')}</tbody>
      </table>`
    : `<div class="empty">${fuContacts.length ? 'No contacts match these filters.' : 'No contacts logged yet. Use “Log contact” on the Follow-up tab after each call.'}</div>`;
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

// ponytail: newest 2000 calls cover months of follow-ups; page with .range() if the log outgrows it.
async function fuLoadContacts() {
  const client = await fuClient();
  const { data, error } = await client.from(FU_CONTACTS).select('*').order('contacted_at', { ascending: false }).limit(2000);
  fuContactsError = error
    ? (/does not exist|schema cache/i.test(error.message) ? 'Contact logging is not set up yet: run supabase/follow_up_contacts.sql in Supabase.' : error.message)
    : '';
  fuContacts = data || [];
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
      status.textContent = `${file.name}: ${fuPlural(attendance.length, 'member')}${date ? `, report date ${fuLongDate(date)} (from the file name)` : ', report date set to today. Change it on the Follow-up tab if needed.'}.`;
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

// ── Contact dialog ───────────────────────────────────────────────────────────

function fuOpenContact(key) {
  const result = fuBuild(fuCurrent);
  fuDialogRow = [...result.orange, ...result.red, ...result.none].find(row => row.key === key);
  if (!fuDialogRow) return;
  // Every call ever logged for this member (not only since their last class), newest first.
  const history = fuContacts.filter(contact => contact.member_key === key);
  document.getElementById('fuContactTitle').textContent = `Log contact · ${fuDialogRow.name}`;
  document.getElementById('fuContactWho').innerHTML = [
    fuDialogRow.phone ? `<a class="fu-phone" href="tel:${fuEsc(fuDialogRow.phone.replace(/\s/g, ''))}">Call ${fuEsc(fuDialogRow.phone)}</a>` : 'No phone number on file',
    fuDialogRow.days != null ? `${fuDialogRow.days} days since last class` : 'No attendance record'
  ].join(' · ');
  document.getElementById('fuContactHistory').innerHTML = `
    <h3>Contact history${history.length ? ` · ${history.length}` : ''}</h3>
    ${history.length ? `<ol>${history.map((contact, index) => `
      <li>
        <div class="fu-history-head">
          <span class="fu-chip is-${contact.outcome === 'spoke' ? 'done' : 'tried'}">${fuEsc(FU_OUTCOMES[contact.outcome] || contact.outcome)}</span>
          <span>${fuWhen(contact.contacted_at)} · ${fuEsc(fuStaff(contact.contacted_by))}</span>
          ${index === 0 ? `<button type="button" class="pd-link fu-undo" data-delete-contact="${contact.id}">Undo last</button>` : ''}
        </div>
        ${contact.note ? `<p>${fuEsc(contact.note)}</p>` : ''}
      </li>`).join('')}</ol>` : '<p class="fu-history-empty">No calls logged yet.</p>'}`;
  document.getElementById('fuContactForm').reset();
  document.getElementById('fuContactDialog').showModal();
}

async function fuSaveContact(event) {
  event.preventDefault();
  const outcome = new FormData(event.target).get('outcome');
  if (!outcome) { fuToast('Pick an outcome first.', true); return; }
  const row = fuDialogRow;
  const save = event.target.querySelector('[type="submit"]');
  save.disabled = true;
  try {
    const client = await fuClient();
    const { error } = await client.from(FU_CONTACTS).insert({
      member_key: row.key,
      member_name: row.name,
      phone: row.phone || null,
      tier: row.tier,
      days: row.days,
      outcome,
      note: document.getElementById('fuContactNote').value.trim() || null,
      report_id: fuCurrent.id
    });
    if (error) throw error;
    document.getElementById('fuContactDialog').close();
    await fuLoadContacts();
    fuRender();
    fuRenderLog();
    fuToast(`${row.name}: ${FU_OUTCOMES[outcome].toLowerCase()} logged.`);
  } catch (error) {
    fuToast(/does not exist|schema cache/i.test(error.message || '') ? 'Run supabase/follow_up_contacts.sql in Supabase first.' : (error.message || 'Could not save.'), true);
  } finally {
    save.disabled = false;
  }
}

// Undo an accidental log: "Undo last" on a report row, or "Delete" in the contact log.
async function fuDeleteContact(event) {
  const id = Number(event.target.closest('[data-delete-contact]')?.dataset.deleteContact);
  const contact = fuContacts.find(item => item.id === id);
  if (!contact) return;
  const label = `${FU_OUTCOMES[contact.outcome] || contact.outcome} for ${contact.member_name} (${fuWhen(contact.contacted_at)})`;
  if (!window.confirm(`Remove “${label}” from the contact log?`)) return;
  try {
    const client = await fuClient();
    const { error } = await client.from(FU_CONTACTS).delete().eq('id', id);
    if (error) throw error;
    document.getElementById('fuContactDialog').close();
    await fuLoadContacts();
    fuRenderLog();
    if (fuCurrent) fuRender();
    fuToast('Contact removed.');
  } catch (error) {
    fuToast(error.message || 'Could not remove.', true);
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────────

// The browser's print to "Save as PDF" keeps the page's own look; styles under @media print.
function fuPrint() {
  const result = fuBuild(fuCurrent);
  document.getElementById('fuPrintMeta').textContent = `Report ${fuLongDate(fuCurrent.report_date)} · `
    + `${result.orange.length + result.red.length + result.none.length} to follow up · `
    + `printed ${new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}`;
  const title = document.title;
  document.title = `Red-Orange Follow-Up ${fuCurrent.report_date}`; // suggested PDF file name
  window.addEventListener('afterprint', () => { document.title = title; }, { once: true });
  window.print();
}

// ── Page ─────────────────────────────────────────────────────────────────────

function fuInit() {
  const tabs = document.querySelectorAll('nav.site-nav button');
  tabs.forEach(button => button.addEventListener('click', () => {
    tabs.forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${button.dataset.tab}`));
  }));

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

  document.getElementById('fuSearch').addEventListener('input', fuRender);
  document.querySelectorAll('[data-show]').forEach(button => button.addEventListener('click', () => {
    fuShow = button.dataset.show;
    document.querySelectorAll('[data-show]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    fuRender();
  }));

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
    const log = event.target.closest('[data-log]')?.dataset.log;
    const remove = event.target.closest('[data-remove]')?.dataset.remove;
    const restore = event.target.closest('[data-restore]')?.dataset.restore;
    const note = event.target.closest('[data-remove-note]')?.dataset.removeNote;
    if (log) fuOpenContact(log);
    if (remove) fuUpdate({ removed: [...new Set([...(fuCurrent.removed || []), remove])] }, 'Removed from this report.').then(fuRender);
    if (restore) fuUpdate({ removed: (fuCurrent.removed || []).filter(key => key !== restore) }, 'Put back on the report.').then(fuRender);
    if (note) {
      const keys = Object.entries(fuCurrent.notes || {}).filter(([, value]) => value.trim() === note).map(([key]) => key);
      if (!window.confirm(`Remove ${fuPlural(keys.length, 'member')} with the note “${note}” from this report?`)) return;
      fuUpdate({ removed: [...new Set([...(fuCurrent.removed || []), ...keys])] }, `${fuPlural(keys.length, 'member')} removed.`).then(fuRender);
    }
  });

  // Contact dialog.
  document.getElementById('fuOutcomeChoices').innerHTML = Object.entries(FU_OUTCOMES).map(([value, label]) => `
    <label class="fu-outcome"><input type="radio" name="outcome" value="${value}"><span>${label}</span></label>`).join('');
  document.getElementById('fuContactForm').addEventListener('submit', fuSaveContact);
  document.getElementById('fuContactCancel').addEventListener('click', () => document.getElementById('fuContactDialog').close());
  document.getElementById('fuContactHistory').addEventListener('click', fuDeleteContact);

  // Contact log.
  document.getElementById('fuLogOutcome').insertAdjacentHTML('beforeend', Object.entries(FU_OUTCOMES).map(([value, label]) => `<option value="${value}">${label}</option>`).join(''));
  ['fuLogSearch', 'fuLogOutcome', 'fuLogFrom', 'fuLogTo'].forEach(id => document.getElementById(id).addEventListener('input', fuRenderLog));
  document.getElementById('fuLogTable').addEventListener('click', fuDeleteContact);

  document.getElementById('fuCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(fuMarkdown(fuCurrent, fuBuild(fuCurrent)));
      fuToast('Report copied as Markdown.');
    } catch {
      fuToast('Copying was blocked by the browser. Use .md instead.', true);
    }
  });
  document.getElementById('fuDownload').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([fuMarkdown(fuCurrent, fuBuild(fuCurrent))], { type: 'text/markdown;charset=utf-8' }));
    link.download = `red-orange-follow-up-${fuCurrent.report_date}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  document.getElementById('fuPdf').addEventListener('click', fuPrint);

  Promise.all([fuLoadHistory(), fuLoadContacts()])
    .then(() => {
      fuRenderLog();
      return fuReports[0] ? fuOpen(fuReports[0].id) : fuRender();
    })
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
