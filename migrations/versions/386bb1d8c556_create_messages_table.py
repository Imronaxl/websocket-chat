"""create messages table

Revision ID: 386bb1d8c556
Revises:
Create Date: 2026-04-15 00:57:38.348964

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "386bb1d8c556"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_messages_room_created", "room_id", "created_at"),
        sa.Index("ix_messages_room_id", "room_id"),
        sa.Index("ix_messages_user_id", "user_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("messages")
