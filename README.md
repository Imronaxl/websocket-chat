# WebSocket Chat

[![Backend](https://github.com/Imronaxl/websocket-chat/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/Imronaxl/websocket-chat/actions/workflows/backend-ci.yml)
[![Frontend](https://github.com/Imronaxl/websocket-chat/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/Imronaxl/websocket-chat/actions/workflows/frontend-ci.yml)

A real-time chat server on FastAPI WebSockets. Messages are stored in
PostgreSQL and fanned out through Redis Pub/Sub, so several backend instances
behind a load balancer serve the same rooms. A Next.js client is included.

![Chat](docs/screenshots/chat.png)

## How it works

```
                      ┌─────────── nginx :8080 ───────────┐
browser ────────────► │ /      → web (Next.js)            │
                      │ /api/  → api replicas, round robin│
                      └─────────────────┬─────────────────┘
                              ┌─────────┴─────────┐
                              ▼                   ▼
                           api #1              api #2
                            │ ▲                 │ ▲
                    publish │ │ subscribed      │ │
                            ▼ │ rooms only      ▼ │
                      ┌──────────────── Redis ────────────────┐
                      │ chat:room:<id> channels, presence hash│
                      └───────────────────────────────────────┘
           both replicas insert and read history in PostgreSQL
```

1. The client gets a signed guest token from `POST /api/v1/auth/guest` and
   opens `/api/v1/ws?token=…`. The handshake is rejected (close code 4401)
   unless the token verifies, so the user id cannot be chosen by the client.
2. On `join`, the instance subscribes to `chat:room:<id>` if it is the first
   local member, and increments the user's connection count in a Redis hash.
3. On `chat`, the message is validated, rate-limited, inserted into Postgres
   and published to the room channel. Every instance subscribed to that
   channel delivers it to its local sockets.
4. Each socket has a bounded send queue drained by its own writer task. A
   client that stops reading fills its queue and is disconnected (4413)
   instead of slowing down delivery to everyone else.
5. The server pings every 25 s and closes sockets that stay silent for two
   intervals (4408). On shutdown it tells clients and releases their presence.

### Design notes

- **One subscription per room per instance**, not per connection. The first
  version subscribed every socket to `room:*`, which opened a Redis connection
  per client and delivered every room's messages to everyone.
- **Presence counts connections.** `chat:room:<id>:online` maps user id to the
  number of open sockets, so closing one of two tabs does not mark a user
  offline. Decrement-and-delete runs as a Lua script, so two instances cannot
  race between the decrement and the delete.
- **Subscriptions are changed by the listener task only.** The task that owns
  the Pub/Sub connection applies queued subscribe/unsubscribe requests and
  resolves a future when Redis confirms, so a join waits until the room is
  actually subscribed before announcing the user.
- **Cursor pagination.** History is paged by message id (`before_id`) on a
  `(room_id, id)` index, which stays correct while new messages arrive,
  unlike offsets.

## Running it

```bash
docker compose up --build        # http://localhost:8080
```

This starts PostgreSQL, Redis, a one-off migration job, **two API replicas**,
the Next.js client and nginx in front. Open the app in two browser windows
to chat; the replicas exchange messages through Redis.

Local development:

```bash
pip install -e ".[dev]"
cp .env.example .env              # point at your Postgres and Redis
alembic upgrade head
uvicorn --factory app.main:create_app --reload --port 8000

cd frontend && bun install
NEXT_PUBLIC_API_URL=http://localhost:8000 bun run dev    # http://localhost:3000
```

## WebSocket protocol

All frames are JSON text.

| Direction | Frame |
|---|---|
| client → server | `{"type": "join", "room_id": "general"}` |
| | `{"type": "leave", "room_id": "general"}` |
| | `{"type": "chat", "room_id": "general", "content": "hi", "client_message_id": "c1"}` |
| | `{"type": "pong"}` |
| server → client | `{"type": "welcome", "user_id": "…", "username": "…", "heartbeat_interval": 25}` |
| | `{"type": "joined", "room_id": "general", "users": [{"user_id": "…", "username": "…"}]}` |
| | `{"type": "message", "client_message_id": "c1", "message": {"id": 1, "room_id": "…", "user_id": "…", "username": "…", "content": "hi", "created_at": "…"}}` |
| | `{"type": "user_joined" \| "user_left", "room_id": "…", "user": {…}}` |
| | `{"type": "ping"}` · `{"type": "server_shutdown"}` |
| | `{"type": "error", "code": "invalid_frame" \| "not_in_room" \| "rate_limited" \| "internal", "message": "…"}` |

Room ids are 1–64 characters of `[a-zA-Z0-9_-]`; messages are 1–4000
characters after trimming.

| Close code | Meaning |
|---|---|
| 4401 | Missing or invalid token |
| 4429 | Too many connections for this user on this instance |
| 4408 | No pong for two heartbeat intervals |
| 4413 | Send queue full (client not reading) |
| 1001 | Server shutting down |

## REST API

| Method | Path | |
|---|---|---|
| `POST` | `/api/v1/auth/guest` | `{"username": "alice"}` → token |
| `GET` | `/api/v1/rooms/{room_id}/messages?limit=50&before_id=…` | History, oldest first (auth) |
| `GET` | `/api/v1/rooms/{room_id}/users` | Users online in the room (auth) |
| `GET` | `/health`, `/ready` | Liveness; readiness checks Postgres and Redis |
| `GET` | `/metrics` | Prometheus |

Interactive docs at `/docs` when running locally.

## Configuration

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://chat:chat@localhost:5432/chat` | |
| `REDIS_URL` | `redis://localhost:6379/0` | |
| `JWT_SECRET` | required | At least 32 characters |
| `JWT_TTL_MINUTES` | `720` | Guest token lifetime |
| `HEARTBEAT_INTERVAL` | `25` | Seconds between server pings |
| `MAX_CONNECTIONS_PER_USER` | `5` | Per instance |
| `SEND_QUEUE_SIZE` | `256` | Frames buffered per socket |
| `MESSAGES_PER_SECOND` / `MESSAGE_BURST` | `5` / `10` | Per-connection chat rate limit |
| `CORS_ORIGINS` | `[]` | JSON list, for running the client on another origin |
| `LOG_JSON` | `true` | structlog JSON or console output |

## Metrics

`chat_ws_connections_active`, `chat_ws_connections_rejected_total{reason}`,
`chat_ws_frames_received_total{type}`, `chat_messages_persisted_total`,
`chat_messages_rate_limited_total`, `chat_ws_slow_consumer_disconnects_total`,
`chat_ws_heartbeat_timeouts_total`, and the `chat_message_handling_seconds`
histogram (validation, insert and publish).

## Tests

```bash
pytest --cov     # 20 tests, 95% line coverage
```

- WebSocket tests open real sockets against the app with `fakeredis` and
  SQLite: handshake auth, a message reaching members of its room and nobody
  else, presence across two tabs, validation and protocol errors, rate
  limiting and the per-user connection limit.
- Two app instances sharing one fake Redis server prove that a message sent
  to one instance reaches a client on the other.
- Hub unit tests cover slow-consumer disconnects, heartbeat timeouts and
  unsubscribing when the last local member leaves.
- CI also runs the migrations up, down and up again on PostgreSQL 16 and
  checks that the models match them (`alembic check`).

### Load test

`scripts/loadtest.py` connects N clients to one room across the given
instances and measures the time from sending a message to each client
receiving it. On a 2-vCPU VM with both instances, Postgres, Redis and the
load generator on the same machine:

```
$ python scripts/loadtest.py --clients 200 --messages 50 http://localhost:18001 http://localhost:18002
200 clients on 2 instance(s), 50 messages
deliveries: 10000 in 10.1s
latency ms: p50 12.3  p95 18.0  p99 156.1  max 169.4
```

p99 varies between runs (150–250 ms) because everything shares two CPUs.

## Limitations

- Guest accounts only; there are no passwords or room permissions.
- If an instance crashes without shutting down, the presence entries of its
  clients stay in Redis until those users reconnect and leave. Expiring
  per-instance presence keys would fix this.
- The connection limit per user is enforced per instance.

## License

MIT
