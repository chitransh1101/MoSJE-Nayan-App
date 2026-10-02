# Nayan · नयन — Monitoring & Inspection App

Nayan is the **centralized app** of **DOSJE NIGRANI** — one sign-in screen for every stakeholder in the problem statement:
- **DoSJE officials / state & district authorities** — live monitoring, CCTV, random VC, random assignment, insights.
- **Inspection / PMU teams** — field visits with geo-tagged, SHA-256-sealed evidence.
- **Institute staff (NGOs / projects)** — findings and replies, compliance documents, residents, grievances, notices.
- **Beneficiaries** — own status, schemes and benefits, grievances (optionally confidential), calls with the Department, rights.

Sentinel (officials' web dashboard) and Setu (institute/beneficiary web portal) stay available as browser front-ends over the **same backend and the same data**.

An official assigns a visit. The inspector opens it in Nayan, goes to the institute and captures evidence. Every photo or video is sealed on the phone with GPS, the time, the device ID and a **SHA-256** hash. The server recomputes the hash on arrival and verifies the file.

It is one Flutter codebase that runs as:
- an **Android app** (APK now, Play Store later);
- a **web app** that installs to the home screen on **iPhone** and Android;
- an **iPhone app** once an Apple Developer account is available.

---

## What is inside

| Feature | What it does |
|---|---|
| Real-time monitoring dashboard | Institutes (red, amber, green ring), open alerts, cameras live, attendance today, anomaly flags and VC checks. The LIVE ticker updates on its own. |
| Institutes map | Every institute in scope plotted at its real coordinates (OpenStreetMap), filter by status, open CCTV or directions. |
| Live CCTV | Feeds load dynamically from each camera's configured `snapshot_url` / `stream_url`. A camera with no stream configured, or offline, shows a plain "no picture" placeholder — nothing is simulated. Frozen, looping and offline feeds are flagged. |
| Random VC | The app picks an in-charge, staff member or beneficiary at random (CSPRNG, seed sealed). A Jitsi-compatible room opens and the outcome is recorded. Call log filters. |
| Random assignment | Risk-weighted draw: compliance 35%, alerts 25%, time since last visit 20%, anomalies 20%, with conflict-of-interest rules. Seed, SHA-256 seal and "Verify" make the draw reproducible. |
| Inspection module | Location → photo/video with GPS + time + device + SHA-256 → checklist → remarks → upload, with per-file server verification. |
| Geo-tagged reports | PDF with GPS, map link, checklist, remarks, file hashes and photos. One-tap download from the reports list; filter by status and institute. |
| Anomaly & attendance analytics | 30-day attendance chart with the expected band; flags spikes, flat-lines (proxy), above-enrolment and CCTV-down attendance. |
| Institute portal | Reply to findings and attach proof, upload compliance documents, view residents, raise and track grievances (21-day limit, auto-escalation), notices. |
| Beneficiary portal | My status (institute, benefits, health, documents), scheme catalogue and enrolment requests, confidential grievances, request a call with the Department, rights and helplines. |
| Yukt assistant | Answers questions about the app and the user's own data; voice questions and spoken replies through the backend's Bhashini integration. Every action asks for confirmation. |

### Data: mock data for testing

The problem statement provides no official database or data link, so the backend seeds a **mock dataset** (fictional institutes, people and events) into its own database for testing, and the app falls back to an equivalent **in-memory mock store** when no server is configured. Every screen reads through the same API calls either way; screens showing mock data carry a **Mock** badge. Connecting the department's real database only requires pointing the backend at it — no screen has fixed data.

**Test accounts** we created for this demo (password `Password123!`):
- `inspector1@dosje.gov.in`: Farhan Qureshi (PMU / inspector)
- `inspector2@dosje.gov.in`: Meera Nair (PMU / inspector)
- `official@dosje.gov.in`: Anita Deshmukh (DoSJE division)
- `district@dosje.gov.in`: Rakesh Srivastava (District authority, Lucknow)
- `staff@dosje.gov.in`: Sunita Rao (Institute staff, Ashray Balika Grih)
- `beneficiary@dosje.gov.in`: Kavya Iyer (Beneficiary, Ashray Balika Grih)

A draw made as the official shows up in the chosen inspector's visits on the same phone.

**Screenshots:** every CI run publishes phone-size screenshots of the main screens to the `screenshots` branch.

---

## Getting it on phones (no computer setup needed)

1. Create an empty GitHub repo (for example `nayan-app`, public) and push this folder to it.
2. In the repo, go to **Settings → Pages** and set *Source* to **GitHub Actions**.
3. Every push to `main` runs **Actions → Build Nayan**. It takes about 10 minutes and produces:
   - **Android:** *Releases → latest → `nayan.apk`*. Open that link on the phone and install it (allow "Install unknown apps" once).
   - **iPhone / any phone:** `https://<username>.github.io/<repo>/`. Open it in Safari, then **Share → Add to Home Screen**. It opens full-screen like an app, and camera and GPS work.
4. **iOS native build** (optional): *Actions → Build Nayan → Run workflow* with "Build iOS" ticked. This only checks that it compiles; installing it needs an Apple Developer account.

### Connecting the real backend

1. Set the repo variable **`API_BASE`** (Settings → Secrets and variables → Actions → Variables), for example `https://api.example.gov.in/api/v1`. It is then baked into every build.
2. Inspectors can also change the server from the ⚙ on the login screen.
3. Requirements:
   - The backend must be reachable over **HTTPS** (phones can't reach `localhost`).
   - For the web app, FastAPI needs **CORS** allowing `https://<username>.github.io`.

API used (same contract as Sentinel):

```
POST /auth/login        {email, password} → {access_token, role, name, user_id}
GET  /assignments       → [{id, inspector_id, institute_id, created_at, due_at?, status?, priority?, instructions?}]
GET  /institutes        → optional, used for names and GPS
POST /evidence/upload   multipart: file, assignment_id, client_hash, gps_lat, gps_lng, device_id, captured_at, kind
                        → {status: "OK" | "REJECTED", reason?, evidence?: {id}}
POST /inspections       optional: {assignment_id, remarks, checklist, evidence_ids, client_hashes, gps_lat, gps_lng, ...}
GET  /cameras           [{id, institute_id, name, status, last_ping_at, snapshot_url?, stream_url?}]
GET  /alerts            · PATCH /alerts/{id}/action {action: reviewed|escalated}
GET  /inspectors        [{id, name, designation, district, state, status, assigned_institute_ids}]
POST /assignments/generate  {institute_id, inspector_id, dispatch_time, strategy, seed_commitment}
GET  /vc/directory?institute_id=  · GET/POST /vc/calls        optional
GET  /analytics/attendance?institute_id=                     optional
POST /assistant/chat    optional: Yukt on the server (keys stay on the server)
```

---

## Building on your own computer

With Flutter installed (stable channel):

```bash
flutter create . --platforms=android,ios,web --org in.gov.dosje --project-name nayan
flutter pub get
dart run tool/setup_platforms.dart      # permissions, app name, web-app settings
dart run flutter_launcher_icons         # app icons
flutter run                             # on a connected phone
flutter build apk --release             # Android APK
flutter build web --release             # web app in build/web
```

`flutter create .` only adds the missing platform folders. It does not overwrite `lib/main.dart`.

## Play Store / App Store (later)

- **Play Store:**
  - a Google Play Console account;
  - an upload key (added to the Android signing config);
  - `flutter build appbundle`;
  - a privacy policy URL (camera + location);
  - the Data safety form.
  New personal developer accounts must first run a closed test, so check Google's current rules before submitting.
- **App Store:**
  - an Apple Developer account;
  - a signing certificate and provisioning profile;
  - then build and upload to TestFlight from the macOS runner.

## Project layout

```
lib/main.dart                 the whole app (sections §1–§12)
test/widget_test.dart         smoke test: splash → login → demo sign-in → role guard
tool/setup_platforms.dart     patches AndroidManifest, Info.plist, web manifest/index
assets/icon/                  app icon (eye with tricolour lids)
.github/workflows/build.yml   APK + web app + optional iOS
```
