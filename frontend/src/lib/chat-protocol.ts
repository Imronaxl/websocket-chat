import type {
  ChatMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  PingMessage,
  PongMessage,
} from "./chat-types";

export function buildJoin(roomId: string): JoinRoomMessage {
  return { type: "join", room_id: roomId };
}

export function buildLeave(roomId: string): LeaveRoomMessage {
  return { type: "leave", room_id: roomId };
}

export function buildChat(
  roomId: string,
  content: string,
  clientMessageId?: string,
): ChatMessage {
  return {
    type: "chat",
    room_id: roomId,
    content,
    client_message_id: clientMessageId,
  };
}

export function buildPing(): PingMessage {
  return { type: "ping", timestamp: Date.now() };
}

export function buildPong(timestamp: number): PongMessage {
  return { type: "pong", timestamp };
}
