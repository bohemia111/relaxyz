import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Track rooms with metadata
  const rooms: Record<string, { 
    id: string; 
    name: string; 
    patternId: string; 
    soundId: string;
    users: Set<{ id: string; name: string; ws: WebSocket }> 
  }> = {};

  wss.on("connection", (ws) => {
    let currentRoomId: string | null = null;
    let currentUser: { id: string; name: string; ws: WebSocket } | null = null;

    // Send initial room list
    sendRoomList(ws);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "create_room") {
          const { roomId, roomName, patternId, soundId, userId, userName } = message;
          
          rooms[roomId] = {
            id: roomId,
            name: roomName,
            patternId,
            soundId,
            users: new Set()
          };

          joinRoom(roomId, userId, userName);
          broadcastRoomList();
        }

        if (message.type === "join") {
          const { roomId, userId, userName } = message;
          joinRoom(roomId, userId, userName);
        }
      } catch (err) {
        console.error("WS error:", err);
      }
    });

    function joinRoom(roomId: string, userId: string, userName: string) {
      if (!rooms[roomId]) return;

      // Leave previous room if any
      leaveCurrentRoom();

      currentRoomId = roomId;
      currentUser = { id: userId, name: userName, ws };
      rooms[roomId].users.add(currentUser);

      // Send room metadata to the joining user
      ws.send(JSON.stringify({
        type: "room_joined",
        room: {
          id: rooms[roomId].id,
          name: rooms[roomId].name,
          patternId: rooms[roomId].patternId,
          soundId: rooms[roomId].soundId
        }
      }));

      broadcastPresence(roomId);
    }

    function leaveCurrentRoom() {
      if (currentRoomId && currentUser && rooms[currentRoomId]) {
        rooms[currentRoomId].users.delete(currentUser);
        if (rooms[currentRoomId].users.size === 0) {
          delete rooms[currentRoomId];
          broadcastRoomList();
        } else {
          broadcastPresence(currentRoomId);
        }
      }
    }

    ws.on("close", () => {
      leaveCurrentRoom();
    });

    function broadcastPresence(roomId: string) {
      if (!rooms[roomId]) return;
      const users = Array.from(rooms[roomId].users).map((u) => ({
        id: u.id,
        name: u.name,
      }));
      const payload = JSON.stringify({ type: "presence", users });
      rooms[roomId].users.forEach((u) => {
        if (u.ws.readyState === WebSocket.OPEN) {
          u.ws.send(payload);
        }
      });
    }
  });

  function sendRoomList(ws: WebSocket) {
    const roomList = Object.values(rooms).map(r => ({
      id: r.id,
      name: r.name,
      userCount: r.users.size,
      patternId: r.patternId
    }));
    ws.send(JSON.stringify({ type: "room_list", rooms: roomList }));
  }

  function broadcastRoomList() {
    const roomList = Object.values(rooms).map(r => ({
      id: r.id,
      name: r.name,
      userCount: r.users.size,
      patternId: r.patternId
    }));
    const payload = JSON.stringify({ type: "room_list", rooms: roomList });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

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
