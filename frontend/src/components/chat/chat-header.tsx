"use client";

import { Hash, Info, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionStatusBadge } from "./connection-status-badge";
import type { ConnectionStatus } from "@/lib/chat-types";
import { useTheme } from "next-themes";

interface ChatHeaderProps {
  roomName: string | null;
  status: ConnectionStatus;
  onlineCount: number;
  onShowInfo: () => void;
  onLeaveRoom: () => void;
}

export function ChatHeader({
  roomName,
  status,
  onlineCount,
  onShowInfo,
  onLeaveRoom,
}: ChatHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <header className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-2.5 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
        <h1 className="truncate text-sm font-semibold text-foreground">
          {roomName ?? "No room selected"}
        </h1>
        {roomName && (
          <span className="ml-1 text-xs text-muted-foreground">· {onlineCount} online</span>
        )}
      </div>

      <ConnectionStatusBadge status={status} />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onShowInfo}
          aria-label="How this works"
          title="How this works"
        >
          <Info className="h-4 w-4" />
        </Button>
        {roomName && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-red-500"
            onClick={onLeaveRoom}
            aria-label={`Leave room ${roomName}`}
            title="Leave room"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
