"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowRight, Boxes, Database, Radio, Server, Zap } from "lucide-react";

interface ArchitectureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: {
    messagesSent: number;
    messagesReceived: number;
    reconnectCount: number;
  };
}

export function ArchitectureDialog({ open, onOpenChange, metrics }: ArchitectureDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Boxes className="h-5 w-5 text-primary" />
            How this chat works
          </DialogTitle>
          <DialogDescription>
            A 60-second tour of the architecture, the protocol, and a few
            things worth asking about in an interview.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="space-y-6 p-6">
            <section>
              <SectionTitle icon={<Activity className="h-4 w-4" />}>This session</SectionTitle>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Messages sent" value={metrics.messagesSent} />
                <Stat label="Messages received" value={metrics.messagesReceived} />
                <Stat label="Reconnects" value={metrics.reconnectCount} />
              </div>
            </section>

            <section>
              <SectionTitle icon={<Server className="h-4 w-4" />}>Architecture</SectionTitle>
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-[11px] leading-relaxed text-foreground">
{`┌─────────────┐       ws        ┌──────────────┐
│  Next.js    │ ──────────────► │   FastAPI    │
│  Frontend   │ ◄────────────── │   Backend    │
│ (this app)  │    broadcasts   │ (websocket)  │
└─────────────┘                 └──────┬───────┘
                                       │ pub/sub
                                       ▼
                                ┌──────────────┐
                                │    Redis     │
                                │   Pub/Sub    │
                                └──────┬───────┘
                                       │ fan-out
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
            other FastAPI                              PostgreSQL
            instances                                  (history)`}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                Each backend instance holds one Redis subscription per room that has
                local members and fans messages out to its own sockets.
              </p>
            </section>

            <section>
              <SectionTitle icon={<Radio className="h-4 w-4" />}>WebSocket protocol</SectionTitle>
              <p className="mb-3 text-sm text-muted-foreground">
                One URL, JSON in both directions. All shapes are typed on the
                frontend in <code className="font-mono">lib/chat-types.ts</code> and mirror the
                Pydantic schemas in the Python backend.
              </p>
              <div className="space-y-2">
                <ProtocolRow
                  dir="c2s"
                  label="Join a room"
                  payload={`{ "type": "join", "room_id": "general" }`}
                />
                <ProtocolRow
                  dir="c2s"
                  label="Send a message"
                  payload={`{ "type": "chat", "room_id": "general", "content": "hi", "client_message_id": "…" }`}
                />
                <ProtocolRow
                  dir="s2c"
                  label="Broadcast a message"
                  payload={`{ "type": "message", "client_message_id": "…", "message": { "id": 1, "room_id": "…", "user_id": "…", "username": "…", "content": "…", "created_at": "…" } }`}
                />
                <ProtocolRow
                  dir="s2c"
                  label="User joined / left"
                  payload={`{ "type": "user_joined" | "user_left", "room_id": "…", "user": { "user_id": "…", "username": "…" } }`}
                />
              </div>
            </section>

            <section>
              <SectionTitle icon={<Zap className="h-4 w-4" />}>Worth asking about</SectionTitle>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <TalkingPoint
                  title="Why Redis Pub/Sub?"
                  body="So several FastAPI instances can serve the same rooms. Instance A stores a message and publishes it to the room's channel; every instance subscribed to that channel (only those with members in the room) delivers it to its local sockets."
                />
                <TalkingPoint
                  title="How does the client stay alive?"
                  body="The server sends a ping every 25 s and closes sockets that stay silent for two intervals. The client answers pings, reconnects with exponential backoff (250 ms up to 8 s) and rejoins its rooms after a reconnect."
                />
                <TalkingPoint
                  title="How is presence counted?"
                  body="Redis keeps, per room, a hash of user id to open connection count. A user with two tabs stays online until both close; the decrement-and-delete runs as one Lua script so two instances cannot race."
                />
                <TalkingPoint
                  title="Is the message content sanitized?"
                  body="Content is validated (1–4000 characters) and stored as plain text. The frontend renders it as text, never as HTML, so there is nothing to sanitize on the way out."
                />
                <TalkingPoint
                  title="What's missing for a real product?"
                  body="Accounts with passwords or OAuth (guests only for now), room permissions, typing indicators, read receipts, and expiring presence for instances that crash without cleaning up."
                />
              </ul>
            </section>

            <section>
              <SectionTitle icon={<Database className="h-4 w-4" />}>Stack</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {[
                  "Next.js 16",
                  "React 19",
                  "TypeScript",
                  "Tailwind 4",
                  "shadcn/ui",
                  "FastAPI",
                  "WebSocket",
                  "Redis Pub/Sub",
                  "PostgreSQL",
                  "SQLAlchemy 2.0",
                  "Pydantic v2",
                  "Docker",
                ].map((tech) => (
                  <Badge key={tech} variant="secondary" className="font-normal">
                    {tech}
                  </Badge>
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="text-primary">{icon}</span>
      {children}
    </h3>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ProtocolRow({
  dir,
  label,
  payload,
}: {
  dir: "c2s" | "s2c";
  label: string;
  payload: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2 sm:w-56 sm:shrink-0">
        <Badge
          variant={dir === "c2s" ? "default" : "outline"}
          className="font-mono text-[10px]"
        >
          {dir === "c2s" ? "client → server" : "server → client"}
        </Badge>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <code className="flex-1 overflow-x-auto rounded bg-muted/60 px-2 py-1 font-mono text-[11px] text-foreground">
        {payload}
      </code>
    </div>
  );
}

function TalkingPoint({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <ArrowRight className="h-3.5 w-3.5 text-primary" />
        {title}
      </div>
      <p className="mt-1 pl-5 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}
