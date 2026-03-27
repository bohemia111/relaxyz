/**
 * /api/fetch-history.js
 *
 * Fetches a user's kind 30001 state from the private relay.
 * Called on login to restore sessions, achievements, and custom patterns.
 *
 * GET /api/fetch-history?pubkey=<hex pubkey>
 *
 * Returns: { sessions, earnedAchievements, customPatterns } or {}
 */

import { loadSecretKey, fetchFromRelay } from './_relay.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pubkey } = req.query;

  if (!pubkey || typeof pubkey !== 'string' || !/^[0-9a-fA-F]{64}$/.test(pubkey)) {
    return res.status(400).json({ error: 'Missing or invalid pubkey (must be 64-char hex)' });
  }

  let secretKey;
  try {
    secretKey = loadSecretKey();
  } catch (e) {
    console.error('[api/fetch-history] Key error:', e.message);
    return res.status(500).json({ error: 'Server signing key not configured' });
  }

  try {
    const events = await fetchFromRelay(secretKey, {
      kinds: [30001],
      '#d': [`user_state_${pubkey}`],
      '#t': ['relaxy'],
      limit: 1,
    });

    if (events.length === 0) {
      return res.status(200).json({});
    }

    // Parse the content of the most recent event
    const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
    let state = {};
    try {
      state = JSON.parse(latest.content);
    } catch {
      console.warn('[api/fetch-history] Failed to parse event content');
    }

    return res.status(200).json(state);
  } catch (e) {
    console.error('[api/fetch-history] Fetch failed:', e.message);
    return res.status(500).json({ error: 'Failed to fetch from relay' });
  }
}
