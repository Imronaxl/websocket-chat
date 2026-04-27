# Подключение всех роутеров
from fastapi import APIRouter
from app.api.v1.endpoints import ws, rooms

router = APIRouter(prefix="/v1")

router.include_router(ws.router, tags=["websocket"])
router.include_router(rooms.router, tags=["rooms"])