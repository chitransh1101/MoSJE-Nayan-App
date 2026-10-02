"""
Every test gets a FRESH in-memory SQLite database - never the dev
dosje_nigrani.db file, and never shared state between tests. This is what
makes `pytest` safe to run repeatedly without any manual cleanup step.
"""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.core.time import utcnow
from app.db.base import Base, get_db
from app.db.models.auth_session import AuthSession
from app.db.models.institute import Institute
from app.db.models.user import User
from app.main import app
from app.services import sessions


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    """Rate limits are per client address; every test starts with a clean slate."""
    limiter.reset()
    yield


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # keeps the single in-memory DB alive across connections
    )
    Base.metadata.create_all(bind=engine)
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def make_user(db_session):
    """Factory fixture: make_user(role="official") -> (User, auth_headers)."""

    def _make(role: str = "official", email: str | None = None, institute_id: str | None = None):
        email = email or f"{role}@qa.dosje-nigrani.gov.in"
        user = User(
            name=f"Test {role}",
            email=email,
            password_hash=hash_password("TestPass123!"),
            role=role,
            institute_id=institute_id,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        # A real server-side session, exactly as /auth/login creates one.
        now = utcnow()
        session = AuthSession(user_id=user.id, created_at=now, last_seen_at=now, expires_at=now + timedelta(hours=12),
                              ip="testclient", device="pytest")
        db_session.add(session)
        db_session.commit()
        token, _ = sessions.token_for(user, session)
        headers = {"Authorization": f"Bearer {token}"}
        return user, headers

    return _make


@pytest.fixture()
def make_institute(db_session):
    def _make(name: str = "Test Institute", lat: float = 26.8467, lng: float = 80.9462):
        institute = Institute(name=name, type="shelter", latitude=lat, longitude=lng, district="Lucknow", state="UP")
        db_session.add(institute)
        db_session.commit()
        db_session.refresh(institute)
        return institute

    return _make
