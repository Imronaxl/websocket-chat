import type { Session, TokenResponse } from "./chat-types";

// Empty means "same origin": in Docker Compose nginx serves the UI and the API
// on one host. For `bun run dev` set NEXT_PUBLIC_API_URL=http://localhost:8000.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export function wsUrl(token: string): string {
  const base = API_URL || window.location.origin;
  return `${base.replace(/^http/, "ws")}/api/v1/ws?token=${encodeURIComponent(token)}`;
}

export function authHeaders(session: Session): HeadersInit {
  return { Authorization: `Bearer ${session.token}` };
}

export async function guestLogin(username: string): Promise<Session> {
  const res = await fetch(apiUrl("/api/v1/auth/guest"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    throw new Error(res.status === 422 ? "Use letters, digits, spaces, dots or dashes" : `Login failed (${res.status})`);
  }
  const data = (await res.json()) as TokenResponse;
  return { token: data.access_token, userId: data.user_id, username: data.username };
}

export const CHAT_CONFIG = {
  messagePageSize: 50,
  reconnectMaxDelayMs: 8_000,
  reconnectMaxAttempts: 10,
} as const;

// Close codes after which reconnecting cannot help (see app/api/ws.py).
export const FATAL_CLOSE_CODES = new Set([4401, 4429]);

export const SUGGESTED_ROOMS = ["general", "random", "tech", "music"] as const;
