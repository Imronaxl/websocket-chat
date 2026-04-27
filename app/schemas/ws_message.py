from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime


class WSMessageBase(BaseModel):
    type: str


class JoinRoomMessage(WSMessageBase):
    type: Literal["join"] = "join"
    room_id: str


class LeaveRoomMessage(WSMessageBase):
    type: Literal["leave"] = "leave"
    room_id: str


class ChatMessage(WSMessageBase):
    type: Literal["chat"] = "chat"
    room_id: str
    content: str
    client_message_id: Optional[str] = None


class HeartbeatMessage(WSMessageBase):
    type: Literal["ping"] = "ping"
    timestamp: float = Field(default_factory=lambda: datetime.utcnow().timestamp())


class PongMessage(WSMessageBase):
    type: Literal["pong"] = "pong"
    timestamp: float


class UserJoinedBroadcast(BaseModel):
    type: Literal["user_joined"] = "user_joined"
    data: dict


class UserLeftBroadcast(BaseModel):
    type: Literal["user_left"] = "user_left"
    data: dict
