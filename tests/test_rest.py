from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from app.security import issue_token, verify_token
from tests.conftest import SECRET, auth_headers, login, receive_until


def test_health_and_ready(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/ready").json() == {"database": "ok", "redis": "ok"}


def test_guest_login_issues_verifiable_token(client: TestClient) -> None:
    token = login(client, "  Alice  ")
    assert token["username"] == "Alice"

    user = verify_token(SECRET, token["access_token"])
    assert user is not None
    assert (user.id, user.name) == (token["user_id"], "Alice")


def test_guest_login_validates_username(client: TestClient) -> None:
    for bad in ["", "   ", "x" * 33, "<script>"]:
        assert client.post("/api/v1/auth/guest", json={"username": bad}).status_code == 422


def test_rejected_tokens() -> None:
    token, _, _ = issue_token(SECRET, "bob", timedelta(minutes=5))
    expired, _, _ = issue_token(SECRET, "bob", timedelta(minutes=-1))
    forged, _, _ = issue_token("another-secret-0123456789-0123456789", "bob", timedelta(minutes=5))
    unsigned = jwt.encode(
        {"sub": "x", "name": "bob", "exp": datetime.now(UTC) + timedelta(minutes=5)}, key=None, algorithm="none"
    )

    assert verify_token(SECRET, token) is not None
    for bad in [expired, forged, unsigned, "garbage"]:
        assert verify_token(SECRET, bad) is None


def test_history_requires_auth(client: TestClient) -> None:
    assert client.get("/api/v1/rooms/general/messages").status_code == 401
    assert client.get("/api/v1/rooms/general/users").status_code == 401


def test_invalid_room_id(client: TestClient) -> None:
    headers = auth_headers(login(client, "alice"))
    assert client.get("/api/v1/rooms/bad room!/messages", headers=headers).status_code == 422


def test_history_pagination(client: TestClient) -> None:
    token = login(client, "alice")
    headers = auth_headers(token)

    with client.websocket_connect(f"/api/v1/ws?token={token['access_token']}") as ws:
        ws.send_json({"type": "join", "room_id": "general"})
        receive_until(ws, "joined")
        for i in range(5):
            ws.send_json({"type": "chat", "room_id": "general", "content": f"msg {i}"})
            receive_until(ws, "message")

    newest = client.get("/api/v1/rooms/general/messages?limit=3", headers=headers).json()
    assert [m["content"] for m in newest] == ["msg 2", "msg 3", "msg 4"]

    older = client.get(f"/api/v1/rooms/general/messages?limit=3&before_id={newest[0]['id']}", headers=headers).json()
    assert [m["content"] for m in older] == ["msg 0", "msg 1"]

    assert client.get("/api/v1/rooms/general/messages?limit=500", headers=headers).status_code == 422


def test_metrics_endpoint(client: TestClient) -> None:
    body = client.get("/metrics").text
    assert "chat_ws_connections_active" in body
    assert "chat_message_handling_seconds" in body
