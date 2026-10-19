// Monday report CSV import rules, shared by the web page (js/mondayBoardScripts.js)
// and the weekly Zen Planner job (automation/zenplanner-monday.mjs). No page code here.

const MEMBER_LIST_TABLE = 'membership_data';
const MEMBER_LIST_PREVIOUS_TABLE = 'membership_data_previous';
const MEMBER_LIST_LOG_TABLE = 'membership_data_log';
const MEMBER_WEEKLY_LOG_TABLE = 'membership_weekly_log';
const TARGET_BEGINNER_PACKAGES = [
  'become - 6 week transformation journey',
  'blue zone- new beginnings 6 week life change introduction only',
  'chiisai kai beginners package',
  'junior beginner package'
];

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

function normalizeMemberCleanString(str) {
  return str ? String(str).toLowerCase().trim() : '';
}

function isTargetBeginnerPackage(label) {
  const clean = normalizeMemberCleanString(label);
  if (!clean) return false;

  for (let i = 0; i < TARGET_BEGINNER_PACKAGES.length; i++) {
    const pkg = TARGET_BEGINNER_PACKAGES[i];
    if (clean === pkg || clean.indexOf(pkg) === 0) {
      return true;
    }
  }
  return false;
}

function dedupeImportedMemberRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  // 1. Group rows by Member Name (First Name + Last Name)
  const membersGrouped = {};

  rows.forEach((row, index) => {
    const firstName = row.first_name || row['first_name'] || '';
    const lastName = row.last_name || row['last_name'] || '';

    if (!firstName && !lastName) {
      return;
    }

    const firstNameClean = normalizeMemberCleanString(firstName).replace(/\s+/g, '');
    const lastNameClean = normalizeMemberCleanString(lastName).replace(/\s+/g, '');
    const personKey = `${firstNameClean}_${lastNameClean}`;

    if (!membersGrouped[personKey]) {
      membersGrouped[personKey] = [];
    }
    membersGrouped[personKey].push({ index, data: row });
  });

  // 2. Process Deduplication Rules
  const rowsToDiscard = new Set();

  for (const personKey in membersGrouped) {
    const memberRecords = membersGrouped[personKey];
    if (memberRecords.length <= 1) continue;

    const beginnerRecords = [];
    const otherRecords = [];

    memberRecords.forEach(rec => {
      const label = rec.data.membership_label || rec.data['membership_label'] || '';
      if (isTargetBeginnerPackage(label)) {
        beginnerRecords.push(rec);
      } else {
        otherRecords.push(rec);
      }
    });

    // Rule: If beginner package(s) exist alongside other records, discard all other records
    if (beginnerRecords.length > 0 && otherRecords.length > 0) {
      otherRecords.forEach(oRec => {
        rowsToDiscard.add(oRec.index);
      });
    }

    // Secondary Check: Deduplicate remaining records with identical labels for the same person
    const seenLabels = {};
    memberRecords.forEach(rec => {
      if (rowsToDiscard.has(rec.index)) return;
      const cleanLabel = normalizeMemberCleanString(rec.data.membership_label || rec.data['membership_label'] || '');
      if (seenLabels[cleanLabel]) {
        rowsToDiscard.add(rec.index);
      } else {
        seenLabels[cleanLabel] = true;
      }
    });
  }

  // 3. Construct Cleaned Rows
  const cleanedRows = [];
  rows.forEach((row, index) => {
    if (!rowsToDiscard.has(index)) {
      cleanedRows.push(row);
    }
  });

  return cleanedRows;
}


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

async function saveWeeklyMemberSummaryLog(client, reportDateValue, rows) {
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

async function archiveCurrentMemberList(client, reportDateValue) {
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

async function replaceCurrentMemberList(client, rows) {
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


// Monday..Sunday (YYYY-MM-DD) of the week a report date falls in.
function mondayReportWeek(reportDate) {
  const day = new Date(`${reportDate}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const end = new Date(day);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: day.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// Membership CSV text -> the Monday report for reportDateValue (YYYY-MM-DD): the current list is
// archived as last week, replaced, and the week's counts saved. Another import in the same
// Monday-Sunday week (a mid-week "Sync data") only refreshes that week, so last week's list is
// never overwritten with this week's.
async function mondayImportCsv(client, text, reportDateValue, progress = () => {}) {
  const reportDate = getSelectedReportDate(reportDateValue);
  const rows = parseUploadedCsv(text)
    .map(normalizeMembershipCsvRow)
    .filter(row => row.number || row.first_name || row.last_name)
    .map(row => ({ ...row, report_date: reportDate, imported_at: getSelectedReportTimestamp(reportDateValue), snapshot_label: 'CURRENT' }));
  if (!rows.length) throw new Error('No valid member rows were found in the CSV file.');

  const week = mondayReportWeek(reportDate);
  const { data: sameWeek, error } = await client.from(MEMBER_WEEKLY_LOG_TABLE).select('id')
    .gte('report_date', week.start).lte('report_date', week.end).eq('snapshot_label', 'CURRENT');
  if (error) throw error;
  progress(46);
  if (!sameWeek.length) await archiveCurrentMemberList(client, reportDateValue);
  progress(72);
  const cleanRows = await replaceCurrentMemberList(client, rows);
  if (sameWeek.length) {
    const { error: deleteError } = await client.from(MEMBER_WEEKLY_LOG_TABLE).delete().in('id', sameWeek.map(row => row.id));
    if (deleteError) throw deleteError;
  }
  await saveWeeklyMemberSummaryLog(client, reportDateValue, cleanRows);
  return cleanRows;
}

// Node (the weekly job) loads this file as a module; the browser just gets the globals.
if (typeof module !== 'undefined') {
  module.exports = { BEGINNER_PACKAGE_LABELS, parseUploadedCsv, normalizeMembershipCsvRow, dedupeImportedMemberRows, buildWeeklySummaryLogFromRows, mondayImportCsv, mondayReportWeek };
}
