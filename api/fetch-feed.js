/**
 * /api/fetch-feed.js
 *
 * Fetches recent kind 1 session events from the private relay.
 * Used to populate the Recent Breathers feed on the home screen.
 *
 * GET /api/fetch-feed
 *
 * Returns: Array of { pubkey, content, created_at, tags }
 */

import { loadSecretKey, fetchFromRelay } from './_relay.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let secretKey;
  try {
    secretKey = loadSecretKey();
  } catch (e) {
    console.error('[api/fetch-feed] Key error:', e.message);
    return res.status(500).json({ error: 'Server signing key not configured' });
  }

  try {
    const events = await fetchFromRelay(secretKey, {
      kinds: [1],
      '#t': ['relaxy'],
      limit: 10,
    });

    // Sort newest first, return only what the frontend needs
    const feed = events
      .sort((a, b) => b.created_at - a.created_at)
      .map((e) => ({
        id: e.id,
        pubkey: e.pubkey,
        created_at: e.created_at,
        content: e.content,
        tags: e.tags,
      }));

    // Cache for 30 seconds on Vercel edge
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');
    return res.status(200).json(feed);
  } catch (e) {
    console.error('[api/fetch-feed] Fetch failed:', e.message);
    return res.status(500).json({ error: 'Failed to fetch from relay' });
  }
}
