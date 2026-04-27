FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .

RUN pip install --no-cache-dir \
    fastapi[all] \
    uvicorn[standard] \
    redis[hiredis] \
    asyncpg \
    sqlalchemy \
    alembic \
    pydantic-settings \
    python-dotenv \
    prometheus-client \
    python-jose[cryptography] \
    structlog

COPY ./app ./app
COPY ./migrations ./migrations
COPY ./alembic.ini ./alembic.ini

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]