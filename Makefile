.PHONY: install test lint up down migrate dev loadtest

install:
	pip install -e ".[dev]"

test:
	pytest --cov --cov-report=term-missing

lint:
	ruff check app tests
	ruff format --check app tests
	mypy app

up:
	docker compose up --build

down:
	docker compose down

migrate:
	alembic upgrade head

dev:
	uvicorn --factory app.main:create_app --reload --port 8000

loadtest:
	python scripts/loadtest.py --clients 200 --messages 50 http://localhost:8080
