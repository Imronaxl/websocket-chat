"""WebSocket endpoint: authenticates the handshake, then dispatches client frames.

Protocol (JSON text frames):

  client -> server   {"type": "join",  "room_id": "general"}
                     {"type": "leave", "room_id": "general"}
                     {"type": "chat",  "room_id": "general", "content": "hi", "client_message_id": "c1"}
                     {"type": "pong"}

  server -> client   welcome, joined, message, user_joined, user_left, ping, error, server_shutdown
"""

import asyncio

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import TypeAdapter, ValidationError

from app import metrics
from app.config import Settings
from app.hub import Connection, Hub, TokenBucket
from app.schemas import ChatFrame, ClientFrame, JoinFrame, LeaveFrame
from app.security import verify_token

router = APIRouter()
log = structlog.get_logger(__name__)

_frames: TypeAdapter[ClientFrame] = TypeAdapter(ClientFrame)

CLOSE_UNAUTHORIZED = 4401
CLOSE_TOO_MANY_CONNECTIONS = 4429


@router.websocket("/api/v1/ws")
async def chat_socket(websocket: WebSocket, token: str = Query("")) -> None:
    settings: Settings = websocket.app.state.settings
    hub: Hub = websocket.app.state.hub

    # Browsers cannot set headers on a WebSocket handshake, so the token comes
    # in the query string. Closing before accept() rejects the handshake.
    user = verify_token(settings.jwt_secret, token)
    if user is None:
        metrics.connections_rejected.labels("unauthorized").inc()
        await websocket.close(code=CLOSE_UNAUTHORIZED, reason="invalid token")
        return
    if not hub.can_accept(user):
        metrics.connections_rejected.labels("too_many_connections").inc()
        await websocket.close(code=CLOSE_TOO_MANY_CONNECTIONS, reason="too many connections")
        return

    await websocket.accept()
    conn = Connection(
        user,
        send=websocket.send_text,
        close=lambda code, reason: websocket.close(code=code, reason=reason),
        queue_size=settings.send_queue_size,
        bucket=TokenBucket(settings.messages_per_second, settings.message_burst),
    )
    hub.register(conn)
    writer = asyncio.create_task(conn.run_writer())
    log.info("ws_connected", user_id=user.id)

    conn.send_json(
        {
            "type": "welcome",
            "user_id": user.id,
            "username": user.name,
            "heartbeat_interval": settings.heartbeat_interval,
        }
    )
    try:
        while True:
            raw = await websocket.receive_text()
            conn.touch()
            try:
                frame = _frames.validate_json(raw)
            except ValidationError as exc:
                conn.error("invalid_frame", _describe(exc))
                continue
            metrics.frames_received.labels(frame.type).inc()

            if isinstance(frame, JoinFrame):
                await hub.join(conn, frame.room_id)
            elif isinstance(frame, LeaveFrame):
                await hub.leave(conn, frame.room_id)
            elif isinstance(frame, ChatFrame):
                try:
                    await hub.chat(conn, frame.room_id, frame.content, frame.client_message_id)
                except Exception:
                    log.exception("chat_failed", user_id=user.id, room_id=frame.room_id)
                    conn.error("internal", "Message could not be delivered")
            # pong frames only refresh last_seen
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        writer.cancel()
        await hub.unregister(conn)
        log.info("ws_disconnected", user_id=user.id)


def _describe(exc: ValidationError) -> str:
    err = exc.errors()[0]
    if err["type"] == "json_invalid":
        return "Frame is not valid JSON"
    loc = ".".join(str(p) for p in err["loc"] if not isinstance(p, int))
    return f"{loc}: {err['msg']}" if loc else err["msg"]
