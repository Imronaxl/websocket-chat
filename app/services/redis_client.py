import redis.asyncio as redis
from typing import Optional
from app.config import settings


class RedisClient:
    def __init__(self):
        self._client: Optional[redis.Redis] = None

    async def connect(self):
        """Вызывается при старте приложения."""
        self._client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            decode_responses=True,
        )
        await self._client.ping()

    async def disconnect(self):
        if self._client:
            await self._client.close()

    @property
    def client(self) -> redis.Redis:
        if not self._client:
            raise RuntimeError("Redis client not connected")
        return self._client

    async def add_user_to_room_online(self, room_id: str, user_id: str):
        """Добавляет пользователя в множество онлайн-пользователей комнаты."""
        await self.client.sadd(f"room:{room_id}:online", user_id)

    async def remove_user_from_room_online(self, room_id: str, user_id: str):
        """Удаляет пользователя из множества онлайн-пользователей комнаты."""
        await self.client.srem(f"room:{room_id}:online", user_id)

    async def get_online_users_in_room(self, room_id: str) -> set:
        """Возвращает множество ID онлайн-пользователей в комнате."""
        return await self.client.smembers(f"room:{room_id}:online")


redis_client = RedisClient()
