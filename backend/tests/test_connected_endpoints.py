"""
End-to-end checks for the endpoints Sentinel, Setu and Nayan call.

The first test loads the full demo seed into the test database and walks
every screen's GET as each role would, so a broken query or a response the
frontends can't read fails here rather than in a browser.
"""
import hashlib

import pytest
from sqlalchemy.orm import sessionmaker

from app.db.models.assignment import Assignment

PW = "Password123!"


@pytest.fixture()
def seeded(db_session, monkeypatch):
    import app.seed.seed_data as seed

    bind = db_session.get_bind()
    monkeypatch.setattr(seed, "engine", bind)
    monkeypatch.setattr(seed, "SessionLocal", sessionmaker(autocommit=False, autoflush=False, bind=bind))
    seed.run()
    db_session.expire_all()
    return db_session


def login(client, email):
    from app.core.rate_limit import limiter
    limiter.reset()  # this test signs in as several roles back to back
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def canonical(e):
    return "|".join([e.get("prev_hash") or "", e["id"], e["at"], e.get("actor_id") or "", e["action"],
                     e.get("entity_type") or "", e.get("entity_id") or "", e.get("detail") or ""])


def test_seeded_world_serves_every_screen(client, seeded):
    # --- Sentinel (official) ---
    off = login(client, "official@dosje.gov.in")
    me = client.get("/api/v1/auth/me", headers=off)
    assert me.status_code == 200 and me.json()["role"] == "official"

    insts = client.get("/api/v1/institutes", headers=off).json()
    assert len(insts) == 11
    iid = insts[0]["id"]
    for path in (
        f"/api/v1/institutes/{iid}", f"/api/v1/institutes/{iid}/alerts", f"/api/v1/institutes/{iid}/residents",
        "/api/v1/alerts", "/api/v1/assignments", "/api/v1/grievances", "/api/v1/cameras",
        "/api/v1/analytics/compliance-summary", f"/api/v1/analytics/attendance?institute_id={iid}&days=30",
        "/api/v1/analytics/open-alerts-by-institute", "/api/v1/vc/calls", "/api/v1/vc/requests",
        "/api/v1/inspectors", "/api/v1/inspections", "/api/v1/evidence", "/api/v1/audit-log", "/api/v1/notices",
    ):
        r = client.get(path, headers=off)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:300]}"

    assert len(client.get("/api/v1/alerts", headers=off).json()) >= 10
    att = client.get(f"/api/v1/analytics/attendance?institute_id={iid}&days=30", headers=off).json()
    assert att  # 30 days of roll-ups

    # Region header narrows Sentinel's view.
    bihar = client.get("/api/v1/institutes", headers={**off, "X-Sentinel-Region": "Bihar"}).json()
    assert 0 < len(bihar) < 11 and all(i["state"] == "Bihar" for i in bihar)

    # Audit chain verifies exactly the way Sentinel recomputes it.
    log = client.get("/api/v1/audit-log", headers=off).json()
    rows = log if isinstance(log, list) else log.get("entries", log.get("items", []))
    assert rows
    for e in rows:
        assert hashlib.sha256(canonical(e).encode()).hexdigest() == e["hash"]

    # --- Nayan (inspector) ---
    insp = login(client, "inspector1@dosje.gov.in")
    mine = client.get("/api/v1/assignments", headers=insp).json()
    assert mine
    assert client.get("/api/v1/alerts", headers=insp).status_code == 200
    me_i = client.get("/api/v1/auth/me", headers=insp).json()
    assert client.get(f"/api/v1/inspectors/{me_i['user_id']}/messages", headers=insp).status_code == 200

    # --- Setu (staff) ---
    staff = login(client, "staff@dosje.gov.in")
    s_me = client.get("/api/v1/auth/me", headers=staff).json()
    own = s_me["institute_id"]
    assert client.get(f"/api/v1/institutes/{own}", headers=staff).status_code == 200
    assert client.get(f"/api/v1/institutes/{own}/residents", headers=staff).status_code == 200
    other = next(i["id"] for i in insts if i["id"] != own)
    assert client.get(f"/api/v1/institutes/{other}", headers=staff).status_code == 403
    assert client.get("/api/v1/cameras", headers=staff).status_code == 403
    assert client.get(f"/api/v1/vc/directory?institute_id={own}", headers=staff).status_code == 403  # officials/inspectors only

    # --- Setu (beneficiary) ---
    ben = login(client, "beneficiary@dosje.gov.in")
    view = client.get("/api/v1/beneficiaries/me", headers=ben)
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["schemes"] and body["documents"]
    assert all(len(s["stages"]) == 4 for s in body["schemes"])
    assert client.get("/api/v1/vc/calls/me", headers=ben).status_code == 200
    assert client.get("/api/v1/notices", headers=ben).status_code == 200

    # --- public ---
    assert len(client.get("/api/v1/schemes").json()) == 10
    assert client.get("/api/v1/public/institutes?state=Bihar").status_code == 200


def test_manual_assignment_respects_fairness(client, make_user, make_institute, db_session):
    inst = make_institute()
    inspector, _ = make_user(role="inspector", email="i@qa.gov.in")
    _, off = make_user(role="official")

    body = {"institute_id": inst.id, "inspector_id": inspector.id}
    r = client.post("/api/v1/assignments/generate", headers=off, json=body)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["institute"]["id"] == inst.id and out["inspector_id"] == inspector.id

    # Same inspector, same institute again straight away -> fairness rule.
    again = client.post("/api/v1/assignments/generate", headers=off, json=body)
    assert again.status_code == 409


def test_inspection_filing_marks_assignment_done(client, make_user, make_institute, db_session):
    inst = make_institute()
    inspector, ih = make_user(role="inspector", email="i2@qa.gov.in")
    _, off = make_user(role="official")
    a = client.post("/api/v1/assignments/generate", headers=off,
                    json={"institute_id": inst.id, "inspector_id": inspector.id}).json()

    r = client.post("/api/v1/inspections", headers=ih, json={
        "assignment_id": a["id"], "remarks": "All in order", "checklist": {"fire_safety": "yes"},
        "gps_lat": inst.latitude, "gps_lng": inst.longitude,
    })
    assert r.status_code == 201, r.text
    db_session.expire_all()
    assert db_session.get(Assignment, a["id"]).status in ("verified", "submitted")
    assert len(client.get("/api/v1/inspections", headers=off).json()) == 1


def test_official_inspector_messaging(client, make_user):
    inspector, ih = make_user(role="inspector", email="i3@qa.gov.in")
    _, off = make_user(role="official")

    r = client.post(f"/api/v1/inspectors/{inspector.id}/messages", headers=off,
                    json={"body": "Please revisit block B", "priority": "urgent"})
    assert r.status_code == 201, r.text
    thread = client.get(f"/api/v1/inspectors/{inspector.id}/messages", headers=ih)
    assert thread.status_code == 200 and len(thread.json()) == 1
    assert client.post(f"/api/v1/inspectors/{inspector.id}/messages/read", headers=ih).status_code == 200


def test_grievance_escalation_levels(client, make_user, make_institute):
    inst = make_institute()
    _, sh = make_user(role="institute_staff", institute_id=inst.id)
    _, off = make_user(role="official")
    g = client.post("/api/v1/grievances", headers=sh,
                    json={"institute_id": inst.id, "subject": "Food quality", "description": "Stale food served"}).json()

    levels = []
    for _ in range(5):
        r = client.post(f"/api/v1/grievances/{g['id']}/escalate", headers=off)
        if r.status_code == 409:
            break
        assert r.status_code == 200, r.text
        levels.append(r.json()["escalation_level"])
    assert levels and r.status_code == 409  # capped at the top level
    assert client.post(f"/api/v1/grievances/{g['id']}/escalate", headers=sh).status_code == 403


def test_alert_raise_respond_and_act(client, make_user, make_institute):
    inst = make_institute()
    _, sh = make_user(role="institute_staff", institute_id=inst.id)
    _, off = make_user(role="official")

    a = client.post("/api/v1/alerts", headers=off,
                    json={"institute_id": inst.id, "type": "manual", "severity": "red", "detail": "Spot check"})
    assert a.status_code == 201, a.text
    aid = a.json()["id"]
    assert client.post(f"/api/v1/alerts/{aid}/responses", headers=sh, json={"message": "Fixed, see photo"}).status_code == 201
    assert len(client.get(f"/api/v1/alerts/{aid}/responses", headers=off).json()) == 1
    assert client.patch(f"/api/v1/alerts/{aid}/action", headers=sh, json={"action": "resolve"}).status_code == 403


def test_notices_and_audit_events(client, make_user):
    _, off = make_user(role="official")
    _, ben = make_user(role="beneficiary", email="b@qa.gov.in")

    assert client.post("/api/v1/notices", headers=off, json={"title": "Holiday", "body": "Office closed Friday"}).status_code == 201
    assert client.post("/api/v1/notices", headers=ben, json={"title": "Nope", "body": "Not allowed"}).status_code == 403
    assert len(client.get("/api/v1/notices", headers=ben).json()) == 1

    ev = client.post("/api/v1/audit-log/events", headers=off, json={"action": "report.exported", "detail": "PDF"})
    assert ev.status_code == 201, ev.text


def test_vc_log_and_update(client, make_user, make_institute):
    inst = make_institute()
    _, off = make_user(role="official")
    r = client.post("/api/v1/vc/calls", headers=off, json={
        "institute_id": inst.id, "participant_name": "Warden", "participant_role": "incharge", "outcome": "pending",
    })
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    u = client.patch(f"/api/v1/vc/calls/{cid}", headers=off, json={"outcome": "connected", "headcount": 40})
    assert u.status_code == 200, u.text
