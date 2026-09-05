"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessageItem } from "./chat-message-item";
import { SystemEvent } from "./system-event";
import { cn } from "@/lib/utils";
import type { ChatLogEntry } from "@/lib/chat-types";

interface ChatMessagesProps {
  entries: ChatLogEntry[];
  currentUserId: string;
  roomName: string;
  historyStatus: "idle" | "loading" | "loaded" | "exhausted";
  onLoadMore: () => void;
}

export function ChatMessages({
  entries,
  currentUserId,
  roomName,
  historyStatus,
  onLoadMore,
}: ChatMessagesProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [showJumpDown, setShowJumpDown] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (isAtBottomRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [entries]);

  const handleScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 80;
    setShowJumpDown(!isAtBottomRef.current && entries.length > 0);
  };

  const jumpToBottom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div className="flex min-h-full flex-col justify-end px-3 py-4">
          {historyStatus === "loaded" && (
            <div className="mb-2 flex justify-center">
              <Button variant="ghost" size="sm" onClick={onLoadMore} className="text-xs">
                Load more history
              </Button>
            </div>
          )}
          {historyStatus === "loading" && (
            <div className="mb-2 text-center text-xs text-muted-foreground">Loading history…</div>
          )}

          {entries.length === 0 ? (
            <EmptyState roomName={roomName} />
          ) : (
            <ul className="space-y-0.5">
              {entries.map((entry, idx) => (
                <li
                  key={entryKey(entry, idx)}
                  className={cn(entry.kind !== "message" && "py-1")}
                >
                  {entry.kind === "message" ? (
                    <ChatMessageItem
                      message={entry.message}
                      isOwn={entry.message.user_id === currentUserId}
                    />
                  ) : (
                    <SystemEvent entry={entry} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showJumpDown && (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Jump to latest message"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background p-2 shadow-md transition-opacity duration-200"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function entryKey(entry: ChatLogEntry, idx: number): string {
  if (entry.kind === "message") return `m-${entry.message.id}`;
  if (entry.kind === "system") return `s-${idx}`;
  return `${entry.kind}-${entry.user_id}-${idx}`;
}

function EmptyState({ roomName }: { roomName: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-foreground">No messages in #{roomName} yet</p>
        <p className="text-sm text-muted-foreground">Be the first to say hello.</p>
      </div>
    </div>
  );
}
