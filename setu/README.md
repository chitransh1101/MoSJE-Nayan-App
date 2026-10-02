# Setu · सेतु — beneficiary & institute services portal

Setu is the Ministry of Social Justice & Empowerment's **web portal** for the
people in welfare institutes: **beneficiaries** (residents) and **institute
staff**. It is one of three platforms on one backend:

| Platform | For | What it is |
|---|---|---|
| **Sentinel** | Officials & administrators | Web console (separate project) |
| **Setu** (this project) | Beneficiaries & institute staff | Web portal |
| **Nayan** | Inspectors | Android app (separate project) |

The whole app is in **`src/App.jsx`** (sections §1–§17, table of contents at the top).

## Run it

```bash
npm install
npm run dev          # http://localhost:5174 — uses the backend at /api/v1 (proxied to :8000)
npm run dev:mock     # same, with the built-in demo data and no backend at all
npm run build        # production build in dist/
```

`standalone/setu.html` is the whole portal in one file with demo data — double-click to open.

### Demo data, always

* **"Use a demo account"** on the sign-in page (21 beneficiaries, 5 institute
  staff, password filled in) always opens the built-in demo record — on
  localhost too, whether or not a backend is running.
* No backend, a backend that doesn't answer, or a backend that lacks a
  section's route: that section is filled from the same person's demo record
  (within ~6 s at most), marked **Demo data** in the header. Nothing stays blank.
* A real server error on sign-in (with a typed account) shows the message
  with **Try again** and **Continue with demo data**.

## Sign-in page

Two portals, clearly separate: **Beneficiary** (green, the waving national
flag) and **Institute** (navy, the Setu bridge drawing itself). Numbered boxes
— State, Language, Institute, then email and password — fill in any order.
The page fits a laptop screen without scrolling and scales up on large screens.
Signing out clears everything: blank fields, fresh demo data, default settings.
Reloading the page always returns here (the session is kept in memory only).

## Inside the portal

* **Left sidebar** — grouped options with small Hindi beneath each, a
  tricolour marker and glassy hover; the small arrow on its edge collapses it
  into an icon rail. Sign out lives in the profile menu (top right). On phones
  it becomes a slide-in menu.
* **Notice board · सूचना पट्ट** (at the bottom of the sidebar) — always on: it scrolls
  upward through the person's own updates (payments, documents, grievances,
  calls, notices) with short tips in between; pauses on hover; every entry
  opens its page. On short screens it turns one notice at a time.
* **Welcome banner, colour-coded key figures**, action required, coming up,
  application status with stage tracks, payments chart, documents, activity.
* **Yukt** — the assistant (same as Sentinel's, fitted to Setu): answers from
  the person's own record, knows every feature, and — only after you press
  Confirm — raises a grievance, requests a call, asks for scheme enrolment,
  opens the benefit statement, changes language, signs out. Hindi, English,
  Hinglish; 22 languages via the server's translation service.
* **Guided tour** — opens once per sign-in (and from the Overview, the
  account menu, or "show me around" to Yukt), and says plainly when the data
  is a demo.
* **Language** — default **English + हिन्दी** (Hindi beneath every option),
  **English only**, or any of the 22 scheduled languages.
* **Dark mode**, high contrast, A− / A / A+ in the top bar.
* Government-standard header (Ashoka Chakra, भारत सरकार | Government of India)
  and footer (ownership, last updated).

**Beneficiary pages:** Overview, Activity, Benefits & applications (with a
printable benefit statement), Schemes & eligibility (request enrolment),
Documents & verification, My grievances + Raise a grievance, Verification
calls, Updates & notices, Rights & entitlements, My profile, Help, Know about Nayan.

**Institute pages:** Overview (compliance, residents' payments and
applications, residents needing help), Residents, Findings (respond with
evidence), Registration renewal, Institute profile, Documents (incl. on behalf
of a resident), Grievances, Notices, Help.

## Security

* **Session in memory only.** No token or profile is kept in localStorage,
  sessionStorage, IndexedDB or cookies (keys left by older versions are
  deleted at start). Reloading or reopening Setu — whatever address — always
  opens the sign-in page; after sign-in the portal opens at its home page.
* **Idle sign-out.** After 13 minutes without activity a dialog counts down
  2:00 (*Stay signed in* renews the session, *Sign out now*); at 15 minutes
  Setu signs out and the sign-in page says why. Judged by timestamps, so a
  sleeping tab is handled correctly when it wakes.
* **Tokens.** The access token is renewed silently (`POST /auth/refresh`)
  when under 3 minutes remain and the person was active in the last 5. Any
  401 ends the session with a calm note ("Your session ended…"), never a loop.
* **Sign-out** (button, Yukt, idle, 401) tells the server (`/auth/logout`),
  wipes all in-memory data, sessionStorage, the start choices and display
  settings, and signs out other open Setu tabs (`BroadcastChannel "setu-auth"`).
* **Sign-in form.** Email trimmed and lower-cased, Caps Lock warning,
  show/hide password, one request at a time, plain messages for wrong
  password (with tries left), lock (423, with a live countdown), rate limit
  (429), disabled account (403) and network trouble. **2-step verification**:
  6-digit code (paste works, signs in on the sixth digit) or a recovery code.
* **Security page** (account menu → Security, or My profile): last sign-in
  time and address, 2-step verification (turn on: password → key with Copy /
  authenticator link → code → recovery codes shown once with Copy and
  Download; turn off), change password (live checklist and strength meter),
  and the devices signed in (sign out one, or all others).
* **Live data.** While the tab is visible the page's data refreshes every
  minute and on returning to the tab ("Updated … ago" and a refresh button in
  the header) — scroll, filters, open dialogs and typed text are untouched.
* **Sensitive numbers** are shown masked: Aadhaar `XXXX XXXX 1234`, bank
  account `•••• 1234`, phone `•••••• 1234`.
* Every request carries `X-Client: setu-web/<version>` (the device label in
  the session list). Routes: `/auth/*` in §4 of `App.jsx` (tag **AGREED**).
* **Demo:** everything above works against the demo account — the code is
  `123456` wherever one is asked. Turn on 2-step from Security, sign out,
  and the next sign-in asks for the code. On a real server that doesn't have
  a security route yet, that part says "Available when connected to the server".

## Backend contract

Every URL is in §4 of `App.jsx`, tagged **CONFIRMED**, **DERIVED** or
**ASSUMED**, with the expected response shape. Yukt's server routes are
`/assistant/status`, `/assistant/chat` (sent with `app: "setu"`),
`/assistant/translate`, `/tts`, `/asr` — without them Yukt uses its built-in engine.

**Account creation** is not built yet (to be decided): set the `SIGN_UP`
constant in §11 to a route and a "Create an account" link appears.
