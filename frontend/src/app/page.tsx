"use client";

import dynamic from "next/dynamic";

// The app reads the session from sessionStorage on first render, so it is
// rendered on the client only.
const ChatApp = dynamic(() => import("@/components/chat/chat-app").then((m) => m.ChatApp), { ssr: false });

export default function Home() {
  return <ChatApp />;
}
