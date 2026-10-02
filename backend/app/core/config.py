"""
Centralised settings. Every configurable value lives here and is read from
the environment (see .env.example) - nothing is hardcoded in business logic.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- App ---
    APP_NAME: str = "DoSJE Nigrani API"
    ENV: str = "development"
    DEBUG: bool = True

    # --- Database ---
    DATABASE_URL: str = "sqlite:///./dosje_nigrani.db"

    # --- Auth ---
    JWT_SECRET_KEY: str = "change-me-in-production"  # ENV=production refuses to start with this
    JWT_ALGORITHM: str = "HS256"
    # Short-lived access tokens; the apps renew them silently while in use.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    # Server-side session limits: a session unused this long is dead, and
    # no session outlives SESSION_MAX_HOURS (an inspector's shift).
    SESSION_IDLE_MINUTES: int = 30
    SESSION_MAX_HOURS: int = 12
    # Failed sign-ins per email before sign-in pauses, and for how long.
    LOCKOUT_THRESHOLD: int = 5
    LOCKOUT_MINUTES: int = 15
    MFA_ISSUER: str = "DoSJE Nigrani"
    # Self-service sign-up (beneficiary accounts only). Off: only an admin
    # can create accounts through /auth/register.
    ALLOW_PUBLIC_SIGNUP: bool = False
    # Largest request body accepted (evidence videos are the big ones).
    MAX_UPLOAD_MB: int = 60
    # Behind a reverse proxy (nginx in docker-compose) the client address
    # comes from X-Forwarded-For / X-Real-IP. Only trust those headers
    # when the API is not reachable directly.
    TRUST_PROXY_HEADERS: bool = False

    # --- CORS ---
    # Comma-separated allowed frontend origins, e.g.
    # "https://your-dashboard.onrender.com,http://localhost:5173".
    # "*" (the default) allows any origin - fine for local dev; set this
    # explicitly once a real frontend URL exists, via an env var, not a
    # DEBUG-linked switch (that combination used to silently block every
    # origin once DEBUG was turned off for production - the opposite of
    # what you'd want).
    CORS_ORIGINS: str = "*"

    # --- Rate limiting ---
    LOGIN_RATE_LIMIT: str = "5/minute"  # per source IP, via slowapi

    # --- Object storage (evidence files) ---
    STORAGE_BACKEND: str = "local"  # "local" | "s3"
    STORAGE_LOCAL_PATH: str = "./evidence_store"
    S3_ENDPOINT_URL: str = "http://localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET: str = "evidence-bucket"

    # --- Assignment engine ---
    FAIRNESS_WINDOW: int = 5  # cycles an inspector can't be repaired with same institute
    GEOFENCE_RADIUS_METERS: float = 500.0

    # --- VC calls ---
    VC_PICKUP_WINDOW_SECONDS: int = 120

    # --- Yukt assistant (read directly by app/api/v1/assistant.py via os.getenv;
    #     listed here so every setting is documented in one place) ---
    YUKT_LLM_PROVIDER: str = "anthropic"
    YUKT_LLM_MODEL: str = ""
    YUKT_LLM_API_KEY: str = ""
    YUKT_LLM_BASE_URL: str = ""


settings = Settings()


def check_production_settings(s: Settings = settings) -> list[str]:
    """Problems that must never reach production. main.py refuses to start
    when ENV=production and this list is not empty."""
    problems = []
    if s.JWT_SECRET_KEY == "change-me-in-production" or len(s.JWT_SECRET_KEY) < 32:
        problems.append("JWT_SECRET_KEY must be set to a random value of at least 32 characters")
    if s.CORS_ORIGINS.strip() == "*":
        problems.append("CORS_ORIGINS must list the real frontend origins, not *")
    if s.DEBUG:
        problems.append("DEBUG must be false")
    return problems
