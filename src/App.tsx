/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'motion/react';
import { 
  Wind, 
  LogIn, 
  LogOut, 
  Play, 
  Pause as PauseIcon, 
  RotateCcw, 
  ChevronRight, 
  ChevronLeft,
  CheckCircle2, 
  Share2, 
  User, 
  Plus, 
  Trash2, 
  X, 
  Volume2, 
  VolumeX,
  Waves,
  CloudRain,
  Trees,
  Settings,
  Clock,
  Timer,
  TrendingUp,
  Award,
  Calendar,
  BarChart2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import confetti from 'canvas-confetti';
import { BREATHING_PATTERNS, BreathingPattern, BreathingPhase, SoundType, SOUND_OPTIONS, Session } from './types';
import { loginWithNostr, postSessionToNostr } from './nostr';

export default function App() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [customPatterns, setCustomPatterns] = useState<BreathingPattern[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<BreathingPattern | null>(null);
  const [isBreathing, setIsBreathing] = useState(false);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [timeLeftInPhase, setTimeLeftInPhase] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedSound, setSelectedSound] = useState<SoundType>('forest');
  const [goalMinutes, setGoalMinutes] = useState<string>('00');
  const [goalSeconds, setGoalSeconds] = useState<string>('00');
  const [timeGoal, setTimeGoal] = useState<number | null>(null); // in seconds
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem('relaxyz_sessions');
    const parsed = saved ? JSON.parse(saved) : [];
    return parsed.filter((s: Session) => s.timestamp >= new Date('2026-03-20').getTime());
  });
  const [showProgress, setShowProgress] = useState(false);
  const [activityTimeframe, setActivityTimeframe] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('week');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [hoveredTimeframe, setHoveredTimeframe] = useState<'day' | 'week' | 'month' | 'year' | 'all' | null>(null);
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());

  const SITE_START_DATE = useMemo(() => new Date('2026-03-20'), []);

  const scale = useMotionValue(0.8);

  useEffect(() => {
    localStorage.setItem('relaxyz_sessions', JSON.stringify(sessions));
  }, [sessions]);

  const { currentStreak, bestStreak } = useMemo(() => {
    if (sessions.length === 0) return { currentStreak: 0, bestStreak: 0 };
    
    const dates = Array.from(new Set(sessions.map(s => new Date(s.timestamp).toDateString())))
      .map((d: string) => new Date(d).getTime())
      .sort((a, b) => b - a);
    
    let current = 0;
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    
    const hasToday = sessions.some(s => new Date(s.timestamp).toDateString() === today);
    const hasYesterday = sessions.some(s => new Date(s.timestamp).toDateString() === yesterday);
    
    if (!hasToday && !hasYesterday) {
      current = 0;
    } else {
      let lastDate = hasToday ? new Date(today).getTime() : new Date(yesterday).getTime();
      current = 1;
      
      for (let i = dates.indexOf(lastDate) + 1; i < dates.length; i++) {
        if (lastDate - dates[i] === 86400000) {
          current++;
          lastDate = dates[i];
        } else {
          break;
        }
      }
    }
    
    // Best streak
    let best = 0;
    let temp = 1;
    const sortedDates = [...dates].sort((a, b) => a - b);
    for (let i = 1; i < sortedDates.length; i++) {
      if (sortedDates[i] - sortedDates[i-1] === 86400000) {
        temp++;
      } else {
        best = Math.max(best, temp);
        temp = 1;
      }
    }
    best = Math.max(best, temp);
    
    return { currentStreak: current, bestStreak: best };
  }, [sessions]);

  const chartData = useMemo(() => {
    const ref = new Date(referenceDate);
    const data: { name: string; value: number }[] = [];
    
    if (activityTimeframe === 'day') {
      // Start of the selected day
      const startOfDay = new Date(ref);
      startOfDay.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < 24; i++) {
        const hourStart = new Date(startOfDay);
        hourStart.setHours(i);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(i + 1);
        
        const hour = i % 12 || 12;
        const ampm = i < 12 ? 'a' : 'p';
        const label = `${hour}${ampm}`;
        const value = sessions
          .filter(s => s.timestamp >= hourStart.getTime() && s.timestamp < hourEnd.getTime())
          .reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
      }
    } else if (activityTimeframe === 'week') {
      // 7 days ending at referenceDate
      const start = new Date(ref);
      start.setDate(ref.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        const label = day.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
        const value = sessions
          .filter(s => new Date(s.timestamp).toDateString() === day.toDateString())
          .reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
      }
    } else if (activityTimeframe === 'month') {
      // All days in the selected month
      const startOfMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const endOfMonth = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      
      for (let i = 1; i <= endOfMonth.getDate(); i++) {
        const day = new Date(ref.getFullYear(), ref.getMonth(), i);
        const label = i.toString();
        const value = sessions
          .filter(s => new Date(s.timestamp).toDateString() === day.toDateString())
          .reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
      }
    } else if (activityTimeframe === 'year') {
      // All months in the selected year
      for (let i = 0; i < 12; i++) {
        const label = new Date(ref.getFullYear(), i).toLocaleDateString('en-US', { month: 'short' });
        const value = sessions
          .filter(s => {
            const sd = new Date(s.timestamp);
            return sd.getMonth() === i && sd.getFullYear() === ref.getFullYear();
          })
          .reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
      }
    } else {
      if (sessions.length === 0) return [];
      const firstSession = Math.min(...sessions.map(s => s.timestamp));
      const start = new Date(Math.max(firstSession, SITE_START_DATE.getTime()));
      start.setDate(1);
      const end = new Date();
      
      let curr = new Date(start);
      while (curr <= end) {
        const label = curr.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const value = sessions
          .filter(s => {
            const sd = new Date(s.timestamp);
            return sd.getMonth() === curr.getMonth() && sd.getFullYear() === curr.getFullYear();
          })
          .reduce((acc, s) => acc + s.duration, 0);
        data.push({ name: label, value: Math.round(value / 60) });
        curr.setMonth(curr.getMonth() + 1);
      }
    }
    
    return data;
  }, [sessions, activityTimeframe, referenceDate, SITE_START_DATE]);

  const phaseScales = useMemo(() => {
    if (!selectedPattern) return [];
    const scales: number[] = [];
    let lastScale = 0.8;
    selectedPattern.phases.forEach((phase, i) => {
      if (phase.name === 'Inhale') {
        scales[i] = 1.5;
        lastScale = 1.5;
      } else if (phase.name === 'Exhale') {
        scales[i] = 0.8;
        lastScale = 0.8;
      } else {
        scales[i] = lastScale;
      }
    });
    return scales;
  }, [selectedPattern]);

  const lastPhaseIndexRef = useRef(currentPhaseIndex);

  useEffect(() => {
    if (!selectedPattern) return;
    
    if (!isBreathing) {
      scale.stop();
    } else {
      const target = phaseScales[currentPhaseIndex];
      const isNewPhase = lastPhaseIndexRef.current !== currentPhaseIndex;
      const duration = isNewPhase ? selectedPattern.phases[currentPhaseIndex].duration : timeLeftInPhase;
      
      animate(scale, target, {
        duration: duration,
        ease: "easeInOut"
      });
      
      lastPhaseIndexRef.current = currentPhaseIndex;
    }
  }, [currentPhaseIndex, isBreathing, selectedPattern, phaseScales]);

  useEffect(() => {
    if (!selectedPattern) {
      scale.stop();
      scale.set(0.8);
    }
  }, [selectedPattern, scale]);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const backgroundNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const forestGainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);

  // Initialize Audio Context
  const initAudio = useCallback(async (sound: SoundType = selectedSound) => {
    // If context exists, we might need to stop the old node
    if (audioCtxRef.current) {
      if (backgroundNodeRef.current) {
        try {
          backgroundNodeRef.current.stop();
        } catch (e) {}
      }
    } else {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
    }
    
    const ctx = audioCtxRef.current!;
    
    if (sound === 'silence') {
      backgroundNodeRef.current = null;
      filterRef.current = null;
      forestGainRef.current = null;
      return;
    }
    
    // Background ambience (synthesized)
    const bufferSize = 20 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    
    // Warm up the filter to stabilize lastOut
    for (let i = 0; i < 1000; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + (0.02 * white)) / 1.02;
    }

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      
      if (sound === 'forest') {
        // Brown noise for forest floor
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 6.0;
      } else if (sound === 'ocean') {
        // Rolling waves: modulated pink-ish noise
        const b0 = 0.0221917 * white;
        const b1 = 0.0197081 * white;
        const b2 = 0.0123921 * white;
        // 5-second wave cycle
        const waveMod = Math.sin(i / (ctx.sampleRate * 5) * Math.PI * 2) * 0.4 + 0.6;
        output[i] = (b0 + b1 + b2) * waveMod;
        output[i] *= 15.0;
      } else if (sound === 'rain') {
        // Softer rain: filtered white noise
        output[i] = white * 0.4;
      } else if (sound === 'wind') {
        // Very low brown noise
        output[i] = (lastOut + (0.01 * white)) / 1.01;
        lastOut = output[i];
        output[i] *= 8.0;
      }
    }

    // Seamless loop: crossfade
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
    else if (sound === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.value = 2200;
    } else if (sound === 'wind') filter.frequency.value = 300;

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

  // Handle sound change
  const changeSound = (sound: SoundType) => {
    setSelectedSound(sound);
    if (isBreathing) {
      initAudio(sound);
    }
  };

  // Form state for custom pattern
  const [newName, setNewName] = useState('');
  const [newInhale, setNewInhale] = useState(4);
  const [newHold, setNewHold] = useState(4);
  const [newExhale, setNewExhale] = useState(4);
  const [newPause, setNewPause] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Update Audio based on phase
  useEffect(() => {
    if (!audioCtxRef.current || !forestGainRef.current) return;

    const ctx = audioCtxRef.current;
    const gain = forestGainRef.current.gain;
    const now = ctx.currentTime;
    const BASE_GAIN = 0.02; // Subtle baseline so it never feels "dead"
    const PEAK_GAIN = 0.35;

    if (!isBreathing || isMuted || !selectedPattern) {
      gain.cancelScheduledValues(now);
      // Use a slightly longer fade out for the pause to prevent pops
      gain.setTargetAtTime(0, now, 0.1);
      return;
    }

    const phase = selectedPattern.phases[currentPhaseIndex];
    if (!phase) return;

    const duration = phase.duration;

    if (phase.name === 'Inhale') {
      // Natural breath curve: smooth rise, then very gradual fall
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      
      // Rise to peak
      gain.linearRampToValueAtTime(PEAK_GAIN, now + duration * 0.4);
      
      // Start fading out early and very slowly to reach baseline exactly at the end
      const fadeOutStart = now + duration * 0.5;
      gain.setValueAtTime(PEAK_GAIN, fadeOutStart);
      gain.exponentialRampToValueAtTime(BASE_GAIN, now + duration);
    } else if (phase.name === 'Exhale') {
      // Natural exhale: quick rise, then long sigh-like fall to baseline
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      
      gain.linearRampToValueAtTime(PEAK_GAIN, now + 0.8);
      gain.exponentialRampToValueAtTime(BASE_GAIN, now + duration);
    } else {
      // Hold or Pause - maintain the baseline volume with a very soft transition
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      // Use setTargetAtTime for an asymptotic approach to baseline, which is extremely smooth
      gain.setTargetAtTime(BASE_GAIN, now, 0.6); 
    }
  }, [currentPhaseIndex, isBreathing, isMuted, selectedPattern]);

  // Load custom patterns
  useEffect(() => {
    const saved = localStorage.getItem('nostr-breath-custom');
    if (saved) {
      try {
        setCustomPatterns(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load custom patterns', e);
      }
    }
  }, []);

  // Save custom patterns
  const saveCustomPattern = () => {
    if (!newName.trim()) return;

    const phases: BreathingPhase[] = [
      { name: 'Inhale', duration: newInhale, color: 'bg-blue-400' },
    ];
    if (newHold > 0) phases.push({ name: 'Hold', duration: newHold, color: 'bg-blue-600' });
    phases.push({ name: 'Exhale', duration: newExhale, color: 'bg-blue-400' });
    if (newPause > 0) phases.push({ name: 'Hold', duration: newPause, color: 'bg-blue-200' });

    const newPattern: BreathingPattern = {
      id: `custom-${Date.now()}`,
      name: newName,
      description: 'Custom breathing rhythm.',
      phases
    };

    const updated = [...customPatterns, newPattern];
    setCustomPatterns(updated);
    localStorage.setItem('nostr-breath-custom', JSON.stringify(updated));
    setIsCreating(false);
    
    // Reset form
    setNewName('');
    setNewInhale(4);
    setNewHold(4);
    setNewExhale(4);
    setNewPause(0);
  };

  const deleteCustomPattern = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPatterns.filter(p => p.id !== id);
    setCustomPatterns(updated);
    localStorage.setItem('nostr-breath-custom', JSON.stringify(updated));
  };

  // Handle Login
  const handleLogin = async () => {
    const key = await loginWithNostr();
    if (key) setPubkey(key);
  };

  const handleLogout = () => {
    setPubkey(null);
  };

  // Start Session
  const startSession = (pattern: BreathingPattern) => {
    initAudio();
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    
    // Calculate goal from inputs
    const mins = parseInt(goalMinutes) || 0;
    const secs = parseInt(goalSeconds) || 0;
    const totalGoal = mins * 60 + secs;
    setTimeGoal(totalGoal > 0 ? totalGoal : null);
    
    setSelectedPattern(pattern);
    setIsBreathing(true);
    setCurrentPhaseIndex(0);
    setTimeLeftInPhase(pattern.phases[0].duration);
    setSessionStartTime(Date.now());
    setElapsedSeconds(0);
    setIsCompleted(false);
  };

  const handleComplete = () => {
    setIsBreathing(false);
    setIsCompleted(true);
    
    // Save session
    if (selectedPattern && sessionStartTime) {
      const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
      const newSession: Session = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        duration,
        pattern: selectedPattern.name
      };
      setSessions(prev => [...prev, newSession]);
    }

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#60a5fa', '#34d399', '#818cf8']
    });
  };

  const handleShare = async () => {
    if (!pubkey || !selectedPattern || !sessionStartTime) return;
    setIsPosting(true);
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    const success = await postSessionToNostr(pubkey, {
      pattern: selectedPattern.name,
      duration
    });
    setIsPosting(false);
    if (success) {
      alert('Session shared to Nostr!');
    }
  };

  // Timer Logic
  useEffect(() => {
    if (isBreathing && selectedPattern) {
      timerRef.current = setInterval(() => {
        // Update elapsed time
        if (sessionStartTime) {
          const now = Date.now();
          const elapsed = Math.floor((now - sessionStartTime) / 1000);
          setElapsedSeconds(elapsed);
          
          // Check if goal reached
          if (timeGoal && elapsed >= timeGoal) {
            handleComplete();
            return;
          }
        }

        setTimeLeftInPhase((prev) => {
          if (prev <= 0.1) {
            // Move to next phase
            const nextIndex = (currentPhaseIndex + 1) % selectedPattern.phases.length;
            setCurrentPhaseIndex(nextIndex);
            return selectedPattern.phases[nextIndex].duration;
          }
          // Use precision to avoid floating point errors
          return Math.round((prev - 0.1) * 10) / 10;
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isBreathing, currentPhaseIndex, selectedPattern, sessionStartTime, timeGoal]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentPhase = selectedPattern?.phases[currentPhaseIndex];
  const inhalePhase = selectedPattern?.phases.find(p => p.name === 'Inhale');
  const exhalePhase = selectedPattern?.phases.find(p => p.name === 'Exhale');
  const allPatterns = [...BREATHING_PATTERNS, ...customPatterns];

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans antialiased">
      {/* Header */}
      <header className="p-6 flex justify-between items-center border-b border-neutral-800">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <Wind className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-display font-bold tracking-tight">Relaxyz</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowProgress(true)}
            className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 px-4 py-2 rounded-full border border-neutral-800 transition-all text-sm font-medium"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            My Progress
          </button>

          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {pubkey ? (
            <div className="flex items-center gap-3 bg-neutral-900 px-4 py-2 rounded-full border border-neutral-800">
              <User className="w-4 h-4 text-neutral-400" />
              <span className="text-xs font-mono text-neutral-400">
                {pubkey.slice(0, 8)}...{pubkey.slice(-4)}
              </span>
              <button 
                onClick={handleLogout}
                className="text-neutral-500 hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-full transition-all font-medium text-sm"
            >
              <LogIn className="w-4 h-4" />
              Login with NIP-07 extension
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full relative">
        <AnimatePresence mode="wait">
          {showProgress ? (
            /* Progress View */
            <motion.div
              key="progress"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl overflow-y-auto max-h-[80vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10">
                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                  </div>
                  <h2 className="text-2xl font-display font-bold">My Progress</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowProgress(false)}
                    className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Streak Cards */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-neutral-800/50 p-6 rounded-2xl border border-neutral-700/50 flex flex-col items-center text-center">
                  <Award className="w-8 h-8 text-orange-400 mb-2" />
                  <span className="text-3xl font-display font-bold text-white">{currentStreak}</span>
                  <span className="text-xs uppercase tracking-widest text-neutral-500 font-bold">Current Streak</span>
                </div>
                <div className="bg-neutral-800/50 p-6 rounded-2xl border border-neutral-700/50 flex flex-col items-center text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                  <span className="text-3xl font-display font-bold text-white">{bestStreak}</span>
                  <span className="text-xs uppercase tracking-widest text-neutral-500 font-bold">Best Streak</span>
                </div>
              </div>

              {/* Activity Section */}
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
                  <div className="flex items-center gap-2">
                    <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800 relative">
                      {(['day', 'week', 'month', 'year', 'all'] as const).map((t) => (
                        <div 
                          key={t} 
                          className="relative"
                          onMouseEnter={() => {
                            setHoveredTimeframe(t);
                            if (t === 'day') setCalendarViewDate(new Date(referenceDate));
                          }}
                          onMouseLeave={() => setHoveredTimeframe(null)}
                        >
                          <button
                            onClick={() => {
                              setActivityTimeframe(t);
                              setReferenceDate(new Date());
                            }}
                            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                              activityTimeframe === t 
                                ? 'bg-neutral-800 text-white' 
                                : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                          >
                            {t}
                          </button>

                          {/* Hover Popover */}
                          <AnimatePresence>
                            {hoveredTimeframe === t && t !== 'all' && (
                              <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-2xl min-w-[160px]"
                              >
                              <div className="flex items-center justify-between mb-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newDate = new Date(referenceDate);
                                    if (t === 'day') newDate.setDate(newDate.getDate() - 1);
                                    else if (t === 'week') newDate.setDate(newDate.getDate() - 7);
                                    else if (t === 'month') newDate.setMonth(newDate.getMonth() - 1);
                                    else if (t === 'year') newDate.setFullYear(newDate.getFullYear() - 1);
                                    
                                    if (newDate >= SITE_START_DATE) {
                                      setReferenceDate(newDate);
                                      setActivityTimeframe(t);
                                    }
                                  }}
                                  disabled={referenceDate <= SITE_START_DATE}
                                  className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-white disabled:opacity-20"
                                >
                                  <ChevronLeft className="w-3 h-3" />
                                </button>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-center">
                                  Select {t}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newDate = new Date(referenceDate);
                                    if (t === 'day') newDate.setDate(newDate.getDate() + 1);
                                    else if (t === 'week') newDate.setDate(newDate.getDate() + 7);
                                    else if (t === 'month') newDate.setMonth(newDate.getMonth() + 1);
                                    else if (t === 'year') newDate.setFullYear(newDate.getFullYear() + 1);
                                    
                                    if (newDate <= new Date()) {
                                      setReferenceDate(newDate);
                                      setActivityTimeframe(t);
                                    }
                                  }}
                                  disabled={referenceDate >= new Date()}
                                  className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-white disabled:opacity-20"
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                                
                                {t === 'day' && (
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between px-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const d = new Date(calendarViewDate);
                                          d.setMonth(d.getMonth() - 1);
                                          setCalendarViewDate(d);
                                        }}
                                        className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-white"
                                      >
                                        <ChevronLeft className="w-3 h-3" />
                                      </button>
                                      <div className="text-[10px] font-bold text-neutral-400">
                                        {calendarViewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const d = new Date(calendarViewDate);
                                          d.setMonth(d.getMonth() + 1);
                                          setCalendarViewDate(d);
                                        }}
                                        className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-white"
                                      >
                                        <ChevronRight className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                                        <div key={d} className="text-[8px] text-center text-neutral-600 font-bold">{d}</div>
                                      ))}
                                      {(() => {
                                        const year = calendarViewDate.getFullYear();
                                        const month = calendarViewDate.getMonth();
                                        const firstDay = new Date(year, month, 1).getDay();
                                        const daysInMonth = new Date(year, month + 1, 0).getDate();
                                        const days = [];
                                        for (let i = 0; i < firstDay; i++) days.push(<div key={`pad-${i}`} />);
                                        for (let i = 1; i <= daysInMonth; i++) {
                                          const d = new Date(year, month, i);
                                          const isSelected = d.toDateString() === referenceDate.toDateString();
                                          const isToday = d.toDateString() === new Date().toDateString();
                                          const isDisabled = d < SITE_START_DATE || d > new Date();
                                          days.push(
                                            <button
                                              key={i}
                                              disabled={isDisabled}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setReferenceDate(d);
                                                setActivityTimeframe('day');
                                              }}
                                              className={`w-5 h-5 flex items-center justify-center text-[9px] rounded-md transition-all ${
                                                isSelected 
                                                  ? 'bg-blue-500 text-white font-bold' 
                                                  : isToday
                                                    ? 'bg-neutral-800 text-blue-400 font-bold'
                                                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'
                                              } ${isDisabled ? 'opacity-10 cursor-not-allowed' : ''}`}
                                            >
                                              {i}
                                            </button>
                                          );
                                        }
                                        return days;
                                      })()}
                                    </div>
                                  </div>
                                )}

                                {t === 'week' && (
                                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                    {Array.from({ length: 12 }, (_, i) => {
                                      const end = new Date();
                                      end.setDate(end.getDate() - (i * 7));
                                      const start = new Date(end);
                                      start.setDate(end.getDate() - 6);
                                      
                                      if (end < SITE_START_DATE && i > 0) return null;
                                      return (
                                        <button
                                          key={i}
                                          onClick={() => {
                                            setReferenceDate(end);
                                            setActivityTimeframe('week');
                                          }}
                                          className="text-[10px] text-left px-2 py-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                                        >
                                          {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {t === 'month' && (
                                  <div className="grid grid-cols-2 gap-1">
                                    {Array.from({ length: 12 }, (_, i) => {
                                      const d = new Date();
                                      d.setMonth(d.getMonth() - i);
                                      d.setDate(1);
                                      if (d < new Date(SITE_START_DATE.getFullYear(), SITE_START_DATE.getMonth(), 1)) return null;
                                      return (
                                        <button
                                          key={i}
                                          onClick={() => {
                                            setReferenceDate(d);
                                            setActivityTimeframe('month');
                                          }}
                                          className="text-[10px] px-2 py-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                                        >
                                          {d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {t === 'year' && (
                                  <div className="flex flex-col gap-1">
                                    {Array.from({ length: 5 }, (_, i) => {
                                      const year = new Date().getFullYear() - i;
                                      if (year < SITE_START_DATE.getFullYear()) return null;
                                      return (
                                        <button
                                          key={i}
                                          onClick={() => {
                                            const d = new Date();
                                            d.setFullYear(year);
                                            setReferenceDate(d);
                                            setActivityTimeframe('year');
                                          }}
                                          className="text-[10px] px-2 py-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                                        >
                                          {year}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="#525252" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        interval={activityTimeframe === 'day' ? 5 : (activityTimeframe === 'month' ? 4 : 0)}
                      />
                      <YAxis 
                        stroke="#525252" 
                        fontSize={10} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(v) => `${v}m`}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#60a5fa' }}
                        cursor={{ fill: '#262626' }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#60a5fa' : '#262626'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent Sessions */}
              <div className="mt-8">
                <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400 mb-4">Recent Sessions</h3>
                <div className="space-y-3">
                  {sessions.slice(-20).reverse().map((s) => (
                    <div key={s.id} className="flex justify-between items-center p-4 bg-neutral-800/20 rounded-xl border border-neutral-800/50">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                          <Wind className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{s.pattern}</div>
                          <div className="text-[10px] text-neutral-500">
                            {new Date(s.timestamp).toLocaleDateString()} at {new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-mono text-neutral-400">
                        {Math.floor(s.duration / 60)}m {s.duration % 60}s
                      </div>
                    </div>
                  ))}
                  {sessions.length === 0 && (
                    <div className="text-center py-8 text-neutral-600 italic text-sm">
                      No sessions recorded yet. Start breathing!
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : isCreating ? (
            /* Custom Pattern Form */
            <motion.div
              key="creating"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-8 rounded-3xl shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-display font-bold">New Pattern</h2>
                <button onClick={() => setIsCreating(false)} className="text-neutral-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Name</label>
                  <input 
                    type="text" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Morning Flow"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Inhale (s)</label>
                    <input 
                      type="number" 
                      min="0.1"
                      step="0.1"
                      value={newInhale}
                      onChange={(e) => setNewInhale(parseFloat(e.target.value) || 1)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Hold (s)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.1"
                      value={newHold}
                      onChange={(e) => setNewHold(parseFloat(e.target.value) || 0)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Exhale (s)</label>
                    <input 
                      type="number" 
                      min="0.1"
                      step="0.1"
                      value={newExhale}
                      onChange={(e) => setNewExhale(parseFloat(e.target.value) || 1)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Pause (s)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.1"
                      value={newPause}
                      onChange={(e) => setNewPause(parseFloat(e.target.value) || 0)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                <button 
                  onClick={saveCustomPattern}
                  disabled={!newName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-4 rounded-xl font-bold transition-all mt-4"
                >
                  Save Exercise
                </button>
              </div>
            </motion.div>
          ) : !selectedPattern ? (
            /* Pattern Selection */
            <motion.div 
              key="selection"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl font-display font-bold mb-4">Choose your rhythm</h2>
                <p className="text-neutral-400 max-w-md mx-auto mb-8">
                  Select a breathing pattern to begin your practice. Connect with your breath and find your center.
                </p>
                <div className="flex flex-wrap justify-center gap-4 mb-8">
                  <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 px-6 py-3 rounded-full font-medium">
                    <Volume2 className="w-5 h-5 text-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mr-2">Soundscape</span>
                    <select 
                      value={selectedSound}
                      onChange={(e) => changeSound(e.target.value as SoundType)}
                      className="bg-transparent focus:outline-none text-white text-center cursor-pointer appearance-none border-b border-neutral-700 focus:border-blue-500 px-1"
                    >
                      {SOUND_OPTIONS.map(option => (
                        <option key={option.id} value={option.id} className="bg-neutral-900">
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button 
                    onClick={() => setIsCreating(true)}
                    className="inline-flex items-center gap-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-white px-6 py-3 rounded-full transition-all font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    Create Pattern
                  </button>

                  <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 px-6 py-3 rounded-full font-medium">
                    <Timer className="w-5 h-5 text-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mr-2">Timer</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={goalMinutes}
                        onChange={(e) => setGoalMinutes(e.target.value)}
                        className="bg-transparent focus:outline-none text-white text-center cursor-pointer appearance-none border-b border-neutral-700 focus:border-blue-500 px-1"
                      >
                        {Array.from({ length: 61 }, (_, i) => (
                          <option key={i} value={i.toString().padStart(2, '0')} className="bg-neutral-900">
                            {i.toString().padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                      <span className="text-neutral-500 text-xs uppercase font-bold">m</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <select 
                        value={goalSeconds}
                        onChange={(e) => setGoalSeconds(e.target.value)}
                        className="bg-transparent focus:outline-none text-white text-center cursor-pointer appearance-none border-b border-neutral-700 focus:border-blue-500 px-1"
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <option key={i} value={i.toString().padStart(2, '0')} className="bg-neutral-900">
                            {i.toString().padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                      <span className="text-neutral-500 text-xs uppercase font-bold">s</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allPatterns.map((pattern) => (
                  <button
                    key={pattern.id}
                    onClick={() => startSession(pattern)}
                    className="group relative bg-neutral-900 border border-neutral-800 p-6 rounded-2xl text-left hover:border-blue-500 transition-all duration-300 overflow-hidden"
                  >
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xl font-bold group-hover:text-blue-400 transition-colors">
                          {pattern.name}
                        </h3>
                        {pattern.id.startsWith('custom-') && (
                          <button 
                            onClick={(e) => deleteCustomPattern(pattern.id, e)}
                            className="text-neutral-700 hover:text-red-400 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-neutral-500 mb-4">
                        {pattern.description}
                      </p>
                      <div className="flex gap-1">
                        {pattern.phases.map((p, i) => (
                          <div 
                            key={i} 
                            className={`h-1 flex-1 rounded-full ${p.color} opacity-40`}
                            style={{ flexGrow: p.duration }}
                          />
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="absolute right-6 bottom-6 w-6 h-6 text-neutral-700 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </motion.div>
          ) : isCompleted ? (
            /* Completion Summary */
            <motion.div 
              key="completed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <CheckCircle2 className="w-20 h-20 text-emerald-400 mx-auto mb-6" />
              <h2 className="text-4xl font-display font-bold mb-2">Session Complete</h2>
              <p className="text-neutral-400 mb-8">You've successfully completed your {selectedPattern.name} session.</p>
              
              <div className="flex flex-col gap-3 max-w-xs mx-auto">
                {pubkey ? (
                  <button
                    onClick={handleShare}
                    disabled={isPosting}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-3 rounded-full font-bold transition-all"
                  >
                    <Share2 className="w-5 h-5" />
                    {isPosting ? 'Posting...' : 'Share to Nostr'}
                  </button>
                ) : (
                  <p className="text-xs text-neutral-500 mb-2">Login to share your progress on Nostr</p>
                )}
                <button
                  onClick={() => setSelectedPattern(null)}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 rounded-full font-bold transition-all"
                >
                  Back to Patterns
                </button>
              </div>
            </motion.div>
          ) : (
            /* Breathing Session */
            <motion.div 
              key="session"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center w-full"
            >
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-display font-bold text-neutral-400">{selectedPattern.name}</h2>
                <div className="flex gap-2 mt-2 justify-center">
                  {selectedPattern.phases.map((p, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div 
                        className={`h-1.5 w-8 rounded-full transition-all duration-500 ${
                          i === currentPhaseIndex ? p.color : 'bg-neutral-800'
                        }`}
                      />
                      <span className="text-[10px] font-mono text-white">{p.duration}s</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timer Display */}
              <div className="flex flex-col items-center gap-2 mb-8">
                <div className="flex items-center gap-4 bg-neutral-900/50 px-6 py-2 rounded-full border border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-mono font-bold">
                      {timeGoal 
                        ? formatTime(Math.max(0, timeGoal - elapsedSeconds)) 
                        : formatTime(elapsedSeconds)}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-600">Breaths:</span>
                    <span className="text-white">
                      {(() => {
                        const totalBreathDuration = selectedPattern.phases.reduce((acc, p) => acc + p.duration, 0);
                        return timeGoal ? Math.floor(timeGoal / totalBreathDuration) : "Continuous";
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-600">BPM:</span>
                    <span className="text-white">
                      {(60 / selectedPattern.phases.reduce((acc, p) => acc + p.duration, 0)).toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Breathing Visualizer */}
              <div className="relative w-80 h-80 flex items-center justify-center mb-16">
                {/* Stationary Max Circle (Background) */}
                <div 
                  className={`absolute w-60 h-60 rounded-full ${currentPhase?.color || 'bg-blue-600'} opacity-50 z-0 transition-colors duration-500`}
                />
                
                {/* Breathing Circle (Animated) */}
                <motion.div
                  style={{ scale }}
                  className={`w-40 h-40 rounded-full flex items-center justify-center z-10 shadow-2xl ${currentPhase?.color || 'bg-blue-500'} transition-colors duration-500`}
                >
                  <div className="text-center text-white">
                    <div className="text-4xl font-display font-bold leading-none">{Math.ceil(timeLeftInPhase)}</div>
                    <div className="text-xs uppercase tracking-widest font-bold opacity-80">{currentPhase?.name}</div>
                  </div>
                </motion.div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-12">
                <button 
                  onClick={() => setSelectedPattern(null)}
                  className="p-3 rounded-full bg-neutral-900 text-neutral-400 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-6 h-6" />
                </button>
                
                <button 
                  onClick={() => setIsBreathing(!isBreathing)}
                  className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl"
                >
                  {isBreathing ? (
                    <PauseIcon className="w-10 h-10 fill-current" />
                  ) : (
                    <Play className="w-10 h-10 fill-current ml-1" />
                  )}
                </button>

                <button 
                  onClick={handleComplete}
                  className="p-3 rounded-full bg-neutral-900 text-neutral-400 hover:text-emerald-400 transition-colors"
                >
                  <CheckCircle2 className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="p-8 text-center text-neutral-600 text-xs border-t border-neutral-900">
        <p>Built for the Nostr ecosystem. Login with NIP-07 extension.</p>
        <p className="mt-2">Breathwork is a powerful tool for self-regulation. Practice safely.</p>
        <div className="mt-4 flex flex-row justify-center items-center gap-6">
          <a 
            href="https://njump.me/nprofile1qqsymsh9wrz5lmurz0arqn6jjaqyfmtvz2z3qpfxqz5msnvr0wqjd7gprdmhxue69uhhg6r9vehhyetnwshxummnw3erztnrdakj7qgcwaehxw309aehqct5d9sj6ctjvdskucfwvdhk6tcpkvxva" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-neutral-400 underline underline-offset-4 hover:text-white transition-colors"
          >
            Vibed by Bohemia
          </a>
          <a 
            href="https://github.com/bohemia111/relaxyz" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-neutral-400 underline underline-offset-4 hover:text-white transition-colors"
          >
            Github
          </a>
        </div>
      </footer>
    </div>
  );
}
