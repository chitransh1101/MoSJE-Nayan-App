"""
Security behaviour the three apps rely on: sessions that really end,
sign-in throttling that doesn't reveal accounts, 2-step verification,
the password policy, hardening headers and safe file storage.
"""
import io
import os
import time
from datetime import timedelta

from app.core.rate_limit import limiter
from app.core.security import TOTP_STEP, password_problems, totp_now
from app.core.time import utcnow
from app.db.models.auth_session import AuthSession
from app.db.models.user import User

PW = "TestPass123!"


def login(client, email, password=PW):
    limiter.reset()  # the per-network limit is tested separately
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def bearer(r):
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ------------------------------------------------------------ sessions


def test_login_returns_a_short_lived_token_tied_to_a_session(client, make_user):
    make_user(role="official", email="o@qa.gov.in")
    r = login(client, "o@qa.gov.in")
    assert r.status_code == 200
    body = r.json()
    assert 0 < body["expires_in"] <= 15 * 60
    assert body["session_id"] and body["idle_timeout"] == 30 * 60
    assert body["last_login_at"] is None  # first sign-in ever

    again = login(client, "o@qa.gov.in").json()
    assert again["last_login_at"] is not None  # shows the previous sign-in


def test_logout_kills_the_token_immediately(client, make_user):
    make_user(role="official", email="o@qa.gov.in")
    h = bearer(login(client, "o@qa.gov.in"))
    assert client.get("/api/v1/auth/me", headers=h).status_code == 200
    assert client.post("/api/v1/auth/logout", headers=h).status_code == 200
    r = client.get("/api/v1/auth/me", headers=h)
    assert r.status_code == 401
    assert "signed out" in r.json()["detail"].lower()


def test_refresh_issues_a_new_token_for_the_same_session(client, make_user):
    make_user(role="official", email="o@qa.gov.in")
    first = login(client, "o@qa.gov.in").json()
    r = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {first['access_token']}"})
    assert r.status_code == 200
    assert r.json()["access_token"] != first["access_token"]
    assert r.json()["session_id"] == first["session_id"]


def test_idle_session_is_refused(client, make_user, db_session):
    make_user(role="official", email="o@qa.gov.in")
    r = login(client, "o@qa.gov.in")
    s = db_session.get(AuthSession, __import__("uuid").UUID(r.json()["session_id"]))
    s.last_seen_at = utcnow() - timedelta(minutes=31)
    db_session.commit()
    resp = client.get("/api/v1/auth/me", headers=bearer(r))
    assert resp.status_code == 401
    assert "inactivity" in resp.json()["detail"]


def test_session_list_and_signing_out_other_devices(client, make_user):
    make_user(role="official", email="o@qa.gov.in")
    laptop = bearer(login(client, "o@qa.gov.in"))
    phone = bearer(login(client, "o@qa.gov.in"))

    listed = client.get("/api/v1/auth/sessions", headers=laptop).json()
    assert len(listed) >= 2 and sum(s["current"] for s in listed) == 1  # (+ the fixture's own session)

    assert client.post("/api/v1/auth/logout-others", headers=laptop).json()["revoked"] == len(listed) - 1
    assert len(client.get("/api/v1/auth/sessions", headers=laptop).json()) == 1
    assert client.get("/api/v1/auth/me", headers=phone).status_code == 401
    assert client.get("/api/v1/auth/me", headers=laptop).status_code == 200


def test_cannot_revoke_someone_elses_session(client, make_user):
    make_user(role="official", email="a@qa.gov.in")
    make_user(role="official", email="b@qa.gov.in")
    a = login(client, "a@qa.gov.in")
    b = bearer(login(client, "b@qa.gov.in"))
    assert client.delete(f"/api/v1/auth/sessions/{a.json()['session_id']}", headers=b).status_code == 404


def test_disabled_account(client, make_user, db_session):
    user, headers = make_user(role="official", email="o@qa.gov.in")
    user.is_active = False
    db_session.commit()
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401
    assert login(client, "o@qa.gov.in").status_code == 403


# ------------------------------------------------------------ throttle


def test_lockout_after_five_failures_and_no_account_enumeration(client, make_user):
    make_user(role="official", email="real@qa.gov.in")
    replies = {}
    for email in ("real@qa.gov.in", "ghost@qa.gov.in"):
        codes, texts = [], []
        for _ in range(5):
            r = login(client, email, "Wrong-password-1!")
            codes.append(r.status_code)
            texts.append(r.json()["detail"])
        replies[email] = (codes, texts)
        assert codes[:4] == [401] * 4 and codes[4] == 423
        locked = login(client, email)  # even the right password waits
        assert locked.status_code == 423
        assert int(locked.headers["Retry-After"]) > 0

    # Same words for an existing and a non-existing account.
    assert replies["real@qa.gov.in"][1] == replies["ghost@qa.gov.in"][1]


def test_per_network_rate_limit(client):
    codes = [client.post("/api/v1/auth/login", json={"email": f"u{i}@qa.gov.in", "password": "x"}).status_code for i in range(7)]
    assert 429 in codes


# ------------------------------------------------------ 2-step verification


def _enable_mfa(client, headers):
    setup = client.post("/api/v1/auth/mfa/setup", headers=headers, json={"password": PW})
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/")
    # Use the previous step so the next sign-in (current step) isn't a replay.
    enable = client.post("/api/v1/auth/mfa/enable", headers=headers, json={"code": totp_now(secret, time.time() - TOTP_STEP)})
    assert enable.status_code == 200, enable.text
    return secret, enable.json()["recovery_codes"]


def test_two_step_sign_in_flow(client, make_user, db_session):
    user, _ = make_user(role="official", email="o@qa.gov.in")
    h = bearer(login(client, "o@qa.gov.in"))
    assert client.post("/api/v1/auth/mfa/setup", headers=h, json={"password": "nope"}).status_code == 401
    secret, codes = _enable_mfa(client, h)
    assert len(codes) == 10
    db_session.refresh(user)
    assert user.mfa_secret_enc and secret not in user.mfa_secret_enc  # encrypted at rest

    step1 = login(client, "o@qa.gov.in").json()
    assert step1["mfa_required"] is True and "access_token" not in step1

    bad = client.post("/api/v1/auth/mfa/verify", json={"mfa_token": step1["mfa_token"], "code": "000000"})
    assert bad.status_code == 401

    code = totp_now(secret)
    ok = client.post("/api/v1/auth/mfa/verify", json={"mfa_token": step1["mfa_token"], "code": code})
    assert ok.status_code == 200 and ok.json()["mfa_enabled"] is True

    # The same code can't be used twice.
    step1b = login(client, "o@qa.gov.in").json()
    replay = client.post("/api/v1/auth/mfa/verify", json={"mfa_token": step1b["mfa_token"], "code": code})
    assert replay.status_code == 401

    # A recovery code works exactly once.
    rc = client.post("/api/v1/auth/mfa/verify", json={"mfa_token": step1b["mfa_token"], "code": codes[0].lower()})
    assert rc.status_code == 200
    step1c = login(client, "o@qa.gov.in").json()
    assert client.post("/api/v1/auth/mfa/verify", json={"mfa_token": step1c["mfa_token"], "code": codes[0]}).status_code == 401


def test_mfa_token_is_not_an_access_token(client, make_user):
    make_user(role="official", email="o@qa.gov.in")
    h = bearer(login(client, "o@qa.gov.in"))
    _enable_mfa(client, h)
    mfa_token = login(client, "o@qa.gov.in").json()["mfa_token"]
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {mfa_token}"}).status_code == 401


def test_disable_two_step_needs_password_and_code(client, make_user):
    make_user(role="official", email="o@qa.gov.in")
    h = bearer(login(client, "o@qa.gov.in"))
    _, codes = _enable_mfa(client, h)
    assert client.post("/api/v1/auth/mfa/disable", headers=h, json={"password": PW, "code": "123456"}).status_code == 400
    r = client.post("/api/v1/auth/mfa/disable", headers=h, json={"password": PW, "code": codes[1]})
    assert r.status_code == 200 and r.json()["enabled"] is False
    assert "access_token" in login(client, "o@qa.gov.in").json()


# ------------------------------------------------------------ password


def test_password_policy_rules():
    assert password_problems("Str0ng!Harbour#Gate") == []
    assert password_problems("short1!A")  # too short
    assert password_problems("Password123!")  # common
    assert password_problems("Meera.Sharma!2026", name="Meera Sharma")  # contains the name
    assert password_problems("alllowercase123!")  # no uppercase


def test_change_password_signs_out_other_devices(client, make_user):
    make_user(role="official", email="o@qa.gov.in")
    here = bearer(login(client, "o@qa.gov.in"))
    other = bearer(login(client, "o@qa.gov.in"))

    wrong = client.post("/api/v1/auth/change-password", headers=here, json={"current_password": "x", "new_password": "Str0ng!Harbour#Gate"})
    assert wrong.status_code == 401
    weak = client.post("/api/v1/auth/change-password", headers=here, json={"current_password": PW, "new_password": "abc"})
    assert weak.status_code == 400

    ok = client.post("/api/v1/auth/change-password", headers=here, json={"current_password": PW, "new_password": "Str0ng!Harbour#Gate"})
    assert ok.status_code == 200 and ok.json()["revoked_other_sessions"] >= 1
    r = client.get("/api/v1/auth/me", headers=other)
    assert r.status_code == 401 and "password was changed" in r.json()["detail"]
    assert client.get("/api/v1/auth/me", headers=here).status_code == 200
    assert login(client, "o@qa.gov.in", "Str0ng!Harbour#Gate").status_code == 200


# ------------------------------------------------------------ hardening


def test_security_headers_on_api_responses(client):
    r = client.get("/api/v1/schemes")
    for header in ("X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Content-Security-Policy", "X-Request-ID"):
        assert header in r.headers, header
    assert r.headers["Cache-Control"] == "no-store"


def test_request_body_size_cap(client, make_user, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 0)  # any body is now "too large"
    _, h = make_user(role="official")
    r = client.post("/api/v1/notices", headers=h, json={"title": "Big", "body": "x" * 100})
    assert r.status_code == 413


def test_uploaded_filename_cannot_escape_storage(client, make_user, make_institute, tmp_path, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "STORAGE_LOCAL_PATH", str(tmp_path / "store"))
    inst = make_institute()
    _, h = make_user(role="institute_staff", institute_id=inst.id)
    r = client.post(f"/api/v1/institutes/{inst.id}/documents", headers=h,
                    files={"file": ("../../../evil.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")})
    assert r.status_code == 201, r.text
    stored = os.path.realpath(r.json()["file_url"])
    assert stored.startswith(os.path.realpath(tmp_path / "store"))
    assert not (tmp_path / "evil.pdf").exists()

    bad = client.post(f"/api/v1/institutes/{inst.id}/documents", headers=h,
                      files={"file": ("run.sh", io.BytesIO(b"#!/bin/sh"), "text/x-sh")})
    assert bad.status_code == 415


def test_forged_token_with_unknown_session_is_refused(client, make_user):
    import uuid

    from app.core.security import create_access_token
    user, _ = make_user(role="admin")
    forged = create_access_token(subject=str(user.id), role="admin", sid=str(uuid.uuid4()))
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    legacy = create_access_token(subject=str(user.id), role="admin")  # no session at all
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {legacy}"}).status_code == 401


def test_user_model_defaults(db_session):
    u = User(name="N", email="n@qa.gov.in", password_hash="x", role="official")
    db_session.add(u)
    db_session.commit()
    assert u.is_active is True and u.mfa_enabled is False
