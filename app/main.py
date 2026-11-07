from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import metrics
from app.api import rest, ws
from app.config import Settings, get_settings
from app.hub import Hub
from app.logs import configure_logging
from app.models import Base
from app.repository import MessageRepository

log = structlog.get_logger(__name__)


def create_app(
    settings: Settings | None = None,
    redis_factory: Callable[[], Redis] | None = None,
) -> FastAPI:
    """Builds the application. Tests pass their own settings and a fake Redis."""
    settings = settings or get_settings()
    configure_logging(settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_async_engine(settings.database_url, pool_pre_ping=True)
        if settings.create_schema:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

        redis = redis_factory() if redis_factory else Redis.from_url(settings.redis_url, decode_responses=True)
        await redis.ping()

        repository = MessageRepository(async_sessionmaker(engine, expire_on_commit=False))
        hub = Hub(redis, repository, settings.heartbeat_interval, settings.max_connections_per_user)
        await hub.start()

        app.state.settings = settings
        app.state.engine = engine
        app.state.redis = redis
        app.state.repository = repository
        app.state.hub = hub
        log.info("startup_complete")
        try:
            yield
        finally:
            await hub.stop()
            await redis.aclose()
            await engine.dispose()
            log.info("shutdown_complete")

    app = FastAPI(title="WebSocket Chat", version="1.0.0", lifespan=lifespan)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )
    app.include_router(rest.router)
    app.include_router(ws.router)

    @app.get("/health", tags=["ops"])
    async def health() -> dict[str, str]:
        """Liveness: the process is serving requests."""
        return {"status": "ok"}

    @app.get("/ready", tags=["ops"])
    async def ready() -> JSONResponse:
        """Readiness: Postgres and Redis are reachable."""
        checks: dict[str, str] = {}
        try:
            async with app.state.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception as exc:
            checks["database"] = f"error: {type(exc).__name__}"
        try:
            await app.state.redis.ping()
            checks["redis"] = "ok"
        except Exception as exc:
            checks["redis"] = f"error: {type(exc).__name__}"
        healthy = all(v == "ok" for v in checks.values())
        return JSONResponse(checks, status_code=200 if healthy else 503)

    @app.get("/metrics", tags=["ops"])
    async def prometheus_metrics() -> Response:
        return Response(generate_latest(metrics.registry), media_type=CONTENT_TYPE_LATEST)

    return app
