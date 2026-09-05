const isDemo = process.env.NEXT_PUBLIC_CHAT_MODE === "backend" ? false : true;

const DEMO_PORT = 3003;

export function buildWsUrl(params: { userId: string; username: string }): string {
  const query = new URLSearchParams({
    user_id: params.userId,
    username: params.username,
  });
  if (isDemo) {
    query.set("XTransformPort", String(DEMO_PORT));
  }
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const host = typeof window !== "undefined" ? window.location.host : "localhost";
  return `${proto}://${host}/api/v1/ws?${query.toString()}`;
}

export function buildRestUrl(path: string): string {
  if (!isDemo) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}XTransformPort=${DEMO_PORT}`;
}

export const CHAT_CONFIG = {
  isDemo,
  apiPrefix: "/api/v1",
  messagePageSize: 50,
  heartbeatIntervalMs: 25_000,
  reconnectMaxDelayMs: 8_000,
  reconnectMaxAttempts: 10,
} as const;

export const SUGGESTED_ROOMS = ["general", "random", "tech", "music"] as const;
