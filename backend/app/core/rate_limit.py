"""
Single shared Limiter instance. Lives in its own module (not main.py) so
route files can import it without a circular import - main.py imports the
routers, so the routers can't import back from main.py.

Limits are per client address. Behind nginx every request arrives from
nginx itself, so the key uses the same trusted-proxy logic as sessions
(otherwise all users would share one sign-in allowance).
"""
from slowapi import Limiter
from starlette.requests import Request


def _client_key(request: Request) -> str:
    from app.services.sessions import client_ip  # late import: avoids an import cycle
    return client_ip(request)


limiter = Limiter(key_func=_client_key)
