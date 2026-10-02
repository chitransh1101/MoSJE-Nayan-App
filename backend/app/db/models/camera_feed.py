from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utcnow
from app.db.base import Base
from app.db.types import GUID, new_uuid

# online: pinged recently and reachable. offline: unreachable.
# stale: reachable but the feed hasn't updated in a while (frozen-feed
# suspicion) - a distinct state from the tamper pHash check in
# services/tamper.py, which analyzes actual frame content; this is
# simpler "is the connection itself alive" health monitoring.
CAMERA_STATUSES = ("online", "offline", "stale")


class CameraFeed(Base):
    __tablename__ = "camera_feeds"

    id: Mapped[GUID] = mapped_column(GUID, primary_key=True, default=new_uuid)
    institute_id: Mapped[GUID] = mapped_column(GUID, ForeignKey("institutes.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g. "Main Gate", "Dormitory Hall"
    status: Mapped[str] = mapped_column(String(10), default="offline")
    last_ping_at: Mapped[object] = mapped_column(DateTime, nullable=True)
    # Where the picture comes from, if the NVR exposes one: a JPEG that is
    # refreshed every few seconds, and/or an HLS/RTSP stream URL.
    snapshot_url: Mapped[str] = mapped_column(String(500), nullable=True)
    stream_url: Mapped[str] = mapped_column(String(500), nullable=True)

    institute = relationship("Institute")
