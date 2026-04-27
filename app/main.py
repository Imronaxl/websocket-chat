# app/main.py
import asyncio
import signal
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, status
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.redis_client import redis_client
from app.services.connection_manager import manager
from app.api.v1.router import router as v1_router
from app.db.session import engine
from app.core.metrics import init_metrics, get_metrics
from app.core.logger import get_logger

logger = get_logger(__name__)

init_metrics()


async def shutdown_handler():
    logger.info("shutdown_signal_received")
    manager.is_shutting_down = True

    for connection in list(manager.active_connections):
        try:
            await manager.send_personal_message({"type": "server_shutdown"}, connection)
        except Exception:
            pass

    await asyncio.sleep(2)


def setup_signal_handlers():
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(shutdown_handler()))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("application_startup")

    await redis_client.connect()
    logger.info("redis_connected")

    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda _: logger.info("database_connected"))
    except Exception as e:
        logger.error("database_connection_failed", error=str(e))

    setup_signal_handlers()

    yield

    logger.info("application_shutdown")

    await redis_client.disconnect()
    logger.info("redis_disconnected")

    await engine.dispose()
    logger.info("database_pool_disposed")


app = FastAPI(
    title=settings.PROJECT_NAME,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.include_router(v1_router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "WebSocket Chat API is running", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/metrics")
async def metrics():
    return get_metrics()
