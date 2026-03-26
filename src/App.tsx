/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relaxyz — App.tsx (refactored)
 *
 * Key changes vs original:
 *  - All localStorage access goes through storage.ts (no raw localStorage calls)
 *  - nostr imports match the actual exports in nostr.ts
 *  - No silent catch blocks — errors are logged
 *  - publicSessions typed as NostrEvent[] instead of any[]
 *  - nostrProfiles typed as Record<string, NostrProfile>
 *  - Clear Data option added in Goals modal
 *  - Loading state shown while fetching public sessions
 *  - @google/genai removed from imports (not used here)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, animate, useTransform } from 'motion/react';
import {
  Wind, LogIn, LogOut, Play, Pause as PauseIcon, RotateCcw,
  ChevronRight, ChevronLeft, CheckCircle2, Share2, User, Plus,
  Trash2, X, Volume2, VolumeX, Waves, CloudRain, Trees, Settings,
  Clock, Timer, TrendingUp, Award, Calendar, BarChart2, Trophy,
  TreeDeciduous, Users, Zap, Sun, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import confetti from 'canvas-confetti';
import {
  BREATHING_PATTERNS, BreathingPattern, BreathingPhase,
  SoundType, SOUND_OPTIONS, Session, WeeklyPlan,
} from './types';
import {
  loginWithNostr, postSessionToNostr, postPatternToNostr,
  postAchievementToNostr, postStatsToNostr, postSessionToServerNostr,
  fetchHistoryFromNostr, fetchPublicSessions, fetchNostrProfiles, getShortNpub,
  NostrEvent, NostrProfile,
} from './nostr';
import { storage } from './storage';

// ─── Constants ────────────────────────────────────────────────────────────

const ACHIEVEMENTS = [
  { id: 'first_breath', name: 'First Breath', description: 'Complete your first session', icon: <Wind className="w-4 h-4" /> },
  { id: 'johnny_appleseed', name: 'Johnny Appleseed', description: 'Grow a full tree (100% growth)', icon: <TreeDeciduous className="w-4 h-4" /> },
  { id: 'early_bird', name: 'Early Bird', description: 'Session before 8 AM', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'night_owl', name: 'Night Owl', description: 'Session after 10 PM', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'streak_3', name: 'Consistency King', description: '3-day streak', icon: <Trophy className="w-4 h-4" /> },
  { id: 'streak_10', name: 'Zen Master', description: '10-day streak', icon: <Award className="w-4 h-4" /> },
  { id: 'streak_30', name: 'Enlightened', description: '30-day streak', icon: <Award className="w-4 h-4" /> },
  { id: 'deep_diver', name: 'Deep Diver', description: 'Complete a 20+ minute session', icon: <Waves className="w-4 h-4" /> },
  { id: 'century_club', name: 'Century Club', description: 'Complete 100 total sessions', icon: <Trophy className="w-4 h-4" /> },
  { id: 'marathon', name: 'Breath Marathon', description: '1 hour of total breathing time', icon: <Timer className="w-4 h-4" /> },
  { id: 'eternal_breath', name: 'Eternal Breath', description: '10 hours of total breathing time', icon: <Timer className="w-4 h-4" /> },
  { id: 'week_planner', name: 'Architect of Calm', description: 'Set up a weekly breathing plan', icon: <Calendar className="w-4 h-4" /> },
  { id: 'pattern_explorer', name: 'Pattern Explorer', description: 'Create 5 custom patterns', icon: <Zap className="w-4 h-4" /> },
  { id: 'social_breather', name: 'Social Breather', description: 'Share 10 items to Nostr', icon: <Share2 className="w-4 h-4" /> },
  { id: 'weekend_warrior', name: 'Weekend Warrior', description: 'Session on Sat & Sun', icon: <Sun className="w-4 h-4" /> },
  { id: 'perfect_week', name: 'Perfect Week', description: 'Session every day of the week', icon: <Calendar className="w-4 h-4" /> },
  { id: 'early_bird_5', name: 'Morning Ritual', description: '5 sessions before 8 AM', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'night_owl_5', name: 'Midnight Zen', description: '5 sessions after 10 PM', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'deep_diver_60', name: 'Abyssal Breather', description: 'Complete a 60-minute session', icon: <Waves className="w-4 h-4" /> },
  { id: 'streak_100', name: 'Immortal', description: '100-day streak', icon: <Award className="w-4 h-4" /> },
];

// ─── Sub-components ───────────────────────────────────────────────────────

const BreathingVisuals = ({
  scale,
  elapsedSeconds,
  timeGoal,
  currentPhase,
}: {
  scale: ReturnType<typeof useMotionValue<number>>;
  elapsedSeconds: number;
  timeGoal: number | null;
  currentPhase: BreathingPhase | undefined;
}) => {
  const growth = timeGoal
    ? Math.min(elapsedSeconds / timeGoal, 1)
    : Math.min(elapsedSeconds / 300, 1);
  const scaleX = useTransform(scale, [0.8, 1.5], [0.95, 1.2]);
  const scaleY = useTransform(scale, [0.8, 1.5], [0.8, 1.5]);

  return (
    <div className="relative w-full h-72 flex flex-col items-center justify-end mb-8 overflow-hidden rounded-3xl bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-neutral-800 shadow-xl">
      {/* Mt. Fuji Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40">
        <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="moonGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF9E0" />
              <stop offset="70%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#F5D142" />
            </radialGradient>
            <filter id="moonGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <path d="M0 200 L50 160 L120 180 L200 140 L300 170 L400 150 L400 200 Z" fill="#1E293B" />
          <path d="M100 200 L180 70 L220 70 L300 200 Z" fill="#334155" />
          <path d="M180 70 L190 55 L210 55 L220 70 Z" fill="#94A3B8" />
          <g filter="url(#moonGlow)">
            <circle cx="340" cy="40" r="18" fill="url(#moonGradient)" opacity="0.8" />
            <circle cx="334" cy="36" r="2.5" fill="#E2C14D" opacity="0.4" />
            <circle cx="346" cy="44" r="3.5" fill="#E2C14D" opacity="0.4" />
            <circle cx="342" cy="32" r="1.5" fill="#E2C14D" opacity="0.4" />
            <circle cx="332" cy="46" r="2" fill="#E2C14D" opacity="0.4" />
          </g>
        </svg>
      </div>

      {/* Zen Grass */}
      <div className="absolute bottom-0 left-0 w-full h-12 z-10 pointer-events-none">
        <div className="relative w-full h-full">
          {[...Array(6)].map((_, i) => {
            const flowerGrowth = Math.min(growth * 2.5, 1);
            return (
              <div key={i} className="absolute bottom-0" style={{ left: `${15 + i * 15}%`, opacity: 0.4 + growth * 0.4 }}>
                <svg width="40" height="30" viewBox="0 0 40 30">
                  <path d="M5 30 Q10 15 15 30 M15 30 Q20 10 25 30 M25 30 Q30 18 35 30" stroke="#48BB78" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                  {flowerGrowth > 0.2 && (
                    <motion.g initial={{ scale: 0 }} animate={{ scale: flowerGrowth }} style={{ originX: '20px', originY: '15px' }}>
                      <circle cx="20" cy="12" r="3" fill="#F687B3" />
                      <circle cx="10" cy="18" r="2" fill="#F687B3" />
                      <circle cx="30" cy="20" r="2" fill="#F687B3" />
                    </motion.g>
                  )}
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-end justify-center gap-16 w-full relative pb-0 z-20">
        {/* Mochi Cat */}
        <div className="relative z-10 pointer-events-none translate-y-[12px] -translate-x-8">
          <svg width="120" height="120" viewBox="0 -40 100 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <motion.g style={{ scaleX, scaleY, originX: '50px', originY: '89px' }}>
              <ellipse cx="38" cy="86" rx="6" ry="3" fill="white" stroke="#F0F0F0" strokeWidth="0.5" />
              <ellipse cx="62" cy="86" rx="6" ry="3" fill="white" stroke="#F0F0F0" strokeWidth="0.5" />
              <path d="M15 60 Q15 25 50 25 T85 60 Q85 85 50 85 T15 60" fill="white" stroke="#F0F0F0" strokeWidth="1" />
              <path d="M25 35 L20 20 L35 28 Z" fill="#FFCDD2" />
              <path d="M75 35 L80 20 L65 28 Z" fill="#FFCDD2" />
              <motion.g animate={{ y: [0, -0.5, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
                {currentPhase?.name === 'Inhale' ? (
                  <>
                    <path d="M35 52 Q40 48 45 52" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
                    <path d="M55 52 Q60 48 65 52" stroke="#333" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <ellipse cx="40" cy="52" rx="3" ry="4" fill="#333" />
                    <ellipse cx="60" cy="52" rx="3" ry="4" fill="#333" />
                    <circle cx="40.5" cy="50.5" r="1" fill="white" />
                    <circle cx="60.5" cy="50.5" r="1" fill="white" />
                  </>
                )}
                <path d="M48 58 Q50 60 52 58" stroke="#333" strokeWidth="1" fill="none" />
                <path d="M46 62 Q48 64 50 62 Q52 64 54 62" stroke="#333" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                <line x1="32" y1="58" x2="22" y2="56" stroke="#DDD" strokeWidth="1" />
                <line x1="32" y1="61" x2="20" y2="62" stroke="#DDD" strokeWidth="1" />
                <line x1="68" y1="58" x2="78" y2="56" stroke="#DDD" strokeWidth="1" />
                <line x1="68" y1="61" x2="80" y2="62" stroke="#DDD" strokeWidth="1" />
              </motion.g>
            </motion.g>
          </svg>
        </div>

        {/* Growing Cherry Blossom Tree */}
        <motion.div style={{ scale: 0.85 + growth * 0.35, originY: 1, opacity: 0.95 }} className="relative z-0">
          <svg width="140" height="200" viewBox="0 0 200 300" fill="none" xmlns="http://www.w3.org/2000/svg">
            <motion.path d={`M100 300 Q105 ${300 - growth * 75} 100 ${300 - growth * 160}`} stroke="#4E342E" strokeWidth={4 + growth * 6} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
            {growth > 0.3 && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <path d={`M100 ${300 - 0.3 * 160} Q120 ${300 - 0.4 * 160} 140 ${300 - 0.5 * 160}`} stroke="#4E342E" strokeWidth={2 + growth * 2} strokeLinecap="round" />
                {growth > 0.45 && (
                  <g transform={`translate(140, ${300 - 0.5 * 160}) scale(${0.5 + growth * 0.5})`}>
                    <circle cx="0" cy="0" r="12" fill="#F8BBD0" opacity="0.85" />
                    <circle cx="8" cy="-5" r="10" fill="#FCE4EC" opacity="0.85" />
                    <circle cx="-5" cy="-8" r="9" fill="#F48FB1" opacity="0.85" />
                  </g>
                )}
              </motion.g>
            )}
            {growth > 0.5 && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <path d={`M100 ${300 - 0.5 * 160} Q80 ${300 - 0.6 * 160} 60 ${300 - 0.7 * 160}`} stroke="#4E342E" strokeWidth={1.5 + growth * 2} strokeLinecap="round" />
                {growth > 0.65 && (
                  <g transform={`translate(60, ${300 - 0.7 * 160}) scale(${0.5 + growth * 0.5})`}>
                    <circle cx="0" cy="0" r="14" fill="#F48FB1" opacity="0.85" />
                    <circle cx="-8" cy="-5" r="11" fill="#F8BBD0" opacity="0.85" />
                    <circle cx="5" cy="-8" r="10" fill="#F06292" opacity="0.85" />
                  </g>
                )}
              </motion.g>
            )}
            {growth > 0.75 && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <path d={`M100 ${300 - 0.75 * 160} L100 ${300 - growth * 160}`} stroke="#4E342E" strokeWidth={1 + growth * 2} strokeLinecap="round" />
                <g transform={`translate(100, ${300 - growth * 160}) scale(${0.4 + growth * 0.6})`}>
                  <circle cx="0" cy="-10" r="18" fill="#F06292" opacity="0.95" />
                  <circle cx="-12" cy="0" r="15" fill="#F48FB1" opacity="0.9" />
                  <circle cx="12" cy="0" r="15" fill="#F8BBD0" opacity="0.9" />
                  <circle cx="0" cy="10" r="12" fill="#EC407A" opacity="0.8" />
                  {growth > 0.9 && (
                    <>
                      <circle cx="-5" cy="-5" r="2.5" fill="white" opacity="0.7" />
                      <circle cx="8" cy="2" r="2.5" fill="white" opacity="0.7" />
                      <circle cx="0" cy="8" r="2.5" fill="white" opacity="0.7" />
                    </>
                  )}
                </g>
              </motion.g>
            )}
          </svg>
        </motion.div>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────
  const [pubkey, setPubkey] = useState<string | null>(() => storage.getPubkey());
  const [customPatterns, setCustomPatterns] = useState<BreathingPattern[]>(() => storage.getCustomPatterns());
  const [selectedPattern, setSelectedPattern] = useState<BreathingPattern | null>(null);
  const [isBreathing, setIsBreathing] = useState(false);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [timeLeftInPhase, setTimeLeftInPhase] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showDurationSelector, setShowDurationSelector] = useState(false);
  const [pendingPattern, setPendingPattern] = useState<BreathingPattern | null>(null);
  const [selectedSound, setSelectedSound] = useState<SoundType>('forest');
  const [goalMinutes, setGoalMinutes] = useState<string>('00');
  const [goalSeconds, setGoalSeconds] = useState<string>('00');
  const [timeGoal, setTimeGoal] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessions, setSessions] = useState<Session[]>(() => storage.getSessions());
  const [showProgress, setShowProgress] = useState(false);
  const [activityTimeframe, setActivityTimeframe] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('week');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [hoveredTimeframe, setHoveredTimeframe] = useState<'day' | 'week' | 'month' | 'year' | 'all' | null>(null);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [visualType, setVisualType] = useState<'minimal' | 'cat'>('minimal');
  const [showGoals, setShowGoals] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan>(() => storage.getWeeklyPlan());
  const [profileUser, setProfileUser] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<{
    sessions: Session[];
    achievements: Set<string>;
    streak: number;
    isLoading: boolean;
  } | null>(null);
  const [dailyGoal, setDailyGoal] = useState(() => storage.getDailyGoal());
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [lastCreatedPattern, setLastCreatedPattern] = useState<BreathingPattern | null>(null);
  const [lastEarnedAchievement, setLastEarnedAchievement] = useState<string | null>(null);
  const [showAchievement, setShowAchievement] = useState(false);
  const [earnedAchievements, setEarnedAchievements] = useState<Set<string>>(() => storage.getAchievements());
  const [selectedStatDetail, setSelectedStatDetail] = useState<'streak' | 'best' | 'time' | 'sessions' | null>(null);
  const [totalShares, setTotalShares] = useState(() => storage.getTotalShares());
  const [publicSessions, setPublicSessions] = useState<NostrEvent[]>([]);
  const [nostrProfiles, setNostrProfiles] = useState<Record<string, NostrProfile>>({});
  const [isLoadingPublic, setIsLoadingPublic] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Custom pattern form
  const [newName, setNewName] = useState('');
  const [newInhale, setNewInhale] = useState(4);
  const [newHold, setNewHold] = useState(4);
  const [newExhale, setNewExhale] = useState(4);
  const [newPause, setNewPause] = useState(0);

  const SITE_START_DATE = useMemo(() => new Date('2026-03-20'), []);
  const scale = useMotionValue(0.8);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const backgroundNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const forestGainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const lastPhaseIndexRef = useRef(currentPhaseIndex);

  // ── Persist sessions ───────────────────────────────────────────────────
  useEffect(() => {
    storage.saveSessions(sessions);
  }, [sessions]);

  // ── Nostr sync ────────────────────────────────────────────────────────
  const syncWithNostr = useCallback(async (key: string) => {
    setIsSyncing(true);
    try {
      const profiles = await fetchNostrProfiles([key]);
      if (profiles[key]) setNostrProfiles((prev) => ({ ...prev, ...profiles }));

      const state = await fetchHistoryFromNostr(key);
      if (state) {
        if (state.sessions) {
          setSessions((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const newOnes = state.sessions!.filter((s) => !existingIds.has(s.id));
            return [...prev, ...newOnes].sort((a, b) => a.timestamp - b.timestamp);
          });
        }
        if (state.earnedAchievements) {
          const incoming = (state.earnedAchievements as unknown[]).filter((x): x is string => typeof x === 'string');
          setEarnedAchievements((prev) => {
            const merged: string[] = [...(Array.from(prev) as string[]), ...incoming];
            const updated = new Set<string>(merged);
            storage.saveAchievements(updated);
            return updated;
          });
        }
        if (state.customPatterns) {
          setCustomPatterns((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newOnes = state.customPatterns!.filter((p) => !existingIds.has(p.id));
            const updated = [...prev, ...newOnes];
            storage.saveCustomPatterns(updated);
            return updated;
          });
        }
      }
    } catch (e) {
      console.error('[App] Nostr sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (pubkey) {
      storage.setPubkey(pubkey);
      syncWithNostr(pubkey);
    } else {
      storage.removePubkey();
    }
  }, [pubkey, syncWithNostr]);

  // ── Streak calculation ─────────────────────────────────────────────────
  const calculateStreak = (userSessions: Session[]) => {
    if (userSessions.length === 0) return 0;
    const dates = Array.from(new Set(userSessions.map((s) => new Date(s.timestamp).toDateString())))
      .map((d) => new Date(d).getTime())
      .sort((a, b) => b - a);

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const hasToday = userSessions.some((s) => new Date(s.timestamp).toDateString() === today);
    const hasYesterday = userSessions.some((s) => new Date(s.timestamp).toDateString() === yesterday);

    if (!hasToday && !hasYesterday) return 0;

    let lastDate = hasToday ? new Date(today).getTime() : new Date(yesterday).getTime();
    let current = 1;
    for (let i = dates.indexOf(lastDate) + 1; i < dates.length; i++) {
      if (lastDate - dates[i] === 86400000) {
        current++;
        lastDate = dates[i];
      } else break;
    }
    return current;
  };

  const userSessions = useMemo(() => {
    if (pubkey) return sessions.filter((s) => s.pubkey === pubkey);
    return sessions.filter((s) => !s.pubkey || s.pubkey === 'Anonymous');
  }, [sessions, pubkey]);

  const { currentStreak, bestStreak, totalTime, totalSessions } = useMemo(() => {
    const current = calculateStreak(userSessions);
    const dates = Array.from(new Set(userSessions.map((s) => new Date(s.timestamp).toDateString())))
      .map((d: string) => new Date(d).getTime())
      .sort((a, b) => a - b);

    let best = 0;
    let temp = 1;
    if (dates.length > 0) {
      best = 1;
      for (let i = 1; i < dates.length; i++) {
        if (dates[i] - dates[i - 1] === 86400000) temp++;
        else { best = Math.max(best, temp); temp = 1; }
      }
      best = Math.max(best, temp);
    }
    return {
      currentStreak: current,
      bestStreak: best,
      totalTime: userSessions.reduce((acc, s) => acc + s.duration, 0),
      totalSessions: userSessions.length,
    };
  }, [userSessions]);

  // ── Profile loading ────────────────────────────────────────────────────
  useEffect(() => {
    if (!profileUser) { setProfileData(null); return; }
    if (profileUser === pubkey) {
      setProfileData({ sessions, achievements: earnedAchievements, streak: currentStreak, isLoading: false });
      return;
    }
    const loadProfile = async () => {
      setProfileData({ sessions: [], achievements: new Set(), streak: 0, isLoading: true });
      try {
        const state = await fetchHistoryFromNostr(profileUser);
        setProfileData({
          sessions: state?.sessions ?? [],
          achievements: new Set(state?.earnedAchievements ?? []),
          streak: calculateStreak(state?.sessions ?? []),
          isLoading: false,
        });
      } catch (e) {
        console.error('[App] Failed to load profile:', e);
        setProfileData({ sessions: [], achievements: new Set(), streak: 0, isLoading: false });
      }
    };
    loadProfile();
  }, [profileUser, pubkey, sessions, earnedAchievements, currentStreak]);

  // ── Chart data ─────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const ref = new Date(referenceDate);
    const data: { name: string; value: number }[] = [];

    if (activityTimeframe === 'day') {
      const startOfDay = new Date(ref); startOfDay.setHours(0, 0, 0, 0);
      for (let i = 0; i < 24; i++) {
        const hourStart = new Date(startOfDay); hourStart.setHours(i);
        const hourEnd = new Date(hourStart); hourEnd.setHours(i + 1);
        const label = `${i % 12 || 12}${i < 12 ? 'a' : 'p'}`;
        const value = userSessions.filter((s) => s.timestamp >= hourStart.getTime() && s.timestamp < hourEnd.getTime()).reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
      }
    } else if (activityTimeframe === 'week') {
      const start = new Date(ref); start.setDate(ref.getDate() - 6); start.setHours(0, 0, 0, 0);
      for (let i = 0; i < 7; i++) {
        const day = new Date(start); day.setDate(start.getDate() + i);
        const label = day.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
        const value = userSessions.filter((s) => new Date(s.timestamp).toDateString() === day.toDateString()).reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
      }
    } else if (activityTimeframe === 'month') {
      const endOfMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      for (let i = 1; i <= endOfMonth.getDate(); i++) {
        const day = new Date(ref.getFullYear(), ref.getMonth(), i);
        const value = userSessions.filter((s) => new Date(s.timestamp).toDateString() === day.toDateString()).reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: i.toString(), value: Math.round(value / 60) });
      }
    } else if (activityTimeframe === 'year') {
      for (let i = 0; i < 12; i++) {
        const label = new Date(ref.getFullYear(), i).toLocaleDateString('en-US', { month: 'short' });
        const value = userSessions.filter((s) => { const sd = new Date(s.timestamp); return sd.getMonth() === i && sd.getFullYear() === ref.getFullYear(); }).reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
      }
    } else {
      if (userSessions.length === 0) return [];
      const firstSession = Math.min(...userSessions.map((s) => s.timestamp));
      const start = new Date(Math.max(firstSession, SITE_START_DATE.getTime()));
      start.setDate(1);
      let curr = new Date(start);
      const end = new Date();
      while (curr <= end) {
        const label = curr.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const value = userSessions.filter((s) => { const sd = new Date(s.timestamp); return sd.getMonth() === curr.getMonth() && sd.getFullYear() === curr.getFullYear(); }).reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
        curr.setMonth(curr.getMonth() + 1);
      }
    }
    return data;
  }, [userSessions, activityTimeframe, referenceDate, SITE_START_DATE]);

  // ── Phase scales ───────────────────────────────────────────────────────
  const phaseScales = useMemo(() => {
    if (!selectedPattern) return [];
    const scales: number[] = [];
    let lastScale = 0.8;
    selectedPattern.phases.forEach((phase, i) => {
      if (phase.name === 'Inhale') { scales[i] = 1.5; lastScale = 1.5; }
      else if (phase.name === 'Exhale') { scales[i] = 0.8; lastScale = 0.8; }
      else scales[i] = lastScale;
    });
    return scales;
  }, [selectedPattern]);

  useEffect(() => {
    if (!selectedPattern) return;
    if (!isBreathing) { scale.stop(); return; }
    const target = phaseScales[currentPhaseIndex];
    const isNewPhase = lastPhaseIndexRef.current !== currentPhaseIndex;
    const duration = isNewPhase ? selectedPattern.phases[currentPhaseIndex].duration : timeLeftInPhase;
    animate(scale, target, { duration, ease: 'easeInOut' });
    lastPhaseIndexRef.current = currentPhaseIndex;
  }, [currentPhaseIndex, isBreathing, selectedPattern, phaseScales]);

  useEffect(() => {
    if (!selectedPattern) { scale.stop(); scale.set(0.8); }
  }, [selectedPattern, scale]);

  // ── Audio ──────────────────────────────────────────────────────────────
  const initAudio = useCallback(async (sound: SoundType = selectedSound) => {
    if (audioCtxRef.current) {
      if (backgroundNodeRef.current) {
        try { backgroundNodeRef.current.stop(); } catch { /* already stopped */ }
      }
    } else {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
    }

    const ctx = audioCtxRef.current!;
    if (sound === 'silence') {
      backgroundNodeRef.current = null;
      filterRef.current = null;
      forestGainRef.current = null;
      return;
    }

    const bufferSize = 20 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < 1000; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
    }
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (sound === 'forest') { output[i] = (lastOut + 0.02 * white) / 1.02; lastOut = output[i]; output[i] *= 6.0; }
      else if (sound === 'ocean') { const b0 = 0.0221917 * white; const b1 = 0.0197081 * white; const b2 = 0.0123921 * white; const waveMod = Math.sin((i / (ctx.sampleRate * 5)) * Math.PI * 2) * 0.4 + 0.6; output[i] = (b0 + b1 + b2) * waveMod * 15.0; }
      else if (sound === 'rain') { output[i] = white * 0.4; }
      else if (sound === 'wind') { output[i] = (lastOut + 0.01 * white) / 1.01; lastOut = output[i]; output[i] *= 8.0; }
    }

    const fadeSize = Math.floor(2.0 * ctx.sampleRate);
    for (let i = 0; i < fadeSize; i++) {
      const alpha = i / fadeSize;
      output[i] = output[i] * alpha + output[bufferSize - fadeSize + i] * (1 - alpha);
    }

    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    if (sound === 'forest') filter.frequency.value = 500;
    else if (sound === 'ocean') filter.frequency.value = 800;
    else if (sound === 'rain') filter.frequency.value = 2200;
    else if (sound === 'wind') filter.frequency.value = 300;

    const gain = ctx.createGain();
    gain.gain.value = forestGainRef.current ? forestGainRef.current.gain.value : 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    filterRef.current = filter;
    forestGainRef.current = gain;
    backgroundNodeRef.current = source;
  }, [selectedSound]);

  const changeSound = (sound: SoundType) => {
    setSelectedSound(sound);
    if (isBreathing) initAudio(sound);
  };

  useEffect(() => {
    if (!audioCtxRef.current || !forestGainRef.current) return;
    const ctx = audioCtxRef.current;
    const gain = forestGainRef.current.gain;
    const now = ctx.currentTime;
    const BASE_GAIN = 0.02;
    const PEAK_GAIN = 0.35;

    if (!isBreathing || isMuted || !selectedPattern) {
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(0, now, 0.1);
      return;
    }
    const phase = selectedPattern.phases[currentPhaseIndex];
    if (!phase) return;
    const duration = phase.duration;

    if (phase.name === 'Inhale') {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(PEAK_GAIN, now + duration * 0.4);
      gain.setValueAtTime(PEAK_GAIN, now + duration * 0.5);
      gain.exponentialRampToValueAtTime(BASE_GAIN, now + duration);
    } else if (phase.name === 'Exhale') {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(PEAK_GAIN, now + 0.8);
      gain.exponentialRampToValueAtTime(BASE_GAIN, now + duration);
    } else {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.setTargetAtTime(BASE_GAIN, now, 0.6);
    }
  }, [currentPhaseIndex, isBreathing, isMuted, selectedPattern]);

  // ── Load public sessions ───────────────────────────────────────────────
  useEffect(() => {
    const loadPublic = async () => {
      setIsLoadingPublic(true);
      try {
        const fetched = await fetchPublicSessions();
        const sorted = (fetched as NostrEvent[]).sort((a, b) => b.created_at - a.created_at).slice(0, 10);
        setPublicSessions(sorted);
        const pubkeys = Array.from(new Set(sorted.map((s) => s.pubkey)));
        if (pubkeys.length > 0) {
          const profiles = await fetchNostrProfiles(pubkeys);
          setNostrProfiles((prev) => ({ ...prev, ...profiles }));
        }
      } catch (e) {
        console.error('[App] Failed to load public sessions:', e);
      } finally {
        setIsLoadingPublic(false);
      }
    };
    loadPublic();
    const interval = setInterval(loadPublic, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Achievement helper ─────────────────────────────────────────────────
  const awardAchievement = useCallback((id: string, current: Set<string>): Set<string> => {
    if (current.has(id)) return current;
    const updated = new Set(current);
    updated.add(id);
    storage.saveAchievements(updated);
    setLastEarnedAchievement(id);
    setShowAchievement(true);
    return updated;
  }, []);

  // ── Custom patterns ────────────────────────────────────────────────────
  const saveCustomPattern = () => {
    if (!newName.trim()) return;
    const phases: BreathingPhase[] = [{ name: 'Inhale', duration: newInhale, color: 'bg-blue-400' }];
    if (newHold > 0) phases.push({ name: 'Hold', duration: newHold, color: 'bg-blue-600' });
    phases.push({ name: 'Exhale', duration: newExhale, color: 'bg-blue-400' });
    if (newPause > 0) phases.push({ name: 'Hold', duration: newPause, color: 'bg-blue-200' });

    const newPattern: BreathingPattern = {
      id: `custom-${Date.now()}`,
      name: newName,
      description: 'Custom breathing rhythm.',
      phases,
    };

    const updated = [...customPatterns, newPattern];
    setCustomPatterns(updated);
    storage.saveCustomPatterns(updated);
    setIsCreating(false);

    if (updated.length >= 5) {
      const next = awardAchievement('pattern_explorer', earnedAchievements);
      setEarnedAchievements(next);
    }

    setLastCreatedPattern(newPattern);
    setShowSharePrompt(true);
    setNewName(''); setNewInhale(4); setNewHold(4); setNewExhale(4); setNewPause(0);
  };

  const deleteCustomPattern = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPatterns.filter((p) => p.id !== id);
    setCustomPatterns(updated);
    storage.saveCustomPatterns(updated);
  };

  // ── Login / Logout ────────────────────────────────────────────────────
  const handleLogin = async () => {
    try {
      const key = await loginWithNostr();
      if (key) { setPubkey(key); syncWithNostr(key); }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Login failed', 'error');
    }
  };
  const handleLogout = () => setPubkey(null);

  // ── Session start / stop ──────────────────────────────────────────────
  const startSession = (pattern: BreathingPattern, durationMins: number | null) => {
    initAudio();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
    setTimeGoal(durationMins === null ? null : durationMins * 60);
    setSelectedPattern(pattern);
    setIsBreathing(true);
    setCurrentPhaseIndex(0);
    setTimeLeftInPhase(pattern.phases[0].duration);
    setSessionStartTime(Date.now());
    setElapsedSeconds(0);
    setIsCompleted(false);
    setShowDurationSelector(false);
    setPendingPattern(null);
  };

  const handlePatternClick = (pattern: BreathingPattern) => {
    setPendingPattern(pattern);
    setShowDurationSelector(true);
  };

  const handleComplete = useCallback(() => {
    setIsBreathing(false);
    setIsCompleted(true);

    if (!selectedPattern || !sessionStartTime) return;

    const growth = timeGoal ? Math.min(elapsedSeconds / timeGoal, 1) : Math.min(elapsedSeconds / 300, 1);
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    const newSession: Session = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      duration,
      pattern: selectedPattern.name,
      pubkey: pubkey ?? undefined,
    };

    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);

    let newEarned = new Set(earnedAchievements);

    if (sessions.length === 0) newEarned = awardAchievement('first_breath', newEarned);
    if (growth >= 1) newEarned = awardAchievement('johnny_appleseed', newEarned);

    const hour = new Date().getHours();
    if (hour < 8) newEarned = awardAchievement('early_bird', newEarned);
    if (updatedSessions.filter((s) => new Date(s.timestamp).getHours() < 8).length >= 5) newEarned = awardAchievement('early_bird_5', newEarned);
    if (hour >= 22) newEarned = awardAchievement('night_owl', newEarned);
    if (updatedSessions.filter((s) => new Date(s.timestamp).getHours() >= 22).length >= 5) newEarned = awardAchievement('night_owl_5', newEarned);

    if (currentStreak >= 3) newEarned = awardAchievement('streak_3', newEarned);
    if (currentStreak >= 10) newEarned = awardAchievement('streak_10', newEarned);
    if (currentStreak >= 30) newEarned = awardAchievement('streak_30', newEarned);
    if (currentStreak >= 100) newEarned = awardAchievement('streak_100', newEarned);

    if (duration >= 1200) newEarned = awardAchievement('deep_diver', newEarned);
    if (duration >= 3600) newEarned = awardAchievement('deep_diver_60', newEarned);
    if (updatedSessions.length >= 100) newEarned = awardAchievement('century_club', newEarned);

    const totalT = updatedSessions.reduce((acc, s) => acc + s.duration, 0);
    if (totalT >= 3600) newEarned = awardAchievement('marathon', newEarned);
    if (totalT >= 36000) newEarned = awardAchievement('eternal_breath', newEarned);

    const hasSat = updatedSessions.some((s) => new Date(s.timestamp).getDay() === 6);
    const hasSun = updatedSessions.some((s) => new Date(s.timestamp).getDay() === 0);
    if (hasSat && hasSun) newEarned = awardAchievement('weekend_warrior', newEarned);

    const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toDateString(); });
    const uniqueDays = new Set(updatedSessions.filter((s) => last7.includes(new Date(s.timestamp).toDateString())).map((s) => new Date(s.timestamp).toDateString()));
    if (uniqueDays.size === 7) newEarned = awardAchievement('perfect_week', newEarned);

    setEarnedAchievements(newEarned);

    if (pubkey) {
      if (lastEarnedAchievement) postAchievementToNostr(pubkey, lastEarnedAchievement).catch(console.error);
      postSessionToServerNostr({ sessions: updatedSessions, earnedAchievements: Array.from(newEarned) as string[], customPatterns }, pubkey)
        .then((res) => { if (!res.success) console.warn('[App] Server Nostr sync failed:', res.error); })
        .catch(console.error);
    }

    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#60a5fa', '#34d399', '#818cf8'] });
  }, [selectedPattern, sessionStartTime, timeGoal, elapsedSeconds, sessions, earnedAchievements, pubkey, currentStreak, customPatterns, lastEarnedAchievement, awardAchievement]);

  // ── Share handlers ────────────────────────────────────────────────────
  const handleSharePattern = async () => {
    if (!lastCreatedPattern) return;
    let currentPubkey = pubkey;
    if (!currentPubkey) {
      currentPubkey = await loginWithNostr();
      if (currentPubkey) setPubkey(currentPubkey);
      else return;
    }
    setIsPosting(true);
    try {
      const success = await postPatternToNostr(currentPubkey, lastCreatedPattern);
      if (success) {
        const newShares = totalShares + 1;
        setTotalShares(newShares);
        storage.saveTotalShares(newShares);
        if (newShares >= 10) { const next = awardAchievement('social_breather', earnedAchievements); setEarnedAchievements(next); }
        showToast('Pattern shared to Nostr! 🌬️');
        setShowSharePrompt(false);
      }
    } catch (e) {
      console.error('[App] handleSharePattern failed:', e);
    } finally {
      setIsPosting(false);
    }
  };

  const handleShare = async () => {
    if (!pubkey || !selectedPattern || !sessionStartTime) return;
    setIsPosting(true);
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    try {
      const success = await postSessionToNostr(pubkey, { pattern: selectedPattern.name, duration });
      if (success) {
        const newShares = totalShares + 1;
        setTotalShares(newShares);
        storage.saveTotalShares(newShares);
        if (newShares >= 10) { const next = awardAchievement('social_breather', earnedAchievements); setEarnedAchievements(next); }
        showToast('Session shared to Nostr! 🌬️');
      }
    } catch (e) {
      console.error('[App] handleShare failed:', e);
    } finally {
      setIsPosting(false);
    }
  };

  const handleShareStats = async () => {
    let currentPubkey = pubkey;
    if (!currentPubkey) {
      currentPubkey = await loginWithNostr();
      if (currentPubkey) setPubkey(currentPubkey);
      else return;
    }
    setIsPosting(true);
    try {
      const success = await postStatsToNostr(currentPubkey, { totalTime, totalSessions });
      if (success) showToast('Stats shared to Nostr! 📊');
    } catch (e) {
      console.error('[App] handleShareStats failed:', e);
    } finally {
      setIsPosting(false);
    }
  };

  const handleShareAchievement = async (achievementName: string) => {
    let currentPubkey = pubkey;
    if (!currentPubkey) {
      currentPubkey = await loginWithNostr();
      if (currentPubkey) setPubkey(currentPubkey);
      else return;
    }
    setIsPosting(true);
    try {
      const success = await postAchievementToNostr(currentPubkey, achievementName);
      if (success) { showToast('Achievement shared to Nostr! 🏆'); setShowAchievement(false); }
    } catch (e) {
      console.error('[App] handleShareAchievement failed:', e);
    } finally {
      setIsPosting(false);
    }
  };

  // ── Timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isBreathing && selectedPattern) {
      timerRef.current = setInterval(() => {
        if (sessionStartTime) {
          const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
          setElapsedSeconds(elapsed);
          if (timeGoal && elapsed >= timeGoal) { handleComplete(); return; }
        }
        setTimeLeftInPhase((prev) => {
          if (prev <= 0.1) {
            const nextIndex = (currentPhaseIndex + 1) % selectedPattern.phases.length;
            setCurrentPhaseIndex(nextIndex);
            return selectedPattern.phases[nextIndex].duration;
          }
          return Math.round((prev - 0.1) * 10) / 10;
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isBreathing, currentPhaseIndex, selectedPattern, sessionStartTime, timeGoal, handleComplete]);

  // ── Utilities ─────────────────────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTotalTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const currentPhase = selectedPattern?.phases[currentPhaseIndex];
  const allPatterns = [...BREATHING_PATTERNS, ...customPatterns];

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans antialiased">
      {/* Header */}
      <header className="p-6 flex justify-between items-center border-b border-neutral-800">
        <button
          onClick={() => {
            if (showDurationSelector) return;
            setSelectedPattern(null); setShowProgress(false); setIsCreating(false);
            setIsBreathing(false); setIsCompleted(false);
          }}
          className={`flex flex-col transition-opacity ${showDurationSelector ? 'cursor-default' : 'hover:opacity-80'}`}
        >
          <div className="flex items-center gap-2">
            <Wind className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-display font-bold tracking-tight">Relaxyz</h1>
          </div>
        </button>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowProgress(true)} className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 px-4 py-2 rounded-full border border-neutral-800 transition-all text-sm font-medium">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> My Progress
          </button>
          <button onClick={() => setShowGoals(true)} className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 px-4 py-2 rounded-full border border-neutral-800 transition-all text-sm font-medium">
            <Timer className="w-4 h-4 text-amber-400" /> Goals
          </button>

          {pubkey ? (
            <div className="flex items-center gap-3 bg-neutral-900 px-4 py-2 rounded-full border border-neutral-800">
              <button onClick={() => setProfileUser(pubkey)} className="flex items-center gap-2 hover:text-blue-400 transition-colors group">
                <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 group-hover:bg-neutral-700 transition-colors overflow-hidden">
                  {nostrProfiles[pubkey]?.picture ? (
                    <img src={nostrProfiles[pubkey].picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : <User className="w-3 h-3" />}
                </div>
                <span className="text-xs font-medium text-neutral-300 group-hover:text-blue-400 transition-colors">
                  {nostrProfiles[pubkey]?.display_name || nostrProfiles[pubkey]?.name || getShortNpub(pubkey)}
                </span>
              </button>
              <button onClick={handleLogout} className="text-neutral-500 hover:text-white transition-colors ml-1"><LogOut className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full transition-all font-medium text-sm">
              <LogIn className="w-4 h-4" /> Login with NIP-07
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-row items-start justify-center p-6 max-w-6xl mx-auto w-full relative gap-8">
        <div className="flex-1 flex flex-col items-center">
          <AnimatePresence mode="wait">
            {showProgress ? (
              /* ── Progress View ── */
              <motion.div key="progress" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl overflow-y-auto max-h-[80vh]">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10"><TrendingUp className="w-6 h-6 text-emerald-400" /></div>
                    <div>
                      <h2 className="text-2xl font-display font-bold">My Progress <span className="text-xs font-sans font-normal text-amber-500 ml-2 px-2 py-0.5 bg-amber-500/10 rounded-full">Beta</span></h2>
                      <p className="text-[10px] text-neutral-500 font-medium">Backed up to Nostr via #relaxyz</p>
                    </div>
                  </div>
                  <button onClick={() => setShowProgress(false)} className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 transition-colors"><X className="w-6 h-6" /></button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-4 mb-8 relative">
                  {isSyncing && (
                    <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl border border-blue-500/30">
                      <div className="flex items-center gap-3 text-blue-400 font-bold uppercase tracking-widest text-xs">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        Loading Nostr Data...
                      </div>
                    </div>
                  )}
                  {[
                    { key: 'streak', icon: <Award className="w-8 h-8 mb-2" />, value: currentStreak, label: 'Current Streak', color: 'orange' },
                    { key: 'best', icon: <CheckCircle2 className="w-8 h-8 mb-2" />, value: bestStreak, label: 'Best Streak', color: 'emerald' },
                    { key: 'time', icon: <Clock className="w-8 h-8 mb-2" />, value: formatTotalTime(totalTime), label: 'Total Time', color: 'blue' },
                    { key: 'sessions', icon: <Wind className="w-8 h-8 mb-2" />, value: totalSessions, label: 'Sessions', color: 'purple' },
                  ].map(({ key, icon, value, label, color }) => (
                    <button
                      key={key}
                      onClick={() => setSelectedStatDetail(selectedStatDetail === key as typeof selectedStatDetail ? null : key as typeof selectedStatDetail)}
                      className={`p-6 rounded-2xl border transition-all flex flex-col items-center text-center group ${selectedStatDetail === key ? `bg-${color}-500/10 border-${color}-500/50` : `bg-neutral-800/50 border-neutral-700/50 hover:border-${color}-500/30`}`}
                    >
                      <div className={`text-${color}-400`}>{icon}</div>
                      <span className="text-3xl font-display font-bold text-white">{value}</span>
                      <span className="text-xs uppercase tracking-widest text-neutral-500 font-bold">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Activity Chart */}
                <div className="bg-neutral-800/30 p-6 rounded-2xl border border-neutral-700/50">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Activity</h3>
                      <p className="text-[10px] text-neutral-500 mt-1">
                        {activityTimeframe === 'day' && referenceDate.toLocaleDateString()}
                        {activityTimeframe === 'week' && `${new Date(referenceDate.getTime() - 6 * 86400000).toLocaleDateString()} - ${referenceDate.toLocaleDateString()}`}
                        {activityTimeframe === 'month' && referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        {activityTimeframe === 'year' && referenceDate.getFullYear()}
                        {activityTimeframe === 'all' && 'All Time'}
                      </p>
                    </div>
                    <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800">
                      {(['day', 'week', 'month', 'year', 'all'] as const).map((t) => (
                        <button key={t} onClick={() => { setActivityTimeframe(t); setReferenceDate(new Date()); }}
                          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activityTimeframe === t ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                        <XAxis dataKey="name" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} interval={activityTimeframe === 'day' ? 5 : activityTimeframe === 'month' ? 4 : 0} />
                        <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}m`} />
                        <Tooltip contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#60a5fa' }} cursor={{ fill: '#262626' }} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#60a5fa' : '#262626'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent Sessions */}
                <div className="mt-8">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-4">Recent Sessions</h3>
                  <div className="space-y-3">
                    {userSessions.slice(-20).reverse().map((s) => (
                      <div key={s.id} className="flex justify-between items-center p-4 bg-neutral-800/20 rounded-xl border border-neutral-800/50">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-blue-500/10"><Wind className="w-4 h-4 text-blue-400" /></div>
                          <div>
                            <div className="text-sm font-medium text-white">{s.pattern}</div>
                            <div className="text-[10px] text-neutral-500">{new Date(s.timestamp).toLocaleDateString()} at {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="text-sm font-mono text-neutral-400">{Math.floor(s.duration / 60)}m {s.duration % 60}s</div>
                      </div>
                    ))}
                    {userSessions.length === 0 && <div className="text-center py-8 text-neutral-600 italic text-sm">No sessions yet. Start breathing!</div>}
                  </div>
                </div>

                {/* Achievements */}
                <div className="mt-8 bg-neutral-800/30 p-6 rounded-2xl border border-neutral-700/50">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-6 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" /> Achievements
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {ACHIEVEMENTS.map((achievement) => {
                      const isEarned = earnedAchievements.has(achievement.id);
                      return (
                        <div key={achievement.id} className={`p-4 rounded-xl border transition-all ${isEarned ? 'bg-neutral-900 border-neutral-700' : 'bg-neutral-900/50 border-neutral-800/50 opacity-40 grayscale'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${isEarned ? 'bg-amber-500/20 text-amber-400' : 'bg-neutral-800 text-neutral-600'}`}>{achievement.icon}</div>
                            <div>
                              <div className="text-xs font-bold text-white">{achievement.name}</div>
                              <div className="text-[10px] text-neutral-500 mt-0.5">{achievement.description}</div>
                              {isEarned && (
                                <button
                                  onClick={async () => {
                                    let key = pubkey;
                                    if (!key) { key = await loginWithNostr(); if (key) setPubkey(key); else return; }
                                    setIsPosting(true);
                                    try { await postAchievementToNostr(key, achievement.name); showToast('Achievement shared! 🏆'); }
                                    catch (e) { console.error(e); }
                                    finally { setIsPosting(false); }
                                  }}
                                  className="mt-2 text-[9px] font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                                >
                                  <Share2 className="w-3 h-3" /> Share
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            ) : showDurationSelector && pendingPattern ? (
              /* ── Duration Selector ── */
              <motion.div key="duration-selector" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl text-center">
                <div className="mb-8">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4"><Timer className="w-8 h-8 text-blue-400" /></div>
                  <h2 className="text-2xl font-display font-bold mb-2">How long?</h2>
                  <p className="text-neutral-500">Choose duration for <span className="text-blue-400 font-medium">{pendingPattern.name}</span></p>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-8">
                  {[1, 3, 5, 8].map((mins) => (
                    <button key={mins} onClick={() => startSession(pendingPattern, mins)} className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-neutral-800 border border-neutral-700 hover:border-blue-500 hover:bg-neutral-700 transition-all group">
                      <span className="text-2xl font-bold text-white group-hover:text-blue-400">{mins}</span>
                      <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Minutes</span>
                    </button>
                  ))}
                  <button onClick={() => startSession(pendingPattern, null)} className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-neutral-800 border border-neutral-700 hover:border-blue-500 hover:bg-neutral-700 transition-all group">
                    <span className="text-2xl font-bold text-white group-hover:text-blue-400">∞</span>
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Continuous</span>
                  </button>
                  <div className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-neutral-800 border border-neutral-700 hover:border-blue-500 hover:bg-neutral-700 transition-all group relative">
                    <select onChange={(e) => { const val = parseInt(e.target.value); if (val > 0) startSession(pendingPattern, val); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" defaultValue="">
                      <option value="" disabled>Custom</option>
                      {Array.from({ length: 60 }, (_, i) => i + 1).map((m) => <option key={m} value={m} className="bg-neutral-900">{m}</option>)}
                    </select>
                    <span className="text-2xl font-bold text-white group-hover:text-blue-400">...</span>
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Custom</span>
                  </div>
                </div>
                <button onClick={() => { setShowDurationSelector(false); setPendingPattern(null); }} className="text-neutral-500 hover:text-white text-sm font-medium">Go Back</button>
              </motion.div>
            ) : isCreating ? (
              /* ── Custom Pattern Form ── */
              <motion.div key="creating" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-display font-bold">New Pattern</h2>
                  <button onClick={() => setIsCreating(false)} className="text-neutral-500 hover:text-white"><X className="w-6 h-6" /></button>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Name</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Morning Flow" className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'Inhale (s)', value: newInhale, setter: setNewInhale, min: 0.1 },
                      { label: 'Hold (s)', value: newHold, setter: setNewHold, min: 0 },
                      { label: 'Exhale (s)', value: newExhale, setter: setNewExhale, min: 0.1 },
                      { label: 'Pause (s)', value: newPause, setter: setNewPause, min: 0 },
                    ].map(({ label, value, setter, min }) => (
                      <div key={label}>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">{label}</label>
                        <input type="number" min={min} step="0.1" value={value} onChange={(e) => setter(parseFloat(e.target.value) || 0)} className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors" />
                      </div>
                    ))}
                  </div>
                  <button onClick={saveCustomPattern} disabled={!newName.trim()} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold transition-all mt-4">Save Exercise</button>
                </div>
              </motion.div>
            ) : !selectedPattern ? (
              /* ── Pattern Selection ── */
              <motion.div key="selection" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full">
                <div className="text-center mb-12">
                  <h2 className="text-4xl font-display font-bold mb-4">Choose your rhythm</h2>
                  <p className="text-neutral-400 max-w-md mx-auto mb-8">Select a breathing pattern to begin your practice. Connect with your breath and find your center.</p>
                  <div className="flex flex-wrap justify-center gap-4 mb-8">
                    <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 px-6 py-3 rounded-2xl font-medium">
                      <button onClick={() => setIsMuted(!isMuted)} className="text-blue-400 hover:text-blue-300 transition-colors">
                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                      </button>
                      <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mr-2">Soundscape</span>
                      <div className="relative">
                        <select value={selectedSound} onChange={(e) => changeSound(e.target.value as SoundType)} className="bg-neutral-800 focus:outline-none text-white text-xs cursor-pointer appearance-none border border-neutral-700 focus:border-blue-500 px-4 py-1.5 rounded-2xl pr-8">
                          {SOUND_OPTIONS.map((option) => <option key={option.id} value={option.id} className="bg-neutral-900">{option.name}</option>)}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"><ChevronRight className="w-3 h-3 text-neutral-500 rotate-90" /></div>
                      </div>
                    </div>
                    <button onClick={() => setIsCreating(true)} className="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-white px-6 py-3 rounded-full transition-all font-medium">
                      <Plus className="w-5 h-5" /> Create Pattern
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allPatterns.map((pattern) => (
                    <div key={pattern.id} role="button" tabIndex={0}
                      onClick={() => handlePatternClick(pattern)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePatternClick(pattern); } }}
                      className="group relative bg-neutral-900 border border-neutral-800 p-6 rounded-2xl text-left hover:border-blue-500 transition-all duration-300 overflow-hidden cursor-pointer"
                    >
                      <div className="relative z-10">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-bold group-hover:text-blue-400 transition-colors">{pattern.name}</h3>
                          {pattern.id.startsWith('custom-') && (
                            <div className="flex gap-2">
                              <button onClick={(e) => { e.stopPropagation(); setLastCreatedPattern(pattern); setShowSharePrompt(true); }} className="text-neutral-700 hover:text-blue-400 transition-colors p-1"><Share2 className="w-4 h-4" /></button>
                              <button onClick={(e) => deleteCustomPattern(pattern.id, e)} className="text-neutral-700 hover:text-red-400 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-neutral-500 mb-4">{pattern.description}</p>
                        <div className="flex gap-1">
                          {pattern.phases.map((p, i) => <div key={i} className={`h-1 flex-1 rounded-full ${p.color} opacity-40`} style={{ flexGrow: p.duration }} />)}
                        </div>
                      </div>
                      <ChevronRight className="absolute right-6 bottom-6 w-6 h-6 text-neutral-700 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                    </div>
                  ))}
                </div>

                {/* Recent Breathers */}
                <div className="mt-12 bg-neutral-900/30 rounded-3xl border border-neutral-800/50 overflow-hidden">
                  <div className="p-6 border-b border-neutral-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-bold uppercase tracking-widest text-neutral-400">Recent Breathers</span>
                    </div>
                    {isLoadingPublic && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  </div>
                  <div className="divide-y divide-neutral-800/50">
                    {publicSessions.length > 0 ? publicSessions.map((session, idx) => (
                      <button key={session.id || idx} onClick={() => { setProfileUser(session.pubkey); if (!nostrProfiles[session.pubkey]) fetchNostrProfiles([session.pubkey]).then((p) => setNostrProfiles((prev) => ({ ...prev, ...p }))).catch(console.error); }}
                        className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors group text-left">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 group-hover:bg-neutral-700 transition-colors overflow-hidden">
                            {nostrProfiles[session.pubkey]?.picture ? <img src={nostrProfiles[session.pubkey].picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <User className="w-5 h-5" />}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{nostrProfiles[session.pubkey]?.display_name || nostrProfiles[session.pubkey]?.name || getShortNpub(session.pubkey)}</div>
                            <div className="text-xs text-neutral-500">
                              {(() => { try { const d = session.content ? JSON.parse(session.content) : {}; return Math.floor((d.duration ?? 0) / 60); } catch { return 0; } })()}m session
                              {' • '}
                              {new Date(session.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-white transition-colors" />
                      </button>
                    )) : (
                      <div className="p-8 text-center text-sm text-neutral-600 italic">
                        {isLoadingPublic ? 'Loading recent breathers...' : 'No recent public sessions found'}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : isCompleted ? (
              /* ── Completion ── */
              <motion.div key="completed" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                <CheckCircle2 className="w-20 h-20 text-emerald-400 mx-auto mb-6" />
                <h2 className="text-4xl font-display font-bold mb-2">Session Complete</h2>
                <p className="text-neutral-400 mb-8">You've completed your {selectedPattern?.name} session.</p>
                <div className="flex flex-col gap-3 max-w-xs mx-auto">
                  {pubkey ? (
                    <button onClick={handleShare} disabled={isPosting} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-full font-bold transition-all">
                      <Share2 className="w-5 h-5" /> {isPosting ? 'Posting...' : 'Share to Nostr'}
                    </button>
                  ) : (
                    <button onClick={handleLogin} className="flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 rounded-full font-bold transition-all border border-neutral-700">
                      <LogIn className="w-5 h-5" /> Share your progress on Nostr
                    </button>
                  )}
                  <button onClick={() => setSelectedPattern(null)} className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 rounded-full font-bold transition-all">Back to Patterns</button>
                </div>
              </motion.div>
            ) : (
              /* ── Breathing Session ── */
              <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center w-full">
                <div className="flex bg-neutral-900 p-1 rounded-full border border-neutral-800 mb-8">
                  <button onClick={() => setVisualType('minimal')} className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all ${visualType === 'minimal' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}>Minimalistic</button>
                  <button onClick={() => setVisualType('cat')} className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all ${visualType === 'cat' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}>Visual</button>
                </div>

                <div className="mb-8 text-center">
                  <h2 className="text-2xl font-display font-bold text-neutral-400">{selectedPattern?.name}</h2>
                  <div className="flex gap-2 mt-2 justify-center">
                    {selectedPattern?.phases.map((p, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className={`h-1.5 w-8 rounded-full transition-all duration-500 ${i === currentPhaseIndex ? p.color : 'bg-neutral-800'}`} />
                        <span className="text-[10px] font-mono text-white">{p.duration}s</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2 mb-8">
                  <div className="flex items-center gap-4 bg-neutral-900/50 px-6 py-2 rounded-full border border-neutral-800">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-mono font-bold">{timeGoal ? formatTime(Math.max(0, timeGoal - elapsedSeconds)) : formatTime(elapsedSeconds)}</span>
                    </div>
                  </div>
                  <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-600">Breaths:</span>
                      <span className="text-white">{selectedPattern ? (timeGoal ? Math.floor(timeGoal / selectedPattern.phases.reduce((acc, p) => acc + p.duration, 0)) : 'Continuous') : '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-neutral-600">BPM:</span>
                      <span className="text-white">{selectedPattern ? (60 / selectedPattern.phases.reduce((acc, p) => acc + p.duration, 0)).toFixed(1) : '—'}</span>
                    </div>
                  </div>
                </div>

                {visualType === 'cat' ? (
                  <BreathingVisuals scale={scale} elapsedSeconds={elapsedSeconds} timeGoal={timeGoal} currentPhase={currentPhase} />
                ) : (
                  <div className="relative w-80 h-80 flex items-center justify-center mb-8">
                    <div className={`absolute w-60 h-60 rounded-full ${currentPhase?.color || 'bg-blue-600'} opacity-30 z-0 transition-colors duration-500`} />
                    <motion.div style={{ scale }} className={`w-40 h-40 rounded-full flex items-center justify-center z-10 shadow-2xl ${currentPhase?.color || 'bg-blue-500'} transition-colors duration-500`}>
                      <div className="text-center text-white">
                        <div className="text-4xl font-display font-bold leading-none">{Math.ceil(timeLeftInPhase)}</div>
                        <div className="text-[10px] uppercase tracking-widest font-bold opacity-80">{currentPhase?.name}</div>
                      </div>
                    </motion.div>
                  </div>
                )}

                <div className="text-center mb-12 h-16 flex flex-col justify-center">
                  <motion.h3 key={currentPhase?.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-display font-bold text-white uppercase tracking-widest">{currentPhase?.name}</motion.h3>
                  <motion.p key={`${currentPhase?.name}-desc`} initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} className="text-neutral-400 text-xs mt-1">
                    {currentPhase?.name === 'Inhale' && 'Breathe in slowly through your nose'}
                    {currentPhase?.name === 'Hold' && 'Gently hold your breath'}
                    {currentPhase?.name === 'Exhale' && 'Release the breath through your mouth'}
                  </motion.p>
                </div>

                <div className="flex items-center gap-12">
                  <button onClick={() => setSelectedPattern(null)} className="p-3 rounded-full bg-neutral-900 text-neutral-400 hover:text-white transition-colors"><RotateCcw className="w-6 h-6" /></button>
                  <button onClick={() => setIsBreathing(!isBreathing)} className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl">
                    {isBreathing ? <PauseIcon className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-1" />}
                  </button>
                  <button onClick={handleComplete} className="p-3 rounded-full bg-neutral-900 text-neutral-400 hover:text-emerald-400 transition-colors"><CheckCircle2 className="w-6 h-6" /></button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Goals Modal ── */}
          <AnimatePresence>
            {showGoals && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h2 className="text-2xl font-display font-bold">Your Goals <span className="text-xs font-sans font-normal text-amber-500 ml-2 px-2 py-0.5 bg-amber-500/10 rounded-full">Beta</span></h2>
                      <p className="text-[10px] text-neutral-500 font-medium">Backed up to Nostr via #relaxyz</p>
                    </div>
                    <button onClick={() => setShowGoals(false)} className="text-neutral-500 hover:text-white"><X className="w-6 h-6" /></button>
                  </div>

                  <div className="space-y-8">
                    <div>
                      <div className="flex justify-between items-end mb-4">
                        <label className="text-xs font-bold uppercase tracking-widest text-neutral-500">Daily Breathing Goal</label>
                        <span className="text-2xl font-display font-bold text-blue-400">{dailyGoal} min</span>
                      </div>
                      <input type="range" min="1" max="60" value={dailyGoal}
                        onChange={(e) => { const val = parseInt(e.target.value); setDailyGoal(val); storage.saveDailyGoal(val); }}
                        className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <div className="flex justify-between mt-2 text-[10px] font-bold text-neutral-600 uppercase tracking-widest"><span>1 min</span><span>60 min</span></div>
                    </div>

                    <div className="bg-neutral-800/50 p-6 rounded-2xl border border-neutral-800">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">Weekly Plan</h3>
                      <div className="flex justify-between mb-6">
                        {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((day) => (
                          <button key={day}
                            onClick={() => {
                              const newPlan = { ...weeklyPlan, days: { ...weeklyPlan.days, [day]: !weeklyPlan.days[day] } };
                              setWeeklyPlan(newPlan); storage.saveWeeklyPlan(newPlan);
                              if (Object.values(newPlan.days).some(Boolean)) {
                                const next = awardAchievement('week_planner', earnedAchievements);
                                setEarnedAchievements(next);
                              }
                            }}
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold transition-all border ${weeklyPlan.days[day] ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:border-neutral-700'}`}
                          >
                            {day[0]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Today's Progress */}
                    {(() => {
                      const today = new Date().toDateString();
                      const todaySeconds = userSessions.filter((s) => new Date(s.timestamp).toDateString() === today).reduce((acc, s) => acc + s.duration, 0);
                      const todayMinutes = Math.floor(todaySeconds / 60);
                      const progress = Math.min((todayMinutes / dailyGoal) * 100, 100);
                      return (
                        <div className="bg-neutral-800/50 p-6 rounded-2xl border border-neutral-800">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">Today's Progress</h3>
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-white">{todayMinutes} / {dailyGoal} minutes</span>
                              <span className="text-sm font-bold text-blue-400">{Math.round(progress)}%</span>
                            </div>
                            <div className="w-full h-3 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-gradient-to-r from-blue-600 to-blue-400" />
                            </div>
                            {progress >= 100 && (
                              <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-bold uppercase tracking-widest">
                                <CheckCircle2 className="w-3 h-3" /> Goal Reached!
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Clear Data */}
                    <div className="border-t border-neutral-800 pt-6">
                      {!showClearConfirm ? (
                        <button onClick={() => setShowClearConfirm(true)} className="flex items-center gap-2 text-xs text-neutral-600 hover:text-red-400 transition-colors">
                          <AlertTriangle className="w-3 h-3" /> Clear all my data
                        </button>
                      ) : (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                          <p className="text-xs text-red-400 mb-3 font-medium">This will permanently delete all your local sessions, achievements, and settings. Are you sure?</p>
                          <div className="flex gap-3">
                            <button onClick={() => { storage.clearAllData(); window.location.reload(); }} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 rounded-lg transition-colors">Yes, clear everything</button>
                            <button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold py-2 rounded-lg transition-colors">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>

                    <button onClick={() => setShowGoals(false)} className="w-full bg-neutral-800 hover:bg-neutral-700 text-white py-4 rounded-xl font-bold transition-all">Close</button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ── Share Pattern Prompt ── */}
          <AnimatePresence>
            {showSharePrompt && lastCreatedPattern && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="w-full max-w-sm bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl text-center">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6"><Share2 className="w-8 h-8 text-blue-400" /></div>
                  <h3 className="text-2xl font-display font-bold mb-2">Share your creation?</h3>
                  <p className="text-neutral-400 mb-8 text-sm leading-relaxed">Share <span className="text-blue-400 font-bold">"{lastCreatedPattern.name}"</span> with the Nostr community?</p>
                  <div className="flex flex-col gap-3">
                    <button onClick={handleSharePattern} disabled={isPosting} className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-blue-500 transition-colors disabled:opacity-50">
                      {isPosting ? 'Sharing...' : <><Share2 className="w-5 h-5" /> Share on Nostr</>}
                    </button>
                    <button onClick={() => setShowSharePrompt(false)} className="w-full py-4 rounded-2xl bg-neutral-800 text-neutral-400 font-bold hover:text-white transition-colors">Maybe Later</button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* ── Achievement Modal ── */}
          <AnimatePresence>
            {showAchievement && lastEarnedAchievement && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-neutral-900 border border-blue-500/30 p-8 rounded-3xl max-w-sm w-full text-center relative overflow-hidden">
                  <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/20 blur-[80px]" />
                  <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-pink-600/20 blur-[80px]" />
                  <div className="relative z-10">
                    <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-500/30"><Trophy className="w-10 h-10 text-blue-400" /></div>
                    <h2 className="text-2xl font-bold mb-2">Achievement Unlocked!</h2>
                    <p className="text-neutral-400 mb-6">{ACHIEVEMENTS.find((a) => a.id === lastEarnedAchievement)?.description}</p>
                    <div className="bg-neutral-800/50 rounded-2xl p-4 mb-8 border border-neutral-700 flex items-center gap-4 text-left">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30 text-blue-400">{ACHIEVEMENTS.find((a) => a.id === lastEarnedAchievement)?.icon}</div>
                      <div>
                        <div className="text-xs font-bold text-blue-400 uppercase tracking-wider">Achievement</div>
                        <div className="font-bold">{ACHIEVEMENTS.find((a) => a.id === lastEarnedAchievement)?.name}</div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <button onClick={() => handleShareAchievement(ACHIEVEMENTS.find((a) => a.id === lastEarnedAchievement)?.name ?? '')} disabled={isPosting} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                        {isPosting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Share2 className="w-5 h-5" />}
                        Share to Nostr
                      </button>
                      <button onClick={() => setShowAchievement(false)} className="w-full bg-transparent hover:bg-neutral-800 text-neutral-400 font-bold py-3 rounded-2xl transition-all">Maybe later</button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* ── Profile Modal ── */}
      <AnimatePresence>
        {profileUser && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 blur-[80px]" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl overflow-hidden">
                      {nostrProfiles[profileUser]?.picture ? <img src={nostrProfiles[profileUser].picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <User className="w-8 h-8 text-white" />}
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-white">{nostrProfiles[profileUser]?.display_name || nostrProfiles[profileUser]?.name || 'Breathworker'}</h2>
                      <p className="text-xs font-mono text-neutral-500 mt-1">{profileUser === 'Anonymous' ? 'Anonymous' : getShortNpub(profileUser)}</p>
                    </div>
                  </div>
                  <button onClick={() => setProfileUser(null)} className="p-2 rounded-full hover:bg-neutral-800 text-neutral-500 transition-colors"><X className="w-6 h-6" /></button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-neutral-800/50 p-4 rounded-2xl border border-neutral-800/50">
                    <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-3 h-3 text-emerald-400" /><span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Total Time</span></div>
                    <div className="text-2xl font-display font-bold text-white">
                      {profileData?.isLoading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : `${Math.floor((profileData?.sessions.reduce((acc, s) => acc + s.duration, 0) ?? 0) / 60)}m`}
                    </div>
                  </div>
                  <div className="bg-neutral-800/50 p-4 rounded-2xl border border-neutral-800/50">
                    <div className="flex items-center gap-2 mb-1"><Award className="w-3 h-3 text-orange-400" /><span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Streak</span></div>
                    <div className="text-2xl font-display font-bold text-white">
                      {profileData?.isLoading ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (profileData?.streak ?? 0)}
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-800/30 p-6 rounded-2xl border border-neutral-800 mb-8">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-4 flex items-center gap-2"><Trophy className="w-3 h-3 text-amber-400" /> Achievements</h3>
                  <div className="flex flex-wrap gap-2">
                    {profileData?.isLoading ? (
                      <div className="w-full flex justify-center py-4"><div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>
                    ) : profileData?.achievements && profileData.achievements.size > 0 ? (
                      Array.from(profileData.achievements).map((id) => {
                        const ach = ACHIEVEMENTS.find((a) => a.id === id);
                        return ach ? <div key={id} className="p-2 bg-neutral-900 rounded-lg border border-neutral-800 text-amber-400" title={ach.name}>{ach.icon}</div> : null;
                      })
                    ) : <div className="text-[10px] text-neutral-600 italic">No achievements yet</div>}
                  </div>
                </div>

                <button onClick={() => setProfileUser(null)} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20">Close Profile</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-semibold ${
              toast.type === 'error'
                ? 'bg-red-950 border-red-700 text-red-200'
                : 'bg-neutral-900 border-neutral-700 text-white'
            }`}
          >
            {toast.type === 'error'
              ? <X className="w-4 h-4 text-red-400 shrink-0" />
              : <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            }
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="p-8 text-center text-neutral-600 text-xs border-t border-neutral-900">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-row justify-center items-center gap-6">
            <a href="https://njump.me/nprofile1qqsymsh9wrz5lmurz0arqn6jjaqyfmtvz2z3qpfxqz5msnvr0wqjd7gprdmhxue69uhhg6r9vehhyetnwshxummnw3erztnrdakj7qgcwaehxw309aehqct5d9sj6ctjvdskucfwvdhk6tcpkvxva" target="_blank" rel="noopener noreferrer" className="text-neutral-400 underline underline-offset-4 hover:text-white transition-colors">Vibed by Bohemia</a>
            <a href="https://github.com/bohemia111/relaxyz" target="_blank" rel="noopener noreferrer" className="text-neutral-400 underline underline-offset-4 hover:text-white transition-colors">Github</a>
          </div>
          <div className="space-y-1">
            <p>Built for the Nostr ecosystem.</p>
            <p>Breathwork is a powerful tool for self-regulation.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
