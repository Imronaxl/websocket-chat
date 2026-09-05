"use client";

import { useState } from "react";
import { useChatState } from "@/hooks/use-chat-state";
import { LoginScreen } from "./login-screen";
import { ChatSidebar } from "./chat-sidebar";
import { ChatHeader } from "./chat-header";
import { ChatMessages } from "./chat-messages";
import { ChatMessageInput } from "./chat-message-input";
import { ArchitectureDialog } from "./architecture-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CurrentUser {
  userId: string;
  username: string;
}

export function ChatApp() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const chat = useChatState({
    userId: user?.userId ?? null,
    username: user?.username ?? null,
  });

  if (!user) {
    return <LoginScreen onLogin={setUser} />;
  }

  const activeRoomId = chat.activeRoomId;
  const entries = activeRoomId ? chat.logByRoom[activeRoomId] ?? [] : [];
  const onlineCount = activeRoomId ? (chat.onlineUsersByRoom[activeRoomId] ?? []).length : 0;
  const historyStatus = activeRoomId
    ? chat.historyStatusByRoom[activeRoomId] ?? "idle"
    : "idle";

  const sidebar = (
    <ChatSidebar
      currentUserId={user.userId}
      joinedRooms={chat.joinedRooms}
      activeRoomId={activeRoomId}
      onlineUsersByRoom={chat.onlineUsersByRoom}
      onJoinRoom={(roomId) => {
        chat.joinRoom(roomId);
        chat.setActiveRoom(roomId);
        setMobileSidebarOpen(false);
      }}
      onLeaveRoom={chat.leaveRoom}
      onSwitchRoom={chat.setActiveRoom}
    />
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div className="hidden lg:block">{sidebar}</div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          roomName={activeRoomId}
          status={chat.status}
          onlineCount={onlineCount}
          onShowInfo={() => setInfoOpen(true)}
          onLeaveRoom={() => activeRoomId && chat.leaveRoom(activeRoomId)}
        />

        {!activeRoomId && (
          <div className="flex items-center justify-between border-b border-border px-4 py-2 lg:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMobileSidebarOpen(true)}
              className="gap-2"
            >
              <Menu className="h-4 w-4" />
              Rooms
            </Button>
            <span className="text-xs text-muted-foreground">Pick a room to start</span>
          </div>
        )}

        {activeRoomId && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 lg:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileSidebarOpen(true)}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <Menu className="h-3.5 w-3.5" />
              Rooms
            </Button>
          </div>
        )}

        {activeRoomId ? (
          <>
            <ChatMessages
              entries={entries}
              currentUserId={user.userId}
              roomName={activeRoomId}
              historyStatus={historyStatus}
              onLoadMore={() => chat.loadMoreHistory(activeRoomId)}
            />
            <ChatMessageInput
              disabled={chat.status !== "connected"}
              onSend={chat.sendMessage}
              placeholder={
                chat.status === "connected"
                  ? `Message #${activeRoomId}…  (Enter to send)`
                  : "Reconnecting…"
              }
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-lg font-medium text-foreground">Welcome, {user.username}</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              You&apos;re connected. Pick a room from the sidebar to start chatting, or create
              a new one.
            </p>
            <Button variant="outline" size="sm" onClick={() => setMobileSidebarOpen(true)} className="lg:hidden">
              Open rooms
            </Button>
          </div>
        )}
      </div>

      <ArchitectureDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        metrics={chat.metrics}
      />
    </div>
  );
}
