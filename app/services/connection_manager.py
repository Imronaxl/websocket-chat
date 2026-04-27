import asyncio
import json
import logging
import time
from typing import Dict, Set, Optional
from fastapi import WebSocket
from redis.asyncio.client import PubSub

from app.config import settings
from app.services.redis_client import redis_client
from app.schemas.ws_message import (
    JoinRoomMessage,
    LeaveRoomMessage,
    ChatMessage,
    UserJoinedBroadcast,
    UserLeftBroadcast,
)
from app.services.message_repository import MessageRepository

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.room_connections: Dict[str, Set[WebSocket]] = {}
        self.connection_info: Dict[WebSocket, Dict[str, str]] = {}
        self.last_pong: Dict[WebSocket, float] = {}
        self.pubsub_listeners: Dict[WebSocket, asyncio.Task] = {}
        self.is_shutting_down: bool = False

    async def connect(self, websocket: WebSocket, user_id: str, username: str):
        await websocket.accept()

        self.connection_info[websocket] = {"user_id": user_id, "username": username}
        self.active_connections.add(websocket)
        self.last_pong[websocket] = time.time()

        listener_task = asyncio.create_task(self._listen_redis(websocket))
        self.pubsub_listeners[websocket] = listener_task

        logger.info("user_connected", user_id=user_id, username=username)

    async def disconnect(self, websocket: WebSocket):
        user_info = self.connection_info.pop(websocket, {})
        user_id = user_info.get("user_id")
        username = user_info.get("username")

        rooms_to_clean = []
        for room_id, connections in self.room_connections.items():
            if websocket in connections:
                connections.discard(websocket)
                rooms_to_clean.append(room_id)
                if user_id:
                    await redis_client.remove_user_from_room_online(room_id, user_id)

        for room_id in rooms_to_clean:
            if user_id and username:
                event = UserLeftBroadcast(
                    data={"user_id": user_id, "username": username, "room_id": room_id}
                )
                await redis_client.client.publish(f"room:{room_id}", event.model_dump_json())

        task = self.pubsub_listeners.pop(websocket, None)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        self.active_connections.discard(websocket)
        self.last_pong.pop(websocket, None)

        try:
            await websocket.close()
        except Exception:
            pass

        logger.info("user_disconnected", user_id=user_id, username=username)

    async def update_pong(self, websocket: WebSocket):
        self.last_pong[websocket] = time.time()

    async def cleanup_dead_connections(self):
        timeout = settings.WS_HEARTBEAT_INTERVAL * 2
        now = time.time()
        dead = [ws for ws, last in self.last_pong.items() if now - last > timeout]
        for ws in dead:
            client_host = getattr(getattr(ws, 'client', None), 'host', 'unknown')
            logger.info("closing_dead_connection", client_host=client_host)
            await self.disconnect(ws)

    async def handle_join_room(self, websocket: WebSocket, msg: JoinRoomMessage):
        room_id = msg.room_id
        user_info = self.connection_info[websocket]
        user_id = user_info["user_id"]
        username = user_info["username"]

        if room_id not in self.room_connections:
            self.room_connections[room_id] = set()
        self.room_connections[room_id].add(websocket)

        await redis_client.add_user_to_room_online(room_id, user_id)

        event = UserJoinedBroadcast(
            data={"user_id": user_id, "username": username, "room_id": room_id}
        )
        await redis_client.client.publish(f"room:{room_id}", event.model_dump_json())

        logger.debug("user_joined_room", username=username, room_id=room_id)

    async def handle_leave_room(self, websocket: WebSocket, msg: LeaveRoomMessage):
        room_id = msg.room_id
        user_info = self.connection_info[websocket]
        user_id = user_info["user_id"]
        username = user_info["username"]

        if room_id in self.room_connections:
            self.room_connections[room_id].discard(websocket)

        await redis_client.remove_user_from_room_online(room_id, user_id)

        event = UserLeftBroadcast(
            data={"user_id": user_id, "username": username, "room_id": room_id}
        )
        await redis_client.client.publish(f"room:{room_id}", event.model_dump_json())

        logger.debug("user_left_room", username=username, room_id=room_id)

    async def handle_chat_message(self, websocket: WebSocket, msg: ChatMessage):
        room_id = msg.room_id
        user_info = self.connection_info[websocket]
        user_id = user_info["user_id"]
        username = user_info["username"]

        if (
            room_id not in self.room_connections
            or websocket not in self.room_connections[room_id]
        ):
            await websocket.send_json(
                {"type": "error", "data": "You are not in this room"}
            )
            return

        await self._save_message_to_db(room_id, user_info, msg.content)

    async def _save_message_to_db(
        self, room_id: str, user_info: Dict[str, str], content: str
    ):
        from app.db.session import AsyncSessionLocal

        user_id = user_info["user_id"]
        username = user_info["username"]

        async with AsyncSessionLocal() as session:
            saved_message = await MessageRepository.save_message(
                session=session,
                room_id=room_id,
                user_id=user_id,
                username=username,
                content=content,
            )

            broadcast_message = {
                "type": "chat_message",
                "data": {
                    "room_id": room_id,
                    "user_id": user_id,
                    "username": username,
                    "content": content,
                    "timestamp": saved_message.created_at.isoformat(),
                    "message_id": saved_message.id,
                },
            }
            broadcast_json = json.dumps(broadcast_message)

            await redis_client.client.publish(f"room:{room_id}", broadcast_json)

    async def _listen_redis(self, websocket: WebSocket):
        pubsub: Optional[PubSub] = None
        try:
            pubsub = redis_client.client.pubsub()
            await pubsub.psubscribe("room:*")

            logger.debug("redis_listener_started", client=getattr(websocket, 'client', None))

            async for message in pubsub.listen():
                if message["type"] == "pmessage":
                    data = message["data"]
                    try:
                        await websocket.send_text(data)
                    except Exception as e:
                        logger.error("websocket_send_failed", error=str(e))
                        break
        except asyncio.CancelledError:
            logger.debug("redis_listener_cancelled")
        except Exception as e:
            logger.exception("redis_listener_error", error=str(e))
        finally:
            if pubsub:
                try:
                    await pubsub.punsubscribe("room:*")
                    await pubsub.close()
                except Exception:
                    pass


manager = ConnectionManager()
