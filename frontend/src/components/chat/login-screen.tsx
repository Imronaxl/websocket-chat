"use client";

import { useState } from "react";
import { guestLogin } from "@/lib/chat-config";
import type { Session } from "@/lib/chat-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "./user-avatar";
import { Github, Sparkles, Zap } from "lucide-react";

interface LoginScreenProps {
  onLogin: (session: Session) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isValid = username.trim().length >= 2 && username.trim().length <= 32;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      onLogin(await guestLogin(username.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted/30 px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative grid w-full max-w-5xl gap-8 lg:grid-cols-2 lg:items-center">
        <div className="hidden flex-col gap-6 lg:flex">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            FastAPI · Redis · PostgreSQL · Next.js
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Real-time chat
            <br />
            <span className="text-primary">over WebSocket + Redis Pub/Sub</span>
          </h1>
          <p className="max-w-md text-muted-foreground">
            A chat server built on FastAPI WebSockets. Messages are stored in
            PostgreSQL and fanned out through Redis Pub/Sub, so any number of
            backend instances can serve the same rooms.
          </p>
          <ul className="space-y-3 text-sm">
            <FeatureRow icon={<Zap className="h-4 w-4" />} text="Server heartbeats, reconnect with exponential backoff" />
            <FeatureRow icon={<Zap className="h-4 w-4" />} text="Rooms, presence across tabs and instances, paged history" />
            <FeatureRow icon={<Zap className="h-4 w-4" />} text="JWT-authenticated sockets, per-connection rate limits" />
          </ul>
        </div>

        <Card className="border-border/60 shadow-xl backdrop-blur">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Github className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Join the chat</CardTitle>
            <CardDescription>Pick a display name. Guest accounts have no password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Display name</Label>
                <div className="flex items-center gap-3">
                  <UserAvatar username={username || "?"} size="lg" />
                  <Input
                    id="username"
                    placeholder="e.g. alice"
                    autoFocus
                    autoComplete="off"
                    maxLength={32}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onBlur={() => setTouched(true)}
                    aria-invalid={touched && !isValid}
                    aria-describedby={touched && !isValid ? "username-error" : undefined}
                  />
                </div>
                {touched && !isValid && (
                  <p id="username-error" className="text-xs text-red-500">
                    Name must be 2–32 characters.
                  </p>
                )}
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={!isValid || submitting}>
                {submitting ? "Signing in…" : "Enter chat"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                The server issues a signed guest token; your id comes from it, not from this form.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3 text-muted-foreground">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <span>{text}</span>
    </li>
  );
}
