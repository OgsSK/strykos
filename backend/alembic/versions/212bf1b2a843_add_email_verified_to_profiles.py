"""add email_verified to profiles

Revision ID: 212bf1b2a843
Revises: de4362cf4466
Create Date: 2026-10-14 16:31:20.134866

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '212bf1b2a843'
down_revision: Union[str, Sequence[str], None] = 'de4362cf4466'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Ajoute la colonne email_verified (défaut false pour les nouveaux)
    op.add_column('profiles', sa.Column('email_verified', sa.Boolean(), server_default='false', nullable=False))
    # 2. ⭐ Marque TOUS les utilisateurs existants comme vérifiés
    #    (sinon ils seraient bloqués après cette migration)
    op.execute("UPDATE profiles SET email_verified = true")
    # 3. Index pour les lookups rapides
    op.create_index(op.f('ix_profiles_email_verified'), 'profiles', ['email_verified'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_profiles_email_verified'), table_name='profiles')
    op.drop_column('profiles', 'email_verified')