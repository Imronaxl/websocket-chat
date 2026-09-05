"use client";

import { colorForUsername, initialsForUsername } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  username: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
};

export function UserAvatar({ username, size = "md", className }: UserAvatarProps) {
  const color = colorForUsername(username);
  const initials = initialsForUsername(username);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-background",
        SIZE_CLASSES[size],
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}
