# Зависимости (сессия БД, текущий пользователь)
from typing import Optional, Generator
from fastapi import Depends, WebSocket, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.services.auth import verify_token


async def get_current_user_from_ws(
    websocket: WebSocket, token: Optional[str] = None
) -> dict:
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        raise Exception("Missing token")

    payload = verify_token(token)
    if not payload:
        await websocket.close(code=4002, reason="Invalid token")
        raise Exception("Invalid token")

    return payload


def get_current_user_rest(token: str = Depends()) -> dict:
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload