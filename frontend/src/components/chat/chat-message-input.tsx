"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatMessageInputProps {
  disabled?: boolean;
  onSend: (content: string) => void;
  placeholder?: string;
}

const MAX_TEXTAREA_HEIGHT_PX = 140;

export function ChatMessageInput({ disabled, onSend, placeholder }: ChatMessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [value]);

  const send = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    queueMicrotask(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-border bg-background/80 p-3 backdrop-blur">
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 shadow-sm transition-colors",
          "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20",
        )}
      >
        <Textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Type a message…  (Enter to send, Shift+Enter for newline)"}
          disabled={disabled}
          className="min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label="Message"
        />
        <Button
          type="button"
          size="sm"
          onClick={send}
          disabled={disabled || !value.trim()}
          className="h-8 gap-1.5 px-3"
          aria-label="Send message"
        >
          <Send className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </div>
    </div>
  );
}
