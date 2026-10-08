const PAST_DUE_LOG_TABLE = 'past_due_member_log';
const PAST_DUE_EXEMPT_TABLE = 'past_due_exempted_members';
const PAST_DUE_FAILURE_REASON_TABLE = 'past_due_failure_reason';
const PAST_DUE_NOTES_TABLE = 'past_due_member_notes';
const PAST_DUE_STAGES = [
  'Pending Retry',
  'Stage 1 (5-7 days)',
  'Stage 2 (7-14 days)',
  'Stage 3 (15-30 days)',
  'Escalated',
  'Manual Invoice sent',
  'Cancelled Membership',
  'Cleared',
  'Inform Member'
];
const PAST_DUE_STATUS_STAGE = { CLEARED: 'Cleared', CANCELLED: 'Cancelled Membership' };

let pastDueRows = [];
let pastDueExemptedRows = [];
let pastDueFailureReasonsList = [];
let pastDueNotes = [];            // member-level notes, newest first
let pastDueNotesReady = true;     // false until supabase/past_due_member_notes.sql has been run
let pastDueUserEmail = '';
let pendingPastDueFile = null;
let pendingExemptedFile = null;
let pendingCancelMember = null;
const pastDueExpanded = new Set(); // "containerId|memberKey" of open member rows, kept across re-renders
const pastDueViews = new Map();    // containerId -> members currently rendered there
const pastDueExemptSelected = new Set(); // ids ticked on the Exempted tab

const pastDueMoneyFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function pastDueFailureReasons() {
  return pastDueFailureReasonsList;
}

async function loadPastDueFailureReasons() {
  try {
    const client = await pastDueClient();
    const { data, error } = await client
      .from(PAST_DUE_FAILURE_REASON_TABLE)
      .select('reason')
      .order('reason', { ascending: true });
    if (error) throw error;
    pastDueFailureReasonsList = (data || []).map(item => item.reason).filter(Boolean);
  } catch (err) {
    console.error('Failed to load failure reasons from Supabase:', err);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pastDueDaysOverdue(dueDate) {
  const dateStr = pastDueDateValue(dueDate);
  if (!dateStr) return null;

  const due = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - due) / 86400000));
}

// ── Formatting ───────────────────────────────────────────────────────────────

function pastDueMoney(value) {
  return pastDueMoneyFormat.format(Number(value) || 0);
}

function pastDueShortDate(value) {
  const iso = pastDueDateValue(value);
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pastDueWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === new Date().toDateString()) {
    return `Today ${date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`;
  }
  const days = Math.max(1, Math.floor((Date.now() - date) / 86400000));
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pastDuePlural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function pastDueToast(message, isError = false) {
  const toast = document.getElementById('pastDueToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.hidden = false;
  clearTimeout(pastDueToast.timer);
  pastDueToast.timer = setTimeout(() => { toast.hidden = true; }, isError ? 6000 : 2500);
}

// ── Failure reason modal ─────────────────────────────────────────────────────

function pastDueOpenFailureReasonModal() {
  const modal = document.getElementById('failureReasonModal');
  const input = document.getElementById('failureReasonInput');
  if (!modal || !input) return;
  input.value = '';
  input.removeAttribute('aria-invalid');
  modal.classList.remove('hidden');
  input.focus();
}

function pastDueCloseFailureReasonModal() {
  document.getElementById('failureReasonModal')?.classList.add('hidden');
}

async function pastDueApproveFailureReason() {
  const input = document.getElementById('failureReasonInput');
  const hint = document.getElementById('failureReasonHint');
  if (!input) return;
  const reason = input.value.trim();

  if (!reason) {
    input.setAttribute('aria-invalid', 'true');
    if (hint) hint.textContent = 'Enter a failure reason before approving.';
    input.focus();
    return;
  }

  try {
    const client = await pastDueClient();
    const { error } = await client.from(PAST_DUE_FAILURE_REASON_TABLE).insert([{ reason }]);
    if (error) throw error;

    await loadPastDueFailureReasons();
    pastDueCloseFailureReasonModal();
    pastDueRender();
    pastDueToast(`Failure reason "${reason}" added.`);
  } catch (err) {
    console.error('Error adding failure reason:', err);
    if (hint) hint.textContent = err.message || 'Unable to save failure reason.';
  }
}

// ── Members: one per person, holding all of their bills ─────────────────────

// Bills stay the same objects as in pastDueRows, so a saved edit updates both.
function pastDueMergeRows(rows) {
  const members = new Map();
  rows.forEach(bill => {
    const key = pastDueIdentity(bill.member_name) || bill.member_key;
    if (!members.has(key)) members.set(key, { key, member_name: bill.member_name, bills: [] });
    members.get(key).bills.push(bill);
  });
  return [...members.values()];
}

function pastDueWithStatus(members, status) {
  return members
    .map(member => ({ ...member, bills: member.bills.filter(bill => bill.status === status) }))
    .filter(member => member.bills.length);
}

function pastDueBillDays(bill) {
  return pastDueDaysOverdue(bill.due_date) ?? bill.days_overdue ?? 0;
}

function pastDueTotal(bills) {
  return bills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
}

function pastDueOldest(bills) {
  return Math.max(0, ...bills.map(pastDueBillDays));
}

function pastDueMemberStatus(bills) {
  if (bills.some(bill => bill.status === 'PAST DUE')) return 'PAST DUE';
  return bills.some(bill => bill.status === 'CANCELLED') ? 'CANCELLED' : 'CLEARED';
}

function pastDueNotesFor(member) {
  if (pastDueNotesReady) return pastDueNotes.filter(note => note.member_identity === member.key);
  // Before the notes table exists, show the old per-bill notes read-only.
  return member.bills
    .filter(bill => bill.notes || bill.outcome_notes)
    .map(bill => ({ note: bill.notes || bill.outcome_notes, author: `Bill #${bill.member_number || '?'}`, created_at: bill.imported_at }));
}

function pastDueLastNoteTime(member) {
  const latest = pastDueNotesFor(member)[0];
  return latest ? Date.parse(latest.created_at) || 0 : 0;
}

async function pastDueClient() {
  if (window.authReady) await window.authReady;
  if (!window.supabaseClient) throw new Error('Your Supabase session is not active. Please sign in again.');
  return window.supabaseClient;
}

function pastDueOptionList(options, selected) {
  return options.map(option => `<option value="${escapeHtml(option)}"${option === selected ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('');
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function pastDueUpdateBills(bills, patch) {
  const client = await pastDueClient();
  const { error } = await client.from(PAST_DUE_LOG_TABLE).update(patch).in('id', bills.map(bill => bill.id));
  if (error) throw error;
  bills.forEach(bill => Object.assign(bill, patch));
}

async function pastDueAddNote(member, text) {
  if (!pastDueNotesReady) return;
  const client = await pastDueClient();
  const { data, error } = await client
    .from(PAST_DUE_NOTES_TABLE)
    .insert({ member_identity: member.key, member_name: member.member_name, note: text })
    .select()
    .single();
  if (error) throw error;
  pastDueNotes.unshift(data);
}

async function pastDueEditNote(noteId, text) {
  const client = await pastDueClient();
  const { data, error } = await client.from(PAST_DUE_NOTES_TABLE).update({ note: text }).eq('id', noteId).select().single();
  if (error) throw error;
  pastDueNotes = pastDueNotes.map(note => (String(note.id) === String(noteId) ? data : note));
}

async function pastDueDeleteNote(noteId) {
  const client = await pastDueClient();
  const { error } = await client.from(PAST_DUE_NOTES_TABLE).delete().eq('id', noteId);
  if (error) throw error;
  pastDueNotes = pastDueNotes.filter(note => String(note.id) !== String(noteId));
}

// ── Member table ─────────────────────────────────────────────────────────────

function pastDueBillsHtml(member, mode, focusId) {
  const editable = mode !== 'log';
  const rows = member.bills.map(bill => {
    const days = pastDueBillDays(bill);
    const label = `bill ${bill.member_number || ''}`;
    const cell = (labelText, editor, text) => `<td data-label="${labelText}">${editable ? editor : escapeHtml(text || '—')}</td>`;
    return `
      <tr data-bill-id="${escapeHtml(bill.id)}">
        <td data-label="Bill"><strong>#${escapeHtml(bill.member_number || '—')}</strong>${bill.bill_type && bill.bill_type !== bill.member_number && bill.bill_type.toLowerCase() !== 'bill' ?`<small class="pd-sub">${escapeHtml(bill.bill_type)}</small>` : ''}</td>
        ${cell('Due', `<input type="date" data-field="due_date" aria-label="Due date, ${escapeHtml(label)}" data-focus="${focusId(`due-${bill.id}`)}" value="${pastDueDateValue(bill.due_date) || ''}">`, pastDueShortDate(bill.due_date))}
        <td class="num" data-label="Days">${days}</td>
        ${cell('Amount', `<input type="number" step="0.01" min="0" inputmode="decimal" class="pd-amount" data-field="amount" aria-label="Amount, ${escapeHtml(label)}" data-focus="${focusId(`amount-${bill.id}`)}" value="${bill.amount ?? ''}">`, pastDueMoney(bill.amount))}
        ${cell('Stage', `<select data-field="stage" aria-label="Stage, ${escapeHtml(label)}" data-focus="${focusId(`stage-${bill.id}`)}"><option value="">Not set</option>${pastDueOptionList(PAST_DUE_STAGES, bill.stage)}</select>`, bill.stage)}
        ${cell('Failure reason', `<select data-field="failure_reason" aria-label="Failure reason, ${escapeHtml(label)}" data-focus="${focusId(`reason-${bill.id}`)}"><option value="">Not set</option>${pastDueOptionList([...new Set([...pastDueFailureReasons(), bill.failure_reason].filter(Boolean))], bill.failure_reason)}</select>`, bill.failure_reason)}
        ${cell('Status', `<select data-field="status" aria-label="Status, ${escapeHtml(label)}" data-focus="${focusId(`status-${bill.id}`)}">${pastDueOptionList(['PAST DUE', 'CLEARED', 'CANCELLED'], bill.status)}</select>`, bill.status)}
        ${mode === 'open' ? `<td data-label=""><button type="button" class="sop-action-button secondary pd-small" data-action="clear-bill" data-focus="${focusId(`clear-${bill.id}`)}">Mark paid</button></td>` : ''}
      </tr>`;
  }).join('');

  return `
    <section class="pd-bills" aria-label="Bills for ${escapeHtml(member.member_name)}">
      <table class="stack pd-bill-table">
        <thead><tr><th>Bill</th><th>Due</th><th class="num">Days</th><th>Amount</th><th>Stage</th><th>Failure reason</th><th>Status</th>${mode === 'open' ? '<th><span class="sr-only">Action</span></th>' : ''}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function pastDueNotesHtml(member, notes, focusId) {
  const form = pastDueNotesReady
    ? `<form class="pd-note-form" data-action="add-note">
        <label class="sr-only" for="${focusId('note')}">Add a note for ${escapeHtml(member.member_name)}</label>
        <textarea id="${focusId('note')}" rows="2" maxlength="2000" required data-focus="${focusId('note')}" placeholder="Call made, promise to pay, payment plan…"></textarea>
        <div class="pd-note-form-row"><small>Ctrl + Enter to save</small><button type="submit" class="sop-action-button primary pd-small">Add note</button></div>
      </form>`
    : '<p class="pd-notice">Member notes need a one-time database update: run <code>supabase/past_due_member_notes.sql</code>. Older bill notes are shown below.</p>';

  const list = notes.length
    ? notes.map(note => `
        <li${note.id ? ` data-note-id="${escapeHtml(note.id)}"` : ''}>
          <p>${escapeHtml(note.note)}</p>
          <span class="pd-note-meta">${escapeHtml(note.author || 'Staff')} · <time datetime="${escapeHtml(note.created_at)}">${escapeHtml(pastDueWhen(note.created_at))}</time>${note.edited_at ? ` · <span class="pd-edited">Edited by ${escapeHtml(note.edited_by || 'Staff')} ${escapeHtml(pastDueWhen(note.edited_at))}</span>` : ''}${pastDueNotesReady && note.id ? ` <button type="button" class="pd-link" data-action="edit-note">Edit</button>` : ''}${pastDueNotesReady && note.id && note.author === pastDueUserEmail ? ` <button type="button" class="pd-link" data-action="delete-note">Delete</button>` : ''}</span>
        </li>`).join('')
    : '<li class="pd-muted">No notes yet.</li>';

  return `
    <section class="pd-notes">
      <h4>Notes <small>Shared across all of this member's bills</small></h4>
      ${form}
      <ol class="pd-note-list">${list}</ol>
    </section>`;
}

function pastDueActionsHtml(member, escalated, blocked, focusId) {
  return `
    <section class="pd-actions">
      <h4>Account</h4>
      <label class="pd-check"><input type="checkbox" data-action="escalate" data-focus="${focusId('escalate')}"${escalated ? ' checked' : ''}> Escalated to accounts</label>
      <label class="pd-check"><input type="checkbox" data-action="block" data-focus="${focusId('block')}"${blocked ? ' checked' : ''}> Class booking blocked</label>
      <div class="pd-action-buttons">
        <button type="button" class="sop-action-button primary" data-action="clear-all" data-focus="${focusId('clear-all')}">${member.bills.length > 1 ? `Mark all ${member.bills.length} bills paid` : 'Mark paid'}</button>
        <button type="button" class="sop-action-button danger" data-action="cancel" data-focus="${focusId('cancel')}">Cancel membership</button>
      </div>
    </section>`;
}

function pastDueMemberRowsHtml(containerId, member, index, mode) {
  const detailId = `${containerId}-member-${index}`;
  const open = pastDueExpanded.has(`${containerId}|${member.key}`);
  const focusId = what => escapeHtml(`${containerId}|${member.key}|${what}`);
  const days = pastDueOldest(member.bills);
  const oldestBill = member.bills.reduce((oldest, bill) => (pastDueBillDays(bill) > pastDueBillDays(oldest) ? bill : oldest));
  const notes = pastDueNotesFor(member);
  const escalated = member.bills.some(bill => bill.escalated_to_darius);
  const blocked = member.bills.some(bill => bill.class_blocked);
  const status = pastDueMemberStatus(member.bills);
  const statusClass = { CLEARED: ' is-cleared', CANCELLED: ' is-cancelled' }[status] || '';

  return `
    <tr class="parent-row${open ? ' is-open' : ''}" data-index="${index}">
      <td class="pd-toggle-cell">
        <button type="button" class="toggle-btn" aria-expanded="${open}" aria-controls="${detailId}" data-focus="${focusId('toggle')}" aria-label="Details for ${escapeHtml(member.member_name)}">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
        </button>
      </td>
      <td data-label="Member">
        <strong class="pd-name">${escapeHtml(member.member_name)}</strong>
        ${escalated || blocked ? `<span class="pd-flags">${escalated ? '<span class="pd-flag">Escalated</span>' : ''}${blocked ? '<span class="pd-flag">Class blocked</span>' : ''}</span>` : ''}
      </td>
      <td class="num" data-label="Bills">${member.bills.length}</td>
      <td class="num pd-balance" data-label="Balance">${pastDueMoney(pastDueTotal(member.bills))}</td>
      <td class="num measure" data-label="Oldest">${pastDuePlural(days, 'day')}<span class="stitch-meter${days > 30 ? ' late' : ''}" style="--p:${Math.min(days / 60, 1).toFixed(2)}" aria-hidden="true"></span></td>
      <td data-label="${mode === 'open' ? 'Stage' : 'Status'}">${mode === 'open' ? escapeHtml(oldestBill.stage || 'Not set') : `<span class="status-badge${statusClass}">${escapeHtml(status)}</span>`}</td>
      <td data-label="Last note" class="pd-last-note">${notes.length ? `${escapeHtml(pastDueWhen(notes[0].created_at))}<small>${pastDuePlural(notes.length, 'note')}</small>` : '<span class="pd-muted">None</span>'}</td>
    </tr>
    <tr class="child-row" id="${detailId}" data-index="${index}"${open ? '' : ' hidden'}>
      <td colspan="7">
        <div class="pd-detail">
          ${pastDueBillsHtml(member, mode, focusId)}
          <div class="pd-lower${mode === 'open' ? '' : ' is-single'}">
            ${pastDueNotesHtml(member, notes, focusId)}
            ${mode === 'open' ? pastDueActionsHtml(member, escalated, blocked, focusId) : ''}
          </div>
        </div>
      </td>
    </tr>`;
}

// mode: 'open' (past due, actionable), 'closed' (cleared / cancelled, editable), 'log' (read-only history)
function pastDueRenderTable(containerId, members, mode = 'open', emptyText = 'No members match.') {
  const container = document.getElementById(containerId);
  if (!container) return;
  pastDueViews.set(containerId, members);

  if (!members.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  container.innerHTML = `
    <table class="stack past-due-expandable-table pd-table">
      <thead>
        <tr>
          <th class="pd-toggle-cell"><span class="sr-only">Details</span></th>
          <th>Member</th>
          <th class="num">Bills</th>
          <th class="num">Balance</th>
          <th class="num">Oldest</th>
          <th>${mode === 'open' ? 'Stage' : 'Status'}</th>
          <th>Last note</th>
        </tr>
      </thead>
      <tbody>${members.map((member, index) => pastDueMemberRowsHtml(containerId, member, index, mode)).join('')}</tbody>
    </table>`;
}

function pastDueMemberFor(element) {
  const container = element.closest('.table-wrap');
  const row = element.closest('[data-index]');
  if (!container || !row) return null;
  return pastDueViews.get(container.id)?.[Number(row.dataset.index)] || null;
}

function pastDueToggle(parentRow) {
  const container = parentRow.closest('.table-wrap');
  const member = pastDueMemberFor(parentRow);
  const detail = parentRow.nextElementSibling;
  if (!member || !detail) return;
  const open = detail.hidden;
  const key = `${container.id}|${member.key}`;
  detail.hidden = !open;
  parentRow.classList.toggle('is-open', open);
  parentRow.querySelector('.toggle-btn')?.setAttribute('aria-expanded', String(open));
  if (open) pastDueExpanded.add(key);
  else pastDueExpanded.delete(key);
}

// ── Member actions (event delegation on the page) ───────────────────────────

async function pastDueRun(action, successMessage) {
  try {
    await action();
    pastDueRender();
    if (successMessage) pastDueToast(successMessage);
  } catch (error) {
    console.error(error);
    pastDueToast(error.message || 'Something went wrong. Nothing was saved.', true);
  }
}

function pastDueOnChange(event) {
  const input = event.target;
  if (input.matches('[data-action^="exempt-"]')) {
    pastDueOnExemptSelect(input);
    return;
  }
  const member = pastDueMemberFor(input);
  if (!member) return;

  if (input.dataset.field) {
    const bill = member.bills.find(item => String(item.id) === input.closest('[data-bill-id]')?.dataset.billId);
    if (!bill) return;
    const field = input.dataset.field;
    if (field === 'amount' && input.value !== '' && !(Number(input.value) >= 0)) {
      pastDueToast('Amount must be a number, 0 or more.', true);
      input.value = bill.amount ?? '';
      return;
    }
    const value = field === 'amount' ? (input.value === '' ? null : Number(input.value)) : (input.value || null);
    const patch = { [field]: value };
    if (field === 'status' && PAST_DUE_STATUS_STAGE[value]) patch.stage = PAST_DUE_STATUS_STAGE[value];

    const billName = `bill #${bill.member_number || '?'}`;
    let note = '';
    if (field === 'status') note = `Set ${billName} to ${value}.`;
    if (field === 'amount') note = `Changed ${billName} amount from ${pastDueMoney(bill.amount)} to ${pastDueMoney(value)}.`;

    pastDueRun(async () => {
      await pastDueUpdateBills([bill], patch);
      if (note) await pastDueAddNote(member, note);
    }, `Saved ${billName}.`);
    return;
  }

  const flag = { escalate: 'escalated_to_darius', block: 'class_blocked' }[input.dataset.action];
  if (flag) {
    const on = input.checked;
    const note = input.dataset.action === 'escalate'
      ? (on ? 'Escalated to accounts.' : 'Escalation removed.')
      : (on ? 'Class booking blocked.' : 'Class booking unblocked.');
    pastDueRun(async () => {
      await pastDueUpdateBills(member.bills, { [flag]: on });
      await pastDueAddNote(member, note);
    }, note);
  }
}

function pastDueOnClick(event) {
  const target = event.target;
  const action = target.closest('[data-action]')?.dataset.action;

  const parentRow = target.closest('.parent-row');
  if (parentRow && (target.closest('.toggle-btn') || !target.closest('button, a, input, select, textarea, label'))) {
    pastDueToggle(parentRow);
    return;
  }

  const member = pastDueMemberFor(target);
  if (!member || !action) return;

  if (action === 'clear-bill') {
    const bill = member.bills.find(item => String(item.id) === target.closest('[data-bill-id]')?.dataset.billId);
    if (!bill) return;
    pastDueRun(async () => {
      await pastDueUpdateBills([bill], { status: 'CLEARED', stage: 'Cleared' });
      await pastDueAddNote(member, `Marked bill #${bill.member_number || '?'} paid (${pastDueMoney(bill.amount)}).`);
    }, `Bill #${bill.member_number || '?'} marked paid.`);
  }

  if (action === 'clear-all') {
    const total = pastDueMoney(pastDueTotal(member.bills));
    if (!window.confirm(`Mark ${pastDuePlural(member.bills.length, 'bill')} for ${member.member_name} as paid (${total})?`)) return;
    pastDueRun(async () => {
      await pastDueUpdateBills(member.bills, { status: 'CLEARED', stage: 'Cleared' });
      await pastDueAddNote(member, `Marked ${pastDuePlural(member.bills.length, 'bill')} paid (${total}).`);
    }, `${member.member_name}: all bills marked paid.`);
  }

  if (action === 'cancel') pastDueOpenCancelModal(member);

  if (action === 'edit-note') {
    const item = target.closest('[data-note-id]');
    const note = pastDueNotes.find(entry => String(entry.id) === item.dataset.noteId);
    if (!note) return;
    const fieldId = `pdEditNote-${note.id}`;
    item.innerHTML = `
      <form class="pd-note-edit" data-action="save-note">
        <label class="sr-only" for="${fieldId}">Edit note</label>
        <textarea id="${fieldId}" rows="3" maxlength="2000" required>${escapeHtml(note.note)}</textarea>
        <div class="pd-note-form-row">
          <button type="button" class="pd-link" data-action="cancel-edit">Cancel</button>
          <button type="submit" class="sop-action-button primary pd-small">Save edit</button>
        </div>
      </form>`;
    item.querySelector('textarea').focus();
  }

  if (action === 'cancel-edit') pastDueRender();

  if (action === 'delete-note') {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    pastDueRun(() => pastDueDeleteNote(target.closest('[data-note-id]').dataset.noteId), 'Note deleted.');
  }
}

function pastDueOnSubmit(event) {
  const editForm = event.target.closest('form[data-action="save-note"]');
  if (editForm) {
    event.preventDefault();
    const noteId = editForm.closest('[data-note-id]').dataset.noteId;
    const text = editForm.querySelector('textarea').value.trim();
    const original = pastDueNotes.find(note => String(note.id) === noteId)?.note;
    if (!text) return;
    if (text === original) { pastDueRender(); return; }
    editForm.querySelector('button[type="submit"]').disabled = true;
    pastDueRun(() => pastDueEditNote(noteId, text), 'Note updated.');
    return;
  }

  const form = event.target.closest('form[data-action="add-note"]');
  if (!form) return;
  event.preventDefault();
  const member = pastDueMemberFor(form);
  const textarea = form.querySelector('textarea');
  const text = textarea.value.trim();
  if (!member || !text) return;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  pastDueRun(async () => {
    await pastDueAddNote(member, text);
    textarea.value = '';
  }, 'Note added.').finally(() => { button.disabled = false; });
}

// ── Cancel membership modal ──────────────────────────────────────────────────

function pastDueOpenCancelModal(member) {
  const modal = document.getElementById('cancelMembershipModal');
  const input = document.getElementById('cancellationReasonInput');
  if (!modal || !input) return;
  pendingCancelMember = member;
  input.value = '';
  document.getElementById('cancellationReasonHint').textContent = '';
  document.getElementById('cancelMembershipSummary').textContent =
    `${member.member_name}: ${pastDuePlural(member.bills.length, 'open bill')} (${pastDueMoney(pastDueTotal(member.bills))}) will move to Cancelled. The reason is added to the member's notes.`;
  modal.classList.remove('hidden');
  input.focus();
}

function pastDueCloseCancelModal() {
  pendingCancelMember = null;
  document.getElementById('cancelMembershipModal')?.classList.add('hidden');
}

async function pastDueApproveCancellation() {
  const input = document.getElementById('cancellationReasonInput');
  const hint = document.getElementById('cancellationReasonHint');
  const approveBtn = document.getElementById('approveCancellationBtn');
  const member = pendingCancelMember;
  if (!input || !member) return;

  const reason = input.value.trim();
  if (!reason) {
    hint.textContent = 'Enter a cancellation reason before approving.';
    input.focus();
    return;
  }

  approveBtn.disabled = true;
  approveBtn.textContent = 'Cancelling…';
  try {
    const patch = { status: 'CANCELLED', stage: 'Cancelled Membership' };
    // Without the notes table, keep the reason on the bills so it isn't lost.
    if (!pastDueNotesReady) patch.notes = [member.bills[0].notes, `Cancellation reason: ${reason}`].filter(Boolean).join(' | ');
    await pastDueUpdateBills(member.bills, patch);
    await pastDueAddNote(member, `Membership cancelled. Reason: ${reason}`);
    pastDueCloseCancelModal();
    pastDueRender();
    pastDueToast(`${member.member_name}: membership cancelled.`);
  } catch (error) {
    console.error('Cancellation failed:', error);
    hint.textContent = error.message || 'Unable to cancel membership.';
  } finally {
    approveBtn.disabled = false;
    approveBtn.textContent = 'Cancel membership';
  }
}

// ── Page render ──────────────────────────────────────────────────────────────

function pastDueRenderMetrics(elementId, members, amountLabel) {
  const container = document.getElementById(elementId);
  if (!container) return;
  const bills = members.flatMap(member => member.bills);
  const escalated = members.filter(member => member.bills.some(bill => bill.escalated_to_darius)).length;
  const blocked = members.filter(member => member.bills.some(bill => bill.class_blocked)).length;
  container.innerHTML = `
    <div class="past-due-metric key"><span>${escapeHtml(amountLabel)}</span><strong>${pastDueMoney(pastDueTotal(bills))}</strong></div>
    <div class="past-due-metric"><span>Members</span><strong>${members.length}<small>${pastDuePlural(bills.length, 'bill')}</small></strong></div>
    <div class="past-due-metric"><span>Escalated</span><strong>${escalated}</strong></div>
    <div class="past-due-metric"><span>Class blocked</span><strong>${blocked}</strong></div>`;
}

function pastDueRenderAgeing(members) {
  const container = document.getElementById('pastDueAgeing');
  if (!container) return;
  const buckets = [['0–7 days', 0, 7], ['8–14 days', 8, 14], ['15–30 days', 15, 30], ['31+ days', 31, Infinity]];
  const total = pastDueTotal(members.flatMap(member => member.bills)) || 1;
  container.innerHTML = buckets.map(([label, min, max]) => {
    const inBucket = members.filter(member => {
      const days = pastDueOldest(member.bills);
      return days >= min && days <= max;
    });
    const amount = pastDueTotal(inBucket.flatMap(member => member.bills));
    return `
      <div class="pd-age${min > 30 && inBucket.length ? ' is-late' : ''}">
        <span>${label}</span>
        <strong>${pastDueMoney(amount)}</strong>
        <small>${pastDuePlural(inBucket.length, 'member')}</small>
        <span class="stitch-meter${min > 30 ? ' late' : ''}" style="--p:${(amount / total).toFixed(2)}" aria-hidden="true"></span>
      </div>`;
  }).join('');
}

function pastDueMatches(member, query) {
  if (!query) return true;
  return pastDueIdentity(member.member_name).includes(query)
    || member.bills.some(bill => String(bill.member_number || '').toLowerCase().includes(query));
}

const PAST_DUE_SORTS = {
  days: (a, b) => pastDueOldest(b.bills) - pastDueOldest(a.bills),
  amount: (a, b) => pastDueTotal(b.bills) - pastDueTotal(a.bills),
  name: (a, b) => a.member_name.localeCompare(b.member_name),
  note: (a, b) => pastDueLastNoteTime(a) - pastDueLastNoteTime(b) || pastDueOldest(b.bills) - pastDueOldest(a.bills)
};

function pastDueQuery(id) {
  return pastDueIdentity(document.getElementById(id)?.value);
}

function pastDueSetCount(id, members) {
  const element = document.getElementById(id);
  if (element) element.textContent = `${pastDuePlural(members.length, 'member')} · ${pastDueMoney(pastDueTotal(members.flatMap(member => member.bills)))}`;
}

function pastDueRender() {
  // Re-rendering replaces the rows, so carry focus and unsent note drafts across.
  const focusId = document.activeElement?.dataset?.focus;
  const drafts = [...document.querySelectorAll('.pd-note-form textarea')].filter(textarea => textarea.value).map(textarea => [textarea.dataset.focus, textarea.value]);

  const exemptKeys = pastDueExemptKeys();
  const members = pastDueMergeRows(pastDueRows.filter(row => !pastDueIsExempt(row, exemptKeys)));
  const openMembers = pastDueWithStatus(members, 'PAST DUE');
  const clearedMembers = pastDueWithStatus(members, 'CLEARED');
  const cancelledMembers = pastDueWithStatus(members, 'CANCELLED');
  const openBills = openMembers.flatMap(member => member.bills);

  const metrics = document.getElementById('pastDueMetrics');
  if (metrics) {
    metrics.innerHTML = `
      <div class="past-due-metric key"><span>Total overdue</span><strong>${pastDueMoney(pastDueTotal(openBills))}</strong></div>
      <div class="past-due-metric"><span>Members past due</span><strong>${openMembers.length}<small>${pastDuePlural(openBills.length, 'bill')}</small></strong></div>
      <div class="past-due-metric"><span>Escalated</span><strong>${openMembers.filter(member => member.bills.some(bill => bill.escalated_to_darius)).length}</strong></div>
      <div class="past-due-metric"><span>Cleared / cancelled</span><strong>${clearedMembers.length} / ${cancelledMembers.length}</strong></div>`;
  }
  pastDueRenderAgeing(openMembers);

  const byDays = [...openMembers].sort(PAST_DUE_SORTS.days);
  pastDueRenderTable('dashboardTable', byDays.slice(0, 5), 'open', 'Nobody is past due.');

  const stage = document.getElementById('pastDueStageFilter')?.value || '';
  const sort = PAST_DUE_SORTS[document.getElementById('pastDueSort')?.value] || PAST_DUE_SORTS.days;
  const pastDueList = openMembers
    .filter(member => pastDueMatches(member, pastDueQuery('nameSearchPastDue')))
    .filter(member => !stage || member.bills.some(bill => (bill.stage || '') === stage))
    .sort(sort);
  pastDueSetCount('pastDueCount', pastDueList);
  pastDueRenderTable('pastDueTable', pastDueList, 'open', openMembers.length ? 'No past due members match these filters.' : 'Nobody is past due.');

  const clearedList = clearedMembers.filter(member => pastDueMatches(member, pastDueQuery('nameSearchCleared')));
  pastDueSetCount('clearedCount', clearedList);
  pastDueRenderTable('clearedTable', clearedList, 'closed');

  const cancelledList = cancelledMembers.filter(member => pastDueMatches(member, pastDueQuery('nameSearchCancelled')));
  pastDueSetCount('cancelledCount', cancelledList);
  pastDueRenderTable('cancelledTable', cancelledList, 'closed');

  pastDueRenderMetrics('pastDueTabMetrics', openMembers, 'Total overdue');
  pastDueRenderMetrics('clearedTabMetrics', clearedMembers, 'Total cleared');
  pastDueRenderMetrics('cancelledTabMetrics', cancelledMembers, 'Balance on cancelled');

  pastDueRenderExemptions();
  pastDueRenderLogGroups();
  pastDueRenderFailureReasons();

  drafts.forEach(([id, value]) => {
    const textarea = pastDueFocusTarget(id);
    if (textarea) textarea.value = value;
  });
  if (focusId) pastDueFocusTarget(focusId)?.focus();
}

function pastDueFocusTarget(id) {
  return id ? document.querySelector(`[data-focus="${CSS.escape(id)}"]`) : null;
}

function pastDueRenderFailureReasons() {
  const list = document.getElementById('failureReasonList');
  if (!list) return;
  list.innerHTML = pastDueFailureReasons().length
    ? pastDueFailureReasons().map(reason => `<li>${escapeHtml(reason)}</li>`).join('')
    : '<li class="pd-muted">No reasons yet.</li>';
}

function pastDueImportDateKey(row) {
  const date = row.imported_at ? new Date(row.imported_at) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'unknown';
}

function pastDueRenderLogGroups() {
  const container = document.getElementById('logTable');
  if (!container) return;

  const selectedDate = document.getElementById('logDateFilter')?.value || '';
  const query = pastDueQuery('nameSearchLog');

  const groups = new Map();
  [...pastDueRows]
    .filter(row => !selectedDate || pastDueImportDateKey(row) === selectedDate)
    .filter(row => !query || pastDueIdentity(row.member_name).includes(query) || String(row.member_number || '').toLowerCase().includes(query))
    .sort((a, b) => new Date(b.imported_at || 0) - new Date(a.imported_at || 0))
    .forEach(row => {
      const key = pastDueImportDateKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

  if (!groups.size) {
    container.innerHTML = '<div class="empty">No log entries match.</div>';
    return;
  }

  const wasOpen = new Set([...container.querySelectorAll('details[open]')].map(details => details.dataset.date));
  const firstRender = !container.querySelector('details');
  container.innerHTML = [...groups.entries()].map(([dateKey, rows], index) => {
    const members = pastDueMergeRows(rows);
    const open = firstRender ? index === 0 : wasOpen.has(dateKey);
    return `
      <details class="past-due-log-group" data-date="${escapeHtml(dateKey)}"${open ? ' open' : ''}>
        <summary class="past-due-log-group-header">
          <h3>${dateKey === 'unknown' ? 'Unknown import date' : escapeHtml(pastDueShortDate(dateKey))}</h3>
          <span class="past-due-log-group-summary"><strong>${pastDuePlural(members.length, 'member')}</strong><span>·</span><strong>${pastDuePlural(rows.length, 'bill')}</strong><span>·</span><strong>${pastDueMoney(pastDueTotal(rows))}</strong></span>
        </summary>
        <div class="table-wrap" id="pastDueLogGroup-${index}"></div>
      </details>`;
  }).join('');

  [...groups.values()].forEach((rows, index) => pastDueRenderTable(`pastDueLogGroup-${index}`, pastDueMergeRows(rows), 'log'));
}

async function pastDueLoad() {
  const client = await pastDueClient();

  const [, log, exemptions, notes, session] = await Promise.all([
    loadPastDueFailureReasons(),
    client.from(PAST_DUE_LOG_TABLE).select('*').order('imported_at', { ascending: false }),
    client.from(PAST_DUE_EXEMPT_TABLE).select('*').order('created_at', { ascending: false }),
    client.from(PAST_DUE_NOTES_TABLE).select('*').order('created_at', { ascending: false }),
    client.auth.getSession()
  ]);
  if (log.error) throw log.error;
  if (exemptions.error) throw exemptions.error;
  if (notes.error) console.warn('Member notes unavailable:', notes.error.message);

  pastDueRows = Array.isArray(log.data) ? log.data : [];
  pastDueExemptedRows = Array.isArray(exemptions.data) ? exemptions.data : [];
  pastDueNotesReady = !notes.error;
  pastDueNotes = notes.data || [];
  pastDueUserEmail = session?.data?.session?.user?.email || '';
  pastDueRender();

  const updatedLine = document.getElementById('updatedLine');
  if (updatedLine) {
    const latest = pastDueRows[0]?.imported_at;
    updatedLine.textContent = latest ? `Latest import ${pastDueShortDate(latest)}` : 'No imports yet';
  }
}

// ── Exemptions ───────────────────────────────────────────────────────────────

function pastDueExemptKeys() {
  return new Set(pastDueExemptedRows.flatMap(item => [item.member_key, item.member_number, item.member_name].map(pastDueIdentity).filter(Boolean)));
}

function pastDueIsExempt(row, keys = pastDueExemptKeys()) {
  return [row.member_key, row.member_number, row.member_name].map(pastDueIdentity).some(key => key && keys.has(key));
}

const PAST_DUE_EXEMPT_FILTERS = { exemptMembershipFilter: 'membership_label', exemptStatusFilter: 'mbr_status', exemptAutopayFilter: 'autopay' };

// Dropdown options come from the list itself; a choice that no longer exists falls back to "All".
function pastDueFillExemptFilters() {
  Object.entries(PAST_DUE_EXEMPT_FILTERS).forEach(([id, field]) => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const values = [...new Set(pastDueExemptedRows.map(row => row[field]).filter(Boolean))].sort();
    select.length = 1;
    select.insertAdjacentHTML('beforeend', pastDueOptionList(values, current));
    select.value = values.includes(current) ? current : '';
  });
}

function pastDueVisibleExemptions() {
  const query = pastDueQuery('exemptSearch');
  return pastDueExemptedRows.filter(row =>
    (!query || pastDueIdentity(row.member_name).includes(query) || String(row.member_number || '').toLowerCase().includes(query))
    && Object.entries(PAST_DUE_EXEMPT_FILTERS).every(([id, field]) => {
      const value = document.getElementById(id)?.value;
      return !value || row[field] === value;
    }));
}

function pastDueRenderExemptions() {
  const container = document.getElementById('exemptedTable');
  if (!container) return;
  pastDueFillExemptFilters();
  const rows = pastDueVisibleExemptions();
  const total = pastDueExemptedRows.length;
  const count = document.getElementById('exemptCount');
  if (count) count.textContent = rows.length === total ? pastDuePlural(total, 'member') : `${rows.length} of ${total} members`;

  // Only rows on screen can stay ticked, so "Remove" never touches hidden members.
  const ids = new Set(rows.map(row => String(row.id)));
  [...pastDueExemptSelected].forEach(id => { if (!ids.has(id)) pastDueExemptSelected.delete(id); });
  pastDueUpdateExemptBar();

  if (!rows.length) {
    container.innerHTML = `<div class="empty">${total ? 'No exempted members match these filters.' : 'No exempted members.'}</div>`;
    return;
  }
  const allChecked = pastDueExemptSelected.size === ids.size;
  container.innerHTML = `
    <table class="stack pd-exempt-table">
      <thead><tr><th class="pd-check-cell"><input type="checkbox" data-action="exempt-all" aria-label="Select all members shown"${allChecked ? ' checked' : ''}></th><th>Member</th><th>Number</th><th>Membership</th><th>Status</th><th>Begins</th><th>Ends</th><th>Autopay</th><th>Note</th><th>Added</th></tr></thead>
      <tbody>${rows.map(row => `
        <tr${pastDueExemptSelected.has(String(row.id)) ? ' class="is-selected"' : ''}>
          <td class="pd-check-cell" data-label=""><input type="checkbox" data-action="exempt-select" data-id="${escapeHtml(row.id)}" aria-label="Select ${escapeHtml(row.member_name || row.member_number)}"${pastDueExemptSelected.has(String(row.id)) ? ' checked' : ''}></td>
          <td data-label="Member"><strong>${escapeHtml(row.member_name || '—')}</strong></td>
          <td data-label="Number">${escapeHtml(row.member_number || '—')}</td>
          <td data-label="Membership">${escapeHtml(row.membership_label || '—')}</td>
          <td data-label="Status">${escapeHtml(row.mbr_status || '—')}</td>
          <td data-label="Begins">${escapeHtml(pastDueShortDate(row.mbr_begin_date))}</td>
          <td data-label="Ends">${escapeHtml(pastDueShortDate(row.mbr_end_date))}</td>
          <td data-label="Autopay">${escapeHtml(row.autopay || '—')}</td>
          <td data-label="Note">${escapeHtml(row.note || '—')}</td>
          <td data-label="Added">${escapeHtml(pastDueShortDate(row.created_at))}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function pastDueUpdateExemptBar() {
  const count = pastDueExemptSelected.size;
  const button = document.getElementById('removeExemptedBtn');
  const label = document.getElementById('exemptSelectedCount');
  if (button) {
    button.disabled = !count;
    button.textContent = count ? `Remove ${pastDuePlural(count, 'member')}` : 'Remove selected';
  }
  if (label) label.textContent = count ? `${count} selected` : 'Tick members to remove them from the list.';
}

function pastDueOnExemptSelect(input) {
  const table = input.closest('table');
  const boxes = [...table.querySelectorAll('[data-action="exempt-select"]')];
  if (input.dataset.action === 'exempt-all') {
    boxes.forEach(box => (input.checked ? pastDueExemptSelected.add(box.dataset.id) : pastDueExemptSelected.delete(box.dataset.id)));
  } else if (input.checked) {
    pastDueExemptSelected.add(input.dataset.id);
  } else {
    pastDueExemptSelected.delete(input.dataset.id);
  }
  // Update in place so keyboard focus stays on the ticked box.
  boxes.forEach(box => {
    box.checked = pastDueExemptSelected.has(box.dataset.id);
    box.closest('tr').classList.toggle('is-selected', box.checked);
  });
  table.querySelector('[data-action="exempt-all"]').checked = boxes.every(box => box.checked);
  pastDueUpdateExemptBar();
}

async function pastDueRemoveSelectedExemptions() {
  const rows = pastDueExemptedRows.filter(row => pastDueExemptSelected.has(String(row.id)));
  if (!rows.length) return;
  const names = rows.slice(0, 5).map(row => row.member_name || row.member_number).join(', ') + (rows.length > 5 ? `, and ${rows.length - 5} more` : '');
  if (!window.confirm(`Remove ${pastDuePlural(rows.length, 'member')} from the exemption list?\n\n${names}\n\nTheir bills will show in the reports again.`)) return;
  const button = document.getElementById('removeExemptedBtn');
  if (button) button.disabled = true;
  try {
    const client = await pastDueClient();
    const { error } = await client.from(PAST_DUE_EXEMPT_TABLE).delete().in('id', rows.map(row => row.id));
    if (error) throw error;
    pastDueExemptedRows = pastDueExemptedRows.filter(row => !rows.includes(row));
    pastDueExemptSelected.clear();
    pastDueRender();
    pastDueToast(`${pastDuePlural(rows.length, 'member')} removed from the exemption list.`);
  } catch (error) {
    pastDueUpdateExemptBar();
    pastDueToast(error.message || 'Unable to remove exemptions.', true);
  }
}

function pastDueNormalizeExemption(row) {
  const firstName = pastDueFirstValue(row, ['first_name', 'first']);
  const lastName = pastDueFirstValue(row, ['last_name', 'last']);
  const memberName = [firstName, lastName].filter(Boolean).join(' ') || pastDueFirstValue(row, ['member_name', 'member', 'name', 'full_name']);
  const memberNumber = pastDueFirstValue(row, ['member_number', 'number', 'bill', 'bill_number', 'bill_no']);
  const memberKey = pastDueIdentity(memberNumber || memberName);
  return {
    member_key: memberKey,
    member_name: memberName || memberNumber,
    member_number: memberNumber || null,
    first_name: firstName || null,
    last_name: lastName || null,
    membership_label: pastDueFirstValue(row, ['membership_label', 'membership', 'label']) || null,
    mbr_status: pastDueFirstValue(row, ['mbr_status', 'status']) || null,
    mbr_begin_date: pastDueDateValue(pastDueFirstValue(row, ['mbr_begin_date', 'begin_date'])) || null,
    mbr_end_date: pastDueDateValue(pastDueFirstValue(row, ['mbr_end_date', 'end_date'])) || null,
    att_limit: pastDueFirstValue(row, ['att_limit', 'attendance_limit']) || null,
    att_limit_type: pastDueFirstValue(row, ['att_limit_type', 'attendance_limit_type']) || null,
    people_count: pastDueFirstValue(row, ['people_count', 'people']) || null,
    autopay: pastDueFirstValue(row, ['autopay', 'autopay_account']) || null,
    note: pastDueFirstValue(row, ['note', 'notes']) || null
  };
}

async function pastDueSaveExemptions(rows) {
  const client = await pastDueClient();
  const uniqueRows = Array.from(new Map(rows.filter(row => row.member_key).map(row => [row.member_key, row])).values());
  if (!uniqueRows.length) throw new Error('No member names or Bill # values were found.');
  const { error } = await client.from(PAST_DUE_EXEMPT_TABLE).upsert(uniqueRows, { onConflict: 'member_key' });
  if (error) throw error;
  await pastDueLoad();
  return uniqueRows.length;
}

async function pastDueAddManualExemption(event) {
  event?.preventDefault();
  const nameInput = document.getElementById('exemptedMemberNameInput');
  const numberInput = document.getElementById('exemptedMemberNumberInput');
  const row = pastDueNormalizeExemption({ member_name: nameInput.value, member_number: numberInput.value });
  if (!row.member_key) {
    pastDueSetUploadStatus('exemptedStatus', 'Enter a member name or number first.', true);
    nameInput.focus();
    return;
  }
  try {
    await pastDueSaveExemptions([row]);
    nameInput.value = '';
    numberInput.value = '';
    pastDueSetUploadStatus('exemptedStatus', `${row.member_name} was added to the exemption list.`);
  } catch (error) {
    pastDueSetUploadStatus('exemptedStatus', error.message || 'Unable to add member.', true);
  }
}

// ── Import / export ──────────────────────────────────────────────────────────

async function pastDueImport(file, importDateValue) {
  if (!importDateValue) throw new Error('Choose an import date before importing the CSV.');
  pastDueSetUploadStatus('pastDueImportStatus', `Processing ${file.name}…`);

  const cleanBatch = pastDueImportBatch(await file.text(), importDateValue);
  if (!cleanBatch.length) {
    throw new Error('No rows with both a bill number and a member name were found in this CSV.');
  }
  const before = pastDueRows.length;
  const client = await pastDueClient();

  const { error } = await client
    .from(PAST_DUE_LOG_TABLE)
    .upsert(cleanBatch, { onConflict: 'member_key', ignoreDuplicates: true });
  if (error) throw error;

  await pastDueLoad();
  const added = pastDueRows.length - before;
  return `Imported ${file.name}: ${pastDuePlural(added, 'new bill')}, ${cleanBatch.length - added} already on file and skipped.`;
}

// Starts the Zen Planner job through supabase/functions/run-pastdue-sync; it takes about 2 minutes.
async function pastDueSyncZenPlanner(button) {
  button.disabled = true;
  pastDueSetUploadStatus('zenSyncStatus', 'Starting…');
  try {
    const client = await pastDueClient();
    const { error } = await client.functions.invoke('run-pastdue-sync');
    if (error) throw new Error(await error.context?.text?.().catch(() => '') || error.message);
    pastDueSetUploadStatus('zenSyncStatus', 'Sync started. New bills will show here in about 3 minutes.');
    setTimeout(() => pastDueLoad().catch(() => {}), 180000);
  } catch (error) {
    pastDueSetUploadStatus('zenSyncStatus', error.message || 'Could not start the sync.', true);
  } finally {
    button.disabled = false;
  }
}

function pastDueCsvRows(rows, columns) {
  return [columns.join(','), ...rows.map(row => columns.map(column => `"${String(row[column] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
}

function pastDueSaveCsv(csv, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `${name}-${new Date().toLocaleDateString('en-CA')}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function pastDueDownloadExemptions() {
  pastDueSaveCsv(pastDueCsvRows(pastDueExemptedRows, ['member_number', 'first_name', 'last_name', 'membership_label', 'mbr_status', 'mbr_begin_date', 'mbr_end_date', 'att_limit', 'att_limit_type', 'people_count', 'autopay', 'note']), 'exempted-members');
}

function pastDueDownload() {
  pastDueSaveCsv(pastDueCsvRows(pastDueRows, ['member_name', 'member_number', 'bill_type', 'first_name', 'last_name', 'income_category', 'due_date', 'amount_due', 'amount', 'days_overdue', 'failure_reason', 'stage', 'last_payment_retry', 'last_contact_date', 'notes', 'outcome_notes', 'escalated_to_darius', 'class_blocked', 'autopay', 'autopay_account', 'status', 'imported_at']), 'past-due-member-log');
}

function pastDueDownloadNotes() {
  pastDueSaveCsv(pastDueCsvRows(pastDueNotes, ['member_name', 'note', 'author', 'created_at', 'edited_by', 'edited_at']), 'past-due-member-notes');
}

function pastDueSetUploadStatus(elementId, message, isError = false) {
  const status = document.getElementById(elementId);
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('upload-status-error', isError);
}

const PAST_DUE_UPLOADS = {
  pastDue: { input: 'pastDueCsvInput', status: 'pastDueImportStatus', buttons: ['confirmPastDueUploadBtn', 'removePastDueFileBtn'] },
  exempted: { input: 'exemptedCsvInput', status: 'exemptedStatus', buttons: ['confirmExemptedUploadBtn', 'removeExemptedFileBtn'] }
};

function pastDueSetUploadControls(type, enabled) {
  PAST_DUE_UPLOADS[type].buttons.forEach(buttonId => {
    const button = document.getElementById(buttonId);
    if (button) button.disabled = !enabled;
  });
}

function pastDueClearPendingUpload(type, statusMessage = 'No file selected') {
  if (type === 'exempted') pendingExemptedFile = null;
  else pendingPastDueFile = null;
  const input = document.getElementById(PAST_DUE_UPLOADS[type].input);
  if (input) input.value = '';
  pastDueSetUploadControls(type, false);
  pastDueSetUploadStatus(PAST_DUE_UPLOADS[type].status, statusMessage);
}

function pastDueBindUpload(type, onConfirm) {
  const config = PAST_DUE_UPLOADS[type];
  const input = document.getElementById(config.input);
  const confirm = document.getElementById(config.buttons[0]);
  input?.addEventListener('change', () => {
    const file = input.files[0] || null;
    if (type === 'exempted') pendingExemptedFile = file;
    else pendingPastDueFile = file;
    pastDueSetUploadControls(type, Boolean(file));
    if (file) pastDueSetUploadStatus(config.status, `Selected: ${file.name}`);
  });
  document.getElementById(config.buttons[1])?.addEventListener('click', () => pastDueClearPendingUpload(type));
  confirm?.addEventListener('click', async () => {
    const file = type === 'exempted' ? pendingExemptedFile : pendingPastDueFile;
    if (!file) return;
    confirm.disabled = true;
    try {
      pastDueClearPendingUpload(type, await onConfirm(file));
    } catch (error) {
      pastDueSetUploadStatus(config.status, error.message || 'CSV upload failed.', true);
      confirm.disabled = false;
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initPastDuePage() {
  const buttons = document.querySelectorAll('nav.site-nav button');
  const showTab = tab => {
    buttons.forEach(item => item.classList.toggle('active', item.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${tab}`));
  };
  buttons.forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
  document.querySelectorAll('[data-show-tab]').forEach(link => link.addEventListener('click', () => showTab(link.dataset.showTab)));

  const stageFilter = document.getElementById('pastDueStageFilter');
  if (stageFilter) stageFilter.insertAdjacentHTML('beforeend', pastDueOptionList(PAST_DUE_STAGES));

  ['nameSearchPastDue', 'nameSearchCleared', 'nameSearchCancelled', 'pastDueStageFilter', 'pastDueSort']
    .forEach(id => document.getElementById(id)?.addEventListener('input', pastDueRender));
  ['exemptSearch', ...Object.keys(PAST_DUE_EXEMPT_FILTERS)]
    .forEach(id => document.getElementById(id)?.addEventListener('input', pastDueRenderExemptions));
  ['nameSearchLog', 'logDateFilter']
    .forEach(id => document.getElementById(id)?.addEventListener('input', pastDueRenderLogGroups));

  const main = document.querySelector('.past-due-main');
  main?.addEventListener('click', pastDueOnClick);
  main?.addEventListener('change', pastDueOnChange);
  main?.addEventListener('submit', pastDueOnSubmit);
  main?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.matches('.pd-note-form textarea, .pd-note-edit textarea')) {
      event.preventDefault();
      event.target.form.requestSubmit();
    }
    if (event.key === 'Escape' && event.target.matches('.pd-note-edit textarea')) pastDueRender();
  });

  document.querySelectorAll('[data-pick]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.pick)?.click()));

  const importDate = document.getElementById('pastDueImportDate');
  if (importDate && !importDate.value) importDate.value = new Date().toLocaleDateString('en-CA');

  pastDueBindUpload('pastDue', file => {
    if (!importDate?.value) {
      importDate?.focus();
      throw new Error('Choose an import date before confirming the upload.');
    }
    return pastDueImport(file, importDate.value);
  });
  pastDueBindUpload('exempted', async file => {
    const count = await pastDueSaveExemptions(pastDueParseCsv(await file.text()).map(pastDueNormalizeExemption));
    return `Imported ${file.name}: ${pastDuePlural(count, 'member')} on the exemption list.`;
  });

  document.getElementById('zenSyncBtn')?.addEventListener('click', event => pastDueSyncZenPlanner(event.currentTarget));
  document.getElementById('downloadPastDueCsvBtn')?.addEventListener('click', pastDueDownload);
  document.getElementById('downloadNotesCsvBtn')?.addEventListener('click', pastDueDownloadNotes);
  document.getElementById('downloadExemptedCsvBtn')?.addEventListener('click', pastDueDownloadExemptions);
  document.getElementById('removeExemptedBtn')?.addEventListener('click', pastDueRemoveSelectedExemptions);
  document.getElementById('exemptedManualForm')?.addEventListener('submit', pastDueAddManualExemption);

  document.getElementById('addFailureReasonBtn')?.addEventListener('click', pastDueOpenFailureReasonModal);
  document.getElementById('failureReasonApproveBtn')?.addEventListener('click', pastDueApproveFailureReason);
  document.getElementById('failureReasonCancelBtn')?.addEventListener('click', pastDueCloseFailureReasonModal);
  document.getElementById('failureReasonModalClose')?.addEventListener('click', pastDueCloseFailureReasonModal);
  document.getElementById('approveCancellationBtn')?.addEventListener('click', pastDueApproveCancellation);
  document.getElementById('cancelMembershipCloseBtn')?.addEventListener('click', pastDueCloseCancelModal);

  ['cancelMembershipModal', 'failureReasonModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', event => {
      if (event.target === event.currentTarget) {
        pastDueCloseCancelModal();
        pastDueCloseFailureReasonModal();
      }
    });
  });

  document.getElementById('cancellationReasonInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      pastDueApproveCancellation();
    }
  });

  document.getElementById('failureReasonInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      pastDueApproveFailureReason();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      pastDueCloseFailureReasonModal();
      pastDueCloseCancelModal();
    }
  });

  pastDueLoad().catch(error => {
    document.querySelectorAll('.past-due-main .table-wrap').forEach(container => { container.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPastDuePage);
} else {
  initPastDuePage();
}
