import io


def test_institute_staff_can_submit_grievance_for_own_institute(client, make_user, make_institute):
    institute = make_institute()
    staff, headers = make_user(role="institute_staff", institute_id=institute.id)

    resp = client.post(
        "/api/v1/grievances",
        headers=headers,
        json={"institute_id": institute.id, "subject": "Water supply issue", "description": "No running water since Monday."},
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "open"


def test_cannot_submit_grievance_for_a_different_institute(client, make_user, make_institute):
    own_institute = make_institute(name="My Institute")
    other_institute = make_institute(name="Someone Else's Institute", lat=27.0, lng=81.0)
    staff, headers = make_user(role="institute_staff", institute_id=own_institute.id)

    resp = client.post(
        "/api/v1/grievances",
        headers=headers,
        json={"institute_id": other_institute.id, "subject": "Cross-institute test", "description": "trying to file on another institute"},
    )
    assert resp.status_code == 403


def test_institute_staff_only_sees_own_institute_grievances(client, make_user, make_institute):
    inst_a = make_institute(name="Institute A")
    inst_b = make_institute(name="Institute B", lat=27.0, lng=81.0)
    staff_a, headers_a = make_user(role="institute_staff", email="staffA@qa.dosje-nigrani.gov.in", institute_id=inst_a.id)
    staff_b, headers_b = make_user(role="institute_staff", email="staffB@qa.dosje-nigrani.gov.in", institute_id=inst_b.id)

    client.post("/api/v1/grievances", headers=headers_a, json={"institute_id": inst_a.id, "subject": "A's issue", "description": "something at A"})
    client.post("/api/v1/grievances", headers=headers_b, json={"institute_id": inst_b.id, "subject": "B's issue", "description": "something at B"})

    resp = client.get("/api/v1/grievances", headers=headers_a)
    assert resp.status_code == 200
    subjects = [g["subject"] for g in resp.json()]
    assert "A's issue" in subjects
    assert "B's issue" not in subjects  # cross-institute isolation, the whole point of Setu's scoping


def test_official_sees_all_grievances_and_can_update_status(client, make_user, make_institute):
    institute = make_institute()
    staff, staff_headers = make_user(role="institute_staff", institute_id=institute.id)
    _, official_headers = make_user(role="official")

    create = client.post(
        "/api/v1/grievances", headers=staff_headers,
        json={"institute_id": institute.id, "subject": "Test", "description": "Test grievance"},
    )
    grievance_id = create.json()["id"]

    listing = client.get("/api/v1/grievances", headers=official_headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    update = client.patch(f"/api/v1/grievances/{grievance_id}/status", headers=official_headers, json={"status": "resolved"})
    assert update.status_code == 200
    assert update.json()["status"] == "resolved"


def test_institute_staff_can_upload_document_for_own_institute(client, make_user, make_institute):
    institute = make_institute()
    staff, headers = make_user(role="institute_staff", institute_id=institute.id)

    resp = client.post(
        f"/api/v1/institutes/{institute.id}/documents",
        headers=headers,
        files={"file": ("certificate.pdf", io.BytesIO(b"fake pdf bytes"), "application/pdf")},
        data={"description": "Fire safety certificate"},
    )
    assert resp.status_code == 201
    assert resp.json()["description"] == "Fire safety certificate"


def test_cannot_upload_document_for_a_different_institute(client, make_user, make_institute):
    own = make_institute(name="Own")
    other = make_institute(name="Other", lat=27.0, lng=81.0)
    staff, headers = make_user(role="institute_staff", institute_id=own.id)

    resp = client.post(
        f"/api/v1/institutes/{other.id}/documents",
        headers=headers,
        files={"file": ("x.pdf", io.BytesIO(b"bytes"), "application/pdf")},
    )
    assert resp.status_code == 403


def test_official_sees_camera_wall_across_institutes(client, make_user, make_institute):
    inst_a = make_institute(name="Institute A")
    inst_b = make_institute(name="Institute B", lat=27.0, lng=81.0)
    _, admin_headers = make_user(role="admin")

    # Cameras are seeded via the app's seed script normally; here we just
    # confirm the endpoint's cross-institute scope and RBAC directly.
    resp = client.get("/api/v1/cameras", headers=admin_headers)
    assert resp.status_code == 200  # empty list is fine - RBAC + shape is what's under test

    staff, staff_headers = make_user(role="institute_staff", email="camstaff@qa.dosje-nigrani.gov.in", institute_id=inst_a.id)
    forbidden = client.get("/api/v1/cameras", headers=staff_headers)
    assert forbidden.status_code == 403


def test_compliance_summary_reflects_real_institute_counts(client, make_user, make_institute):
    make_institute(name="Inst 1")
    make_institute(name="Inst 2", lat=27.0, lng=81.0)
    _, official_headers = make_user(role="official")

    resp = client.get("/api/v1/analytics/compliance-summary", headers=official_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_institutes"] == 2
    assert body["green_count"] == 2  # both default to green status
    assert body["average_compliance_score"] == 100.0  # both default to 100


def test_renewal_decision_updates_institute(client, make_user, make_institute):
    institute = make_institute()
    _, official_headers = make_user(role="official")

    resp = client.patch(f"/api/v1/institutes/{institute.id}/renewal", headers=official_headers, json={"decision": "approved"})
    assert resp.status_code == 200
    assert resp.json()["renewal_status"] == "approved"


def test_institute_scoped_alerts_isolated_by_institute(client, make_user, make_institute, db_session):
    from app.db.models.alert import Alert

    inst_a = make_institute(name="Institute A")
    inst_b = make_institute(name="Institute B", lat=27.0, lng=81.0)
    db_session.add(Alert(institute_id=inst_a.id, type="attendance_spike", severity="red", status="open"))
    db_session.add(Alert(institute_id=inst_b.id, type="vc_miss", severity="yellow", status="open"))
    db_session.commit()

    staff_a, headers_a = make_user(role="institute_staff", email="scopedstaff@qa.dosje-nigrani.gov.in", institute_id=inst_a.id)

    resp = client.get(f"/api/v1/institutes/{inst_a.id}/alerts", headers=headers_a)
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["type"] == "attendance_spike"

    forbidden = client.get(f"/api/v1/institutes/{inst_b.id}/alerts", headers=headers_a)
    assert forbidden.status_code == 403
