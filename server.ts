import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Shared session log
  let publicSessions: any[] = [];

  wss.on("connection", (ws) => {
    // Send current log on connect
    ws.send(JSON.stringify({ type: "INIT_SESSIONS", data: publicSessions }));

    ws.on("message", (message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.type === "NEW_SESSION") {
          const newSession = {
            ...payload.data,
            timestamp: Date.now(),
            id: Math.random().toString(36).substring(7),
          };
          publicSessions.push(newSession);
          // Keep only last 10
          if (publicSessions.length > 10) {
            publicSessions = publicSessions.slice(-10);
          }
          // Broadcast to all
          const broadcastData = JSON.stringify({ type: "SESSION_LOG_UPDATE", data: publicSessions });
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(broadcastData);
            }
          });
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
