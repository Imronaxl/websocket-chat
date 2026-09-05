"use client";

import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/chat-types";

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  className?: string;
}

const LABELS: Record<ConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
  error: "Connection error",
};

const DOT_CLASSES: Record<ConnectionStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-emerald-500",
  reconnecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-red-500",
  error: "bg-red-500",
};

export function ConnectionStatusBadge({ status, className }: ConnectionStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2 py-0.5 text-xs font-medium text-muted-foreground backdrop-blur",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASSES[status])} />
      {LABELS[status]}
    </span>
  );
}
