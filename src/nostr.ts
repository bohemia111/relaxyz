import { type EventTemplate } from 'nostr-tools/pure';

export async function loginWithNostr(): Promise<string | null> {
  // Amber and other NIP-07 extensions inject window.nostr
  if (!window.nostr) {
    alert('Nostr signer not found. If you are on Android, try using a browser that supports extensions or the Amber app integration.');
    return null;
  }
  try {
    const pubkey = await window.nostr.getPublicKey();
    return pubkey;
  } catch (e) {
    console.error('Login failed', e);
    return null;
  }
}

async function publishToRelays(signedEvent: any): Promise<boolean> {
  // Common relays to publish to
  const relays = [
    'wss://teststr2.nostr1.com',
    'wss://relay.damus.io', 
    'wss://nos.lol', 
    'wss://relay.nostr.band',
    'wss://relay.snort.social',
    'wss://purplepag.es'
  ];
  
  const publishPromises = relays.map(url => {
    return new Promise((resolve) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        resolve(false);
      }, 5000);

      socket.onopen = () => {
        socket.send(JSON.stringify(['EVENT', signedEvent]));
      };

      socket.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data[0] === 'OK' && data[1] === signedEvent.id) {
            clearTimeout(timeout);
            socket.close();
            resolve(true);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      socket.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    });
  });

  // We consider it a success if at least one relay accepted it
  const results = await Promise.all(publishPromises);
  return results.some(r => r === true);
}

export async function postSessionToNostr(pubkey: string, sessionData: { pattern: string, duration: number }) {
  if (!window.nostr) return false;

  const mins = Math.floor(sessionData.duration / 60);
  const secs = sessionData.duration % 60;
  const durationStr = mins > 0 ? `${mins} min ${secs} sec` : `${secs} sec`;

  const content = `🧘‍♂️ Just finished a ${durationStr} breathwork session using the "${sessionData.pattern}" rhythm on Relaxyz!\n\nTake a moment to breathe freely: https://www.relaxyz.com\n\n#breathwork #chillstr #relaxyz`;

  const eventTemplate: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'breathwork'],
      ['t', 'chillstr'],
      ['t', 'relaxyz'],
      ['p', pubkey],
      ['duration', sessionData.duration.toString()],
      ['pattern', sessionData.pattern]
    ],
    content,
  };

  try {
    const signedEvent = await window.nostr.signEvent(eventTemplate);
    return await publishToRelays(signedEvent);
  } catch (e) {
    console.error('Failed to sign/post event', e);
    return false;
  }
}

export async function postPatternToNostr(pubkey: string, pattern: any) {
  if (!window.nostr) return false;

  const content = `🧘‍♂️ I just made "${pattern.name}", a breathing pattern on Relaxy! Try it out: ${window.location.origin}\n\n#breathwork #chillstr #relaxy #relaxyz`;

  const eventTemplate: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'breathwork'],
      ['t', 'chillstr'],
      ['t', 'relaxy'],
      ['t', 'relaxyz'],
      ['p', pubkey],
      ['pattern_data', JSON.stringify(pattern)]
    ],
    content,
  };

  try {
    const signedEvent = await window.nostr.signEvent(eventTemplate);
    return await publishToRelays(signedEvent);
  } catch (e) {
    console.error('Failed to sign/post event', e);
    return false;
  }
}

export async function postAchievementToNostr(pubkey: string, achievementName: string) {
  if (!window.nostr) return false;

  const content = `🌳 I just completed my first full tree session on Relaxyz! 🧘‍♂️\n\nAchievement Unlocked: ${achievementName}\n\nJoin me in breathing: ${window.location.origin}\n\n#breathwork #chillstr #relaxy #achievement #relaxyz`;

  const eventTemplate: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'breathwork'],
      ['t', 'chillstr'],
      ['t', 'relaxy'],
      ['t', 'relaxyz'],
      ['p', pubkey],
      ['achievement', achievementName]
    ],
    content,
  };

  try {
    const signedEvent = await window.nostr.signEvent(eventTemplate);
    return await publishToRelays(signedEvent);
  } catch (e) {
    console.error('Failed to sign/post event', e);
    return false;
  }
}

export async function postStatsToNostr(pubkey: string, stats: { totalTime: number, totalSessions: number }) {
  if (!window.nostr) return false;

  const hours = Math.floor(stats.totalTime / 3600);
  const mins = Math.floor((stats.totalTime % 3600) / 60);
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const content = `🧘‍♂️ My Breathwork Journey on Relaxyz:\n\n✨ Total Sessions: ${stats.totalSessions}\n⏳ Total Time Breathed: ${timeStr}\n\nJoin me in finding your calm: ${window.location.origin}\n\n#breathwork #chillstr #relaxyz #mindfulness`;

  const eventTemplate: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'breathwork'],
      ['t', 'chillstr'],
      ['t', 'relaxyz'],
      ['p', pubkey],
      ['total_sessions', stats.totalSessions.toString()],
      ['total_time', stats.totalTime.toString()]
    ],
    content,
  };

  try {
    const signedEvent = await window.nostr.signEvent(eventTemplate);
    return await publishToRelays(signedEvent);
  } catch (e) {
    console.error('Failed to sign/post event', e);
    return false;
  }
}

export async function fetchHistoryFromNostr(pubkey: string): Promise<any[]> {
  const relay = 'wss://teststr2.nostr1.com';
  
  return new Promise((resolve) => {
    const socket = new WebSocket(relay);
    const events: any[] = [];
    const timeout = setTimeout(() => {
      socket.close();
      resolve(events);
    }, 5000);

    socket.onopen = () => {
      const filter = {
        kinds: [1],
        authors: [pubkey],
        '#t': ['relaxyz'],
        limit: 100
      };
      socket.send(JSON.stringify(['REQ', 'history', filter]));
    };

    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data[0] === 'EVENT' && data[1] === 'history') {
          events.push(data[2]);
        } else if (data[0] === 'EOSE' && data[1] === 'history') {
          clearTimeout(timeout);
          socket.close();
          
          // Mock data for demo users
          if (events.length === 0) {
            if (pubkey === 'npub1v7v...xyz789') {
              resolve([
                {
                  id: 'mock1',
                  pubkey: 'npub1v7v...xyz789',
                  created_at: Math.floor(Date.now() / 1000) - 300,
                  tags: [['duration', '600'], ['pattern', 'Box Breathing'], ['t', 'relaxyz']],
                  content: '🧘‍♂️ Just finished a 10 min session!'
                },
                {
                  id: 'mock4',
                  pubkey: 'npub1v7v...xyz789',
                  created_at: Math.floor(Date.now() / 1000) - 86400,
                  tags: [['duration', '600'], ['pattern', 'Box Breathing'], ['t', 'relaxyz']],
                  content: 'Daily breath.'
                },
                {
                  id: 'mock_ach1',
                  pubkey: 'npub1v7v...xyz789',
                  created_at: Math.floor(Date.now() / 1000) - 86400,
                  tags: [['achievement', 'first_breath'], ['t', 'relaxyz']],
                  content: 'Unlocked achievement!'
                }
              ]);
            } else {
              resolve(events);
            }
          } else {
            resolve(events);
          }
        }
      } catch (e) {
        // Ignore
      }
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      resolve(events);
    };
  });
}

export async function fetchPublicSessions(): Promise<any[]> {
  const relay = 'wss://teststr2.nostr1.com';
  
  return new Promise((resolve) => {
    const socket = new WebSocket(relay);
    const events: any[] = [];
    const timeout = setTimeout(() => {
      socket.close();
      resolve(events);
    }, 5000);

    socket.onopen = () => {
      const filter = {
        kinds: [1],
        '#t': ['relaxyz'],
        limit: 50
      };
      socket.send(JSON.stringify(['REQ', 'public_history', filter]));
    };

    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data[0] === 'EVENT' && data[1] === 'public_history') {
          const event = data[2];
          const durationTag = event.tags.find((t: string[]) => t[0] === 'duration');
          if (durationTag) {
            events.push(event);
          }
        } else if (data[0] === 'EOSE' && data[1] === 'public_history') {
          clearTimeout(timeout);
          socket.close();
          
          // If no real events found, return some mock data for demo
          if (events.length === 0) {
            const mockEvents = [
              {
                id: 'mock1',
                pubkey: 'npub1v7v...xyz789',
                created_at: Math.floor(Date.now() / 1000) - 300,
                tags: [['duration', '600'], ['pattern', 'Box Breathing'], ['t', 'relaxyz']],
                content: '🧘‍♂️ Just finished a 10 min session!'
              },
              {
                id: 'mock2',
                pubkey: 'npub1abc...def123',
                created_at: Math.floor(Date.now() / 1000) - 3600,
                tags: [['duration', '300'], ['pattern', '4-7-8'], ['t', 'relaxyz']],
                content: 'Feeling relaxed.'
              },
              {
                id: 'mock3',
                pubkey: 'npub1pqr...stu456',
                created_at: Math.floor(Date.now() / 1000) - 7200,
                tags: [['duration', '900'], ['pattern', 'Deep Calm'], ['t', 'relaxyz']],
                content: 'Great session.'
              }
            ];
            resolve(mockEvents);
          } else {
            resolve(events);
          }
        }
      } catch (e) {
        // Ignore
      }
    };

    socket.onerror = () => {
      clearTimeout(timeout);
      resolve(events);
    };
  });
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: any): Promise<any>;
    };
  }
}
