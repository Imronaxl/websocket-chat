import json
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tests.conftest import auth_headers, login, receive_until


def connect(client: TestClient, token: dict):  # type: ignore[no-untyped-def,type-arg]
    return client.websocket_connect(f"/api/v1/ws?token={token['access_token']}")


def test_handshake_requires_valid_token(client: TestClient) -> None:
    for url in ["/api/v1/ws", "/api/v1/ws?token=garbage"]:
        with pytest.raises(WebSocketDisconnect) as exc, client.websocket_connect(url) as ws:
            ws.receive_text()
        assert exc.value.code == 4401


def test_welcome_uses_identity_from_token(client: TestClient) -> None:
    token = login(client, "alice")
    with connect(client, token) as ws:
        welcome = json.loads(ws.receive_text())
    assert welcome["type"] == "welcome"
    assert (welcome["user_id"], welcome["username"]) == (token["user_id"], "alice")


def test_message_reaches_room_members_only(client: TestClient) -> None:
    alice, bob, carol = (login(client, n) for n in ("alice", "bob", "carol"))

    with connect(client, alice) as a, connect(client, bob) as b, connect(client, carol) as c:
        a.send_json({"type": "join", "room_id": "general"})
        receive_until(a, "joined")
        b.send_json({"type": "join", "room_id": "general"})
        receive_until(b, "joined")
        c.send_json({"type": "join", "room_id": "random"})
        receive_until(c, "joined")

        a.send_json({"type": "chat", "room_id": "general", "content": " hello ", "client_message_id": "c-1"})

        for ws in (a, b):
            event = receive_until(ws, "message")
            assert event["client_message_id"] == "c-1"
            assert event["message"]["content"] == "hello"
            assert event["message"]["user_id"] == alice["user_id"]

        # carol is only in "random": the next frame she sees must not be alice's message
        c.send_json({"type": "chat", "room_id": "random", "content": "anyone?"})
        assert receive_until(c, "message")["message"]["content"] == "anyone?"


def test_presence_counts_tabs(client: TestClient) -> None:
    alice, bob = login(client, "alice"), login(client, "bob")
    headers = auth_headers(bob)

    def online() -> list[str]:
        return [u["username"] for u in client.get("/api/v1/rooms/general/users", headers=headers).json()]

    with connect(client, bob) as watcher:
        watcher.send_json({"type": "join", "room_id": "general"})
        receive_until(watcher, "joined")

        with connect(client, alice) as tab1:
            tab1.send_json({"type": "join", "room_id": "general"})
            joined = receive_until(tab1, "joined")
            assert sorted(u["username"] for u in joined["users"]) == ["alice", "bob"]
            receive_until(watcher, "user_joined", where=lambda f: f["user"]["username"] == "alice")

            with connect(client, alice) as tab2:
                tab2.send_json({"type": "join", "room_id": "general"})
                receive_until(tab2, "joined")
            # closing one of two tabs keeps alice online
            assert online() == ["alice", "bob"]

        receive_until(watcher, "user_left", where=lambda f: f["user"]["username"] == "alice")
        assert online() == ["bob"]


def test_protocol_errors(client: TestClient) -> None:
    with connect(client, login(client, "alice")) as ws:
        receive_until(ws, "welcome")
        cases = [
            ("not json", "invalid_frame"),
            ('{"type": "dance"}', "invalid_frame"),
            ('{"type": "join", "room_id": "has spaces"}', "invalid_frame"),
            ('{"type": "chat", "room_id": "general", "content": "   "}', "invalid_frame"),
            ('{"type": "chat", "room_id": "general", "content": "' + "x" * 4001 + '"}', "invalid_frame"),
            ('{"type": "chat", "room_id": "general", "content": "hi"}', "not_in_room"),
        ]
        for raw, code in cases:
            ws.send_text(raw)
            assert receive_until(ws, "error")["code"] == code, raw


def test_rate_limit(make_client: Callable[..., TestClient]) -> None:
    client = make_client(messages_per_second=0.001, message_burst=2)
    with connect(client, login(client, "alice")) as ws:
        ws.send_json({"type": "join", "room_id": "general"})
        receive_until(ws, "joined")
        for _ in range(2):
            ws.send_json({"type": "chat", "room_id": "general", "content": "hi"})
            receive_until(ws, "message")
        ws.send_json({"type": "chat", "room_id": "general", "content": "hi"})
        assert receive_until(ws, "error")["code"] == "rate_limited"


def test_connection_limit_per_user(make_client: Callable[..., TestClient]) -> None:
    client = make_client(max_connections_per_user=1)
    token = login(client, "alice")
    with connect(client, token) as first:
        receive_until(first, "welcome")
        with pytest.raises(WebSocketDisconnect) as exc, connect(client, token) as second:
            second.receive_text()
        assert exc.value.code == 4429


def test_messages_cross_instances(make_client: Callable[..., TestClient]) -> None:
    """Two app instances sharing Redis behave like one chat server."""
    node_a, node_b = make_client(), make_client()
    alice, bob = login(node_a, "alice"), login(node_b, "bob")

    with connect(node_a, alice) as a, connect(node_b, bob) as b:
        a.send_json({"type": "join", "room_id": "general"})
        receive_until(a, "joined")
        b.send_json({"type": "join", "room_id": "general"})
        receive_until(b, "joined")
        receive_until(a, "user_joined", where=lambda f: f["user"]["username"] == "bob")

        b.send_json({"type": "chat", "room_id": "general", "content": "from node b"})
        assert receive_until(a, "message")["message"]["content"] == "from node b"
