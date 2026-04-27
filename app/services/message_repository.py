from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from app.models.message import Message


class MessageRepository:
    @staticmethod
    async def save_message(
        session: AsyncSession,
        room_id: str,
        user_id: str,
        username: str,
        content: str,
    ) -> Message:
        message = Message(
            room_id=room_id, user_id=user_id, username=username, content=content
        )
        session.add(message)
        await session.commit()
        await session.refresh(message)
        return message

    @staticmethod
    async def get_messages_by_room(
        session: AsyncSession,
        room_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Message]:
        stmt = (
            select(Message)
            .where(Message.room_id == room_id)
            .order_by(desc(Message.created_at))
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(stmt)
        messages = result.scalars().all()
        return list(reversed(messages))
