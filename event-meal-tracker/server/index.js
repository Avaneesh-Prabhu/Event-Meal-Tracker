import express from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

import {
  getFullState,
  resetToDefault,
  addParticipant,
  bulkAddParticipants,
  setMeals,
  setTimeOverride,
  getUsers,
  addVolunteer,
  processScan,
  undoScan,
  rolloverIfNeeded
} from './db.js';
import { parseParticipantsWorkbook } from './participantImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const DIST_DIR = path.join(__dirname, '..', 'dist');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Accept the uploaded file in memory — files are small (a guest list),
// so there's no need to write the raw upload to disk first.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Broadcasts the full shared state to every connected client (dashboard,
// scanner stations, registry, etc.) so everyone stays in sync. The state is
// small (an event's worth of participants/logs), so sending the whole thing
// on every change is simpler and more robust than diffing.
function broadcastState(reason) {
  io.emit('data-updated', { reason, state: getFullState() });
}

io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);
  // Send the newly-connected client the current state right away, in case
  // it missed the initial REST fetch or reconnected after a drop.
  socket.emit('data-updated', { reason: 'initial-sync', state: getFullState() });

  socket.on('disconnect', () => {
    console.log(`[socket] client disconnected: ${socket.id}`);
  });
});

// Check every few seconds whether a meal window has ended/started; if so,
// archive the finished meal and push the fresh state to every device.
setInterval(() => {
  try {
    if (rolloverIfNeeded()) broadcastState('meal-rollover');
  } catch (err) {
    console.error('Rollover check failed:', err);
  }
}, 5000);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Full bootstrap snapshot for a freshly-loaded client.
app.get('/api/state', (_req, res) => {
  res.json(getFullState());
});

app.get('/api/participants', (_req, res) => {
  res.json({ participants: getFullState().participants });
});

app.post('/api/participants', (req, res) => {
  const { uid, name, team, dietary, notes } = req.body || {};
  if (!uid || !name || !team) {
    return res.status(400).json({ success: false, message: 'uid, name and team are required.' });
  }

  const result = addParticipant({ uid: Number(uid), name, team, dietary, notes });
  if (result.success) {
    broadcastState('participant-added');
  }
  res.json(result);
});

// Used by the client-side Excel import flow (src/services/excelImport.ts
// parses the workbook in-browser, then hands the resulting rows here so
// every connected dashboard picks them up).
app.post('/api/participants/bulk', (req, res) => {
  const participants = req.body?.participants;
  if (!Array.isArray(participants)) {
    return res.status(400).json({ success: false, added: 0, message: 'participants array is required.' });
  }

  const { added, participants: all } = bulkAddParticipants(participants);
  if (added > 0) {
    broadcastState('participants-imported');
  }
  res.json({ success: true, added, totalParticipants: all.length });
});

app.post('/api/import-participants', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      added: 0,
      skipped: 0,
      errors: ['No file uploaded. Attach the spreadsheet under the "file" field.']
    });
  }

  try {
    const { toAdd, errors, skipped } = parseParticipantsWorkbook(req.file.buffer);
    const { added, participants } = bulkAddParticipants(toAdd);

    if (added > 0) {
      broadcastState('participants-imported');
    }

    res.json({ success: true, added, skipped, errors, totalParticipants: participants.length });
  } catch (err) {
    console.error('Import failed:', err);
    res.status(500).json({
      success: false,
      added: 0,
      skipped: 0,
      errors: [`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`]
    });
  }
});

app.post('/api/meals', (req, res) => {
  const meals = req.body?.meals;
  if (!Array.isArray(meals)) {
    return res.status(400).json({ success: false, message: 'meals array is required.' });
  }
  setMeals(meals);
  rolloverIfNeeded();
  broadcastState('meals-updated');
  res.json({ success: true, meals });
});

app.post('/api/time-override', (req, res) => {
  const time = req.body?.time ?? null;
  const stored = setTimeOverride(time);
  rolloverIfNeeded();
  broadcastState('time-override-updated');
  res.json({ success: true, timeOverride: stored });
});

app.get('/api/users', (_req, res) => {
  res.json({ users: getUsers() });
});

app.post('/api/users', (req, res) => {
  const { name, usn, password, role } = req.body || {};
  if (!name || !usn || !password) {
    return res.status(400).json({ success: false, message: 'name, usn and password are required.' });
  }
  const result = addVolunteer(name, usn, password, role);
  if (result.success) {
    broadcastState('volunteer-added');
  }
  res.json(result);
});

app.post('/api/scan', (req, res) => {
  const { rawInput, volunteerUsn } = req.body || {};
  if (rawInput === undefined || rawInput === null || rawInput === '') {
    return res.status(400).json({ status: 'INVALID_PARTICIPANT', message: 'No UID provided.', timestamp: new Date().toISOString() });
  }
  const result = processScan(rawInput, volunteerUsn);
  if (result.status === 'SUCCESS') {
    broadcastState('scan-logged');
  }
  res.json(result);
});

app.post('/api/scan/undo', (req, res) => {
  const { logId } = req.body || {};
  const success = undoScan(logId);
  if (success) {
    broadcastState('scan-undone');
  }
  res.json({ success });
});

app.post('/api/reset', (_req, res) => {
  const state = resetToDefault();
  broadcastState('reset-to-default');
  res.json({ success: true, state });
});

// Serve the built frontend (npm run build -> dist/) when it exists, so a
// single deployed service can host both the API and the site — no separate
// static host, no CORS to configure between two origins.
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log('Serving built frontend from', DIST_DIR);
} else {
  console.log('No dist/ build found — run `npm run build` to serve the frontend from this server too.');
}

server.listen(PORT, () => {
  console.log(`Event Meal Tracker server listening on http://localhost:${PORT}`);
});
