"""Use timestamptz and bigint ids, index history reads by (room_id, id)

Revision ID: 5f1c2a7e9b10
Revises: 386bb1d8c556
Create Date: 2026-11-07 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5f1c2a7e9b10"
down_revision: str | None = "386bb1d8c556"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("messages", "id", type_=sa.BigInteger(), existing_type=sa.Integer())
    op.alter_column(
        "messages",
        "created_at",
        type_=sa.DateTime(timezone=True),
        existing_type=sa.DateTime(),
        server_default=sa.func.now(),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )
    op.drop_index("ix_messages_room_created", table_name="messages")
    op.drop_index("ix_messages_room_id", table_name="messages")
    op.drop_index("ix_messages_user_id", table_name="messages")
    op.create_index("ix_messages_room_id_id", "messages", ["room_id", "id"])


def downgrade() -> None:
    op.drop_index("ix_messages_room_id_id", table_name="messages")
    op.create_index("ix_messages_user_id", "messages", ["user_id"])
    op.create_index("ix_messages_room_id", "messages", ["room_id"])
    op.create_index("ix_messages_room_created", "messages", ["room_id", "created_at"])
    op.alter_column(
        "messages",
        "created_at",
        type_=sa.DateTime(),
        existing_type=sa.DateTime(timezone=True),
        server_default=None,
        postgresql_using="created_at AT TIME ZONE 'UTC'",
    )
    op.alter_column("messages", "id", type_=sa.Integer(), existing_type=sa.BigInteger())
