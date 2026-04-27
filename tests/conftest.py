# Фикстуры для pytest (тестовая БД, клиент)
import asyncio
import pytest
from typing import AsyncGenerator, Generator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from app.main import app
from app.config import settings
from app.db.base import Base
from app.services.redis_client import redis_client


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Создает цикл событий для асинхронных тестов."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def test_engine():
    """Создает тестовый движок SQLAlchemy с SQLite in-memory."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="function")
async def test_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Создает тестовую сессию SQLAlchemy."""
    async_session_maker = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session_maker() as session:
        yield session


@pytest.fixture(scope="function")
async def client(test_session) -> AsyncGenerator[AsyncClient, None]:
    """Создает асинхронный HTTP клиент для тестирования API."""
    
    async def override_get_session():
        yield test_session
    
    app.dependency_overrides = {}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    
    app.dependency_overrides = {}


@pytest.fixture(scope="function")
async def mock_redis() -> None:
    """Фикстура для мока Redis (заглушка)."""
    original_client = redis_client._client
    
    class MockRedis:
        async def ping(self):
            return True
        
        async def close(self):
            pass
        
        async def sadd(self, key, *values):
            return len(values)
        
        async def srem(self, key, *values):
            return len(values)
        
        async def smembers(self, key):
            return set()
        
        async def publish(self, channel, message):
            return 1
        
        def pubsub(self):
            return MockPubSub()
    
    class MockPubSub:
        async def psubscribe(self, pattern):
            pass
        
        async def punsubscribe(self, pattern):
            pass
        
        async def close(self):
            pass
        
        async def listen(self):
            if False:
                yield
    
    redis_client._client = MockRedis()
    yield
    redis_client._client = original_client
