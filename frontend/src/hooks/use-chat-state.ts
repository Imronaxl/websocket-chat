"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatWebSocket } from "@/hooks/use-chat-websocket";
import { buildChat, buildJoin, buildLeave } from "@/lib/chat-protocol";
import { buildRestUrl, CHAT_CONFIG, SUGGESTED_ROOMS } from "@/lib/chat-config";
import type {
  ChatLogEntry,
  ClientMessage,
  ConnectionStatus,
  MessageResponse,
  RoomUsersResponse,
  ServerMessage,
} from "@/lib/chat-types";

interface UseChatStateArgs {
  userId: string | null;
  username: string | null;
}

interface UseChatStateReturn {
  status: ConnectionStatus;
  reconnect: () => void;
  joinedRooms: string[];
  activeRoomId: string | null;
  setActiveRoom: (roomId: string) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
  logByRoom: Record<string, ChatLogEntry[]>;
  sendMessage: (content: string) => void;
  loadMoreHistory: (roomId: string) => Promise<void>;
  historyStatusByRoom: Record<string, "idle" | "loading" | "loaded" | "exhausted">;
  onlineUsersByRoom: Record<string, string[]>;
  metrics: {
    messagesSent: number;
    messagesReceived: number;
    reconnectCount: number;
  };
}

export function useChatState({ userId, username }: UseChatStateArgs): UseChatStateReturn {
  const [joinedRooms, setJoinedRooms] = useState<string[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [logByRoom, setLogByRoom] = useState<Record<string, ChatLogEntry[]>>({});
  const [onlineUsersByRoom, setOnlineUsersByRoom] = useState<Record<string, string[]>>({});
  const [historyStatusByRoom, setHistoryStatusByRoom] = useState<
    Record<string, "idle" | "loading" | "loaded" | "exhausted">
  >({});
  const [metrics, setMetrics] = useState({ messagesSent: 0, messagesReceived: 0, reconnectCount: 0 });
  const prevStatusRef = useRef<ConnectionStatus | null>(null);

  const joinedRoomsRef = useRef<string[]>([]);
  const sendRef = useRef<(msg: ClientMessage) => boolean>(() => false);

  const appendEntry = useCallback((roomId: string, entry: ChatLogEntry) => {
    setLogByRoom((prev) => {
      const list = prev[roomId] ?? [];
      const next = list.length >= 500 ? [...list.slice(-499), entry] : [...list, entry];
      return { ...prev, [roomId]: next };
    });
  }, []);

  const refreshOnlineUsers = useCallback(async (roomId: string) => {
    try {
      const res = await fetch(buildRestUrl(`/api/v1/rooms/${encodeURIComponent(roomId)}/users`));
      if (!res.ok) return;
      const data = (await res.json()) as RoomUsersResponse;
      setOnlineUsersByRoom((prev) => ({ ...prev, [roomId]: data.online_users ?? [] }));
    } catch {
    }
  }, []);

  const loadHistory = useCallback(async (roomId: string) => {
    try {
      const res = await fetch(
        buildRestUrl(
          `/api/v1/rooms/${encodeURIComponent(roomId)}/messages?limit=${CHAT_CONFIG.messagePageSize}`,
        ),
      );
      if (!res.ok) return;
      const messages = (await res.json()) as MessageResponse[];
      const entries: ChatLogEntry[] = messages.map((m) => ({ kind: "message", message: m }));
      setLogByRoom((prev) => ({ ...prev, [roomId]: entries }));
      setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: "loaded" }));
    } catch {
      setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: "loaded" }));
    }
  }, []);

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      setMetrics((prev) => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }));

      switch (msg.type) {
        case "chat_message": {
          const { room_id, user_id, username: fromUsername, content, timestamp, message_id } =
            msg.data;
          appendEntry(room_id, {
            kind: "message",
            message: {
              id: message_id,
              room_id,
              user_id,
              username: fromUsername,
              content,
              created_at: timestamp,
            },
          });
          break;
        }
        case "user_joined": {
          const { room_id, user_id, username: joinedUsername } = msg.data;
          appendEntry(room_id, {
            kind: "user_joined",
            room_id,
            user_id,
            username: joinedUsername,
            at: new Date().toISOString(),
          });
          void refreshOnlineUsers(room_id);
          break;
        }
        case "user_left": {
          const { room_id, user_id, username: leftUsername } = msg.data;
          appendEntry(room_id, {
            kind: "user_left",
            room_id,
            user_id,
            username: leftUsername,
            at: new Date().toISOString(),
          });
          void refreshOnlineUsers(room_id);
          break;
        }
        case "error": {
          if (activeRoomId) {
            appendEntry(activeRoomId, {
              kind: "system",
              content: `Error: ${msg.data}`,
              at: new Date().toISOString(),
            });
          }
          break;
        }
        case "server_shutdown": {
          if (activeRoomId) {
            appendEntry(activeRoomId, {
              kind: "system",
              content: "Server is shutting down. Reconnecting…",
              at: new Date().toISOString(),
            });
          }
          break;
        }
        case "ping":
        case "pong":
          break;
      }
    },
    [activeRoomId, appendEntry, refreshOnlineUsers],
  );

  const handleStatusChange = useCallback(
    (status: ConnectionStatus) => {
      setMetrics((prev) => {
        if (status === "reconnecting" && prevStatusRef.current !== "reconnecting") {
          return { ...prev, reconnectCount: prev.reconnectCount + 1 };
        }
        return prev;
      });
      prevStatusRef.current = status;

      if (status !== "connected") return;

      const previouslyJoined = joinedRoomsRef.current;
      if (previouslyJoined.length === 0) {
        const room = "general";
        setJoinedRooms((prev) => (prev.includes(room) ? prev : [...prev, room]));
        setActiveRoomId((prev) => prev ?? room);
        sendRef.current(buildJoin(room));
        void loadHistory(room);
        void refreshOnlineUsers(room);
        setHistoryStatusByRoom((prev) => ({ ...prev, [room]: prev[room] ?? "idle" }));
      } else {
        for (const room of previouslyJoined) {
          sendRef.current(buildJoin(room));
          void refreshOnlineUsers(room);
        }
      }
    },
    [loadHistory, refreshOnlineUsers],
  );

  useEffect(() => {
    joinedRoomsRef.current = joinedRooms;
  }, [joinedRooms]);

  const { status, send, close, reconnect } = useChatWebSocket({
    userId,
    username,
    onMessage: handleMessage,
    onStatusChange: handleStatusChange,
  });

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const joinRoom = useCallback(
    (roomId: string) => {
      setJoinedRooms((prev) => (prev.includes(roomId) ? prev : [...prev, roomId]));
      send(buildJoin(roomId));
      void loadHistory(roomId);
      void refreshOnlineUsers(roomId);
      setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: prev[roomId] ?? "idle" }));
    },
    [send, loadHistory, refreshOnlineUsers],
  );

  const leaveRoom = useCallback(
    (roomId: string) => {
      send(buildLeave(roomId));
      setJoinedRooms((prev) => prev.filter((r) => r !== roomId));
      setOnlineUsersByRoom((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      setActiveRoomId((current) => (current === roomId ? null : current));
    },
    [send],
  );

  const setActiveRoom = useCallback((roomId: string) => {
    setActiveRoomId(roomId);
  }, []);

  const sendMessage = useCallback(
    (content: string) => {
      if (!activeRoomId) return;
      const trimmed = content.trim();
      if (!trimmed) return;
      const clientMessageId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const ok = send(buildChat(activeRoomId, trimmed, clientMessageId));
      if (ok) {
        setMetrics((prev) => ({ ...prev, messagesSent: prev.messagesSent + 1 }));
      }
    },
    [activeRoomId, send],
  );

  const loadMoreHistory = useCallback(
    async (roomId: string) => {
      const current = historyStatusByRoom[roomId];
      if (current === "loading" || current === "exhausted") return;
      setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: "loading" }));
      await loadHistory(roomId);
      setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: "exhausted" }));
    },
    [historyStatusByRoom, loadHistory],
  );

  return {
    status,
    reconnect,
    joinedRooms,
    activeRoomId,
    setActiveRoom,
    joinRoom,
    leaveRoom,
    logByRoom,
    sendMessage,
    loadMoreHistory,
    historyStatusByRoom,
    onlineUsersByRoom,
    metrics,
  };
}

export const SUGGESTED_ROOMS_LIST = SUGGESTED_ROOMS;
