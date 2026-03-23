export type SoundType = 'forest' | 'ocean' | 'rain' | 'wind' | 'silence';

export const SOUND_OPTIONS: { id: SoundType; name: string; description: string }[] = [
  { id: 'forest', name: 'Forest Floor', description: 'Deep, earthy brown noise.' },
  { id: 'ocean', name: 'Ocean Waves', description: 'Gentle, rolling surf.' },
  { id: 'rain', name: 'Soft Rain', description: 'Light, steady rainfall.' },
  { id: 'wind', name: 'Deep Wind', description: 'Low, resonant mountain breeze.' },
  { id: 'silence', name: 'Silence', description: 'No background soundscape.' },
];

export interface BreathingPhase {
  name: 'Inhale' | 'Hold' | 'Exhale';
  duration: number; // in seconds
  color: string;
}

export interface BreathingPattern {
  id: string;
  name: string;
  description: string;
  phases: BreathingPhase[];
  instruction?: string;
}

export interface Session {
  id: string;
  timestamp: number;
  duration: number;
  pattern: string;
}

export const BREATHING_PATTERNS: BreathingPattern[] = [
  {
    id: 'box',
    name: 'Box Breathing',
    description: 'Relieve stress and improve focus.',
    phases: [
      { name: 'Inhale', duration: 4, color: 'bg-blue-400' },
      { name: 'Hold', duration: 4, color: 'bg-blue-600' },
      { name: 'Exhale', duration: 4, color: 'bg-blue-400' },
      { name: 'Hold', duration: 4, color: 'bg-blue-200' },
    ],
  },
  {
    id: '478',
    name: '4-7-8 Technique',
    description: 'Natural tranquilizer for the nervous system.',
    phases: [
      { name: 'Inhale', duration: 4, color: 'bg-emerald-400' },
      { name: 'Hold', duration: 7, color: 'bg-emerald-600' },
      { name: 'Exhale', duration: 8, color: 'bg-emerald-400' },
    ],
  },
  {
    id: 'calm',
    name: 'Calm Breath',
    description: 'Slower breathing for relaxation.',
    phases: [
      { name: 'Inhale', duration: 4.5, color: 'bg-indigo-400' },
      { name: 'Hold', duration: 0.5, color: 'bg-indigo-600' },
      { name: 'Exhale', duration: 6.5, color: 'bg-indigo-400' },
      { name: 'Hold', duration: 0.5, color: 'bg-indigo-200' },
    ],
  },
  {
    id: 'heart-coherence',
    name: 'Heart Coherence',
    description: 'Focus on your heart space and the feeling of gratitude.',
    instruction: 'Focus on your heart space and the feeling of gratitude.',
    phases: [
      { name: 'Inhale', duration: 5, color: 'bg-pink-400' },
      { name: 'Exhale', duration: 5, color: 'bg-pink-400' },
    ],
  },
  {
    id: 'power',
    name: 'Wake Up',
    description: 'Energize your body and mind.',
    phases: [
      { name: 'Inhale', duration: 4, color: 'bg-orange-400' },
      { name: 'Hold', duration: 4, color: 'bg-orange-600' },
      { name: 'Exhale', duration: 2, color: 'bg-orange-400' },
      { name: 'Hold', duration: 1, color: 'bg-orange-200' },
    ],
  },
  {
    id: 'stamina',
    name: 'Stamina',
    description: 'Build lung capacity and endurance.',
    phases: [
      { name: 'Inhale', duration: 6, color: 'bg-red-400' },
      { name: 'Hold', duration: 12, color: 'bg-red-600' },
      { name: 'Exhale', duration: 6, color: 'bg-red-400' },
    ],
  },
];
