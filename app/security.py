"""JWT issuing and verification (HS256, via PyJWT)."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt

ALGORITHM = "HS256"


@dataclass(frozen=True)
class User:
    id: str
    name: str


def issue_token(secret: str, username: str, ttl: timedelta) -> tuple[str, User, datetime]:
    user = User(id=uuid.uuid4().hex, name=username)
    now = datetime.now(UTC)
    expires = now + ttl
    token = jwt.encode(
        {"sub": user.id, "name": user.name, "iat": now, "exp": expires},
        secret,
        algorithm=ALGORITHM,
    )
    return token, user, expires


def verify_token(secret: str, token: str) -> User | None:
    """Returns the user for a valid token, or None. Only HS256 is accepted."""
    try:
        claims = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "exp"]})
    except jwt.InvalidTokenError:
        return None
    name = claims.get("name")
    if not isinstance(name, str) or not name:
        return None
    return User(id=str(claims["sub"]), name=name)
