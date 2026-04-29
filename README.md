# WebSocket Chat API

Асинхронный чат на FastAPI с поддержкой WebSocket, Redis Pub/Sub для масштабирования и PostgreSQL для хранения истории сообщений.

## Стек технологий

- **FastAPI** — современный асинхронный фреймворк
- **WebSocket** — реальное время для сообщений
- **Redis Pub/Sub** — распределённая передача сообщений между инстансами
- **PostgreSQL + asyncpg** — асинхронное хранение данных
- **SQLAlchemy 2.0** — ORM с async поддержкой
- **Alembic** — миграции БД
- **Pydantic v2** — валидация данных
- **structlog** — структурированное логирование
- **Prometheus** — метрики
- **Docker & Docker Compose** — контейнеризация

## Структура проекта

```
├── app/
│   ├── api/
│   │   ├── deps.py          # Зависимости FastAPI
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── rooms.py # REST: комнаты и участники
│   │       │   └── ws.py    # WebSocket эндпоинт
│   │       └── router.py    # Роутер v1
│   ├── core/
│   │   ├── exceptions.py    # Кастомные исключения
│   │   ├── logger.py        # Настройка structlog
│   │   └── metrics.py       # Prometheus метрики
│   ├── db/
│   │   ├── base.py          # Base модель SQLAlchemy
│   │   └── session.py       # Асинхронная сессия
│   ├── models/
│   │   ├── message.py       # Модель сообщения
│   │   └── user.py          # Модель пользователя
│   ├── schemas/
│   │   ├── rest.py          # Pydantic схемы для REST
│   │   └── ws_message.py    # Схемы WebSocket сообщений
│   ├── services/
│   │   ├── auth.py          # JWT утилиты
│   │   ├── connection_manager.py # Управление WS соединениями
│   │   ├── message_repository.py # Репозиторий сообщений
│   │   └── redis_client.py  # Redis клиент
│   ├── config.py            # Настройки приложения
│   └── main.py              # Точка входа
├── docker/
│   ├── Dockerfile
│   └── nginx.conf
├── migrations/              # Alembic миграции
├── tests/                   # Тесты
├── docker-compose.yml
├── Makefile
└── pyproject.toml
```

## Быстрый старт

### Через Docker Compose (рекомендуется)

```bash
docker-compose up -d
```

Сервисы будут доступны:
- API: http://localhost:8000
- Документация: http://localhost:8000/docs
- Health: http://localhost:8000/health
- Metrics: http://localhost:8000/metrics

### Локальная разработка

```bash
# Установка зависимостей
pip install -e ".[dev]"

# Запуск PostgreSQL и Redis
docker-compose up -d postgres redis

# Применение миграций
alembic upgrade head

# Запуск сервера
make run
```

## Использование WebSocket

### Подключение

```
ws://localhost:8000/api/v1/ws?user_id=123&username=testuser
```

### Формат сообщений

**Join room:**
```json
{
  "type": "join",
  "room_id": "general"
}
```

**Отправка сообщения:**
```json
{
  "type": "chat",
  "room_id": "general",
  "content": "Привет, мир!"
}
```

**Leave room:**
```json
{
  "type": "leave",
  "room_id": "general"
}
```

**Heartbeat:**
```json
{
  "type": "ping"
}
```

### Ответы сервера

**Сообщение чата:**
```json
{
  "type": "chat_message",
  "data": {
    "room_id": "general",
    "user_id": "123",
    "username": "testuser",
    "content": "Привет, мир!",
    "timestamp": "2024-01-15T10:30:00",
    "message_id": 1
  }
}
```

**Пользователь присоединился:**
```json
{
  "type": "user_joined",
  "data": {
    "user_id": "123",
    "username": "testuser",
    "room_id": "general"
  }
}
```

**Пользователь покинул:**
```json
{
  "type": "user_left",
  "data": {
    "user_id": "123",
    "username": "testuser",
    "room_id": "general"
  }
}
```

## REST API

### Получить историю сообщений

```bash
GET /api/v1/rooms/{room_id}/messages?limit=50
```

### Получить онлайн-пользователей

```bash
GET /api/v1/rooms/{room_id}/users
```

## Метрики

Приложение экспортирует метрики Prometheus:

- `websocket_connections_active` — количество активных соединений
- `websocket_messages_total` — общее количество обработанных сообщений

```bash
curl http://localhost:8000/metrics
```

## Тесты

```bash
make test
```

## Линтинг и форматирование

```bash
make lint
make format
```

## Конфигурация

Переменные окружения (или файл `.env`):

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| POSTGRES_HOST | localhost | Хост PostgreSQL |
| POSTGRES_PORT | 5432 | Порт PostgreSQL |
| POSTGRES_USER | postgres | Пользователь БД |
| POSTGRES_PASSWORD | postgres | Пароль БД |
| POSTGRES_DB | chat_db | Имя БД |
| REDIS_HOST | localhost | Хост Redis |
| REDIS_PORT | 6379 | Порт Redis |
| JWT_SECRET_KEY | - | Секретный ключ JWT |
| DEBUG | false | Режим отладки |
