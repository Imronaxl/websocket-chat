from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from app.api.deps import current_user, get_hub, get_repository, get_settings
from app.config import Settings
from app.hub import Hub
from app.repository import MessageRepository
from app.schemas import GuestLoginRequest, MessageOut, OnlineUser, TokenResponse
from app.security import User, issue_token

router = APIRouter(prefix="/api/v1")

RoomPath = Annotated[str, Path(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]


@router.post("/auth/guest", response_model=TokenResponse, tags=["auth"])
async def guest_login(body: GuestLoginRequest, settings: Annotated[Settings, Depends(get_settings)]) -> TokenResponse:
    """Issues a token for a new guest identity. There are no passwords: the
    point is that the server, not the client, decides the user id."""
    token, user, expires = issue_token(settings.jwt_secret, body.username, timedelta(minutes=settings.jwt_ttl_minutes))
    return TokenResponse(access_token=token, user_id=user.id, username=user.name, expires_at=expires)


@router.get("/rooms/{room_id}/messages", response_model=list[MessageOut], tags=["rooms"])
async def room_history(
    room_id: RoomPath,
    _: Annotated[User, Depends(current_user)],
    repo: Annotated[MessageRepository, Depends(get_repository)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    before_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[MessageOut]:
    """Messages older than `before_id` (or the newest ones), oldest first."""
    rows = await repo.history(room_id, limit=limit, before_id=before_id)
    return [MessageOut.model_validate(r) for r in rows]


@router.get("/rooms/{room_id}/users", response_model=list[OnlineUser], tags=["rooms"])
async def room_users(
    room_id: RoomPath,
    _: Annotated[User, Depends(current_user)],
    hub: Annotated[Hub, Depends(get_hub)],
) -> list[OnlineUser]:
    return await hub.online_users(room_id)
