def test_admin_creates_account_and_it_can_sign_in(client, make_user):
    _, admin = make_user(role="admin")
    resp = client.post("/api/v1/auth/register", headers=admin, json={
        "name": "New Official",
        "email": "newofficial@qa.dosje-nigrani.gov.in",
        "password": "Str0ng!Harbour#Gate",
        "role": "official",
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["role"] == "official"
    assert "access_token" not in resp.json()  # the admin is not signed in as the new user

    login_resp = client.post("/api/v1/auth/login", json={
        "email": "NewOfficial@qa.dosje-nigrani.gov.in",  # email match is case-insensitive
        "password": "Str0ng!Harbour#Gate",
    })
    assert login_resp.status_code == 200
    assert login_resp.json()["role"] == "official"


def test_nobody_can_self_register_an_official_or_admin(client):
    for role in ("official", "admin", "beneficiary"):
        resp = client.post("/api/v1/auth/register", json={
            "name": "Mallory", "email": f"m-{role}@qa.dosje-nigrani.gov.in", "password": "Str0ng!Harbour#Gate", "role": role,
        })
        assert resp.status_code == 403, role  # public sign-up is off by default


def test_non_admin_cannot_create_accounts(client, make_user):
    _, official = make_user(role="official")
    resp = client.post("/api/v1/auth/register", headers=official, json={
        "name": "Xavier", "email": "x2@qa.dosje-nigrani.gov.in", "password": "Str0ng!Harbour#Gate", "role": "admin",
    })
    assert resp.status_code == 403


def test_login_wrong_password_rejected(client, make_user):
    make_user(role="official", email="x@qa.dosje-nigrani.gov.in")
    resp = client.post("/api/v1/auth/login", json={"email": "x@qa.dosje-nigrani.gov.in", "password": "WrongPassword!"})
    assert resp.status_code == 401


def test_duplicate_email_rejected(client, make_user):
    _, admin = make_user(role="admin")
    payload = {"name": "AB", "email": "dupe@qa.dosje-nigrani.gov.in", "password": "Str0ng!Harbour#Gate", "role": "official"}
    assert client.post("/api/v1/auth/register", headers=admin, json=payload).status_code == 201
    assert client.post("/api/v1/auth/register", headers=admin, json=payload).status_code == 409


def test_weak_password_rejected_on_account_creation(client, make_user):
    _, admin = make_user(role="admin")
    resp = client.post("/api/v1/auth/register", headers=admin, json={
        "name": "Weak", "email": "weak@qa.dosje-nigrani.gov.in", "password": "password123", "role": "official",
    })
    assert resp.status_code == 400


def test_invalid_role_rejected(client, make_user):
    _, admin = make_user(role="admin")
    resp = client.post("/api/v1/auth/register", headers=admin, json={
        "name": "X", "email": "badrole@qa.dosje-nigrani.gov.in", "password": "Str0ng!Harbour#Gate", "role": "superuser",
    })
    assert resp.status_code == 422


def test_unauthenticated_request_rejected(client):
    resp = client.get("/api/v1/institutes")
    assert resp.status_code == 401


def test_rbac_blocks_wrong_role(client, make_user):
    _, staff_headers = make_user(role="institute_staff")
    resp = client.post("/api/v1/assignments/generate", headers=staff_headers)
    assert resp.status_code == 403


def test_rbac_allows_correct_role(client, make_user, make_institute):
    make_institute()
    make_user(role="inspector", email="insp@qa.dosje-nigrani.gov.in")
    _, admin_headers = make_user(role="admin")
    resp = client.post("/api/v1/assignments/generate", headers=admin_headers)
    assert resp.status_code == 201
