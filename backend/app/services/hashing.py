"""
Evidence integrity: the client hashes on-device at the moment of capture
and sends that hash alongside the file. The server independently
recomputes the hash from the bytes it actually received and compares.
A mismatch means the bytes were altered in transit or the client hash was
forged - either way, the upload is rejected outright, never silently
accepted with a note.
"""
import hashlib


def sha256_of_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_hash(data: bytes, claimed_hash: str) -> tuple[bool, str]:
    """Returns (matches, server_computed_hash)."""
    server_hash = sha256_of_bytes(data)
    return server_hash == claimed_hash.lower().strip(), server_hash
