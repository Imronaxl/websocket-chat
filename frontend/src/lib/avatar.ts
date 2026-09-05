const AVATAR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#ec4899",
  "#8b5cf6",
  "#a3a3a3",
] as const;

function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export function colorForUsername(username: string): string {
  return AVATAR_PALETTE[hashString(username) % AVATAR_PALETTE.length];
}

export function initialsForUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
