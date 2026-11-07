"""Measures fan-out latency: N clients in one room, spread across instances.

    python scripts/loadtest.py --clients 200 --messages 50 http://localhost:8001 http://localhost:8002

Every client receives every message; latency is the time from sending a
chat frame to each receiver getting the broadcast.
"""

import argparse
import asyncio
import json
import statistics
import time

import httpx
import websockets


async def login(base: str, name: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{base}/api/v1/auth/guest", json={"username": name})
        resp.raise_for_status()
        return str(resp.json()["access_token"])


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("bases", nargs="+")
    parser.add_argument("--clients", type=int, default=100)
    parser.add_argument("--messages", type=int, default=50)
    parser.add_argument("--room", default="loadtest")
    args = parser.parse_args()

    sent_at: dict[str, float] = {}
    latencies: list[float] = []
    received = 0
    done = asyncio.Event()
    expected = args.clients * args.messages

    async def receiver(ws: websockets.ClientConnection) -> None:
        nonlocal received
        async for raw in ws:
            frame = json.loads(raw)
            if frame["type"] == "message" and frame.get("client_message_id") in sent_at:
                latencies.append(time.perf_counter() - sent_at[frame["client_message_id"]])
                received += 1
                if received == expected:
                    done.set()

    sockets = []
    for i in range(args.clients):
        base = args.bases[i % len(args.bases)]
        token = await login(base, f"user{i}")
        ws = await websockets.connect(f"{base.replace('http', 'ws')}/api/v1/ws?token={token}")
        await ws.send(json.dumps({"type": "join", "room_id": args.room}))
        sockets.append(ws)
    await asyncio.sleep(1)
    readers = [asyncio.create_task(receiver(ws)) for ws in sockets]

    start = time.perf_counter()
    for n in range(args.messages):
        cid = f"m{n}"
        sent_at[cid] = time.perf_counter()
        await sockets[n % len(sockets)].send(
            json.dumps({"type": "chat", "room_id": args.room, "content": f"load {n}", "client_message_id": cid})
        )
        await asyncio.sleep(0.2)  # stay under the per-connection rate limit
    await asyncio.wait_for(done.wait(), timeout=60)
    elapsed = time.perf_counter() - start

    ms = sorted(x * 1000 for x in latencies)
    q = statistics.quantiles(ms, n=100)
    print(f"{args.clients} clients on {len(args.bases)} instance(s), {args.messages} messages")
    print(f"deliveries: {len(ms)} in {elapsed:.1f}s")
    print(f"latency ms: p50 {q[49]:.1f}  p95 {q[94]:.1f}  p99 {q[98]:.1f}  max {ms[-1]:.1f}")

    for t in readers:
        t.cancel()
    for ws in sockets:
        await ws.close()


if __name__ == "__main__":
    asyncio.run(main())
