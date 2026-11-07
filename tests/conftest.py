import json
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import fakeredis
import pytest
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketTestSession

from app.config import Settings
from app.main import create_app

SECRET = "test-secret-0123456789-0123456789-abc"


@pytest.fixture
def redis_server() -> fakeredis.FakeServer:
    return fakeredis.FakeServer()


@pytest.fixture
def make_settings(tmp_path: Path) -> Callable[..., Settings]:
    def make(**overrides: Any) -> Settings:
        values: dict[str, Any] = {
            "database_url": f"sqlite+aiosqlite:///{tmp_path / 'chat.db'}",
            "jwt_secret": SECRET,
            "create_schema": True,
            "log_json": False,
            "heartbeat_interval": 30,
        }
        values.update(overrides)
        return Settings(**values)

    return make


@pytest.fixture
def make_client(
    make_settings: Callable[..., Settings], redis_server: fakeredis.FakeServer
) -> Iterator[Callable[..., TestClient]]:
    """Starts app instances that share one database and one Redis server,
    like several replicas behind a load balancer."""
    clients: list[TestClient] = []

    def make(**overrides: Any) -> TestClient:
        app = create_app(
            make_settings(**overrides),
            redis_factory=lambda: fakeredis.FakeAsyncRedis(server=redis_server, decode_responses=True),
        )
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        return client

    yield make
    for c in reversed(clients):
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


def login(client: TestClient, username: str) -> dict[str, Any]:
    resp = client.post("/api/v1/auth/guest", json={"username": username})
    assert resp.status_code == 200, resp.text
    return resp.json()  # type: ignore[no-any-return]


def auth_headers(token: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {token['access_token']}"}


def receive_until(
    ws: WebSocketTestSession,
    type_: str,
    where: Callable[[dict[str, Any]], bool] = lambda _: True,
    limit: int = 20,
) -> dict[str, Any]:
    """Reads frames until one of the given type (matching `where`) arrives."""
    seen = []
    for _ in range(limit):
        frame = json.loads(ws.receive_text())
        if frame["type"] == type_ and where(frame):
            return frame  # type: ignore[no-any-return]
        seen.append(frame["type"])
    raise AssertionError(f"no {type_!r} frame, got {seen}")
