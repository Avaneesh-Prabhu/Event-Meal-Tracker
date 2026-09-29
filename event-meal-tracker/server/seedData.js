// Default/seed data for a brand-new deployment (fresh db.json) and for the
// "Reset Seed Data" action. Mirrors the shape of src/types.ts.

export const SEED_MEALS = [
  {
    id: 'meal_breakfast',
    name: 'Breakfast',
    startTime: '07:30',
    endTime: '10:30',
    description: 'South Indian & Continental Breakfast Buffet'
  },
  {
    id: 'meal_lunch',
    name: 'Lunch',
    startTime: '12:30',
    endTime: '15:30',
    description: 'Executive Lunch spread & Rice Bowls'
  },
  {
    id: 'meal_snacks',
    name: 'Snacks',
    startTime: '16:30',
    endTime: '18:30',
    description: 'Tea, Filter Coffee & Evening Refreshments'
  },
  {
    id: 'meal_dinner',
    name: 'Dinner',
    startTime: '19:30',
    endTime: '23:59',
    description: 'Deluxe Dinner Buffet & Desserts'
  }
];

export const SEED_USERS = [
  { id: 'user_1', name: 'Pavan', usn: 'VOL001', passwordHash: 'eventpass', role: 'Student Chair', createdAt: new Date().toISOString() },
  { id: 'user_2', name: 'Nishita', usn: 'VOL002', passwordHash: 'eventpass', role: 'Student Vice-chair', createdAt: new Date().toISOString() },
  { id: 'user_3', name: 'Bhoomika', usn: 'VOL003', passwordHash: 'eventpass', role: 'Web Developer', createdAt: new Date().toISOString() },
  { id: 'user_4', name: 'Tanmayi', usn: 'VOL004', passwordHash: 'eventpass', role: 'Secretary', createdAt: new Date().toISOString() },
  { id: 'user_5', name: 'Gokul', usn: 'VOL005', passwordHash: 'eventpass', role: 'Treasurer', createdAt: new Date().toISOString() },
  { id: 'user_6', name: 'Tanushree', usn: 'VOL006', passwordHash: 'eventpass', role: 'Execom', createdAt: new Date().toISOString() }
];

export const SEED_PARTICIPANTS = [];

export const SEED_LOGS = [];

export function buildDefaultDb() {
  return {
    participants: SEED_PARTICIPANTS,
    meals: SEED_MEALS,
    logs: SEED_LOGS,
    users: SEED_USERS,
    timeOverride: null,
    mealHistory: [],
    lastActiveMealId: null
  };
}
