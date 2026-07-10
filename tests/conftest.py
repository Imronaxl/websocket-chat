import asyncio

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.main import app
from app.services.redis_client import redis_client


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="function")
def test_event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
def test_engine(test_event_loop):
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
    )

    async def create_schema():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    test_event_loop.run_until_complete(create_schema())
    yield engine

    async def drop_schema():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()

    test_event_loop.run_until_complete(drop_schema())


@pytest.fixture(scope="function")
def test_session(test_engine, test_event_loop):
    async_session_maker = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    session = async_session_maker()
    yield session

    async def close_session():
        await session.close()

    test_event_loop.run_until_complete(close_session())


@pytest.fixture(scope="function")
def client(test_session, test_event_loop):
    async def override_get_session():
        yield test_session

    from app.db.session import get_session as get_session_dep

    app.dependency_overrides[get_session_dep] = override_get_session

    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    yield client

    app.dependency_overrides.pop(get_session_dep, None)
    test_event_loop.run_until_complete(client.aclose())


@pytest.fixture(scope="function")
def mock_redis():
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
