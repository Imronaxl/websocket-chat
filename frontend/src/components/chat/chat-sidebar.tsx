"use client";

import { useState } from "react";
import { Hash, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SUGGESTED_ROOMS_LIST } from "@/hooks/use-chat-state";
import { UserAvatar } from "./user-avatar";

interface ChatSidebarProps {
  currentUserId: string;
  joinedRooms: string[];
  activeRoomId: string | null;
  onlineUsersByRoom: Record<string, string[]>;
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: (roomId: string) => void;
  onSwitchRoom: (roomId: string) => void;
}

export function ChatSidebar({
  currentUserId,
  joinedRooms,
  activeRoomId,
  onlineUsersByRoom,
  onJoinRoom,
  onLeaveRoom,
  onSwitchRoom,
}: ChatSidebarProps) {
  const [newRoomInput, setNewRoomInput] = useState("");
  const suggestedNotJoined = SUGGESTED_ROOMS_LIST.filter((r) => !joinedRooms.includes(r));
  const onlineUsers = activeRoomId ? onlineUsersByRoom[activeRoomId] ?? [] : [];

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRoomInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed) return;
    onJoinRoom(trimmed);
    setNewRoomInput("");
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-muted/30 lg:w-72">
      <section className="border-b border-border p-3">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Rooms
        </h2>
        {joinedRooms.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">
            No rooms yet. Join one below to start chatting.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {joinedRooms.map((roomId) => (
              <li key={roomId}>
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    roomId === activeRoomId
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSwitchRoom(roomId)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <Hash className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="truncate">{roomId}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onLeaveRoom(roomId)}
                    className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                    aria-label={`Leave room ${roomId}`}
                    title="Leave room"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-b border-border p-3">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Join a room
        </h2>
        {suggestedNotJoined.length > 0 ? (
          <ul className="mb-2 space-y-0.5">
            {suggestedNotJoined.map((roomId) => (
              <li key={roomId}>
                <button
                  type="button"
                  onClick={() => onJoinRoom(roomId)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="truncate">{roomId}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 px-1 text-xs text-muted-foreground">You've joined all suggested rooms.</p>
        )}
        <form onSubmit={handleCreateRoom} className="flex gap-2">
          <Input
            value={newRoomInput}
            onChange={(e) => setNewRoomInput(e.target.value)}
            placeholder="new-room"
            className="h-8 text-sm"
            maxLength={32}
            aria-label="Create or join a room"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-8 px-2.5" disabled={!newRoomInput.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </form>
      </section>

      <section className="flex min-h-0 flex-1 flex-col p-3">
        <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Online — {activeRoomId ? `#${activeRoomId}` : "no room"}
        </h2>
        {!activeRoomId ? (
          <p className="px-1 text-sm text-muted-foreground">Pick a room to see who's online.</p>
        ) : onlineUsers.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">Nobody here yet.</p>
        ) : (
          <ScrollArea className="flex-1">
            <ul className="space-y-1 pr-2">
              {onlineUsers.map((userId) => {
                const isMe = userId === currentUserId;
                return (
                  <li
                    key={userId}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
                      isMe && "bg-primary/5",
                    )}
                  >
                    <UserAvatar username={userId.replace(/^u-/, "")} size="sm" />
                    <span className="truncate text-foreground">{userId.replace(/^u-/, "")}</span>
                    {isMe && (
                      <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        you
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </section>
    </aside>
  );
}
