"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildWsUrl, CHAT_CONFIG } from "@/lib/chat-config";
import { buildPing, buildPong } from "@/lib/chat-protocol";
import type { ClientMessage, ConnectionStatus, ServerMessage } from "@/lib/chat-types";

interface UseChatWebSocketArgs {
  userId: string | null;
  username: string | null;
  onMessage: (msg: ServerMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

interface UseChatWebSocketReturn {
  status: ConnectionStatus;
  send: (msg: ClientMessage) => boolean;
  close: () => void;
  reconnect: () => void;
}

export function useChatWebSocket({
  userId,
  username,
  onMessage,
  onStatusChange,
}: UseChatWebSocketArgs): UseChatWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  const socketRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const manualCloseRef = useRef(false);

  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const updateStatus = useCallback((next: ConnectionStatus) => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!userId || !username) return;
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) {
      return;
    }

    manualCloseRef.current = false;
    queueMicrotask(() => {
      updateStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");
    });

    const openSocket = () => {
      const url = buildWsUrl({ userId, username });
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        updateStatus("connected");

        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(buildPing()));
          }
        }, CHAT_CONFIG.heartbeatIntervalMs);
      };

      socket.onmessage = (event) => {
        let parsed: ServerMessage;
        try {
          parsed = JSON.parse(event.data) as ServerMessage;
        } catch {
          if (typeof event.data === "string") {
            onMessageRef.current({ type: "error", data: event.data });
          }
          return;
        }
        if (parsed.type === "ping") {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(buildPong(Date.now())));
          }
          return;
        }
        onMessageRef.current(parsed);
      };

      socket.onerror = () => {
        updateStatus("reconnecting");
      };

      socket.onclose = () => {
        clearTimers();
        socketRef.current = null;

        if (manualCloseRef.current) {
          updateStatus("disconnected");
          return;
        }

        attemptRef.current += 1;
        if (attemptRef.current > CHAT_CONFIG.reconnectMaxAttempts) {
          updateStatus("error");
          return;
        }

        const delay = Math.min(
          250 * 2 ** (attemptRef.current - 1),
          CHAT_CONFIG.reconnectMaxDelayMs,
        );
        updateStatus("reconnecting");
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current();
        }, delay);
      };
    };

    if (CHAT_CONFIG.isDemo) {
      fetch("/api/v1/internal/ensure-backend", { cache: "no-store" })
        .catch(() => null)
        .finally(() => openSocket());
    } else {
      openSocket();
    }
  }, [userId, username, updateStatus, clearTimers]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (userId && username) {
      connect();
    }
    return () => {
      manualCloseRef.current = true;
      clearTimers();
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, "client_unmount");
        } catch {
        }
        socketRef.current = null;
      }
    };
  }, [userId, username, connect, clearTimers]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }, []);

  const close = useCallback(() => {
    manualCloseRef.current = true;
    clearTimers();
    if (socketRef.current) {
      try {
        socketRef.current.close(1000, "client_logout");
      } catch {
      }
      socketRef.current = null;
    }
    updateStatus("disconnected");
  }, [clearTimers, updateStatus]);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    manualCloseRef.current = false;
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
      }
    } else {
      connect();
    }
  }, [connect]);

  return { status, send, close, reconnect };
}
