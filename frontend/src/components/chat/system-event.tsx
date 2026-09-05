"use client";

import { cn } from "@/lib/utils";
import type { ChatLogEntry } from "@/lib/chat-types";

interface SystemEventProps {
  entry: Extract<ChatLogEntry, { kind: "user_joined" | "user_left" | "system" }>;
}

function formatAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function SystemEvent({ entry }: SystemEventProps) {
  const at = formatAt(entry.at);
  if (entry.kind === "user_joined") {
    return (
      <Row at={at}>
        <span className="font-medium text-emerald-600 dark:text-emerald-400">{entry.username}</span>
        <span className="text-muted-foreground"> joined the room</span>
      </Row>
    );
  }
  if (entry.kind === "user_left") {
    return (
      <Row at={at}>
        <span className="font-medium text-amber-600 dark:text-amber-400">{entry.username}</span>
        <span className="text-muted-foreground"> left the room</span>
      </Row>
    );
  }
  return (
    <Row at={at}>
      <span className="text-red-500">{entry.content}</span>
    </Row>
  );
}

function Row({ at, children }: { at: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1 text-xs")}>
      <span className="flex-1 truncate">{children}</span>
      {at && <span className="text-muted-foreground/60">{at}</span>}
    </div>
  );
}
