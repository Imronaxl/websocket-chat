from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://chat:chat@localhost:5432/chat"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = Field(min_length=32)
    jwt_ttl_minutes: int = 12 * 60

    heartbeat_interval: float = 25.0
    max_connections_per_user: int = 5
    send_queue_size: int = 256
    messages_per_second: float = 5.0
    message_burst: int = 10

    cors_origins: list[str] = []
    log_json: bool = True
    # Tests and the demo can create tables directly; production uses Alembic.
    create_schema: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
