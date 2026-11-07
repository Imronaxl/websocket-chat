import type { ClientMessage } from "./chat-types";

export function buildJoin(roomId: string): ClientMessage {
  return { type: "join", room_id: roomId };
}

export function buildLeave(roomId: string): ClientMessage {
  return { type: "leave", room_id: roomId };
}

export function buildChat(roomId: string, content: string, clientMessageId?: string): ClientMessage {
  return { type: "chat", room_id: roomId, content, client_message_id: clientMessageId };
}

export function buildPong(): ClientMessage {
  return { type: "pong" };
}
