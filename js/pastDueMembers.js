const PAST_DUE_LOG_TABLE = 'past_due_member_log';
const PAST_DUE_EXEMPT_TABLE = 'past_due_exempted_members';
const PAST_DUE_TABS = ['dashboard', 'pastDue', 'cleared', 'cancelled', 'log', 'export'];
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
const DEFAULT_FAILURE_REASONS = ['Invalid Account', 'Insufficient Funds', 'Payment Declined', 'Expired Card', 'Unknown'];
let pastDueRows = [];
let pastDueExemptedRows = [];
let pendingPastDueFile = null;
let pendingExemptedFile = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function pastDueNormalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function pastDueParseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { cells.push(value.trim()); value = ''; }
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

function pastDueParseCsv(text) {
  const normalizedText = String(text || '').replace(/\r\n?/g, '\n');
  const records = [];
  let record = '';
  let quoted = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];
    if (character === '"') {
      if (quoted && normalizedText[index + 1] === '"') {
        record += '""';
        index += 1;
      } else {
        quoted = !quoted;
        record += character;
      }
    } else if (character === '\n' && !quoted) {
      if (record.trim()) records.push(record);
      record = '';
    } else {
      record += character;
    }
  }
  if (record.trim()) records.push(record);
  if (records.length < 2) return [];

  const headers = pastDueParseCsvLine(records[0]).map(pastDueNormalizeHeader);
  return records.slice(1).map(line => {
    const cells = pastDueParseCsvLine(line);
    return headers.reduce((row, header, index) => {
      if (header) row[header] = cells[index] || '';
      return row;
    }, {});
  });
}

function pastDueFirstValue(row, names) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function pastDueStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.includes('cancel')) return 'CANCELLED';
  if (normalized === 'unpaid' || normalized === 'past due' || normalized === 'past_due') return 'PAST DUE';
  if (normalized.includes('clear') || normalized === 'paid' || normalized === 'payment received') return 'CLEARED';
  return 'PAST DUE';
}

function pastDueDateValue(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year.length === 2 ? `20${year}` : year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function pastDueDaysOverdue(dueDate) {
  if (!dueDate) return null;
  const due = new Date(`${pastDueDateValue(dueDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - due) / 86400000));
}

function pastDueFailureReasons() {
  const saved = JSON.parse(localStorage.getItem('pastDueFailureReasons') || '[]');
  return [...new Set([...DEFAULT_FAILURE_REASONS, ...saved])];
}

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
  const modal = document.getElementById('failureReasonModal');
  if (modal) modal.classList.add('hidden');
}

function pastDueApproveFailureReason() {
  const input = document.getElementById('failureReasonInput');
  const status = document.getElementById('pastDueImportStatus');
  if (!input) return;
  const reason = input.value.trim();
  const hint = document.getElementById('failureReasonHint');
  if (!reason) {
    input.setAttribute('aria-invalid', 'true');
    if (hint) hint.textContent = 'Enter a failure reason before approving.';
    input.focus();
    return;
  }
  if (hint) hint.textContent = 'This reason will be added to the failure reason dropdown options across all past due member tables.';
  const reasons = pastDueFailureReasons();
  if (!reasons.includes(reason)) {
    localStorage.setItem('pastDueFailureReasons', JSON.stringify([...reasons, reason]));
  }
  pastDueCloseFailureReasonModal();
  pastDueRender();
  if (status) {
    status.textContent = `Failure reason "${reason}" added.`;
    status.classList.remove('upload-status-error');
  }
}

function pastDueMemberKey(row) {
  return pastDueFirstValue(row, ['bill', 'bill_number', 'bill_no', 'member_number', 'number', 'membership_number', 'email', 'member_email', 'member_name', 'name'])
    .toLowerCase().replace(/\s+/g, ' ');
}

function pastDueNormalizeRow(row) {
  const firstName = pastDueFirstValue(row, ['first_name', 'first']);
  const lastName = pastDueFirstValue(row, ['last_name', 'last']);
  const memberName = [firstName, lastName].filter(Boolean).join(' ') || pastDueFirstValue(row, ['member', 'member_name', 'name', 'full_name']);
  const memberNumber = pastDueFirstValue(row, ['bill', 'bill_number', 'bill_no', 'member_number', 'number', 'membership_number']);
  const email = pastDueFirstValue(row, ['email', 'member_email']);
  const amountDueText = pastDueFirstValue(row, ['amount_due', 'amount', 'total_due']).replace(/[$,]/g, '');
  const amountUnpaidText = pastDueFirstValue(row, ['amount_unpaid', 'amount_overdue', 'unpaid', 'balance']).replace(/[$,]/g, '');
  const daysText = pastDueFirstValue(row, ['days_overdue', 'days', 'overdue_days']);
  const stage = pastDueFirstValue(row, ['stage', 'status_stage']);
  const statusValue = pastDueFirstValue(row, ['status', 'member_status', 'payment_status']);
  return {
    member_key: pastDueMemberKey(row),
    member_name: memberName || memberNumber || email || 'Unnamed member',
    member_number: memberNumber || null,
    bill_type: pastDueFirstValue(row, ['bill_type', 'type', 'bill']) || null,
    first_name: firstName || null,
    last_name: lastName || null,
    income_category: pastDueFirstValue(row, ['income_category', 'category']) || null,
    email: email || null,
    due_date: pastDueDateValue(pastDueFirstValue(row, ['due_date', 'due'])) || null,
    amount_due: Number.isFinite(Number(amountDueText)) ? Number(amountDueText) : null,
    amount: Number.isFinite(Number(amountUnpaidText || amountDueText)) ? Number(amountUnpaidText || amountDueText) : null,
    days_overdue: pastDueDaysOverdue(pastDueDateValue(pastDueFirstValue(row, ['due_date', 'due']))) ?? (Number.isFinite(Number(daysText)) ? Number(daysText) : null),
    stage: stage || null,
    failure_reason: pastDueFirstValue(row, ['failure_reason', 'failure', 'reason']) || null,
    last_payment_retry: pastDueDateValue(pastDueFirstValue(row, ['last_payment_retry', 'payment_retry', 'retry_date'])) || null,
    last_contact_date: pastDueDateValue(pastDueFirstValue(row, ['last_contact_date', 'contact_date'])) || null,
    outcome_notes: pastDueFirstValue(row, ['outcome_notes', 'outcome', 'notes']) || null,
    escalated_to_darius: pastDueFirstValue(row, ['escalated_to_darius', 'escalated', 'accounts_escalated']).toLowerCase() === 'true',
    class_blocked: pastDueFirstValue(row, ['class_blocked', 'blocked']).toLowerCase() === 'true',
    autopay: pastDueFirstValue(row, ['autopay', 'autopay_account']) || null,
    autopay_account: pastDueFirstValue(row, ['autopay_account', 'autopay']) || null,
    status: pastDueStatus(statusValue || stage),
    imported_at: new Date().toISOString(),
    raw_data: row
  };
}

function pastDueMergeRows(rows) {
  const mergedRows = new Map();

  for (const row of rows) {
    const key = pastDueIdentity(row.member_name) || row.member_key;
    const existing = mergedRows.get(key);
    if (!existing) {
      mergedRows.set(key, { ...row, raw_data: [row.raw_data] });
      continue;
    }

    existing.amount = Number(existing.amount || 0) + Number(row.amount || 0);
    existing.amount_due = Number(existing.amount_due || 0) + Number(row.amount_due || 0);
    existing.days_overdue = pastDueDaysOverdue(existing.due_date) ?? existing.days_overdue;
    if (row.due_date && (!existing.due_date || new Date(row.due_date) > new Date(existing.due_date))) {
      existing.due_date = row.due_date;
      existing.days_overdue = pastDueDaysOverdue(row.due_date);
    }
    if (row.member_number && !String(existing.member_number || '').split(', ').includes(row.member_number)) {
      existing.member_number = [existing.member_number, row.member_number].filter(Boolean).join(', ');
    }
    ['bill_type', 'income_category', 'failure_reason', 'stage', 'last_payment_retry', 'last_contact_date', 'outcome_notes', 'autopay', 'autopay_account'].forEach(field => {
      if (row[field]) existing[field] = row[field];
    });
    existing.escalated_to_darius = existing.escalated_to_darius || row.escalated_to_darius;
    existing.class_blocked = existing.class_blocked || row.class_blocked;
    if (row.status === 'PAST DUE' || existing.status !== 'PAST DUE') existing.status = row.status;
    existing.raw_data.push(row.raw_data);
  }

  return Array.from(mergedRows.values());
}

async function pastDueClient() {
  if (window.authReady) await window.authReady;
  if (!window.supabaseClient) throw new Error('Your Supabase session is not active. Please sign in again.');
  return window.supabaseClient;
}

function pastDueDisplayValue(value) {
  if (value === null || value === undefined || value === '') return '';
  return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}

function pastDueOptionList(options, selected) {
  return options.map(option => `<option value="${escapeHtml(option)}"${option === selected ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('');
}

function pastDueEditableCell(row, column) {
  const value = column === 'days_overdue' ? (pastDueDaysOverdue(row.due_date) ?? row[column] ?? '') : row[column] ?? '';
  if (column === 'status') {
    return `<select data-past-due-field="status"><option value="PAST DUE"${row.status === 'PAST DUE' ? ' selected' : ''}>PAST DUE</option><option value="CLEARED"${row.status === 'CLEARED' ? ' selected' : ''}>CLEARED</option><option value="CANCELLED"${row.status === 'CANCELLED' ? ' selected' : ''}>CANCELLED</option></select>`;
  }
  if (column === 'stage') return `<select data-past-due-field="stage">${pastDueOptionList(PAST_DUE_STAGES, row.stage)}</select>`;
  if (column === 'failure_reason') return `<select data-past-due-field="failure_reason"><option value="">Select reason</option>${pastDueOptionList(pastDueFailureReasons(), row.failure_reason)}</select>`;
  if (['escalated_to_darius', 'class_blocked'].includes(column)) return `<input type="checkbox" data-past-due-field="${column}"${value ? ' checked' : ''}>`;
  const type = ['due_date', 'last_payment_retry', 'last_contact_date'].includes(column) ? 'date' : ['amount_due', 'amount', 'days_overdue'].includes(column) ? 'number' : 'text';
  const castValue = type === 'date' ? pastDueDateValue(value).slice(0, 10) : String(value);
  return `<input type="${type}"${type === 'number' ? ' step="any" min="0"' : ''} value="${escapeHtml(castValue)}" data-past-due-field="${column}">`;
}

async function pastDueUpdateRow(rowId, rowElement) {
  const client = await pastDueClient();
  const payload = {};
  rowElement.querySelectorAll('[data-past-due-field]').forEach(input => {
    const field = input.dataset.pastDueField;
    if (input.type === 'checkbox') payload[field] = input.checked;
    else if (['amount_due', 'amount', 'days_overdue'].includes(field)) payload[field] = input.value === '' ? null : Number(input.value);
    else payload[field] = input.value || null;
  });
  const { error } = await client.from(PAST_DUE_LOG_TABLE).update(payload).eq('id', rowId);
  if (error) throw error;
}

function pastDueRenderTable(elementId, rows) {
  const container = document.getElementById(elementId);
  if (!container) return;
  if (!rows.length) { container.innerHTML = '<div class="empty">No members found.</div>'; return; }
  const columns = ['member_name', 'member_number', 'amount', 'due_date', 'days_overdue', 'failure_reason', 'stage', 'last_payment_retry', 'last_contact_date', 'outcome_notes', 'escalated_to_darius', 'class_blocked', 'status'];
  const labels = ['Member', 'Bill #', 'Amount Overdue', 'Due Date', 'Days Overdue', 'Failure Reason', 'Stage', 'Last Payment Retry', 'Last Contact Date', 'Outcome / Notes', 'Escalated to Darius', 'Class Blocked', 'Status'];
  container.innerHTML = `<table class="filterable past-due-editable-table"><thead><tr>${labels.map(label => `<th>${escapeHtml(label)}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rows.map(row => `<tr data-past-due-row-id="${escapeHtml(row.id)}">${columns.map(column => `<td>${pastDueEditableCell(row, column)}</td>`).join('')}<td><button type="button" class="sop-action-button primary past-due-save">Save</button></td></tr>`).join('')}</tbody></table>`;
  container.querySelectorAll('.past-due-save').forEach(button => button.addEventListener('click', async () => {
    const row = button.closest('tr');
    button.disabled = true;
    button.textContent = 'Saving...';
    try {
      await pastDueUpdateRow(row.dataset.pastDueRowId, row);
      button.textContent = 'Saved';
      await pastDueLoad();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Save failed';
      window.alert(error.message || 'Unable to update member.');
    }
  }));
}

function pastDueImportDate(row) {
  const importedAt = row.imported_at ? new Date(row.imported_at) : null;
  if (!importedAt || Number.isNaN(importedAt.getTime())) return 'Unknown import date';
  return importedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function pastDueRenderLogGroups() {
  const container = document.getElementById('logTable');
  if (!container) return;
  const selectedDate = document.getElementById('logDateFilter')?.value || '';
  const filteredRows = selectedDate
    ? pastDueRows.filter(row => row.imported_at && new Date(row.imported_at).toISOString().slice(0, 10) === selectedDate)
    : pastDueRows;
  if (!filteredRows.length) {
    container.innerHTML = '<div class="empty">No members found.</div>';
    return;
  }

  const groups = new Map();
  [...filteredRows]
    .sort((a, b) => new Date(b.imported_at || 0) - new Date(a.imported_at || 0))
    .forEach(row => {
      const dateKey = row.imported_at && !Number.isNaN(new Date(row.imported_at).getTime())
        ? new Date(row.imported_at).toISOString().slice(0, 10)
        : 'unknown';
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey).push(row);
    });

  container.innerHTML = Array.from(groups.entries()).map(([dateKey, rows], index) => {
    const totalAmount = rows.reduce((total, row) => total + Number(row.amount || 0), 0);
    const groupId = `pastDueLogGroup-${index}`;
    return `<details class="past-due-log-group" open><summary class="past-due-log-group-header"><div><span class="report-eyebrow">Import group</span><h3>${escapeHtml(dateKey === 'unknown' ? 'Unknown import date' : pastDueImportDate(rows[0]))}</h3></div><div class="past-due-log-group-summary"><strong>${rows.length}</strong><span>members</span><strong>$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong><span>amount overdue</span><span class="past-due-log-toggle">View log</span></div></summary><div class="table-wrap" id="${groupId}"></div></details>`;
  }).join('');

  Array.from(groups.values()).forEach((rows, index) => {
    pastDueRenderTable(`pastDueLogGroup-${index}`, rows);
  });
}

function pastDueRenderMetrics(elementId, rows) {
  const container = document.getElementById(elementId);
  if (!container) return;
  const amount = rows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const escalated = rows.filter(row => row.escalated_to_darius).length;
  const blocked = rows.filter(row => row.class_blocked).length;
  container.innerHTML = `<div class="past-due-metric"><span>Total Amount Overdue</span><strong>$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div><div class="past-due-metric"><span>People</span><strong>${rows.length}</strong></div><div class="past-due-metric"><span>Escalated</span><strong>${escalated}</strong></div><div class="past-due-metric"><span>Class Blocked</span><strong>${blocked}</strong></div>`;
}

function pastDueRender() {
  const reportRows = pastDueRows.filter(row => !pastDueIsExempt(row));
  const sortedRows = [...reportRows].sort((a, b) => Number(b.days_overdue || 0) - Number(a.days_overdue || 0));
  const active = reportRows.filter(row => row.status === 'PAST DUE');
  const cleared = reportRows.filter(row => row.status === 'CLEARED');
  const cancelled = reportRows.filter(row => row.status === 'CANCELLED');
  const amount = active.reduce((total, row) => total + Number(row.amount || 0), 0);
  const escalated = active.filter(row => row.escalated_to_darius).length;
  document.getElementById('pastDueMetrics').innerHTML = `<div class="past-due-metric"><span>Total Overdue</span><strong>$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></div><div class="past-due-metric"><span>Accounts Escalated</span><strong>${escalated}</strong></div><div class="past-due-metric"><span>Active Past Due</span><strong>${active.length}</strong></div><div class="past-due-metric"><span>Cleared / Cancelled</span><strong>${cleared.length} / ${cancelled.length}</strong></div>`;
  pastDueRenderTable('dashboardTable', sortedRows.slice(0, 5));
  pastDueRenderTable('pastDueTable', active);
  pastDueRenderTable('clearedTable', cleared);
  pastDueRenderTable('cancelledTable', cancelled);
  pastDueRenderLogGroups();
  pastDueRenderMetrics('pastDueTabMetrics', active);
  pastDueRenderMetrics('clearedTabMetrics', cleared);
  pastDueRenderMetrics('cancelledTabMetrics', cancelled);
  pastDueRenderExemptions();
}

async function pastDueLoad() {
  const client = await pastDueClient();
  const { data, error } = await client.from(PAST_DUE_LOG_TABLE).select('*').order('imported_at', { ascending: false });
  if (error) throw error;
  const { data: exemptions, error: exemptionError } = await client.from(PAST_DUE_EXEMPT_TABLE).select('*').order('created_at', { ascending: false });
  if (exemptionError) throw exemptionError;
  pastDueRows = Array.isArray(data) ? data : [];
  pastDueExemptedRows = Array.isArray(exemptions) ? exemptions : [];
  pastDueRender();
}

function pastDueIdentity(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function pastDueIsExempt(row) {
  const keys = new Set(pastDueExemptedRows.flatMap(item => [item.member_key, item.member_number, item.member_name].map(pastDueIdentity).filter(Boolean)));
  return [row.member_key, row.member_number, row.member_name].map(pastDueIdentity).some(key => key && keys.has(key));
}

function pastDueRenderExemptions() {
  const container = document.getElementById('exemptedTable');
  if (!container) return;
  if (!pastDueExemptedRows.length) {
    container.innerHTML = '<div class="empty">No exempted members found.</div>';
    return;
  }
  container.innerHTML = `<table class="filterable"><thead><tr><th>Member Name</th><th>Number</th><th>Membership Label</th><th>Mbr. Status</th><th>Begin Date</th><th>End Date</th><th>Autopay</th><th>Note</th><th>Added</th></tr></thead><tbody>${pastDueExemptedRows.map(row => `<tr><td>${escapeHtml(row.member_name || '')}</td><td>${escapeHtml(row.member_number || '')}</td><td>${escapeHtml(row.membership_label || '')}</td><td>${escapeHtml(row.mbr_status || '')}</td><td>${escapeHtml(row.mbr_begin_date || '')}</td><td>${escapeHtml(row.mbr_end_date || '')}</td><td>${escapeHtml(row.autopay || '')}</td><td>${escapeHtml(row.note || '')}</td><td>${escapeHtml(row.created_at || '')}</td></tr>`).join('')}</tbody></table>`;
}

async function pastDueReconcileImportRows(client, rows) {
  const { data: existingRows, error } = await client
    .from(PAST_DUE_LOG_TABLE)
    .select('id, member_key, member_number, member_name');
  if (error) throw error;

  const byNumber = new Map();
  const byName = new Map();
  (existingRows || []).forEach(existing => {
    if (existing.member_number) byNumber.set(pastDueIdentity(existing.member_number), existing);
    if (existing.member_name) {
      const nameKey = pastDueIdentity(existing.member_name);
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(existing);
    }
  });

  const reconciled = new Map();
  for (const row of rows) {
    const nameMatches = byName.get(pastDueIdentity(row.member_name)) || [];
    const existing = nameMatches[0]
      || (row.member_number && byNumber.get(pastDueIdentity(row.member_number)));
    const duplicateIds = nameMatches.slice(1).map(item => item.id).filter(Boolean);
    if (duplicateIds.length) {
      const { error: duplicateDeleteError } = await client
        .from(PAST_DUE_LOG_TABLE)
        .delete()
        .in('id', duplicateIds);
      if (duplicateDeleteError) throw duplicateDeleteError;
    }
    const reconciledRow = existing ? { ...row, member_key: existing.member_key } : row;
    reconciled.set(reconciledRow.member_key, reconciledRow);
  }
  return Array.from(reconciled.values());
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
}

function pastDueImportTimestamp(dateValue) {
  return `${dateValue}T12:00:00.000Z`;
}

async function pastDueImportExemptions(file, importDateValue) {
  const status = document.getElementById('exemptedStatus');
  if (!importDateValue) {
    throw new Error('Choose an import date before importing exempted members.');
  }
  status.textContent = `Processing ${file.name}...`;
  try {
    const rows = pastDueParseCsv(await file.text()).map(pastDueNormalizeExemption).map(row => ({
      ...row,
      created_at: pastDueImportTimestamp(importDateValue)
    }));
    await pastDueSaveExemptions(rows);
    status.textContent = `${rows.filter(row => row.member_key).length} exempted members imported.`;
    status.classList.remove('upload-status-error');
    return true;
  } catch (error) {
    status.textContent = error.message || 'Unable to import exempted members.';
    status.classList.add('upload-status-error');
    return false;
  }
}

async function pastDueAddManualExemption() {
  const nameInput = document.getElementById('exemptedMemberNameInput');
  const numberInput = document.getElementById('exemptedMemberNumberInput');
  const status = document.getElementById('exemptedStatus');
  const row = pastDueNormalizeExemption({ member_name: nameInput.value, member_number: numberInput.value });
  if (!row.member_key) {
    status.textContent = 'Enter a member name or Bill # first.';
    return;
  }
  try {
    await pastDueSaveExemptions([row]);
    nameInput.value = '';
    numberInput.value = '';
    status.textContent = `${row.member_name} was added to the exemption list.`;
  } catch (error) {
    status.textContent = error.message || 'Unable to add member.';
  }
}

function pastDueDownloadExemptions() {
  const columns = ['member_number', 'first_name', 'last_name', 'membership_label', 'mbr_status', 'mbr_begin_date', 'mbr_end_date', 'att_limit', 'att_limit_type', 'people_count', 'autopay', 'note'];
  const csv = [columns.join(','), ...pastDueExemptedRows.map(row => columns.map(column => `"${String(row[column] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `excempted-members-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function pastDueImport(file, importDateValue) {
  const status = document.getElementById('pastDueImportStatus');
  if (!importDateValue) {
    throw new Error('Choose an import date before importing the CSV.');
  }
  status.textContent = `Processing ${file.name}...`;
  const parsedRows = pastDueParseCsv(await file.text()).map(pastDueNormalizeRow).map(row => ({
    ...row,
    imported_at: pastDueImportTimestamp(importDateValue)
  })).filter(row => row.member_key);
  if (!parsedRows.length) throw new Error('No rows with a member number, email, or name were found.');
  const client = await pastDueClient();
  const mergedRows = pastDueMergeRows(parsedRows);
  const importedRows = await pastDueReconcileImportRows(client, mergedRows);
  const { error } = await client.from(PAST_DUE_LOG_TABLE).upsert(importedRows, { onConflict: 'member_key' });
  if (error) throw error;
  status.textContent = `${importedRows.length} member records imported and updated.`;
  status.classList.remove('upload-status-error');
  await pastDueLoad();
  return true;
}

function pastDueCsv(rows) {
  const columns = ['member_name', 'member_number', 'bill_type', 'first_name', 'last_name', 'income_category', 'due_date', 'amount_due', 'amount', 'days_overdue', 'failure_reason', 'stage', 'last_payment_retry', 'last_contact_date', 'outcome_notes', 'escalated_to_darius', 'class_blocked', 'autopay', 'autopay_account', 'status', 'imported_at'];
  return [columns.join(','), ...rows.map(row => columns.map(column => `"${String(row[column] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
}

function pastDueDownload() {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([pastDueCsv(pastDueRows)], { type: 'text/csv;charset=utf-8' }));
  link.download = `past-due-member-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function pastDueSetUploadStatus(elementId, message, isError = false) {
  const status = document.getElementById(elementId);
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('upload-status-error', isError);
}

function pastDueSetUploadControls(buttonIds, enabled) {
  buttonIds.forEach(buttonId => {
    const button = document.getElementById(buttonId);
    if (button) button.disabled = !enabled;
  });
}

function pastDueClearPendingUpload(type, statusMessage = 'No file selected') {
  const isExempted = type === 'exempted';
  const inputId = isExempted ? 'exemptedCsvInput' : 'pastDueCsvInput';
  const statusId = isExempted ? 'exemptedStatus' : 'pastDueImportStatus';
  const buttonIds = isExempted
    ? ['confirmExemptedUploadBtn', 'cancelExemptedUploadBtn', 'removeExemptedFileBtn']
    : ['confirmPastDueUploadBtn', 'cancelPastDueUploadBtn', 'removePastDueFileBtn'];
  if (isExempted) pendingExemptedFile = null;
  else pendingPastDueFile = null;
  const input = document.getElementById(inputId);
  if (input) input.value = '';
  pastDueSetUploadControls(buttonIds, false);
  pastDueSetUploadStatus(statusId, statusMessage);
}

function initPastDuePage() {
  const buttons = document.querySelectorAll('nav.site-nav button');
  buttons.forEach(button => button.addEventListener('click', () => {
    buttons.forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(`tab-${button.dataset.tab}`).classList.add('active');
  }));
  document.getElementById('pastDueCsvInput').addEventListener('change', event => {
    pendingPastDueFile = event.target.files[0] || null;
    pastDueSetUploadControls(['confirmPastDueUploadBtn', 'cancelPastDueUploadBtn', 'removePastDueFileBtn'], Boolean(pendingPastDueFile));
    if (pendingPastDueFile) pastDueSetUploadStatus('pastDueImportStatus', `Selected: ${pendingPastDueFile.name}`);
  });
  document.getElementById('confirmPastDueUploadBtn').addEventListener('click', async () => {
    if (!pendingPastDueFile) return;
    const importDate = document.getElementById('pastDueImportDate').value;
    if (!importDate) {
      pastDueSetUploadStatus('pastDueImportStatus', 'Choose an import date before confirming the upload.', true);
      document.getElementById('pastDueImportDate').focus();
      return;
    }
    const button = document.getElementById('confirmPastDueUploadBtn');
    button.disabled = true;
    try {
      if (await pastDueImport(pendingPastDueFile, importDate)) {
        const successMessage = document.getElementById('pastDueImportStatus').textContent;
        pastDueClearPendingUpload('pastDue', successMessage);
      }
    } catch (error) {
      pastDueSetUploadStatus('pastDueImportStatus', error.message || 'CSV upload failed.', true);
      button.disabled = false;
    }
  });
  document.getElementById('cancelPastDueUploadBtn').addEventListener('click', () => pastDueClearPendingUpload('pastDue'));
  document.getElementById('removePastDueFileBtn').addEventListener('click', () => pastDueClearPendingUpload('pastDue'));
  document.getElementById('downloadPastDueCsvBtn').addEventListener('click', pastDueDownload);
  document.getElementById('logDateFilter').addEventListener('change', pastDueRenderLogGroups);
  document.getElementById('addFailureReasonBtn').addEventListener('click', pastDueOpenFailureReasonModal);
  document.getElementById('failureReasonApproveBtn').addEventListener('click', pastDueApproveFailureReason);
  document.getElementById('failureReasonCancelBtn').addEventListener('click', pastDueCloseFailureReasonModal);
  document.getElementById('failureReasonModalClose').addEventListener('click', pastDueCloseFailureReasonModal);
  document.getElementById('failureReasonModal').addEventListener('click', event => {
    if (event.target === event.currentTarget) pastDueCloseFailureReasonModal();
  });
  document.getElementById('failureReasonInput').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      pastDueApproveFailureReason();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') pastDueCloseFailureReasonModal();
  });
  document.getElementById('exemptedCsvInput').addEventListener('change', event => {
    pendingExemptedFile = event.target.files[0] || null;
    pastDueSetUploadControls(['confirmExemptedUploadBtn', 'cancelExemptedUploadBtn', 'removeExemptedFileBtn'], Boolean(pendingExemptedFile));
    if (pendingExemptedFile) pastDueSetUploadStatus('exemptedStatus', `Selected: ${pendingExemptedFile.name}`);
  });
  document.getElementById('confirmExemptedUploadBtn').addEventListener('click', async () => {
    if (!pendingExemptedFile) return;
    const importDate = document.getElementById('exemptedImportDate').value;
    if (!importDate) {
      pastDueSetUploadStatus('exemptedStatus', 'Choose an import date before confirming the upload.', true);
      document.getElementById('exemptedImportDate').focus();
      return;
    }
    const button = document.getElementById('confirmExemptedUploadBtn');
    button.disabled = true;
    const imported = await pastDueImportExemptions(pendingExemptedFile, importDate);
    if (imported) {
      const successMessage = document.getElementById('exemptedStatus').textContent;
      pastDueClearPendingUpload('exempted', successMessage);
    }
    else button.disabled = false;
  });
  document.getElementById('cancelExemptedUploadBtn').addEventListener('click', () => pastDueClearPendingUpload('exempted'));
  document.getElementById('removeExemptedFileBtn').addEventListener('click', () => pastDueClearPendingUpload('exempted'));
  document.getElementById('addExemptedMemberBtn').addEventListener('click', pastDueAddManualExemption);
  document.getElementById('downloadExemptedCsvBtn').addEventListener('click', pastDueDownloadExemptions);
  pastDueLoad().catch(error => {
    document.querySelectorAll('.table-wrap').forEach(container => { container.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; });
  });
}

initPastDuePage();
