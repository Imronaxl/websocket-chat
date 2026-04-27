# Тесты REST API
import pytest
from datetime import datetime
from httpx import AsyncClient

from app.models.message import Message


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """Тест кореневого эндпоинта."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "WebSocket Chat API" in data["message"]
    assert "version" in data


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Тест эндпоинта health check."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_metrics_endpoint(client: AsyncClient):
    """Тест эндпоинта метрик Prometheus."""
    response = await client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]


@pytest.mark.asyncio
async def test_get_room_messages_empty(client: AsyncClient, mock_redis):
    """Тест получения сообщений из пустой комнаты."""
    room_id = "test-room"
    response = await client.get(f"/api/v1/rooms/{room_id}/messages")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_room_messages_with_data(
    client: AsyncClient, 
    test_session,
    mock_redis
):
    """Тест получения сообщений с данными в БД."""
    from sqlalchemy import func
    
    room_id = "test-room"
    
    message1 = Message(
        room_id=room_id,
        user_id="user-1",
        username="Alice",
        content="Hello, World!",
        created_at=datetime(2024, 1, 15, 10, 30, 0)
    )
    message2 = Message(
        room_id=room_id,
        user_id="user-2",
        username="Bob",
        content="Hi there!",
        created_at=datetime(2024, 1, 15, 10, 31, 0)
    )
    
    test_session.add(message1)
    test_session.add(message2)
    await test_session.commit()
    
    response = await client.get(f"/api/v1/rooms/{room_id}/messages?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["content"] == "Hello, World!"
    assert data[1]["content"] == "Hi there!"
    assert data[0]["username"] == "Alice"
    assert data[1]["username"] == "Bob"


@pytest.mark.asyncio
async def test_get_online_users_empty(client: AsyncClient):
    """Тест получения списка онлайн-пользователей (пустая комната)."""
    room_id = "empty-room"
    response = await client.get(f"/api/v1/rooms/{room_id}/users")
    assert response.status_code == 200
    data = response.json()
    assert data["room_id"] == room_id
    assert data["online_users"] == []


@pytest.mark.asyncio
async def test_get_room_messages_limit(client: AsyncClient, test_session, mock_redis):
    """Тест ограничения количества возвращаемых сообщений."""
    room_id = "test-room-limit"
    
    for i in range(10):
        msg = Message(
            room_id=room_id,
            user_id=f"user-{i}",
            username=f"User{i}",
            content=f"Message {i}",
            created_at=datetime(2024, 1, 15, 10, 0, i)
        )
        test_session.add(msg)
    await test_session.commit()
    
    response = await client.get(f"/api/v1/rooms/{room_id}/messages?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5


@pytest.mark.asyncio
async def test_message_response_schema(client: AsyncClient, test_session, mock_redis):
    """Тест соответствия схемы ответа ожидаемому формату."""
    room_id = "schema-test-room"
    
    msg = Message(
        room_id=room_id,
        user_id="test-user",
        username="TestUser",
        content="Test content",
        created_at=datetime(2024, 1, 15, 12, 0, 0)
    )
    test_session.add(msg)
    await test_session.commit()
    
    response = await client.get(f"/api/v1/rooms/{room_id}/messages")
    assert response.status_code == 200
    data = response.json()
    
    assert len(data) == 1
    message = data[0]
    
    assert "id" in message
    assert isinstance(message["id"], int)
    assert message["room_id"] == room_id
    assert message["user_id"] == "test-user"
    assert message["username"] == "TestUser"
    assert message["content"] == "Test content"
    assert "created_at" in message
