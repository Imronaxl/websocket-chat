"""Room membership, fan-out and presence for one application instance.

Every instance keeps the sockets of its own clients and a single Redis
Pub/Sub connection. It subscribes to a room's channel while at least one
local client is in that room, so a message published by any instance
reaches exactly the instances that have members of the room. Presence is
a per-room Redis hash of user_id -> open connection count, so a user with
two tabs stays online until both are closed.
"""

from __future__ import annotations

import asyncio
import collections
import contextlib
import json
import time
from collections.abc import Awaitable, Callable
from typing import Any

import structlog
from redis.asyncio import Redis

from app import metrics
from app.repository import MessageRepository
from app.schemas import OnlineUser
from app.security import User

log = structlog.get_logger(__name__)

ROOM_CHANNEL = "chat:room:"
CONTROL_CHANNEL = "chat:control"

# Decrements a user's connection count and removes them when it reaches zero,
# atomically, so two instances cannot race between the decrement and the delete.
_LEAVE_SCRIPT = """
local n = redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
if n <= 0 then
  redis.call('HDEL', KEYS[1], ARGV[1])
  redis.call('HDEL', KEYS[2], ARGV[1])
end
return n
"""

# WebSocket close codes in the private 4000-4999 range.
CLOSE_HEARTBEAT_TIMEOUT = 4408
CLOSE_SLOW_CONSUMER = 4413
CLOSE_GOING_AWAY = 1001


def _presence_key(room_id: str) -> str:
    return f"chat:room:{room_id}:online"


def _names_key(room_id: str) -> str:
    return f"chat:room:{room_id}:names"


class TokenBucket:
    def __init__(self, rate: float, burst: int, now: Callable[[], float] = time.monotonic) -> None:
        self.rate = rate
        self.capacity = float(burst)
        self.tokens = float(burst)
        self._now = now
        self._last = now()

    def allow(self) -> bool:
        current = self._now()
        self.tokens = min(self.capacity, self.tokens + (current - self._last) * self.rate)
        self._last = current
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


class Connection:
    """One client socket. Outgoing frames go through a bounded queue drained by
    a writer task, so a slow client cannot block fan-out to everyone else."""

    def __init__(
        self,
        user: User,
        send: Callable[[str], Awaitable[None]],
        close: Callable[[int, str], Awaitable[None]],
        queue_size: int,
        bucket: TokenBucket,
    ) -> None:
        self.user = user
        self.rooms: set[str] = set()
        self.last_seen = time.monotonic()
        self.bucket = bucket
        self._send = send
        self._close = close
        self._queue: asyncio.Queue[str] = asyncio.Queue(queue_size)
        self._closing = False

    def touch(self) -> None:
        self.last_seen = time.monotonic()

    def enqueue(self, payload: str) -> bool:
        try:
            self._queue.put_nowait(payload)
            return True
        except asyncio.QueueFull:
            return False

    def send_json(self, data: dict[str, Any]) -> bool:
        return self.enqueue(json.dumps(data))

    def error(self, code: str, message: str) -> None:
        self.send_json({"type": "error", "code": code, "message": message})

    async def run_writer(self) -> None:
        while True:
            payload = await self._queue.get()
            await self._send(payload)

    def request_close(self, code: int, reason: str) -> None:
        if self._closing:
            return
        self._closing = True
        asyncio.get_running_loop().create_task(self._safe_close(code, reason))

    async def _safe_close(self, code: int, reason: str) -> None:
        with contextlib.suppress(Exception):  # the socket may already be gone
            await self._close(code, reason)


class Hub:
    def __init__(
        self,
        redis: Redis,
        repository: MessageRepository,
        heartbeat_interval: float,
        max_connections_per_user: int,
    ) -> None:
        self.redis = redis
        self.repository = repository
        self.heartbeat_interval = heartbeat_interval
        self.max_connections_per_user = max_connections_per_user

        self._connections: set[Connection] = set()
        self._per_user: collections.Counter[str] = collections.Counter()
        self._rooms: dict[str, set[Connection]] = {}
        self._ops: collections.deque[tuple[str, str, asyncio.Future[None]]] = collections.deque()
        self._tasks: list[asyncio.Task[None]] = []
        self._listening = False
        self._leave_script = redis.register_script(_LEAVE_SCRIPT)

    # --- lifecycle --------------------------------------------------------

    async def start(self) -> None:
        self._pubsub = self.redis.pubsub()
        # Subscribing to a control channel opens the Pub/Sub connection, so
        # get_message() works before the first room is joined.
        await self._pubsub.subscribe(CONTROL_CHANNEL)
        self._listening = True
        self._tasks = [
            asyncio.create_task(self._listen(), name="hub-listener"),
            asyncio.create_task(self._heartbeat(), name="hub-heartbeat"),
        ]

    async def stop(self) -> None:
        for conn in list(self._connections):
            conn.send_json({"type": "server_shutdown"})
            conn.request_close(CLOSE_GOING_AWAY, "server shutting down")
        self._listening = False
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        while self._ops:  # requests that raced with shutdown
            op, channel, fut = self._ops.popleft()
            await getattr(self._pubsub, op)(channel)
            if not fut.done():
                fut.set_result(None)
        # Release presence held by clients of this instance.
        for conn in list(self._connections):
            await self.unregister(conn)
        await self._pubsub.aclose()  # type: ignore[no-untyped-call]

    # --- connections ------------------------------------------------------

    def can_accept(self, user: User) -> bool:
        return self._per_user[user.id] < self.max_connections_per_user

    def register(self, conn: Connection) -> None:
        self._connections.add(conn)
        self._per_user[conn.user.id] += 1
        metrics.connections_active.set(len(self._connections))

    async def unregister(self, conn: Connection) -> None:
        if conn not in self._connections:
            return
        for room_id in list(conn.rooms):
            await self.leave(conn, room_id)
        self._connections.discard(conn)
        self._per_user[conn.user.id] -= 1
        if self._per_user[conn.user.id] <= 0:
            del self._per_user[conn.user.id]
        metrics.connections_active.set(len(self._connections))

    # --- rooms ------------------------------------------------------------

    async def join(self, conn: Connection, room_id: str) -> None:
        if room_id not in conn.rooms:
            conn.rooms.add(room_id)
            members = self._rooms.setdefault(room_id, set())
            if not members:
                await self._request("subscribe", ROOM_CHANNEL + room_id)
            members.add(conn)

            user = conn.user
            async with self.redis.pipeline(transaction=True) as pipe:
                pipe.hincrby(_presence_key(room_id), user.id, 1)
                pipe.hset(_names_key(room_id), user.id, user.name)
                count, _ = await pipe.execute()
            if count == 1:
                await self._publish(room_id, {"type": "user_joined", "room_id": room_id, "user": _user(user)})

        users = await self.online_users(room_id)
        conn.send_json({"type": "joined", "room_id": room_id, "users": [u.model_dump() for u in users]})

    async def leave(self, conn: Connection, room_id: str) -> None:
        if room_id not in conn.rooms:
            return
        conn.rooms.discard(room_id)
        members = self._rooms.get(room_id)
        if members is not None:
            members.discard(conn)
            if not members:
                del self._rooms[room_id]
                await self._request("unsubscribe", ROOM_CHANNEL + room_id)

        user = conn.user
        remaining = await self._leave_script(keys=[_presence_key(room_id), _names_key(room_id)], args=[user.id])
        if int(remaining) <= 0:
            await self._publish(room_id, {"type": "user_left", "room_id": room_id, "user": _user(user)})

    async def online_users(self, room_id: str) -> list[OnlineUser]:
        ids = await self.redis.hkeys(_presence_key(room_id))
        if not ids:
            return []
        names = await self.redis.hmget(_names_key(room_id), ids)
        return sorted(
            (OnlineUser(user_id=i, username=n or "unknown") for i, n in zip(ids, names, strict=False)),
            key=lambda u: u.username.lower(),
        )

    async def chat(self, conn: Connection, room_id: str, content: str, client_message_id: str | None) -> None:
        if not conn.bucket.allow():
            metrics.messages_rate_limited.inc()
            conn.error("rate_limited", "Too many messages, slow down")
            return
        if room_id not in conn.rooms:
            conn.error("not_in_room", f"Join {room_id} before sending messages to it")
            return

        with metrics.message_handling.time():
            message = await self.repository.add(room_id, conn.user.id, conn.user.name, content)
            metrics.messages_persisted.inc()
            await self._publish(
                room_id,
                {
                    "type": "message",
                    "client_message_id": client_message_id,
                    "message": {
                        "id": message.id,
                        "room_id": message.room_id,
                        "user_id": message.user_id,
                        "username": message.username,
                        "content": message.content,
                        "created_at": message.created_at.isoformat(),
                    },
                },
            )

    # --- internals --------------------------------------------------------

    async def _publish(self, room_id: str, event: dict[str, Any]) -> None:
        await self.redis.publish(ROOM_CHANNEL + room_id, json.dumps(event))

    async def _request(self, op: str, channel: str) -> None:
        """(Un)subscribes from inside the listener task, which owns the
        Pub/Sub connection, and waits until Redis has confirmed it."""
        if not self._listening:
            # During shutdown the listener is gone; talk to Redis directly.
            await getattr(self._pubsub, op)(channel)
            return
        fut: asyncio.Future[None] = asyncio.get_running_loop().create_future()
        self._ops.append((op, channel, fut))
        await fut

    async def _listen(self) -> None:
        while True:
            while self._ops:
                op, channel, fut = self._ops.popleft()
                try:
                    await getattr(self._pubsub, op)(channel)
                except Exception as exc:
                    if not fut.done():
                        fut.set_exception(exc)
                else:
                    if not fut.done():  # the waiter may have been cancelled
                        fut.set_result(None)
            try:
                msg = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=0.05)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("pubsub_read_failed")
                await asyncio.sleep(1)
                continue
            if msg and msg["type"] == "message":
                self._deliver(msg["channel"], msg["data"])

    def _deliver(self, channel: str, payload: str) -> None:
        room_id = channel.removeprefix(ROOM_CHANNEL)
        for conn in list(self._rooms.get(room_id, ())):
            if not conn.enqueue(payload):
                metrics.slow_consumers.inc()
                log.warning("slow_consumer_disconnected", user_id=conn.user.id)
                conn.request_close(CLOSE_SLOW_CONSUMER, "send queue full")

    async def _heartbeat(self) -> None:
        ping = json.dumps({"type": "ping"})
        while True:
            await asyncio.sleep(self.heartbeat_interval)
            deadline = time.monotonic() - 2 * self.heartbeat_interval
            for conn in list(self._connections):
                if conn.last_seen < deadline:
                    metrics.heartbeat_timeouts.inc()
                    conn.request_close(CLOSE_HEARTBEAT_TIMEOUT, "heartbeat timeout")
                else:
                    conn.enqueue(ping)


def _user(user: User) -> dict[str, str]:
    return {"user_id": user.id, "username": user.name}
