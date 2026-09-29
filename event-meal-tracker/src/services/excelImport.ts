import * as XLSX from 'xlsx';
import { Participant } from '../types';
import { StorageService } from './storage';

export interface ImportResult {
  success: boolean;
  added: number;
  skipped: number;
  errors: string[];
}

const VALID_DIETARY = ['Regular', 'Vegetarian', 'Vegan', 'Jain', 'Gluten-Free'];

const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[\s_]+/g, '');

// Accepts flexible column headers, e.g. "Name" / "Full Name" / "Participant Name"
function findValue(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const normalizedRow: Record<string, unknown> = {};
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
 * Reads an uploaded .xlsx/.xls/.csv file and imports participants
 * (Name + Team required; UID and Dietary optional) into the database.
 * Expected columns (case-insensitive, flexible naming):
 *   Name / Full Name / Participant Name
 *   Team / Team Name
 *   UID / ID / Numeric UID   (optional — auto-assigned if missing)
 *   Dietary / Dietary Preference   (optional — defaults to "Regular")
 *
 * The header row does not need to be the very first row — any title,
 * subtitle, or blank rows above it are detected and skipped.
 */
export function importParticipantsFromExcel(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Read as raw rows first (no assumed header) so we can locate
        // the real header row, wherever it is.
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        const HEADER_HINTS = ['uid', 'id', 'name', 'team', 'dietary'];
        let headerRowIndex = -1;
        for (let i = 0; i < raw.length; i++) {
          const rowCells = (raw[i] || []).map((c) => normalizeKey(String(c ?? '')));
          const matches = rowCells.filter((c) => c && HEADER_HINTS.some((h) => c.includes(h)));
          // Require at least 2 recognizable headers (e.g. Name + Team) to
          // avoid false-matching a title row that happens to contain "team".
          if (matches.length >= 2) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          resolve({
            success: false,
            added: 0,
            skipped: 0,
            errors: ['Could not find a header row with Name/Team columns in the sheet.']
          });
          return;
        }

        const headers = (raw[headerRowIndex] || []).map((c) => String(c ?? ''));

        // Build {rowNum, data} pairs from every non-blank row after the header.
        const dataRows: { rowNum: number; data: Record<string, unknown> }[] = [];
        for (let i = headerRowIndex + 1; i < raw.length; i++) {
          const r = raw[i] || [];
          const isBlank = r.every((c) => String(c ?? '').trim() === '');
          if (isBlank) continue;

          const obj: Record<string, unknown> = {};
          headers.forEach((h, idx) => {
            if (h) obj[h] = r[idx];
          });
          dataRows.push({ rowNum: i + 1, data: obj }); // +1 for 1-indexed sheet row
        }

        const existing = StorageService.getParticipants();
        const existingUids = new Set(existing.map((p) => p.uid));
        let nextUid = existing.reduce((max, p) => (p.uid > max ? p.uid : max), 1000) + 1;

        const toAdd: Participant[] = [];
        const errors: string[] = [];
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

          let uid: number;
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

          const dietary = dietaryRaw && VALID_DIETARY.includes(dietaryRaw)
            ? (dietaryRaw as Participant['dietary'])
            : 'Regular';

          toAdd.push({ uid, name, team, dietary });
          existingUids.add(uid);
        });

        const added = StorageService.bulkAddParticipants(toAdd);

        resolve({ success: true, added, skipped, errors });
      } catch (err) {
        resolve({
          success: false,
          added: 0,
          skipped: 0,
          errors: [`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`]
        });
      }
    };

    reader.onerror = () => {
      resolve({ success: false, added: 0, skipped: 0, errors: ['Failed to read file.'] });
    };

    reader.readAsBinaryString(file);
  });
}
