/* ============ CONFIG - edit these to match your sheet ============ */
const ATTENDANCE_SHEET_NAME = 'MASTER LIST'; // <-- confirm this matches your actual tab name
const ATTENDANCE_HEADER_ROW = 1;
const ATTENDANCE_DATA_START_ROW = 2;
/* =================================================================== */

const HEADER_FALLBACKS = {
  attendance: ['Date',	'Time',	'Person',	'First Name',	'Last Name',	'Program',	'Name',	'Rsvp',	'Att.',	'Canceled',	'Status',	'Last Att. Date',	'Att. total']
};

let jsonpCounter = 0;
const sheetCache = {};

function normalizeRow(row, length) {
  const normalized = (row || []).slice();
  while (normalized.length < length) normalized.push('');
  return normalized;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initAttendanceReportPage() {
  if(document.getElementById('attendance-report-wrap')){
    loadAttendanceReport();
    setupFiltering();
    setupPrintButton();
  }
}

function setupFiltering() {
  const filterInput = document.getElementById('filterInput');
  if (filterInput) {
    const tableWrap = document.getElementById('attendance-report-wrap');

    if (filterInput && tableWrap) {
      filterInput.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        const rows = tableWrap.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const rowText = row.textContent.toLowerCase();
          if (rowText.includes(q)) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      });
    }
  }
}



function showError(elId, err) {
  const container = document.getElementById(elId);
  if (container) {
    container.innerHTML = '<div class="error">' + escapeHtml(err.message || err) + '</div>';
  }
}

function renderTable(container, block) {
  if (!container) return;
  if (!block.rows.length) {
    container.innerHTML = '<div class="empty">No data found.</div>';
    return;
  }
  const isNum = v => /^-?\d+(\.\d+)?$/.test(String(v).trim());
  const numCols = block.headers.map((_, c) => {
    const values = block.rows.map(r => r[c]).filter(v => String(v).trim() !== '');
    return values.length > 0 && values.every(isNum);
  });
  let html = '<table id="attendanceTable" class="filterable stack"><thead><tr>';
  block.headers.forEach((h, c) => { html += '<th' + (numCols[c] ? ' class="num"' : '') + '>' + escapeHtml(h) + '</th>'; });
  html += '</tr></thead><tbody>';
  block.rows.forEach(row => {
    html += '<tr>';
    row.forEach((cell, c) => {
      html += '<td' + (numCols[c] ? ' class="num"' : '') + ' data-label="' + escapeHtml(block.headers[c] || '') + '">' + escapeHtml(cell) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function fetchSheetRaw(sheetName) {
  if (sheetCache[sheetName]) return sheetCache[sheetName];

  const promise = new Promise((resolve, reject) => {
    let script;
    const cbName = 'gvizCb' + (jsonpCounter++);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out loading "' + sheetName + '". Check the sheet is shared as "Anyone with the link".'));
    }, 12000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function (response) {
      cleanup();
      try {
        if (response.status === 'error') {
          const error = response.errors[0];
          reject(new Error(`Error loading sheet: ${error.detailed_message}`));
          return;
        }
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

    if (!config || !config.attendanceSpreadsheetId) {
        reject(new Error('Spreadsheet ID is not configured.'));
        return;
    }

    const url = 'https://docs.google.com/spreadsheets/d/' + config.attendanceSpreadsheetId +
      '/gviz/tq?tqx=out:json;responseHandler:' + cbName +
      '&sheet=' + encodeURIComponent(sheetName) +
      '&headers=0';

    script = document.createElement('script');
    script.src = url;
    script.onerror = () => { cleanup(); reject(new Error('Failed to load sheet "' + sheetName + '".')); };
    document.body.appendChild(script);
  });

  sheetCache[sheetName] = promise;
  return promise;
}

function getHeaders(rawRows, headerRow, fallbackKey) {
  const hIdx = headerRow - 1;
  const fallback = HEADER_FALLBACKS[fallbackKey] || [];
  const row = normalizeRow(rawRows[hIdx], fallback.length).slice(0, fallback.length || undefined);
  return row.map((cell, idx) => {
    const value = String(cell || '').trim();
    return value || fallback[idx] || '';
  });
}

function renderAttendanceKeyFigure(headers, rows) {
  const el = document.getElementById('attendanceKeyFigure');
  if (!el) return;
  const col = re => headers.findIndex(h => re.test(String(h)));
  const attIdx = col(/^att\.?$/i);
  const cancelIdx = col(/cancel/i);
  const yes = (r, i) => i >= 0 && String(r[i]).trim().toLowerCase() === 'yes';
  const attended = rows.filter(r => yes(r, attIdx)).length;
  const cancelled = rows.filter(r => yes(r, cancelIdx)).length;
  el.innerHTML = '<div class="past-due-metric key"><span>Classes attended</span><strong>' + attended + '</strong></div>' +
    '<div class="past-due-metric"><span>Bookings recorded</span><strong>' + rows.length + '</strong></div>' +
    '<div class="past-due-metric"><span>Cancelled</span><strong>' + cancelled + '</strong></div>';
}

function loadAttendanceReport() {
  const container = document.getElementById('attendance-report-wrap');
  fetchSheetRaw(ATTENDANCE_SHEET_NAME).then(rawRows => {
    const headers = getHeaders(rawRows, ATTENDANCE_HEADER_ROW, 'attendance');
    const rows = rawRows.slice(ATTENDANCE_DATA_START_ROW - 1)
      .map(row => normalizeRow(row, headers.length).slice(0, headers.length))
      .filter(r => r.some(cell => cell !== '' && cell !== null && cell !== undefined));
    renderTable(container, { headers, rows });
    renderAttendanceKeyFigure(headers, rows);
    const updatedLine = document.getElementById('updatedLine');
    if(updatedLine) {
        const now = new Date();
        updatedLine.textContent = 'Last updated: ' + now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    }
  }).catch(err => showError('attendance-report-wrap', err));
}

function initAttendanceReportPage() {
    if(document.getElementById('attendance-report-wrap')){
        loadAttendanceReport();
    }
}
function setupPrintButton() {
  const printButton = document.getElementById('printReportButton');
  if (printButton) {
    printButton.addEventListener('click', () => {
      window.print();
    });
  }
}

initAttendanceReportPage();