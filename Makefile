.PHONY: up down restart logs test lint format migrate

up:
	docker-compose up -d

down:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f app

test:
	pytest -v --cov=app --cov-report=term-missing

lint:
	ruff check app tests

format:
	ruff format app tests

migrate:
	alembic upgrade head

install:
	pip install -e ".[dev]"

run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000