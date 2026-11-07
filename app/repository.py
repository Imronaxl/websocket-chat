from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Message


class MessageRepository:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def add(self, room_id: str, user_id: str, username: str, content: str) -> Message:
        async with self._sessions() as session:
            message = Message(room_id=room_id, user_id=user_id, username=username, content=content)
            session.add(message)
            await session.commit()
            await session.refresh(message)
            return message

    async def history(self, room_id: str, limit: int, before_id: int | None = None) -> list[Message]:
        """Returns up to `limit` messages older than `before_id`, oldest first."""
        stmt = select(Message).where(Message.room_id == room_id)
        if before_id is not None:
            stmt = stmt.where(Message.id < before_id)
        stmt = stmt.order_by(Message.id.desc()).limit(limit)
        async with self._sessions() as session:
            rows = (await session.scalars(stmt)).all()
        return list(reversed(rows))
