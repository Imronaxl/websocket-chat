# Модели для REST эндпоинтов
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Optional


class MessageResponse(BaseModel):
    """Схема одного сообщения в ответе API."""

    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Уникальный идентификатор сообщения", ge=1)
    room_id: str = Field(..., description="Идентификатор комнаты", min_length=1, max_length=64)
    user_id: str = Field(..., description="Идентификатор пользователя", min_length=1, max_length=64)
    username: str = Field(..., description="Имя пользователя", min_length=1, max_length=64)
    content: str = Field(..., description="Текст сообщения", min_length=1, max_length=4096)
    created_at: datetime = Field(..., description="Время создания сообщения")


class RoomUsersResponse(BaseModel):
    """Схема списка онлайн-пользователей комнаты."""

    room_id: str = Field(..., description="Идентификатор комнаты")
    online_users: List[str] = Field(default_factory=list, description="Список ID пользователей онлайн")


class CreateMessageRequest(BaseModel):
    """Запрос на создание сообщения."""

    room_id: str = Field(..., min_length=1, max_length=64)
    content: str = Field(..., min_length=1, max_length=4096)


class ErrorResponse(BaseModel):
    """Схема ответа при ошибке."""

    detail: str = Field(..., description="Описание ошибки")
    status_code: Optional[int] = Field(None, description="Код статуса HTTP")
