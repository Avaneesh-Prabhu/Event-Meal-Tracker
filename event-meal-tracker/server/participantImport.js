import * as XLSX from 'xlsx';
import { getParticipants } from './db.js';

const VALID_DIETARY = ['Regular', 'Vegetarian', 'Vegan', 'Jain', 'Gluten-Free'];
const HEADER_HINTS = ['uid', 'id', 'name', 'team', 'dietary'];

const normalizeKey = (key) => String(key ?? '').trim().toLowerCase().replace(/[\s_]+/g, '');

// Accepts flexible column headers, e.g. "Name" / "Full Name" / "Participant Name"
function findValue(row, candidates) {
  const normalizedRow = {};
  Object.keys(row).forEach((k) => {
    normalizedRow[normalizeKey(k)] = row[k];
  });
  for (const candidate of candidates) {
    const val = normalizedRow[normalizeKey(candidate)];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return undefined;
}

/**
 * Parses an uploaded workbook buffer (.xlsx/.xls/.csv) into participant
 * records ready for bulkAddParticipants. Expected columns (case-insensitive,
 * flexible naming):
 *   Name / Full Name / Participant Name
 *   Team / Team Name
 *   UID / ID / Numeric UID   (optional — auto-assigned if missing)
 *   Dietary / Dietary Preference   (optional — defaults to "Regular")
 *
 * The header row does not need to be the very first row — any title,
 * subtitle, or blank rows above it are detected and skipped.
 */
export function parseParticipantsWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Read as raw rows first (no assumed header) so we can locate the
  // real header row, wherever it is.
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let headerRowIndex = -1;
  for (let i = 0; i < raw.length; i++) {
    const rowCells = (raw[i] || []).map((c) => normalizeKey(String(c ?? '')));
    const matches = rowCells.filter((c) => c && HEADER_HINTS.some((h) => c.includes(h)));
    // Require at least 2 recognizable headers (e.g. Name + Team) to avoid
    // false-matching a title row that happens to contain "team".
    if (matches.length >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      toAdd: [],
      skipped: 0,
      errors: ['Could not find a header row with Name/Team columns in the sheet.']
    };
  }

  const headers = (raw[headerRowIndex] || []).map((c) => String(c ?? ''));

  const dataRows = [];
  for (let i = headerRowIndex + 1; i < raw.length; i++) {
    const r = raw[i] || [];
    const isBlank = r.every((c) => String(c ?? '').trim() === '');
    if (isBlank) continue;

    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = r[idx];
    });
    dataRows.push({ rowNum: i + 1, data: obj }); // +1 for 1-indexed sheet row
  }

  const existing = getParticipants();
  const existingUids = new Set(existing.map((p) => p.uid));
  let nextUid = existing.reduce((max, p) => (p.uid > max ? p.uid : max), 1000) + 1;

  const toAdd = [];
  const errors = [];
  let skipped = 0;

  dataRows.forEach(({ rowNum, data: row }) => {
    const name = findValue(row, ['Name', 'Full Name', 'Participant Name', 'Participant']);
    const team = findValue(row, ['Team', 'Team Name']);
    const uidRaw = findValue(row, ['UID', 'ID', 'Numeric UID', 'Participant UID']);
    const dietaryRaw = findValue(row, ['Dietary', 'Dietary Preference']);

    if (!name || !team) {
      errors.push(`Row ${rowNum}: missing Name or Team — skipped.`);
      skipped++;
      return;
    }

    let uid;
    if (uidRaw) {
      const parsed = parseInt(uidRaw, 10);
      if (isNaN(parsed)) {
        errors.push(`Row ${rowNum}: invalid UID "${uidRaw}" — skipped.`);
        skipped++;
        return;
      }
      uid = parsed;
    } else {
      uid = nextUid++;
    }

    if (existingUids.has(uid) || toAdd.some((p) => p.uid === uid)) {
      errors.push(`Row ${rowNum}: UID #${uid} already exists — skipped.`);
      skipped++;
      return;
    }

    const dietary = dietaryRaw && VALID_DIETARY.includes(dietaryRaw) ? dietaryRaw : 'Regular';

    toAdd.push({ uid, name, team, dietary });
    existingUids.add(uid);
  });

  return { toAdd, errors, skipped };
}
