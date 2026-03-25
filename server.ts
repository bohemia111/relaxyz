import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { nip19, finalizeEvent } from 'nostr-tools';
import { WebSocket } from 'ws';

// Polyfill WebSocket for nostr-tools in Node.js
// @ts-ignore
global.WebSocket = WebSocket;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security Headers Middleware
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://generativelanguage.googleapis.com wss://relay.damus.io wss://*.damus.io wss://*.nostr.com wss://*.nostr.band wss://nos.lol wss://relay.snort.social; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;"
    );
    next();
  });

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/nostr/post-session", async (req, res) => {
    const { sessionData, userPubkey } = req.body;
    const nsec = process.env.NOSTR_NSEC;
    const relayUrl = process.env.PRIVATE_RELAY_URL || 'wss://relay.damus.io';

    if (!userPubkey) {
      return res.status(400).json({ error: "User must be logged in to post session events" });
    }

    if (!nsec) {
      console.warn("NOSTR_NSEC not configured on server. Please add it to the environment variables in the Settings menu.");
      return res.status(500).json({ 
        error: "Nostr bridge not configured", 
        details: "The server-side Nostr bridge requires a NOSTR_NSEC environment variable to sign events. Please add it in the AI Studio Settings menu." 
      });
    }

    try {
      const { data: sk } = nip19.decode(nsec);
      if (typeof sk !== 'string' && !(sk instanceof Uint8Array)) {
        throw new Error("Invalid nsec format");
      }

      const mins = Math.floor(sessionData.duration / 60);
      const secs = sessionData.duration % 60;
      const durationStr = mins > 0 ? `${mins} min ${secs} sec` : `${secs} sec`;

      const content = `🧘‍♂️ [Service Log] A ${durationStr} breathwork session was completed using the "${sessionData.pattern}" rhythm.\n\n#breathwork #relaxyz`;

      const eventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['t', 'breathwork'],
          ['t', 'relaxyz'],
          ['duration', sessionData.duration.toString()],
          ['pattern', sessionData.pattern]
        ],
        content,
      };

      if (userPubkey) {
        eventTemplate.tags.push(['p', userPubkey]);
      }

      const signedEvent = finalizeEvent(eventTemplate, sk as Uint8Array);

      // Publish to relay
      const socket = new WebSocket(relayUrl);
      const publishPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error("Relay timeout"));
        }, 5000);

        socket.onopen = () => {
          socket.send(JSON.stringify(['EVENT', signedEvent]));
        };

        socket.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data.toString());
            if (data[0] === 'OK' && data[1] === signedEvent.id) {
              clearTimeout(timeout);
              socket.close();
              resolve(true);
            }
          } catch (e) {
            // Ignore
          }
        };

        socket.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
      });

      await publishPromise;
      res.json({ success: true, eventId: signedEvent.id });
    } catch (error: any) {
      console.error("Nostr post error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
