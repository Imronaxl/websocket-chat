"use client";

import { UserAvatar } from "./user-avatar";
import { cn } from "@/lib/utils";
import type { MessageResponse } from "@/lib/chat-types";

interface ChatMessageItemProps {
  message: MessageResponse;
  isOwn: boolean;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatMessageItem({ message, isOwn }: ChatMessageItemProps) {
  return (
    <div
      className={cn(
        "group flex gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40",
        isOwn && "bg-primary/5",
      )}
    >
      <UserAvatar username={message.username} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm font-semibold", isOwn ? "text-primary" : "text-foreground")}>
            {message.username}
            {isOwn && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
          </span>
          <span className="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {formatTimestamp(message.created_at)}
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">
          {message.content}
        </p>
      </div>
    </div>
  );
}
