const MONDAY_BOARD_SHEET_NAME = 'DASHBOARD';

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
        renderTable(container, { headers: [], rows: [] });
        return;
      }

      const headers = Object.keys(data[0]);
      const rows = data.map(item => headers.map(header => {
        const value = item[header];
        return value === null || value === undefined ? '' : value;
      }));

      renderTable(container, { headers, rows });
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
     fetchMondayBoardDashboard()
        .then(renderMondayBoardCharts)
        .catch(error => {
        document.querySelectorAll('.chart-card .loading').forEach(loading => {
            loading.textContent = error.message;
            loading.classList.add('error');
        });
        });
  } else if (key === 'current_mondayReport' || key === 'last_mondayReport') { // Both reports are now iframes
    const config = MONDAY_PAGE_CONFIGS[key];
    const frame = document.getElementById(key + '-frame');
    if (frame && config.publishedUrl) {
      frame.src = config.publishedUrl;
    }
  } else if (key === 'current_memberList') {
    loadSupabaseMemberList(key);
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
}

initMondayBoardPage();
