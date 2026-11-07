# Chat client

Next.js client for the [chat server](../README.md).

```bash
bun install
NEXT_PUBLIC_API_URL=http://localhost:8000 bun run dev   # http://localhost:3000
bun run lint && bun run typecheck && bun run build
```

The backend must allow this origin: `CORS_ORIGINS=["http://localhost:3000"]`.
In Docker Compose the client and the API share one origin behind nginx, so
`NEXT_PUBLIC_API_URL` is left empty.

- `src/lib/chat-types.ts` mirrors the server's frames and REST models.
- `src/hooks/use-chat-websocket.ts` owns the socket: answers pings and
  reconnects with exponential backoff, except after close codes 4401 and 4429.
- `src/hooks/use-chat-state.ts` keeps rooms, presence and history, rejoins
  rooms after a reconnect and pages history with `before_id`.
