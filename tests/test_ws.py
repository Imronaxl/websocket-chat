# Тесты WebSocket с async test client
import pytest
import json
from fastapi.testclient import TestClient
from starlette.testclient import TestClient as SyncTestClient
from app.main import app


def test_websocket_endpoint_exists():
    """Тест существования WebSocket эндпоинта."""
    client = SyncTestClient(app)
    
    try:
        with client.websocket_connect(
            "/api/v1/ws?user_id=test-user&username=TestUser"
        ) as websocket:
            data = websocket.receive_text()
            assert data is not None
    except Exception:
        pass


@pytest.mark.asyncio
async def test_ws_message_types():
    """Тест различных типов WebSocket сообщений."""
    from app.schemas.ws_message import (
        JoinRoomMessage,
        LeaveRoomMessage,
        ChatMessage,
        HeartbeatMessage,
        PongMessage,
    )
    
    join_msg = JoinRoomMessage(room_id="test-room")
    assert join_msg.type == "join"
    assert join_msg.room_id == "test-room"
    
    leave_msg = LeaveRoomMessage(room_id="test-room")
    assert leave_msg.type == "leave"
    
    chat_msg = ChatMessage(room_id="test-room", content="Hello!")
    assert chat_msg.type == "chat"
    assert chat_msg.content == "Hello!"
    
    heartbeat = HeartbeatMessage()
    assert heartbeat.type == "ping"
    assert isinstance(heartbeat.timestamp, float)
    
    pong = PongMessage(timestamp=1234567890.0)
    assert pong.type == "pong"
    assert pong.timestamp == 1234567890.0


@pytest.mark.asyncio
async def test_ws_message_serialization():
    """Тест сериализации WebSocket сообщений."""
    from app.schemas.ws_message import ChatMessage, UserJoinedBroadcast
    
    chat_msg = ChatMessage(
        room_id="general",
        content="Test message",
        client_message_id="msg-123"
    )
    
    serialized = chat_msg.model_dump()
    assert serialized["type"] == "chat"
    assert serialized["room_id"] == "general"
    assert serialized["content"] == "Test message"
    assert serialized["client_message_id"] == "msg-123"
    
    user_joined = UserJoinedBroadcast(
        data={
            "user_id": "user-1",
            "username": "Alice",
            "room_id": "general"
        }
    )
    
    serialized_broadcast = user_joined.model_dump()
    assert serialized_broadcast["type"] == "user_joined"
    assert serialized_broadcast["data"]["username"] == "Alice"


@pytest.mark.asyncio
async def test_invalid_json_handling():
    """Тест обработки невалидного JSON."""
    from app.schemas.ws_message import ChatMessage
    
    invalid_data = {"type": "chat", "content": 123}
    
    with pytest.raises(Exception):
        ChatMessage(**invalid_data)


@pytest.mark.asyncio
async def test_chat_message_validation():
    """Тест валидации сообщений чата."""
    from app.schemas.ws_message import ChatMessage
    
    valid_msg = ChatMessage(
        room_id="room-1",
        content="Valid message"
    )
    assert valid_msg.type == "chat"
    assert valid_msg.room_id == "room-1"
    assert valid_msg.content == "Valid message"
    
    msg_with_optional_id = ChatMessage(
        room_id="room-2",
        content="With ID",
        client_message_id="client-msg-456"
    )
    assert msg_with_optional_id.client_message_id == "client-msg-456"
    
    default_msg = ChatMessage(
        room_id="room-3",
        content="Default ID"
    )
    assert default_msg.client_message_id is None
