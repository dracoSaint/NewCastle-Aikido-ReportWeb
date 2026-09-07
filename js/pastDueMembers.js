const PAST_DUE_LOG_TABLE = 'past_due_member_log';
const PAST_DUE_EXEMPT_TABLE = 'past_due_exempted_members';
const PAST_DUE_FAILURE_REASON_TABLE = 'past_due_failure_reason';
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

let pastDueRows = [];
let pastDueExemptedRows = [];
let pastDueFailureReasonsList = [];
let pendingPastDueFile = null;
let pendingExemptedFile = null;
let pendingCancelBillId = null;

function pastDueFailureReasons() {
  return pastDueFailureReasonsList;
}

// Fetch failure reasons from Supabase
async function loadPastDueFailureReasons() {
  try {
    const client = await pastDueClient();
    const { data, error } = await client
      .from(PAST_DUE_FAILURE_REASON_TABLE)
      .select('reason')
      .order('reason', { ascending: true });

    if (error) throw error;

    if (data) {
      pastDueFailureReasonsList = data.map(item => item.reason).filter(Boolean);
    }
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
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year.length === 2 ? `20${year}` : year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function pastDueDaysOverdue(dueDate) {
  if (!dueDate) return null;
  const dateStr = pastDueDateValue(dueDate);
  if (!dateStr) return null;

  const due = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - due) / 86400000));
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

async function pastDueApproveFailureReason() {
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

  try {
    const client = await pastDueClient();

    const { error } = await client
      .from(PAST_DUE_FAILURE_REASON_TABLE)
      .insert([{ reason }]);

    if (error) throw error;

    await loadPastDueFailureReasons();

    pastDueCloseFailureReasonModal();
    pastDueRender();

    if (status) {
      status.textContent = `Failure reason "${reason}" added.`;
      status.classList.remove('upload-status-error');
    }
  } catch (err) {
    console.error('Error adding failure reason:', err);
    if (hint) hint.textContent = err.message || 'Unable to save failure reason.';
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
  const stage = pastDueFirstValue(row, ['stage', 'status_stage']);
  const statusValue = pastDueFirstValue(row, ['status', 'member_status', 'payment_status']);
  const notesValue = pastDueFirstValue(row, ['notes', 'note', 'outcome_notes', 'outcome']);

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
    stage: stage || null,
    failure_reason: pastDueFirstValue(row, ['failure_reason', 'failure', 'reason']) || null,
    last_payment_retry: pastDueDateValue(pastDueFirstValue(row, ['last_payment_retry', 'payment_retry', 'retry_date'])) || null,
    last_contact_date: pastDueDateValue(pastDueFirstValue(row, ['last_contact_date', 'contact_date'])) || null,
    notes: notesValue || null,
    outcome_notes: notesValue || null,
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
    const nameKey = pastDueIdentity(row.member_name) || row.member_key;
    const existing = mergedRows.get(nameKey);
    const itemsToMerge = row.bills && Array.isArray(row.bills) ? row.bills : [row];

    if (!existing) {
      mergedRows.set(nameKey, {
        ...row,
        bills: [...itemsToMerge],
        raw_data: Array.isArray(row.raw_data) ? [...row.raw_data] : [row.raw_data]
      });
      continue;
    }

    itemsToMerge.forEach(item => {
      existing.bills.push({ ...item });
      if (item.raw_data) existing.raw_data.push(item.raw_data);
    });

    if (row.member_number && !String(existing.member_number || '').split(', ').includes(row.member_number)) {
      existing.member_number = [existing.member_number, row.member_number].filter(Boolean).join(', ');
    }
  }

  return Array.from(mergedRows.values()).map(member => {
    const activeBills = member.bills.filter(b => b.status === 'PAST DUE');
    const hasPastDue = member.bills.some(b => b.status === 'PAST DUE');
    const hasCancelled = member.bills.some(b => b.status === 'CANCELLED');

    member.status = hasPastDue ? 'PAST DUE' : (hasCancelled ? 'CANCELLED' : 'CLEARED');
    member.amount = activeBills.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
    member.days_overdue = member.bills.reduce((max, b) => {
      const days = pastDueDaysOverdue(b.due_date) ?? b.days_overdue ?? 0;
      return days > max ? days : max;
    }, 0);

    return member;
  });
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

async function pastDueUpdateRow(rowId, rowElement) {
  const client = await pastDueClient();
  const payload = {};

  rowElement.querySelectorAll('[data-past-due-field]').forEach(input => {
    const field = input.dataset.pastDueField;
    if (field === 'bills') return;

    if (input.type === 'checkbox') {
      payload[field] = input.checked;
    } else if (['amount_due', 'amount', 'days_overdue'].includes(field)) {
      payload[field] = input.value === '' ? null : Number(input.value);
    } else {
      payload[field] = input.value || null;
    }
  });

  delete payload.bills;

  const { error } = await client.from(PAST_DUE_LOG_TABLE).update(payload).eq('id', rowId);
  if (error) throw error;
}

async function pastDueClearAllBills(billIds) {
  const client = await pastDueClient();
  const { error } = await client
    .from(PAST_DUE_LOG_TABLE)
    .update({
      status: 'CLEARED',
      stage: 'Cleared'
    })
    .in('id', billIds);

  if (error) throw error;
}

function pastDueRecalculateParentRow(parentRow, childRow) {
  if (!parentRow || !childRow) return;

  const subRows = childRow.querySelectorAll('tbody tr');
  let activeTotal = 0;
  let activeBillCount = 0;

  subRows.forEach(row => {
    const statusSelect = row.querySelector('[data-past-due-field="status"]');
    const amountInput = row.querySelector('[data-past-due-field="amount"]');
    const status = statusSelect ? statusSelect.value : 'PAST DUE';
    const amount = amountInput ? parseFloat(amountInput.value) || 0 : 0;

    if (status === 'PAST DUE') {
      activeTotal += amount;
      activeBillCount += 1;
    }
  });

  const totalCell = parentRow.querySelector('.parent-total-amount');
  const countCell = parentRow.querySelector('.parent-bills-count');
  const badgeCell = parentRow.querySelector('.status-badge');

  if (totalCell) totalCell.textContent = `$${activeTotal.toFixed(2)}`;
  if (countCell) countCell.textContent = `${activeBillCount} bill(s)`;

  if (badgeCell) {
    if (activeBillCount === 0) {
      badgeCell.textContent = 'CLEARED';
    } else {
      badgeCell.textContent = 'PAST DUE';
    }
  }
}

// Modal Trigger Functions
function pastDueOpenCancelModal(billId) {
  pendingCancelBillId = billId;
  const modal = document.getElementById('cancelMembershipModal');
  const input = document.getElementById('cancellationReasonInput');
  const hint = document.getElementById('cancellationReasonHint');

  if (!modal || !input) {
    console.error('Modal or input element not found in DOM.');
    return;
  }

  input.value = '';
  if (hint) hint.textContent = '';

  // Remove hidden class AND explicitly set flex display
  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  input.focus();
}

function pastDueCloseCancelModal() {
  pendingCancelBillId = null;
  const modal = document.getElementById('cancelMembershipModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

function pastDueCloseCancelModal() {
  pendingCancelBillId = null;
  const modal = document.getElementById('cancelMembershipModal');
  if (modal) modal.classList.add('hidden');
}

async function pastDueApproveCancellation() {
  const input = document.getElementById('cancellationReasonInput');
  const hint = document.getElementById('cancellationReasonHint');
  const approveBtn = document.getElementById('approveCancellationBtn');

  if (!input || !pendingCancelBillId) return;

  const reason = input.value.trim();
  if (!reason) {
    if (hint) hint.textContent = 'Please enter a cancellation reason before approving.';
    input.focus();
    return;
  }

  approveBtn.disabled = true;
  approveBtn.textContent = 'Cancelling...';

  try {
    const client = await pastDueClient();

    // Safely query existing bill
    const { data: bills, error: fetchError } = await client
      .from(PAST_DUE_LOG_TABLE)
      .select('notes, outcome_notes')
      .eq('id', pendingCancelBillId);

    if (fetchError) throw fetchError;

    const currentBill = bills && bills.length ? bills[0] : null;
    const existingNote = currentBill?.notes || currentBill?.outcome_notes || '';
    const updatedNote = existingNote
      ? `${existingNote} | Cancellation Reason: ${reason}`
      : `Cancellation Reason: ${reason}`;

    // Update database status to CANCELLED & stage to Cancelled Membership
    const { error: updateError } = await client
      .from(PAST_DUE_LOG_TABLE)
      .update({
        status: 'CANCELLED',
        stage: 'Cancelled Membership',
        notes: updatedNote,
        outcome_notes: updatedNote
      })
      .eq('id', pendingCancelBillId);

    if (updateError) throw updateError;

    pastDueCloseCancelModal();

    // Reload state and render views
    await pastDueLoad();
  } catch (error) {
    console.error('Cancellation failed:', error);
    if (hint) hint.textContent = error.message || 'Unable to cancel membership.';
  } finally {
    approveBtn.disabled = false;
    approveBtn.textContent = 'Approve Cancellation';
  }
}

function pastDueRenderTable(elementId, rows) {
  const container = document.getElementById(elementId);
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<div class="empty">No members found.</div>';
    return;
  }

  function getVisibleBills(row) {
    const allBills = row.bills && row.bills.length ? row.bills : [row];

    if (elementId === 'pastDueTable') {
      return allBills.filter(bill => bill.status === 'PAST DUE');
    }
    if (elementId === 'clearedTable') {
      return allBills.filter(bill => bill.status === 'CLEARED');
    }
    if (elementId === 'cancelledTable') {
      return allBills.filter(bill => bill.status === 'CANCELLED');
    }

    return allBills;
  }

  const displayRows = rows
    .map(row => ({
      ...row,
      visibleBills: getVisibleBills(row)
    }))
    .filter(row => row.visibleBills.length > 0);

  if (!displayRows.length) {
    container.innerHTML = '<div class="empty">No members found.</div>';
    return;
  }

  const html = `
    <table class="filterable past-due-expandable-table">
      <thead>
        <tr>
          <th style="width: 30px;"></th>
          <th>Member Name</th>
          <th>Bill Count</th>
          <th>Total Overdue</th>
          <th>Max Days Overdue</th>
          <th>Status</th>
          <th>Bulk Action</th>
        </tr>
      </thead>
      <tbody>
        ${displayRows
      .map((row, idx) => {
        const bills = row.visibleBills;
        const rowGroupId = `${elementId}-group-${idx}`;
        const billIds = bills.map(bill => bill.id).filter(Boolean);

        const totalAmount = bills.reduce(
          (sum, bill) => sum + (parseFloat(bill.amount) || 0),
          0
        );

        const maxDaysOverdue = bills.reduce((max, bill) => {
          const days = pastDueDaysOverdue(bill.due_date) ?? bill.days_overdue ?? 0;
          return days > max ? days : max;
        }, 0);

        let displayStatus = row.status;
        if (elementId === 'pastDueTable') {
          displayStatus = 'PAST DUE';
        } else if (elementId === 'clearedTable') {
          displayStatus = 'CLEARED';
        } else if (elementId === 'cancelledTable') {
          displayStatus = 'CANCELLED';
        }

        const showClearAll = elementId === 'pastDueTable' && billIds.length > 0;

        return `
              <tr class="parent-row" data-target="${rowGroupId}" style="cursor: pointer; background-color: #f8f9fa;">
                <td>
                  <button type="button" class="toggle-btn" style="border:none; background:none; font-weight:bold; cursor:pointer;">
                    ▶
                  </button>
                </td>
                <td>
                  <strong>${escapeHtml(row.member_name)}</strong>
                </td>
                <td class="parent-bills-count">
                  ${bills.length} bill(s)
                </td>
                <td class="parent-total-amount">
                  $${totalAmount.toFixed(2)}
                </td>
                <td>
                  ${maxDaysOverdue} days
                </td>
                <td>
                  <span class="status-badge">
                    ${escapeHtml(displayStatus)}
                  </span>
                </td>
                <td>
                  ${showClearAll
            ? `
                        <button 
                          type="button" 
                          class="sop-action-button primary past-due-clear-all" 
                          data-bill-ids="${escapeHtml(JSON.stringify(billIds))}"
                        >
                          Clear All Bills
                        </button>
                      `
            : ''
          }
                </td>
              </tr>
              <tr id="${rowGroupId}" class="child-row" style="display: none;">
                <td colspan="7" style="padding: 12px 20px; background: #ffffff; border-bottom: 2px solid #e9ecef;">
                  <table class="sub-table" style="width: 100%; margin: 5px 0;">
                    <thead>
                      <tr>
                        <th>Bill #</th>
                        <th>Amount</th>
                        <th>Due Date</th>
                        <th>Days Overdue</th>
                        <th>Stage</th>
                        <th>Failure Reason</th>
                        <th>Status</th>
                        <th>Notes / Updates</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${bills
            .map(
              bill => `
                            <tr data-past-due-row-id="${escapeHtml(bill.id || row.id)}">
                              <td>
                                <strong>
                                  ${escapeHtml(bill.member_number || 'N/A')}
                                </strong>
                              </td>
                              <td>
                                <input 
                                  type="number" 
                                  step="any" 
                                  data-past-due-field="amount" 
                                  value="${bill.amount ?? ''}" 
                                  style="width: 80px;"
                                >
                              </td>
                              <td>
                                <input 
                                  type="date" 
                                  data-past-due-field="due_date" 
                                  value="${(pastDueDateValue(bill.due_date) || '').slice(0, 10)}"
                                >
                              </td>
                              <td>
                                ${pastDueDaysOverdue(bill.due_date) ?? bill.days_overdue ?? 0}
                              </td>
                              <td>
                                <select data-past-due-field="stage">
                                  ${pastDueOptionList(PAST_DUE_STAGES, bill.stage)}
                                </select>
                              </td>
                              <td>
                                <select data-past-due-field="failure_reason">
                                  <option value="">Select reason</option>
                                  ${pastDueOptionList(pastDueFailureReasons(), bill.failure_reason)}
                                </select>
                              </td>
                              <td>
                                <select data-past-due-field="status">
                                  <option value="PAST DUE" ${bill.status === 'PAST DUE' ? 'selected' : ''}>
                                    PAST DUE
                                  </option>
                                  <option value="CLEARED" ${bill.status === 'CLEARED' ? 'selected' : ''}>
                                    CLEARED
                                  </option>
                                  <option value="CANCELLED" ${bill.status === 'CANCELLED' ? 'selected' : ''}>
                                    CANCELLED
                                  </option>
                                </select>
                              </td>
                              <td>
                                <input 
                                  type="text" 
                                  data-past-due-field="notes" 
                                  value="${escapeHtml(bill.notes || bill.outcome_notes || '')}" 
                                  placeholder="Add note/update..." 
                                  style="width: 160px;"
                                >
                              </td>
                              <td style="display: flex; gap: 6px;">
                                <button type="button" class="sop-action-button primary past-due-save">
                                  Save
                                </button>
                                ${elementId === 'pastDueTable'
                  ? `
                                      <button 
                                        type="button" 
                                        class="sop-action-button past-due-quick-clear" 
                                        style="background-color: #28a745; color: white; border: none;"
                                      >
                                        Clear Bill
                                      </button>
                                      <button 
                                        type="button" 
                                        class="sop-action-button past-due-cancel-btn" 
                                        style="background-color: #dc3545; color: white; border: none;"
                                      >
                                        Cancel Membership
                                      </button>
                                    `
                  : ''
                }
                              </td>
                            </tr>
                          `
            )
            .join('')}
                    </tbody>
                  </table>
                </td>
              </tr>
            `;
      })
      .join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = html;

  // Accordion Expand / Collapse (ignore button clicks)
  container.querySelectorAll('.parent-row').forEach(parent => {
    parent.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        return; // Prevents parent toggle when clicking action buttons
      }
      const targetId = parent.dataset.target;
      const childRow = document.getElementById(targetId);
      const btn = parent.querySelector('.toggle-btn');

      if (!childRow || !btn) return;

      const isHidden = childRow.style.display === 'none';
      childRow.style.display = isHidden ? 'table-row' : 'none';
      btn.textContent = isHidden ? '▼' : '▶';
    });
  });

  // Cancel Membership Button Listener
  container.querySelectorAll('.past-due-cancel-btn').forEach(button => {
    button.addEventListener('click', e => {
      e.stopPropagation(); // Stop parent row toggle
      e.preventDefault();
      const row = button.closest('tr');
      const billId = row.dataset.pastDueRowId;
      pastDueOpenCancelModal(billId);
    });
  });

  // Dynamic calculations
  container.querySelectorAll('.child-row').forEach(childRow => {
    const parentRow = childRow.previousElementSibling;

    childRow.addEventListener('input', e => {
      if (e.target.matches('[data-past-due-field="amount"], [data-past-due-field="status"]')) {
        pastDueRecalculateParentRow(parentRow, childRow);
      }
    });

    childRow.addEventListener('change', e => {
      if (e.target.matches('[data-past-due-field="amount"], [data-past-due-field="status"]')) {
        pastDueRecalculateParentRow(parentRow, childRow);
      }
    });
  });

  // Individual save
  container.querySelectorAll('.past-due-save').forEach(button => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const rowId = row.dataset.pastDueRowId;
      button.disabled = true;
      button.textContent = 'Saving...';

      try {
        await pastDueUpdateRow(rowId, row);

        const targetBill = pastDueRows.find(b => String(b.id) === String(rowId));
        if (targetBill) {
          row.querySelectorAll('[data-past-due-field]').forEach(input => {
            const field = input.dataset.pastDueField;
            if (field === 'bills') return;
            if (input.type === 'checkbox') {
              targetBill[field] = input.checked;
            } else if (['amount_due', 'amount', 'days_overdue'].includes(field)) {
              targetBill[field] = input.value === '' ? null : Number(input.value);
            } else {
              targetBill[field] = input.value || null;
            }
          });
        }

        button.textContent = 'Saved';
        setTimeout(() => {
          button.disabled = false;
          button.textContent = 'Save';
        }, 1500);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Save failed';
        window.alert(error.message || 'Unable to update bill record.');
      }
    });
  });

  // Cancel Membership button listener
  container.querySelectorAll('.past-due-cancel-btn').forEach(button => {
    button.addEventListener('click', () => {
      const row = button.closest('tr');
      const billId = row.dataset.pastDueRowId;
      pastDueOpenCancelModal(billId);
    });
  });

  // Quick clear single bill
  container.querySelectorAll('.past-due-quick-clear').forEach(button => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const childRow = row.closest('.child-row');
      const parentRow = childRow ? childRow.previousElementSibling : null;
      const statusSelect = row.querySelector('[data-past-due-field="status"]');

      if (statusSelect) {
        statusSelect.value = 'CLEARED';
      }

      if (parentRow && childRow) {
        pastDueRecalculateParentRow(parentRow, childRow);
      }

      button.disabled = true;
      button.textContent = 'Clearing...';

      try {
        await pastDueUpdateRow(row.dataset.pastDueRowId, row);
        await pastDueLoad();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Clear failed';
        window.alert(error.message || 'Unable to clear bill.');
      }
    });
  });

  // Clear all bills under member
  container.querySelectorAll('.past-due-clear-all').forEach(button => {
    button.addEventListener('click', async () => {
      const billIds = JSON.parse(button.dataset.billIds || '[]');
      if (!billIds.length) return;

      if (!window.confirm(`Are you sure you want to mark all ${billIds.length} bill(s) as CLEARED?`)) {
        return;
      }

      button.disabled = true;
      button.textContent = 'Clearing All...';

      try {
        await pastDueClearAllBills(billIds);
        await pastDueLoad();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Action failed';
        window.alert(error.message || 'Unable to clear all bills.');
      }
    });
  });
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
  const searchQuery = document.getElementById('nameSearchLog')?.value.toLowerCase().trim() || '';

  const filteredRows = pastDueRows.filter(row => {
    const matchDate = selectedDate ? (row.imported_at && new Date(row.imported_at).toISOString().slice(0, 10) === selectedDate) : true;
    const matchName = searchQuery ? String(row.member_name || '').toLowerCase().includes(searchQuery) : true;
    const matchNumber = searchQuery ? String(row.member_number || '').toLowerCase().includes(searchQuery) : true;
    return matchDate && (matchName || matchNumber);
  });

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

  Array.from(groups.entries()).forEach(([dateKey, rows], index) => {
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
  const mergedReportRows = pastDueMergeRows(reportRows);

  const activeRows = [];
  const clearedRows = [];
  const cancelledRows = [];

  mergedReportRows.forEach(member => {
    const allBills = member.bills && member.bills.length ? member.bills : [member];
    const activeBills = allBills.filter(bill => bill.status === 'PAST DUE');
    const clearedBills = allBills.filter(bill => bill.status === 'CLEARED');
    const cancelledBills = allBills.filter(bill => bill.status === 'CANCELLED');

    if (activeBills.length) {
      activeRows.push({
        ...member,
        bills: activeBills,
        status: 'PAST DUE',
        amount: activeBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
        days_overdue: activeBills.reduce((max, bill) => {
          const days = pastDueDaysOverdue(bill.due_date) ?? bill.days_overdue ?? 0;
          return days > max ? days : max;
        }, 0)
      });
    }

    if (clearedBills.length) {
      clearedRows.push({
        ...member,
        bills: clearedBills,
        status: 'CLEARED',
        amount: clearedBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
        days_overdue: clearedBills.reduce((max, bill) => {
          const days = pastDueDaysOverdue(bill.due_date) ?? bill.days_overdue ?? 0;
          return days > max ? days : max;
        }, 0)
      });
    }

    if (cancelledBills.length) {
      cancelledRows.push({
        ...member,
        bills: cancelledBills,
        status: 'CANCELLED',
        amount: cancelledBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
        days_overdue: cancelledBills.reduce((max, bill) => {
          const days = pastDueDaysOverdue(bill.due_date) ?? bill.days_overdue ?? 0;
          return days > max ? days : max;
        }, 0)
      });
    }
  });

  const sortedRows = [...activeRows].sort(
    (a, b) => Number(b.days_overdue || 0) - Number(a.days_overdue || 0)
  );

  const amount = activeRows.reduce((total, row) => total + Number(row.amount || 0), 0);
  const escalated = activeRows.filter(row => row.escalated_to_darius).length;
  const metricsContainer = document.getElementById('pastDueMetrics');

  if (metricsContainer) {
    metricsContainer.innerHTML = `
      <div class="past-due-metric">
        <span>Total Overdue</span>
        <strong>
          $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </strong>
      </div>

      <div class="past-due-metric">
        <span>Accounts Escalated</span>
        <strong>${escalated}</strong>
      </div>

      <div class="past-due-metric">
        <span>Active Past Due</span>
        <strong>${activeRows.length}</strong>
      </div>

      <div class="past-due-metric">
        <span>Cleared / Cancelled</span>
        <strong>
          ${clearedRows.length} / ${cancelledRows.length}
        </strong>
      </div>
    `;
  }

  const pastDueQuery = document.getElementById('nameSearchPastDue')?.value.toLowerCase().trim() || '';
  const clearedQuery = document.getElementById('nameSearchCleared')?.value.toLowerCase().trim() || '';
  const cancelledQuery = document.getElementById('nameSearchCancelled')?.value.toLowerCase().trim() || '';

  const matchesSearch = (row, query) => {
    if (!query) return true;
    return (
      String(row.member_name || '').toLowerCase().includes(query) ||
      String(row.member_number || '').toLowerCase().includes(query)
    );
  };

  pastDueRenderTable('dashboardTable', sortedRows.slice(0, 5));
  pastDueRenderTable('pastDueTable', activeRows.filter(row => matchesSearch(row, pastDueQuery)));
  pastDueRenderTable('clearedTable', clearedRows.filter(row => matchesSearch(row, clearedQuery)));
  pastDueRenderTable('cancelledTable', cancelledRows.filter(row => matchesSearch(row, cancelledQuery)));

  pastDueRenderMetrics('pastDueTabMetrics', activeRows);
  pastDueRenderMetrics('clearedTabMetrics', clearedRows);
  pastDueRenderMetrics('cancelledTabMetrics', cancelledRows);

  pastDueRenderExemptions();
  pastDueRenderLogGroups();
}

async function pastDueLoad() {
  const client = await pastDueClient();

  await loadPastDueFailureReasons();

  const { data, error } = await client.from(PAST_DUE_LOG_TABLE).select('*').order('imported_at', { ascending: false });
  if (error) throw error;

  const { data: exemptions, error: exemptionError } = await client.from(PAST_DUE_EXEMPT_TABLE).select('*').order('created_at', { ascending: false });
  if (exemptionError) throw exemptionError;

  pastDueRows = Array.isArray(data) ? data : [];
  pastDueExemptedRows = Array.isArray(exemptions) ? exemptions : [];
  pastDueRender();

  // Update the "Last updated" line in the header
  const updatedLine = document.getElementById('updatedLine');
  if (updatedLine) {
    const now = new Date();
    updatedLine.textContent = `Last updated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
  }
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

async function pastDueReconcileImportRows(client, csvRows) {
  const { data: existingRows, error } = await client
    .from(PAST_DUE_LOG_TABLE)
    .select('member_key, member_number, member_name');
  if (error) throw error;

  const keyByName = new Map();
  const existingBillKeys = new Set();

  (existingRows || []).forEach(existing => {
    const nameKey = pastDueIdentity(existing.member_name);
    const billNum = String(existing.member_number || '').trim().toLowerCase();

    if (nameKey) {
      keyByName.set(nameKey, existing.member_key);
      if (billNum) {
        existingBillKeys.add(`${nameKey}::${billNum}`);
      }
    }
  });

  const uniqueImportRows = [];
  const processedInCurrentBatch = new Set();

  for (const row of csvRows) {
    const nameKey = pastDueIdentity(row.member_name);
    const billNum = String(row.member_number || '').trim().toLowerCase();
    const comboKey = `${nameKey}::${billNum}`;

    if (billNum && (existingBillKeys.has(comboKey) || processedInCurrentBatch.has(comboKey))) {
      continue;
    }

    const assignedMemberKey = keyByName.get(nameKey) || row.member_key;
    keyByName.set(nameKey, assignedMemberKey);

    if (billNum) {
      processedInCurrentBatch.add(comboKey);
    }

    uniqueImportRows.push({
      ...row,
      member_key: assignedMemberKey
    });
  }

  return uniqueImportRows;
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
  if (!dateValue) return new Date().toISOString();
  return `${dateValue}T12:00:00.000Z`;
}

async function pastDueImport(file, importDateValue) {
  const status = document.getElementById('pastDueImportStatus');
  if (!importDateValue) {
    throw new Error('Choose an import date before importing the CSV.');
  }
  status.textContent = `Processing ${file.name}...`;

  const parsedRows = pastDueParseCsv(await file.text())
    .map(pastDueNormalizeRow)
    .map(row => ({
      ...row,
      imported_at: pastDueImportTimestamp(importDateValue)
    }));

  const validRows = parsedRows.map(row => {
    const cleanNumber = String(row.member_number || '').trim();
    const cleanName = pastDueIdentity(row.member_name);
    return {
      ...row,
      member_number: cleanNumber !== '' ? cleanNumber : null,
      member_name: cleanName !== '' ? row.member_name.trim() : null
    };
  }).filter(row => row.member_number !== null && row.member_name !== null);

  if (!validRows.length) {
    throw new Error('No valid records containing both a Bill Number and Member Name were found in the CSV.');
  }

  const uniqueBatchMap = new Map();
  for (const row of validRows) {
    const comboKey = `${String(row.member_number).trim().toLowerCase()}::${pastDueIdentity(row.member_name)}`;
    if (!uniqueBatchMap.has(comboKey)) {
      uniqueBatchMap.set(comboKey, row);
    }
  }
  const cleanBatch = Array.from(uniqueBatchMap.values());
  const client = await pastDueClient();
  const dbPayload = cleanBatch.map(({ bills, ...dbRow }) => dbRow);

  const { error } = await client
    .from(PAST_DUE_LOG_TABLE)
    .upsert(dbPayload, {
      onConflict: 'member_number, member_name',
      ignoreDuplicates: true
    });

  if (error) throw error;

  status.textContent = `Import complete. Bills matching both the same Bill Number and Member Name were skipped.`;
  status.classList.remove('upload-status-error');
  await pastDueLoad();
  return true;
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

function pastDueCsv(rows) {
  const columns = ['member_name', 'member_number', 'bill_type', 'first_name', 'last_name', 'income_category', 'due_date', 'amount_due', 'amount', 'days_overdue', 'failure_reason', 'stage', 'last_payment_retry', 'last_contact_date', 'notes', 'outcome_notes', 'escalated_to_darius', 'class_blocked', 'autopay', 'autopay_account', 'status', 'imported_at'];
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

  ['nameSearchPastDue', 'nameSearchCleared', 'nameSearchCancelled'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener('input', () => pastDueRender());

    const clearBtn = input.nextElementSibling;
    if (clearBtn && clearBtn.classList.contains('search-clear-btn')) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        pastDueRender();
        input.focus();
      });
    }
  });

  const logInput = document.getElementById('nameSearchLog');
  if (logInput) {
    logInput.addEventListener('input', () => pastDueRenderLogGroups());
    const clearBtn = logInput.nextElementSibling;
    if (clearBtn && clearBtn.classList.contains('search-clear-btn')) {
      clearBtn.addEventListener('click', () => {
        logInput.value = '';
        pastDueRenderLogGroups();
        logInput.focus();
      });
    }
  }

  const pastDueCsvInput = document.getElementById('pastDueCsvInput');
  if (pastDueCsvInput) {
    pastDueCsvInput.addEventListener('change', event => {
      pendingPastDueFile = event.target.files[0] || null;
      pastDueSetUploadControls(['confirmPastDueUploadBtn', 'cancelPastDueUploadBtn', 'removePastDueFileBtn'], Boolean(pendingPastDueFile));
      if (pendingPastDueFile) pastDueSetUploadStatus('pastDueImportStatus', `Selected: ${pendingPastDueFile.name}`);
    });
  }

  const confirmPastDueBtn = document.getElementById('confirmPastDueUploadBtn');
  if (confirmPastDueBtn) {
    confirmPastDueBtn.addEventListener('click', async () => {
      if (!pendingPastDueFile) return;
      const importDate = document.getElementById('pastDueImportDate').value;
      if (!importDate) {
        pastDueSetUploadStatus('pastDueImportStatus', 'Choose an import date before confirming the upload.', true);
        document.getElementById('pastDueImportDate').focus();
        return;
      }
      confirmPastDueBtn.disabled = true;
      try {
        if (await pastDueImport(pendingPastDueFile, importDate)) {
          const successMessage = document.getElementById('pastDueImportStatus').textContent;
          pastDueClearPendingUpload('pastDue', successMessage);
        }
      } catch (error) {
        pastDueSetUploadStatus('pastDueImportStatus', error.message || 'CSV upload failed.', true);
        confirmPastDueBtn.disabled = false;
      }
    });
  }

  document.getElementById('cancelPastDueUploadBtn')?.addEventListener('click', () => pastDueClearPendingUpload('pastDue'));
  document.getElementById('removePastDueFileBtn')?.addEventListener('click', () => pastDueClearPendingUpload('pastDue'));
  document.getElementById('downloadPastDueCsvBtn')?.addEventListener('click', pastDueDownload);
  document.getElementById('logDateFilter')?.addEventListener('change', pastDueRenderLogGroups);
  document.getElementById('addFailureReasonBtn')?.addEventListener('click', pastDueOpenFailureReasonModal);
  document.getElementById('failureReasonApproveBtn')?.addEventListener('click', pastDueApproveFailureReason);
  document.getElementById('failureReasonCancelBtn')?.addEventListener('click', pastDueCloseFailureReasonModal);
  document.getElementById('failureReasonModalClose')?.addEventListener('click', pastDueCloseFailureReasonModal);

  // Cancel Membership Modal Listeners
  document.getElementById('approveCancellationBtn')?.addEventListener('click', pastDueApproveCancellation);
  document.getElementById('cancelMembershipCloseBtn')?.addEventListener('click', pastDueCloseCancelModal);

  document.getElementById('cancelMembershipModal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) pastDueCloseCancelModal();
  });

  document.getElementById('cancellationReasonInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      pastDueApproveCancellation();
    }
  });

  document.getElementById('failureReasonModal')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) pastDueCloseFailureReasonModal();
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

  const exemptedCsvInput = document.getElementById('exemptedCsvInput');
  if (exemptedCsvInput) {
    exemptedCsvInput.addEventListener('change', event => {
      pendingExemptedFile = event.target.files[0] || null;
      pastDueSetUploadControls(['confirmExemptedUploadBtn', 'cancelExemptedUploadBtn', 'removeExemptedFileBtn'], Boolean(pendingExemptedFile));
      if (pendingExemptedFile) pastDueSetUploadStatus('exemptedStatus', `Selected: ${pendingExemptedFile.name}`);
    });
  }

  document.getElementById('cancelExemptedUploadBtn')?.addEventListener('click', () => pastDueClearPendingUpload('exempted'));
  document.getElementById('removeExemptedFileBtn')?.addEventListener('click', () => pastDueClearPendingUpload('exempted'));
  document.getElementById('addExemptedMemberBtn')?.addEventListener('click', pastDueAddManualExemption);
  document.getElementById('downloadExemptedCsvBtn')?.addEventListener('click', pastDueDownloadExemptions);

  pastDueLoad().catch(error => {
    document.querySelectorAll('.table-wrap').forEach(container => { container.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPastDuePage);
} else {
  initPastDuePage();
}