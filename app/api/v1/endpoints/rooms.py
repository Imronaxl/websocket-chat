# REST: список комнат, участники
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db.session import get_session
from app.services.message_repository import MessageRepository
from app.services.redis_client import redis_client
from app.schemas.rest import MessageResponse, RoomUsersResponse

router = APIRouter()


@router.get("/rooms/{room_id}/messages", response_model=List[MessageResponse])
async def get_room_messages(
    room_id: str,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    messages = await MessageRepository.get_messages_by_room(
        session=session, room_id=room_id, limit=limit
    )
    return messages


@router.get("/rooms/{room_id}/users", response_model=RoomUsersResponse)
async def get_online_users(room_id: str):
    users = await redis_client.get_online_users_in_room(room_id)
    if not users:
        return RoomUsersResponse(room_id=room_id, online_users=[])
    return RoomUsersResponse(room_id=room_id, online_users=list(users))
