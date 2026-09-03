const MONDAY_BOARD_SHEET_NAME = 'DASHBOARD';
const MEMBER_LIST_TABLE = 'membership_data';
const MEMBER_LIST_PREVIOUS_TABLE = 'membership_data_previous';
const MEMBER_LIST_LOG_TABLE = 'membership_data_log';
const MEMBER_WEEKLY_LOG_TABLE = 'membership_weekly_log';
const PREFERRED_BEGINNER_PACKAGE_LABELS = [
  'become - 6 week transformation journey',
  'blue zone- new beginnings 6 week life change introduction only',
  'chiisai kai beginners package',
  'junior beginner package'
];

const MONDAY_PAGE_CONFIGS = {
  current_mondayReport: {
    sheetName: 'MONDAY BOARD_SHEET',
    publishedUrl: config.mondayBoard.thisWeekReportUrl
  },
  last_mondayReport:    {
    sheetName: 'LAST WEEK REPORT',
    publishedUrl: config.mondayBoard.lastWeekReportUrl
  },
  // "Current Member List" is now fetched from Supabase, see loadMondayTab function.
};

let mondayJsonpCounter = 0;
const mondaySheetCache = {};

function normalizeHeaderName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    if ((char === '\t' || char === ';') && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map(value => value.trim());
}

function parseUploadedCsv(text) {
  const cleanText = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!cleanText) return [];

  const lines = cleanText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const delimiter = cleanText.includes('\t') ? '\t' : ',';
  const parsedLines = lines.map(line => {
    if (delimiter === ',') return parseCsvLine(line);
    return parseCsvLine(line.replace(/,/g, '\t'));
  });

  const headers = parsedLines[0].map(header => normalizeHeaderName(header));
  return parsedLines.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      const rawValue = row[index] ?? '';
      obj[header] = rawValue.trim();
    });
    return obj;
  }).filter(row => Object.values(row).some(value => String(value || '').trim() !== ''));
}

function formatCsvDateValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!match) return raw;
  const [, day, month, year] = match;
  const yearFull = year.length === 2 ? `20${year}` : year;
  return `${yearFull}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeSupabaseNullableValue(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeMembershipCsvRow(row) {
  const normalized = {};

  const fieldMap = {
    number: 'number',
    'first_name': 'first_name',
    'first name': 'first_name',
    'last_name': 'last_name',
    'last name': 'last_name',
    'membership_label': 'membership_label',
    'membership label': 'membership_label',
    'mbr_status': 'mbr_status',
    'mbr. status': 'mbr_status',
    'mbr_status_': 'mbr_status',
    'mbr_create_date': 'mbr_create_date',
    'mbr. create date': 'mbr_create_date',
    'mbr_begin_date': 'mbr_begin_date',
    'mbr. begin date': 'mbr_begin_date',
    'mbr_end_date': 'mbr_end_date',
    'mbr. end date': 'mbr_end_date',
    'att_limit': 'att_limit',
    'att. limit': 'att_limit',
    'att_limit_type': 'att_limit_type',
    'att. limit type': 'att_limit_type',
    'people_count': 'people_count',
    'people (count)': 'people_count',
    'autopay': 'autopay',
    'autopay_': 'autopay'
  };

  Object.entries(row).forEach(([key, value]) => {
    const canonical = fieldMap[normalizeHeaderName(key)] || normalizeHeaderName(key);
    if (!canonical) return;
    let cleaned = String(value ?? '').trim();

    if (canonical.includes('date')) {
      cleaned = formatCsvDateValue(cleaned);
    }

    if (canonical === 'number' || canonical === 'att_limit' || canonical === 'people_count') {
      cleaned = cleaned === '' ? null : String(cleaned).replace(/[^0-9.-]/g, '');
      if (cleaned === '') cleaned = null;
    }

    normalized[canonical] = cleaned;
  });

  if (!normalized.number && normalized['member_number']) {
    normalized.number = normalized.member_number;
  }

  return {
    number: normalizeSupabaseNullableValue(normalized.number),
    first_name: normalizeSupabaseNullableValue(normalized.first_name),
    last_name: normalizeSupabaseNullableValue(normalized.last_name),
    membership_label: normalizeSupabaseNullableValue(normalized.membership_label),
    mbr_status: normalizeSupabaseNullableValue(normalized.mbr_status),
    mbr_create_date: normalizeSupabaseNullableValue(normalized.mbr_create_date),
    mbr_begin_date: normalizeSupabaseNullableValue(normalized.mbr_begin_date),
    mbr_end_date: normalizeSupabaseNullableValue(normalized.mbr_end_date),
    att_limit: normalizeSupabaseNullableValue(normalized.att_limit),
    att_limit_type: normalizeSupabaseNullableValue(normalized.att_limit_type),
    people_count: normalizeSupabaseNullableValue(normalized.people_count),
    autopay: normalizeSupabaseNullableValue(normalized.autopay),
    report_date: null,
    imported_at: null,
    snapshot_label: 'CURRENT'
  };
}

function canonicalMembershipLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function choosePreferredDuplicateRow(rows) {
  const preferredOrder = PREFERRED_BEGINNER_PACKAGE_LABELS.map(value => value.toLowerCase());

  return rows.reduce((best, current) => {
    const bestKey = canonicalMembershipLabel(best.membership_label || '');
    const currentKey = canonicalMembershipLabel(current.membership_label || '');
    const bestRank = preferredOrder.indexOf(bestKey);
    const currentRank = preferredOrder.indexOf(currentKey);

    if (bestRank === -1 && currentRank === -1) {
      return new Date(current.imported_at || 0) > new Date(best.imported_at || 0) ? current : best;
    }

    if (bestRank === -1) return current;
    if (currentRank === -1) return best;
    if (currentRank < bestRank) return current;
    if (currentRank === bestRank && new Date(current.imported_at || 0) > new Date(best.imported_at || 0)) return current;
    return best;
  }, rows[0]);
}

function dedupeImportedMemberRows(rows) {
  const byNumber = new Map();
  rows.forEach(row => {
    const number = String(row.number || '').trim();
    if (number) {
      byNumber.set(number, row);
    }
  });

  const uniqueByName = new Map();
  Array.from(byNumber.values()).forEach(row => {
    const firstName = String(row.first_name || '').trim().toLowerCase();
    const lastName = String(row.last_name || '').trim().toLowerCase();
    const key = `${firstName}|${lastName}`;
    if (!key || key === '|') return;
    if (!uniqueByName.has(key)) {
      uniqueByName.set(key, []);
    }
    uniqueByName.get(key).push(row);
  });

  const finalRows = [];
  uniqueByName.forEach(group => {
    if (group.length === 1) {
      finalRows.push(group[0]);
      return;
    }

    finalRows.push(choosePreferredDuplicateRow(group));
  });

  return finalRows;
}

async function ensureSupabaseDataClient() {
  if (window.authReady) {
    try {
      await window.authReady;
    } catch (err) {
      console.warn('Auth initialization warning:', err);
    }
  }

  if (window.supabaseClient) {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    if (error) throw error;
    if (!session) {
      throw new Error('Your Supabase session is not active. Please sign in again.');
    }
    return window.supabaseClient;
  }

  if (typeof supabase === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Supabase client.'));
      document.head.appendChild(script);
    });
  }

  if (typeof config === 'undefined') {
    throw new Error('Missing Supabase config.js.');
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase URL or anon key is missing.');
  }

  const client = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session) {
    throw new Error('Your Supabase session is not active. Please sign in again.');
  }

  window.supabaseClient = client;
  return client;
}

async function loadSupabaseMemberList(key) {
  const container = document.getElementById(key + '-wrap');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading members from Supabase...</div>';

  try {
    const client = await ensureSupabaseDataClient();
    const { data, error } = await client
      .from(MEMBER_LIST_TABLE)
      .select('*')
      .order('number', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      renderTable(container, { headers: [], rows: [] });
      return;
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(item => headers.map(header => {
      const value = item[header];
      return value === null || value === undefined ? '' : value;
    }));

    renderTable(container, { headers, rows });
  } catch (err) {
    showError(key + '-wrap', err);
  }
}

function getMemberLogSnapshotRows(logRows) {
  if (!Array.isArray(logRows) || !logRows.length) return [];
  const snapshotRows = logRows.filter(row => row.snapshot_label === 'LAST WEEK');
  if (!snapshotRows.length) return [];

  const previousRows = getPreviousSavedSnapshot(snapshotRows);
  if (previousRows.length) return previousRows;

  return getLatestSavedSnapshot(snapshotRows);
}

async function loadSupabaseMemberListHistory() {
  const container = document.getElementById('memberListLastWeek-wrap');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading archived member list...</div>';

  try {
    const client = await ensureSupabaseDataClient();

    const { data: previousRows, error: previousError } = await client
      .from(MEMBER_LIST_PREVIOUS_TABLE)
      .select('*')
      .order('number', { ascending: true });

    if (previousError) {
      console.warn('membership_data_previous unavailable, falling back to log table.', previousError);
    }

    const snapshotRows = (await client
      .from(MEMBER_LIST_LOG_TABLE)
      .select('*')
      .order('archived_at', { ascending: false })).data || [];

    if (!snapshotRows.length) {
      container.innerHTML = '<div class="empty">No archived member list snapshots yet.</div>';
      return;
    }

    const selectedRows = getMemberLogSnapshotRows(snapshotRows);

    const headers = Object.keys(selectedRows[0]).filter(key => !['archived_at', 'snapshot_label'].includes(key));
    const rows = selectedRows.map(item => headers.map(header => {
      const value = item[header];
      return value === null || value === undefined ? '' : value;
    }));

    renderTable(container, { headers, rows });
  } catch (err) {
    showError('memberListLastWeek-wrap', err);
  }
}

function getSnapshotDateKey(row) {
  return getReportDateValue(row) || row.archived_at || row.imported_at || 'unknown';
}

function getWeeklyLogColumnOrder() {
  return [
    'report_date',
    'members_total',
    'regular_adult',
    'beginner_adult',
    'concession_adult',
    'chiisai_kai',
    'kids_8_14',
    'kids_15_17',
    'blue_zone',
    'combat_pilates',
    'beginner_totals',
    'become_adult',
    'become_chiisai',
    'become_kids',
    'become_blue_zone',
    'become_c_pilates',
    'uploaded_at',
    'snapshot_label'
  ];
}

function getEditableWeeklyLogColumns(row) {
  const orderedColumns = getWeeklyLogColumnOrder();
  const rowColumns = Object.keys(row || {});
  const uniqueColumns = [...new Set([...orderedColumns.filter(column => rowColumns.includes(column)), ...rowColumns])];

  return uniqueColumns.filter(column => !['id', 'created_at', 'updated_at'].includes(column));
}

function coerceEditableWeeklyLogFieldValue(fieldName, rawValue) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return null;
  }

  const textFields = new Set(['snapshot_label', 'report_date', 'uploaded_at']);
  if (fieldName === 'report_date' || fieldName === 'uploaded_at') {
    return rawValue || null;
  }

  if (textFields.has(fieldName)) {
    const trimmed = String(rawValue).trim();
    return trimmed === '' ? null : trimmed;
  }

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildEditableWeeklyLogTableHTML(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<div class="empty">No weekly log rows are available yet.</div>';
  }

  const firstRow = rows[0] || {};
  const columns = getEditableWeeklyLogColumns(firstRow);
  const headers = columns.map(column => String(column).replace(/_/g, ' '));

  let html = '<table class="filterable"><thead><tr>';
  headers.forEach(header => { html += '<th>' + escapeHtml(header) + '</th>'; });
  html += '<th>Action</th></tr></thead><tbody>';

  rows.forEach(row => {
    const rowId = row.id || 'draft';
    html += '<tr data-row-id="' + escapeHtml(String(rowId)) + '" data-editable="false">';

    columns.forEach(column => {
      const value = row[column] === null || row[column] === undefined ? '' : row[column];
      const isDate = column === 'report_date' || column === 'uploaded_at';
      const isNumeric = ['members_total', 'regular_adult', 'beginner_adult', 'concession_adult', 'chiisai_kai', 'kids_8_14', 'kids_15_17', 'blue_zone', 'combat_pilates', 'beginner_totals', 'become_adult', 'become_chiisai', 'become_kids', 'become_blue_zone', 'become_c_pilates'].includes(column);
      const inputType = isDate ? 'date' : isNumeric ? 'number' : 'text';
      const step = isNumeric ? 'any' : '';
      const castValue = isDate ? String(value).slice(0, 10) : String(value);

      html += '<td><input type="' + inputType + '" value="' + escapeHtml(castValue) + '" data-field="' + escapeHtml(column) + '" step="' + escapeHtml(step) + '" disabled /></td>';
    });

    html += '<td>' +
      '<button type="button" class="sop-action-button primary weekly-log-edit" data-row-id="' + escapeHtml(String(rowId)) + '">Edit</button>' +
      '<button type="button" class="sop-action-button secondary weekly-log-delete" data-row-id="' + escapeHtml(String(rowId)) + '" style="margin-left:8px;">Delete</button>' +
      '<button type="button" class="sop-action-button primary weekly-log-save hidden" data-row-id="' + escapeHtml(String(rowId)) + '" style="margin-left:8px;">Save</button>' +
      '</td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

async function saveWeeklyLogRowEdit(rowId, rowNode) {
  const client = await ensureSupabaseDataClient();
  const inputFields = rowNode.querySelectorAll('input[data-field]');
  const payload = {};

  inputFields.forEach(input => {
    const fieldName = input.getAttribute('data-field');
    if (!fieldName) return;

    const rawValue = input.value;
    payload[fieldName] = coerceEditableWeeklyLogFieldValue(fieldName, rawValue);
  });

  if (!rowId || rowId === 'draft') {
    const { error } = await client
      .from(MEMBER_WEEKLY_LOG_TABLE)
      .insert(payload);
    if (error) throw error;
    return;
  }

  const { error } = await client
    .from(MEMBER_WEEKLY_LOG_TABLE)
    .update(payload)
    .eq('id', rowId);

  if (error) throw error;
}

async function deleteWeeklyLogRow(rowId) {
  if (!rowId || rowId === 'draft') return false;

  const confirmed = window.confirm('Are you sure you want to delete this weekly log row?');
  if (!confirmed) return false;

  const client = await ensureSupabaseDataClient();
  const { error } = await client
    .from(MEMBER_WEEKLY_LOG_TABLE)
    .delete()
    .eq('id', rowId);

  if (error) throw error;
  return true;
}

async function getWeeklyLogFallbackRows(client) {
  const { data: currentRows, error: currentError } = await client
    .from(MEMBER_LIST_TABLE)
    .select('*');

  if (currentError) throw currentError;
  if (!currentRows || !currentRows.length) return [];

  const payload = buildWeeklySummaryLogFromRows(currentRows);
  return [{
    ...payload,
    report_date: getSelectedReportDate(new Date().toISOString().split('T')[0]),
    uploaded_at: new Date().toISOString(),
    snapshot_label: 'CURRENT'
  }];
}

function buildManualWeeklyLogFormHTML() {
  const numericColumns = getWeeklyLogColumnOrder().filter(column => !['report_date', 'uploaded_at', 'snapshot_label'].includes(column));
  const fields = numericColumns.map(column => `
    <label>
      <span>${escapeHtml(String(column).replace(/_/g, ' '))}</span>
      <input type="number" step="any" min="0" data-manual-weekly-field="${escapeHtml(column)}" />
    </label>
  `).join('');

  return `
    <form class="manual-weekly-log-form" id="manualWeeklyLogForm">
      <div class="manual-weekly-log-fields">
        <label>
          <span>Report date</span>
          <input type="date" required data-manual-weekly-field="report_date" value="${escapeHtml(new Date().toISOString().split('T')[0])}" />
        </label>
        ${fields}
      </div>
      <div class="button-group">
        <button type="submit" class="sop-action-button primary" id="saveManualWeeklyLogBtn">Save Log</button>
        <button type="button" class="sop-action-button secondary" id="cancelManualWeeklyLogBtn">Cancel</button>
        <span id="manualWeeklyLogStatus" role="status"></span>
      </div>
    </form>
  `;
}

function initManualWeeklyLogForm() {
  const addButton = document.getElementById('addWeeklyLogBtn');
  const formContainer = document.getElementById('manualWeeklyLogForm-wrap');
  const modal = document.getElementById('manualWeeklyLogModal');
  const closeButton = document.getElementById('closeManualWeeklyLogBtn');
  if (!addButton || !formContainer || !modal || addButton.dataset.initialized === 'true') return;

  addButton.dataset.initialized = 'true';
  const closeModal = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    formContainer.innerHTML = '';
  };

  addButton.addEventListener('click', () => {
    formContainer.innerHTML = buildManualWeeklyLogFormHTML();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    const form = document.getElementById('manualWeeklyLogForm');
    const cancelButton = document.getElementById('cancelManualWeeklyLogBtn');
    const status = document.getElementById('manualWeeklyLogStatus');
    const saveButton = document.getElementById('saveManualWeeklyLogBtn');

    cancelButton.addEventListener('click', closeModal);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      saveButton.disabled = true;
      status.textContent = 'Saving...';

      try {
        const client = await ensureSupabaseDataClient();
        const payload = {};
        form.querySelectorAll('[data-manual-weekly-field]').forEach(input => {
          const fieldName = input.getAttribute('data-manual-weekly-field');
          payload[fieldName] = coerceEditableWeeklyLogFieldValue(fieldName, input.value);
        });
        payload.uploaded_at = new Date().toISOString();
        payload.snapshot_label = 'CURRENT';

        const { error } = await client.from(MEMBER_WEEKLY_LOG_TABLE).insert(payload);
        if (error) throw error;

        closeModal();
        await loadMemberHistoryLog();
      } catch (err) {
        status.textContent = err.message || 'Unable to save log.';
        saveButton.disabled = false;
      }
    });
  });

  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });
}

async function loadMemberHistoryLog() {
  const container = document.getElementById('memberHistoryLog-wrap');
  if (!container) return;
  initManualWeeklyLogForm();
  container.innerHTML = '<div class="loading">Loading weekly membership log...</div>';

  try {
    const client = await ensureSupabaseDataClient();
    const { data, error } = await client
      .from(MEMBER_WEEKLY_LOG_TABLE)
      .select('*')
      .order('report_date', { ascending: false });

    if (error) throw error;

    let logRows = Array.isArray(data) ? data : [];
    if (!logRows.length) {
      logRows = await getWeeklyLogFallbackRows(client);
    }

    if (!logRows.length) {
      container.innerHTML = '<div class="empty">No weekly membership log rows are available yet.</div>';
      return;
    }

    container.innerHTML = buildEditableWeeklyLogTableHTML(logRows);

    container.querySelectorAll('.weekly-log-edit').forEach(button => {
      button.addEventListener('click', () => {
        const rowNode = button.closest('tr');
        if (!rowNode) return;

        rowNode.setAttribute('data-editable', 'true');
        rowNode.querySelectorAll('input[data-field]').forEach(input => {
          input.disabled = false;
        });

        button.classList.add('hidden');
        const saveBtn = rowNode.querySelector('.weekly-log-save');
        const deleteBtn = rowNode.querySelector('.weekly-log-delete');
        if (saveBtn) saveBtn.classList.remove('hidden');
        if (deleteBtn) deleteBtn.classList.add('hidden');
      });
    });

    container.querySelectorAll('.weekly-log-save').forEach(button => {
      button.addEventListener('click', async () => {
        const rowId = button.getAttribute('data-row-id');
        const rowNode = button.closest('tr');
        if (!rowNode) return;

        button.disabled = true;
        button.textContent = 'Saving...';

        try {
          await saveWeeklyLogRowEdit(rowId, rowNode);
          rowNode.setAttribute('data-editable', 'false');
          rowNode.querySelectorAll('input[data-field]').forEach(input => {
            input.disabled = true;
          });

          const editBtn = rowNode.querySelector('.weekly-log-edit');
          const deleteBtn = rowNode.querySelector('.weekly-log-delete');
          if (editBtn) editBtn.classList.remove('hidden');
          if (deleteBtn) deleteBtn.classList.remove('hidden');
          button.classList.add('hidden');
          button.textContent = 'Save';
        } catch (err) {
          button.textContent = 'Save failed';
          setTimeout(() => {
            button.textContent = 'Save';
            button.disabled = false;
          }, 1800);
          showError('memberHistoryLog-wrap', err);
        }
      });
    });

    container.querySelectorAll('.weekly-log-delete').forEach(button => {
      button.addEventListener('click', async () => {
        const rowId = button.getAttribute('data-row-id');
        const rowNode = button.closest('tr');
        if (!rowNode) return;

        button.disabled = true;
        button.textContent = 'Deleting...';

        try {
          const shouldDelete = await deleteWeeklyLogRow(rowId);
          if (!shouldDelete) {
            button.textContent = 'Delete';
            button.disabled = false;
            return;
          }

          rowNode.remove();
          const remainingRows = container.querySelectorAll('tr[data-row-id]');
          if (!remainingRows.length) {
            container.innerHTML = '<div class="empty">No weekly membership log rows are available yet.</div>';
          }
        } catch (err) {
          button.textContent = 'Delete failed';
          setTimeout(() => {
            button.textContent = 'Delete';
            button.disabled = false;
          }, 1800);
          showError('memberHistoryLog-wrap', err);
        }
      });
    });
  } catch (err) {
    showError('memberHistoryLog-wrap', err);
  }
}

function getSelectedReportDate(reportDateValue) {
  if (!reportDateValue) {
    return new Date().toISOString().split('T')[0];
  }

  const selectedDate = new Date(`${reportDateValue}T12:00:00`);
  if (Number.isNaN(selectedDate.getTime())) {
    return new Date().toISOString().split('T')[0];
  }

  return selectedDate.toISOString().split('T')[0];
}

function getSelectedReportTimestamp(reportDateValue) {
  if (!reportDateValue) {
    return new Date().toISOString();
  }

  const selectedDate = new Date(`${reportDateValue}T12:00:00`);
  if (Number.isNaN(selectedDate.getTime())) {
    return new Date().toISOString();
  }

  return selectedDate.toISOString();
}

function buildWeeklySummaryLogFromRows(rows) {
  const summary = buildCurrentReportSummary(rows || []);
  const beginnerSummary = buildCurrentBeginnerPackageSummary(rows || []);

  const payload = {
    report_date: getSelectedReportDate(new Date().toISOString().split('T')[0]),
    regular_adult: summary['Regular Adult']?.current || 0,
    beginner_adult: summary['Beginner Adult']?.current || 0,
    concession_adult: summary['Concession Adult']?.current || 0,
    chiisai_kai: summary['Chiisai Kai']?.current || 0,
    kids_8_14: summary['8-14 Junior Member']?.current || 0,
    kids_15_17: summary['15-17 Junior Member']?.current || 0,
    blue_zone: summary['Blue Zone Fitness ongoing']?.current || 0,
    combat_pilates: summary['Combat Pilates']?.current || 0,
    members_total: CURRENT_REPORT_ROW_LABELS.reduce((sum, label) => sum + (summary[label]?.current || 0), 0),
    become_adult: beginnerSummary['BECOME - 6 Week transformation journey'] || 0,
    become_chiisai: beginnerSummary['Chiisai Kai Beginners Package'] || 0,
    become_kids: beginnerSummary['Junior Beginner Package'] || 0,
    become_blue_zone: beginnerSummary['Blue Zone- New beginnings 6 week life change Introduction only'] || 0,
    become_c_pilates: beginnerSummary['Combat Pilates Become'] || 0,
    beginner_totals: BEGINNER_PACKAGE_LABELS.reduce((sum, label) => sum + (beginnerSummary[label] || 0), 0)
  };

  return payload;
}

async function saveWeeklyMemberSummaryLog(reportDateValue, rows) {
  const client = await ensureSupabaseDataClient();
  const selectedReportDate = getSelectedReportDate(reportDateValue);
  const summary = buildWeeklySummaryLogFromRows(rows || []);

  const payload = {
    ...summary,
    report_date: selectedReportDate,
    uploaded_at: new Date().toISOString(),
    snapshot_label: 'CURRENT'
  };

  const { error } = await client
    .from(MEMBER_WEEKLY_LOG_TABLE)
    .insert(payload);

  if (error) throw error;
}

async function archiveCurrentMemberList(reportDateValue) {
  const client = await ensureSupabaseDataClient();
  const { data: currentRows, error: fetchError } = await client
    .from(MEMBER_LIST_TABLE)
    .select('*');

  if (fetchError) throw fetchError;
  if (!currentRows || currentRows.length === 0) return;

  const selectedReportDate = getSelectedReportDate(reportDateValue);

  const previousRows = currentRows.map((row) => {
    const { csv_import_batch, ...safeRow } = row || {};
    return {
      ...safeRow,
      report_date: row.report_date || selectedReportDate,
      archived_at: getSelectedReportTimestamp(reportDateValue),
      snapshot_label: 'LAST WEEK',
      imported_at: row.imported_at || getSelectedReportTimestamp(reportDateValue)
    };
  });

  try {
    const { error: previousDeleteError } = await client
      .from(MEMBER_LIST_PREVIOUS_TABLE)
      .delete()
      .neq('number', -1);

    if (previousDeleteError) throw previousDeleteError;

    const { error: previousInsertError } = await client
      .from(MEMBER_LIST_PREVIOUS_TABLE)
      .insert(currentRows.map(row => ({
        ...row,
        number: Number(row.number),
        report_date: row.report_date || selectedReportDate
      })));

    if (previousInsertError) throw previousInsertError;
  } catch (previousTableError) {
    console.warn('membership_data_previous could not be updated; using membership_data_log instead.', previousTableError);
  }

  const { error: insertError } = await client
    .from(MEMBER_LIST_LOG_TABLE)
    .insert(previousRows);

  if (insertError) throw insertError;
}

async function replaceCurrentMemberList(rows) {
  const client = await ensureSupabaseDataClient();
  const cleanRows = dedupeImportedMemberRows(rows.map(row => ({
    ...row,
    number: normalizeSupabaseNullableValue(row.number),
    first_name: normalizeSupabaseNullableValue(row.first_name),
    last_name: normalizeSupabaseNullableValue(row.last_name),
    membership_label: normalizeSupabaseNullableValue(row.membership_label),
    mbr_status: normalizeSupabaseNullableValue(row.mbr_status),
    mbr_create_date: normalizeSupabaseNullableValue(row.mbr_create_date),
    mbr_begin_date: normalizeSupabaseNullableValue(row.mbr_begin_date),
    mbr_end_date: normalizeSupabaseNullableValue(row.mbr_end_date),
    att_limit: normalizeSupabaseNullableValue(row.att_limit),
    att_limit_type: normalizeSupabaseNullableValue(row.att_limit_type),
    people_count: normalizeSupabaseNullableValue(row.people_count),
    autopay: normalizeSupabaseNullableValue(row.autopay),
    report_date: row.report_date || getSelectedReportDate(row.imported_at),
    imported_at: row.imported_at || new Date().toISOString(),
    snapshot_label: row.snapshot_label || 'CURRENT'
  })));

  const { data: existingRows, error: fetchError } = await client
    .from(MEMBER_LIST_TABLE)
    .select('*');

  if (fetchError) {
    throw fetchError;
  }

  const incomingByNumber = new Map(cleanRows.map(row => [String(row.number || '').trim(), row]));
  const existingByNumber = new Map((existingRows || []).map(row => [String(row.number || '').trim(), row]));

  const rowsToInsert = cleanRows.filter(row => !existingByNumber.has(String(row.number || '').trim()));
  const rowsToUpdate = cleanRows.filter(row => existingByNumber.has(String(row.number || '').trim()));
  const rowsToDelete = (existingRows || [])
    .map(row => String(row.number || '').trim())
    .filter(number => number && !incomingByNumber.has(number));

  if (rowsToDelete.length > 0) {
    const { error: deleteError } = await client
      .from(MEMBER_LIST_TABLE)
      .delete()
      .in('number', rowsToDelete);

    if (deleteError) {
      throw deleteError;
    }
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await client
      .from(MEMBER_LIST_TABLE)
      .insert(rowsToInsert);

    if (insertError) {
      throw insertError;
    }
  }

  if (rowsToUpdate.length > 0) {
    const updates = rowsToUpdate.map(row => ({
      ...row,
      number: String(row.number || '').trim()
    }));

    for (const row of updates) {
      const { error: updateError } = await client
        .from(MEMBER_LIST_TABLE)
        .update({
          first_name: row.first_name,
          last_name: row.last_name,
          membership_label: row.membership_label,
          mbr_status: row.mbr_status,
          mbr_create_date: row.mbr_create_date,
          mbr_begin_date: row.mbr_begin_date,
          mbr_end_date: row.mbr_end_date,
          att_limit: row.att_limit,
          att_limit_type: row.att_limit_type,
          people_count: row.people_count,
          autopay: row.autopay,
          report_date: row.report_date || getSelectedReportDate(row.imported_at),
          imported_at: row.imported_at,
          snapshot_label: row.snapshot_label
        })
        .eq('number', row.number);

      if (updateError) {
        throw updateError;
      }
    }
  }

  return cleanRows;
}

let pendingCsvFile = null;

function setUploadProgress(percent, label) {
  const bar = document.getElementById('csvProgressBar');
  const text = document.getElementById('csvProgressText');

  if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  if (text) text.textContent = label || `${Math.round(percent)}%`;
}

function openCsvUploadModal(file) {
  const modal = document.getElementById('csvUploadModal');
  const selectedFileEl = document.getElementById('csvUploadSelectedFile');
  const dateInput = document.getElementById('csvReportDateInput');
  if (!modal || !selectedFileEl || !dateInput) return;

  pendingCsvFile = file;
  selectedFileEl.textContent = file ? file.name : 'No file selected';
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() - 7);
  dateInput.value = defaultDate.toISOString().split('T')[0];
  setUploadProgress(0, '0%');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeCsvUploadModal() {
  const modal = document.getElementById('csvUploadModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function processConfirmedCsvUpload(file, reportDateValue) {
  const statusEl = document.getElementById('csvUploadStatus');
  if (!file) return;

  if (statusEl) statusEl.textContent = 'Processing CSV...';
  setUploadProgress(8, '8%');

  try {
    const text = await file.text();
    setUploadProgress(24, '24%');

    const parsedRows = parseUploadedCsv(text)
      .map(normalizeMembershipCsvRow)
      .filter(row => row.number || row.first_name || row.last_name);

    if (!parsedRows.length) {
      throw new Error('No valid member rows were found in the CSV file.');
    }

    const finalRows = parsedRows.map(row => ({
      ...row,
      report_date: getSelectedReportDate(reportDateValue),
      imported_at: getSelectedReportTimestamp(reportDateValue),
      snapshot_label: 'CURRENT'
    }));

    setUploadProgress(46, '46%');
    await archiveCurrentMemberList(reportDateValue);
    setUploadProgress(72, '72%');
    await replaceCurrentMemberList(finalRows);
    await saveWeeklyMemberSummaryLog(reportDateValue, finalRows);
    setUploadProgress(100, '100%');

    if (statusEl) statusEl.textContent = `${finalRows.length} rows imported successfully.`;
    closeCsvUploadModal();
    delete loadedTabs['current_mondayReport'];
    delete loadedTabs['last_mondayReport'];
    delete loadedTabs['current_memberList'];
    await loadCurrentMondayReportSummary();
    await loadLastMondayReportSummary();
    await loadSupabaseMemberList('current_memberList');
    await loadSupabaseMemberListHistory();
  } catch (error) {
    console.error('CSV import failed:', error);
    if (statusEl) statusEl.textContent = error.message || 'CSV import failed.';
    setUploadProgress(0, '0%');
  }
}

async function handleMemberCsvUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  openCsvUploadModal(file);
}

function initCsvUploadControls() {
  const importButton = document.getElementById('importMemberCsvBtn');
  const csvInput = document.getElementById('memberCsvInput');
  const statusEl = document.getElementById('csvUploadStatus');
  const confirmUploadBtn = document.getElementById('confirmCsvUploadBtn');
  const cancelUploadBtn = document.getElementById('cancelCsvUploadBtn');
  const closeUploadBtn = document.getElementById('closeCsvUploadModal');
  const dateInput = document.getElementById('csvReportDateInput');

  if (!importButton || !csvInput) return;

  const updateStatusText = () => {
    if (!statusEl) return;

    const file = csvInput.files && csvInput.files[0];
    if (!file) {
      statusEl.textContent = 'No file selected';
      return;
    }

    statusEl.textContent = `Selected: ${file.name}`;
  };

  importButton.addEventListener('click', () => {
    csvInput.click();
  });

  csvInput.addEventListener('change', () => {
    updateStatusText();
    if (csvInput.files && csvInput.files.length > 0) {
      handleMemberCsvUpload({ target: csvInput });
    }
  });

  if (confirmUploadBtn) {
    confirmUploadBtn.addEventListener('click', async () => {
      if (!pendingCsvFile) return;
      const reportDateValue = dateInput ? dateInput.value : '';
      await processConfirmedCsvUpload(pendingCsvFile, reportDateValue);
    });
  }

  if (cancelUploadBtn) {
    cancelUploadBtn.addEventListener('click', () => {
      closeCsvUploadModal();
      pendingCsvFile = null;
    });
  }

  if (closeUploadBtn) {
    closeUploadBtn.addEventListener('click', () => {
      closeCsvUploadModal();
      pendingCsvFile = null;
    });
  }

  const modal = document.getElementById('csvUploadModal');
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeCsvUploadModal();
        pendingCsvFile = null;
      }
    });
  }
}

function normalizeRow(row, length) {
  const normalized = (row || []).slice();
  while (normalized.length < length) normalized.push('');
  return normalized;
}

function fetchMondayBoardDashboard() {
return new Promise((resolve, reject) => {
    const callbackName = 'mondayDashboardCb' + mondayJsonpCounter++;
    const timeout = setTimeout(() => {
    cleanup();
    reject(new Error('Timed out loading the DASHBOARD sheet.'));
    }, 12000);

    function cleanup() {
    clearTimeout(timeout);
    delete window[callbackName];
    if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = response => {
    cleanup();
    try {
        const table = response.table;
        resolve({
        columns: table.cols,
        rows: table.rows.map(row => row.c || [])
        });
    } catch (error) {
        reject(error);
    }
    };

    const url = 'https://docs.google.com/spreadsheets/d/' + config.mondayBoardSpreadsheetId +
    '/gviz/tq?tqx=out:json;responseHandler:' + callbackName +
    '&sheet=' + encodeURIComponent(MONDAY_BOARD_SHEET_NAME) + '&headers=1';
    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => {
    cleanup();
    reject(new Error('Failed to load the DASHBOARD sheet.'));
    };
    document.body.appendChild(script);
});
}

function fetchMondaySheetRaw(sheetName) {
  if (mondaySheetCache[sheetName]) return mondaySheetCache[sheetName];

  const promise = new Promise((resolve, reject) => {
    const cbName = 'gvizCb' + (mondayJsonpCounter++);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out loading "' + sheetName + '". Check the sheet is shared as "Anyone with the link".'));
    }, 12000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function (response) {
      cleanup();
      try {
        const table = response.table;
        const colCount = table.cols.length;
        const rows = table.rows.map(r => {
          const row = (r.c || []).map(cell => {
            if (!cell) return '';
            return cell.f !== undefined && cell.f !== null ? cell.f : (cell.v === null ? '' : cell.v);
          });
          return normalizeRow(row, colCount);
        });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };

    const url = 'https://docs.google.com/spreadsheets/d/' + config.mondayBoardSpreadsheetId +
      '/gviz/tq?tqx=out:json;responseHandler:' + cbName +
      '&sheet=' + encodeURIComponent(sheetName) +
      '&headers=0';

    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => { cleanup(); reject(new Error('Failed to load sheet "' + sheetName + '".')); };
    document.body.appendChild(script);
  });

  mondaySheetCache[sheetName] = promise;
  return promise;
}

async function fetchSupabaseTable(tableName) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase configuration (supabaseUrl and supabaseAnonKey) is missing in config.js.');
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${tableName}?select=*`, {
    headers: {
      'apikey': config.supabaseAnonKey,
      'Authorization': `Bearer ${config.supabaseAnonKey}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to fetch from Supabase: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

function loadSupabaseMemberList(key) {
  const container = document.getElementById(key + '-wrap');
  container.innerHTML = '<div class="loading">Loading members from Supabase...</div>';

  fetchSupabaseTable('membership_data')
    .then(data => {
      console.log('Data received from Supabase:', data); // Debugging line
      if (!data || data.length === 0) {
        currentMemberListState.headers = [];
        currentMemberListState.rows = [];
        renderTable(container, { headers: [], rows: [] });
        renderCurrentMemberListWithFilters();
        return;
      }

      const headers = Object.keys(data[0]);
      const rows = data.map(item => headers.map(header => {
        const value = item[header];
        return value === null || value === undefined ? '' : value;
      }));

      currentMemberListState.headers = headers;
      currentMemberListState.rows = rows;
      updateCurrentMemberFilterOptions(headers);
      toggleCurrentMemberFilters();
      renderCurrentMemberListWithFilters();
    })
    .catch(err => showError(key + '-wrap', err));
}

function dashboardCell(row, index) {
const cell = row[index];
return cell && cell.v !== null && cell.v !== undefined ? cell.v : null;
}

function dashboardLabel(row, index) {
    const cell = row[index];
    return cell && cell.f ? cell.f : dashboardCell(row, index);
}

function findDashboardRow(rows, label) {
    const expectedLabel = label.toLowerCase();
    return rows.find(row => String(dashboardCell(row, 0) || '').toLowerCase() === expectedLabel);
}

function valuesForRow(row, dateCount) {
    if (!row) return Array.from({ length: dateCount }, () => null);
    return Array.from({ length: dateCount }, (_, index) => dashboardCell(row, index + 2));
}

function dashboardDateLabels(rows, dateCount) {
    const dateRow = rows[9] || [];
    return Array.from({ length: dateCount }, (_, index) => dashboardLabel(dateRow, index + 2) || '');
}

function chartColors(count) {
    const colors = ['#a3272c', '#1c2b3a', '#2f7f7a', '#d28c32', '#63748a', '#8c4f5a', '#4c8a52', '#8f6b3d'];
    return Array.from({ length: count }, (_, index) => colors[index % colors.length]);
}

const CURRENT_REPORT_ROW_LABELS = [
  'Regular Adult',
  'Beginner Adult',
  'Concession Adult',
  'Chiisai Kai',
  '8-14 Junior Member',
  '15-17 Junior Member',
  'Blue Zone Fitness ongoing',
  'Combat Pilates'
];

const BEGINNER_PACKAGE_LABELS = [
  'BECOME - 6 Week transformation journey',
  'Chiisai Kai Beginners Package',
  'Junior Beginner Package',
  'Blue Zone- New beginnings 6 week life change Introduction only',
  'Combat Pilates Become'
];

const REPORT_CATEGORY_GOALS = {
  'Regular Adult': 100,
  'Beginner Adult': 15,
  'Concession Adult': 15,
  'Chiisai Kai': 20,
  '8-14 Junior Member': 50,
  '15-17 Junior Member': 20,
  'Blue Zone Fitness ongoing': 20,
  'Combat Pilates': 15
};

const REPORT_CATEGORY_WEEKLY_FEE = {
  'Regular Adult': 55,
  'Beginner Adult': 45,
  'Concession Adult': 45,
  'Chiisai Kai': 45,
  '8-14 Junior Member': 35,
  '15-17 Junior Member': 40,
  'Blue Zone Fitness ongoing': 60,
  'Combat Pilates': 20
};

const REPORT_DISPLAY_LABELS = {
  'Regular Adult': 'Regular Adult',
  'Beginner Adult': 'Beginner',
  'Concession Adult': 'Concession',
  'Chiisai Kai': 'Chiisai Kai 4-7',
  '8-14 Junior Member': 'Kids 8-14',
  '15-17 Junior Member': 'Kids 15-17',
  'Blue Zone Fitness ongoing': 'Blue Zone',
  'Combat Pilates': 'Combat Pilates'
};

const BEGINNER_PACKAGE_DISPLAY = {
  'BECOME - 6 Week transformation journey': 'Become Adult',
  'Chiisai Kai Beginners Package': 'Become Chiisai',
  'Junior Beginner Package': 'Become Kids',
  'Blue Zone- New beginnings 6 week life change Introduction only': 'Become Blue Zone',
  'Combat Pilates Become': 'Become C-Pilates'
};

const BEGINNER_PACKAGE_GOALS = {
  'BECOME - 6 Week transformation journey': 10,
  'Chiisai Kai Beginners Package': 10,
  'Junior Beginner Package': 10,
  'Blue Zone- New beginnings 6 week life change Introduction only': 10,
  'Combat Pilates Become': 15
};

const BEGINNER_PACKAGE_FEE = {
  'BECOME - 6 Week transformation journey': 300,
  'Chiisai Kai Beginners Package': 300,
  'Junior Beginner Package': 300,
  'Blue Zone- New beginnings 6 week life change Introduction only': 300,
  'Combat Pilates Become': 300
};

const BEGINNER_PACKAGE_ROLLOVER_FEE = {
  'BECOME - 6 Week transformation journey': 45,
  'Chiisai Kai Beginners Package': 45,
  'Junior Beginner Package': 45,
  'Blue Zone- New beginnings 6 week life change Introduction only': 45,
  'Combat Pilates Become': 45
};

function normalizeReportCategory(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const lookup = {
    'regular adult': 'Regular Adult',
    'beginner adult': 'Beginner Adult',
    'beginner': 'Beginner Adult',
    'concession adult': 'Concession Adult',
    'concession': 'Concession Adult',
    'chiisai kai': 'Chiisai Kai',
    '8-14 junior member': '8-14 Junior Member',
    '8 14 junior member': '8-14 Junior Member',
    '15-17 junior member': '15-17 Junior Member',
    '15 17 junior member': '15-17 Junior Member',
    'blue zone fitness ongoing': 'Blue Zone Fitness ongoing',
    'blue zone': 'Blue Zone Fitness ongoing',
    'combat pilates': 'Combat Pilates',
    'combat pilates become': 'Combat Pilates'
  };

  return lookup[normalized] || String(value || '').trim();
}

function normalizeBeginnerPackageCategory(value) {
  const normalized = String(value || '').trim();
  const lookup = {
    'become - 6 week transformation journey': 'BECOME - 6 Week transformation journey',
    'become adult': 'BECOME - 6 Week transformation journey',
    'chiisai kai beginners package': 'Chiisai Kai Beginners Package',
    'junior beginner package': 'Junior Beginner Package',
    'blue zone- new beginnings 6 week life change introduction only': 'Blue Zone- New beginnings 6 week life change Introduction only',
    'blue zone new beginnings 6 week life change introduction only': 'Blue Zone- New beginnings 6 week life change Introduction only',
    'combat pilates become': 'Combat Pilates Become'
  };

  return lookup[normalized.toLowerCase()] || normalized;
}

function buildCurrentReportSummary(rows) {
  const summary = {};
  CURRENT_REPORT_ROW_LABELS.forEach(label => {
    summary[label] = { current: 0, hold: 0 };
  });

  (rows || []).forEach(row => {
    const rowLabel = normalizeReportCategory(row.membership_label || row['membership_label'] || '');
    const status = String(row.mbr_status || row['mbr_status'] || '').trim().toUpperCase();

    if (!summary[rowLabel]) return;
    if (status === 'CURRENT') summary[rowLabel].current += 1;
    if (status === 'HOLD') summary[rowLabel].hold += 1;
  });

  return summary;
}

function buildCurrentBeginnerPackageSummary(rows) {
  const summary = {};
  BEGINNER_PACKAGE_LABELS.forEach(label => {
    summary[label] = 0;
  });

  (rows || []).forEach(row => {
    const label = normalizeBeginnerPackageCategory(row.membership_label || row['membership_label'] || '');
    const status = String(row.mbr_status || row['mbr_status'] || '').trim().toUpperCase();
    if (summary[label] !== undefined && status !== 'HOLD') {
      summary[label] += 1;
    }
  });

  return summary;
}

function buildReportSummariesFromWeeklyLogRow(row) {
  const summary = {};
  const memberFields = {
    'Regular Adult': 'regular_adult',
    'Beginner Adult': 'beginner_adult',
    'Concession Adult': 'concession_adult',
    'Chiisai Kai': 'chiisai_kai',
    '8-14 Junior Member': 'kids_8_14',
    '15-17 Junior Member': 'kids_15_17',
    'Blue Zone Fitness ongoing': 'blue_zone',
    'Combat Pilates': 'combat_pilates'
  };
  const beginnerFields = {
    'BECOME - 6 Week transformation journey': 'become_adult',
    'Chiisai Kai Beginners Package': 'become_chiisai',
    'Junior Beginner Package': 'become_kids',
    'Blue Zone- New beginnings 6 week life change Introduction only': 'become_blue_zone',
    'Combat Pilates Become': 'become_c_pilates'
  };

  Object.entries(memberFields).forEach(([label, field]) => {
    summary[label] = { current: Number(row?.[field] || 0), hold: 0 };
  });

  const beginnerSummary = {};
  Object.entries(beginnerFields).forEach(([label, field]) => {
    beginnerSummary[label] = Number(row?.[field] || 0);
  });

  return { summary, beginnerSummary };
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatReportDate(dateValue) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function getTrendBadge(value, label) {
  const abs = Math.abs(value || 0);
  if (value > 0) {
    return `<span class="report-status report-status-up">▲ ${abs} ${label}</span>`;
  }
  if (value < 0) {
    return `<span class="report-status report-status-down">▼ ${abs} ${label}</span>`;
  }
  return `<span class="report-status report-status-neutral">- ${label}</span>`;
}

function getGoalBadge(value) {
  const abs = Math.abs(value || 0);
  if (value > 0) {
    return `<span class="report-status report-status-up">▲ ${abs}</span>`;
  }
  if (value < 0) {
    return `<span class="report-status report-status-down">▼ ${abs}</span>`;
  }
  return `<span class="report-status report-status-neutral">-</span>`;
}

function renderCurrentMondayReportSummary(summary, lastWeekSummary, beginnerSummary, lastWeekBeginnerSummary, reportDate = new Date(), containerId = 'current_mondayReport-content') {
  const currentReportContainer = document.getElementById(containerId);
  if (!currentReportContainer) return;

  const displayDate = formatReportDate(reportDate);

  const memberRows = CURRENT_REPORT_ROW_LABELS.map(label => {
    const current = summary[label]?.current || 0;
    const hold = summary[label]?.hold || 0;
    const previousTotal = lastWeekSummary[label]?.current || 0;
    const deltaValue = current - previousTotal;
    const goal = REPORT_CATEGORY_GOALS[label] || 0;
    const toAchieve = current - goal;
    const weeklyIncome = current * (REPORT_CATEGORY_WEEKLY_FEE[label] || 0);
    const targetIncome = (goal || 0) * (REPORT_CATEGORY_WEEKLY_FEE[label] || 0);

    return {
      label: REPORT_DISPLAY_LABELS[label] || label,
      current,
      delta: Math.abs(deltaValue),
      trend: deltaValue > 0 ? 'up' : deltaValue < 0 ? 'down' : 'neutral',
      holds: hold,
      goal,
      toAchieve,
      weekly: formatMoney(weeklyIncome),
      target: formatMoney(targetIncome),
      totalRow: false
    };
  });

  const memberTotalCurrent = memberRows.reduce((sum, row) => sum + row.current, 0);
  const memberTotalHolds = memberRows.reduce((sum, row) => sum + row.holds, 0);
  const memberTotalGoal = memberRows.reduce((sum, row) => sum + row.goal, 0);
  const memberTotalDelta = memberTotalCurrent - (CURRENT_REPORT_ROW_LABELS.reduce((sum, label) => sum + (lastWeekSummary[label]?.current || 0), 0));

  memberRows.push({
    label: 'MEMBERS TOTALS',
    current: memberTotalCurrent,
    delta: Math.abs(memberTotalDelta),
    trend: memberTotalDelta > 0 ? 'up' : memberTotalDelta < 0 ? 'down' : 'neutral',
    holds: memberTotalHolds,
    goal: memberTotalGoal,
    toAchieve: memberTotalCurrent - memberTotalGoal,
    weekly: '',
    target: '',
    totalRow: true
  });

  const beginnerRows = BEGINNER_PACKAGE_LABELS.map(label => {
    const packageLabel = BEGINNER_PACKAGE_DISPLAY[label] || label;
    const current = beginnerSummary[label] || 0;
    const previous = lastWeekBeginnerSummary[label] || 0;
    const deltaValue = current - previous;
    const goal = BEGINNER_PACKAGE_GOALS[label] || 0;
    const toAchieve = current - goal;
    const incomeValue = current * (BEGINNER_PACKAGE_FEE[label] || 0);
    const rolloverValue = current * (BEGINNER_PACKAGE_ROLLOVER_FEE[label] || 0);

    return {
      label: packageLabel,
      current,
      delta: Math.abs(deltaValue),
      trend: deltaValue > 0 ? 'up' : deltaValue < 0 ? 'down' : 'neutral',
      holds: 0,
      goal,
      toAchieve,
      income: formatMoney(incomeValue),
      rollover: current > 0 ? formatMoney(rolloverValue) : '$0',
      packageIncome: '',
      totalRow: false
    };
  });

  const beginnerTotalCurrent = beginnerRows.reduce((sum, row) => sum + row.current, 0);
  const beginnerTotalGoal = beginnerRows.reduce((sum, row) => sum + row.goal, 0);
  const beginnerTotalDelta = beginnerTotalCurrent - beginnerRows.reduce((sum, row) => sum + (lastWeekBeginnerSummary[BEGINNER_PACKAGE_LABELS[beginnerRows.findIndex(item => item.label === row.label)] ] || 0), 0);
  const beginnerIncomeTotal = beginnerRows.reduce((sum, row) => sum + Number(String(row.income).replace(/[$,]/g, '')), 0);
  const beginnerRolloverTotal = beginnerRows.reduce((sum, row) => sum + Number(String(row.rollover).replace(/[$,]/g, '')), 0);

  beginnerRows.push({
    label: 'BEGINNER TOTALS',
    current: beginnerTotalCurrent,
    delta: Math.abs(beginnerTotalDelta),
    trend: beginnerTotalDelta > 0 ? 'up' : beginnerTotalDelta < 0 ? 'down' : 'neutral',
    holds: 0,
    goal: beginnerTotalGoal,
    toAchieve: beginnerTotalCurrent - beginnerTotalGoal,
    income: formatMoney(beginnerIncomeTotal),
    rollover: formatMoney(beginnerRolloverTotal),
    packageIncome: formatMoney(beginnerIncomeTotal),
    totalRow: true
  });

  const memberTableHtml = memberRows.map(row => `
    <tr class="${row.totalRow ? 'report-summary-total' : ''}">
      <td>${escapeHtml(row.label)}</td>
      <td>${row.current}</td>
      <td>${getTrendBadge(row.trend === 'up' ? row.delta : row.trend === 'down' ? -row.delta : 0, 'since last week')}</td>
      <td>${row.holds}</td>
      <td>${row.goal}</td>
      <td>${getGoalBadge(row.toAchieve)}</td>
      <td>${row.weekly}</td>
      <td>${row.target}</td>
    </tr>
  `).join('');

  const beginnerTableHtml = beginnerRows.map(row => `
    <tr class="${row.totalRow ? 'report-summary-total' : ''}">
      <td>${escapeHtml(row.label)}</td>
      <td>${row.current}</td>
      <td>${getTrendBadge(row.trend === 'up' ? row.delta : row.trend === 'down' ? -row.delta : 0, 'since last week')}</td>
      <td>${row.holds}</td>
      <td>${row.goal}</td>
      <td>${getGoalBadge(row.toAchieve)}</td>
      <td>${row.income}</td>
      <td>${row.rollover}</td>
      <td>${row.packageIncome}</td>
    </tr>
  `).join('');

  currentReportContainer.innerHTML = `
    <div class="report-sheet-shell">
      <div class="report-summary-grid">
        <div class="report-card-panel">
          <table class="report-summary-table report-sheet-table">
            <thead>
              <tr>
                <th>Member Type</th>
                <th>Current #</th>
                <th>Since Last week</th>
                <th>Holds</th>
                <th>Goal #</th>
                <th>To Achieve #</th>
                <th>Current Weekly $</th>
                <th>Target Weekly $</th>
              </tr>
            </thead>
            <tbody>
              ${memberTableHtml}
            </tbody>
          </table>
        </div>
      </div>

      <div class="report-summary-grid report-grid-secondary">
        <div class="report-card-panel">
          <table class="report-summary-table report-sheet-table">
            <thead>
              <tr>
                <th>Become Packages</th>
                <th>Current #</th>
                <th>Since Last week</th>
                <th>Holds</th>
                <th>Goal #</th>
                <th>To Achieve #</th>
                <th>Income</th>
                <th>Roll-over Income</th>
                <th>30 day Package Income</th>
              </tr>
            </thead>
            <tbody>
              ${beginnerTableHtml}
            </tbody>
          </table>
        </div>
      </div>

      <div class="report-metadata">
        <div><strong>Report Date:</strong> ${displayDate}</div>
        <div><strong>Last Updated:</strong> ${new Date(reportDate).toLocaleString('en-CA')}</div>
      </div>
    </div>
  `;
}

function renderLastMondayReportSummary(summary, beginnerSummary, reportDate) {
  const lastReportContainer = document.getElementById('last_mondayReport-content');
  if (!lastReportContainer) return;

  const clonedSummary = JSON.parse(JSON.stringify(summary || {}));
  const clonedBeginnerSummary = JSON.parse(JSON.stringify(beginnerSummary || {}));

  renderCurrentMondayReportSummary(clonedSummary, clonedSummary, clonedBeginnerSummary, clonedBeginnerSummary, reportDate);

  const hasCurrentContainer = document.getElementById('current_mondayReport-content');
  if (hasCurrentContainer) {
    const target = document.getElementById('last_mondayReport-content');
    if (target) {
      target.innerHTML = target.innerHTML;
    }
  }
}

function getReportDateValue(row) {
  return row && (row.report_date || row.archived_at || row.imported_at || row.created_at || 0);
}

function getLogRowSortValue(row) {
  const idValue = Number(row && row.id);
  if (Number.isFinite(idValue)) return idValue;

  const reportDateValue = getReportDateValue(row);
  const timeValue = new Date(`${reportDateValue}T12:00:00`).getTime();
  return Number.isFinite(timeValue) ? timeValue : 0;
}

function getNthSavedSnapshot(logRows, offset = 0) {
  if (!Array.isArray(logRows) || !logRows.length) return [];

  const snapshotRows = logRows
    .filter(row => row.snapshot_label === 'LAST WEEK')
    .sort((a, b) => new Date(getReportDateValue(b)) - new Date(getReportDateValue(a)));

  if (!snapshotRows.length) return [];
  if (offset < 0) return [];

  const targetIndex = offset;
  if (targetIndex >= snapshotRows.length) return [];

  const targetDate = getReportDateValue(snapshotRows[targetIndex]);
  return snapshotRows.filter(row => getReportDateValue(row) === targetDate);
}

function getLatestSavedSnapshot(logRows) {
  return getNthSavedSnapshot(logRows, 0);
}

function getPreviousSavedSnapshot(logRows) {
  return getNthSavedSnapshot(logRows, 1);
}

function getThirdSavedSnapshot(logRows) {
  return getNthSavedSnapshot(logRows, 2);
}

async function loadCurrentMondayReportSummary() {
  const container = document.getElementById('current_mondayReport-content');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading this week report...</div>';

  try {
    const client = await ensureSupabaseDataClient();

    const { data: currentRows, error: currentError } = await client
      .from(MEMBER_LIST_TABLE)
      .select('*');

    if (currentError) throw currentError;

    const { data: previousRows, error: previousError } = await client
      .from(MEMBER_LIST_PREVIOUS_TABLE)
      .select('*');

    const { data: logRows, error: logError } = await client
      .from(MEMBER_LIST_LOG_TABLE)
      .select('*')
      .order('archived_at', { ascending: false });

    if (logError) throw logError;
    if (previousError) {
      console.warn('membership_data_previous unavailable, falling back to log data for comparison.', previousError);
    }

    const previousSnapshotRows = getLatestSavedSnapshot(logRows || []);
    const summary = buildCurrentReportSummary(currentRows || []);
    const lastWeekSummary = buildCurrentReportSummary(previousSnapshotRows.length ? previousSnapshotRows : currentRows || []);
    const beginnerSummary = buildCurrentBeginnerPackageSummary(currentRows || []);
    const lastWeekBeginnerSummary = buildCurrentBeginnerPackageSummary(previousSnapshotRows.length ? previousSnapshotRows : currentRows || []);

    renderCurrentMondayReportSummary(summary, lastWeekSummary, beginnerSummary, lastWeekBeginnerSummary, new Date());
  } catch (error) {
    console.error('Failed to load current Monday report summary:', error);
    container.innerHTML = '<div class="error">' + escapeHtml(error.message || 'Unable to load this week report.') + '</div>';
  }
}

async function loadLastMondayReportSummary() {
  const container = document.getElementById('last_mondayReport-content');
  if (!container) return;

  container.innerHTML = '<div class="loading">Loading last week report...</div>';

  try {
    const client = await ensureSupabaseDataClient();

    const { data: previousRows, error: previousError } = await client
      .from(MEMBER_LIST_PREVIOUS_TABLE)
      .select('*');

    const { data: logRows, error: logError } = await client
      .from(MEMBER_LIST_LOG_TABLE)
      .select('*')
      .order('archived_at', { ascending: false });

    const { data: weeklyLogRows, error: weeklyLogError } = await client
      .from(MEMBER_WEEKLY_LOG_TABLE)
      .select('*')
      .order('id', { ascending: false });

    if (logError) throw logError;
    if (weeklyLogError) throw weeklyLogError;
    if (previousError) {
      console.warn('membership_data_previous unavailable, falling back to log snapshot for last week report.', previousError);
    }

    const reportRows = getLatestSavedSnapshot(logRows || []);
    const comparisonRows = getThirdSavedSnapshot(logRows || []) || getPreviousSavedSnapshot(logRows || []) || reportRows;

    if (!reportRows.length) {
      container.innerHTML = '<div class="empty">No archived last-week report data is available yet.</div>';
      return;
    }

    const reportDate = getReportDateValue(reportRows[0]) || new Date();
    const summary = buildCurrentReportSummary(reportRows);
    const beginnerSummary = buildCurrentBeginnerPackageSummary(reportRows);
    const thirdLatestWeeklyLog = Array.isArray(weeklyLogRows) ? weeklyLogRows[2] : null;
    const weeklyLogSummaries = thirdLatestWeeklyLog
      ? buildReportSummariesFromWeeklyLogRow(thirdLatestWeeklyLog)
      : {
          summary: buildCurrentReportSummary(comparisonRows),
          beginnerSummary: buildCurrentBeginnerPackageSummary(comparisonRows)
        };

    renderCurrentMondayReportSummary(summary, weeklyLogSummaries.summary, beginnerSummary, weeklyLogSummaries.beginnerSummary, reportDate, 'last_mondayReport-content');
  } catch (error) {
    console.error('Failed to load last Monday report summary:', error);
    container.innerHTML = '<div class="error">' + escapeHtml(error.message || 'Unable to load last week report.') + '</div>';
  }
}

function renderMondayBoardCharts(data) {
    const dateCount = Math.max(0, data.columns.length - 2);
    const labels = dashboardDateLabels(data.rows, dateCount);

    const memberTrendChartConfigs = [
        { label: 'Total members', rowLabel: 'MEMBERS TOTALS', borderColor: '#a3272c', backgroundColor: 'rgba(163, 39, 44, 0.12)' },
        { label: 'Regular Adult Members', rowLabel: 'REGULAR ADULT', borderColor: '#306497', backgroundColor: 'rgba(28, 43, 58, 0.12)' },
        { label: 'Beginner', rowLabel: 'BEGINNER', borderColor: '#2f7f7a', backgroundColor: 'rgba(47, 127, 122, 0.12)' },
        { label: 'Concession', rowLabel: 'CONCESSION', borderColor: '#6f00ff', backgroundColor: 'rgba(111, 0, 255, 0.12)' },
        { label: 'Chiisai Kai 4-7', rowLabel: 'CHIISAI KAI 4-7', borderColor: '#d6b50d', backgroundColor: 'rgba(163, 139, 21, 0.12)' },
        { label: 'Kids 8-14', rowLabel: 'KIDS 8-14', borderColor: 'rgb(132, 133, 218)', backgroundColor: 'rgba(132, 133, 218, 0.12)' },
        { label: 'Kids 15-17', rowLabel: 'KIDS 15-17', borderColor: 'rgb(154, 77, 157)', backgroundColor: 'rgba(154, 77, 157, 0.12)' },
        { label: 'Blue Zone', rowLabel: 'BLUE ZONE', borderColor: 'rgb(0, 4, 255)', backgroundColor: 'rgba(0, 4, 255, 0.12)' },
        { label: 'Combat Pilates', rowLabel: 'COMBAT PILATES', borderColor: 'rgb(137, 73, 0)', backgroundColor: 'rgba(137, 73, 0, 0.12)' }
    ];

    const memberRows = data.rows.filter(row => {
        const label = String(dashboardCell(row, 0) || '');
        return label && !label.includes('TOTALS') && !label.startsWith('Become');
    });
    const beginnerRows = data.rows.filter(row => String(dashboardCell(row, 0) || '').startsWith('Become'));

    const memberTrendDatasets = memberTrendChartConfigs.map(config => ({
        label: config.label,
        data: valuesForRow(findDashboardRow(data.rows, config.rowLabel), dateCount),
        borderColor: config.borderColor,
        backgroundColor: config.backgroundColor,
        fill: true,
        tension: 0.3
    }));

    new Chart(document.getElementById('membersTrendChart'), {
        type: 'line',
        data: {
        labels,
        datasets: memberTrendDatasets
        },
        options: chartOptions('Members by week')
    });

        new Chart(document.getElementById('beginnerTrendChart'), {
        type: 'line',
        data: {
        labels,
        datasets: beginnerRows.map((row, index) => ({
            label: dashboardCell(row, 0),
            data: valuesForRow(row, dateCount),
            borderColor: chartColors(beginnerRows.length)[index],
            backgroundColor: 'transparent',
            tension: 0.3
        }))
        },
        options: chartOptions('Beginner progression')
    });

    new Chart(document.getElementById('membershipBreakdownChart'), {
        type: 'doughnut',
        data: {
        labels: memberRows.map(row => dashboardCell(row, 0)),
        datasets: [{
            data: memberRows.map(row => dashboardCell(row, 1)),
            backgroundColor: chartColors(memberRows.length),
            borderWidth: 2,
            borderColor: '#ffffff'
        }]
        },
        options: chartOptions('Current membership breakdown')
    });

        new Chart(document.getElementById('beginnerBreakdownChart'), {
        type: 'doughnut',
        data: {
        labels: beginnerRows.map(row => dashboardCell(row, 0)),
        datasets: [{
            data: beginnerRows.map(row => dashboardCell(row, 1)),
            backgroundColor: chartColors(beginnerRows.length),
            borderWidth: 2,
            borderColor: '#ffffff'
        }]
        },
        options: chartOptions('Current beginner packages breakdown')
    });

    document.querySelectorAll('.chart-card .loading').forEach(loading => loading.remove());
}

function renderMondayBoardChartsFromLog(logRows) {
    if (!Array.isArray(logRows) || !logRows.length) {
        throw new Error('No weekly log data available.');
    }

    const labels = logRows.map(row => formatReportDate(row.report_date));

    const memberTrendConfigs = [
        { label: 'Total members', key: 'members_total', color: '#a3272c', bg: 'rgba(163, 39, 44, 0.12)' },
        { label: 'Regular Adult Members', key: 'regular_adult', color: '#306497', bg: 'rgba(28, 43, 58, 0.12)' },
        { label: 'Beginner', key: 'beginner_adult', color: '#2f7f7a', bg: 'rgba(47, 127, 122, 0.12)' },
        { label: 'Concession', key: 'concession_adult', color: '#6f00ff', bg: 'rgba(111, 0, 255, 0.12)' },
        { label: 'Chiisai Kai 4-7', key: 'chiisai_kai', color: '#d6b50d', bg: 'rgba(163, 139, 21, 0.12)' },
        { label: 'Kids 8-14', key: 'kids_8_14', color: 'rgb(132, 133, 218)', bg: 'rgba(132, 133, 218, 0.12)' },
        { label: 'Kids 15-17', key: 'kids_15_17', color: 'rgb(154, 77, 157)', bg: 'rgba(154, 77, 157, 0.12)' },
        { label: 'Blue Zone', key: 'blue_zone', color: 'rgb(0, 4, 255)', bg: 'rgba(0, 4, 255, 0.12)' },
        { label: 'Combat Pilates', key: 'combat_pilates', color: 'rgb(137, 73, 0)', bg: 'rgba(137, 73, 0, 0.12)' }
    ];

    const beginnerTrendConfigs = [
        { label: 'Become Adult', key: 'become_adult', color: '#a3272c' },
        { label: 'Become Chiisai', key: 'become_chiisai', color: '#306497' },
        { label: 'Become Kids', key: 'become_kids', color: '#2f7f7a' },
        { label: 'Become Blue Zone', key: 'become_blue_zone', color: '#d6b50d' },
        { label: 'Become C-Pilates', key: 'become_c_pilates', color: '#6f00ff' }
    ];

    const memberRows = [
        { label: 'Regular Adult', value: Number(logRows[logRows.length - 1]?.regular_adult || 0) },
        { label: 'Beginner', value: Number(logRows[logRows.length - 1]?.beginner_adult || 0) },
        { label: 'Concession', value: Number(logRows[logRows.length - 1]?.concession_adult || 0) },
        { label: 'Chiisai Kai 4-7', value: Number(logRows[logRows.length - 1]?.chiisai_kai || 0) },
        { label: 'Kids 8-14', value: Number(logRows[logRows.length - 1]?.kids_8_14 || 0) },
        { label: 'Kids 15-17', value: Number(logRows[logRows.length - 1]?.kids_15_17 || 0) },
        { label: 'Blue Zone', value: Number(logRows[logRows.length - 1]?.blue_zone || 0) },
        { label: 'Combat Pilates', value: Number(logRows[logRows.length - 1]?.combat_pilates || 0) }
    ];

    const beginnerRows = [
        { label: 'Become Adult', value: Number(logRows[logRows.length - 1]?.become_adult || 0) },
        { label: 'Become Chiisai', value: Number(logRows[logRows.length - 1]?.become_chiisai || 0) },
        { label: 'Become Kids', value: Number(logRows[logRows.length - 1]?.become_kids || 0) },
        { label: 'Become Blue Zone', value: Number(logRows[logRows.length - 1]?.become_blue_zone || 0) },
        { label: 'Become C-Pilates', value: Number(logRows[logRows.length - 1]?.become_c_pilates || 0) }
    ];

    new Chart(document.getElementById('membersTrendChart'), {
        type: 'line',
        data: {
            labels,
            datasets: memberTrendConfigs.map(config => ({
                label: config.label,
                data: logRows.map(row => Number(row[config.key] || 0)),
                borderColor: config.color,
                backgroundColor: config.bg,
                fill: true,
                tension: 0.3
            }))
        },
        options: chartOptions('Members by week')
    });

    new Chart(document.getElementById('beginnerTrendChart'), {
        type: 'line',
        data: {
            labels,
            datasets: beginnerTrendConfigs.map((config, index) => ({
                label: config.label,
                data: logRows.map(row => Number(row[config.key] || 0)),
                borderColor: chartColors(beginnerTrendConfigs.length)[index],
                backgroundColor: 'transparent',
                tension: 0.3
            }))
        },
        options: chartOptions('Beginner progression')
    });

    new Chart(document.getElementById('membershipBreakdownChart'), {
        type: 'doughnut',
        data: {
            labels: memberRows.map(row => row.label),
            datasets: [{
                data: memberRows.map(row => row.value),
                backgroundColor: chartColors(memberRows.length),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: chartOptions('Current membership breakdown')
    });

    new Chart(document.getElementById('beginnerBreakdownChart'), {
        type: 'doughnut',
        data: {
            labels: beginnerRows.map(row => row.label),
            datasets: [{
                data: beginnerRows.map(row => row.value),
                backgroundColor: chartColors(beginnerRows.length),
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: chartOptions('Current beginner packages breakdown')
    });

    document.querySelectorAll('.chart-card .loading').forEach(loading => loading.remove());
}

async function loadOverviewFromWeeklyLog() {
  const client = await ensureSupabaseDataClient();
  const { data, error } = await client
    .from(MEMBER_WEEKLY_LOG_TABLE)
    .select('*')
    .order('report_date', { ascending: true });

  if (error) throw error;
  if (!data || !data.length) throw new Error('No weekly log data found in Supabase.');

  renderMondayBoardChartsFromLog(data);
}

function chartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
        legend: { position: 'bottom' },
        title: { display: true, text: title, color: '#1c2b3a', font: { size: 16 } }
        },
        scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
        }
    };
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const currentMemberListState = {
  headers: [],
  rows: []
};

function updateCurrentMemberFilterOptions(headers) {
  const fieldSelect = document.getElementById('memberFilterField');
  if (!fieldSelect) return;

  const previousValue = fieldSelect.value || 'all';
  const fieldLabels = ['all', ...headers.filter(Boolean)];

  fieldSelect.innerHTML = fieldLabels.map(label => {
    const text = label === 'all' ? 'All columns' : label;
    return '<option value="' + escapeHtml(label) + '">' + escapeHtml(text) + '</option>';
  }).join('');

  if (fieldLabels.includes(previousValue)) {
    fieldSelect.value = previousValue;
  } else {
    fieldSelect.value = 'all';
  }

  updateCurrentMemberFilterSuggestions();
}

function updateCurrentMemberFilterSuggestions() {
  const fieldSelect = document.getElementById('memberFilterField');
  const datalist = document.getElementById('memberFilterValueList');
  const valueInput = document.getElementById('memberFilterValue');
  if (!datalist || !fieldSelect || !valueInput) return;

  const selectedField = fieldSelect.value;
  if (selectedField === 'all') {
    datalist.innerHTML = '';
    valueInput.placeholder = 'Choose a value';
    return;
  }

  const uniqueValues = new Set();
  currentMemberListState.rows.forEach(row => {
    const headerIndex = currentMemberListState.headers.indexOf(selectedField);
    if (headerIndex === -1) return;
    const value = row[headerIndex];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      uniqueValues.add(String(value).trim());
    }
  });

  const values = Array.from(uniqueValues).sort((a, b) => a.localeCompare(b));
  datalist.innerHTML = values.map(value => '<option value="' + escapeHtml(value) + '"></option>').join('');
  valueInput.placeholder = `Choose a ${selectedField} value`;
}

function getCurrentFilteredMemberRows() {
  const fieldSelect = document.getElementById('memberFilterField');
  const filterValueInput = document.getElementById('memberFilterValue');
  const nameInput = document.getElementById('memberNameFilter');

  if (!currentMemberListState.rows.length) return [];

  const selectedField = fieldSelect ? fieldSelect.value : 'all';
  const filterText = filterValueInput ? filterValueInput.value.trim().toLowerCase() : '';
  const nameText = nameInput ? nameInput.value.trim().toLowerCase() : '';

  return currentMemberListState.rows.filter(row => {
    const valueMap = {};
    currentMemberListState.headers.forEach((header, index) => {
      valueMap[header] = row[index] !== null && row[index] !== undefined ? String(row[index]) : '';
    });

    const rowName = [valueMap.first_name || '', valueMap.last_name || ''].join(' ').trim().toLowerCase();
    const matchesName = !nameText || rowName.includes(nameText);

    if (!matchesName) return false;

    if (!filterText) return true;

    if (selectedField === 'all') {
      return Object.values(valueMap).some(value => value.toLowerCase().includes(filterText));
    }

    const columnValue = String(valueMap[selectedField] || '').trim().toLowerCase();
    return columnValue === filterText || columnValue.includes(filterText);
  });
}

function renderCurrentMemberListWithFilters() {
  const container = document.getElementById('current_memberList-wrap');
  const countLabel = document.getElementById('currentMemberCountLabel');
  if (!container) return;

  const filteredRows = getCurrentFilteredMemberRows();
  if (countLabel) {
    countLabel.textContent = `${filteredRows.length} members shown`;
  }

  renderTable(container, {
    headers: currentMemberListState.headers,
    rows: filteredRows
  });
}

function toggleCurrentMemberFilters() {
  const fieldSelect = document.getElementById('memberFilterField');
  const filterValueInput = document.getElementById('memberFilterValue');
  const nameInput = document.getElementById('memberNameFilter');

  if (!fieldSelect || !filterValueInput || !nameInput) return;

  const listeners = [fieldSelect, filterValueInput, nameInput];
  listeners.forEach(input => {
    input.oninput = () => {
      if (input === fieldSelect) {
        updateCurrentMemberFilterSuggestions();
      }
      renderCurrentMemberListWithFilters();
    };

    if (input === filterValueInput) {
      input.onfocus = () => {
        if (fieldSelect.value !== 'all') {
          input.click();
        }
      };
    }
  });

  document.querySelectorAll('.member-clear-btn').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-clear-target');
      const target = document.getElementById(targetId);
      if (!target) return;
      target.value = '';
      target.dispatchEvent(new Event('input'));
      target.focus();
    });
  });
}

function renderTable(container, block) {
  if (!block.rows.length) {
    container.innerHTML = '<div class="empty">No data found.</div>';
    return;
  }
  let html = '<table class="filterable"><thead><tr>';
  block.headers.forEach(h => { html += '<th>' + escapeHtml(h) + '</th>'; });
  html += '</tr></thead><tbody>';
  block.rows.forEach(row => {
    html += '<tr>';
    row.forEach((cell, c) => {
      html += '<td>' + escapeHtml(cell) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function showError(elId, err) {
  document.getElementById(elId).innerHTML = '<div class="error">' + escapeHtml(err.message || err) + '</div>';
}

function loadMondayPage(key) {
  const config = MONDAY_PAGE_CONFIGS[key];
  fetchMondaySheetRaw(config.sheetName).then(rawRows => {
    const colStartIdx = (config.dataStartCol || 1) - 1; // Default to 1 (column A) if not specified, convert to 0-indexed
    const headerRowData = rawRows[config.headerRow - 1] || [];
    const headers = headerRowData.slice(colStartIdx).filter(h => h); // Extract headers starting from dataStartCol
    const rows = rawRows.slice(config.dataStartRow - 1)
      .map(row => normalizeRow(row, colStartIdx + headers.length).slice(colStartIdx, colStartIdx + headers.length))
      .filter(r => r.some(cell => cell !== '' && cell !== null && cell !== undefined));
    renderTable(document.getElementById(key + '-wrap'), { headers, rows });
  }).catch(err => showError(key + '-wrap', err));
}

const loadedTabs = {};
function loadMondayTab(key) {
  if (loadedTabs[key]) return;
  loadedTabs[key] = true;
  if (key === 'overview') {
     loadOverviewFromWeeklyLog()
       .catch(() => {
         return fetchMondayBoardDashboard().then(renderMondayBoardCharts).catch(error => {
           document.querySelectorAll('.chart-card .loading').forEach(loading => {
             loading.textContent = error.message;
             loading.classList.add('error');
           });
         });
       });
  } else if (key === 'current_mondayReport') {
    loadCurrentMondayReportSummary();
  } else if (key === 'last_mondayReport') {
    loadLastMondayReportSummary();
  } else if (key === 'current_memberList') {
    loadSupabaseMemberList(key);
  } else if (key === 'memberHistoryLog') {
    loadMemberHistoryLog();
  } else {
    loadMondayPage(key);
  }
}

function initMondayBoardPage() {
    if (!document.getElementById('membersTrendChart')) return;

    const updatedLine = document.getElementById('updatedLine');
    if (updatedLine) {
      const now = new Date();
      updatedLine.textContent = 'Last updated: ' + now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    }

    initCsvUploadControls();

    const navButtons = document.querySelectorAll('nav.site-nav button');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
            loadMondayTab(btn.dataset.tab);
        });
    });

    loadMondayTab('overview');
    loadSupabaseMemberListHistory();
    loadMemberHistoryLog();
}

initMondayBoardPage();
