// Red / Orange Follow-Up Report: the page. The rules live in js/followUpCore.js
// (shared with the nightly Zen Planner job), which must load before this file.

const FU_TABLE = 'follow_up_reports';
const FU_CONTACTS = 'follow_up_contacts';
const FU_NOTES = 'follow_up_member_notes';
const FU_RETURNS = 'follow_up_returns';
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
let fuShow = 'todo';     // all | todo | done
const fuCollapsed = new Set(); // tones of tiers the user folded away
let fuDialogRow = null;  // the member the contact dialog is open for
let fuNotes = [];        // member notes log, newest first
let fuNotesReady = true; // false until supabase/follow_up_member_notes.sql has been run
let fuUserEmail = '';
const fuNotesOpen = new Set(); // member keys whose notes log is open
const fuNoteDrafts = new Map(); // unsaved top-level notes by member key (survive re-renders)
const fuNoteEditing = new Set(); // member keys whose saved top-level note is being edited
let fuReturned = [];       // Returned log (not removed), newest return first
let fuReturnsReady = true; // false until supabase/follow_up_returns.sql has been run

// ── Small helpers ────────────────────────────────────────────────────────────

// Phones show as 0412 345 678 whether stored as +61412345678 or 0412345678; tel: links keep the raw number.
const fuPhoneText = phone => {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^61(?=4\d{8}$)/, '0');
  return /^04\d{8}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : String(phone || '');
};
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

const fuNotesFor = key => fuNotes.filter(note => note.member_key === key);
const fuIsToday = stamp => fuSydneyDay(stamp) === fuSydneyDay(Date.now());

const FU_ICONS = {
  save: '<path d="M20 6 9 17l-5-5"/>',
  cancel: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'
};
const fuIcon = name => `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${FU_ICONS[name]}</svg>`;

// Top-level note: saved text with an edit button, or a box with save / cancel
// (Enter saves, Esc cancels). Nothing saves on its own when the box loses focus.
function fuNoteField(row) {
  const key = fuEsc(row.key);
  if (row.note && !fuNoteEditing.has(row.key)) {
    return `<div class="fu-note-saved">
      <p>${fuEsc(row.note)}</p>
      <button type="button" class="fu-icon-btn" data-note-edit="${key}" data-requires="followup.edit" aria-label="Edit note for ${fuEsc(row.name)}" title="Edit note">${fuIcon('edit')}</button>
    </div>`;
  }
  const value = fuNoteDrafts.get(row.key) ?? row.note;
  const dirty = fuNoteEditing.has(row.key) || value !== row.note;
  return `<div class="fu-note-field${dirty ? ' is-dirty' : ''}">
      <input type="text" maxlength="300" data-note="${key}" data-mention value="${fuEsc(value)}" placeholder="Add a note" aria-label="Note for ${fuEsc(row.name)}">
      <button type="button" class="fu-icon-btn is-save" data-note-save="${key}" aria-label="Save note" title="Save (Enter)">${fuIcon('save')}</button>
      <button type="button" class="fu-icon-btn" data-note-cancel="${key}" aria-label="Don't save note" title="Cancel (Esc)">${fuIcon('cancel')}</button>
    </div>`;
}

// The member's notes log (same look and rules as the past-due member notes).
function fuNotesHtml(row, id) {
  const notes = fuNotesFor(row.key);
  const form = fuNotesReady
    ? `<form class="pd-note-form" data-add-note="${fuEsc(row.key)}" data-requires="followup.edit">
        <label class="sr-only" for="${id}-add">Add a note for ${fuEsc(row.name)}</label>
        <textarea id="${id}-add" rows="2" maxlength="2000" required data-mention placeholder="Call back Tuesday, injured, travelling… Type @ to tag someone"></textarea>
        <div class="pd-note-form-row"><small>Ctrl + Enter to save</small><button type="submit" class="sop-action-button primary pd-small">Add note</button></div>
      </form>`
    : '<p class="pd-notice">The notes log needs a one-time database update: run <code>supabase/follow_up_member_notes.sql</code>.</p>';
  const list = notes.length
    ? notes.map(note => `
        <li data-note-id="${note.id}">
          <p>${fuEsc(note.note)}</p>
          <span class="pd-note-meta">${fuEsc(fuStaff(note.author) || 'Staff')} · <time datetime="${fuEsc(note.created_at)}">${fuWhen(note.created_at)}</time>${note.edited_at ? ` · <span class="pd-edited">Edited by ${fuEsc(fuStaff(note.edited_by) || 'Staff')} ${fuWhen(note.edited_at)}</span>` : ''}${fuIsToday(note.created_at) ? `<span data-requires="followup.edit"> <button type="button" class="pd-link" data-edit-note>Edit</button>${note.author === fuUserEmail ? ' <button type="button" class="pd-link" data-delete-note>Delete</button>' : ''}</span>` : ''}</span>
        </li>`).join('')
    : '<li class="pd-muted">No notes yet.</li>';
  return `
    <section class="pd-notes fu-notes">
      <h4>Notes log <small>Every note for this member, kept across reports</small></h4>
      ${form}
      <ol class="pd-note-list">${list}</ol>
    </section>`;
}

function fuNotesToggle(row, id) {
  const notes = fuNotesFor(row.key);
  const [last] = notes;
  const count = notes.length;
  return `<button type="button" class="fu-notes-toggle" data-notes="${fuEsc(row.key)}" aria-expanded="${fuNotesOpen.has(row.key)}" aria-controls="${id}">
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
    Notes log${count ? ` · ${count}` : ''}${last ? `<span> · last by ${fuEsc(fuStaff(last.author) || 'Staff')}, ${fuWhen(last.created_at)}</span>` : ''}</button>`;
}

function fuTierCard(title, owner, tone, rows, total, withDays) {
  const body = rows.length
    ? `<table class="stack ar-table fu-table">
        <thead><tr><th>Member</th><th>Phone</th>${withDays ? '<th>Last class</th><th class="num">Days</th>' : ''}<th>Contact</th><th>Note</th><th class="fu-actions-col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((row, index) => `
          <tr data-key="${fuEsc(row.key)}"${fuContactsFor(row).length ? ' class="is-contacted"' : ''}>
            <td data-label="Member"><strong>${fuEsc(row.name)}</strong>${row.membership?.label ? `<small class="pd-sub">${fuEsc(row.membership.label)}</small>` : ''}</td>
            <td data-label="Phone">${row.phone ? `<a class="fu-phone" href="tel:${fuEsc(row.phone.replace(/\s/g, ''))}">${fuEsc(fuPhoneText(row.phone))}</a>` : '—'}</td>
            ${withDays ? `<td data-label="Last class">${fuDmy(row.lastAtt)}</td><td class="num" data-label="Days"><strong>${row.days}</strong></td>` : ''}
            <td data-label="Contact" class="fu-contact">${fuContactCell(row)}</td>
            <td data-label="Note" class="fu-note">
              ${fuNoteField(row)}
              <span class="fu-print-only">${fuEsc(row.note)}</span>
              ${fuNotesToggle(row, `fuNotes-${tone}-${index}`)}
            </td>
            <td data-label="" class="fu-actions" data-requires="followup.edit">
              <button type="button" class="sop-action-button secondary fu-log-btn" data-log="${fuEsc(row.key)}">Log contact</button>
              <button type="button" class="pd-link" data-remove="${fuEsc(row.key)}">Remove</button>
            </td>
          </tr>
          <tr class="child-row fu-notes-row" id="fuNotes-${tone}-${index}" data-key="${fuEsc(row.key)}"${fuNotesOpen.has(row.key) ? '' : ' hidden'}>
            <td colspan="${withDays ? 7 : 5}">${fuNotesHtml(row, `fuNotes-${tone}-${index}`)}</td>
          </tr>`).join('')}</tbody>
      </table>`
    : `<div class="empty">${total ? 'Nobody here matches the search or filter.' : 'Nobody in this tier.'}</div>`;
  return `
    <details class="card fu-tier is-${tone}" data-tier="${tone}"${fuCollapsed.has(tone) ? '' : ' open'}>
      <summary class="card-heading-row">
        <h2>${title} · ${rows.length === total ? total : `${rows.length} of ${total}`}</h2>
        ${owner ? `<span class="member-count">${owner} to follow up</span>` : ''}
      </summary>
      <div class="table-wrap">${body}</div>
    </details>`;
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
    fuRenderFollowUp(null);
    fuRenderReturned();
    return;
  }

  toolbar.hidden = false;
  filters.hidden = false;
  updated.textContent = `Report ${fuLongDate(fuCurrent.report_date)}`;
  document.getElementById('fuReportDate').value = fuCurrent.report_date;
  // One entry per day: the newest report for each date (older same-day ones stay in the database).
  const daily = fuReports.filter((report, index) => fuReports.findIndex(other => other.report_date === report.report_date) === index);
  if (!daily.some(report => report.id === fuCurrent.id)) daily.unshift(fuCurrent);
  document.getElementById('fuHistory').innerHTML = daily.map(report => `
    <option value="${report.id}"${report.id === fuCurrent.id ? ' selected' : ''}>${fuLongDate(report.report_date)} · made ${new Date(report.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</option>`).join('');

  const result = fuBuild(fuCurrent);
  const open = [...result.orange, ...result.red, ...result.none];
  const contacted = open.filter(row => fuContactsFor(row).length).length;
  const percent = open.length ? Math.round((contacted / open.length) * 100) : 0;
  const files = [fuCurrent.attendance_file && `Attendance: ${fuCurrent.attendance_file}`, fuCurrent.membership_file && `Membership: ${fuCurrent.membership_file}`].filter(Boolean).join(' · ');
  container.innerHTML = `
    <div class="past-due-metrics fu-metrics">
      <div class="past-due-metric key fu-metric-progress"><span>To follow up · ${contacted} of ${open.length} contacted</span><strong>${open.length - contacted}<small>left</small></strong>
        <span class="fu-progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Contacted"><span style="width:${percent}%"></span></span></div>
      <div class="past-due-metric fu-metric-orange"><span>Orange · ${FU_ORANGE.from}–${FU_ORANGE.to} days</span><strong>${result.orange.length}</strong></div>
      <div class="past-due-metric fu-metric-red"><span>Red · ${FU_RED.from}+ days</span><strong>${result.red.length}</strong></div>
      <div class="past-due-metric"><span>Excluded · Gratis / HOLD</span><strong>${result.excluded.length}</strong></div>
    </div>
    <details class="fu-sources"><summary>Sources</summary><p class="fu-hint">${fuEsc(files)}${fuCurrent.updated_by ? ` · last edited by ${fuEsc(fuCurrent.updated_by)}` : ''}</p></details>
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
  fuRenderFollowUp(result);
  // The Returned table scans the contact log per row: draw it only while it's on screen.
  if (document.getElementById('tab-returned').classList.contains('active')) fuRenderReturned();
}

const fuTierTag = (tier, days) => (tier ? `<span class="fu-tier-tag is-${fuEsc(tier)}">${FU_TIER_NAMES[tier] || fuEsc(tier)}${days != null ? ` · ${days} d` : ''}</span>` : '—');
const fuLatestNote = key => fuNotesFor(key)[0]?.note || '';

// ── Rendering: Follow-up tab (contacted, still on the list) ──────────────────

function fuRenderFollowUp(result) {
  const table = document.getElementById('fuFollowTable');
  const rows = result ? [...result.orange, ...result.red, ...result.none].filter(row => fuContactsFor(row).length) : [];
  document.getElementById('fuFollowCount').textContent = result ? fuPlural(rows.length, 'member') : '';
  table.innerHTML = rows.length
    ? `<table class="stack ar-table fu-table fu-follow-table">
        <thead><tr><th>Member</th><th>Phone</th><th>On the list</th><th>Last contact</th><th>Latest note</th><th class="fu-actions-col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${rows.map((row, index) => `
          <tr>
            <td data-label="Member"><strong>${fuEsc(row.name)}</strong>${row.membership?.label ? `<small class="pd-sub">${fuEsc(row.membership.label)}</small>` : ''}</td>
            <td data-label="Phone">${row.phone ? `<a class="fu-phone" href="tel:${fuEsc(row.phone.replace(/\s/g, ''))}">${fuEsc(fuPhoneText(row.phone))}</a>` : '—'}</td>
            <td data-label="On the list">${fuTierTag(row.tier, row.days)}</td>
            <td data-label="Last contact" class="fu-contact">${fuContactCell(row)}</td>
            <td data-label="Latest note" class="fu-note"><p class="fu-follow-note">${fuEsc(row.note || fuLatestNote(row.key) || '—')}</p>${fuNotesToggle(row, `fuFollowNotes-${index}`)}</td>
            <td data-label="" class="fu-actions" data-requires="followup.edit"><button type="button" class="sop-action-button secondary fu-log-btn" data-log="${fuEsc(row.key)}">Log contact</button></td>
          </tr>
          <tr class="child-row fu-notes-row" id="fuFollowNotes-${index}"${fuNotesOpen.has(row.key) ? '' : ' hidden'}>
            <td colspan="6">${fuNotesHtml(row, `fuFollowNotes-${index}`)}</td>
          </tr>`).join('')}</tbody>
      </table>`
    : `<div class="empty">${result ? 'Nobody on the current list has been contacted yet. Use “Log contact” on the Red/Orange Report.' : 'No report yet.'}</div>`;
}

// ── Rendering: Returned tab ──────────────────────────────────────────────────

// The last contact during this absence (after their last class, on or before the day they came back).
const fuContactBefore = item => fuContacts.find(contact => {
  if (contact.member_key !== item.member_key) return false;
  const day = fuSydneyDay(contact.contacted_at);
  return day <= item.returned_on && (!item.last_class_before || day >= item.last_class_before);
});

function fuRenderReturned() {
  const table = document.getElementById('fuReturnTable');
  const metrics = document.getElementById('fuReturnMetrics');
  if (!fuReturnsReady) {
    metrics.innerHTML = '';
    table.innerHTML = '<p class="pd-notice">The Returned list needs a one-time database update: run <code>supabase/follow_up_returns.sql</code>.</p>';
    return;
  }
  const select = document.getElementById('fuReturnMonth');
  const months = [...new Set(fuReturned.map(item => item.returned_on.slice(0, 7)))];
  const current = select.value;
  select.length = 1;
  select.insertAdjacentHTML('beforeend', months.map(month => `<option value="${month}">${fuLongDate(`${month}-01`).replace(/^\d+ /, '')}</option>`).join(''));
  select.value = months.includes(current) ? current : '';

  const items = fuReturned.filter(item => !select.value || item.returned_on.startsWith(select.value));
  const afterContact = items.filter(fuContactBefore).length;
  const thisMonth = fuReturned.filter(item => item.returned_on.startsWith(fuSydneyDay(Date.now()).slice(0, 7))).length;
  const scope = select.value ? select.selectedOptions[0].textContent : 'all time';
  metrics.innerHTML = `
    <div class="past-due-metric key"><span>Returned this month</span><strong>${thisMonth}</strong></div>
    <div class="past-due-metric"><span>After contact · ${fuEsc(scope)}</span><strong>${afterContact}</strong></div>
    <div class="past-due-metric"><span>On their own · ${fuEsc(scope)}</span><strong>${items.length - afterContact}</strong></div>`;

  table.innerHTML = items.length
    ? `<table class="stack ar-table fu-table fu-return-table">
        <thead><tr><th>Member</th><th>Back on</th><th>Was on the list</th><th>Contact</th><th>Latest note</th><th><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${items.map(item => {
          const contact = fuContactBefore(item);
          return `
          <tr>
            <td data-label="Member"><strong>${fuEsc(item.member_name)}</strong>${item.membership_label ? `<small class="pd-sub">${fuEsc(item.membership_label)}</small>` : ''}</td>
            <td data-label="Back on">${fuDmy(item.returned_on)}${item.last_class_before ? `<small class="pd-sub">Last class before: ${fuDmy(item.last_class_before)}</small>` : ''}</td>
            <td data-label="Was on the list">${fuTierTag(item.tier, item.days)}</td>
            <td data-label="Contact">${contact
              ? `<span class="fu-chip is-done">After contact</span><small class="pd-sub">${fuEsc(FU_OUTCOMES[contact.outcome] || contact.outcome)} · ${fuEsc(fuStaff(contact.contacted_by))} · ${fuWhen(contact.contacted_at)}</small>`
              : '<span class="fu-chip is-tried">On their own</span>'}</td>
            <td data-label="Latest note">${fuEsc(fuLatestNote(item.member_key) || '—')}</td>
            <td data-label="">${fuIsToday(item.detected_at) ? `<button type="button" class="pd-link" data-requires="followup.edit" data-remove-return="${item.id}">Remove</button>` : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`
    : `<div class="empty">${fuReturned.length ? 'Nobody returned in this month.' : 'No returns recorded yet. They are picked up each time a new report is built.'}</div>`;
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
            <td data-label="Member"><strong>${fuEsc(contact.member_name)}</strong>${contact.phone ? `<small class="pd-sub">${fuEsc(fuPhoneText(contact.phone))}</small>` : ''}</td>
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

// ponytail: newest 2000 notes, same ceiling as the contact log.
async function fuLoadNotes() {
  const client = await fuClient();
  const [{ data, error }, { data: session }] = await Promise.all([
    client.from(FU_NOTES).select('*').order('created_at', { ascending: false }).limit(2000),
    client.auth.getSession()
  ]);
  fuUserEmail = session?.session?.user?.email || '';
  fuNotesReady = !(error && /does not exist|schema cache/i.test(error.message));
  if (error && fuNotesReady) throw error;
  fuNotes = data || [];
}

// ponytail: newest 2000 returns; page with .range() if the log outgrows it.
async function fuLoadReturns() {
  const client = await fuClient();
  const { data, error } = await client.from(FU_RETURNS).select('*').is('removed_at', null).order('returned_on', { ascending: false }).limit(2000);
  fuReturnsReady = !(error && /does not exist|schema cache/i.test(error.message));
  if (error && fuReturnsReady) throw error;
  fuReturned = data || [];
}

// Record who came back since the previous day's report (same rule as the nightly bot).
async function fuSaveReturns(report) {
  if (!fuReturnsReady) return 0;
  const client = await fuClient();
  const { data: previous, error } = await client.from(FU_TABLE).select('*')
    .lt('report_date', report.report_date).order('report_date', { ascending: false }).order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw error;
  const rows = fuReturns(previous, report).map(row => ({ ...row, report_id: report.id }));
  if (rows.length) {
    const { error: saveError } = await client.from(FU_RETURNS).upsert(rows, { onConflict: 'member_key,returned_on', ignoreDuplicates: true });
    if (saveError) throw saveError;
  }
  await fuLoadReturns();
  return rows.length;
}

// Soft remove (same day only, checked by the database): RLS answers a refusal with 0 rows.
async function fuRemoveReturn(id) {
  try {
    const client = await fuClient();
    const { data, error } = await client.from(FU_RETURNS).update({ removed_at: new Date().toISOString() }).eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Not removed. Returns can only be removed on the day they were recorded.');
    await fuLoadReturns();
    fuRenderReturned();
    fuToast('Removed from Returned.');
  } catch (error) {
    fuToast(error.message || 'Could not remove.', true);
  }
}

async function fuAddNote(key, text) {
  const result = fuBuild(fuCurrent);
  const row = [...result.orange, ...result.red, ...result.none, ...result.removed].find(item => item.key === key);
  const client = await fuClient();
  const { error } = await client.from(FU_NOTES).insert({ member_key: key, member_name: row?.name || key, note: text });
  if (error) throw error;
  window.portalNotifyMentions?.(text, `a Red / Orange note on ${row?.name || key}`);
  await fuLoadNotes();
}

// Note log changes; RLS answers a refused edit or delete with 0 rows, so check what came back.
async function fuChangeNote(id, change) {
  const client = await fuClient();
  const before = fuNotes.find(note => note.id === id);
  const query = change === null ? client.from(FU_NOTES).delete() : client.from(FU_NOTES).update({ note: change });
  const { data, error } = await query.eq('id', id).select('id');
  if (data?.length && change !== null) window.portalNotifyMentions?.(change, `a Red / Orange note on ${before?.member_name || 'a member'}`, before?.note);
  if (error) throw error;
  if (!data?.length) throw new Error(change === null ? 'Only the person who wrote a note can delete it.' : 'The note was not saved. You may not have edit access.');
  await fuLoadNotes();
}

async function fuRunNote(work, message) {
  try {
    await work();
    fuRender();
    fuToast(message);
  } catch (error) {
    fuToast(/does not exist|schema cache/i.test(error.message || '') ? 'Run supabase/follow_up_member_notes.sql in Supabase first.' : (error.message || 'Could not save the note.'), true);
  }
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
    return true;
  } catch (error) {
    fuToast(error.message || 'Could not save.', true);
    return false;
  }
}

// Steps 7.1-7.4: a new file means a fresh report from the files on screen. One report per
// day: a same-day refresh updates that day's report and keeps its notes; a new day clears them.
async function fuRegenerate(changes, status) {
  // A file without a date (membership) runs against the latest report only, never an older one.
  if (!changes.report_date && fuCurrent && fuReports[0] && fuCurrent.report_date !== fuReports[0].report_date) {
    throw new Error('Open the latest report from the Report list first, then upload this file.');
  }
  const reportDate = changes.report_date || fuCurrent?.report_date || new Date().toLocaleDateString('en-CA');
  const client = await fuClient();
  const sameDayId = fuCurrent?.report_date === reportDate ? fuCurrent.id : fuReports.find(report => report.report_date === reportDate)?.id;
  let sameDay = sameDayId === fuCurrent?.id ? fuCurrent : null;
  if (sameDayId && !sameDay) {
    const { data, error } = await client.from(FU_TABLE).select('*').eq('id', sameDayId).single();
    if (error) throw error;
    sameDay = data;
  }
  // Inputs come from the report on screen; notes and removals from that day's report, if any.
  const base = sameDay && fuCurrent ? { ...fuCurrent, report_date: reportDate, notes: sameDay.notes, removed: sameDay.removed } : fuCurrent;
  const next = fuNextReport(base, { ...changes, report_date: reportDate });
  if (!next) {
    status.textContent += changes.attendance || fuPending.attendance ? ' Now add the membership status export.' : ' Now add the attendance export.';
    fuPending = { ...fuPending, ...changes };
    return;
  }
  // A same-day update writes only the inputs: notes and removals saved meanwhile stay as they are.
  const { notes: _notes, removed: _removed, ...inputs } = next;
  const save = sameDay ? client.from(FU_TABLE).update(inputs).eq('id', sameDay.id) : client.from(FU_TABLE).insert(next);
  const { data, error } = await save.select().single();
  if (error) throw error;
  fuCurrent = data;
  fuPending = {};
  await fuLoadHistory();
  let returnsError = '';
  const returned = await fuSaveReturns(data).catch(saveError => { returnsError = saveError.message; return 0; });
  fuRender();
  const kept = Object.keys(next.notes).length;
  const back = returned ? `; ${fuPlural(returned, 'member')} returned` : '';
  if (returnsError) fuToast(`Report saved, but returns were not recorded: ${returnsError}`, true);
  else fuToast(sameDay ? `Report for ${fuLongDate(reportDate)} updated${kept ? `; ${fuPlural(kept, 'note')} kept` : ''}${back}.` : `Report built${back}.`);
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
    fuDialogRow.phone ? `<a class="fu-phone" href="tel:${fuEsc(fuDialogRow.phone.replace(/\s/g, ''))}">Call ${fuEsc(fuPhoneText(fuDialogRow.phone))}</a>` : 'No phone number on file',
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
    window.portalNotifyMentions?.(document.getElementById('fuContactNote').value, `a Red / Orange contact note on ${row.name}`);
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

// Starts the Zen Planner job through supabase/functions/run-pastdue-sync (sync.run permission and
// cooldown checked there); it re-pulls today's list in place, keeping today's notes.
async function fuSync(button) {
  button.disabled = true;
  try {
    const client = await fuClient();
    const { error } = await client.functions.invoke('run-pastdue-sync', { body: { job: 'followup' } });
    if (error) throw new Error(await error.context?.text?.().catch(() => '') || error.message);
    fuToast('Sync started. Today\'s list updates in about 3 minutes; refresh the page then.');
  } catch (error) {
    fuToast(error.message || 'Could not start the sync.', true);
  } finally {
    button.disabled = false;
  }
}

// Tier days and owners from Settings > Report rules; the built-in defaults stay if unset.
async function fuLoadTiers() {
  const client = await fuClient();
  const { data } = await client.from('app_settings').select('value').eq('key', 'followup_tiers').maybeSingle();
  fuApplyTiers(data?.value);
}

// ── PDF ──────────────────────────────────────────────────────────────────────

// The browser's print to "Save as PDF" keeps the page's own look; styles under @media print.
function fuPrint() {
  // The PDF is the whole report: every member, every tier open, whatever the screen filter.
  const show = fuShow;
  const collapsed = [...fuCollapsed];
  fuShow = 'all';
  fuRender();
  document.querySelectorAll('#fuReport details').forEach(details => { details.open = true; });
  window.addEventListener('afterprint', () => {
    fuShow = show;
    collapsed.forEach(tier => fuCollapsed.add(tier));
    fuRender();
  }, { once: true });
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
    if (button.dataset.tab === 'returned') fuRenderReturned();
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
    // One report per day: never move a report onto a date that already has one.
    if (fuReports.some(report => report.report_date === event.target.value && report.id !== fuCurrent.id)) {
      fuToast(`There is already a report for ${fuLongDate(event.target.value)}. Open it from the Report list instead.`, true);
      event.target.value = fuCurrent.report_date;
      return;
    }
    await fuUpdate({ report_date: event.target.value }, 'Report date changed; tiers recalculated.');
    await fuLoadHistory();
    fuRender();
  });

  document.getElementById('fuSearch').addEventListener('input', fuRender);
  document.getElementById('fuReturnMonth').addEventListener('input', fuRenderReturned);
  document.querySelectorAll('[data-show]').forEach(button => button.addEventListener('click', () => {
    fuShow = button.dataset.show;
    document.querySelectorAll('[data-show]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    fuRender();
  }));

  // Report, Follow-up and Returned tabs share these handlers (notes, contacts, removals).
  const report = document.querySelector('.follow-up-main');
  // "toggle" doesn't bubble, so listen in the capture phase.
  report.addEventListener('toggle', event => {
    const tier = event.target.dataset?.tier;
    if (tier) event.target.open ? fuCollapsed.delete(tier) : fuCollapsed.add(tier);
  }, true);
  // Top-level note: typing keeps a draft and shows save / cancel; Enter saves, Esc cancels.
  report.addEventListener('input', event => {
    const key = event.target.dataset.note;
    if (key === undefined) return;
    fuNoteDrafts.set(key, event.target.value);
    event.target.parentElement.classList.toggle('is-dirty', fuNoteEditing.has(key) || event.target.value !== (fuCurrent.notes?.[key] || ''));
  });
  report.addEventListener('submit', event => {
    const form = event.target;
    event.preventDefault();
    const text = form.querySelector('textarea')?.value.trim();
    if (!text) return;
    const button = form.querySelector('[type="submit"]');
    const original = fuNotes.find(note => String(note.id) === form.dataset.saveNote)?.note;
    if (form.dataset.saveNote && text === original) { fuRender(); return; }
    button.disabled = true;
    const work = form.dataset.saveNote
      ? fuRunNote(() => fuChangeNote(Number(form.dataset.saveNote), text), 'Note updated.')
      : fuRunNote(() => fuAddNote(form.dataset.addNote, text), 'Note added.');
    work.finally(() => { button.disabled = false; });
  });
  report.addEventListener('keydown', event => {
    const noteKey = event.target.dataset?.note;
    if (noteKey !== undefined && event.key === 'Enter') { event.preventDefault(); fuSaveTopNote(noteKey); return; }
    if (noteKey !== undefined && event.key === 'Escape') { fuCancelTopNote(noteKey); return; }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.matches('.fu-notes textarea')) event.target.form.requestSubmit();
    if (event.key === 'Escape' && event.target.matches('.fu-notes form[data-save-note] textarea')) fuRender();
  });
  report.addEventListener('click', event => {
    const noteButton = event.target.closest('[data-note-save], [data-note-cancel], [data-note-edit]');
    if (noteButton) {
      const { noteSave, noteCancel, noteEdit } = noteButton.dataset;
      if (noteSave !== undefined) fuSaveTopNote(noteSave);
      if (noteCancel !== undefined) fuCancelTopNote(noteCancel);
      if (noteEdit !== undefined) {
        fuNoteEditing.add(noteEdit);
        fuRender();
        const input = document.querySelector(`[data-note="${CSS.escape(noteEdit)}"]`);
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }
      return;
    }
    const toggle = event.target.closest('[data-notes]');
    if (toggle) {
      const key = toggle.dataset.notes;
      const open = !fuNotesOpen.has(key);
      if (open) fuNotesOpen.add(key); else fuNotesOpen.delete(key);
      toggle.setAttribute('aria-expanded', String(open));
      document.getElementById(toggle.getAttribute('aria-controls')).hidden = !open;
      return;
    }
    const item = event.target.closest('[data-note-id]');
    if (item && event.target.closest('[data-edit-note]')) {
      const note = fuNotes.find(entry => String(entry.id) === item.dataset.noteId);
      if (!note) return;
      item.innerHTML = `
        <form class="pd-note-edit" data-save-note="${note.id}">
          <label class="sr-only" for="fuEditNote-${note.id}">Edit note</label>
          <textarea id="fuEditNote-${note.id}" rows="3" maxlength="2000" required data-mention>${fuEsc(note.note)}</textarea>
          <div class="pd-note-form-row">
            <button type="button" class="pd-link" data-cancel-edit>Cancel</button>
            <button type="submit" class="sop-action-button primary pd-small">Save edit</button>
          </div>
        </form>`;
      item.querySelector('textarea').focus();
      return;
    }
    if (event.target.closest('[data-cancel-edit]')) { fuRender(); return; }
    if (item && event.target.closest('[data-delete-note]')) {
      if (window.confirm('Delete this note? This cannot be undone.')) fuRunNote(() => fuChangeNote(Number(item.dataset.noteId), null), 'Note deleted.');
      return;
    }
    const returnId = event.target.closest('[data-remove-return]')?.dataset.removeReturn;
    if (returnId) {
      if (window.confirm('Take this member off the Returned list? Use this for a wrong match, like a one-off class.')) fuRemoveReturn(Number(returnId));
      return;
    }
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
  document.getElementById('fuSyncBtn').addEventListener('click', event => fuSync(event.currentTarget));
  // Close the Export menu once an option is picked.
  document.getElementById('fuExport').addEventListener('click', event => {
    if (event.target.closest('button')) event.currentTarget.open = false;
  });

  Promise.all([fuLoadHistory(), fuLoadContacts(), fuLoadTiers(), fuLoadNotes().catch(error => fuToast(`Notes log: ${error.message}`, true)),
    fuLoadReturns().catch(error => fuToast(`Returned: ${error.message}`, true))])
    .then(() => {
      fuRenderLog();
      return fuReports[0] ? fuOpen(fuReports[0].id) : fuRender();
    })
    .catch(error => {
      document.getElementById('fuReport').innerHTML = `<div class="card"><div class="error">${fuEsc(error.message)}</div></div>`;
      document.getElementById('updatedLine').textContent = 'Could not load the report';
    });
}

// Save a top-level note to the report and the member's notes log. Your own same-day log
// entry for the old text is edited in place; anyone else's edit, or a later day's, is a new entry.
const fuSaving = new Set(); // member keys with a top-level note save in flight (Enter + click can't double-log)

async function fuSaveTopNote(key) {
  if (fuSaving.has(key)) return;
  const before = fuCurrent.notes?.[key] || '';
  const value = (fuNoteDrafts.get(key) ?? before).trim();
  const finish = () => { fuNoteDrafts.delete(key); fuNoteEditing.delete(key); fuRender(); };
  if (value === before) { finish(); return; }
  fuSaving.add(key);
  try {
    const notes = { ...(fuCurrent.notes || {}) };
    if (value) notes[key] = value; else delete notes[key];
    if (!await fuUpdate({ notes }, value ? 'Note saved.' : 'Note cleared; the log keeps it.')) return;
    if (value && fuNotesReady) {
      const own = before && fuNotesFor(key).find(note => note.author === fuUserEmail && note.note === before && fuIsToday(note.created_at));
      await (own ? fuChangeNote(own.id, value) : fuAddNote(key, value))
        .catch(error => fuToast(`Note saved, but not added to the log: ${error.message}`, true));
    }
    finish();
  } finally {
    fuSaving.delete(key);
  }
}

function fuCancelTopNote(key) {
  fuNoteDrafts.delete(key);
  fuNoteEditing.delete(key);
  fuRender();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fuInit);
else fuInit();
