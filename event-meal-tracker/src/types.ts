export interface Participant {
  uid: number;
  name: string;
  team: string;
  dietary?: 'Regular' | 'Vegetarian' | 'Vegan' | 'Jain' | 'Gluten-Free';
  notes?: string;
}

export interface Meal {
  id: string;
  name: string;
  startTime: string; // "HH:mm" (24-hour format e.g. "07:30")
  endTime: string;   // "HH:mm" (24-hour format e.g. "10:00")
  description?: string;
}

export interface MealLog {
  id: string;
  participantUid: number;
  participantName: string;
  team: string;
  mealId: string;
  mealName: string;
  scannedAt: string; // ISO string
  scannedByUsn: string;
}

export interface AppUser {
  id: string;
  name: string;
  usn: string; // unique login id e.g. "VOL001"
  passwordHash: string; // representation of hashed/stored password
  role: string; // designation/title, e.g. "Organizer", "Volunteer", "Treasurer"
  createdAt: string;
}

export type ScanStatus = 
  | 'SUCCESS'             // First scan for this meal
  | 'ALREADY_SCANNED'     // Already logged for this meal
  | 'NO_ACTIVE_MEAL'      // No meal scheduled right now
  | 'INVALID_PARTICIPANT' // UID not found in registry
  | 'IDLE';

export interface ScanResult {
  status: ScanStatus;
  message: string;
  participant?: Participant;
  meal?: Meal;
  existingLog?: MealLog;
  timestamp: string;
  logId?: string;
}

export interface MealStatusInfo {
  activeMeal: Meal | null;
  nextMeal: Meal | null;
  currentTimeString: string;
  timeRemaining?: string;
}

export interface MealHistoryEntry {
  id: string;
  mealId: string;
  mealName: string;
  archivedAt: string; // ISO string
  totalServed: number;
  logs: MealLog[];
}
