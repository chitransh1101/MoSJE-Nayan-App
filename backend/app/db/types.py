"""
GUID: stores as native UUID on Postgres, as CHAR(36) on SQLite.
Lets the exact same models power a real Postgres deployment AND the
in-memory SQLite tests, with no per-dialect model duplication.
"""
import uuid

from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import CHAR, TypeDecorator


class GUID(TypeDecorator):
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return str(value)
        if not isinstance(value, uuid.UUID):
            return str(uuid.UUID(value))
        return str(value)

    def process_result_value(self, value, dialect):
        # Always returned as a plain str, never a uuid.UUID object: every
        # Pydantic schema in this project declares id fields as `str`, and
        # every route path param is `str` - one consistent representation
        # of an id everywhere, rather than juggling UUID objects in some
        # layers and strings in others.
        if value is None:
            return value
        return str(value)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()
