"""Request and response models for REST and the WebSocket protocol."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

RoomId = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32, pattern=r"^[\w .-]+$")]
Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


# --- REST ---------------------------------------------------------------


class GuestLoginRequest(BaseModel):
    username: Username


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user_id: str
    username: str
    expires_at: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_id: str
    user_id: str
    username: str
    content: str
    created_at: datetime


class OnlineUser(BaseModel):
    user_id: str
    username: str


# --- WebSocket: client -> server -----------------------------------------


class JoinFrame(BaseModel):
    type: Literal["join"]
    room_id: RoomId


class LeaveFrame(BaseModel):
    type: Literal["leave"]
    room_id: RoomId


class ChatFrame(BaseModel):
    type: Literal["chat"]
    room_id: RoomId
    content: Content
    # Echoed back so the sender can match the broadcast to its optimistic message.
    client_message_id: Annotated[str, StringConstraints(max_length=64)] | None = None


class PongFrame(BaseModel):
    type: Literal["pong"]


ClientFrame = Annotated[JoinFrame | LeaveFrame | ChatFrame | PongFrame, Field(discriminator="type")]
