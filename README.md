# DoSJE Nigrani — Three Platforms, One Secure Backend

> Whole project in one repo: **Nayan** (Flutter, repo root), **Sentinel** (`sentinel/`), **Setu** (`setu/`) and the shared **backend** (`backend/`). Nayan's own guide is in [NAYAN.md](NAYAN.md).

**SIH Problem Statement 26095** — Smart Real-Time Monitoring & Inspection Mobile App
Ministry of Social Justice and Empowerment (MoSJE)

Predictable, pre-announced inspections let institutes prepare for the visit and revert after. DoSJE Nigrani replaces that with evidence-backed oversight the institute can't anticipate: a cryptographically random assignment engine, hash-verified evidence capture, beneficiary-in-the-loop verification calls, and pattern-based anomaly detection that catches "prepared for inspection" behavior a single visit never would.

Three purpose-built platforms share one backend, each for a different stakeholder and trust level:

| Platform | For | Built as |
|---|---|---|
| **DoSJE Sentinel** | Officials — watch & decide | React web dashboard |
| **DoSJE Nayan** | Inspection teams — see & verify | Flutter mobile app |
| **DoSJE Setu** | Institutes & beneficiaries — respond & report | React web portal |

This repository is a **working, tested build** — not a mockup. Every claim below (the tests passing, the endpoints responding, the anomaly model actually flagging injected patterns) was run and verified while building it, not just written.

---

## The four things that differentiate this from a typical monitoring dashboard

1. **Collusion-resistant random assignment** — `secrets` (CSPRNG), not `random`, plus a rolling-window fairness constraint that blocks repeat inspector↔institute pairings. See `backend/app/services/assignment_engine.py`.
2. **Hash-at-capture evidence integrity** — SHA-256 computed on-device the instant a photo is taken, independently recomputed and compared server-side. A mismatch is rejected outright, never silently accepted. See `backend/app/services/hashing.py` and `lib/main.dart` (Nayan, §capture).
3. **Beneficiary-in-the-loop verification** — a call placed directly to a beneficiary's registered number, bypassing institute staff. See `backend/app/api/v1/vc.py`.
4. **Pattern-based anomaly detection** — an Isolation Forest scores each institute's day against its *own* history (no labeled fraud data needed, and explainable in one sentence to a judge). See `backend/app/services/anomaly.py`.

---

## Architecture

```
Client apps (Flutter, 4 roles + React dashboard)
              │
      API layer (FastAPI, JWT auth + RBAC)
              │
   ┌──────────┼──────────┐
Assignment   Anomaly    Storage &
 engine     detection    real-time
(CSPRNG +   (Isolation   (Postgres,
hash verify) Forest,     MinIO, Jitsi)
             pHash)
```

**Why PostgreSQL, not NoSQL:** every core entity is a foreign-key relationship (evidence → assignment → institute + inspector), and evidence integrity needs ACID guarantees a hash write can't partially apply. See the "Database choice" discussion earlier in this project's design conversation for the full reasoning.

**Why plain lat/lng instead of PostGIS:** the only geo need is point-to-point distance (is the inspector within 500m?), never polygon queries — so a Haversine check in application code (`backend/app/services/geofence.py`) gets the same feature with zero extra DB extensions.

---

## Folder structure

```
Nayan/  (this repo — the whole project)
├── backend/              FastAPI + PostgreSQL — the ONE backend Sentinel, Setu and Nayan all use
│   ├── app/
│   │   ├── core/          config, JWT security, RBAC, scope.py (who may see which institutes)
│   │   ├── db/models/      users, institutes, assignments, evidence, alerts, cameras, grievances,
│   │   │                   vc_calls, documents + extras.py (schemes, applications, beneficiary
│   │   │                   profiles/documents, notices, alert responses, call requests,
│   │   │                   inspections, inspector messages, hash-chained audit log, attendance)
│   │   ├── schemas/       Pydantic request/response models
│   │   ├── api/v1/         all endpoints (table below) + Yukt assistant (assistant.py)
│   │   ├── services/       assignment engine, hashing, anomaly, tamper, geofence, storage,
│   │   │                   audit (hash chain), benefits (Setu's scheme/payment views)
│   │   └── seed/           the SAME mock dataset the three apps show (same ids, names, emails)
│   ├── tests/             pytest — incl. test_connected_endpoints.py (every screen, every role)
│   ├── migrations/        Alembic (7c2e1a9d0f11 adds everything for the connected apps)
│   ├── Dockerfile
│   └── .env.example
├── sentinel/             DoSJE Sentinel — officials' console (React + Vite + Tailwind + Leaflet)
│   └── src/App.jsx         the whole app
├── setu/                 DoSJE Setu — institute & beneficiary portal (React + Vite + Tailwind)
│   ├── src/App.jsx         the whole app
│   └── standalone/setu.html  one-file build on mock data (double-click, no backend)
├── lib/main.dart         DoSJE Nayan — Flutter app for inspectors & officials (Android, iOS, web)
├── test/, test_screens/  Nayan widget + screenshot tests; tool/ creates the platform folders
├── NAYAN.md              Nayan in detail (features, install on phones, APK / web links)
├── .github/workflows/    build.yml (Nayan APK + web), backend.yml (tests + Postgres migrate/seed), web.yml (Sentinel + Setu builds)
├── launcher/             Home page (http://localhost:3000): every app, live status, test accounts
├── start.bat / stop.bat  Windows: double-click to update + start (opens Home) / stop
├── scripts/start.ps1     what start.bat runs: auto-update (git or ZIP), then Docker or the desktop app, open Home
├── backend/desktop.py    the desktop app (no Docker): one server for API + Sentinel + Setu + Home
├── docker-compose.yml    Postgres, backend (auto-migrate + seed), Sentinel, Setu, Home (+ optional Adminer)
└── README.md
```

---

## Online demo (share this link)

The **View GitHub repo** and **Android APK** buttons on the demo home page find the repository on their own when the site runs on GitHub Pages, so a fresh push to a new repo needs no change. To set the link by hand (custom domain, or the local launcher), put your repo URL in `REPO_URL` in [`launcher/site-config.js`](launcher/site-config.js).

Every push to `main` publishes a free online demo on GitHub Pages — it runs on built-in mock data, no server needed:

| | Link |
|---|---|
| **Start here (all three apps + test accounts)** | https://chitransh1101.github.io/Nayan/home/ |
| Sentinel | https://chitransh1101.github.io/Nayan/sentinel/ |
| Setu | https://chitransh1101.github.io/Nayan/setu/ |
| Nayan (web app, installable) | https://chitransh1101.github.io/Nayan/ |
| Nayan Android APK | https://github.com/chitransh1101/Nayan/releases/latest |

## Running it on a teammate's computer

**Nothing to install.** Download the ZIP — **https://github.com/chitransh1101/Nayan/archive/refs/heads/main.zip** (always the newest) — unzip it, and double-click **`start.bat`**.

- **No Docker?** `start.bat` downloads the **desktop app** (one Windows program with the backend, Sentinel, Setu and the Home page; about 150 MB, only when it changes) and opens **http://localhost:8000**. Keep its window open while using the apps; close it (or `stop.bat`) to stop. Data is kept in `%LOCALAPPDATA%\DoSJE-Nigrani`.
- **Docker Desktop running?** It uses Docker instead and opens **http://localhost:3000**.
- **Updates arrive by themselves:** every start first fetches the latest code (`git pull`, or a fresh download for a ZIP copy) and the latest desktop app. Offline, it starts with what's there.
- Mac/Linux: `./start.sh` (needs Docker).

The desktop app is also on the [desktop-latest release](https://github.com/chitransh1101/Nayan/releases/tag/desktop-latest) (`DoSJE-Nigrani-Windows.zip` → run `DoSJE-Nigrani.exe`).

---

## Quick start (Docker — one command)

**Windows:** double-click **`start.bat`** (and **`stop.bat`** to stop). It starts everything and opens the Home page.
Or from a terminal:

```bash
docker-compose up -d --build
```

Then open **http://localhost:3000** — the **Home page** with every app, live status and the test accounts. Bookmark it.
In Docker Desktop you can also click the `3000:80` port next to the `home` container.

| What | Where |
|---|---|
| **Home (start here)** | http://localhost:3000 |
| Sentinel (officials) | http://localhost:5173 |
| Setu (institutes & beneficiaries) | http://localhost:5174 |
| API + Swagger docs | http://localhost:8000/docs |
| Adminer (DB browser, optional) | `docker-compose --profile tools up -d adminer` → http://localhost:8080 — server `db`, user `dosje`, password `dosje_dev`, db `dosje` |

The backend runs `alembic upgrade head` on start and loads the mock dataset on the first boot
(`RUN_SEED_ON_START=true`), so there's nothing else to run. Both web apps proxy `/api` to the
backend through nginx. For Nayan, see below.

---

## Manual setup (no Docker)

### Backend

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env          # defaults work out of the box (SQLite, local storage)
./venv/bin/python -m app.seed.seed_data
./venv/bin/uvicorn app.main:app --reload
```

Runs on http://localhost:8000. For Postgres, set `DATABASE_URL` in `.env` and run
`alembic upgrade head` before seeding. To reseed SQLite, delete `dosje_nigrani.db` and run the seed again.

Optional — **Yukt** (the assistant in all three apps): set `YUKT_LLM_API_KEY` (and optionally
`YUKT_LLM_PROVIDER` / `YUKT_LLM_MODEL`) in `.env`. The key stays on the server; without it Yukt
still answers from its built-in guide. Yukt only proposes actions — the user confirms each one.

### Sentinel (dashboard)

```bash
cd sentinel
npm install
npm run dev                   # http://localhost:5173, /api proxied to :8000
```

### Setu (institute/beneficiary portal)

```bash
cd setu
npm install
npm run dev                   # http://localhost:5174, /api proxied to :8000
npm run dev:mock              # mock data only, no backend
```

Both web apps fall back to their built-in mock data if the backend is down, and show a
**Mock data** badge when they do.

### Nayan (mobile, Flutter)

```bash
# from the repo root
dart run tool/setup_platforms.dart   # creates android/ios/web folders once
flutter pub get
flutter run                          # or: flutter run -d chrome
```

On the login screen open **Settings** and set the backend address to `http://<your-PC-IP>:8000/api/v1`
(`http://10.0.2.2:8000/api/v1` from the Android emulator). Or bake it in:
`flutter build apk --dart-define=API_BASE=https://your-host/api/v1`. Every push to `main`
that touches the app builds the APK (GitHub Release "latest") and the web version (GitHub Pages) — see NAYAN.md.

---

## Test accounts

The problem statement (SIH26095) provides no official database or data link, so we created these
test accounts and a mock dataset (fictional institutes, people and events) for testing. The data lives
in the backend's own database tables and is read through the normal API, so pointing the backend at the
department's real database replaces it without any app changes.

All seeded accounts use password **`Password123!`** — the same test accounts the three apps' mock
mode uses, so what you see in mock mode is what the backend serves.

| Role | Email | Use it in |
|---|---|---|
| Official | `official@dosje.gov.in` | Sentinel, Nayan (monitor) |
| Admin | `admin@dosje.gov.in` | Sentinel |
| District authority | `district@dosje.gov.in` | Sentinel (sees only its district) |
| Inspector | `inspector1@dosje.gov.in` … `inspector5@dosje.gov.in` | Nayan |
| Institute staff | `staff@dosje.gov.in`, `matruchhaya@demo.setu.gov.in`, `disha@…`, `snehalaya@…`, `ashakiran@demo.setu.gov.in` | Nayan · Setu |
| Beneficiary | `beneficiary@dosje.gov.in`, `priya.kumari@demo.setu.gov.in` … (21 in all) | Nayan · Setu |

The seed loads 11 institutes, 30 days of attendance, cameras, 14 alerts (the first scored by the
real Isolation Forest), assignments and filed inspections, grievances, VC calls, notices,
inspector messages, 10 schemes with applications and documents, and the start of the audit chain.

## Connected endpoints (all under `/api/v1`)

| Area | Endpoints | Used by |
|---|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` | all |
| Institutes | `GET /institutes`, `GET /institutes/{id}`, `/{id}/alerts`, `/{id}/residents`, renewal, documents; public `GET /public/institutes` | all |
| Alerts | `GET/POST /alerts`, `PATCH /alerts/{id}/action`, `GET/POST /alerts/{id}/responses` | Sentinel, Setu, Nayan |
| Assignments | `GET /assignments`, `POST /assignments/generate` (random draw, or a chosen pair checked against the fairness rule), geofence ping | Sentinel, Nayan |
| Evidence | `POST /evidence/upload` (hash + geofence checked), `GET /evidence` | Nayan, Sentinel |
| Inspections | `POST /inspections`, `GET /inspections` | Nayan, Sentinel |
| Inspectors | `GET /inspectors`, `GET/POST /inspectors/{id}/messages`, `POST …/messages/read` | Sentinel, Nayan |
| Grievances | `GET/POST /grievances`, `PATCH /{id}/status`, `POST /{id}/escalate` | Setu, Sentinel |
| Cameras / analytics | `GET /cameras`, `/analytics/compliance-summary`, `/analytics/attendance`, `/analytics/open-alerts-by-institute` | Sentinel, Nayan |
| Video calls | `/vc/trigger`, `/vc/calls` (GET/POST/PATCH), `/vc/calls/me`, `/vc/calls/requests`, `/vc/requests`, `/vc/directory` | Sentinel, Setu, Nayan |
| Schemes | `GET /schemes`, `GET /beneficiaries/me`, `POST /beneficiaries/me/scheme-requests` | Setu |
| Notices / audit | `GET/POST /notices`, `GET /audit-log`, `POST /audit-log/events` | Setu, Sentinel |
| Yukt | `/assistant/status`, `/assistant/chat` (`app`: sentinel / setu / nayan), translate / tts / asr | all |

**Who sees what.** Officials and admins see everything (Sentinel's region picker narrows it via
the `X-Sentinel-Region` header); district/state authorities only their district/state;
inspectors only the institutes they're assigned to; institute staff and beneficiaries only their
own institute. Every sign-in and decision is written to a hash-chained audit log that Sentinel
re-verifies row by row.

---

## Running the tests

```bash
cd backend
./venv/bin/pytest
./venv/bin/pytest --cov=app --cov-report=term-missing
```

Covers auth + RBAC, the assignment engine and fairness rule, evidence hash verification, anomaly
detection, tamper detection, geofencing, Setu/Sentinel endpoints and institute isolation, and
`test_connected_endpoints.py`, which loads the full mock seed, opens every screen's data as each
role (official, inspector, staff, beneficiary), checks the audit chain the way Sentinel does, and
exercises assignment, inspection filing, messaging, escalation, alert responses, notices and VC
logging. Verified: all tests pass; `alembic upgrade head` → seed → downgrade → upgrade works on
Postgres 16; migrate + seed works on SQLite; Sentinel and Setu production builds succeed.

---

## Security

Built in across the backend and all three apps (details in `backend/app/api/v1/auth.py`, `backend/app/core/`, and each app's session code).

**Sign-in and sessions**
- Every sign-in is a **server-side session**; access tokens last 15 minutes and are renewed silently while the app is in use. Sign-out, "sign out other devices", a password change or a disabled account take effect **immediately** — the old token stops working at once.
- Sessions end after 30 minutes unused on the server and never last more than 12 hours.
- **Refresh or reopen = main login page.** Sentinel and Setu keep the session only in memory (nothing in browser storage), so a reload or a new visit always starts at sign-in. Nayan does the same on a cold start.
- **Idle sign-out:** 15 minutes without activity → a 2-minute warning with a countdown, then sign-out (Sentinel, Setu). Nayan **locks** instead (and after 5+ minutes in the background), so an inspector's unsent evidence is never lost; unlocking re-checks the password.
- Signing out in one tab signs out every open tab; sign-out wipes cached data but keeps display preferences.

**Protecting accounts**
- **2-step verification** (authenticator app, RFC 6238 TOTP) with 10 single-use recovery codes; the secret is encrypted at rest and a code can't be replayed.
- **Lockout:** 5 wrong passwords for an email pause sign-in for that email for 15 minutes (plus 5 attempts per minute per network). Replies and timing are identical for unknown emails, so nobody can probe which accounts exist.
- **Password policy:** 12+ characters, upper/lower/number/symbol, not the user's name or email, not a common password — shown as a live checklist with a strength meter. Passwords are bcrypt-hashed.
- **No self-made officials:** only an admin can create accounts (`ALLOW_PUBLIC_SIGNUP` optionally allows beneficiary self-sign-up only).
- Each app has a **Security** page: 2-step verification, change password, signed-in devices (sign out one or all others), and the last sign-in time and address.

**Platform hardening**
- Security headers on every API response (CSP, no-sniff, no framing, no-referrer, `no-store` caching, HSTS in production) and a strict Content-Security-Policy on the Sentinel and Setu web servers (`*/nginx.conf`): scripts only from the site itself, no third-party script CDNs.
- Tokens travel only in the `Authorization` header — no cookies, so cross-site request forgery doesn't apply; CORS credentials are off.
- Uploads: size cap (`MAX_UPLOAD_MB`), allowed file types only, and sanitised file names that can't escape the storage folder. Evidence keeps its SHA-256 check at capture and on the server.
- Every sign-in, failed sign-in, lockout, sign-out, password change and 2-step change is written to the **hash-chained audit log** Sentinel verifies.
- `ENV=production` refuses to start with a default secret, `CORS_ORIGINS=*` or `DEBUG=true`, and turns off the interactive API docs. Errors never expose stack traces (each carries a request id for the logs).
- Aadhaar, bank account and phone numbers are masked on screen. API keys (Yukt, Bhashini) stay on the server; Yukt only proposes actions and the user confirms each one.

**Before going live:** set `ENV=production`, a random `JWT_SECRET_KEY` (`openssl rand -hex 32`), real `CORS_ORIGINS`, serve over HTTPS (then enable the HSTS line in the nginx configs), and change the test-account passwords.

---

## What's real vs. what's a documented integration point

Being precise about this matters more than it might seem — judges specifically probe for overclaiming (see Section 13 of the original problem-statement analysis this project is built from). Answer honestly if asked "what was actually built vs. simulated":

**Fully implemented and tested:**
- CSPRNG assignment engine with fairness constraint
- SHA-256 hash-at-capture and server-side verification (rejects real tampering)
- Isolation Forest anomaly detection (trained on real synthetic data, genuinely flags the injected pattern)
- Perceptual-hash video tamper/loop detection
- Haversine geofencing
- Full auth + RBAC across every endpoint, including institute-scoped data isolation (one institute's staff can never see another's findings, documents, or grievances)
- Sentinel (React dashboard): live map, alerts ledger, camera health wall, cross-institute analytics, renewal approval
- Setu (institute/beneficiary web app): compliance score view, findings with document-response upload, grievance submission — all against the real API, not mocked data

**Documented integration points, not wired to real infra (by design — see the reasoning inline in each file):**
- **Face-match attendance** (`backend/app/services/face_match.py`) — a deterministic stub implementing the real `FaceMatcher` interface the endpoint calls; swapping in DeepFace/ArcFace is a one-class change, documented in the file's docstring. Left out of this build because it's a heavy dependency (large model weights, GPU preference) that doesn't belong in a lean pilot deployment.
- **Jitsi WebRTC dial-out** (`backend/app/api/v1/vc.py`) — the call record, pickup window, and `vc_miss` alert logic are real; the actual dial-out is a documented integration point (Jitsi self-hosting instructions were part of the original architecture plan).
- **CCTV Wall live video** (Sentinel's Cameras page) — this is connection-health monitoring (online/stale/offline, based on last-ping time), a real and useful signal, but genuinely not a live video feed. Actual video streaming needs a WebRTC/RTSP gateway, a materially heavier piece of infrastructure documented as a separate integration step, not quietly implied by the UI.
- **S3 object-lock (WORM) retention** — the storage adapter supports S3/MinIO; the actual `mc retention set --default COMPLIANCE` step is a deployment-time command, not application code.
- **Nayan (Flutter mobile)** — built and tested in CI (analyze, widget tests, APK + web builds); it runs fully on mock data and switches to this backend once given its address.

---

## SIH demo flow (5 minutes)

1. **Problem, 30 sec** — "Inspections are announced, so institutes prepare for them."
2. **Live random assignment, 45 sec** — hit `/assignments/generate` in Swagger twice, show two different institute/inspector pairs. "This is a live cryptographic draw, not a lookup table."
3. **Evidence capture, 60 sec** — upload a real photo through `/evidence/upload`, then upload the same request with a deliberately wrong hash and show the instant rejection.
4. **Sentinel's cross-institute view, 45 sec** — open Analytics (portfolio-wide score/status breakdown) and the Cameras page (health wall) — "the official's job is watching the whole portfolio, not one institute at a time."
5. **Setu closing the loop, 45 sec** — log in as `staff@dosje.gov.in` in Setu, show a finding, respond with a document upload — "the institute isn't just being watched, they have a real channel to respond."
6. **Anomaly alert, 30 sec** — back in Sentinel's Alerts page, show the real Isolation Forest-generated alert with its computed score.
7. **Close on scale, 30 sec** — one line on the phased rollout (pilot → district → state), then Q&A.
