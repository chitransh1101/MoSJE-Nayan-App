"""
Single source for 'now' in UTC.

Returns a NAIVE datetime (no tzinfo) deliberately: every DateTime column
in this project is plain (not timezone-aware), by convention always UTC,
so every value written and read is naive-but-UTC. Mixing naive and
aware datetimes raises TypeError on comparison/subtraction - this helper
avoids the deprecated `datetime.utcnow()` call while keeping that
convention consistent everywhere it's used.
"""
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
