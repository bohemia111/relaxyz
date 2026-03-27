/**
 * nostr.ts — Nostr integration for Relaxyz
 *
 * Fixes vs original:
 * - All WebSockets are properly closed after use
 * - onerror handlers on every WebSocket
 * - Typed event/relay data instead of `any`
 * - Relay timeout reduced to 3s (was 6s)
 * - JSON.parse guarded with try/catch on relay messages
 * - Exported functions match what App.tsx imports
 */

import { Session, BreathingPattern } from './types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

interface RelayMessage {
  0: 'EVENT' | 'EOSE' | 'OK' | 'NOTICE';
  1?: string | NostrEvent;
  2?: NostrEvent;
}

export interface PrivateState {
  sessions?: Session[];
  earnedAchievements?: string[];
  customPatterns?: BreathingPattern[];
}

export interface NostrProfile {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
}

// ─── Relay configuration ───────────────────────────────────────────────────

const PRIVATE_RELAY = 'wss://relaxy.nostr1.com';

const PUBLIC_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
];

const RELAY_TIMEOUT_MS = 3000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function safeParseRelayMessage(raw: string): RelayMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 1) return null;
    return parsed as unknown as RelayMessage;
  } catch {
    return null;
  }
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection to ${url} timed out`));
    }, RELAY_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(timeout);
      resolve(ws);
    };
    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

async function sendEventToRelay(event: NostrEvent, url: string): Promise<boolean> {
  let ws: WebSocket | null = null;
  try {
    ws = await openSocket(url);
    ws.send(JSON.stringify(['EVENT', event]));
    return true;
  } catch (e) {
    console.warn(`[nostr] Failed to send to relay ${url}:`, e);
    return false;
  } finally {
    ws?.close();
  }
}

// ─── Login ────────────────────────────────────────────────────────────────

export async function loginWithNostr(): Promise<string | null> {
  if (!window.nostr) {
    throw new Error('No NIP-07 extension found. Please install Alby or nos2x.');
    return null;
  }
  try {
    return await window.nostr.getPublicKey();
  } catch (e) {
    console.error('[nostr] Login failed:', e);
    return null;
  }
}

// ─── npub helper ──────────────────────────────────────────────────────────

export function getShortNpub(pubkey: string): string {
  // Hex pubkey — show first 8 + last 4 chars
  if (!pubkey || pubkey.length < 12) return pubkey ?? '';
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
}

// ─── Post session ─────────────────────────────────────────────────────────

export async function postSessionToNostr(
  pubkey: string,
  data: { pattern: string; duration: number }
): Promise<boolean> {
  if (!window.nostr) return false;
  try {
    const event = await window.nostr.signEvent({
      kind: 1,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'relaxyz']],
      content: `🌬️ I just completed a ${Math.floor(data.duration / 60)}m ${data.pattern} breathing session on Relaxyz.com #relaxyz #breathwork`,
    });
    // Post to public relays only for social sharing.
    // The private relay is written to server-side via /api/nostr.
    const results = await Promise.all(PUBLIC_RELAYS.map((url) => sendEventToRelay(event, url)));
    return results.some(Boolean);
  } catch (e) {
    console.error('[nostr] postSessionToNostr failed:', e);
    return false;
  }
}

// ─── Post pattern ─────────────────────────────────────────────────────────

export async function postPatternToNostr(
  pubkey: string,
  pattern: BreathingPattern
): Promise<boolean> {
  if (!window.nostr) return false;
  try {
    const phaseStr = pattern.phases
      .map((p) => `${p.name} ${p.duration}s`)
      .join(' → ');
    const event = await window.nostr.signEvent({
      kind: 1,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'relaxyz']],
      content: `🌬️ I created a new breathing pattern "${pattern.name}" on Relaxyz.com: ${phaseStr} #relaxyz #breathwork`,
    });
    const results = await Promise.all(PUBLIC_RELAYS.map((url) => sendEventToRelay(event, url)));
    return results.some(Boolean);
  } catch (e) {
    console.error('[nostr] postPatternToNostr failed:', e);
    return false;
  }
}

// ─── Post achievement ─────────────────────────────────────────────────────

export async function postAchievementToNostr(
  pubkey: string,
  achievementName: string
): Promise<boolean> {
  if (!window.nostr) return false;
  try {
    const event = await window.nostr.signEvent({
      kind: 1,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'relaxyz']],
      content: `🏆 I just earned the "${achievementName}" achievement on Relaxyz.com! #relaxyz #breathwork`,
    });
    const results = await Promise.all(PUBLIC_RELAYS.map((url) => sendEventToRelay(event, url)));
    return results.some(Boolean);
  } catch (e) {
    console.error('[nostr] postAchievementToNostr failed:', e);
    return false;
  }
}

// ─── Post stats ───────────────────────────────────────────────────────────

export async function postStatsToNostr(
  pubkey: string,
  stats: { totalTime: number; totalSessions: number }
): Promise<boolean> {
  if (!window.nostr) return false;
  try {
    const hours = Math.floor(stats.totalTime / 3600);
    const mins = Math.floor((stats.totalTime % 3600) / 60);
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    const event = await window.nostr.signEvent({
      kind: 1,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'relaxyz']],
      content: `📊 My Relaxyz stats: ${stats.totalSessions} sessions, ${timeStr} of total breathing time. #relaxyz #breathwork`,
    });
    const results = await Promise.all(PUBLIC_RELAYS.map((url) => sendEventToRelay(event, url)));
    return results.some(Boolean);
  } catch (e) {
    console.error('[nostr] postStatsToNostr failed:', e);
    return false;
  }
}

// ─── Mirror session to private relay via server API ─────────────────────────
// The API route (/api/nostr) signs with NOSTR_NSEC server-side and posts
// both a kind 1 (for Recent Breathers) and kind 30001 (full state backup).

export async function postSessionToServerNostr(
  state: PrivateState,
  pubkey: string | null,
  sessionData: { pattern: string; duration: number }
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/nostr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pubkey,
        pattern: sessionData.pattern,
        duration: sessionData.duration,
        state: pubkey ? state : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: err.error };
    }
    const data = await res.json();
    return { success: data.success };
  } catch (e) {
    console.error('[nostr] postSessionToServerNostr failed:', e);
    return { success: false, error: String(e) };
  }
}

// ─── Fetch private history ────────────────────────────────────────────────

export async function fetchHistoryFromNostr(pubkey: string): Promise<PrivateState | null> {
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let result: PrivateState | null = null;
    const timeout = setTimeout(() => {
      ws?.close();
      resolve(result);
    }, RELAY_TIMEOUT_MS * 2);

    try {
      ws = new WebSocket(PRIVATE_RELAY);

      ws.onerror = (err) => {
        console.warn('[nostr] fetchHistoryFromNostr relay error:', err);
        clearTimeout(timeout);
        ws?.close();
        resolve(null);
      };

      ws.onopen = () => {
        ws!.send(
          JSON.stringify([
            'REQ',
            'state',
            {
              kinds: [30001],
              '#d': [`user_state_${pubkey}`],
              '#t': ['relaxy'],
              limit: 1,
            },
          ])
        );
      };

      ws.onmessage = (msg) => {
        const data = safeParseRelayMessage(msg.data as string);
        if (!data) return;

        if (data[0] === 'EVENT' && data[2]) {
          const event = data[2] as NostrEvent;
          try {
            result = JSON.parse(event.content) as PrivateState;
          } catch {
            console.warn('[nostr] Failed to parse private state content');
          }
        }
        if (data[0] === 'EOSE') {
          clearTimeout(timeout);
          ws?.close();
          resolve(result);
        }
      };
    } catch (e) {
      console.error('[nostr] fetchHistoryFromNostr error:', e);
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

// ─── Fetch public sessions ────────────────────────────────────────────────

export async function fetchPublicSessions(): Promise<NostrEvent[]> {
  // Fetch recent session posts from the private relay using the #relaxy tag
  return new Promise<NostrEvent[]>((resolve) => {
    const events: NostrEvent[] = [];
    let ws: WebSocket | null = null;
    const timeout = setTimeout(() => {
      ws?.close();
      resolve(dedupeEvents(events));
    }, RELAY_TIMEOUT_MS * 2);

    try {
      ws = new WebSocket(PRIVATE_RELAY);

      ws.onerror = () => {
        clearTimeout(timeout);
        ws?.close();
        resolve(dedupeEvents(events));
      };

      ws.onopen = () => {
        ws!.send(
          JSON.stringify([
            'REQ',
            'feed',
            {
              kinds: [1],
              '#t': ['relaxy'],
              limit: 10,
            },
          ])
        );
      };

      ws.onmessage = (msg) => {
        const data = safeParseRelayMessage(msg.data as string);
        if (!data) return;
        if (data[0] === 'EVENT' && data[2]) {
          events.push(data[2] as NostrEvent);
        }
        if (data[0] === 'EOSE') {
          clearTimeout(timeout);
          ws?.close();
          resolve(dedupeEvents(events));
        }
      };
    } catch {
      clearTimeout(timeout);
      resolve([]);
    }
  });
}

// ─── Fetch Nostr profiles ─────────────────────────────────────────────────

export async function fetchNostrProfiles(
  pubkeys: string[]
): Promise<Record<string, NostrProfile>> {
  if (pubkeys.length === 0) return {};
  const profiles: Record<string, NostrProfile> = {};

  await Promise.allSettled(
    PUBLIC_RELAYS.slice(0, 2).map(
      (url) =>
        new Promise<void>((resolve) => {
          let ws: WebSocket | null = null;
          const timeout = setTimeout(() => {
            ws?.close();
            resolve();
          }, RELAY_TIMEOUT_MS);

          try {
            ws = new WebSocket(url);

            ws.onerror = () => {
              clearTimeout(timeout);
              ws?.close();
              resolve();
            };

            ws.onopen = () => {
              ws!.send(JSON.stringify(['REQ', 'profiles', { kinds: [0], authors: pubkeys }]));
            };

            ws.onmessage = (msg) => {
              const data = safeParseRelayMessage(msg.data as string);
              if (!data) return;
              if (data[0] === 'EVENT' && data[2]) {
                const event = data[2] as NostrEvent;
                try {
                  profiles[event.pubkey] = JSON.parse(event.content) as NostrProfile;
                } catch {
                  // silently skip malformed profile
                }
              }
              if (data[0] === 'EOSE') {
                clearTimeout(timeout);
                ws?.close();
                resolve();
              }
            };
          } catch {
            clearTimeout(timeout);
            resolve();
          }
        })
    )
  );

  return profiles;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function dedupeEvents(events: NostrEvent[]): NostrEvent[] {
  const map = new Map<string, NostrEvent>();
  for (const e of events) {
    if (!map.has(e.id)) map.set(e.id, e);
  }
  return Array.from(map.values()).sort((a, b) => b.created_at - a.created_at);
}

// ─── window.nostr type augmentation ───────────────────────────────────────

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<NostrEvent>;
    };
  }
}
