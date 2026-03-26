/**
 * Centralized localStorage abstraction.
 * All keys and read/write logic live here — one place to update them.
 */

import { Session, WeeklyPlan, BreathingPattern } from './types';

const KEYS = {
  PUBKEY: 'relaxyz_pubkey',
  SESSIONS: 'relaxyz_sessions',
  WEEKLY_PLAN: 'relaxyz_weekly_plan',
  GOAL_DAILY: 'relaxyz_goal_daily',
  ACHIEVEMENT_TREE: 'relaxyz_achievement_tree',
  ACHIEVEMENTS: 'relaxyz_achievements',
  TOTAL_SHARES: 'relaxyz_total_shares',
  CUSTOM_PATTERNS: 'relaxyz_custom_patterns',
} as const;

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    console.warn(`[storage] Failed to parse key "${key}", using fallback.`);
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[storage] Failed to write key "${key}":`, e);
  }
}

const SITE_START = new Date('2026-03-20').getTime();

export const storage = {
  getPubkey: (): string | null => localStorage.getItem(KEYS.PUBKEY),
  setPubkey: (key: string): void => { localStorage.setItem(KEYS.PUBKEY, key); },
  removePubkey: (): void => { localStorage.removeItem(KEYS.PUBKEY); },

  getSessions: (): Session[] => {
    const all = safeGet<Session[]>(KEYS.SESSIONS, []);
    return all.filter((s) => s.timestamp >= SITE_START);
  },
  saveSessions: (sessions: Session[]): void => { safeSet(KEYS.SESSIONS, sessions); },

  getWeeklyPlan: (): WeeklyPlan => {
    const defaultPlan: WeeklyPlan = {
      days: { Mon: false, Tue: false, Wed: false, Thu: false, Fri: false, Sat: false, Sun: false },
      dailyGoalMinutes: 5,
    };
    return safeGet<WeeklyPlan>(KEYS.WEEKLY_PLAN, defaultPlan);
  },
  saveWeeklyPlan: (plan: WeeklyPlan): void => { safeSet(KEYS.WEEKLY_PLAN, plan); },

  getDailyGoal: (): number => {
    const raw = localStorage.getItem(KEYS.GOAL_DAILY);
    return raw ? parseInt(raw, 10) : 10;
  },
  saveDailyGoal: (minutes: number): void => { localStorage.setItem(KEYS.GOAL_DAILY, minutes.toString()); },

  getAchievements: (): Set<string> => {
    const arr = safeGet<string[]>(KEYS.ACHIEVEMENTS, []);
    return new Set(arr);
  },
  saveAchievements: (achievements: Set<string>): void => { safeSet(KEYS.ACHIEVEMENTS, Array.from(achievements)); },

  getTotalShares: (): number => {
    const raw = localStorage.getItem(KEYS.TOTAL_SHARES);
    return raw ? parseInt(raw, 10) : 0;
  },
  saveTotalShares: (n: number): void => { localStorage.setItem(KEYS.TOTAL_SHARES, n.toString()); },

  getCustomPatterns: (): BreathingPattern[] => safeGet<BreathingPattern[]>(KEYS.CUSTOM_PATTERNS, []),
  saveCustomPatterns: (patterns: BreathingPattern[]): void => { safeSet(KEYS.CUSTOM_PATTERNS, patterns); },

  clearAllData: (): void => { Object.values(KEYS).forEach((k) => localStorage.removeItem(k)); },
};
