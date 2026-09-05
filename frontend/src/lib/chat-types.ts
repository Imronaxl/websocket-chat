export type ClientMessage =
  | JoinRoomMessage
  | LeaveRoomMessage
  | ChatMessage
  | PingMessage
  | PongMessage;

export interface JoinRoomMessage {
  type: "join";
  room_id: string;
}

export interface LeaveRoomMessage {
  type: "leave";
  room_id: string;
}

export interface ChatMessage {
  type: "chat";
  room_id: string;
  content: string;
  client_message_id?: string;
}

export interface PingMessage {
  type: "ping";
  timestamp?: number;
}

export interface PongMessage {
  type: "pong";
  timestamp: number;
}

export type ServerMessage =
  | ChatMessageBroadcast
  | UserJoinedBroadcast
  | UserLeftBroadcast
  | PongMessage
  | PingMessage
  | ErrorMessage
  | ServerShutdownMessage;

export interface ChatMessageBroadcast {
  type: "chat_message";
  data: {
    room_id: string;
    user_id: string;
    username: string;
    content: string;
    timestamp: string;
    message_id: number;
  };
}

export interface UserJoinedBroadcast {
  type: "user_joined";
  data: {
    user_id: string;
    username: string;
    room_id: string;
  };
}

export interface UserLeftBroadcast {
  type: "user_left";
  data: {
    user_id: string;
    username: string;
    room_id: string;
  };
}

export interface ErrorMessage {
  type: "error";
  data: string;
}

export interface ServerShutdownMessage {
  type: "server_shutdown";
}

export interface MessageResponse {
  id: number;
  room_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

export interface RoomUsersResponse {
  room_id: string;
  online_users: string[];
}

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
