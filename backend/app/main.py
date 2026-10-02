import logging
import re
import uuid

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1 import (alerts, analytics, assignments, assistant,
                        attendance, audit_log, auth, cameras, evidence,
                        grievances, inspections, inspectors,
                        institute_documents, institutes, notices, schemes, vc)
from app.core.config import check_production_settings, settings
from app.core.rate_limit import limiter
from app.db.base import Base, engine
from app.db.models import \
    *  # noqa: F401,F403 - ensures every model is registered on Base.metadata

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dosje_nigrani")

IS_PRODUCTION = settings.ENV.lower() == "production"
if IS_PRODUCTION:
    _problems = check_production_settings()
    if _problems:
        raise RuntimeError("Refusing to start in production: " + "; ".join(_problems))

app = FastAPI(
    # Interactive docs only outside production (they map the whole attack surface).
   docs_url="/docs",
redoc_url="/redoc",
openapi_url="/openapi.json",
    title=settings.APP_NAME,
    description=(
        "Smart Real-Time Monitoring & Inspection - SIH Problem Statement 26095. "
        "One API for Sentinel (officials' dashboard), Setu (institutes and beneficiaries) "
        "and Nayan (inspection teams and officials on mobile)."
    ),
    version="2.0.0",
)

# Dev convenience: for LOCAL SQLite development, tables are created
# directly from the models on startup, so `uvicorn app.main:app --reload`
# works immediately with no extra setup step. This is deliberately
# SQLite-only: mixing this with Alembic on a real database causes exactly
# the failure this comment used to hand-wave away as "a no-op" - if this
# ever runs even once against a fresh Postgres database before Alembic
# gets a chance to, Alembic's own migration then fails with
# "relation already exists", because the tables exist but Alembic's own
# version-tracking row was never written. Production (Postgres) must
# rely on `alembic upgrade head` alone, every time, with this skipped.
if settings.DATABASE_URL.startswith("sqlite"):
    Base.metadata.create_all(bind=engine)

# CORS_ORIGINS is read directly from settings, independent of DEBUG - the
# previous version tied this to DEBUG and ended up blocking every origin
# once DEBUG was turned off for production, which would have silently
# broken every frontend the moment this went live.
_origins = ["*"] if settings.CORS_ORIGINS == "*" else [o.strip() for o in settings.CORS_ORIGINS.split(",")]
# Tokens travel in the Authorization header, never in cookies, so there is
# no ambient credential for a cross-site request to ride on (no CSRF) and
# credentials mode is off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Retry-After", "X-Request-ID"],
    max_age=600,
)

_DOC_PATHS = ("/docs", "/redoc", "/openapi.json")
_APP_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org; "
            "connect-src 'self'; media-src 'self' data: blob:; frame-src 'self' blob:; worker-src 'self' blob:; "
            "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
_REQ_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Hardening headers on every response, a request id for tracing, and a
    size cap on request bodies."""
    rid = request.headers.get("x-request-id", "")
    rid = rid if _REQ_ID.match(rid) else uuid.uuid4().hex[:16]
    request.state.request_id = rid

    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        response = JSONResponse(status_code=413, content={"detail": f"File too large. The limit is {settings.MAX_UPLOAD_MB} MB."})
    else:
        response = await call_next(request)

    h = response.headers
    h["X-Request-ID"] = rid
    h["X-Content-Type-Options"] = "nosniff"
    h["X-Frame-Options"] = "DENY"
    h["Referrer-Policy"] = "no-referrer"
    path = request.url.path
    if path.startswith("/api/") or path == "/health":
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    elif not path.startswith(_DOC_PATHS):
        # Web apps served by this same server (the desktop edition).
        h["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=(), payment=(), usb=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        h["Content-Security-Policy"] = _APP_CSP
    if request.url.path.startswith("/api/"):
        h["Cache-Control"] = "no-store"
        h["Pragma"] = "no-cache"
    if IS_PRODUCTION or request.url.scheme == "https":
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Rate limiting: applied per-route (see auth.py's /login) rather than
# globally, so it protects the one endpoint worth protecting (password
# guessing) without throttling normal API use elsewhere.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Uniform 422 shape across the whole API instead of FastAPI's default verbose trace."""
    logger.warning("Validation error on %s: %s", request.url.path, exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation failed", "errors": exc.errors()},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.info("HTTP %s on %s: %s", exc.status_code, request.url.path, exc.detail)
    # Keep the handler's headers (WWW-Authenticate, Retry-After).
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Never leak a stack trace to a client; log it with the request id."""
    rid = getattr(request.state, "request_id", "-")
    logger.exception("Unhandled error on %s [request %s]", request.url.path, rid)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again.", "request_id": rid})


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok", "service": settings.APP_NAME}


app.include_router(auth.router)
app.include_router(institutes.router)
app.include_router(assignments.router)
app.include_router(evidence.router)
app.include_router(alerts.router)
app.include_router(attendance.router)
app.include_router(vc.router)
app.include_router(grievances.router)
app.include_router(institute_documents.router)
app.include_router(cameras.router)
app.include_router(analytics.router)
app.include_router(institutes.public_router)
app.include_router(inspections.router)
app.include_router(inspectors.router)
app.include_router(audit_log.router)
app.include_router(notices.router)
app.include_router(schemes.router)
app.include_router(assistant.router)
