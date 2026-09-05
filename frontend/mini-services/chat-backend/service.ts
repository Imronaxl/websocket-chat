import type { ServerWebSocket } from "bun";

interface User {
  userId: string;
  username: string;
}

interface StoredMessage {
  id: number;
  room_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

type ClientMessage =
  | { type: "join"; room_id: string }
  | { type: "leave"; room_id: string }
  | { type: "chat"; room_id: string; content: string; client_message_id?: string }
  | { type: "ping"; timestamp?: number }
  | { type: "pong"; timestamp: number };

interface SocketData {
  user: User;
  rooms: Set<string>;
  lastPongAt: number;
}

const messagesByRoom = new Map<string, StoredMessage[]>();
const onlineByRoom = new Map<string, Set<string>>();
const socketsByRoom = new Map<string, Set<ServerWebSocket<SocketData>>>();
let messageSeq = 0;

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2;

function broadcastToRoom(roomId: string, payload: unknown) {
  const sockets = socketsByRoom.get(roomId);
  if (!sockets) return;
  const text = JSON.stringify(payload);
  for (const ws of sockets) {
    try {
      ws.sendText(text);
    } catch {
    }
  }
}

function roomMessages(roomId: string): StoredMessage[] {
  let list = messagesByRoom.get(roomId);
  if (!list) {
    list = [];
    messagesByRoom.set(roomId, list);
  }
  return list;
}

function joinRoom(ws: ServerWebSocket<SocketData>, roomId: string) {
  const { user } = ws.data;
  ws.data.rooms.add(roomId);

  let sockets = socketsByRoom.get(roomId);
  if (!sockets) {
    sockets = new Set();
    socketsByRoom.set(roomId, sockets);
  }
  sockets.add(ws);

  let online = onlineByRoom.get(roomId);
  if (!online) {
    online = new Set();
    onlineByRoom.set(roomId, online);
  }
  const wasOnline = online.has(user.userId);
  online.add(user.userId);

  if (!wasOnline) {
    broadcastToRoom(roomId, {
      type: "user_joined",
      data: { user_id: user.userId, username: user.username, room_id: roomId },
    });
  }
}

function leaveRoom(ws: ServerWebSocket<SocketData>, roomId: string) {
  const { user } = ws.data;
  ws.data.rooms.delete(roomId);

  const sockets = socketsByRoom.get(roomId);
  if (sockets) {
    sockets.delete(ws);
    if (sockets.size === 0) socketsByRoom.delete(roomId);
  }

  const stillInRoom = Array.from(sockets ?? []).some((s) => s.data.user.userId === user.userId);
  if (!stillInRoom) {
    const online = onlineByRoom.get(roomId);
    if (online) {
      online.delete(user.userId);
      if (online.size === 0) onlineByRoom.delete(roomId);
    }
    broadcastToRoom(roomId, {
      type: "user_left",
      data: { user_id: user.userId, username: user.username, room_id: roomId },
    });
  }
}

function handleChat(ws: ServerWebSocket<SocketData>, roomId: string, content: string) {
  if (!ws.data.rooms.has(roomId)) {
    ws.sendText(JSON.stringify({ type: "error", data: "You are not in this room" }));
    return;
  }
  const { user } = ws.data;
  const msg: StoredMessage = {
    id: ++messageSeq,
    room_id: roomId,
    user_id: user.userId,
    username: user.username,
    content,
    created_at: new Date().toISOString(),
  };
  roomMessages(roomId).push(msg);

  broadcastToRoom(roomId, {
    type: "chat_message",
    data: {
      room_id: roomId,
      user_id: user.userId,
      username: user.username,
      content,
      timestamp: msg.created_at,
      message_id: msg.id,
    },
  });
}

function onOpen(ws: ServerWebSocket<SocketData>) {
  ws.data.lastPongAt = Date.now();
  ws.sendText(JSON.stringify({ type: "ping" }));
}

function onMessage(ws: ServerWebSocket<SocketData>, raw: string) {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    ws.sendText("Error: Invalid JSON");
    return;
  }

  switch (msg.type) {
    case "ping":
      ws.sendText(JSON.stringify({ type: "pong" }));
      break;
    case "pong":
      ws.data.lastPongAt = Date.now();
      break;
    case "join":
      joinRoom(ws, msg.room_id);
      break;
    case "leave":
      leaveRoom(ws, msg.room_id);
      break;
    case "chat":
      handleChat(ws, msg.room_id, msg.content);
      break;
    default:
      ws.sendText(
        JSON.stringify({
          type: "error",
          data: `Unknown message type: ${(msg as { type: string }).type}`,
        }),
      );
  }
}

function onClose(ws: ServerWebSocket<SocketData>) {
  for (const roomId of Array.from(ws.data.rooms)) {
    leaveRoom(ws, roomId);
  }
}

function startHeartbeatLoop() {
  setInterval(() => {
    const now = Date.now();
    const seen = new Set<ServerWebSocket<SocketData>>();
    for (const sockets of socketsByRoom.values()) {
      for (const ws of sockets) {
        if (seen.has(ws)) continue;
        seen.add(ws);
        if (now - ws.data.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
          try {
            ws.close(1001, "heartbeat timeout");
          } catch {
          }
        } else {
          try {
            ws.sendText(JSON.stringify({ type: "ping" }));
          } catch {
          }
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function jsonBody(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...headers },
  });
}

function handleGet(req: Request, url: URL): Response {
  if (url.pathname === "/health") {
    return jsonBody({ status: "ok" });
  }

  if (url.pathname === "/metrics") {
    const onlineUsers = Array.from(onlineByRoom.values()).reduce((s, set) => s + set.size, 0);
    const totalMessages = Array.from(messagesByRoom.values()).reduce(
      (s, list) => s + list.length,
      0,
    );
    const totalSockets = Array.from(socketsByRoom.values()).reduce((s, set) => s + set.size, 0);
    const body =
      `# HELP websocket_connections_active Active WebSocket connections (DEMO adapter)\n` +
      `# TYPE websocket_connections_active gauge\n` +
      `websocket_connections_active ${totalSockets}\n` +
      `# HELP websocket_messages_total Total messages stored\n` +
      `# TYPE websocket_messages_total counter\n` +
      `websocket_messages_total ${totalMessages}\n` +
      `# HELP websocket_online_users_total Total unique online users across rooms\n` +
      `# TYPE websocket_online_users_total gauge\n` +
      `websocket_online_users_total ${onlineUsers}\n`;
    return new Response(body, {
      headers: { "content-type": "text/plain; version=0.0.4", "access-control-allow-origin": "*" },
    });
  }

  const messagesMatch = url.pathname.match(/^\/api\/v1\/rooms\/([^/]+)\/messages$/);
  if (messagesMatch) {
    const roomId = decodeURIComponent(messagesMatch[1]);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const all = messagesByRoom.get(roomId) ?? [];
    const slice = all.slice(-limit);
    return jsonBody(slice);
  }

  const usersMatch = url.pathname.match(/^\/api\/v1\/rooms\/([^/]+)\/users$/);
  if (usersMatch) {
    const roomId = decodeURIComponent(usersMatch[1]);
    const online = onlineByRoom.get(roomId);
    const userIds = online ? Array.from(online) : [];
    return jsonBody({ room_id: roomId, online_users: userIds });
  }

  return jsonBody({ detail: "Not Found", status_code: 404 }, 404);
}

export function createService(port: number = 0) {
  const server = Bun.serve({
    port,
    fetch(req, server) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        });
      }

      const url = new URL(req.url);

      if (url.pathname === "/api/v1/ws" || url.pathname === "/ws") {
        const userId = url.searchParams.get("user_id");
        const username = url.searchParams.get("username");
        if (!userId || !username) {
          return jsonBody({ detail: "user_id and username are required", status_code: 400 }, 400);
        }
        const ok = server.upgrade<SocketData>(req, {
          data: {
            user: { userId, username },
            rooms: new Set(),
            lastPongAt: Date.now(),
          },
        });
        if (!ok) {
          return jsonBody({ detail: "WebSocket upgrade failed", status_code: 400 }, 400);
        }
        return undefined;
      }

      if (req.method === "GET") return handleGet(req, url);

      return jsonBody({ detail: "Method Not Allowed", status_code: 405 }, 405);
    },
    websocket: {
      open: onOpen,
      message: onMessage,
      close: onClose,
      sendPings: true,
    } as unknown as import("bun").WebSocketHandler<SocketData>,
  });

  startHeartbeatLoop();

  return server;
}
