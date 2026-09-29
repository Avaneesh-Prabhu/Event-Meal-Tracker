import type {
  Participant,
  Meal,
  MealLog,
  AppUser,
  ScanResult,
  MealHistoryEntry
} from '../types';
import { socket } from './socket';

// ---------------------------------------------------------------------------
// Shared state lives on the server (server/db.js). The frontend keeps a local
// mirror that is refreshed from GET /api/state and from every Socket.IO
// "data-updated" broadcast, so every open device stays in sync.
// ---------------------------------------------------------------------------

interface SharedState {
  participants: Participant[];
  meals: Meal[];
  logs: MealLog[];
  users: AppUser[];
  timeOverride: string | null;
  mealHistory: MealHistoryEntry[];
  timezone: string;
}

export interface PendingTeamGroup {
  team: string;
  totalInTeam: number;
  servedCount: number;
  pendingCount: number;
  pendingParticipants: Participant[];
}

const KEYS = { CURRENT_USER: 'emt_current_user_v1' };

const state: SharedState = {
  participants: [],
  meals: [],
  logs: [],
  users: [],
  timeOverride: null,
  mealHistory: [],
  timezone: 'Asia/Kolkata'
};

let bootstrapped = false;
let hasLoadedState = false;
let socketBound = false;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json();
}

function applyState(next: Partial<SharedState>) {
  Object.assign(state, next);
  hasLoadedState = true;
  StorageService.notifySubscribers();
}

async function loadState() {
  try {
    applyState(await getJson<SharedState>('/api/state'));
  } catch (err) {
    console.error('Failed to load shared event data from server:', err);
  }
}

export class StorageService {
  private static subscribers: Array<() => void> = [];

  // ---- Lifecycle ----------------------------------------------------------
  static init(): void {
    if (typeof window === 'undefined') return;
    loadState();
    if (!socketBound) {
      socketBound = true;
      socket.on('data-updated', ({ state: next }: { state: SharedState }) => applyState(next));
      // Re-sync after a dropped connection so no update is missed.
      socket.on('connect', () => loadState());
    }
    bootstrapped = true;
  }

  static isBootstrapped(): boolean {
    return bootstrapped;
  }

  /** True once the first snapshot has arrived from the server. */
  static isReady(): boolean {
    return hasLoadedState;
  }

  static subscribe(callback: () => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  static notifySubscribers(): void {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('Subscriber notification error', err);
      }
    });
  }

  static resetToDefault(): Promise<void> {
    return postJson<{ state: SharedState }>('/api/reset')
      .then((r) => applyState(r.state))
      .catch((err) => console.error('Reset failed:', err));
  }

  // ---- Clock & meals ------------------------------------------------------
  static getTimeOverride(): string | null {
    return state.timeOverride;
  }

  static setTimeOverride(time: string | null): void {
    state.timeOverride = time;
    this.notifySubscribers();
    postJson('/api/time-override', { time }).catch((err) =>
      console.error('Failed to update simulated clock:', err)
    );
  }

  static getCurrentClockTime(): string {
    const override = this.getTimeOverride();
    if (override) return override;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: state.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date());
    const hours = parts.find((p) => p.type === 'hour')!.value;
    const minutes = parts.find((p) => p.type === 'minute')!.value;
    return `${hours}:${minutes}`;
  }

  /** Same rule as the server: end-exclusive, and handles windows crossing midnight. */
  static isTimeInWindow(curr: string, start: string, end: string): boolean {
    if (start <= end) return curr >= start && curr < end;
    return curr >= start || curr < end;
  }

  static getMeals(): Meal[] {
    return state.meals;
  }

  static updateMeals(meals: Meal[]): void {
    state.meals = meals;
    this.notifySubscribers();
    postJson('/api/meals', { meals }).catch((err) =>
      console.error('Failed to update meal schedule:', err)
    );
  }

  static getActiveMeal(): Meal | null {
    const now = this.getCurrentClockTime();
    for (const meal of this.getMeals()) {
      if (this.isTimeInWindow(now, meal.startTime, meal.endTime)) return meal;
    }
    return null;
  }

  static getNextMeal(): Meal | null {
    const now = this.getCurrentClockTime();
    const sorted = [...this.getMeals()].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return sorted.find((m) => m.startTime > now) || sorted[0] || null;
  }

  static getMealHistory(): MealHistoryEntry[] {
    return state.mealHistory;
  }

  // ---- Participants -------------------------------------------------------
  static getParticipants(): Participant[] {
    return state.participants;
  }

  static getParticipantByUid(uid: number): Participant | undefined {
    return this.getParticipants().find((p) => p.uid === uid);
  }

  /** Returns false if the UID already exists. */
  static addParticipant(p: Participant): boolean {
    const current = this.getParticipants();
    if (current.some((x) => x.uid === p.uid)) return false;
    state.participants = [...current, p];
    this.notifySubscribers();
    postJson('/api/participants', p).catch((err) =>
      console.error('Failed to save new participant:', err)
    );
    return true;
  }

  /** Returns how many participants were actually added (duplicates skipped). */
  static bulkAddParticipants(list: Participant[]): number {
    if (list.length === 0) return 0;
    const merged = [...this.getParticipants()];
    const seen = new Set(merged.map((p) => p.uid));
    const added: Participant[] = [];
    list.forEach((p) => {
      if (!seen.has(p.uid)) {
        merged.push(p);
        seen.add(p.uid);
        added.push(p);
      }
    });
    if (added.length > 0) {
      state.participants = merged;
      this.notifySubscribers();
      postJson('/api/participants/bulk', { participants: added }).catch((err) =>
        console.error('Failed to sync imported participants to server:', err)
      );
    }
    return added.length;
  }

  // ---- Users / auth -------------------------------------------------------
  static getUsers(): AppUser[] {
    return state.users;
  }

  static getCurrentUser(): AppUser | null {
    try {
      const raw = localStorage.getItem(KEYS.CURRENT_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static setCurrentUser(user: AppUser | null): void {
    if (user) localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    else localStorage.removeItem(KEYS.CURRENT_USER);
    this.notifySubscribers();
  }

  static login(
    usn: string,
    password: string
  ): { success: boolean; user?: AppUser; message?: string } {
    const clean = usn.trim().toUpperCase();
    const user = this.getUsers().find((u) => u.usn.toUpperCase() === clean);
    if (!user) return { success: false, message: `USN "${clean}" not registered.` };
    if (user.passwordHash !== password) {
      return { success: false, message: 'Invalid password. Please try again.' };
    }
    this.setCurrentUser(user);
    return { success: true, user };
  }

  static addVolunteer(
    name: string,
    usn: string,
    password: string,
    role: string = 'Volunteer'
  ): { success: boolean; message?: string } {
    const cleanUsn = usn.trim().toUpperCase();
    const users = this.getUsers();
    if (users.some((u) => u.usn.toUpperCase() === cleanUsn)) {
      return { success: false, message: `A volunteer with USN ${cleanUsn} is already registered.` };
    }
    const newUser: AppUser = {
      id: `user_${Date.now()}`,
      name: name.trim(),
      usn: cleanUsn,
      passwordHash: password,
      role: role.trim() || 'Volunteer',
      createdAt: new Date().toISOString()
    };
    state.users = [...users, newUser];
    this.notifySubscribers();
    postJson('/api/users', { name, usn: cleanUsn, password, role }).catch((err) =>
      console.error('Failed to save new volunteer to server:', err)
    );
    return { success: true };
  }

  // ---- Scanning -----------------------------------------------------------
  static getLogs(): MealLog[] {
    return state.logs;
  }

  /** The server is authoritative so two stations can't double-log the same meal. */
  static async processScan(rawInput: string | number, volunteerUsn: string): Promise<ScanResult> {
    try {
      const result = await postJson<ScanResult>('/api/scan', { rawInput, volunteerUsn });
      if (result.status === 'SUCCESS') await loadState();
      return result;
    } catch (err) {
      console.error('Scan request failed:', err);
      return {
        status: 'INVALID_PARTICIPANT',
        message: 'Could not reach the server. Check the connection and scan again.',
        timestamp: new Date().toISOString()
      };
    }
  }

  static undoScan(logId: string): boolean {
    const logs = this.getLogs();
    if (!logs.some((l) => l.id === logId)) return false;
    state.logs = logs.filter((l) => l.id !== logId);
    this.notifySubscribers();
    postJson('/api/scan/undo', { logId }).catch((err) =>
      console.error('Failed to sync undo to server:', err)
    );
    return true;
  }

  // ---- Dashboard ----------------------------------------------------------
  static getPendingGroupedByTeam(mealId: string): PendingTeamGroup[] {
    const participants = this.getParticipants();
    const isActive = this.getActiveMeal()?.id === mealId;

    // Finished meals are archived out of the live logs on rollover, so for a
    // non-active meal fall back to its most recent history entry.
    const archived = state.mealHistory.filter((h) => h.mealId === mealId);
    const archivedLogs = isActive || archived.length === 0 ? [] : archived[archived.length - 1].logs;

    const servedUids = new Set(
      [...this.getLogs(), ...archivedLogs].filter((l) => l.mealId === mealId).map((l) => l.participantUid)
    );

    const byTeam = new Map<string, Participant[]>();
    for (const p of participants) {
      if (!byTeam.has(p.team)) byTeam.set(p.team, []);
      byTeam.get(p.team)!.push(p);
    }

    const groups: PendingTeamGroup[] = [];
    byTeam.forEach((members, team) => {
      const pending = members.filter((m) => !servedUids.has(m.uid));
      groups.push({
        team,
        totalInTeam: members.length,
        servedCount: members.length - pending.length,
        pendingCount: pending.length,
        pendingParticipants: pending
      });
    });
    return groups.sort((a, b) => a.team.localeCompare(b.team));
  }
}
