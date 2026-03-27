/**
 * _relay.js — shared utilities for all /api routes
 * Prefixed with _ so Vercel does not expose it as an endpoint.
 */

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import WebSocket from 'ws';

export const PRIVATE_RELAY = 'wss://relaxy.nostr1.com';
export const RELAY_TIMEOUT_MS = 6000;

// ─── Load NOSTR_NSEC from environment ────────────────────────────────────────

export function loadSecretKey() {
  const raw = process.env.NOSTR_NSEC;
  if (!raw) throw new Error('NOSTR_NSEC environment variable is not set');

  if (raw.startsWith('nsec1')) {
    const decoded = nip19.decode(raw);
    if (decoded.type !== 'nsec') throw new Error('NOSTR_NSEC is not a valid nsec bech32');
    return decoded.data; // Uint8Array
  }

  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('NOSTR_NSEC must be nsec1… bech32 or 64-char hex');
  }
  return Uint8Array.from(Buffer.from(raw, 'hex'));
}

// ─── Open an authenticated WebSocket to the private relay ────────────────────
// NIP-42: relay sends AUTH challenge → we sign it with NOSTR_NSEC → relay grants access

export function openAuthenticatedSocket(secretKey) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result, err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      ws.close();
      finish(null, new Error('Relay connection timed out'));
    }, RELAY_TIMEOUT_MS);

    const ws = new WebSocket(PRIVATE_RELAY);

    ws.on('error', (err) => {
      clearTimeout(timer);
      finish(null, err);
    });

    ws.on('open', () => {
      // Socket open — wait for AUTH challenge or proceed directly
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!Array.isArray(msg)) return;

        // NIP-42 AUTH challenge
        if (msg[0] === 'AUTH' && typeof msg[1] === 'string') {
          const challenge = msg[1];
          const authEvent = finalizeEvent({
            kind: 22242,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ['relay', PRIVATE_RELAY],
              ['challenge', challenge],
            ],
            content: '',
          }, secretKey);

          ws.send(JSON.stringify(['AUTH', authEvent]));
        }

        // AUTH accepted — socket is ready
        if (msg[0] === 'OK' && msg[2] === true) {
          clearTimeout(timer);
          finish(ws);
        }

        // AUTH rejected
        if (msg[0] === 'OK' && msg[2] === false) {
          clearTimeout(timer);
          ws.close();
          finish(null, new Error(`Auth rejected: ${msg[3] ?? 'unknown reason'}`));
        }
      } catch {
        // ignore malformed messages
      }
    });
  });
}

// ─── Send a signed event (write) ─────────────────────────────────────────────

export function sendToRelay(event) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.warn('[relay] send timeout');
      finish(false);
    }, RELAY_TIMEOUT_MS);

    const ws = new WebSocket(PRIVATE_RELAY);

    ws.on('error', (err) => {
      console.error('[relay] WebSocket error:', err.message);
      clearTimeout(timer);
      finish(false);
    });

    ws.on('open', () => ws.send(JSON.stringify(['EVENT', event])));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (Array.isArray(msg) && msg[0] === 'OK') {
          clearTimeout(timer);
          ws.close();
          finish(msg[2] === true);
        }
      } catch { /* ignore */ }
    });
  });
}

// ─── Fetch events from the relay (authenticated read) ────────────────────────

export function fetchFromRelay(secretKey, filter) {
  return new Promise((resolve) => {
    const events = [];
    let ws = null;
    let authed = false;
    const subId = 'fetch';

    const finish = () => {
      ws?.close();
      resolve(events);
    };

    const timer = setTimeout(finish, RELAY_TIMEOUT_MS * 2);

    try {
      ws = new WebSocket(PRIVATE_RELAY);

      ws.on('error', (err) => {
        console.error('[relay] fetch error:', err.message);
        clearTimeout(timer);
        finish();
      });

      ws.on('open', () => {
        // Send REQ immediately — relay will send AUTH challenge if needed
        ws.send(JSON.stringify(['REQ', subId, filter]));
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (!Array.isArray(msg)) return;

          // NIP-42 AUTH challenge
          if (msg[0] === 'AUTH' && typeof msg[1] === 'string' && !authed) {
            const authEvent = finalizeEvent({
              kind: 22242,
              created_at: Math.floor(Date.now() / 1000),
              tags: [
                ['relay', PRIVATE_RELAY],
                ['challenge', msg[1]],
              ],
              content: '',
            }, secretKey);
            ws.send(JSON.stringify(['AUTH', authEvent]));
          }

          // AUTH accepted — re-send the REQ now that we're authenticated
          if (msg[0] === 'OK' && msg[2] === true && !authed) {
            authed = true;
            ws.send(JSON.stringify(['REQ', subId, filter]));
          }

          // CLOSED with auth-required — auth may not have landed yet, wait
          if (msg[0] === 'CLOSED' && typeof msg[2] === 'string' && msg[2].includes('auth-required')) {
            // Will retry after AUTH OK above
            return;
          }

          if (msg[0] === 'EVENT' && msg[2]) {
            events.push(msg[2]);
          }

          if (msg[0] === 'EOSE') {
            clearTimeout(timer);
            ws.close();
            resolve(events);
          }
        } catch { /* ignore */ }
      });
    } catch (err) {
      console.error('[relay] fetchFromRelay setup error:', err.message);
      clearTimeout(timer);
      resolve([]);
    }
  });
}
