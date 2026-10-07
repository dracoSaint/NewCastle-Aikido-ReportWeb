// Red / Orange Follow-Up: the report rules, shared by the web page (js/followUpReport.js)
// and the weekly Zen Planner job (automation/zenplanner-followup.mjs).
// Rules: Newcastle_Aikido_Red_Orange_Report_Instructions.md (steps 1-7). No page code here.

const FU_ORANGE = { from: 7, to: 13, owner: 'Rachelle' };
const FU_RED = { from: 14, owner: 'Darius' };
const FU_STATUS_RANK = ['CURRENT', 'NOT STARTED', 'HOLD', 'COMPLETED', 'CANCELED']; // tie-break order

const fuKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
const fuPlural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

// DD/MM/YYYY (or D/M/YY) -> YYYY-MM-DD; ISO dates pass through.
function fuIso(value) {
  const raw = String(value || '').trim();
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dmy) return `${dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
}

const fuDmy = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const fuLongDate = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fuDaysBetween = (fromIso, toIso) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);

// Step 5: tidy phone numbers from spreadsheet exports.
function fuPhone(value) {
  let phone = String(value ?? '').trim().replace(/\.0$/, '');
  const digits = phone.replace(/\D/g, '');
  if (/^4\d{8}$/.test(digits)) phone = `0${digits}`;
  else if (/^61\d{9}$/.test(digits)) phone = `+${digits}`;
  return phone;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

// CSV or TSV text -> objects keyed by normalised header ("Last Att. Date" -> last_att_date).
// Exports sometimes start with title lines: the header is the first row holding requiredHeader.
function fuParseTable(text, requiredHeader) {
  const clean = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const delimiter = clean.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); records.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); records.push(row); }

  const norm = header => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const headerIndex = records.findIndex(record => record.map(norm).includes(requiredHeader));
  if (headerIndex < 0) return null;
  const headers = records[headerIndex].map(norm);
  return records.slice(headerIndex + 1)
    .filter(record => record.some(value => value.trim()))
    .map(record => Object.fromEntries(headers.map((header, index) => [header, (record[index] || '').trim()])));
}

function fuAttendanceFromText(text) {
  const rows = fuParseTable(text, 'last_att_date');
  if (!rows) throw new Error('This doesn\'t look like the attendance export: no "Last Att. Date" column.');
  const attendance = rows.filter(row => row.name).map(row => ({
    name: row.name.trim().replace(/\s+/g, ' '),
    phone: row.phone || '',
    status: row.status || '',
    lastAtt: fuIso(row.last_att_date)
  }));
  if (!attendance.length) throw new Error('No members found in the attendance export.');
  return attendance;
}

// Step 1: keep only each person's latest membership record.
function fuMembershipsFromText(text) {
  const rows = fuParseTable(text, 'mbr_status');
  if (!rows) throw new Error('This doesn\'t look like the membership status export: no "Mbr. Status" column.');
  const records = rows
    .map(row => ({
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim().replace(/\s+/g, ' '),
      label: row.membership_label || '',
      status: (row.mbr_status || '').trim().toUpperCase(),
      begin: fuIso(row.mbr_begin_date),
      end: fuIso(row.mbr_end_date)
    }))
    .filter(record => record.name);
  if (!records.length) throw new Error('No membership rows found in that file.');
  const rank = status => {
    const index = FU_STATUS_RANK.findIndex(name => status.includes(name));
    return index < 0 ? FU_STATUS_RANK.length : index;
  };
  records.sort((a, b) => b.begin.localeCompare(a.begin) || b.end.localeCompare(a.end) || rank(a.status) - rank(b.status));
  const latest = new Map();
  records.forEach(record => { if (!latest.has(fuKey(record.name))) latest.set(fuKey(record.name), record); });
  return [...latest.values()];
}

// The report date is the day the attendance file was generated: read it from the file name.
function fuDateFromFileName(name) {
  const iso = String(name).match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (iso && +iso[2] <= 12 && +iso[3] <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = String(name).match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : '';
}

// ── Steps 2-4: tiers and exclusions ──────────────────────────────────────────

function fuBuild(report) {
  const memberships = new Map((report.memberships || []).map(record => [fuKey(record.name), record]));
  const removed = new Set(report.removed || []);
  const result = { orange: [], red: [], none: [], excluded: [], removed: [] };

  for (const person of report.attendance || []) {
    const days = person.lastAtt ? fuDaysBetween(person.lastAtt, report.report_date) : null;
    let tier;
    if (days === null) tier = 'none';
    else if (days >= FU_RED.from) tier = 'red';
    else if (days >= FU_ORANGE.from) tier = 'orange';
    else continue; // Active (0-6 days, or trained after the report date): not in the report.

    const membership = memberships.get(fuKey(person.name));
    const gratis = /gratis training/i.test(membership?.label || '');
    const hold = /hold/i.test(membership?.status || '');
    const row = {
      ...person,
      key: fuKey(person.name),
      phone: fuPhone(person.phone),
      days,
      tier,
      membership,
      note: report.notes?.[fuKey(person.name)] || ''
    };

    if (gratis || hold) {
      row.reason = gratis && hold ? 'Gratis Training member, on HOLD' : gratis ? 'Gratis Training member' : 'Membership on HOLD';
      result.excluded.push(row);
    } else if (removed.has(row.key)) {
      result.removed.push(row);
    } else {
      result[tier].push(row);
    }
  }

  const byDays = (a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || a.name.localeCompare(b.name);
  Object.values(result).forEach(list => list.sort(byDays));
  return result;
}

// Steps 7.1-7.4: a new report from new inputs, carrying notes forward from `base`
// only for people still on a follow-up list (resolved notes drop away).
function fuNextReport(base, changes) {
  const next = {
    report_date: changes.report_date || base?.report_date,
    attendance_file: changes.attendance_file ?? base?.attendance_file ?? null,
    membership_file: changes.membership_file ?? base?.membership_file ?? null,
    attendance: changes.attendance || base?.attendance,
    memberships: changes.memberships || base?.memberships,
    removed: []
  };
  if (!next.attendance || !next.memberships) return null;
  const onList = fuBuild({ ...next, notes: {} });
  const stillListed = new Set([...onList.orange, ...onList.red, ...onList.none].map(row => row.key));
  next.notes = Object.fromEntries(Object.entries(base?.notes || {}).filter(([key, note]) => note && stillListed.has(key)));
  return next;
}

const fuTierLabel = tier => ({ orange: 'Orange', red: 'Red', none: 'No Attendance Record' }[tier]);
const fuWouldBe = row => (row.tier === 'none' ? 'would otherwise be No Attendance Record' : `would otherwise be ${fuTierLabel(row.tier)}, ${row.days} days`);

// Step 6: the exact Markdown template.
function fuMarkdown(report, result) {
  const cell = value => String(value ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  const tierTable = rows => ['| Name | Phone | Last Att. | Days | Note |', '|---|---|---|---|---|',
    ...rows.map(row => `| ${cell(row.name)} | ${cell(row.phone)} | ${fuDmy(row.lastAtt)} | ${row.days} | ${cell(row.note)} |`)].join('\n');
  return [
    '## Newcastle Aikido - Red / Orange Follow-Up Report',
    `*Report date: ${fuLongDate(report.report_date)} | Orange: ${FU_ORANGE.from}-${FU_ORANGE.to} days since last attendance | Red: ${FU_RED.from}+ days since last attendance*`,
    '*Gratis and HOLD memberships excluded (based on latest membership record)*',
    '',
    `### ORANGE TIER - ${result.orange.length} members (${FU_ORANGE.owner} to follow up)`,
    tierTable(result.orange),
    '',
    `### RED TIER - ${result.red.length} members (${FU_RED.owner} to follow up)`,
    tierTable(result.red),
    '',
    `### NO ATTENDANCE RECORD - ${result.none.length} members`,
    '| Name | Phone | Note |',
    '|---|---|---|',
    ...result.none.map(row => `| ${cell(row.name)} | ${cell(row.phone)} | ${cell(row.note)} |`),
    '',
    '### EXCLUDED',
    '*Gratis / HOLD memberships*',
    '*The following members matched the attendance-gap window but were removed from the tiers above, as their latest membership record shows Gratis Training or HOLD status.*',
    '',
    '| Name | Reason excluded | Would otherwise be |',
    '|---|---|---|',
    ...result.excluded.map(row => `| ${cell(row.name)} | ${row.reason} | ${fuWouldBe(row)} |`),
    ''
  ].join('\n');
}

// Node (the weekly job) loads this file as a module; the browser just gets the globals.
if (typeof module !== 'undefined') {
  module.exports = { FU_ORANGE, FU_RED, fuKey, fuIso, fuPhone, fuParseTable, fuAttendanceFromText, fuMembershipsFromText, fuDateFromFileName, fuBuild, fuNextReport, fuMarkdown };
}
