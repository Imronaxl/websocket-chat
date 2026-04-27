# Кастомные исключения
from fastapi import HTTPException


class WebSocketConnectionError(Exception):
    def __init__(self, reason: str = "Connection rejected"):
        self.reason = reason


class RoomNotFoundError(HTTPException):
    def __init__(self, room_id: str):
        super().__init__(status_code=404, detail=f"Room {room_id} not found")


class UnauthorizedError(HTTPException):
    def __init__(self, detail: str = "Unauthorized"):
        super().__init__(status_code=401, detail=detail)