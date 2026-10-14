const MONDAY_BOARD_SHEET_NAME = 'DASHBOARD';
const PREFERRED_BEGINNER_PACKAGE_LABELS = TARGET_BEGINNER_PACKAGES;

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

function getMemberLogSnapshotRows(logRows) {
  if (!Array.isArray(logRows) || !logRows.length) return [];
  const snapshotRows = logRows.filter(row => row.snapshot_label === 'LAST WEEK');
  if (!snapshotRows.length) return [];

  const previousRows = getPreviousSavedSnapshot(snapshotRows);
  if (previousRows.length) return previousRows;

  return getLatestSavedSnapshot(snapshotRows);
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

    html += '<td data-requires="monday.edit">' +
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

let pendingCsvFile = null;

function setUploadProgress(percent, label) {
  const bar = document.getElementById('csvProgressBar');
  const text = document.getElementById('csvProgressText');

  if (bar) bar.style.transform = `scaleX(${Math.min(100, Math.max(0, percent)) / 100})`;
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
  if (!reportDateValue) {
    if (statusEl) statusEl.textContent = 'Choose a report date before uploading.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Processing CSV...';
  setUploadProgress(8, '8%');

  try {
    const text = await file.text();
    setUploadProgress(24, '24%');
    const client = await ensureSupabaseDataClient();
    const cleanRows = await mondayImportCsv(client, text, reportDateValue, percent => setUploadProgress(percent, `${percent}%`));
    setUploadProgress(100, '100%');

    if (statusEl) statusEl.textContent = `${cleanRows.length} rows imported successfully.`;
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

// Starts the Zen Planner job through supabase/functions/run-pastdue-sync; it takes about 2 minutes.
async function startMondaySync(button) {
  const statusEl = document.getElementById('csvUploadStatus');
  button.disabled = true;
  if (statusEl) statusEl.textContent = 'Starting sync…';
  try {
    const client = await ensureSupabaseDataClient();
    const { error } = await client.functions.invoke('run-pastdue-sync', { body: { job: 'monday' } });
    if (error) throw new Error(await error.context?.text?.().catch(() => '') || error.message);
    if (statusEl) statusEl.textContent = 'Sync started. This week\'s report will update in about 3 minutes; refresh the page then.';
  } catch (error) {
    if (statusEl) statusEl.textContent = error.message || 'Could not start the sync.';
  } finally {
    button.disabled = false;
  }
}

function initCsvUploadControls() {
  document.getElementById('mondaySyncBtn')?.addEventListener('click', event => startMondaySync(event.currentTarget));
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
      if (!reportDateValue) {
        if (statusEl) statusEl.textContent = 'Choose a report date before confirming the upload.';
        if (dateInput) dateInput.focus();
        return;
      }
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
    const colors = ['#2F3237', '#7C2D2E', '#2F6B4A', '#C8961E', '#82A5E0', '#C77B6B', '#7A5C9E', '#8A5D0C'];
    return Array.from({ length: count }, (_, index) => colors[index % colors.length]);
}

// NOTE: These are `let` so Supabase pricing_settings can override them at runtime.
// Default values are preserved in DEFAULT_* copies for the reset feature.
let REPORT_CATEGORY_GOALS = {
  'Regular Adult': 100,
  'Beginner Adult': 15,
  'Concession Adult': 15,
  'Chiisai Kai': 20,
  '8-14 Junior Member': 50,
  '15-17 Junior Member': 20,
  'Blue Zone Fitness ongoing': 20,
  'Combat Pilates': 15
};

let REPORT_CATEGORY_WEEKLY_FEE = {
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

let BEGINNER_PACKAGE_GOALS = {
  'BECOME - 6 Week transformation journey': 10,
  'Chiisai Kai Beginners Package': 10,
  'Junior Beginner Package': 10,
  'Blue Zone- New beginnings 6 week life change Introduction only': 10,
  'Combat Pilates Become': 15
};

let BEGINNER_PACKAGE_FEE = {
  'BECOME - 6 Week transformation journey': 300,
  'Chiisai Kai Beginners Package': 300,
  'Junior Beginner Package': 300,
  'Blue Zone- New beginnings 6 week life change Introduction only': 300,
  'Combat Pilates Become': 300
};

let BEGINNER_PACKAGE_ROLLOVER_FEE = {
  'BECOME - 6 Week transformation journey': 45,
  'Chiisai Kai Beginners Package': 45,
  'Junior Beginner Package': 45,
  'Blue Zone- New beginnings 6 week life change Introduction only': 45,
  'Combat Pilates Become': 45
};

// Frozen default copies — used by the "Reset to default" button
const DEFAULT_REPORT_CATEGORY_GOALS       = Object.freeze({ ...REPORT_CATEGORY_GOALS });
const DEFAULT_REPORT_CATEGORY_WEEKLY_FEE  = Object.freeze({ ...REPORT_CATEGORY_WEEKLY_FEE });
const DEFAULT_BEGINNER_PACKAGE_GOALS      = Object.freeze({ ...BEGINNER_PACKAGE_GOALS });
const DEFAULT_BEGINNER_PACKAGE_FEE        = Object.freeze({ ...BEGINNER_PACKAGE_FEE });
const DEFAULT_BEGINNER_PACKAGE_ROLLOVER_FEE = Object.freeze({ ...BEGINNER_PACKAGE_ROLLOVER_FEE });

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
  return `$${Number(amount).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatReportDate(dateValue) {
  if (!dateValue) return '—';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getTrendBadge(value) {
  const abs = Math.abs(value || 0);
  if (value > 0) {
    return `<span class="report-status report-status-up"><span class="sr-only">Up </span>${abs}</span>`;
  }
  if (value < 0) {
    return `<span class="report-status report-status-down"><span class="sr-only">Down </span>${abs}</span>`;
  }
  return '<span class="report-muted" aria-label="No change">—</span>';
}

// Short of goal: how many to go, as plain text. At or over goal: a green "Met" mark.
function getToAchieveCell(value) {
  if (value < 0) return `${Math.abs(value)}`;
  return `<span class="report-status report-status-up">Met${value > 0 ? ` +${value}` : ''}</span>`;
}

function getGoalBadge(value) {
  const abs = Math.abs(value || 0);
  if (value > 0) {
    return `<span class="report-status report-status-up"><span class="sr-only">Up </span>${abs}</span>`;
  }
  if (value < 0) {
    return `<span class="report-status report-status-down"><span class="sr-only">Down </span>${abs}</span>`;
  }
  return `<span class="report-status report-status-neutral">-</span>`;
}

function renderCurrentMondayReportSummary(summary, lastWeekSummary, beginnerSummary, lastWeekBeginnerSummary, reportDate = new Date(), containerId = 'current_mondayReport-content') {
  const currentReportContainer = document.getElementById(containerId);
  if (!currentReportContainer) return;

  const reportDay = new Date(String(reportDate).length === 10 ? `${reportDate}T12:00:00` : reportDate);
  const displayDate = Number.isNaN(reportDay.getTime())
    ? formatReportDate(reportDate)
    : reportDay.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
      weeklyValue: weeklyIncome,
      targetValue: targetIncome,
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
    weekly: formatMoney(memberRows.reduce((sum, row) => sum + row.weeklyValue, 0)),
    target: formatMoney(memberRows.reduce((sum, row) => sum + row.targetValue, 0)),
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
    totalRow: true
  });

  // Both tables share these columns, so they line up; the last two differ per table.
  const sharedColumns = ['Current #', 'Since last week', 'Holds', 'Goal #', 'To achieve #'];
  const tableHtml = (title, moneyColumns, rows, money) => `
    <div class="report-card-panel">
      <table class="report-summary-table report-sheet-table stack">
        <colgroup><col class="report-col-label">${'<col>'.repeat(7)}</colgroup>
        <thead><tr><th>${title}</th>${[...sharedColumns, ...moneyColumns].map(name => `<th>${name}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => {
          const cells = [row.current, getTrendBadge(row.trend === 'up' ? row.delta : row.trend === 'down' ? -row.delta : 0), row.holds, row.goal, getToAchieveCell(row.toAchieve), ...money(row)];
          return `
          <tr class="${row.totalRow ? 'report-summary-total' : ''}">
            <td>${escapeHtml(row.label)}</td>
            ${cells.map((cell, index) => `<td data-label="${[...sharedColumns, ...moneyColumns][index]}">${cell}</td>`).join('')}
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>`;

  currentReportContainer.innerHTML = `
    <div class="report-sheet-shell">
      <p class="report-metadata">Report for <strong>${displayDate}</strong></p>
      ${tableHtml('Member type', ['Current weekly $', 'Target weekly $'], memberRows, row => [row.weekly, row.target])}
      ${tableHtml('Become packages', ['Income', 'Roll-over income'], beginnerRows, row => [row.income, row.rollover])}
    </div>
  `;
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

    renderCurrentMondayReportSummary(summary, lastWeekSummary, beginnerSummary, lastWeekBeginnerSummary, currentRows?.[0]?.report_date || new Date());
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
    // The sheet pre-fills future week columns; stop the x-axis at the last week with a total.
    const columnCount = Math.max(0, data.columns.length - 2);
    const totals = valuesForRow(findDashboardRow(data.rows, 'MEMBERS TOTALS'), columnCount);
    const lastFilled = totals.findLastIndex(value => value !== null && value !== undefined && value !== '');
    const dateCount = lastFilled >= 0 ? lastFilled + 1 : columnCount;
    const labels = dashboardDateLabels(data.rows, dateCount);
    renderMondayKeyFigure({ members_total: totals[dateCount - 1] }, dateCount > 1 ? { members_total: totals[dateCount - 2] } : null);

    const memberTrendChartConfigs = [
        { label: 'Total members', rowLabel: 'MEMBERS TOTALS', borderColor: '#2F3237', backgroundColor: 'rgba(47, 50, 55, 0.06)' },
        { label: 'Regular Adult Members', rowLabel: 'REGULAR ADULT', borderColor: '#7C2D2E', backgroundColor: 'rgba(124, 45, 46, 0.06)' },
        { label: 'Beginner', rowLabel: 'BEGINNER', borderColor: '#2F6B4A', backgroundColor: 'rgba(47, 107, 74, 0.07)' },
        { label: 'Concession', rowLabel: 'CONCESSION', borderColor: '#7A5C9E', backgroundColor: 'rgba(122, 92, 158, 0.07)' },
        { label: 'Chiisai Kai 4-7', rowLabel: 'CHIISAI KAI 4-7', borderColor: '#C8961E', backgroundColor: 'rgba(200, 150, 30, 0.07)' },
        { label: 'Kids 8-14', rowLabel: 'KIDS 8-14', borderColor: '#82A5E0', backgroundColor: 'rgba(130, 165, 224, 0.10)' },
        { label: 'Kids 15-17', rowLabel: 'KIDS 15-17', borderColor: '#C77B6B', backgroundColor: 'rgba(199, 123, 107, 0.08)' },
        { label: 'Blue Zone', rowLabel: 'BLUE ZONE', borderColor: '#3E8E9A', backgroundColor: 'rgba(62, 142, 154, 0.07)' },
        { label: 'Combat Pilates', rowLabel: 'COMBAT PILATES', borderColor: '#8A5D0C', backgroundColor: 'rgba(138, 93, 12, 0.07)' }
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
        options: chartOptions('Current membership breakdown', 'doughnut')
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
        options: chartOptions('Current beginner packages breakdown', 'doughnut')
    });

    document.querySelectorAll('.chart-card .loading').forEach(loading => loading.remove());
}

// Series on the Overview charts. Total only has a trend line, not a doughnut slice.
const MONDAY_MEMBER_SERIES = [
    { label: 'Total members', key: 'members_total', color: '#2F3237', bg: 'rgba(47, 50, 55, 0.06)', total: true },
    { label: 'Regular Adult', key: 'regular_adult', color: '#7C2D2E', bg: 'rgba(124, 45, 46, 0.06)' },
    { label: 'Beginner', key: 'beginner_adult', color: '#2F6B4A', bg: 'rgba(47, 107, 74, 0.07)' },
    { label: 'Concession', key: 'concession_adult', color: '#7A5C9E', bg: 'rgba(122, 92, 158, 0.07)' },
    { label: 'Chiisai Kai 4-7', key: 'chiisai_kai', color: '#C8961E', bg: 'rgba(200, 150, 30, 0.07)' },
    { label: 'Kids 8-14', key: 'kids_8_14', color: '#82A5E0', bg: 'rgba(130, 165, 224, 0.10)' },
    { label: 'Kids 15-17', key: 'kids_15_17', color: '#C77B6B', bg: 'rgba(199, 123, 107, 0.08)' },
    { label: 'Blue Zone', key: 'blue_zone', color: '#3E8E9A', bg: 'rgba(62, 142, 154, 0.07)' },
    { label: 'Combat Pilates', key: 'combat_pilates', color: '#8A5D0C', bg: 'rgba(138, 93, 12, 0.07)' }
];
const MONDAY_BEGINNER_SERIES = [
    { label: 'Become Adult', key: 'become_adult' },
    { label: 'Become Chiisai', key: 'become_chiisai' },
    { label: 'Become Kids', key: 'become_kids' },
    { label: 'Become Blue Zone', key: 'become_blue_zone' },
    { label: 'Become C-Pilates', key: 'become_c_pilates' }
];

let mondayLogRows = [];

function drawChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    Chart.getChart(canvas)?.destroy();
    new Chart(canvas, config);
}

// logRows: weekly log rows, oldest first. keys: the series to show (all when omitted).
function renderMondayBoardChartsFromLog(logRows, keys = null) {
    const show = series => !keys || keys.has(series.key);
    const members = MONDAY_MEMBER_SERIES.filter(show);
    const beginners = MONDAY_BEGINNER_SERIES.filter(show);
    const latest = logRows[logRows.length - 1] || {};
    const value = (row, key) => Number(row?.[key] || 0);
    const labels = logRows.map(row => formatReportDate(row.report_date));

    renderMondayKeyFigure(latest, logRows.length > 1 ? logRows[logRows.length - 2] : null);

    // The total sits on its own chart so the membership types below keep a readable scale.
    const total = MONDAY_MEMBER_SERIES.find(series => series.total);
    drawChart('totalTrendChart', {
        type: 'line',
        data: { labels, datasets: [{ label: total.label, data: logRows.map(row => value(row, total.key)), borderColor: total.color, backgroundColor: total.bg, fill: true, tension: 0.3 }] },
        options: { ...chartOptions('Total members'), plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }, y: { ticks: { precision: 0 } } } }
    });

    drawChart('membersTrendChart', {
        type: 'line',
        data: {
            labels,
            datasets: members.filter(series => !series.total).map(series => ({
                label: series.label,
                data: logRows.map(row => value(row, series.key)),
                borderColor: series.color,
                backgroundColor: series.bg,
                fill: true,
                tension: 0.3
            }))
        },
        options: chartOptions('Members by week')
    });

    const beginnerColors = chartColors(MONDAY_BEGINNER_SERIES.length);
    drawChart('beginnerTrendChart', {
        type: 'line',
        data: {
            labels,
            datasets: beginners.map(series => ({
                label: series.label,
                data: logRows.map(row => value(row, series.key)),
                borderColor: beginnerColors[MONDAY_BEGINNER_SERIES.indexOf(series)],
                backgroundColor: 'transparent',
                tension: 0.3
            }))
        },
        options: chartOptions('Beginner progression')
    });

    const slices = members.filter(series => !series.total);
    drawChart('membershipBreakdownChart', {
        type: 'doughnut',
        data: {
            labels: slices.map(series => series.label),
            datasets: [{ data: slices.map(series => value(latest, series.key)), backgroundColor: chartColors(slices.length), borderWidth: 2, borderColor: '#ffffff' }]
        },
        options: chartOptions('Current membership breakdown', 'doughnut')
    });

    drawChart('beginnerBreakdownChart', {
        type: 'doughnut',
        data: {
            labels: beginners.map(series => series.label),
            datasets: [{ data: beginners.map(series => value(latest, series.key)), backgroundColor: chartColors(beginners.length), borderWidth: 2, borderColor: '#ffffff' }]
        },
        options: chartOptions('Current beginner packages breakdown', 'doughnut')
    });

    document.querySelectorAll('.chart-card .loading').forEach(loading => loading.remove());
}

// Overview filters: weeks between From and To (report dates), and the ticked membership types.
function applyOverviewFilters() {
    const from = document.getElementById('overviewFrom')?.value || '';
    const to = document.getElementById('overviewTo')?.value || '';
    const boxes = [...document.querySelectorAll('#overviewTypes input')];
    const keys = new Set(boxes.filter(box => box.checked).map(box => box.value));
    const rows = mondayLogRows.filter(row => {
        const date = String(row.report_date || '').slice(0, 10);
        return (!from || date >= from) && (!to || date <= to);
    });

    const weekStart = weeks => String(mondayLogRows[Math.max(0, mondayLogRows.length - weeks)]?.report_date || '').slice(0, 10);
    document.querySelectorAll('#overviewRange button').forEach(button => {
        const weeks = Number(button.dataset.weeks);
        button.setAttribute('aria-pressed', String(!to && (weeks ? from === weekStart(weeks) : !from)));
    });

    const count = document.getElementById('overviewTypesCount');
    if (count) count.textContent = keys.size === boxes.length ? 'All' : `${keys.size} of ${boxes.length}`;
    const status = document.getElementById('overviewFilterStatus');
    if (status) {
        status.textContent = !rows.length
            ? 'No weeks in this date range.'
            : rows.length === mondayLogRows.length
                ? `All ${rows.length} weeks.`
                : `${rows.length} of ${mondayLogRows.length} weeks: ${formatReportDate(rows[0].report_date)} to ${formatReportDate(rows[rows.length - 1].report_date)}.`;
    }
    renderMondayBoardChartsFromLog(rows, keys);
}

function initOverviewFilters() {
    const form = document.getElementById('overviewFilters');
    const list = document.getElementById('overviewTypes');
    if (!form || !list || list.childElementCount) return;
    const group = (title, series) => `<fieldset><legend>${title}</legend>${series.map(item =>
        `<label><input type="checkbox" value="${item.key}" checked> ${escapeHtml(item.label)}</label>`).join('')}</fieldset>`;
    list.innerHTML = group('Members', MONDAY_MEMBER_SERIES) + group('Become packages', MONDAY_BEGINNER_SERIES);
    form.addEventListener('change', applyOverviewFilters);
    // Presets: start the range N weeks back from the latest report.
    document.getElementById('overviewRange')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-weeks]');
        if (!button) return;
        const weeks = Number(button.dataset.weeks);
        document.getElementById('overviewFrom').value = weeks ? String(mondayLogRows[Math.max(0, mondayLogRows.length - weeks)]?.report_date || '').slice(0, 10) : '';
        document.getElementById('overviewTo').value = '';
        applyOverviewFilters();
    });
    form.addEventListener('submit', event => event.preventDefault());
    // Reset fires before the fields clear, so redraw on the next tick.
    form.addEventListener('reset', () => setTimeout(applyOverviewFilters));
}

async function loadOverviewFromWeeklyLog() {
  const client = await ensureSupabaseDataClient();
  const { data, error } = await client
    .from(MEMBER_WEEKLY_LOG_TABLE)
    .select('*')
    .order('report_date', { ascending: true });

  if (error) throw error;
  if (!data || !data.length) throw new Error('No weekly log data found in Supabase.');

  mondayLogRows = data;
  initOverviewFilters();
  applyOverviewFilters();
}

// latest / previous: the last two weekly log rows. Each figure carries its change on last week.
function renderMondayKeyFigure(latest, previous) {
    const el = document.getElementById('mondayKeyFigure');
    if (!el || latest?.members_total === null || latest?.members_total === undefined || latest.members_total === '') return;
    const card = (label, key, extraClass = '') => {
        if (latest[key] === undefined || latest[key] === null) return '';
        const now = Number(latest[key]) || 0;
        const before = previous ? Number(previous[key]) || 0 : null;
        const change = before === null ? '' : `<small class="metric-change">${getGoalBadge(now - before)} vs ${before} last week</small>`;
        return `<div class="past-due-metric${extraClass}"><span>${label}</span><strong>${now}${change}</strong></div>`;
    };
    el.innerHTML = card('Total members this week', 'members_total', ' key') +
        card('Beginners on packages', 'beginner_totals') +
        card('Regular adults', 'regular_adult');
}

function chartOptions(title, type = 'line') {
    // The card heading already names the chart, so Chart.js draws no title of its own.
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 10, font: { size: 11 } } },
        title: { display: false, text: title }
        },
        // Doughnuts have no axes; a y scale draws a stray 0–1 grid behind them.
        ...(type === 'doughnut' ? {} : { scales: {
            x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
            y: { beginAtZero: true, ticks: { precision: 0 } }
        } })
    };
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Current Member List ─────────────────────────────────────────────────────
// One table, four views: current members, joined this week, left since last
// week, and last week's list. Filters, sort and export act on the active view.

const MEMBER_HIDDEN_COLUMNS = new Set(['id', 'report_date', 'imported_at', 'snapshot_label', 'archived_at', 'created_at', 'updated_at', 'uploaded_at']);
const MEMBER_COLUMN_LABELS = {
  number: '#',
  first_name: 'First name',
  last_name: 'Last name',
  membership_label: 'Membership',
  mbr_status: 'Status',
  mbr_create_date: 'Created',
  mbr_begin_date: 'Begins',
  mbr_end_date: 'Ends',
  att_limit: 'Att. limit',
  att_limit_type: 'Limit type',
  people_count: 'People',
  autopay: 'Autopay'
};
const MEMBER_VIEW_TITLES = {
  current: 'Current members',
  joined: 'Joined this week',
  left: 'Left since last week',
  lastWeek: "Last week's list"
};

const memberListState = {
  current: [],
  lastWeek: null,
  view: 'current',
  search: '',
  status: 'all',
  membership: 'all',
  sortKey: 'last_name',
  sortDir: 1,
  controlsReady: false
};

function memberIdentity(row) {
  const number = String(row.number ?? '').trim();
  if (number) return 'n:' + number;
  return 'p:' + [row.first_name, row.last_name].join(' ').trim().toLowerCase();
}

function memberDiff() {
  if (!memberListState.lastWeek) return { joined: [], left: [], joinedKeys: new Set() };
  const lastKeys = new Set(memberListState.lastWeek.map(memberIdentity));
  const currentKeys = new Set(memberListState.current.map(memberIdentity));
  const joined = memberListState.current.filter(row => !lastKeys.has(memberIdentity(row)));
  const left = memberListState.lastWeek.filter(row => !currentKeys.has(memberIdentity(row)));
  return { joined, left, joinedKeys: new Set(joined.map(memberIdentity)) };
}

function memberViewRows(diff) {
  switch (memberListState.view) {
    case 'joined': return diff.joined;
    case 'left': return diff.left;
    case 'lastWeek': return memberListState.lastWeek || [];
    default: return memberListState.current;
  }
}

function memberColumns(rows) {
  const order = Object.keys(MEMBER_COLUMN_LABELS);
  const rank = column => (order.indexOf(column) + 1) || order.length + 1;
  return [...new Set(rows.flatMap(row => Object.keys(row)))]
    .filter(column => !MEMBER_HIDDEN_COLUMNS.has(column))
    .sort((a, b) => rank(a) - rank(b));
}

function memberColumnLabel(column) {
  return MEMBER_COLUMN_LABELS[column] || column.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function formatMemberValue(column, value) {
  if (value === null || value === undefined || value === '') return '';
  if (/date/.test(column) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    const date = new Date(String(value).slice(0, 10) + 'T00:00:00');
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return String(value);
}

function compareMemberValues(a, b) {
  const x = a ?? '';
  const y = b ?? '';
  const nx = Number(x);
  const ny = Number(y);
  if (x !== '' && y !== '' && Number.isFinite(nx) && Number.isFinite(ny)) return nx - ny;
  return String(x).localeCompare(String(y), 'en', { sensitivity: 'base' });
}

function filterMemberRows(rows) {
  const search = memberListState.search.trim().toLowerCase();
  return rows.filter(row => {
    if (memberListState.status !== 'all' && String(row.mbr_status ?? '') !== memberListState.status) return false;
    if (memberListState.membership !== 'all' && String(row.membership_label ?? '') !== memberListState.membership) return false;
    if (!search) return true;
    const name = [row.first_name, row.last_name].join(' ').toLowerCase();
    return name.includes(search) || String(row.number ?? '').includes(search);
  });
}

function sortMemberRows(rows) {
  const { sortKey, sortDir } = memberListState;
  return [...rows].sort((a, b) =>
    compareMemberValues(a[sortKey], b[sortKey]) * sortDir ||
    compareMemberValues(a.last_name, b.last_name) ||
    compareMemberValues(a.first_name, b.first_name));
}

function fillMemberSelect(select, values, allLabel) {
  if (!select) return;
  const previous = select.value || 'all';
  const options = [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="all">${escapeHtml(allLabel)}</option>` +
    options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  select.value = options.includes(previous) ? previous : 'all';
  if (select.value === 'all') {
    if (select.id === 'memberStatusFilter') memberListState.status = 'all';
    if (select.id === 'memberTypeFilter') memberListState.membership = 'all';
  }
}

function renderMemberSummary(diff) {
  const el = document.getElementById('memberSummary');
  if (!el) return;
  const hasHistory = Boolean(memberListState.lastWeek);
  const tile = (view, label, value, extraClass = '') => {
    const pressed = memberListState.view === view;
    const disabled = view !== 'current' && !hasHistory;
    return `<button type="button" class="past-due-metric member-view-tile ${extraClass}${pressed ? ' is-active' : ''}"
      data-member-view="${view}" aria-pressed="${pressed}"${disabled ? ' disabled' : ''}>
      <span>${escapeHtml(label)}</span><strong>${value}</strong></button>`;
  };
  el.innerHTML =
    tile('current', 'Current members', memberListState.current.length, 'key') +
    tile('joined', 'Joined this week', hasHistory ? '+' + diff.joined.length : '—') +
    tile('left', 'Left since last week', hasHistory ? diff.left.length : '—') +
    tile('lastWeek', "Last week's list", hasHistory ? memberListState.lastWeek.length : '—');
}

function renderMemberList() {
  const container = document.getElementById('current_memberList-wrap');
  if (!container) return;

  const diff = memberDiff();
  renderMemberSummary(diff);

  const viewRows = memberViewRows(diff);
  fillMemberSelect(document.getElementById('memberStatusFilter'), viewRows.map(row => row.mbr_status), 'All statuses');
  fillMemberSelect(document.getElementById('memberTypeFilter'), viewRows.map(row => row.membership_label), 'All memberships');

  const rows = sortMemberRows(filterMemberRows(viewRows));
  const columns = memberColumns(viewRows.length ? viewRows : memberListState.current);

  const title = document.getElementById('memberListTitle');
  if (title) title.textContent = MEMBER_VIEW_TITLES[memberListState.view];
  const count = document.getElementById('memberCount');
  if (count) count.textContent = `Showing ${rows.length} of ${viewRows.length}`;

  if (!rows.length) {
    const filtered = viewRows.length > 0;
    container.innerHTML = `<div class="empty">${filtered
      ? 'No members match these filters. <button type="button" class="link-button" data-member-reset>Clear filters</button>'
      : 'No members in this view.'}</div>`;
    return;
  }

  const showNewTag = memberListState.view === 'current';
  const headerCells = columns.map(column => {
    const active = memberListState.sortKey === column;
    const sort = active ? (memberListState.sortDir === 1 ? 'ascending' : 'descending') : 'none';
    const numeric = column === 'number' || column === 'att_limit' || column === 'people_count';
    return `<th scope="col" aria-sort="${sort}"${numeric ? ' class="num"' : ''}>
      <button type="button" class="sort-button" data-member-sort="${escapeHtml(column)}">${escapeHtml(memberColumnLabel(column))}<span class="sort-mark" aria-hidden="true"></span></button></th>`;
  }).join('');

  const bodyRows = rows.map(row => {
    const isNew = showNewTag && diff.joinedKeys.has(memberIdentity(row));
    return '<tr>' + columns.map(column => {
      const numeric = column === 'number' || column === 'att_limit' || column === 'people_count';
      let value = escapeHtml(formatMemberValue(column, row[column]));
      if (column === 'mbr_status' && value) value = `<span class="member-status" data-status="${value.toLowerCase()}">${value}</span>`;
      if (column === 'last_name' && isNew) value += ' <span class="member-new-tag">New</span>';
      return `<td${numeric ? ' class="num"' : ''} data-label="${escapeHtml(memberColumnLabel(column))}">${value}</td>`;
    }).join('') + '</tr>';
  }).join('');

  container.innerHTML = `<table class="filterable stack member-table"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function exportMemberListCsv() {
  const diff = memberDiff();
  const viewRows = memberViewRows(diff);
  const rows = sortMemberRows(filterMemberRows(viewRows));
  if (!rows.length) return;
  const columns = memberColumns(viewRows);
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map(column => quote(memberColumnLabel(column))).join(',')]
    .concat(rows.map(row => columns.map(column => quote(row[column])).join(',')))
    .join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `members-${memberListState.view}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function initMemberListControls() {
  if (memberListState.controlsReady) return;
  memberListState.controlsReady = true;

  const panel = document.getElementById('tab-current_memberList');
  const search = document.getElementById('memberSearch');
  const status = document.getElementById('memberStatusFilter');
  const type = document.getElementById('memberTypeFilter');

  search?.addEventListener('input', () => { memberListState.search = search.value; renderMemberList(); });
  status?.addEventListener('change', () => { memberListState.status = status.value; renderMemberList(); });
  type?.addEventListener('change', () => { memberListState.membership = type.value; renderMemberList(); });
  document.getElementById('exportMemberCsvBtn')?.addEventListener('click', exportMemberListCsv);

  panel?.addEventListener('click', event => {
    const viewButton = event.target.closest('[data-member-view]');
    if (viewButton && !viewButton.disabled) {
      memberListState.view = viewButton.dataset.memberView;
      renderMemberList();
      return;
    }
    const sortButton = event.target.closest('[data-member-sort]');
    if (sortButton) {
      const key = sortButton.dataset.memberSort;
      memberListState.sortDir = memberListState.sortKey === key ? -memberListState.sortDir : 1;
      memberListState.sortKey = key;
      renderMemberList();
      document.querySelector(`[data-member-sort="${CSS.escape(key)}"]`)?.focus();
      return;
    }
    if (event.target.closest('[data-member-reset]')) {
      memberListState.search = '';
      memberListState.status = 'all';
      memberListState.membership = 'all';
      if (search) search.value = '';
      if (status) status.value = 'all';
      if (type) type.value = 'all';
      renderMemberList();
    }
  });
}

async function loadSupabaseMemberList() {
  const container = document.getElementById('current_memberList-wrap');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading members…</div>';

  try {
    // Signed-in session client: member data must never be fetched with the public key.
    const client = await ensureSupabaseDataClient();
    const { data, error } = await client
      .from(MEMBER_LIST_TABLE)
      .select('*')
      .order('number', { ascending: true });
    if (error) throw error;

    memberListState.current = data || [];
    initMemberListControls();
    renderMemberList();
  } catch (err) {
    showError('current_memberList-wrap', err);
  }
}

async function loadSupabaseMemberListHistory() {
  try {
    const client = await ensureSupabaseDataClient();
    const { data, error } = await client
      .from(MEMBER_LIST_LOG_TABLE)
      .select('*')
      .order('archived_at', { ascending: false });
    if (error) throw error;

    const snapshot = getMemberLogSnapshotRows(data || []);
    memberListState.lastWeek = snapshot.length ? snapshot : null;
  } catch (err) {
    console.warn('Last week member snapshot unavailable:', err);
    memberListState.lastWeek = null;
  }
  if (memberListState.controlsReady) renderMemberList();
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

// ─── Pricing Settings ────────────────────────────────────────────────────────

const PRICING_TABLE = 'pricing_settings';

/**
 * Fetch all rows from pricing_settings and override the live constants.
 * Silently falls back to hardcoded defaults if the table doesn't exist.
 */
async function loadPricingSettings() {
  try {
    const client = await ensureSupabaseDataClient();
    const { data, error } = await client.from(PRICING_TABLE).select('key, value');
    if (error) {
      console.warn('[PricingSettings] Could not load from Supabase (table may not exist yet):', error.message);
      return;
    }
    applyPricingSettings(data || []);
  } catch (err) {
    console.warn('[PricingSettings] Load skipped:', err.message);
  }
}

/**
 * Apply an array of { key, value } rows to the live pricing constants.
 */
function applyPricingSettings(rows) {
  (rows || []).forEach(({ key, value }) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    if (key.startsWith('weekly_fee__')) {
      const label = key.slice('weekly_fee__'.length);
      if (label in REPORT_CATEGORY_WEEKLY_FEE) REPORT_CATEGORY_WEEKLY_FEE[label] = num;
    } else if (key.startsWith('goal__')) {
      const label = key.slice('goal__'.length);
      if (label in REPORT_CATEGORY_GOALS) REPORT_CATEGORY_GOALS[label] = num;
    } else if (key.startsWith('beginner_fee__')) {
      const label = key.slice('beginner_fee__'.length);
      if (label in BEGINNER_PACKAGE_FEE) BEGINNER_PACKAGE_FEE[label] = num;
    } else if (key.startsWith('beginner_rollover__')) {
      const label = key.slice('beginner_rollover__'.length);
      if (label in BEGINNER_PACKAGE_ROLLOVER_FEE) BEGINNER_PACKAGE_ROLLOVER_FEE[label] = num;
    } else if (key.startsWith('beginner_goal__')) {
      const label = key.slice('beginner_goal__'.length);
      if (label in BEGINNER_PACKAGE_GOALS) BEGINNER_PACKAGE_GOALS[label] = num;
    }
  });
}

/**
 * Pricing Settings: two editable tables with live "revenue at goal", one
 * save bar for every pending change, and per-row reset to defaults.
 * Nothing is written to Supabase until "Save changes".
 */
function getPricingSections() {
  return [
    {
      id: 'membership',
      title: 'Membership categories',
      hint: 'Weekly fee per member and the headcount you are aiming for.',
      rows: CURRENT_REPORT_ROW_LABELS.map(label => ({ label, name: REPORT_DISPLAY_LABELS[label] || label })),
      fields: [
        { prefix: 'weekly_fee__', title: 'Weekly fee', money: true, current: REPORT_CATEGORY_WEEKLY_FEE, defaults: DEFAULT_REPORT_CATEGORY_WEEKLY_FEE },
        { prefix: 'goal__', title: 'Headcount goal', current: REPORT_CATEGORY_GOALS, defaults: DEFAULT_REPORT_CATEGORY_GOALS }
      ],
      derived: { title: 'Weekly revenue at goal', calc: v => v.weekly_fee__ * v.goal__ }
    },
    {
      id: 'beginner',
      title: 'Beginner packages',
      hint: 'One-off package price, the weekly fee once it rolls over, and the enrolment goal.',
      rows: BEGINNER_PACKAGE_LABELS.map(label => ({ label, name: BEGINNER_PACKAGE_DISPLAY[label] || label })),
      fields: [
        { prefix: 'beginner_fee__', title: 'Package fee', money: true, current: BEGINNER_PACKAGE_FEE, defaults: DEFAULT_BEGINNER_PACKAGE_FEE },
        { prefix: 'beginner_rollover__', title: 'Rollover fee', money: true, current: BEGINNER_PACKAGE_ROLLOVER_FEE, defaults: DEFAULT_BEGINNER_PACKAGE_ROLLOVER_FEE },
        { prefix: 'beginner_goal__', title: 'Goal', current: BEGINNER_PACKAGE_GOALS, defaults: DEFAULT_BEGINNER_PACKAGE_GOALS }
      ],
      derived: { title: 'Package revenue at goal', calc: v => v.beginner_fee__ * v.beginner_goal__ }
    }
  ];
}

const formatPricingMoney = value => '$' + Number(value || 0).toLocaleString('en-AU', { maximumFractionDigits: 2 });

function renderPricingSettingsTab() {
  const container = document.getElementById('pricingSettings-content');
  if (!container) return;

  const sections = getPricingSections().map(section => {
    const head = section.fields.map(f => `<th scope="col" class="num">${escapeHtml(f.title)}</th>`).join('');
    const body = section.rows.map(row => {
      const inputs = section.fields.map(f => {
        const value = f.current[row.label];
        const def = f.defaults[row.label];
        return `<td class="num" data-label="${escapeHtml(f.title)}">
          <label class="pricing-cell${f.money ? ' is-money' : ''}">
            <span class="sr-only">${escapeHtml(f.title)} for ${escapeHtml(row.name)}</span>
            <input type="number" inputmode="decimal" min="0" step="${f.money ? '0.01' : '1'}"
              class="pricing-input" value="${escapeHtml(String(value))}"
              data-pricing-key="${escapeHtml(f.prefix + row.label)}" data-field="${f.prefix}"
              data-saved="${escapeHtml(String(value))}" data-default="${escapeHtml(String(def))}">
          </label>
          <span class="pricing-default" data-default-note>Default ${f.money ? formatPricingMoney(def) : escapeHtml(String(def))}</span>
        </td>`;
      }).join('');
      return `<tr data-pricing-row>
        <th scope="row" data-label="">${escapeHtml(row.name)}</th>
        ${inputs}
        <td class="num pricing-derived" data-label="${escapeHtml(section.derived.title)}" data-derived></td>
        <td class="pricing-row-actions" data-label=""><button type="button" class="link-button" data-pricing-reset>Reset to default</button></td>
      </tr>`;
    }).join('');

    return `<section class="card pricing-section" data-section="${section.id}" aria-labelledby="pricing-${section.id}">
      <div class="card-heading-row"><h2 id="pricing-${section.id}">${escapeHtml(section.title)}</h2></div>
      <p class="pricing-section-hint">${escapeHtml(section.hint)}</p>
      <div class="table-wrap">
        <table class="stack pricing-table">
          <thead><tr><th scope="col">Category</th>${head}<th scope="col" class="num">${escapeHtml(section.derived.title)}</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><th scope="row">Total</th>${section.fields.map(() => '<td></td>').join('')}<td class="num" data-total></td><td></td></tr></tfoot>
        </table>
      </div>
    </section>`;
  }).join('');

  container.innerHTML = `
    <div class="pricing-settings-page">
      <p class="page-lede">These figures drive the revenue and goal columns in This Week's and Last Week's reports. Edit any cell, then save once.</p>
      ${sections}
      <div class="pricing-save-bar" id="pricingSaveBar" hidden>
        <span id="pricingDirtyCount" role="status" aria-live="polite"></span>
        <div class="pricing-save-actions">
          <button type="button" class="sop-action-button secondary" id="pricingDiscardBtn">Discard</button>
          <button type="button" class="sop-action-button primary" id="pricingSaveBtn">Save changes</button>
        </div>
      </div>
      <p id="pricingStatusBar" class="pricing-status" role="status" aria-live="polite"></p>
    </div>`;

  initPricingSettingsTab();
}

function showPricingStatusBar(message, isError = false) {
  const bar = document.getElementById('pricingStatusBar');
  if (!bar) return;
  bar.textContent = message;
  bar.classList.toggle('is-error', isError);
}

function pricingInputValid(input) {
  return input.value.trim() !== '' && Number.isFinite(Number(input.value)) && Number(input.value) >= 0;
}

function refreshPricingTable() {
  const container = document.getElementById('pricingSettings-content');
  if (!container) return;
  const sections = getPricingSections();
  let dirty = 0;

  container.querySelectorAll('.pricing-section').forEach(sectionEl => {
    const section = sections.find(s => s.id === sectionEl.dataset.section);
    let total = 0;
    sectionEl.querySelectorAll('[data-pricing-row]').forEach(rowEl => {
      const values = {};
      let rowAtDefault = true;
      rowEl.querySelectorAll('.pricing-input').forEach(input => {
        const changed = input.value !== input.dataset.saved;
        const valid = pricingInputValid(input);
        const atDefault = Number(input.value) === Number(input.dataset.default);
        input.classList.toggle('is-dirty', changed);
        input.setAttribute('aria-invalid', String(!valid));
        input.closest('td').querySelector('[data-default-note]').hidden = atDefault;
        if (changed) dirty += 1;
        if (!atDefault) rowAtDefault = false;
        values[input.dataset.field] = valid ? Number(input.value) : 0;
      });
      const derived = section.derived.calc(values);
      total += derived;
      rowEl.querySelector('[data-derived]').textContent = formatPricingMoney(derived);
      rowEl.querySelector('[data-pricing-reset]').disabled = rowAtDefault;
    });
    sectionEl.querySelector('[data-total]').textContent = formatPricingMoney(total);
  });

  const bar = document.getElementById('pricingSaveBar');
  if (bar) bar.hidden = dirty === 0;
  const count = document.getElementById('pricingDirtyCount');
  if (count) count.textContent = dirty === 1 ? '1 unsaved change' : `${dirty} unsaved changes`;
  return dirty;
}

async function savePricingChanges() {
  const container = document.getElementById('pricingSettings-content');
  const saveBtn = document.getElementById('pricingSaveBtn');
  const changed = [...container.querySelectorAll('.pricing-input.is-dirty')];
  if (!changed.length) return;

  const invalid = changed.find(input => !pricingInputValid(input));
  if (invalid) {
    showPricingStatusBar('Each value must be a number of 0 or more.', true);
    invalid.focus();
    return;
  }

  // A value equal to its default removes the override; anything else is upserted.
  const toDelete = changed.filter(input => Number(input.value) === Number(input.dataset.default)).map(input => input.dataset.pricingKey);
  const toUpsert = changed.filter(input => Number(input.value) !== Number(input.dataset.default))
    .map(input => ({ key: input.dataset.pricingKey, value: Number(input.value), updated_at: new Date().toISOString() }));

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    const client = await ensureSupabaseDataClient();
    if (toUpsert.length) {
      const { error } = await client.from(PRICING_TABLE).upsert(toUpsert, { onConflict: 'key' });
      if (error) throw error;
    }
    if (toDelete.length) {
      const { error } = await client.from(PRICING_TABLE).delete().in('key', toDelete);
      if (error) throw error;
    }

    applyPricingSettings(changed.map(input => ({ key: input.dataset.pricingKey, value: Number(input.value) })));
    changed.forEach(input => { input.dataset.saved = input.value; });
    delete loadedTabs['current_mondayReport'];
    delete loadedTabs['last_mondayReport'];
    refreshPricingTable();
    showPricingStatusBar(`Saved ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}. The weekly reports recalculate next time you open them.`);
  } catch (err) {
    showPricingStatusBar('Could not save: ' + (err.message || 'unknown error') + '. Your edits are still here; try again.', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save changes';
  }
}

function initPricingSettingsTab() {
  const container = document.getElementById('pricingSettings-content');
  if (!container) return;

  container.addEventListener('input', event => {
    if (event.target.matches('.pricing-input')) {
      refreshPricingTable();
      showPricingStatusBar('');
    }
  });

  container.addEventListener('click', event => {
    const reset = event.target.closest('[data-pricing-reset]');
    if (reset) {
      reset.closest('[data-pricing-row]').querySelectorAll('.pricing-input').forEach(input => { input.value = input.dataset.default; });
      refreshPricingTable();
      showPricingStatusBar('Defaults filled in. Save changes to keep them.');
    }
  });

  document.getElementById('pricingSaveBtn')?.addEventListener('click', savePricingChanges);
  document.getElementById('pricingDiscardBtn')?.addEventListener('click', () => {
    container.querySelectorAll('.pricing-input').forEach(input => { input.value = input.dataset.saved; });
    refreshPricingTable();
    showPricingStatusBar('Changes discarded.');
  });

  window.addEventListener('beforeunload', event => {
    if (container.querySelector('.pricing-input.is-dirty')) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  refreshPricingTable();
}

// ─── Tab dispatcher ───────────────────────────────────────────────────────────

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
  } else if (key === 'pricingSettings') {
    renderPricingSettingsTab();
  } else {
    loadMondayPage(key);
  }
}

function initMondayBoardPage() {
    if (!document.getElementById('membersTrendChart')) return;

    const updatedLine = document.getElementById('updatedLine');
    if (updatedLine) {
      const now = new Date();
      updatedLine.textContent = 'Last updated: ' + now.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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

    // Load pricing from Supabase early so report tabs use correct values
    loadPricingSettings().then(() => {
      loadMondayTab('overview');
      loadSupabaseMemberListHistory();
      loadMemberHistoryLog();
    });
}

initMondayBoardPage();
