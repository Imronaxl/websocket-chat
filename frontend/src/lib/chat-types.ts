// Mirrors app/schemas.py and the frames sent by app/hub.py.

export interface Session {
  token: string;
  userId: string;
  username: string;
}

export interface OnlineUser {
  user_id: string;
  username: string;
}

export interface MessageResponse {
  id: number;
  room_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user_id: string;
  username: string;
  expires_at: string;
}

// client -> server

export type ClientMessage =
  | { type: "join"; room_id: string }
  | { type: "leave"; room_id: string }
  | { type: "chat"; room_id: string; content: string; client_message_id?: string }
  | { type: "pong" };

// server -> client

export type ServerMessage =
  | { type: "welcome"; user_id: string; username: string; heartbeat_interval: number }
  | { type: "joined"; room_id: string; users: OnlineUser[] }
  | { type: "message"; client_message_id: string | null; message: MessageResponse }
  | { type: "user_joined"; room_id: string; user: OnlineUser }
  | { type: "user_left"; room_id: string; user: OnlineUser }
  | { type: "ping" }
  | { type: "error"; code: string; message: string }
  | { type: "server_shutdown" };

export type ChatLogEntry =
  | { kind: "message"; message: MessageResponse }
  | { kind: "user_joined"; room_id: string; user_id: string; username: string; at: string }
  | { kind: "user_left"; room_id: string; user_id: string; username: string; at: string }
  | { kind: "system"; content: string; at: string };

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";
