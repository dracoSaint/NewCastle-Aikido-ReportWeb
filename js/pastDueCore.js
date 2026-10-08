// Past Due import rules, shared by the web page (js/pastDueMembers.js)
// and the daily Zen Planner job (automation/zenplanner-pastdue.mjs). No page code here.

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

function pastDueIdentity(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

// Billing CSV text -> rows ready to upsert into past_due_member_log (onConflict member_key,
// ignoreDuplicates). importDate is YYYY-MM-DD; rows need a bill number and a name, one per bill.
function pastDueImportBatch(text, importDate) {
  const importedAt = `${importDate}T12:00:00.000Z`;
  const batch = new Map();
  pastDueParseCsv(text).map(pastDueNormalizeRow).forEach(row => {
    const number = String(row.member_number || '').trim();
    const name = pastDueIdentity(row.member_name);
    const key = `${number.toLowerCase()}::${name}`;
    if (number && name && !batch.has(key)) {
      batch.set(key, { ...row, member_number: number, member_name: row.member_name.trim(), imported_at: importedAt });
    }
  });
  return [...batch.values()];
}

// Node (the daily job) loads this file as a module; the browser just gets the globals.
if (typeof module !== 'undefined') {
  module.exports = { pastDueParseCsv, pastDueNormalizeRow, pastDueIdentity, pastDueImportBatch };
}
