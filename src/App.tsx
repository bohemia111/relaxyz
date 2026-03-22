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
  Download
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BREATHING_PATTERNS, BreathingPattern, BreathingPhase, SoundType, SOUND_OPTIONS } from './types';
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const scale = useMotionValue(0.8);

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

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

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
          {deferredPrompt && (
            <button 
              onClick={handleInstallClick}
              className="px-4 py-2 rounded-full bg-blue-600 text-white border border-blue-400 shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all text-sm font-medium flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Install App
            </button>
          )}

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
          {isCreating ? (
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
      </footer>
    </div>
  );
}
