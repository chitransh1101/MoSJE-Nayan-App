"""
DoSJE Nigrani - desktop edition (no Docker, nothing to install).

One program runs everything on this computer:
    http://localhost:8000/            Home (every app + demo accounts)
    http://localhost:8000/sentinel/   Sentinel
    http://localhost:8000/setu/       Setu
    http://localhost:8000/api/v1      the API (Nayan on a phone: http://<this-PC-IP>:8000/api/v1)
    http://localhost:8000/docs        API docs

Data (database, uploaded evidence, the signing secret) lives in
%LOCALAPPDATA%\\DoSJE-Nigrani, so updating the program never loses it.
Built into DoSJE-Nigrani.exe by .github/workflows/desktop.yml (PyInstaller);
it also runs from source:  python desktop.py
"""
import os
import secrets
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

PORT = int(os.environ.get("NIGRANI_PORT", "8000"))
BUNDLE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))  # where the program's files are
WEB = BUNDLE / "web" if (BUNDLE / "web").exists() else BUNDLE.parent / "desktop-web"


def data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or os.path.join(Path.home(), ".local", "share")
    d = Path(base) / "DoSJE-Nigrani"
    (d / "evidence").mkdir(parents=True, exist_ok=True)
    return d


def configure() -> Path:
    """Settings for a single-computer install - set BEFORE the app is imported."""
    d = data_dir()
    secret_file = d / "secret.key"
    if not secret_file.exists():
        secret_file.write_text(secrets.token_hex(32))  # unique per install, never the default
    db = d / "nigrani.db"
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{db.as_posix()}")
    os.environ.setdefault("STORAGE_BACKEND", "local")
    os.environ.setdefault("STORAGE_LOCAL_PATH", str(d / "evidence"))
    os.environ.setdefault("JWT_SECRET_KEY", secret_file.read_text().strip())
    os.environ.setdefault("DEBUG", "false")
    os.environ.setdefault("CORS_ORIGINS", "*")
    return db


def migrate(db: Path) -> None:
    """New database: tables from the models, stamped at the latest migration.
    Existing database: apply any migrations a newer version brought."""
    from alembic import command
    from alembic.config import Config

    cfg = Config()
    cfg.set_main_option("script_location", str(BUNDLE / "migrations"))
    if db.exists():
        command.upgrade(cfg, "head")
    else:
        from app.db.base import Base, engine
        from app.db.models import User  # noqa: F401 - registers every model
        Base.metadata.create_all(bind=engine)
        command.stamp(cfg, "head")


def build_app():
    from fastapi.responses import FileResponse
    from starlette.staticfiles import StaticFiles

    from app.main import app

    class SPA(StaticFiles):
        """Static files with single-page-app fallback: unknown paths get index.html."""

        async def get_response(self, path, scope):
            try:
                response = await super().get_response(path, scope)
            except Exception:  # starlette raises HTTPException(404) for missing files
                response = None
            if response is None or response.status_code == 404:
                return FileResponse(Path(self.directory) / "index.html")
            return response

    for name in ("sentinel", "setu"):
        if (WEB / name).exists():
            app.mount(f"/{name}", SPA(directory=WEB / name, html=True), name=name)
    if (WEB / "home").exists():
        app.mount("/", SPA(directory=WEB / "home", html=True), name="home")
    return app


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def open_when_ready() -> None:
    for _ in range(120):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2) as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(0.5)
    if os.environ.get("NIGRANI_NO_BROWSER") != "1":
        webbrowser.open(f"http://localhost:{PORT}/")
    print(f"\n  Ready:  http://localhost:{PORT}/")
    print("  Keep this window open while you use the apps. Close it to stop.\n")


def main() -> None:
    for stream in (sys.stdout, sys.stderr):  # Windows consoles: never crash on a non-ASCII character
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    print("\n  DoSJE Nigrani\n  -------------")
    if not port_free(PORT):
        print(f"  Port {PORT} is already in use - DoSJE Nigrani may already be running.")
        print(f"  Opening http://localhost:{PORT}/ ...")
        webbrowser.open(f"http://localhost:{PORT}/")
        time.sleep(4)
        return

    db = configure()
    sys.path.insert(0, str(BUNDLE))
    print("  Preparing the database...")
    migrate(db)

    from app.seed import seed_data
    seed_data.run()  # no-op when the database already has data

    import uvicorn
    app = build_app()
    threading.Thread(target=open_when_ready, daemon=True).start()
    # 0.0.0.0 so the Nayan app on a phone (same Wi-Fi) can reach it.
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # show the problem instead of a window that vanishes
        import traceback
        traceback.print_exc()
        print(f"\n  Could not start: {exc}")
        input("  Press Enter to close...")
