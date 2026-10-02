import hashlib
import io

from app.services.hashing import sha256_of_bytes, verify_hash


def test_sha256_of_bytes_is_deterministic():
    data = b"evidence photo bytes"
    assert sha256_of_bytes(data) == sha256_of_bytes(data)
    assert sha256_of_bytes(data) == hashlib.sha256(data).hexdigest()


def test_verify_hash_matches_correct_hash():
    data = b"genuine evidence"
    correct_hash = hashlib.sha256(data).hexdigest()
    matches, server_hash = verify_hash(data, correct_hash)
    assert matches is True
    assert server_hash == correct_hash


def test_verify_hash_rejects_tampered_bytes():
    original = b"genuine evidence"
    tampered = b"swapped evidence"
    client_claimed_hash = hashlib.sha256(original).hexdigest()  # client hashed the ORIGINAL...
    matches, server_hash = verify_hash(tampered, client_claimed_hash)  # ...but server received TAMPERED bytes
    assert matches is False
    assert server_hash != client_claimed_hash


def test_upload_evidence_rejects_hash_mismatch(client, make_user, make_institute):
    # Single inspector in the DB at generate-time -> the CSPRNG draw has
    # exactly one inspector to choose from, making this deterministic
    # without weakening what the assignment engine itself does.
    institute = make_institute()
    inspector, headers = make_user(role="inspector")
    _, admin_headers = make_user(role="admin")

    gen = client.post("/api/v1/assignments/generate", headers=admin_headers)
    assert gen.status_code == 201
    assert gen.json()["inspector_id"] == inspector.id
    assignment_id = gen.json()["id"]

    fake_file = io.BytesIO(b"real photo bytes")
    resp = client.post(
        "/api/v1/evidence/upload",
        headers=headers,
        files={"file": ("evidence.jpg", fake_file, "image/jpeg")},
        data={
            "assignment_id": assignment_id,
            "client_hash": "0" * 64,  # deliberately wrong hash
            "gps_lat": str(institute.latitude),
            "gps_lng": str(institute.longitude),
            "device_id": "test-device-1",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "REJECTED"
    assert resp.json()["reason"] == "hash_mismatch"


def test_upload_evidence_accepts_correct_hash(client, make_user, make_institute):
    institute = make_institute()
    _, admin_headers = make_user(role="admin")
    inspector, headers = make_user(role="inspector", email="insp-correct@qa.dosje-nigrani.gov.in")

    gen = client.post("/api/v1/assignments/generate", headers=admin_headers)
    assignment_id = gen.json()["id"]
    assigned_inspector_id = gen.json()["inspector_id"]

    # Only proceed if OUR inspector was the one the engine actually picked
    # (single-inspector fixture setup guarantees this deterministically).
    assert assigned_inspector_id == inspector.id

    file_bytes = b"real photo bytes, genuinely captured"
    correct_hash = hashlib.sha256(file_bytes).hexdigest()

    resp = client.post(
        "/api/v1/evidence/upload",
        headers=headers,
        files={"file": ("evidence.jpg", io.BytesIO(file_bytes), "image/jpeg")},
        data={
            "assignment_id": assignment_id,
            "client_hash": correct_hash,
            "gps_lat": str(institute.latitude),
            "gps_lng": str(institute.longitude),
            "device_id": "test-device-1",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "OK"
    assert body["evidence"]["sha256_hash"] == correct_hash
