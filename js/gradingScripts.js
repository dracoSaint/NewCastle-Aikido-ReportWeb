/* ============ CONFIG - edit these to match your sheet ============ */
const SPREADSHEET_ID = '1EmS3-3mxova9vQSavu-bYR05sGyve-q5CE2Xq12FLis';

// Home page: one sheet, two column-blocks side by side
const HOME_SHEET_NAME = 'ELIGIBLE MEMBERS'; // <-- confirm this matches your actual tab name
const HOME_HEADER_ROW = 2;   // 1-indexed
const HOME_DATA_START_ROW = 3; // 1-indexed
const HOME_ADULTS_COLS = { start: 2, end: 8 };  // B..J (1-indexed)
const HOME_JUNIORS_COLS = { start: 10, end: 16 }; // L..T

// Other pages: one sheet each, headers on row 1, data from row 2
const PAGE_CONFIGS = {
  adults:  { sheetName: 'REG. ADULT GRADING', headerRow: 1, dataStartRow: 2 },
  juniors: { sheetName: 'JUNIORS GRADING',    headerRow: 1, dataStartRow: 2 },
  members: { sheetName: 'MEMBER LIST',        headerRow: 1, dataStartRow: 2 }
};
/* =================================================================== */

let jsonpCounter = 0;
const sheetCache = {};

const HEADER_FALLBACKS = {
  homeAdults: ['Rank', 'First Name', 'Last Name', 'Att. Total', 'Att. Since Test', 'Hours Needed', 'Weekly Hour Goal'],
  homeJuniors: ['Rank', 'First Name', 'Last Name', 'Att. Total', 'Att. Since Test', 'Hours Needed', 'Weekly Hour Goal'],
  adults: ['Rank', 'First Name', 'Last Name', 'Att. Total', 'Att. Since Test', 'Hours Needed', 'Weekly Hour Goal'],
  juniors: ['Rank', 'First Name', 'Last Name', 'Att. Total', 'Att. Since Test', 'Hours Needed', 'Weekly Hour Goal'],
  members: ['Rank', 'First Name', 'Last Name', 'Att. Total', 'Att. Since Test', 'Enough Att. For Rank?', 'Last Test Date']
};

function normalizeRow(row, length) {
  const normalized = (row || []).slice();
  while (normalized.length < length) normalized.push('');
  return normalized;
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

function fetchSheetRaw(sheetName) {
  if (sheetCache[sheetName]) return sheetCache[sheetName];

  const promise = new Promise((resolve, reject) => {
    const cbName = 'gvizCb' + (jsonpCounter++);
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

    const url = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID +
      '/gviz/tq?tqx=out:json;responseHandler:' + cbName +
      '&sheet=' + encodeURIComponent(sheetName) +
      '&headers=0';

    const script = document.createElement('script');
    script.src = url;
    script.onerror = () => { cleanup(); reject(new Error('Failed to load sheet "' + sheetName + '".')); };
    document.body.appendChild(script);
  });

  sheetCache[sheetName] = promise;
  return promise;
}

function sliceBlock(rawRows, headerRow, dataStartRow, colStart, colEnd, fallbackKey) {
  const dIdx = dataStartRow - 1;
  const cStart = colStart - 1;
  const cEnd = colEnd;

  // Pad the complete sheet header row before slicing the block. The juniors
  // block starts later in the sheet, so padding only to the fallback length
  // makes its header slice empty.
  const fallback = HEADER_FALLBACKS[fallbackKey] || [];
  const fullHeaderRow = normalizeRow(rawRows[headerRow - 1], cEnd);
  const headers = fullHeaderRow.slice(cStart, cEnd).map((header, index) => {
    const value = String(header || '').trim();
    return value || fallback[index] || '';
  });
  const rows = rawRows.slice(dIdx)
    .map(r => normalizeRow(r, cEnd).slice(cStart, cEnd))
    .filter(r => r.some(cell => cell !== '' && cell !== null && cell !== undefined));

  return { headers, rows };
}

function classify(headerLower, cellLower) {
  if (headerLower.indexOf('eligib') !== -1) {
    return cellLower === 'eligible' ? 'eligible' : 'not-eligible';
  }
  if (headerLower.indexOf('enough att') !== -1) {
    return cellLower === 'yes' ? 'yes' : 'no';
  }
  return '';
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
      const cls = classify(String(block.headers[c] || '').toLowerCase(), String(cell).toLowerCase());
      html += '<td class="' + cls + '">' + escapeHtml(cell) + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function setUpdatedNow() {
  document.getElementById('updatedLine').textContent =
    'Last updated: ' + new Date().toLocaleString();
}

function loadHome() {
  fetchSheetRaw(HOME_SHEET_NAME).then(rawRows => {
    const adults = sliceBlock(rawRows, HOME_HEADER_ROW, HOME_DATA_START_ROW, HOME_ADULTS_COLS.start, HOME_ADULTS_COLS.end, 'homeAdults');
    const juniors = sliceBlock(rawRows, HOME_HEADER_ROW, HOME_DATA_START_ROW, HOME_JUNIORS_COLS.start, HOME_JUNIORS_COLS.end, 'homeJuniors');
    renderTable(document.getElementById('home-adults-wrap'), adults);
    renderTable(document.getElementById('home-juniors-wrap'), juniors);
  }).catch(err => {
    showError('home-adults-wrap', err);
    showError('home-juniors-wrap', err);
  });
}

function loadPage(key) {
  const config = PAGE_CONFIGS[key];
  fetchSheetRaw(config.sheetName).then(rawRows => {
    const headers = getHeaders(rawRows, config.headerRow, key);
    const rows = rawRows.slice(config.dataStartRow - 1)
      .map(row => normalizeRow(row, headers.length).slice(0, headers.length))
      .filter(r => r.some(cell => cell !== '' && cell !== null && cell !== undefined));
    renderTable(document.getElementById(key + '-wrap'), { headers, rows });
  }).catch(err => showError(key + '-wrap', err));
}

function showError(elId, err) {
  document.getElementById(elId).innerHTML = '<div class="error">' + escapeHtml(err.message || err) + '</div>';
}

const loaded = {};
function loadTab(key) {
  if (loaded[key]) return;
  loaded[key] = true;
  if (key === 'home') loadHome();
  else loadPage(key);
}

function initDrawer() {
  const menuToggle = document.getElementById('menuToggle');
  const drawer = document.getElementById('pageDrawer');
  const overlay = document.getElementById('pageOverlay');
  const closeBtn = document.querySelector('.drawer-close');
  if (!menuToggle || !drawer || !overlay) return;

  const toggleDrawer = open => {
    drawer.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  };

  menuToggle.addEventListener('click', () => toggleDrawer(true));
  overlay.addEventListener('click', () => toggleDrawer(false));
  if (closeBtn) closeBtn.addEventListener('click', () => toggleDrawer(false));
}

function initGradingPage() {
  const navButtons = document.querySelectorAll('nav.site-nav button');
  if (!navButtons.length) return;

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      loadTab(btn.dataset.tab);
    });
  });

  const filterInput = document.getElementById('filterInput');
  if (filterInput) {
    filterInput.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('.tab-panel.active table.filterable').forEach(table => {
        table.querySelectorAll('tbody tr').forEach(row => {
          row.style.display = row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
        });
      });
    });
  }

  setUpdatedNow();
  loadTab('home');
}

initDrawer();
initGradingPage();
