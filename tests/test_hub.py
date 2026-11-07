import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import fakeredis
import pytest

from app.hub import CLOSE_HEARTBEAT_TIMEOUT, CLOSE_SLOW_CONSUMER, ROOM_CHANNEL, Connection, Hub, TokenBucket
from app.security import User


class FakeSocket:
    def __init__(self, block: bool = False) -> None:
        self.sent: list[dict[str, Any]] = []
        self.closed: tuple[int, str] | None = None
        self.block = block

    async def send(self, payload: str) -> None:
        if self.block:
            await asyncio.Event().wait()  # never returns: a client that stopped reading
        self.sent.append(json.loads(payload))

    async def close(self, code: int, reason: str) -> None:
        self.closed = (code, reason)

    def types(self) -> list[str]:
        return [f["type"] for f in self.sent]


class NoRepository:
    async def add(self, *args: Any) -> None:
        raise AssertionError("not used in these tests")


@pytest.fixture
async def hub() -> AsyncIterator[Hub]:
    redis = fakeredis.FakeAsyncRedis(decode_responses=True)
    h = Hub(redis, NoRepository(), heartbeat_interval=0.05, max_connections_per_user=5)  # type: ignore[arg-type]
    await h.start()
    yield h
    await h.stop()


def make_conn(hub: Hub, name: str, sock: FakeSocket, queue_size: int = 16) -> tuple[Connection, asyncio.Task[None]]:
    conn = Connection(User(id=name, name=name), sock.send, sock.close, queue_size, TokenBucket(10, 10))
    hub.register(conn)
    return conn, asyncio.create_task(conn.run_writer())


async def settle() -> None:
    await asyncio.sleep(0.15)


async def test_slow_consumer_is_disconnected(hub: Hub) -> None:
    slow_sock, fast_sock = FakeSocket(block=True), FakeSocket()
    slow, w1 = make_conn(hub, "slow", slow_sock, queue_size=2)
    fast, w2 = make_conn(hub, "fast", fast_sock)
    await hub.join(slow, "general")
    await hub.join(fast, "general")

    for i in range(10):
        await hub.redis.publish(ROOM_CHANNEL + "general", json.dumps({"type": "message", "n": i}))
    await settle()

    assert slow_sock.closed is not None and slow_sock.closed[0] == CLOSE_SLOW_CONSUMER
    assert fast_sock.types().count("message") == 10  # the fast client was not held up
    for t in (w1, w2):
        t.cancel()


async def test_heartbeat_pings_and_times_out(hub: Hub) -> None:
    sock = FakeSocket()
    conn, writer = make_conn(hub, "alice", sock)

    await asyncio.sleep(0.07)
    assert "ping" in sock.types()
    assert sock.closed is None

    conn.last_seen -= 1  # stop answering
    await asyncio.sleep(0.07)
    assert sock.closed is not None and sock.closed[0] == CLOSE_HEARTBEAT_TIMEOUT
    writer.cancel()


async def test_last_local_member_unsubscribes(hub: Hub) -> None:
    sock = FakeSocket()
    conn, writer = make_conn(hub, "alice", sock)
    await hub.join(conn, "general")
    assert (await hub.redis.pubsub_numsub(ROOM_CHANNEL + "general"))[0][1] == 1

    await hub.leave(conn, "general")
    assert (await hub.redis.pubsub_numsub(ROOM_CHANNEL + "general"))[0][1] == 0
    assert await hub.online_users("general") == []
    writer.cancel()


def test_token_bucket_refills() -> None:
    clock = [0.0]
    bucket = TokenBucket(rate=2, burst=2, now=lambda: clock[0])
    assert bucket.allow() and bucket.allow()
    assert not bucket.allow()
    clock[0] += 0.5
    assert bucket.allow()
    assert not bucket.allow()
