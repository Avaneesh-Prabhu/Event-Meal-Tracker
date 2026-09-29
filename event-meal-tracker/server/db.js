import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDefaultDb } from './seedData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Set DATA_DIR to a persistent disk/volume in production so data survives restarts.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

// Event timezone: meal windows are evaluated in this zone on the server AND on
// every client, so devices in different timezones agree on the active meal.
export const EVENT_TIMEZONE = process.env.EVENT_TIMEZONE || 'Asia/Kolkata';

let memoryDb = null; // in-memory copy; disk is only read once at startup

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function migrate(db) {
  // Fill in any fields added in newer versions, never dropping existing data.
  const defaults = buildDefaultDb();
  const merged = { ...defaults, ...db };
  if (!Array.isArray(merged.mealHistory)) merged.mealHistory = [];
  if (merged.lastActiveMealId === undefined) merged.lastActiveMealId = null;
  // One-time fix for old seed accounts
  merged.users = (merged.users || []).map((u) => {
    if (u.usn === 'VOL005' && u.role === 'Volunteer' && u.passwordHash === 'Treasurer') {
      return { ...u, role: 'Treasurer', passwordHash: 'eventpass' };
    }
    if (u.usn === 'VOL006' && u.role === 'Volunteer' && u.passwordHash === 'Execom') {
      return { ...u, role: 'Execom', passwordHash: 'eventpass' };
    }
    return u;
  });
  return merged;
}

function loadFromDisk() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const fresh = buildDefaultDb();
    persist(fresh);
    return fresh;
  }
  try {
    return migrate(JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')));
  } catch (err) {
    // NEVER silently overwrite a file we couldn't parse: keep a backup copy
    // so the event data can be recovered by hand.
    console.error('Failed to read db.json:', err);
    const backup = `${DB_PATH}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(DB_PATH, backup); console.error('Backed up unreadable db to', backup); } catch {}
    return buildDefaultDb();
  }
}

/** Atomic write: temp file + rename, so a crash mid-write can't leave a half-written db.json. */
function persist(db) {
  ensureDir();
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

export function readDB() {
  if (!memoryDb) memoryDb = loadFromDisk();
  return memoryDb;
}

export function writeDB(db) {
  memoryDb = db;
  persist(db);
}

/** Returns the full shared state exactly as the frontend's StorageService expects it. */
export function getFullState() {
  const db = readDB();
  return {
    participants: db.participants,
    meals: db.meals,
    logs: db.logs,
    users: db.users,
    timeOverride: db.timeOverride ?? null,
    mealHistory: db.mealHistory || [],
    timezone: EVENT_TIMEZONE,
    serverTime: getCurrentClockTime(db)
  };
}

export function resetToDefault() {
  const fresh = buildDefaultDb();
  fresh.lastActiveMealId = getActiveMeal(fresh)?.id ?? null;
  writeDB(fresh);
  return getFullState();
}

// --- Participants ---
export function getParticipants() {
  return readDB().participants;
}

export function addParticipant(p) {
  const db = readDB();
  if (db.participants.some((item) => item.uid === p.uid)) {
    return { success: false, message: `UID #${p.uid} is already registered.` };
  }
  db.participants.push(p);
  writeDB(db);
  return { success: true, participants: db.participants };
}

/**
 * Bulk-add participants, skipping any UID that already exists in the DB
 * (or duplicated within the same batch).
 */
export function bulkAddParticipants(newParticipants) {
  const db = readDB();
  const existingUids = new Set(db.participants.map((p) => p.uid));
  const addedParticipants = [];

  for (const p of newParticipants) {
    if (existingUids.has(p.uid)) continue;
    db.participants.push(p);
    existingUids.add(p.uid);
    addedParticipants.push(p);
  }

  writeDB(db);
  return { added: addedParticipants.length, addedParticipants, participants: db.participants };
}

// --- Meals & shared clock ---
export function setMeals(meals) {
  const db = readDB();
  db.meals = meals;
  writeDB(db);
  return db.meals;
}

export function setTimeOverride(time) {
  const db = readDB();
  db.timeOverride = time || null;
  writeDB(db);
  return db.timeOverride;
}

export function getCurrentClockTime(db) {
  const override = db.timeOverride;
  if (override) return override;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EVENT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const hours = parts.find((p) => p.type === 'hour').value;
  const minutes = parts.find((p) => p.type === 'minute').value;
  return `${hours}:${minutes}`;
}

/** Handles windows crossing midnight (e.g., 22:00 to 02:00) */
export function isTimeInWindow(curr, start, end) {
  if (start <= end) {
    return curr >= start && curr < end;
  }
  return curr >= start || curr < end;
}

export function getActiveMeal(db) {
  const curr = getCurrentClockTime(db);
  for (const meal of db.meals) {
    if (isTimeInWindow(curr, meal.startTime, meal.endTime)) {
      return meal;
    }
  }
  return null;
}

export function getNextMeal(db) {
  const curr = getCurrentClockTime(db);
  const sorted = [...db.meals].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const next = sorted.find((m) => m.startTime > curr);
  if (next) return next;
  return sorted[0] || null;
}

/**
 * Meal rollover: when the active meal changes (a meal ends or the next one
 * starts), the finished meal's logs are moved into db.mealHistory and removed
 * from the live logs, so the next meal always starts from a clean slate while
 * the old meal's data stays stored. Returns true if anything changed.
 */
export function rolloverIfNeeded() {
  const db = readDB();
  const activeId = getActiveMeal(db)?.id ?? null;
  const lastId = db.lastActiveMealId ?? null;
  if (activeId === lastId) return false;

  if (lastId) {
    const finishedLogs = db.logs.filter((l) => l.mealId === lastId);
    if (finishedLogs.length > 0) {
      const meal = db.meals.find((m) => m.id === lastId);
      db.mealHistory = db.mealHistory || [];
      db.mealHistory.push({
        id: `hist_${Date.now()}`,
        mealId: lastId,
        mealName: meal ? meal.name : finishedLogs[0].mealName,
        archivedAt: new Date().toISOString(),
        totalServed: finishedLogs.length,
        logs: finishedLogs
      });
      db.logs = db.logs.filter((l) => l.mealId !== lastId);
    }
  }
  db.lastActiveMealId = activeId;
  writeDB(db);
  return true;
}

// --- Users & Authentication ---
export function getUsers() {
  return readDB().users;
}

export function addVolunteer(name, usn, password, role = 'Volunteer') {
  const db = readDB();
  const cleanUsn = usn.trim().toUpperCase();

  if (db.users.some((u) => u.usn.toUpperCase() === cleanUsn)) {
    return { success: false, message: `A volunteer with USN ${cleanUsn} is already registered.` };
  }

  const newUser = {
    id: `user_${Date.now()}`,
    name: name.trim(),
    usn: cleanUsn,
    passwordHash: password,
    role: role.trim() || 'Volunteer',
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDB(db);
  return { success: true, user: newUser, users: db.users };
}

// --- Meal Logs & Scanning (server is authoritative so two volunteers
// scanning at the same instant can't both log the same meal) ---
export function getLogs() {
  return readDB().logs;
}

export function processScan(rawInput, volunteerUsn) {
  rolloverIfNeeded();
  const db = readDB();
  const nowIso = new Date().toISOString();

  // 1. Extract numeric UID (handles pure number, string number, or formatted
  // QR text like "UID:1004" or "https://.../1004")
  let uid;
  if (typeof rawInput === 'number') {
    uid = rawInput;
  } else {
    const cleaned = String(rawInput).trim();
    const match = cleaned.match(/\b\d{3,6}\b/);
    if (match) {
      uid = parseInt(match[0], 10);
    } else {
      const parsed = parseInt(cleaned, 10);
      if (isNaN(parsed)) {
        return { status: 'INVALID_PARTICIPANT', message: `Unrecognized QR format: "${rawInput}"`, timestamp: nowIso };
      }
      uid = parsed;
    }
  }

  // 2. Lookup Participant
  const participant = db.participants.find((p) => p.uid === uid);
  if (!participant) {
    return { status: 'INVALID_PARTICIPANT', message: `Participant #${uid} not found in guest registry.`, timestamp: nowIso };
  }

  // 3. Check Active Meal
  const activeMeal = getActiveMeal(db);
  if (!activeMeal) {
    const nextMeal = getNextMeal(db);
    return {
      status: 'NO_ACTIVE_MEAL',
      message: `No meal active right now (Current time: ${getCurrentClockTime(db)}). Next: ${nextMeal ? nextMeal.name + ' at ' + nextMeal.startTime : 'None scheduled'}`,
      participant,
      timestamp: nowIso
    };
  }

  // 4. Check if already scanned for this active meal
  const existingLog = db.logs.find((log) => log.participantUid === uid && log.mealId === activeMeal.id);
  if (existingLog) {
    return {
      status: 'ALREADY_SCANNED',
      message: `${participant.name} already fed for ${activeMeal.name}`,
      participant,
      meal: activeMeal,
      existingLog,
      timestamp: nowIso
    };
  }

  // 5. Successful first scan - log entry
  const newLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    participantUid: participant.uid,
    participantName: participant.name,
    team: participant.team,
    mealId: activeMeal.id,
    mealName: activeMeal.name,
    scannedAt: nowIso,
    scannedByUsn: volunteerUsn || 'VOLUNTEER'
  };

  db.logs.unshift(newLog);
  writeDB(db);

  return {
    status: 'SUCCESS',
    message: `${participant.name} marked for ${activeMeal.name}`,
    participant,
    meal: activeMeal,
    timestamp: nowIso,
    logId: newLog.id
  };
}

export function undoScan(logId) {
  const db = readDB();
  const index = db.logs.findIndex((l) => l.id === logId);
  if (index === -1) return false;
  db.logs.splice(index, 1);
  writeDB(db);
  return true;
}
