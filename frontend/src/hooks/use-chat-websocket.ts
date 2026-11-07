"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_CONFIG, FATAL_CLOSE_CODES, wsUrl } from "@/lib/chat-config";
import { buildPong } from "@/lib/chat-protocol";
import type { ClientMessage, ConnectionStatus, ServerMessage } from "@/lib/chat-types";

interface UseChatWebSocketArgs {
  token: string | null;
  onMessage: (msg: ServerMessage) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onFatalClose?: (code: number) => void;
}

interface UseChatWebSocketReturn {
  status: ConnectionStatus;
  send: (msg: ClientMessage) => boolean;
  reconnect: () => void;
}

/**
 * Keeps one socket open while a token is set. Answers server pings, and
 * reconnects with exponential backoff unless the server rejected the token.
 */
export function useChatWebSocket({
  token,
  onMessage,
  onStatusChange,
  onFatalClose,
}: UseChatWebSocketArgs): UseChatWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  const handlers = useRef({ onMessage, onStatusChange, onFatalClose });
  useEffect(() => {
    handlers.current = { onMessage, onStatusChange, onFatalClose };
  }, [onMessage, onStatusChange, onFatalClose]);

  const updateStatus = useCallback((next: ConnectionStatus) => {
    setStatus(next);
    handlers.current.onStatusChange?.(next);
  }, []);

  const clearReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) return;
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

    manualCloseRef.current = false;
    updateStatus(attemptRef.current === 0 ? "connecting" : "reconnecting");

    const socket = new WebSocket(wsUrl(token));
    socketRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      updateStatus("connected");
    };

    socket.onmessage = (event) => {
      let frame: ServerMessage;
      try {
        frame = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (frame.type === "ping") {
        socket.send(JSON.stringify(buildPong()));
        return;
      }
      handlers.current.onMessage(frame);
    };

    socket.onclose = (event) => {
      socketRef.current = null;
      if (manualCloseRef.current) {
        updateStatus("disconnected");
        return;
      }
      if (FATAL_CLOSE_CODES.has(event.code)) {
        updateStatus("error");
        handlers.current.onFatalClose?.(event.code);
        return;
      }
      attemptRef.current += 1;
      if (attemptRef.current > CHAT_CONFIG.reconnectMaxAttempts) {
        updateStatus("error");
        return;
      }
      const delay = Math.min(250 * 2 ** (attemptRef.current - 1), CHAT_CONFIG.reconnectMaxDelayMs);
      updateStatus("reconnecting");
      reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay);
    };
  }, [token, updateStatus]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (token) connect();
    return () => {
      manualCloseRef.current = true;
      clearReconnect();
      socketRef.current?.close(1000, "client closed");
      socketRef.current = null;
    };
  }, [token, connect, clearReconnect]);

  const send = useCallback((msg: ClientMessage): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }, []);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    clearReconnect();
    if (socketRef.current) {
      socketRef.current.close();
    } else {
      connect();
    }
  }, [connect, clearReconnect]);

  return { status, send, reconnect };
}
