/**
 * /api/nostr.js — Vercel serverless function
 *
 * Signs kind 1 and kind 30001 events with NOSTR_NSEC and posts them
 * to the private relay. Called by the frontend after every session.
 *
 * POST /api/nostr
 * Body: {
 *   pubkey:   string | null   user's hex pubkey (null = anonymous)
 *   pattern:  string          breathing pattern name e.g. "Box Breathing"
 *   duration: number          session duration in seconds
 *   state:    {               full user state (only sent when logged in)
 *     sessions:            Session[]
 *     earnedAchievements:  string[]
 *     customPatterns:      BreathingPattern[]
 *   }
 * }
 */

import { finalizeEvent } from 'nostr-tools/pure';
import { loadSecretKey, sendToRelay } from './_relay.js';

// ─── Anonymous display name ───────────────────────────────────────────────────

const ADJECTIVES = ['Calm', 'Gentle', 'Still', 'Quiet', 'Serene', 'Peaceful', 'Soft', 'Mindful', 'Steady', 'Flowing'];
const NOUNS = ['Breather', 'Soul', 'Drifter', 'Wanderer', 'Seeker', 'Leaf', 'Wave', 'Cloud', 'Stream', 'Yogi'];

function anonName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a} ${n}`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pubkey = null, pattern, duration, state } = req.body ?? {};

  if (typeof pattern !== 'string' || typeof duration !== 'number') {
    return res.status(400).json({ error: 'Missing required fields: pattern (string), duration (number)' });
  }

  // Load the site signing key
  let secretKey;
  try {
    secretKey = loadSecretKey();
  } catch (e) {
    console.error('[api/nostr] Key error:', e.message);
    return res.status(500).json({ error: 'Server signing key not configured' });
  }

  const now = Math.floor(Date.now() / 1000);
  const mins = Math.floor(duration / 60);
  const authorLabel = pubkey ? `nostr:${pubkey.slice(0, 8)}…` : anonName();
  const results = { kind1: false, kind30001: false };

  // ── Kind 1: session post → Recent Breathers feed ─────────────────────────
  // Tagged with the user's pubkey so we can fetch their history later.
  try {
    const tags = [['t', 'relaxy'], ['t', 'relaxyz']];
    if (pubkey) tags.push(['p', pubkey]);

    const kind1 = finalizeEvent({
      kind: 1,
      created_at: now,
      tags,
      content: `🌬️ ${authorLabel} just completed a ${mins}m ${pattern} breathing session on relaxyz.com #relaxyz`,
    }, secretKey);

    results.kind1 = await sendToRelay(secretKey, kind1);
    console.log('[api/nostr] kind 1 sent:', results.kind1);
  } catch (e) {
    console.error('[api/nostr] kind 1 failed:', e.message);
  }

  // ── Kind 30001: full state backup → restore on login ─────────────────────
  // Only posted when user is logged in (pubkey present).
  // Replaceable per user via the 'd' tag: user_state_{pubkey}
  if (pubkey && state && typeof state === 'object') {
    try {
      const kind30001 = finalizeEvent({
        kind: 30001,
        created_at: now,
        tags: [
          ['d', `user_state_${pubkey}`],
          ['t', 'relaxy'],
          ['p', pubkey],
        ],
        content: JSON.stringify(state),
      }, secretKey);

      results.kind30001 = await sendToRelay(secretKey, kind30001);
      console.log('[api/nostr] kind 30001 sent:', results.kind30001);
    } catch (e) {
      console.error('[api/nostr] kind 30001 failed:', e.message);
    }
  }

  return res.status(200).json({ success: true, results });
}
