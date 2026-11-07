"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChatWebSocket } from "@/hooks/use-chat-websocket";
import { buildChat, buildJoin, buildLeave } from "@/lib/chat-protocol";
import { apiUrl, authHeaders, CHAT_CONFIG } from "@/lib/chat-config";
import type {
  ChatLogEntry,
  ConnectionStatus,
  MessageResponse,
  OnlineUser,
  ServerMessage,
  Session,
} from "@/lib/chat-types";

type HistoryStatus = "idle" | "loading" | "loaded" | "exhausted";

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
  historyStatusByRoom: Record<string, HistoryStatus>;
  onlineUsersByRoom: Record<string, OnlineUser[]>;
  metrics: { messagesSent: number; messagesReceived: number; reconnectCount: number };
}

const MAX_ENTRIES = 500;

export function useChatState(session: Session | null, onSessionExpired: () => void): UseChatStateReturn {
  const [joinedRooms, setJoinedRooms] = useState<string[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [logByRoom, setLogByRoom] = useState<Record<string, ChatLogEntry[]>>({});
  const [onlineUsersByRoom, setOnlineUsersByRoom] = useState<Record<string, OnlineUser[]>>({});
  const [historyStatusByRoom, setHistoryStatusByRoom] = useState<Record<string, HistoryStatus>>({});
  const [metrics, setMetrics] = useState({ messagesSent: 0, messagesReceived: 0, reconnectCount: 0 });

  const joinedRoomsRef = useRef<string[]>([]);
  const activeRoomRef = useRef<string | null>(null);
  const logRef = useRef<Record<string, ChatLogEntry[]>>({});
  const prevStatusRef = useRef<ConnectionStatus | null>(null);
  const sendRef = useRef<ReturnType<typeof useChatWebSocket>["send"]>(() => false);

  useEffect(() => {
    joinedRoomsRef.current = joinedRooms;
  }, [joinedRooms]);
  useEffect(() => {
    activeRoomRef.current = activeRoomId;
  }, [activeRoomId]);
  useEffect(() => {
    logRef.current = logByRoom;
  }, [logByRoom]);

  const appendEntry = useCallback((roomId: string, entry: ChatLogEntry) => {
    setLogByRoom((prev) => {
      const list = prev[roomId] ?? [];
      // A broadcast can arrive while history for the same message is loading.
      if (entry.kind === "message" && list.some((e) => e.kind === "message" && e.message.id === entry.message.id)) {
        return prev;
      }
      return { ...prev, [roomId]: [...list, entry].slice(-MAX_ENTRIES) };
    });
  }, []);

  const systemNote = useCallback(
    (content: string) => {
      const room = activeRoomRef.current;
      if (room) appendEntry(room, { kind: "system", content, at: new Date().toISOString() });
    },
    [appendEntry],
  );

  const fetchHistory = useCallback(
    async (roomId: string, beforeId?: number): Promise<MessageResponse[] | null> => {
      if (!session) return null;
      const params = new URLSearchParams({ limit: String(CHAT_CONFIG.messagePageSize) });
      if (beforeId) params.set("before_id", String(beforeId));
      const res = await fetch(apiUrl(`/api/v1/rooms/${encodeURIComponent(roomId)}/messages?${params}`), {
        headers: authHeaders(session),
      });
      if (res.status === 401) onSessionExpired();
      return res.ok ? ((await res.json()) as MessageResponse[]) : null;
    },
    [session, onSessionExpired],
  );

  const loadLatest = useCallback(
    async (roomId: string) => {
      setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: "loading" }));
      const messages = await fetchHistory(roomId);
      if (!messages) {
        setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: "idle" }));
        return;
      }
      setLogByRoom((prev) => {
        const known = new Set(messages.map((m) => m.id));
        // keep live entries that arrived while the request was in flight
        const live = (prev[roomId] ?? []).filter((e) => e.kind !== "message" || !known.has(e.message.id));
        const history: ChatLogEntry[] = messages.map((m) => ({ kind: "message", message: m }));
        return { ...prev, [roomId]: [...history, ...live] };
      });
      setHistoryStatusByRoom((prev) => ({
        ...prev,
        [roomId]: messages.length < CHAT_CONFIG.messagePageSize ? "exhausted" : "loaded",
      }));
    },
    [fetchHistory],
  );

  const loadMoreHistory = useCallback(
    async (roomId: string) => {
      const current = historyStatusByRoom[roomId];
      if (current === "loading" || current === "exhausted") return;
      const oldest = (logRef.current[roomId] ?? []).find((e) => e.kind === "message");
      const beforeId = oldest?.kind === "message" ? oldest.message.id : undefined;

      setHistoryStatusByRoom((prev) => ({ ...prev, [roomId]: "loading" }));
      const messages = await fetchHistory(roomId, beforeId);
      if (messages) {
        setLogByRoom((prev) => ({
          ...prev,
          [roomId]: [...messages.map((m): ChatLogEntry => ({ kind: "message", message: m })), ...(prev[roomId] ?? [])],
        }));
      }
      setHistoryStatusByRoom((prev) => ({
        ...prev,
        [roomId]: !messages || messages.length < CHAT_CONFIG.messagePageSize ? "exhausted" : "loaded",
      }));
    },
    [historyStatusByRoom, fetchHistory],
  );

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      setMetrics((prev) => ({ ...prev, messagesReceived: prev.messagesReceived + 1 }));
      const now = new Date().toISOString();

      switch (msg.type) {
        case "joined":
          setOnlineUsersByRoom((prev) => ({ ...prev, [msg.room_id]: msg.users }));
          break;
        case "message":
          appendEntry(msg.message.room_id, { kind: "message", message: msg.message });
          break;
        case "user_joined":
          if (msg.user.user_id === session?.userId) break;
          appendEntry(msg.room_id, { kind: "user_joined", room_id: msg.room_id, ...msg.user, at: now });
          setOnlineUsersByRoom((prev) => {
            const users = prev[msg.room_id] ?? [];
            if (users.some((u) => u.user_id === msg.user.user_id)) return prev;
            return { ...prev, [msg.room_id]: [...users, msg.user] };
          });
          break;
        case "user_left":
          appendEntry(msg.room_id, { kind: "user_left", room_id: msg.room_id, ...msg.user, at: now });
          setOnlineUsersByRoom((prev) => ({
            ...prev,
            [msg.room_id]: (prev[msg.room_id] ?? []).filter((u) => u.user_id !== msg.user.user_id),
          }));
          break;
        case "error":
          systemNote(`Error: ${msg.message}`);
          break;
        case "server_shutdown":
          systemNote("Server is restarting, reconnecting…");
          break;
        case "welcome":
        case "ping":
          break;
      }
    },
    [appendEntry, systemNote, session?.userId],
  );

  const handleStatusChange = useCallback(
    (status: ConnectionStatus) => {
      if (status === "reconnecting" && prevStatusRef.current !== "reconnecting") {
        setMetrics((prev) => ({ ...prev, reconnectCount: prev.reconnectCount + 1 }));
      }
      prevStatusRef.current = status;
      if (status !== "connected") return;

      // Membership lives on the socket, so rejoin everything after a reconnect.
      const rooms = joinedRoomsRef.current.length > 0 ? joinedRoomsRef.current : ["general"];
      if (joinedRoomsRef.current.length === 0) {
        setJoinedRooms(rooms);
        setActiveRoomId((prev) => prev ?? rooms[0]);
      }
      for (const room of rooms) {
        sendRef.current(buildJoin(room));
        void loadLatest(room);
      }
    },
    [loadLatest],
  );

  const { status, send, reconnect } = useChatWebSocket({
    token: session?.token ?? null,
    onMessage: handleMessage,
    onStatusChange: handleStatusChange,
    onFatalClose: onSessionExpired,
  });

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const joinRoom = useCallback(
    (roomId: string) => {
      if (!joinedRoomsRef.current.includes(roomId)) {
        setJoinedRooms((prev) => [...prev, roomId]);
        send(buildJoin(roomId));
        void loadLatest(roomId);
      }
    },
    [send, loadLatest],
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

  const sendMessage = useCallback(
    (content: string) => {
      const room = activeRoomRef.current;
      const trimmed = content.trim();
      if (!room || !trimmed) return;
      if (send(buildChat(room, trimmed, crypto.randomUUID()))) {
        setMetrics((prev) => ({ ...prev, messagesSent: prev.messagesSent + 1 }));
      }
    },
    [send],
  );

  return {
    status,
    reconnect,
    joinedRooms,
    activeRoomId,
    setActiveRoom: setActiveRoomId,
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
