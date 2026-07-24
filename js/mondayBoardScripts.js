const MONDAY_BOARD_SPREADSHEET_ID = '1E9zvuJDxDCSpA7_zwlTZsKLeeK94K6rl8c77FKalpv8';
const MONDAY_BOARD_SHEET_NAME = 'DASHBOARD';

let mondayJsonpCounter = 0;

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

    const url = 'https://docs.google.com/spreadsheets/d/' + MONDAY_BOARD_SPREADSHEET_ID +
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

    // Find the row for "MEMBERS TOTALS" to get the total members data
    const membersTotal = findDashboardRow(data.rows, 'MEMBERS TOTALS');
    const regularAdultTotal = findDashboardRow(data.rows, 'REGULAR ADULT');
    const beginnerTotal = findDashboardRow(data.rows, 'BEGINNER');
    const concessionTotal = findDashboardRow(data.rows, 'CONCESSION');
    const chiisaiTotal = findDashboardRow(data.rows, 'CHIISAI KAI 4-7');
    const kidsYoungTotal = findDashboardRow(data.rows, 'KIDS 8-14');
    const kidsTeenTotal = findDashboardRow(data.rows, 'KIDS 15-17');
    const blueZoneTotal = findDashboardRow(data.rows, 'BLUE ZONE');
    const combatPilatesTotal = findDashboardRow(data.rows, 'COMBAT PILATES');


    // Find the row for "BEGINNER TOTALS" to get the beginner totals data
    const becomeTotal = findDashboardRow(data.rows, 'BEGINNER TOTALS');

    const memberRows = data.rows.filter(row => {
        const label = String(dashboardCell(row, 0) || '');
        return label && !label.includes('TOTALS') && !label.startsWith('Become');
    });
    const beginnerRows = data.rows.filter(row => String(dashboardCell(row, 0) || '').startsWith('Become'));

    new Chart(document.getElementById('membersTrendChart'), {
        type: 'line',
        data: {
        labels,
        datasets: [{
            label: 'Total members',
            data: valuesForRow(membersTotal, dateCount),
            borderColor: '#a3272c',
            backgroundColor: 'rgba(163, 39, 44, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Regular Adult Members',
            data: valuesForRow(regularAdultTotal, dateCount),
            borderColor: '#306497',
            backgroundColor: 'rgba(28, 43, 58, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Beginner',
            data: valuesForRow(beginnerTotal, dateCount),
            borderColor: '#2f7f7a',
            backgroundColor: 'rgba(47, 127, 122, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Concession',
            data: valuesForRow(concessionTotal, dateCount),
            borderColor: '#6f00ff',
            backgroundColor: 'rgba(111, 0, 255, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Chiisai Kai 4-7',
            data: valuesForRow(chiisaiTotal, dateCount),
            borderColor: '#d6b50d',
            backgroundColor: 'rgba(163, 139, 21, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Kids 8-14',
            data: valuesForRow(kidsYoungTotal, dateCount),
            borderColor: 'rgb(132, 133, 218)',
            backgroundColor: 'rgba(132, 133, 218, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Kids 15-17',
            data: valuesForRow(kidsTeenTotal, dateCount),
            borderColor: 'rgb(154, 77, 157)',
            backgroundColor: 'rgba(154, 77, 157, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Blue Zone',
            data: valuesForRow(blueZoneTotal, dateCount),
            borderColor: 'rgb(0, 4, 255)',
            backgroundColor: 'rgba(0, 4, 255, 0.12)',
            fill: true,
            tension: 0.3
        }, {
            label: 'Combat Pilates',
            data: valuesForRow(combatPilatesTotal, dateCount),
            borderColor: 'rgb(137, 73, 0)',
            backgroundColor: 'rgba(137, 73, 0, 0.12)',
            fill: true,
            tension: 0.3
        }]
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

function initMondayBoardPage() {
    if (!document.getElementById('membersTrendChart')) return;

    const updatedLine = document.getElementById('updatedLine');
    if (updatedLine) updatedLine.textContent = 'Last updated: ' + new Date().toLocaleString();

    fetchMondayBoardDashboard()
        .then(renderMondayBoardCharts)
        .catch(error => {
        document.querySelectorAll('.chart-card .loading').forEach(loading => {
            loading.textContent = error.message;
            loading.classList.add('error');
        });
        });
}

initMondayBoardPage();
