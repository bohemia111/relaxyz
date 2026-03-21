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

export async function postSessionToNostr(pubkey: string, sessionData: { pattern: string, duration: number }) {
  if (!window.nostr) return false;

  const content = `🧘‍♂️ Just finished a ${sessionData.duration}s breathwork session using the "${sessionData.pattern}" rhythm on Relaxyz!\n\nTake a moment to breathe. #chillstr`;

  const eventTemplate: EventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['t', 'chillstr'],
      ['p', pubkey]
    ],
    content,
  };

  try {
    const signedEvent = await window.nostr.signEvent(eventTemplate);
    
    // Common relays to publish to
    const relays = [
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
  } catch (e) {
    console.error('Failed to sign/post event', e);
    return false;
  }
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: any): Promise<any>;
    };
  }
}
