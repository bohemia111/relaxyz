
const PRIVATE_RELAY = 'wss://relaxy.nostr1.com';

const PUBLIC_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.snort.social'
];

export async function publishPublicEvent(event: any) {
  const pubkey = await window.nostr.getPublicKey();

  const signed = await window.nostr.signEvent({
    ...event,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [...(event.tags || []), ['t', 'relaxyz']]
  });

  await Promise.all(PUBLIC_RELAYS.map(sendToRelay(signed)));
}

export async function publishPrivateState(state: any) {
  const pubkey = await window.nostr.getPublicKey();

  const signed = await window.nostr.signEvent({
    kind: 30001,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', 'user_state'],
      ['t', 'relaxy']
    ],
    content: JSON.stringify(state)
  });

  await sendToRelay(signed)(PRIVATE_RELAY);
}

function sendToRelay(event: any) {
  return (url: string) => new Promise(resolve => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      ws.send(JSON.stringify(['EVENT', event]));
      resolve(true);
    };

    setTimeout(() => resolve(false), 3000);
  });
}

export async function fetchPrivateState(pubkey: string) {
  const ws = new WebSocket(PRIVATE_RELAY);

  return new Promise(resolve => {
    let result: any = null;

    ws.onopen = () => {
      ws.send(JSON.stringify([
        'REQ',
        'state',
        {
          kinds: [30001],
          authors: [pubkey],
          '#d': ['user_state'],
          '#t': ['relaxy'],
          limit: 1
        }
      ]));
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);

      if (data[0] === 'EVENT') result = data[2];
      if (data[0] === 'EOSE') resolve(result);
    };

    setTimeout(() => resolve(result), 6000);
  });
}

export async function fetchPublicEvents() {
  const events: any[] = [];

  await Promise.all(PUBLIC_RELAYS.map(url => {
    return new Promise(resolve => {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        ws.send(JSON.stringify([
          'REQ',
          'pub',
          {
            '#t': ['relaxyz'],
            limit: 50
          }
        ]));
      };

      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data[0] === 'EVENT') events.push(data[2]);
      };

      setTimeout(resolve, 6000);
    });
  }));

  return dedupe(events);
}

function dedupe(events: any[]) {
  const map = new Map();
  for (const e of events) {
    if (!map.has(e.id)) map.set(e.id, e);
  }
  return Array.from(map.values())
    .sort((a: any, b: any) => b.created_at - a.created_at);
}

export function buildState(events: any[]) {
  const state = { sessions: [] as any[] };

  for (const ev of events) {
    try {
      const data = JSON.parse(ev.content);
      state.sessions.push(data);
    } catch {}
  }

  return state;
}
