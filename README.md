# WebSocket Chat API

[![Backend CI](https://github.com/imronaxl/websocket-chat/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/imronaxl/websocket-chat/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/imronaxl/websocket-chat/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/imronaxl/websocket-chat/actions/workflows/frontend-ci.yml)

Асинхронный чат на FastAPI с поддержкой WebSocket, Redis Pub/Sub для
масштабирования и PostgreSQL для хранения истории сообщений. Включает
фронтенд на Next.js 16 + TypeScript.

## Скриншоты

| Login | Chat — connected |
|:---:|:---:|
| ![Login](docs/screenshots/01-login.png) | ![Chat joined](docs/screenshots/02-chat-joined.png) |

| Chat with messages | "How this works" modal |
|:---:|:---:|
| ![Chat with messages](docs/screenshots/03-chat-with-messages.png) | ![Info dialog](docs/screenshots/04-info-dialog.png) |

| Light theme | Mobile |
|:---:|:---:|
| ![Light theme](docs/screenshots/05-light-theme.png) | ![Mobile](docs/screenshots/06-mobile.png) |

Полная галерея — в [`docs/screenshots/`](docs/screenshots/).

## Стек технологий

**Backend:**
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

**Frontend:**
- **Next.js 16** (App Router) + **React 19**
- **TypeScript 5** strict mode
- **Tailwind CSS 4** + **shadcn/ui** (New York style)
- **next-themes** — тёмная/светлая тема
- **lucide-react** — иконки
- Plain **WebSocket** (без Socket.io) — соответствует бэкенду

## Структура проекта

```
├── app/                            # FastAPI бэкенд
│   ├── api/
│   │   ├── deps.py                 # Зависимости FastAPI
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── rooms.py        # REST: комнаты и участники
│   │       │   └── ws.py           # WebSocket эндпоинт
│   │       └── router.py           # Роутер v1
│   ├── core/                       # exceptions, logger, metrics
│   ├── db/                         # Base модель + асинхронная сессия
│   ├── models/                     # Message, User
│   ├── schemas/                    # Pydantic-схемы (REST + WS)
│   ├── services/                   # auth, connection_manager, redis, repository
│   ├── config.py
│   └── main.py
├── frontend/                       # Next.js 16 + TypeScript фронтенд
│   ├── src/
│   │   ├── app/                    # App Router (layout, page, globals.css)
│   │   │   └── api/v1/internal/ensure-backend/   # Self-heal эндпоинт для demo
│   │   ├── components/
│   │   │   ├── chat/               # 11 компонентов чата
│   │   │   └── ui/                 # shadcn/ui primitives
│   │   ├── hooks/                  # use-chat-websocket, use-chat-state
│   │   └── lib/                    # chat-types, chat-config, chat-protocol, avatar
│   ├── mini-services/chat-backend/ # TS demo-адаптер (тот же протокол, что и FastAPI)
│   ├── instrumentation.ts          # Авто-запуск demo-адаптера при старте Next.js
│   ├── instrumentation-node.ts     # Watchdog для mini-service
│   └── README.md                   # Подробнее про фронтенд
├── docs/
│   └── screenshots/                # Скриншоты интерфейса
├── .github/
│   └── workflows/
│       ├── backend-ci.yml          # CI для Python: lint + tests
│       └── frontend-ci.yml         # CI для Next.js: lint + type-check + build
├── docker/
│   ├── Dockerfile
│   └── nginx.conf
├── migrations/                     # Alembic миграции
├── tests/                          # Тесты бэкенда
├── docker-compose.yml
├── Makefile
└── pyproject.toml
```

## Быстрый старт

### Бэкенд (через Docker Compose)

```bash
docker-compose up -d
```

Сервисы будут доступны:
- API: http://localhost:8000
- Документация: http://localhost:8000/docs
- Health: http://localhost:8000/health
- Metrics: http://localhost:8000/metrics

### Фронтенд

```bash
cd frontend
bun install

# Demo-режим (без Python/Postgres/Redis — использует TS-адаптер):
bun run dev

# Production-режим (с реальным Python-бэкендом):
NEXT_PUBLIC_CHAT_MODE=backend bun run dev
```

Откройте http://localhost:3000, выберите display name — и можно общаться.
В production-режиме убедитесь, что бэкенд из `docker-compose up` запущен.

### Локальная разработка бэкенда (без Docker)

```bash
pip install -e ".[dev]"
docker-compose up -d postgres redis
alembic upgrade head
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

### Бэкенд

```bash
make test
```

### Фронтенд (lint + type-check)

```bash
cd frontend
bun run lint
```

## Линтинг и форматирование

```bash
make lint
make format
```

## CI / CD

В `.github/workflows/` два workflow:

### `backend-ci.yml`

Срабатывает на push/PR в `main` и на изменения в `app/**`, `tests/**`,
`migrations/**`, `pyproject.toml`. Запускает:
- Установка Python 3.11
- Установка зависимостей (`pip install -e ".[dev]"`)
- Ruff lint
- pytest

### `frontend-ci.yml`

Срабатывает на push/PR в `main` и на изменения в `frontend/**`. Запускает:
- Установка Bun
- `bun install`
- `bun run lint`
- `tsc --noEmit` (type-check)
- `bun run build`

Бейджи CI — вверху этого файла.

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

### Переменные фронтенда

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| NEXT_PUBLIC_CHAT_MODE | `demo` | `demo` (TS-адаптер) или `backend` (реальный FastAPI) |
| NEXT_PUBLIC_CHAT_API_BASE | `http://localhost:8000` | URL бэкенда (только в `backend` режиме) |

## Архитектура

Подробная схема — в самом приложении: кнопка `ⓘ` ("How this works") в
шапке чата. Кратко:

```
┌─────────────┐       ws        ┌──────────────┐
│  Next.js    │ ──────────────► │   FastAPI    │
│  Frontend   │ ◄────────────── │   Backend    │
│ (this app)  │    broadcasts   │ (websocket)  │
└─────────────┘                 └──────┬───────┘
                                       │ pub/sub
                                       ▼
                                ┌──────────────┐
                                │    Redis     │
                                │   Pub/Sub    │
                                └──────┬───────┘
                                       │ fan-out
                  ┌────────────────────┴────────────────────┐
                  ▼                                         ▼
            other FastAPI                              PostgreSQL
            instances                                  (history)
```

## Лицензия

MIT
