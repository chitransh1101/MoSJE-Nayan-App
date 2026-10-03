# DoSJE Nigrani · Nayan

**Nayan** is one centralized mobile app for monitoring and surprise inspection of institutes, projects and NGOs supported by the Department of Social Justice & Empowerment (DoSJE). Officials, PMU / inspection teams, project incharge, staff and beneficiaries all sign in to the same app, each with their own role.

Two web portals work alongside Nayan on the same backend and the same data:

| Component | Role | Built with |
|---|---|---|
| **Nayan** (main app) | Every role: monitoring, inspections, live CCTV, random video calls, findings, grievances, schemes | Flutter (Android, web, iPhone-ready) |
| **Sentinel** (supporting dashboard) | Large-screen monitoring dashboard for officials | React + Vite |
| **Setu** (supporting portal) | Web portal for institutes and beneficiaries | React + Vite |
| **Backend** | One API and database for all of the above | FastAPI (Python 3.12) |

Problem statement: SIH 26095, *Smart Real-Time Monitoring & Inspection Mobile App*. Nayan's own guide is in [NAYAN.md](NAYAN.md).

---

## Live demo

The online demo runs on GitHub Pages with built-in mock data, so no server is needed.

| | Link |
|---|---|
| **Start here** (all links + test accounts) | https://chitransh1101.github.io/MoSJE-Nayan-App/home/ |
| Nayan (web app, installable) | https://chitransh1101.github.io/MoSJE-Nayan-App/ |
| Nayan Android APK | https://github.com/chitransh1101/MoSJE-Nayan-App/releases/latest |
| Sentinel | https://chitransh1101.github.io/MoSJE-Nayan-App/sentinel/ |
| Setu | https://chitransh1101.github.io/MoSJE-Nayan-App/setu/ |
| API reference | https://chitransh1101.github.io/MoSJE-Nayan-App/api/ |

Every push to `main` rebuilds the APK, the Nayan web app, Sentinel, Setu and this demo site. The demo pages work out the repository address on their own; for a custom domain set `REPO_URL` in [`launcher/site-config.js`](launcher/site-config.js).

---

## Why it is hard to cheat

1. **Unpredictable assignment.** Visits are drawn with Python's `secrets` module (a cryptographically secure random source), not `random`. Overdue institutes get more weight, an inspector cannot be sent back to an institute they inspected in their last 5 visits, and even the visit time is random. See `backend/app/services/assignment_engine.py`.
2. **Evidence sealed at capture.** Nayan computes a SHA-256 hash of every photo or video the moment it is taken, together with GPS, time and device ID. The server recomputes the hash; any mismatch is rejected and raises a red alert. See `backend/app/services/hashing.py` and `backend/app/api/v1/evidence.py`.
3. **500 m geofence.** Haversine distance in plain Python, no database extension needed. Evidence captured outside the radius is kept but flagged. See `backend/app/services/geofence.py`.
4. **Residents can answer back.** Random video calls go straight to staff and beneficiaries through Jitsi rooms; an unanswered call raises an alert. See `backend/app/api/v1/vc.py`.
5. **Pattern-based anomaly detection.** An Isolation Forest (scikit-learn) learns each institute's own normal from four daily features: attendance, CCTV uptime, video-call pickup rate and inspection frequency. See `backend/app/services/anomaly.py`.
6. **Tamper-evident records.** Every sign-in and decision is written to a hash-chained audit log that Sentinel re-verifies row by row. See `backend/app/services/audit.py`.

---

## Architecture

```
            Nayan  (centralized mobile app, every role)
                         │
      Sentinel (dashboard)  ·  Setu (institute & beneficiary portal)
                         │
        FastAPI backend: JWT + server-side sessions, role-based access
                         │
   Assignment (CSPRNG) · Hash check (SHA-256) · Geofence (Haversine)
   Anomaly (Isolation Forest) · Tamper (pHash) · Audit chain · Yukt (BM25 + LLM)
                         │
   PostgreSQL / SQLite · Evidence store (disk / S3) · Jitsi · Bhashini
```

- **73 REST endpoints**, **23 database tables**, **7 user roles**, **73 automated tests**.
- PostgreSQL in production (SQLite for local runs); Alembic migrations.
- Evidence on local disk by default, S3 / MinIO when configured.

---

## Folder structure

```
MoSJE-Nayan-App/
├── lib/main.dart, lib/portal.dart   Nayan (Flutter): every role in one app
├── test/, test_screens/             Nayan widget and screenshot tests
├── tool/                            creates the Android / iOS / web folders
├── NAYAN.md                         Nayan in detail (features, install on phones)
├── backend/                         FastAPI backend shared by all three
│   ├── app/core/                    config, security, role-based access, scope
│   ├── app/db/models/               the 23 tables
│   ├── app/api/v1/                  all endpoints + Yukt assistant
│   ├── app/services/                assignment, hashing, geofence, anomaly, tamper, storage, audit
│   ├── app/seed/                    the mock dataset (same ids and names the apps show)
│   ├── tests/                       pytest suite (73 tests)
│   └── migrations/                  Alembic
├── sentinel/                        Sentinel dashboard (React)
├── setu/                            Setu portal (React)
├── launcher/                        Home page with every link and the test accounts
├── .github/workflows/               APK + web builds, backend tests, web apps, Docker, desktop app
├── docker-compose.yml               Postgres, backend, Sentinel, Setu, Home
├── start.bat / stop.bat             Windows: update + start / stop
└── start.sh                         Mac / Linux start (Docker)
```

---

## Run it on your computer

**Nothing to install.** Download the ZIP (https://github.com/chitransh1101/MoSJE-Nayan-App/archive/refs/heads/main.zip), unzip it and double-click **`start.bat`**.

- **Without Docker:** `start.bat` downloads the desktop app (one Windows program with the backend, Sentinel, Setu and the Home page; about 150 MB, only when it changes) and opens **http://localhost:8000**. Keep its window open while using the apps; close it or run `stop.bat` to stop. Data is kept in `%LOCALAPPDATA%\DoSJE-Nigrani`.
- **With Docker Desktop running:** it uses Docker instead and opens **http://localhost:3000**.
- **Updates:** every start first fetches the latest code and desktop app. Offline, it starts with what is there.
- **Mac / Linux:** `./start.sh` (needs Docker).

The desktop app is also on the [desktop-latest release](https://github.com/chitransh1101/MoSJE-Nayan-App/releases/tag/desktop-latest).

### Docker (one command)

```bash
docker-compose up -d --build
```

| What | Where |
|---|---|
| **Home (start here)** | http://localhost:3000 |
| Sentinel | http://localhost:5173 |
| Setu | http://localhost:5174 |
| API + Swagger docs | http://localhost:8000/docs |
| Adminer (optional DB browser) | `docker-compose --profile tools up -d adminer` → http://localhost:8080 (server `db`, user `dosje`, password `dosje_dev`, db `dosje`) |

The backend runs `alembic upgrade head` on start and loads the mock dataset on first boot.

### Manual setup

**Backend**

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env          # defaults work out of the box (SQLite, local storage)
./venv/bin/python -m app.seed.seed_data
./venv/bin/uvicorn app.main:app --reload
```

For PostgreSQL set `DATABASE_URL` in `.env` and run `alembic upgrade head` before seeding.

Optional: **Yukt**, the in-app assistant, answers from its built-in guide (BM25 search). Set `YUKT_LLM_API_KEY` (and optionally `YUKT_LLM_PROVIDER` / `YUKT_LLM_MODEL`) for full LLM answers, and the `BHASHINI_*` keys for Hindi / English voice. Keys stay on the server, and Yukt only proposes actions; the user confirms each one.

**Nayan (Flutter)**

```bash
dart run tool/setup_platforms.dart   # creates android / ios / web folders once
flutter pub get
flutter run                          # or: flutter run -d chrome
```

On the login screen open **Settings** and set the backend address to `http://<your-PC-IP>:8000/api/v1` (`http://10.0.2.2:8000/api/v1` from the Android emulator), or build with `--dart-define=API_BASE=https://your-host/api/v1`.

**Sentinel / Setu**

```bash
cd sentinel && npm install && npm run dev   # http://localhost:5173
cd setu && npm install && npm run dev       # http://localhost:5174 (npm run dev:mock = mock data only)
```

Both web apps fall back to their built-in mock data if the backend is down and show a **Mock data** badge.

---

## Test accounts and mock data

The problem statement provides no official database or data link, so this build uses test accounts and a structured mock dataset (fictional institutes, people and events). The data lives in the backend's own tables and is read through the normal API, so connecting the Department's real database replaces it without app changes.

Password for all test accounts: **`Password123!`**

| Role | Email |
|---|---|
| Official | `official@dosje.gov.in` |
| District authority | `district@dosje.gov.in` |
| PMU administrator | `admin@dosje.gov.in` |
| Inspector | `inspector1@dosje.gov.in`, `inspector2@dosje.gov.in` |
| Institute staff / project incharge | `staff@dosje.gov.in` |
| Beneficiary | `beneficiary@dosje.gov.in` |

The backend seed also includes more inspectors, institute staff and beneficiaries for the web portals. It loads 11 institutes, 30 days of attendance, 25 cameras, 14 alerts, assignments, inspections, grievances, video calls, notices, 10 schemes and the start of the audit chain.

---

## Endpoints (under `/api/v1`)

| Area | Routes | Main endpoints |
|---|---|---|
| Auth | 13 | login, 2-step verification, refresh, sessions, change password, register |
| Institutes | 10 | list, detail, score, renewal, alerts, residents, documents, public list |
| Video calls | 9 | trigger, call log, outcomes, my calls, call requests, directory |
| Assistant (Yukt) | 6 | status, knowledge, chat, translate, text-to-speech, speech-to-text |
| Alerts | 5 | list, raise, action, responses |
| Assignments | 4 | list, generate (random draw or checked pair), mine, geofence ping |
| Grievances | 4 | raise, list, status, escalate |
| Inspectors | 4 | list, messages |
| Other | 18 | analytics, schemes, evidence, notices, inspections, cameras, audit log, attendance |

**Who sees what:** officials and admins see everything; district and state authorities only their area; inspectors only their assigned institutes; institute staff and beneficiaries only their own institute.

---

## Tests

```bash
cd backend
./venv/bin/pytest
```

73 tests: security (19), auth & role-based access (10), Setu/Sentinel endpoints (10), connected endpoints (8), assignment engine (7), evidence (5), geofence (5), tamper detection (5), anomaly model (4). GitHub Actions also migrates and seeds PostgreSQL 16 and builds every app.

---

## Security

- **Sessions:** server-side sessions, 15-minute access tokens renewed in the background; sign-out, password change or a disabled account take effect immediately. Sessions end after 30 minutes unused and never last more than 12 hours.
- **Accounts:** 2-step verification (TOTP, RFC 6238) with recovery codes; lockout after 5 wrong passwords; bcrypt-hashed passwords with a strong password policy; only an admin can create official accounts.
- **Data:** Aadhaar, bank and phone numbers masked on screen; role-scoped data; uploads checked for size, type and file name.
- **Platform:** security headers and a strict Content-Security-Policy; tokens only in the `Authorization` header; production mode refuses default secrets.
- **Audit:** every sign-in, failed sign-in, lockout and decision goes into the hash-chained audit log.

Before going live: set `ENV=production`, a random `JWT_SECRET_KEY`, real `CORS_ORIGINS`, serve over HTTPS and change the test-account passwords.

---

## Current MVP and path to production

| Area | In this MVP | For production |
|---|---|---|
| Data | Structured mock data; anomaly model trained on generated history | Connect the Department's database and real attendance / camera feeds |
| Database | SQLite by default (PostgreSQL supported and tested in CI) | PostgreSQL with replicas |
| Evidence storage | Local disk by default (S3 / MinIO adapter included) | S3 / MinIO with retention lock |
| CCTV | Nayan shows each camera's snapshot (refreshed every 2 s) or opens its live stream URL; frozen / looped-feed detection (pHash) is implemented as a service | RTSP / HLS gateway for state-wide cameras, frame checks run on a schedule |
| Face-match attendance | Pluggable interface with a stand-in matcher | Plug in a real matcher (e.g. ArcFace) behind the same interface |
| Video calls | Jitsi room links opened from Nayan; calls and outcomes recorded by the backend | Department-hosted Jitsi |
| Voice assistant | Yukt text chat works on its built-in guide; voice when Bhashini keys are set | Bhashini production keys |
| Offline capture | Unsent photos stay queued in the app while it is open | Persist the queue on the device |
