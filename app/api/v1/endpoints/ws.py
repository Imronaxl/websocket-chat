from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.services.connection_manager import manager
from app.schemas.ws_message import (
    JoinRoomMessage,
    LeaveRoomMessage,
    ChatMessage,
)
from app.config import settings
import asyncio
import json

router = APIRouter()


async def heartbeat_sender(websocket: WebSocket):
    while True:
        await asyncio.sleep(settings.WS_HEARTBEAT_INTERVAL)
        if manager.is_shutting_down:
            break
        try:
            await websocket.send_json({"type": "ping"})
        except Exception:
            break


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str = Query(..., description="User ID"),
    username: str = Query(..., description="Username"),
):
    await manager.connect(websocket, user_id=user_id, username=username)

    heartbeat_task = asyncio.create_task(heartbeat_sender(websocket))

    try:
        while True:
            data = await websocket.receive_text()

            try:
                raw_message = json.loads(data)
                msg_type = raw_message.get("type")
            except json.JSONDecodeError:
                await websocket.send_text("Error: Invalid JSON")
                continue

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "pong":
                await manager.update_pong(websocket)
            elif msg_type == "join":
                try:
                    join_msg = JoinRoomMessage(**raw_message)
                except Exception as e:
                    await websocket.send_json(
                        {"type": "error", "data": f"Invalid join message: {e}"}
                    )
                    continue
                await manager.handle_join_room(websocket, join_msg)
            elif msg_type == "leave":
                try:
                    leave_msg = LeaveRoomMessage(**raw_message)
                except Exception as e:
                    await websocket.send_json(
                        {"type": "error", "data": f"Invalid leave message: {e}"}
                    )
                    continue
                await manager.handle_leave_room(websocket, leave_msg)
            elif msg_type == "chat":
                try:
                    chat_msg = ChatMessage(**raw_message)
                except Exception as e:
                    await websocket.send_json(
                        {"type": "error", "data": f"Invalid chat message: {e}"}
                    )
                    continue
                await manager.handle_chat_message(websocket, chat_msg)
            else:
                await websocket.send_json(
                    {"type": "error", "data": f"Unknown message type: {msg_type}"}
                )

    except WebSocketDisconnect:
        pass

    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await manager.disconnect(websocket)
