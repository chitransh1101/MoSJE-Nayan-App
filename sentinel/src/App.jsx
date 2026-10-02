/**
 * DoSJE Sentinel — the entire application, in one file.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Everything lives here on purpose: edit this file, save, and the dev server
 * hot-reloads the change immediately. No hunting across folders.
 *
 * ── HOW TO FIND THINGS ──────────────────────────────────────────────────────
 * Search for the section marker (including the § symbol) to jump straight to it:
 *
 *   §1   VOCABULARY      status labels, alert-type names, role names
 *   §2   FORMATTING      dates, scores, ids, masking Aadhaar / bank / phone
 *   §3   AGGREGATION     the maths behind every chart
 *   §4   API CONTRACT    every backend URL, tagged CONFIRMED/DERIVED/ASSUMED
 *   §5   MOCK DATA       the demo institutes, alerts, cameras, grievances
 *   §6   MOCK TRANSPORT  fake backend used by `npm run dev:mock`
 *   §7   HTTP CLIENT     axios setup, auth header, error messages, masking
 *   §7a  SESSION         in-memory session, idle sign-out, token refresh, tabs
 *   §8   DATA HOOK       useApi — loading / error / reload, 60 s auto-refresh
 *   §9   UI KIT          Card, Button, Badge, Table, Modal, empty states
 *   §9b  DATA VIEW       filter / search / sort / group / saved views / CSV
 *   §9c  EXCEL WRITER    real .xlsx workbooks, no library
 *   §10  CHARTS          StatTile, ShareBar, BarList, TimeColumns, Meter
 *   §11  AUTH            who is signed in, what they may do, idle warning
 *   §12  TOASTS          confirmation messages
 *   §13  NAVIGATION      theme, gov strip, top tabs, live ticker, app shell
 *   §13b YUKT            the assistant (युक्त) — AI + Bhashini + actions
 *   §13c LANGUAGE        English + Hindi labels, t()
 *   §13d INSPECTORS      assigned inspector, Connect with Inspector (messaging)
 *   §14  PAGE: Login
 *   §15  PAGE: Overview
 *   §16  PAGE: Map
 *   §17  PAGE: Alerts
 *   §18  PAGE: Cameras
 *   §19  PAGE: Register (institute list)
 *   §20  PAGE: Institute detail
 *   §21  PAGE: Analytics
 *   §22  PAGE: Draw (assignments)
 *   §23  PAGE: Grievances
 *   §24  PAGE: Renewals
 *   §25  ROUTES          which URL shows which page
 *   §26  PAGE: Districts (heatmap + ranking)
 *   §27  PAGE: Reports (PDF + Excel)
 *   §28  PAGE: Audit trail (hash-chained)
 *   §29  PAGE: Accessibility
 *   §30  PAGE: Inspectors (field team)
 *   §31  PAGE: Security (password, 2-step verification, devices)
 *
 * ── THINGS THAT ARE *NOT* IN THIS FILE ──────────────────────────────────────
 *   Colours, fonts, spacing  → tailwind.config.js
 *   Global CSS / Leaflet     → src/index.css
 *   Dev server & API proxy   → vite.config.js
 *
 * ── A WARNING ───────────────────────────────────────────────────────────────
 * One file means one syntax error blanks the whole app. If the screen goes
 * white, open the browser console (F12) — the error names the line number.
 */

import axios from "axios";
import L from "leaflet";
import {
  Component,
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

/** Where the app is served from: "/" normally, "/Nayan/sentinel/"-style
 *  sub-paths on GitHub Pages (set by `vite build --base`). */
const ROUTER_BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "") || undefined;


/* ══════════════════════════════════════════════════════════════════════════
   §1  VOCABULARY
   What the backend stores → what an official reads.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Vocabulary the backend stores, mapped to words an official reads.
 *
 * Every lookup here is open: an unknown value coming back from the server is
 * humanised (`attendance_spike` -> "Attendance spike") rather than rendered as
 * a blank or a raw enum. The backend can add an alert type tomorrow and this
 * dashboard will show it sensibly without a frontend release.
 */

/** institutes.status — 10 chars, seeded values green | yellow | red. */
const INSTITUTE_STATUS = {
  green: { label: "Compliant", tone: "good", glyph: "check" },
  yellow: { label: "Watch", tone: "watch", glyph: "watch" },
  red: { label: "Flagged", tone: "flag", glyph: "flag" },
};

/** camera_feeds.status — online | stale | offline. */
const CAMERA_STATUS = {
  online: { label: "Online", tone: "good", glyph: "check" },
  stale: { label: "Feed stale", tone: "watch", glyph: "watch" },
  offline: { label: "Offline", tone: "flag", glyph: "flag" },
};

/** institutes.renewal_status — pending | approved | rejected. */
const RENEWAL_STATUS = {
  pending: { label: "Pending", tone: "watch", glyph: "watch" },
  approved: { label: "Approved", tone: "good", glyph: "check" },
  rejected: { label: "Rejected", tone: "flag", glyph: "flag" },
};

/** alerts.severity — 10 chars; the seed and tests use red | yellow. */
const SEVERITY = {
  red: { label: "Critical", tone: "flag", glyph: "flag", rank: 0 },
  yellow: { label: "Warning", tone: "watch", glyph: "watch", rank: 1 },
};

/** alerts.status — open until an official acts on it. */
const ALERT_STATUS = {
  open: { label: "Open", tone: "neutral" },
  reviewed: { label: "Reviewed", tone: "good" },
  escalated: { label: "Escalated", tone: "flag" },
};

/** grievances.status. */
const GRIEVANCE_STATUS = {
  open: { label: "Open", tone: "watch", glyph: "watch" },
  in_review: { label: "In review", tone: "neutral", glyph: "watch" },
  resolved: { label: "Resolved", tone: "good", glyph: "check" },
};

/**
 * alerts.type — 30 chars. `attendance_spike` and `vc_miss` are confirmed by
 * test_setu_sentinel_endpoints.py; the rest follow the detectors the README
 * describes. Anything not listed still renders, just without the gloss.
 *
 * The label map exists because humanise() alone produces "Cctv tamper" and
 * "Vc miss" — acronyms it has no way to know about. Unknown types still fall
 * through to humanise(), so a new detector needs no frontend change.
 */
const ALERT_TYPE_LABEL = {
  attendance_spike: "Attendance spike",
  anomaly: "Anomaly detected",
  vc_miss: "Missed verification call",
  hash_mismatch: "Evidence hash mismatch",
  geofence_breach: "Geofence breach",
  camera_offline: "Camera offline",
  cctv_tamper: "CCTV tamper",
};

const ALERT_TYPE_NOTE = {
  attendance_spike: "Attendance deviates sharply from this institute's own baseline",
  anomaly: "This day stood out as an outlier against the institute's own history",
  vc_miss: "A beneficiary verification call went unanswered inside the pickup window",
  hash_mismatch: "Evidence arrived with a hash that did not match its bytes",
  geofence_breach: "Evidence was captured outside the institute's 500m geofence",
  camera_offline: "A camera feed stopped reporting",
  cctv_tamper: "Perceptual hashing found a frozen or looping feed",
};

const INSTITUTE_TYPE_LABEL = {
  shelter: "Shelter home",
  hostel: "Hostel",
  school: "School",
  old_age_home: "Old age home",
  rehab_centre: "Rehabilitation centre",
};

const ROLE_LABEL = {
  admin: "Administrator",
  official: "Official",
  inspector: "Inspector",
  institute_staff: "Institute staff",
  beneficiary: "Beneficiary",
};

/** Turns any unknown snake_case enum into readable words. */
function humanise(value) {
  if (!value) return "—";
  return String(value)
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function instituteStatus(value) {
  return INSTITUTE_STATUS[value] || { label: humanise(value), tone: "neutral", glyph: "dot" };
}
function cameraStatus(value) {
  return CAMERA_STATUS[value] || { label: humanise(value), tone: "neutral", glyph: "dot" };
}
function renewalStatus(value) {
  return RENEWAL_STATUS[value] || { label: humanise(value), tone: "neutral", glyph: "dot" };
}
function severity(value) {
  return SEVERITY[value] || { label: humanise(value), tone: "neutral", glyph: "dot", rank: 2 };
}
function alertStatus(value) {
  return ALERT_STATUS[value] || { label: humanise(value), tone: "neutral" };
}
function grievanceStatus(value) {
  return GRIEVANCE_STATUS[value] || { label: humanise(value), tone: "neutral", glyph: "dot" };
}
function instituteType(value) {
  return INSTITUTE_TYPE_LABEL[value] || humanise(value);
}
function alertTypeLabel(value) {
  return ALERT_TYPE_LABEL[value] || humanise(value);
}
// These pages imported `severity` under an alias to avoid clashing with a local
// variable. Kept as aliases so the page bodies below are unchanged.
const severityOf = severity;


/* ══════════════════════════════════════════════════════════════════════════
   §2  FORMATTING
   ══════════════════════════════════════════════════════════════════════════ */

/** Formatting helpers. Dates from the API are naive UTC (sa.DateTime, no tz). */

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TIME_ONLY = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" });

/**
 * The backend column is a naive DateTime, so values may arrive without a zone
 * marker. Treat those as UTC instead of silently reading them as local time —
 * an alert timestamped six hours off is worse than no timestamp.
 */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
  const d = parseDate(value);
  return d ? DATE_TIME.format(d) : "—";
}

function formatDate(value) {
  const d = parseDate(value);
  return d ? DATE_ONLY.format(d) : "—";
}

function formatTime(value) {
  const d = parseDate(value);
  return d ? TIME_ONLY.format(d) : "—";
}

/** "4 min ago", "3 days ago" — for freshness, where the exact stamp is noise. */
function relativeTime(value) {
  const d = parseDate(value);
  if (!d) return "—";
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

/** compliance_score is Numeric(5,2) — it arrives as a string from some drivers. */
function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatScore(value) {
  const n = toNumber(value, null);
  return n === null ? "—" : n.toFixed(1).replace(/\.0$/, "");
}

/** UUIDs are unreadable in full; the first block is enough to match a row. */
function shortId(id) {
  return id ? String(id).slice(0, 8) : "—";
}

function pluralise(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

/* ------------------------------------------------------ sensitive values -- */
/**
 * Aadhaar, bank account and phone numbers are never shown in full, wherever
 * they appear. The server should already send them masked; these run again on
 * every API response (see redactSensitive in §7), so a field the server forgot
 * to mask — or a number a beneficiary typed into a grievance — still comes out
 * as XXXX XXXX 1234 / •••• 1234 / +91 ••••• ••123.
 */
const lastDigits = (value, n) => String(value ?? "").replace(/\D/g, "").slice(-n);

function maskAadhaar(value) {
  const last = lastDigits(value, 4);
  return last ? `XXXX XXXX ${last}` : "—";
}

function maskBankAccount(value) {
  const last = lastDigits(value, 4);
  return last ? `•••• ${last}` : "—";
}

function maskPhone(value) {
  const s = String(value ?? "");
  if (s.includes("•") || /x{3,}/i.test(s)) return s; // already masked upstream
  const last = lastDigits(s, 3);
  return last ? `+91 ••••• ••${last}` : "—";
}

// The look-arounds keep digits inside ids, hashes and seeds (hex runs) and
// decimals from ever matching. Phones run first: "+91" needs its plus sign,
// so a 12-digit Aadhaar starting 91… is left for the Aadhaar pattern.
const ACCOUNT_IN_TEXT = /((?:a\/c|acct|account|bank account|खाता)(?:\s*(?:no\.?|number|संख्या))?[\s:#.-]*)(\d[\d -]{7,20}\d)(?![\w])/gi;
const PHONE_IN_TEXT = /(?<![\w.])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\w])/g;
const LANDLINE_IN_TEXT = /(?<![\w.])0\d{2,4}[\s-]?\d{6,8}(?![\w])/g;
const AADHAAR_IN_TEXT = /(?<![\w.])\d{4}[ -]?\d{4}[ -]?\d{4}(?![\w])/g;

/** Masks numbers that look like Aadhaar, bank accounts or phones inside prose. */
function redactFreeText(text) {
  if (typeof text !== "string" || !/\d{8}|\d{4}[ -]\d{4}|\d{5}[ -]\d{5}/.test(text)) return text;
  return text
    .replace(ACCOUNT_IN_TEXT, (_, label, digits) => `${label}${maskBankAccount(digits)}`)
    .replace(PHONE_IN_TEXT, (m) => maskPhone(m))
    .replace(LANDLINE_IN_TEXT, (m) => maskPhone(m))
    .replace(AADHAAR_IN_TEXT, (m) => maskAadhaar(m));
}

// Field names → how to mask them. Free-text fields get the prose scan.
const SENSITIVE_FIELDS = [
  [/aadh?aar/i, maskAadhaar],
  [/bank.*(account|acc|a_c)|account_(no|number)$|^account$/i, maskBankAccount],
  [/(^|_)(phone|mobile|contact_number|msisdn)(_|$)/i, maskPhone],
];
const FREE_TEXT_FIELDS = /^(description|body|subject|detail|reply|text|note|notes|message|comment|reason|summary|entity_label)$/;

// Masked copy → the object as the server sent it. Only integrity checks read
// it: the audit chain (§3) must be hashed over the server's exact values.
const UNREDACTED = new WeakMap();
const unredacted = (obj) => UNREDACTED.get(obj) || obj;

/** Deep copy of an API payload with every sensitive value masked. */
function redactSensitive(value, key = "") {
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, key));
  if (value && typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      out[k] = redactSensitive(v, k);
    });
    UNREDACTED.set(out, value);
    return out;
  }
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return value;
  if (/_masked$/.test(key)) return value;
  const rule = SENSITIVE_FIELDS.find(([re]) => re.test(key));
  if (rule) return rule[1](value);
  return FREE_TEXT_FIELDS.test(key) ? redactFreeText(value) : value;
}

/* ══════════════════════════════════════════════════════════════════════════
   §3  AGGREGATION
   Every number charted is derived from a real endpoint.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Client-side aggregation.
 *
 * Deliberate constraint: every number Sentinel charts is computed from data an
 * endpoint in endpoints.js actually returns. Nothing here invents a metric the
 * backend cannot produce — no fabricated trend lines, no placeholder series. If
 * the backend later exposes a real aggregate for one of these, the chart should
 * move to it and the helper here should be deleted.
 */


/** Counts by an arbitrary key, returned sorted high -> low. */
function countBy(rows = [], key) {
  const map = new Map();
  for (const row of rows) {
    const k = typeof key === "function" ? key(row) : row[key];
    if (k === null || k === undefined || k === "") continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** A fixed-order tally, so a zero bucket still occupies its slot in the chart. */
function tally(rows = [], key, order) {
  const counts = Object.fromEntries(order.map((k) => [k, 0]));
  for (const row of rows) {
    const k = typeof key === "function" ? key(row) : row[key];
    if (k in counts) counts[k] += 1;
  }
  return counts;
}

/**
 * Alerts per day for the last `days` days, oldest first, with empty days kept
 * as real zeros — dropping them would turn a quiet week into a misleadingly
 * smooth line.
 */
function alertsPerDay(alerts = [], days = 14) {
  const buckets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    buckets.push({ date: day, key: dayKey(day), value: 0, critical: 0 });
  }
  const index = new Map(buckets.map((b) => [b.key, b]));

  for (const alert of alerts) {
    const d = parseDate(alert.created_at);
    if (!d) continue;
    const bucket = index.get(dayKey(d));
    if (!bucket) continue;
    bucket.value += 1;
    if (alert.severity === "red") bucket.critical += 1;
  }
  return buckets;
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Compliance scores grouped into 10-point bands, low -> high. */
function scoreHistogram(institutes = []) {
  const bands = [
    { name: "0–59", min: 0, max: 60, value: 0 },
    { name: "60–69", min: 60, max: 70, value: 0 },
    { name: "70–79", min: 70, max: 80, value: 0 },
    { name: "80–89", min: 80, max: 90, value: 0 },
    { name: "90–100", min: 90, max: 101, value: 0 },
  ];
  for (const inst of institutes) {
    const score = toNumber(inst.compliance_score, null);
    if (score === null) continue;
    const band = bands.find((b) => score >= b.min && score < b.max);
    if (band) band.value += 1;
  }
  return bands;
}

/** The institutes an official should look at first: flagged, then lowest score. */
function worstFirst(institutes = []) {
  const rank = { red: 0, yellow: 1, green: 2 };
  return [...institutes].sort((a, b) => {
    const byStatus = (rank[a.status] ?? 3) - (rank[b.status] ?? 3);
    if (byStatus !== 0) return byStatus;
    return toNumber(a.compliance_score, 101) - toNumber(b.compliance_score, 101);
  });
}

/** Critical before warning, then newest first. */
function alertsByUrgency(alerts = []) {
  const rank = { red: 0, yellow: 1 };
  return [...alerts].sort((a, b) => {
    const bySeverity = (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2);
    if (bySeverity !== 0) return bySeverity;
    const da = parseDate(a.created_at)?.getTime() ?? 0;
    const db = parseDate(b.created_at)?.getTime() ?? 0;
    return db - da;
  });
}

/** Indexes institutes by id so alert/camera rows can name their institute. */
function byId(rows = []) {
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Cameras that went dark recently, which the README calls out as a signal in
 * its own right — a feed dropping just before a visit is worth surfacing.
 */
function darkCameras(cameras = []) {
  return cameras.filter((c) => c.status === "offline" || c.status === "stale");
}

/** Mean of a numeric column, ignoring nulls; null when there is nothing to average. */
function mean(rows = [], key) {
  const values = rows.map((r) => toNumber(r[key], null)).filter((v) => v !== null);
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}


/* ------------------------------------------------------ grievance SLA ----- */
/**
 * Response windows, modelled on CPGRAMS (which resolves within 21 days): a
 * first response within 3 days, resolution within 21 days of the grievance
 * reaching its current level. Escalating starts a fresh window at the next
 * level. If the server sends `sla_due_at`, that wins over this arithmetic.
 */
const GRIEVANCE_SLA = { firstResponseDays: 3, resolveDays: 21, dueSoonDays: 3 };

const ESCALATION_LEVELS = [
  { level: 1, short: "L1", label: "District Social Welfare Officer", hi: "ज़िला समाज कल्याण अधिकारी" },
  { level: 2, short: "L2", label: "State Directorate", hi: "राज्य निदेशालय" },
  { level: 3, short: "L3", label: "Department (Ministry)", hi: "विभाग, मंत्रालय" },
];
const escalationLevel = (n) => ESCALATION_LEVELS[Math.min(Math.max((n || 1) - 1, 0), ESCALATION_LEVELS.length - 1)];

const SLA_STATE = {
  breached: { label: "Breached", hi: "समय-सीमा पार", tone: "flag", glyph: "flag", rank: 0 },
  due_soon: { label: "Due soon", hi: "जल्द देय", tone: "watch", glyph: "watch", rank: 1 },
  on_track: { label: "On track", hi: "समय पर", tone: "good", glyph: "check", rank: 2 },
  closed: { label: "Closed", hi: "बंद", tone: "neutral", glyph: "dot", rank: 3 },
};

/** Everything a grievance card needs to show about its clock. */
function grievanceSla(g, now = Date.now()) {
  const created = parseDate(g.created_at)?.getTime() ?? now;
  const started = parseDate(g.escalated_at)?.getTime() ?? created;
  const due = parseDate(g.sla_due_at)?.getTime() ?? started + GRIEVANCE_SLA.resolveDays * DAY_MS;
  const window = Math.max(1, due - started);
  const remaining = due - now;
  const level = g.escalation_level || 1;
  let state;
  if (g.status === "resolved") state = "closed";
  else if (remaining < 0) state = "breached";
  else if (remaining <= GRIEVANCE_SLA.dueSoonDays * DAY_MS) state = "due_soon";
  else state = "on_track";
  return {
    state,
    due,
    remaining,
    daysLeft: Math.ceil(remaining / DAY_MS),
    daysOver: Math.floor(-remaining / DAY_MS),
    pct: Math.min(100, Math.max(0, ((now - started) / window) * 100)),
    ageDays: Math.floor((now - created) / DAY_MS),
    firstResponseOverdue: g.status === "open" && now - created > GRIEVANCE_SLA.firstResponseDays * DAY_MS,
    level,
    canEscalate: g.status !== "resolved" && level < ESCALATION_LEVELS.length,
  };
}

/* ------------------------------------------------------ district roll-up -- */
/**
 * One row per district. `attention` is a 0–100 index — higher needs more
 * attention — so districts can be ranked on one number without hiding the
 * parts it's made of (every part is its own column on the Districts page):
 *   45% compliance gap (100 − average score)
 *   20% share of institutes flagged red
 *   15% open alerts per institute (4 per institute = full weight)
 *   10% share of camera feeds dark
 *   10% breached grievances per institute (2 per institute = full weight)
 */
function districtStats({ institutes = [], alerts = [], cameras = [], grievances = [] }) {
  const byDistrict = new Map();
  institutes.forEach((i) => {
    const d = i.district || "Unassigned";
    if (!byDistrict.has(d)) byDistrict.set(d, { district: d, state: i.state || "", list: [] });
    byDistrict.get(d).list.push(i);
  });
  const now = Date.now();
  return [...byDistrict.values()].map(({ district, state, list }) => {
    const ids = new Set(list.map((i) => i.id));
    const open = alerts.filter((a) => a.status === "open" && ids.has(a.institute_id));
    const cams = cameras.filter((c) => ids.has(c.institute_id));
    const dark = cams.filter((c) => c.status === "offline" || c.status === "stale");
    const griev = grievances.filter((g) => ids.has(g.institute_id) && g.status !== "resolved");
    const breached = griev.filter((g) => grievanceSla(g, now).state === "breached");
    const avg = mean(list, "compliance_score");
    const flagged = list.filter((i) => i.status === "red").length;
    const n = list.length || 1;
    const flaggedPct = (flagged / n) * 100;
    const darkPct = cams.length ? (dark.length / cams.length) * 100 : 0;
    const attention =
      0.45 * (100 - (avg ?? 100)) +
      0.2 * flaggedPct +
      0.15 * Math.min(100, (open.length / n) * 25) +
      0.1 * darkPct +
      0.1 * Math.min(100, (breached.length / n) * 50);
    return {
      district,
      state,
      institutes: list.length,
      avgScore: avg,
      flagged,
      flaggedPct,
      openAlerts: open.length,
      critical: open.filter((a) => a.severity === "red").length,
      cameras: cams.length,
      darkCameras: dark.length,
      darkPct,
      openGrievances: griev.length,
      breachedGrievances: breached.length,
      pendingRenewals: list.filter((i) => i.renewal_status === "pending").length,
      attention: Math.round(attention * 10) / 10,
    };
  });
}

/* --------------------------------------------------------- audit chain ---- */
/** The exact string each audit row's hash covers. Server and client must agree. */
function auditCanonical(e) {
  return [e.prev_hash || "", e.id, e.at, e.actor_id || "", e.action, e.entity_type || "", e.entity_id || "", e.detail || ""].join("|");
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Recomputes the chain oldest → newest. Returns {ok, checked, brokenAt} —
 * brokenAt is the id of the first row whose hash doesn't match, or whose
 * prev_hash doesn't point at the row before it.
 */
async function verifyAuditChain(entries) {
  if (!crypto?.subtle) return { ok: null, checked: 0, brokenAt: null };
  const oldestFirst = [...entries].sort((a, b) => (parseDate(a.at)?.getTime() ?? 0) - (parseDate(b.at)?.getTime() ?? 0));
  let prev = "";
  for (let i = 0; i < oldestFirst.length; i++) {
    const e = unredacted(oldestFirst[i]);
    if (!e.hash) return { ok: null, checked: i, brokenAt: null };
    if ((e.prev_hash || "") !== prev) return { ok: false, checked: i, brokenAt: e.id };
    // eslint-disable-next-line no-await-in-loop
    const h = await sha256Hex(auditCanonical(e));
    if (h !== e.hash) return { ok: false, checked: i, brokenAt: e.id };
    prev = e.hash;
  }
  return { ok: true, checked: oldestFirst.length, brokenAt: null };
}

/* ══════════════════════════════════════════════════════════════════════════
   §4  API CONTRACT
   THE single source of truth for backend URLs.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE BACKEND CONTRACT, IN ONE PLACE.
 * ----------------------------------------------------------------------------
 * Sentinel is being built ahead of the backend, so every path and payload here
 * was derived from artefacts that already exist in the repo rather than
 * invented:
 *
 *   - backend/migrations/versions/*.py   -> table + column names, nullability
 *   - backend/tests/*.py                 -> URLs, request bodies, status codes,
 *                                           response field names
 *
 * Each entry is tagged so whoever finishes the backend knows what is load-
 * bearing and what is a best guess:
 *
 *   CONFIRMED  a test in backend/tests asserts this exact path/shape. Changing
 *              it on the server breaks a test, so the frontend can rely on it.
 *   DERIVED    not hit by a test, but the column names come straight from the
 *              migrations, and the page already existed in the v1 dashboard
 *              calling this path.
 *   ASSUMED    Sentinel would like this to exist. Every caller of an ASSUMED
 *              endpoint degrades gracefully when it 404s — see the `optional`
 *              flag and how useApi() handles it. Nothing here breaks the app
 *              if the backend never implements it.
 *
 * Keep this file as the single source of truth: no page should ever contain a
 * hand-written URL string.
 */

const API = {
  // The auth routes below follow the security contract (sessions, 2-step
  // verification, password policy). A TokenResponse is:
  //   {access_token, token_type, expires_in, idle_timeout, session_id, role,
  //    user_id, name, institute_id, designation, employee_id, district, state,
  //    mfa_enabled, last_login_at, last_login_ip}
  // Every 401 outside login / 2-step verify means "the session is over".
  auth: {
    /** CONFIRMED test_auth_rbac.py + security contract
     *  POST {email, password} -> 200 TokenResponse
     *                         |  200 {mfa_required: true, mfa_token, expires_in}
     *  401 wrong credentials · 423 locked (Retry-After) · 429 rate limit · 403 disabled */
    login: () => "/auth/login",
    /** CONFIRMED security contract — POST {mfa_token, code} -> TokenResponse.
     *  code is a 6-digit TOTP code or a single-use recovery code XXXX-XXXX. */
    mfaVerify: () => "/auth/mfa/verify",
    /** CONFIRMED security contract — POST {password} -> {secret, otpauth_uri} */
    mfaSetup: () => "/auth/mfa/setup",
    /** CONFIRMED security contract — POST {code} -> {enabled, recovery_codes[10]} */
    mfaEnable: () => "/auth/mfa/enable",
    /** CONFIRMED security contract — POST {password, code} -> {enabled: false} */
    mfaDisable: () => "/auth/mfa/disable",
    /** CONFIRMED security contract — POST (no body) -> TokenResponse (new token) */
    refresh: () => "/auth/refresh",
    /** CONFIRMED security contract — POST -> {ok}. Revokes this session. */
    logout: () => "/auth/logout",
    /** CONFIRMED security contract — GET -> [{id, created_at, last_seen_at,
     *  expires_at, ip, device, current}] */
    sessions: () => "/auth/sessions",
    /** CONFIRMED security contract — DELETE -> {ok} (sign that device out) */
    session: (id) => `/auth/sessions/${id}`,
    /** CONFIRMED security contract — POST -> {revoked: n} */
    logoutOthers: () => "/auth/logout-others",
    /** CONFIRMED security contract — GET -> profile + mfa_enabled,
     *  last_login_at, last_login_ip, password_changed_at, session_expires_at */
    me: () => "/auth/me",
    /** CONFIRMED security contract — POST {current_password, new_password}
     *  -> {ok, revoked_other_sessions}. 400 policy detail · 401 wrong current. */
    changePassword: () => "/auth/change-password",
    /** CONFIRMED test_auth_rbac.py
     *  POST {name, email, password, role} -> 201 {access_token, role, ...}
     *  409 on duplicate email, 422 on a role outside the enum. */
    register: () => "/auth/register",
  },

  institutes: {
    /** CONFIRMED test_auth_rbac.py (401 when unauthenticated).
     *  GET -> Institute[]  (columns from migration 6d3660c1da79 + 4b1fdea9cbae) */
    list: () => "/institutes",
    /** DERIVED — Sentinel does NOT depend on this. InstituteDetail filters the
     *  list above instead, so a missing detail route costs nothing. */
    detail: (id) => `/institutes/${id}`,
    /** CONFIRMED test_setu_sentinel_endpoints.py
     *  GET -> Alert[] for that institute. 403 if a staff user asks for an
     *  institute that is not their own. */
    alerts: (id) => `/institutes/${id}/alerts`,
    /** CONFIRMED test_setu_sentinel_endpoints.py
     *  PATCH {decision: "approved"|"rejected"} -> 200 {..., renewal_status} */
    renewal: (id) => `/institutes/${id}/renewal`,
    /** CONFIRMED test_setu_sentinel_endpoints.py
     *  POST multipart {file, description?} -> 201 {..., description}
     *  Sentinel only READS these; Setu is what uploads them. */
    documents: (id) => `/institutes/${id}/documents`,
  },

  alerts: {
    /** DERIVED — the v1 dashboard called this and the alerts table is in the
     *  initial migration. GET -> Alert[] across every institute. */
    list: () => "/alerts",
    /** DERIVED — PATCH {action: "reviewed"|"escalated"} -> 200 Alert */
    action: (id) => `/alerts/${id}/action`,
  },

  cameras: {
    /** CONFIRMED test_setu_sentinel_endpoints.py
     *  GET -> CameraFeed[]; 200 for admin/official, 403 for institute_staff. */
    list: () => "/cameras",
  },

  analytics: {
    /** CONFIRMED test_setu_sentinel_endpoints.py
     *  GET -> {total_institutes, green_count, yellow_count, red_count,
     *          average_compliance_score, open_alerts_count, red_alerts_count} */
    complianceSummary: () => "/analytics/compliance-summary",
  },

  grievances: {
    /** CONFIRMED test_setu_sentinel_endpoints.py
     *  GET -> Grievance[]. Officials see all; institute staff see only their
     *  own institute's. Sentinel is always the official's view. */
    list: () => "/grievances",
    /** CONFIRMED — POST {institute_id, subject, description} -> 201, 403 for a
     *  different institute. Sentinel does not create grievances; Setu does. */
    create: () => "/grievances",
    /** CONFIRMED test_setu_sentinel_endpoints.py
     *  PATCH {status} -> 200 {..., status}. Seen values: "open", "resolved". */
    status: (id) => `/grievances/${id}/status`,
    /** ASSUMED — POST {reason} -> 200 Grievance with escalation_level + 1 and
     *  escalated_at = now (a fresh SLA window at the next level). 409 if already
     *  at L3 or resolved. Grievances may also carry sla_due_at; if present,
     *  Sentinel uses it instead of computing the 21-day window itself. */
    escalate: (id) => `/grievances/${id}/escalate`,
  },

  assignments: {
    /** CONFIRMED test_auth_rbac.py + test_evidence.py
     *  POST (no body) -> 201 Assignment. 403 for institute_staff, 201 for admin.
     *  Response includes at least {id, inspector_id}; the migration adds
     *  institute_id, random_seed_ref, created_at, geofence_triggered_at,
     *  notified_institute_at. select_assignment() also produces a dispatch_time,
     *  which Sentinel renders only if the server actually sends it. */
    generate: () => "/assignments/generate",
    /** ASSUMED — there is no test for listing assignments. The Assignments page
     *  works without it (it shows draws made in this session) and quietly fills
     *  in history if the endpoint turns out to exist. */
    list: () => "/assignments",
  },

  evidence: {
    /** CONFIRMED test_evidence.py
     *  POST multipart {file, assignment_id, client_hash, gps_lat, gps_lng,
     *  device_id} -> 200 {status: "OK"|"REJECTED", reason?, evidence?}
     *  Nayan (mobile) is what uploads; Sentinel only reads the ledger below. */
    upload: () => "/evidence/upload",
    /** ASSUMED — an evidence ledger for officials. Degrades to an empty state. */
    list: () => "/evidence",
  },

  vc: {
    /** ASSUMED — the vc_calls table exists in the initial migration and the
     *  README documents backend/app/api/v1/vc.py, but no test pins the route. */
    list: () => "/vc/calls",
  },

  inspectors: {
    /** ASSUMED — GET -> Inspector[]:
     *    {id, name, designation, employee_id, district, state,
     *     status: "available"|"on_site"|"offline", last_seen_at,
     *     assigned_institute_ids: string[], phone_masked?,
     *     unread: number, last_message?: Message}
     *  Admin/official only. Inspectors themselves never sign in to Sentinel —
     *  they work from the field app — so this is the officials' directory. */
    list: () => "/inspectors",
    /** ASSUMED — GET  -> Message[] oldest first (optional ?institute_id=)
     *            POST {body, kind: "message"|"instruction"|"update_request",
     *                  priority: "normal"|"urgent", institute_id?} -> Message
     *  Message = {id, inspector_id, direction: "to_inspector"|"from_inspector",
     *             sender_name, body, kind, priority, institute_id,
     *             status: "sent"|"delivered"|"read", created_at}
     *  The server pushes official→inspector messages to the field app and
     *  updates status as the device acknowledges them. */
    messages: (id) => `/inspectors/${id}/messages`,
    /** ASSUMED — POST (no body): marks the inspector's messages to this
     *  official as read. */
    markRead: (id) => `/inspectors/${id}/messages/read`,
  },
  audit: {
    /** ASSUMED — GET -> AuditEntry[] newest first:
     *    {id, at, actor_id, actor_name, actor_role, action, entity_type,
     *     entity_id, entity_label, detail, before, after, prev_hash, hash}
     *  `hash` = SHA-256 hex of the canonical string built by auditCanonical()
     *  in §3, chained through prev_hash — so the page can prove no row was
     *  edited or removed. The server should append rows on every write
     *  (alert action, renewal, grievance status/escalation, draw, login,
     *  report export). Admin/official only. */
    list: () => "/audit-log",
    /** ASSUMED — POST {action, entity_type, entity_id?, entity_label?, detail}
     *  for client-side events the server can't see (a report downloaded). */
    record: () => "/audit-log/events",
  },

  assistant: {
    /** ASSUMED — GET -> {llm: bool, bhashini: bool, model?, languages?: string[]}.
     *  Yukt calls this once when it opens; a 404 means "local mode". */
    status: () => "/assistant/status",
    /** ASSUMED — POST {message, lang, history:[{role, text}], context} ->
     *  {reply, items?, actions?:[{type, ...}]}. The server holds the LLM key
     *  and never executes actions itself: it only PROPOSES them, and Yukt asks
     *  the official to confirm before calling the normal endpoint (so RBAC
     *  still applies). Reference implementation: backend_assistant.py. */
    chat: () => "/assistant/chat",
    /** ASSUMED — Bhashini NMT via the server. POST {text, source, target} -> {text} */
    translate: () => "/assistant/translate",
    /** ASSUMED — Bhashini TTS. POST {text, lang} -> {audio_base64, mime} */
    tts: () => "/assistant/tts",
    /** ASSUMED — Bhashini ASR. POST {audio_base64, lang, sample_rate} -> {text}
     *  (audio is 16 kHz mono WAV, encoded in the browser) */
    asr: () => "/assistant/asr",
  },
};

/**
 * Roles, exactly as the backend enum stores them (users.role, 30 chars).
 * test_auth_rbac.py proves "superuser" is rejected with 422, so this list is
 * closed — do not add to it without a matching backend change.
 */
const ROLES = {
  ADMIN: "admin",
  OFFICIAL: "official",
  INSPECTOR: "inspector",
  INSTITUTE_STAFF: "institute_staff",
  BENEFICIARY: "beneficiary",
};

/**
 * Sentinel is the OFFICIALS' console. Institute staff and beneficiaries have
 * their own app (Setu) and are refused at the door with an explanation rather
 * than being let in to hit a wall of 403s — /cameras alone 403s for staff, per
 * test_setu_sentinel_endpoints.py.
 */
// Inspectors work from the field app and are reached from Sentinel through
// "Connect with Inspector" — they don't sign in here.
const SENTINEL_ROLES = [ROLES.ADMIN, ROLES.OFFICIAL];

/* ══════════════════════════════════════════════════════════════════════════
   §5  MOCK DATA
   Demo content. Edit these arrays to change what you see.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fixtures for mock mode.
 *
 * Every object here matches the column list in backend/migrations exactly —
 * same field names, same value vocabularies, same nullability. That is the
 * whole point: when the real backend arrives, nothing in the UI should have to
 * change, and any mismatch between these shapes and the server's is a bug on
 * one side or the other worth catching early.
 *
 * The data is plausible but invented. It is never shipped in a production
 * build — see VITE_USE_MOCK in src/api/client.js.
 */

const MOCK_NOW = Date.now();
const mockHoursAgo = (h) => new Date(MOCK_NOW - h * 3600_000).toISOString().replace("Z", "");
const mockDaysAgo = (d) => mockHoursAgo(d * 24);

/* ------------------------------------------------------------ institutes -- */
const MOCK_INSTITUTES = [
  {
    id: "3f6c1a20-8e41-4b17-9d02-5a7cbe91d411",
    name: "Ashray Balika Grih, Aishbagh",
    type: "shelter",
    latitude: 26.8385,
    longitude: 80.9006,
    district: "Lucknow",
    state: "Uttar Pradesh",
    compliance_score: "58.40",
    status: "red",
    renewal_status: "pending",
  },
  {
    id: "7b2d9e54-1c88-49a3-8f60-2ed4417ba903",
    name: "Nav Jeevan Balgruh, Gomti Nagar",
    type: "shelter",
    latitude: 26.8512,
    longitude: 81.0064,
    district: "Lucknow",
    state: "Uttar Pradesh",
    compliance_score: "71.20",
    status: "yellow",
    renewal_status: "pending",
  },
  {
    id: "c41a7f38-5b02-4d9e-a716-90f3c28e6d55",
    name: "Sarvodaya Vidyalaya Hostel, Kanpur",
    type: "hostel",
    latitude: 26.4499,
    longitude: 80.3319,
    district: "Kanpur Nagar",
    state: "Uttar Pradesh",
    compliance_score: "88.60",
    status: "green",
    renewal_status: "approved",
  },
  {
    id: "e8903b71-4a6f-4c25-b83d-1f7e50c9a264",
    name: "Matru Chhaya Vridhashram, Varanasi",
    type: "old_age_home",
    latitude: 25.3176,
    longitude: 82.9739,
    district: "Varanasi",
    state: "Uttar Pradesh",
    compliance_score: "93.10",
    status: "green",
    renewal_status: "approved",
  },
  {
    id: "a15d6c93-2e78-4f10-9b44-6c8a3de71f02",
    name: "Disha Punarvas Kendra, Prayagraj",
    type: "rehab_centre",
    latitude: 25.4358,
    longitude: 81.8463,
    district: "Prayagraj",
    state: "Uttar Pradesh",
    compliance_score: "64.90",
    status: "yellow",
    renewal_status: "rejected",
  },
  {
    id: "d72f4e18-9b35-4a6c-8e21-5470ac93b6df",
    name: "Shanti Niketan Balika Chhatravas, Agra",
    type: "hostel",
    latitude: 27.1767,
    longitude: 78.0081,
    district: "Agra",
    state: "Uttar Pradesh",
    compliance_score: "81.75",
    status: "green",
    renewal_status: "approved",
  },
  {
    id: "b6e0937a-c142-4d58-91af-3e85d206c7b4",
    name: "Samarth Divyang Chhatravas, Gorakhpur",
    type: "hostel",
    latitude: 26.7606,
    longitude: 83.3732,
    district: "Gorakhpur",
    state: "Uttar Pradesh",
    compliance_score: "76.30",
    status: "yellow",
    renewal_status: "approved",
  },
  {
    id: "f4c82d15-6039-4e7b-a2c8-71bd94e3f0aa",
    name: "Anand Ashram Vridhashram, Meerut",
    type: "old_age_home",
    latitude: 28.9845,
    longitude: 77.7064,
    district: "Meerut",
    state: "Uttar Pradesh",
    compliance_score: "90.20",
    status: "green",
    renewal_status: "approved",
  },
];

/* ---------------------------------------------------------------- alerts -- */
// Three institutes outside Uttar Pradesh, so switching region visibly changes
// the dashboard in the demo.
MOCK_INSTITUTES.push(
  {
    id: "8c1e2f30-4a55-4b6c-9d7e-1f2a3b4c5d61",
    name: "Snehalaya Balgruha, Hadapsar",
    type: "shelter",
    latitude: 18.5089,
    longitude: 73.926,
    district: "Pune",
    state: "Maharashtra",
    compliance_score: "74.60",
    status: "yellow",
    renewal_status: "pending",
  },
  {
    id: "9d2f3a41-5b66-4c7d-8e8f-2a3b4c5d6e72",
    name: "Aadhar Vriddhashram, Nagpur",
    type: "old_age_home",
    latitude: 21.1458,
    longitude: 79.0882,
    district: "Nagpur",
    state: "Maharashtra",
    compliance_score: "87.20",
    status: "green",
    renewal_status: "approved",
  },
  {
    id: "ae3a4b52-6c77-4d8e-9f90-3b4c5d6e7f83",
    name: "Asha Kiran Chhatravas, Patna",
    type: "hostel",
    latitude: 25.5941,
    longitude: 85.1376,
    district: "Patna",
    state: "Bihar",
    compliance_score: "61.30",
    status: "red",
    renewal_status: "pending",
  }
);

const MOCK_ALERTS = [
  {
    id: "al-0001",
    institute_id: MOCK_INSTITUTES[0].id,
    type: "anomaly",
    severity: "red",
    status: "open",
    // Phrased the way the seed script's real Isolation Forest run writes it:
    // the computed score is in the text, not a hardcoded sentence.
    detail:
      "Anomaly score -0.0847 against 60 days of this institute's own history. Attendance 41% above baseline while CCTV uptime fell to 52% — the combination, not either figure alone, drove the flag.",
    created_at: mockHoursAgo(5),
  },
  {
    id: "al-0002",
    institute_id: MOCK_INSTITUTES[0].id,
    type: "cctv_tamper",
    severity: "red",
    status: "open",
    detail: "Perceptual hash identical across 7 consecutive frames on feed 'Dormitory B' — feed is frozen or looping.",
    created_at: mockHoursAgo(9),
  },
  {
    id: "al-0003",
    institute_id: MOCK_INSTITUTES[1].id,
    type: "vc_miss",
    severity: "yellow",
    status: "open",
    detail: "Verification call to a registered beneficiary went unanswered across a 20-minute pickup window.",
    created_at: mockHoursAgo(26),
  },
  {
    id: "al-0004",
    institute_id: MOCK_INSTITUTES[4].id,
    type: "hash_mismatch",
    severity: "red",
    status: "open",
    detail:
      "Evidence upload rejected: client hash 0e3b…a91f, server-computed 7c42…08dd. The bytes that arrived are not the bytes that were hashed on the device.",
    created_at: mockHoursAgo(31),
  },
  {
    id: "al-0005",
    institute_id: MOCK_INSTITUTES[1].id,
    type: "attendance_spike",
    severity: "yellow",
    status: "open",
    detail: "Recorded attendance 34% above this institute's 30-day mean, with no corresponding intake records.",
    created_at: mockDaysAgo(2),
  },
  {
    id: "al-0006",
    institute_id: MOCK_INSTITUTES[6].id,
    type: "camera_offline",
    severity: "yellow",
    status: "open",
    detail: "Feed 'Main Gate' stopped reporting 14 hours ago.",
    created_at: mockHoursAgo(14),
  },
  {
    id: "al-0007",
    institute_id: MOCK_INSTITUTES[4].id,
    type: "geofence_breach",
    severity: "yellow",
    status: "reviewed",
    detail: "Evidence captured 1.2 km from the registered location, outside the 500 m geofence.",
    created_at: mockDaysAgo(3),
  },
  {
    id: "al-0008",
    institute_id: MOCK_INSTITUTES[0].id,
    type: "attendance_spike",
    severity: "red",
    status: "escalated",
    detail: "Third attendance anomaly in nine days at the same institute.",
    created_at: mockDaysAgo(4),
  },
  {
    id: "al-0009",
    institute_id: MOCK_INSTITUTES[2].id,
    type: "vc_miss",
    severity: "yellow",
    status: "reviewed",
    detail: "Beneficiary did not pick up; a second attempt the following day connected.",
    created_at: mockDaysAgo(6),
  },
  {
    id: "al-0010",
    institute_id: MOCK_INSTITUTES[6].id,
    type: "anomaly",
    severity: "yellow",
    status: "reviewed",
    detail: "Anomaly score -0.0121 — borderline, driven mostly by a single low-uptime day.",
    created_at: mockDaysAgo(8),
  },
  {
    id: "al-0011",
    institute_id: MOCK_INSTITUTES[1].id,
    type: "camera_offline",
    severity: "yellow",
    status: "reviewed",
    detail: "Feed 'Kitchen' offline for 6 hours during a power outage confirmed by the district office.",
    created_at: mockDaysAgo(11),
  },
  {
    id: "al-0012",
    institute_id: MOCK_INSTITUTES[5].id,
    type: "vc_miss",
    severity: "yellow",
    status: "reviewed",
    detail: "Call unanswered; beneficiary's registered number has since been updated.",
    created_at: mockDaysAgo(13),
  },
];

/* --------------------------------------------------------------- cameras -- */
MOCK_ALERTS.push(
  { id: "al-0013", institute_id: MOCK_INSTITUTES[8].id, type: "camera_offline", severity: "yellow", status: "open", detail: "Feed 'Main Gate' offline since last night.", created_at: mockHoursAgo(11) },
  { id: "al-0014", institute_id: MOCK_INSTITUTES[10].id, type: "anomaly", severity: "red", status: "open", detail: "Anomaly score -0.0712: meal counts 30% above enrolment for 9 straight days.", created_at: mockHoursAgo(7) }
);

const CAMERA_PLAN = [
  [0, ["Main Gate", "Dormitory A", "Dormitory B", "Kitchen"], ["online", "online", "offline", "stale"]],
  [1, ["Main Gate", "Common Hall", "Dormitory"], ["online", "online", "online"]],
  [2, ["Main Gate", "Study Hall", "Mess"], ["online", "online", "online"]],
  [3, ["Reception", "Ward A"], ["online", "online"]],
  [4, ["Main Gate", "Counselling Room"], ["stale", "online"]],
  [5, ["Main Gate", "Dormitory"], ["online", "online"]],
  [6, ["Main Gate", "Corridor"], ["offline", "online"]],
  [7, ["Reception", "Garden"], ["online", "online"]],
  [8, ["Main Gate", "Dormitory"], ["offline", "online"]],
  [9, ["Reception"], ["online"]],
  [10, ["Main Gate", "Mess"], ["online", "stale"]],
];

const MOCK_CAMERAS = CAMERA_PLAN.flatMap(([instIdx, names, statuses], group) =>
  names.map((name, i) => ({
    id: `cam-${group}-${i}`,
    institute_id: MOCK_INSTITUTES[instIdx].id,
    name,
    status: statuses[i],
    last_ping_at:
      statuses[i] === "online" ? mockHoursAgo(0.05) : statuses[i] === "stale" ? mockHoursAgo(7) : mockHoursAgo(14 + i * 3),
  }))
);

/* ------------------------------------------------------------ grievances -- */
const MOCK_GRIEVANCES = [
  {
    id: "gr-0001",
    institute_id: MOCK_INSTITUTES[0].id,
    submitted_by_id: "81204397-64aa-45f8-cd23-738ef026f812",
    subject: "Water supply interrupted since Monday",
    description:
      "The borewell pump has been out since Monday morning. We are managing with tanker deliveries twice a day, but that is not enough for 64 residents. A repair estimate has been submitted to the district office and we are awaiting sanction.",
    status: "open",
    created_at: mockDaysAgo(1),
  },
  {
    id: "gr-0002",
    institute_id: MOCK_INSTITUTES[4].id,
    submitted_by_id: "b45376ca-97dd-48cb-fa56-a6b1c359cb45",
    subject: "Meals not matching the posted menu",
    description:
      "For the last two weeks the evening meal has not matched what is posted on the noticeboard. Milk has not been served since the 8th.",
    status: "open",
    created_at: mockDaysAgo(3),
  },
  {
    id: "gr-0003",
    institute_id: MOCK_INSTITUTES[1].id,
    submitted_by_id: "923154a8-75bb-46a9-de34-849fa137a923",
    subject: "Camera in the kitchen keeps dropping offline",
    description:
      "The kitchen feed goes offline most evenings around 7pm. We think it is the switch, not the camera. Flagging it before it is read as us disabling the feed.",
    status: "in_review",
    created_at: mockDaysAgo(5),
  },
  {
    id: "gr-0004",
    institute_id: MOCK_INSTITUTES[6].id,
    submitted_by_id: "a34265b9-86cc-47ba-ef45-95a0b248ba34",
    subject: "Ramp repair pending since last inspection",
    description:
      "The accessibility ramp at the east entrance was flagged in the last inspection. Work order raised, contractor has not started.",
    status: "resolved",
    created_at: mockDaysAgo(12),
  },
  // Three more, so every SLA state shows up in the demo.
  {
    id: "gr-0005",
    institute_id: MOCK_INSTITUTES[2].id,
    submitted_by_id: "c56487da-a8ee-49cb-0a67-b7c1d470cd56",
    subject: "Scholarship instalment not credited",
    description:
      "Twelve residents' post-matric scholarship instalment for the last quarter has not reached their accounts. The institute has written to the district office twice.",
    status: "open",
    escalation_level: 1,
    created_at: mockDaysAgo(24),
  },
  {
    id: "gr-0006",
    institute_id: MOCK_INSTITUTES[3].id,
    submitted_by_id: "d67598eb-b9ff-4adc-1b78-c8d2e581de67",
    subject: "Night warden post vacant for a month",
    description: "The night warden resigned last month and the post has not been filled. Staff are covering on rotation.",
    status: "in_review",
    escalation_level: 1,
    created_at: mockDaysAgo(19),
  },
  {
    id: "gr-0007",
    institute_id: MOCK_INSTITUTES[0].id,
    submitted_by_id: "e786a9fc-ca00-4bed-2c89-d9e3f692ef78",
    subject: "Medical check-ups not held this quarter",
    description: "The quarterly health camp did not take place. Two residents need follow-up for anaemia.",
    status: "in_review",
    escalation_level: 2,
    escalated_at: mockDaysAgo(6),
    created_at: mockDaysAgo(27),
  },
];

/* ----------------------------------------------------------- assignments -- */
const MOCK_ASSIGNMENTS = [
  {
    id: "as-0001",
    institute_id: MOCK_INSTITUTES[2].id,
    inspector_id: "3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd",
    random_seed_ref: "9f2c8b41ae60d7135c0fa8e2b47d3196",
    created_at: mockDaysAgo(2),
    geofence_triggered_at: mockDaysAgo(2),
    notified_institute_at: null,
  },
  {
    id: "as-0002",
    institute_id: MOCK_INSTITUTES[5].id,
    inspector_id: "4d7caf53-2066-41b4-e9d8-3f5abc82b4de",
    random_seed_ref: "3d71e0c95a2846bf1907cd83e4a5b26f",
    created_at: mockDaysAgo(6),
    geofence_triggered_at: mockDaysAgo(6),
    notified_institute_at: null,
  },
];

/* ----------------------------------------------------------------- users -- */
const MOCK_USERS = {
  "official@dosje.gov.in": { user_id: "1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", name: "Anita Deshmukh", role: "official" },
  "admin@dosje.gov.in": { user_id: "2b5a8d31-0e44-4f92-c7b6-1d38fa6092bc", name: "R. Venkatesan", role: "admin" },
  "inspector1@dosje.gov.in": { user_id: "3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd", name: "Farhan Qureshi", role: "inspector" },
  "inspector2@dosje.gov.in": { user_id: "4d7caf53-2066-41b4-e9d8-3f5abc82b4de", name: "Meera Nair", role: "inspector" },
  // Present so the "wrong app" path on the login screen can be demonstrated.
  "staff@dosje.gov.in": { user_id: "6f9ec175-4288-43d6-ab01-516cde04d6f0", name: "Sunita Rao", role: "institute_staff" },
  "beneficiary@dosje.gov.in": { user_id: "701fd286-5399-44e7-bc12-627def15e701", name: "Kavya Iyer", role: "beneficiary" },
};

/** Inspector ids the mock draw picks between. */
const MOCK_INSPECTOR_IDS = ["3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd", "4d7caf53-2066-41b4-e9d8-3f5abc82b4de", "5e8db064-3177-42c5-fae9-405bcd93c5ef"];

/* ------------------------------------------------------------ inspectors -- */
/**
 * The field team, and which sites each is responsible for. Inspectors don't
 * sign in to Sentinel; officials reach them from here and the messages land
 * in the inspectors' field app.
 */
const MOCK_INSPECTORS = [
  { id: "3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd", name: "Farhan Qureshi", designation: "District Inspector", employee_id: "UP-INS-0142", district: "Lucknow", state: "Uttar Pradesh", status: "on_site", seenH: 0.1, sites: [0, 2, 1], phone_masked: "+91 ••••• ••142" },
  { id: "4d7caf53-2066-41b4-e9d8-3f5abc82b4de", name: "Meera Nair", designation: "Senior Inspector", employee_id: "UP-INS-0087", district: "Kanpur Nagar", state: "Uttar Pradesh", status: "available", seenH: 0.02, sites: [5, 4, 7], phone_masked: "+91 ••••• ••087" },
  { id: "5e8db064-3177-42c5-fae9-405bcd93c5ef", name: "Rajesh Yadav", designation: "District Inspector", employee_id: "UP-INS-0203", district: "Gorakhpur", state: "Uttar Pradesh", status: "offline", seenH: 9, sites: [3, 6], phone_masked: "+91 ••••• ••203" },
  { id: "6f9fc175-4288-43d6-ab01-516cde04d7a1", name: "Sunil Patil", designation: "District Inspector", employee_id: "MH-INS-0311", district: "Pune", state: "Maharashtra", status: "available", seenH: 0.3, sites: [8, 9], phone_masked: "+91 ••••• ••311" },
  { id: "7a0ad286-5399-44e7-bc12-627def15e8b2", name: "Anjali Kumari", designation: "District Inspector", employee_id: "BR-INS-0058", district: "Patna", state: "Bihar", status: "on_site", seenH: 0.5, sites: [10], phone_masked: "+91 ••••• ••058" },
];

const MOCK_OFFICIAL_NAME = "Anita Deshmukh";
function mockMsg(i, inspIdx, direction, instIdx, body, kind, hoursAgo, status, priority = "normal") {
  const insp = MOCK_INSPECTORS[inspIdx];
  return {
    id: `msg-${String(i).padStart(4, "0")}`,
    inspector_id: insp.id,
    direction,
    sender_name: direction === "to_inspector" ? MOCK_OFFICIAL_NAME : insp.name,
    body,
    kind,
    priority,
    institute_id: MOCK_INSTITUTES[instIdx].id,
    status,
    created_at: mockHoursAgo(hoursAgo),
  };
}

const MOCK_MESSAGES = [
  mockMsg(1, 0, "to_inspector", 0, "Please verify the Dormitory B camera during tomorrow's visit — the feed has been frozen for 7 frames and the institute hasn't explained it.", "instruction", 49, "read", "urgent"),
  mockMsg(2, 0, "from_inspector", 0, "Noted. I'll check the DVR and the network switch on site and upload photos from the field app.", "message", 48, "read"),
  mockMsg(3, 0, "from_inspector", 0, "Visited today. The Dormitory B camera had been covered with a cloth; staff removed it in my presence. 3 photos uploaded — hashes verified on the server.", "message", 5, "delivered"),
  mockMsg(4, 1, "to_inspector", 5, "Status update on the meals complaint at Sarvodaya Vidyalaya Hostel? Residents say milk hasn't been served since the 8th.", "update_request", 26, "read"),
  mockMsg(5, 1, "from_inspector", 5, "Menu board updated and cross-checked with 6 residents. Milk supply resumed from today. I'll file the report by evening.", "message", 24, "read"),
];

/** Moves a sent message along as the (imaginary) device acknowledges it. */
function mockAdvanceMessages() {
  const now = Date.now();
  mockState.messages.forEach((m) => {
    if (m.direction !== "to_inspector") return;
    if (m._deliverAt && now >= m._deliverAt && m.status === "sent") m.status = "delivered";
    if (m._readAt && now >= m._readAt && m.status !== "read") m.status = "read";
    if (m._replyAt && now >= m._replyAt && !m._replied) {
      m._replied = true;
      const insp = MOCK_INSPECTORS.find((x) => x.id === m.inspector_id);
      const site = mockState.institutes.find((x) => x.id === m.institute_id)?.name || "the site";
      const lead = m.priority === "urgent" ? "Treating this as urgent. " : "";
      const body =
        m.kind === "instruction"
          ? `${lead}Acknowledged — I'll take this up at ${site} and update you here.`
          : m.kind === "update_request"
            ? `${lead}On it. I'll send a status update from ${site} within the hour.`
            : `${lead}Received, thank you. I'll get back to you shortly.`;
      mockState.messages.push({
        id: `msg-${Date.now().toString(36)}`,
        inspector_id: m.inspector_id,
        direction: "from_inspector",
        sender_name: insp?.name || "Inspector",
        body,
        kind: "message",
        priority: "normal",
        institute_id: m.institute_id,
        status: "delivered",
        created_at: mockNowIso(),
      });
    }
  });
}

function mockInspectorRow(insp, scopeIds) {
  const assigned = insp.sites.map((i) => MOCK_INSTITUTES[i]?.id).filter((id) => id && (!scopeIds || scopeIds.has(id)));
  const msgs = mockState.messages.filter((m) => m.inspector_id === insp.id);
  const last = msgs[msgs.length - 1] || null;
  return {
    id: insp.id,
    name: insp.name,
    designation: insp.designation,
    employee_id: insp.employee_id,
    district: insp.district,
    state: insp.state,
    status: insp.status,
    last_seen_at: mockHoursAgo(insp.seenH),
    phone_masked: insp.phone_masked,
    assigned_institute_ids: assigned,
    unread: msgs.filter((m) => m.direction === "from_inspector" && m.status !== "read").length,
    last_message: last,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   §6  MOCK TRANSPORT
   A fake backend, used only by `npm run dev:mock`.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The mock transport.
 *
 * Swapped in as axios' adapter when VITE_USE_MOCK=true, so every page in the
 * app runs its real code path — same URLs, same response shapes, same error
 * handling — with no backend present. Nothing in the pages knows this exists.
 *
 * It enforces the RBAC the tests pin down (notably: /cameras 403s for institute
 * staff, and only admin/official may run the draw), because a mock that's more
 * permissive than the server teaches you the wrong thing about your own UI.
 */


// Mutable copies: actions in the UI should actually change what later requests
// return, otherwise "mark reviewed" looks broken in mock mode.
const mockState = {
  institutes: MOCK_INSTITUTES.map((i) => ({ ...i })),
  alerts: MOCK_ALERTS.map((a) => ({ ...a })),
  cameras: MOCK_CAMERAS.map((c) => ({ ...c })),
  grievances: MOCK_GRIEVANCES.map((g) => ({ ...g })),
  assignments: MOCK_ASSIGNMENTS.map((a) => ({ ...a })),
  messages: MOCK_MESSAGES.map((m) => ({ ...m })),
};

/* ------------------------------------------------------------ audit log -- */
/**
 * Every write the mock handles lands here, with the actor taken from the token,
 * so the Audit page shows a real trail of what you just did in the demo. The
 * hash chain is computed the same way the server is asked to (auditCanonical).
 */
const MOCK_AUDIT_SEED = [
  ["2b5a8d31-0e44-4f92-c7b6-1d38fa6092bc", "auth.login", "user", null, null, "Signed in to Sentinel", 9],
  ["2b5a8d31-0e44-4f92-c7b6-1d38fa6092bc", "assignment.drawn", "assignment", "as-0002", null, "CSPRNG draw · seed 3d71e0c9…", 6],
  ["1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", "alert.reviewed", "alert", "al-0012", "Missed verification call", "open → reviewed", 5.5],
  ["1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", "alert.escalated", "alert", "al-0008", "Attendance spike", "open → escalated", 4],
  ["1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", "renewal.approved", "institute", null, "Samarth Divyang Chhatravas, Gorakhpur", "pending → approved", 3.2],
  ["2b5a8d31-0e44-4f92-c7b6-1d38fa6092bc", "assignment.drawn", "assignment", "as-0001", null, "CSPRNG draw · seed 9f2c8b41…", 2],
  ["1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", "grievance.status", "grievance", "gr-0003", "Camera in the kitchen keeps dropping offline", "open → in_review", 1.5],
  ["1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", "report.exported", "report", null, "Monthly compliance report · Uttar Pradesh", "Excel", 0.8],
];

function mockUserById(id) {
  return Object.values(MOCK_USERS).find((u) => u.user_id === id);
}

mockState.audit = MOCK_AUDIT_SEED.map(([actorId, action, type, entityId, label, detail, daysAgo], i) => {
  const u = mockUserById(actorId);
  return {
    id: `au-${String(i + 1).padStart(4, "0")}`,
    at: mockDaysAgo(daysAgo),
    actor_id: actorId,
    actor_name: u?.name || "—",
    actor_role: u?.role || "",
    action,
    entity_type: type,
    entity_id: entityId,
    entity_label: label,
    detail,
    before: null,
    after: null,
  };
});

function mockAudit(config, action, entityType, entityId, entityLabel, detail, before = null, after = null) {
  const auth = String(config.headers?.Authorization || config.headers?.authorization || "");
  const u = Object.values(MOCK_USERS).find((x) => auth.includes(x.user_id));
  mockState.audit.push({
    id: `au-${String(mockState.audit.length + 1).padStart(4, "0")}`,
    at: mockNowIso(),
    actor_id: u?.user_id || null,
    actor_name: u?.name || "System",
    actor_role: u?.role || "system",
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_label: entityLabel,
    detail,
    before,
    after,
  });
}

/** The log with prev_hash/hash filled in, newest first — as the server would send it. */
async function mockAuditChained() {
  const oldestFirst = [...mockState.audit].sort((a, b) => (parseDate(a.at)?.getTime() ?? 0) - (parseDate(b.at)?.getTime() ?? 0));
  let prev = "";
  const out = [];
  for (const e of oldestFirst) {
    const row = { ...e, prev_hash: prev };
    // eslint-disable-next-line no-await-in-loop
    row.hash = crypto?.subtle ? await sha256Hex(auditCanonical(row)) : null;
    prev = row.hash || "";
    out.push(row);
  }
  return out.reverse();
}

const MOCK_LATENCY_MS = 260;
const mockDelay = () => new Promise((r) => setTimeout(r, MOCK_LATENCY_MS + Math.random() * 180));

function mockOk(config, data, status = 200) {
  return { data, status, statusText: "OK", headers: {}, config };
}

function mockFail(config, status, detail) {
  const error = new Error(detail);
  error.config = config;
  error.response = { data: { detail }, status, statusText: "Error", headers: {}, config };
  error.isAxiosError = true;
  return Promise.reject(error);
}

/** Reads the signed-in role back out of the fake token the login route issues. */
function mockRoleFromConfig(config) {
  const auth = config.headers?.Authorization || config.headers?.authorization || "";
  const token = String(auth).replace("Bearer ", "");
  const entry = Object.values(MOCK_USERS).find((u) => token.includes(u.user_id));
  return entry?.role || null;
}

function mockParseBody(config) {
  if (!config.data) return {};
  if (typeof config.data === "string") {
    try {
      return JSON.parse(config.data);
    } catch {
      return {};
    }
  }
  return config.data;
}

function mockNowIso() {
  return new Date().toISOString().replace("Z", "");
}

/** secrets.token_hex(16) produces 32 hex chars — the mock matches that exactly. */
function mockSeedRef() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------------------------------------------------- mock sessions -- */
/**
 * Per-user security state for the demo: 2-step on/off, the previous sign-in,
 * and a few other signed-in devices so the Security page has something to
 * show. Tokens look like mock.<user_id>.<session_id>.<nonce>.
 */
mockState.security = {};
mockState.pendingMfa = {};

function mockSecurityFor(userId) {
  if (!mockState.security[userId]) {
    mockState.security[userId] = {
      mfa: false,
      pendingSecret: null,
      lastLogin: { at: mockHoursAgo(26), ip: "10.24.8.17" },
      previousLogin: null,
      passwordChangedAt: mockDaysAgo(41),
      sessions: [
        { id: `ss-${userId.slice(0, 4)}-a`, created_at: mockHoursAgo(30), last_seen_at: mockHoursAgo(3), expires_at: mockHoursAgo(-9), ip: "10.24.8.17", device: "Edge on Windows" },
        { id: `ss-${userId.slice(0, 4)}-b`, created_at: mockHoursAgo(6), last_seen_at: mockHoursAgo(0.4), expires_at: mockHoursAgo(-6), ip: "49.36.112.8", device: "Safari on iPhone" },
      ],
    };
  }
  return mockState.security[userId];
}

function mockTokenResponse(email, sessionId) {
  const u = MOCK_USERS[email];
  return {
    access_token: `mock.${u.user_id}.${sessionId}.${mockSeedRef().slice(0, 8)}`,
    token_type: "bearer",
    expires_in: 900,
    idle_timeout: 1800,
    session_id: sessionId,
    user_id: u.user_id,
    name: u.name,
    role: u.role,
    institute_id: null,
    designation: null,
    employee_id: null,
    district: null,
    state: null,
    mfa_enabled: mockSecurityFor(u.user_id).mfa,
  };
}

/** A completed sign-in: a new session row, and the previous sign-in reported back. */
function mockSignIn(email) {
  const u = MOCK_USERS[email];
  const sec = mockSecurityFor(u.user_id);
  const sessionId = `ss-${mockSeedRef().slice(0, 10)}`;
  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Browser";
  const os = /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Android/.test(agent) ? "Android" : /Linux/.test(agent) ? "Linux" : "this device";
  sec.sessions.push({ id: sessionId, created_at: mockNowIso(), last_seen_at: mockNowIso(), expires_at: mockHoursAgo(-12), ip: "10.24.8.21", device: `${browser} on ${os}` });
  sec.previousLogin = sec.lastLogin;
  sec.lastLogin = { at: mockNowIso(), ip: "10.24.8.21" };
  mockAudit({ headers: { Authorization: `Bearer mock.${u.user_id}.${sessionId}` } }, "auth.login", "user", u.user_id, u.name, "Signed in to Sentinel");
  return { ...mockTokenResponse(email, sessionId), last_login_at: sec.previousLogin?.at ?? null, last_login_ip: sec.previousLogin?.ip ?? null };
}

function mockUserFromConfig(config) {
  const auth = String(config.headers?.Authorization || config.headers?.authorization || "");
  return Object.values(MOCK_USERS).find((u) => auth.includes(u.user_id)) || null;
}

function mockSessionIdFromConfig(config) {
  const auth = String(config.headers?.Authorization || config.headers?.authorization || "");
  return auth.replace("Bearer ", "").split(".")[2] || null;
}

async function handleMockRequest(config) {
  await mockDelay();

  const method = (config.method || "get").toLowerCase();
  // config.url is relative to baseURL ("/api/v1"), so it arrives as "/alerts".
  const url = String(config.url || "").split("?")[0];
  const role = mockRoleFromConfig(config);
  const body = mockParseBody(config);

  /* ------------------------------------------------------------- auth --- */
  if (method === "post" && url === "/auth/login") {
    const email = String(body.email || "").toLowerCase().trim();
    const user = MOCK_USERS[email];
    if (!user) return mockFail(config, 401, "Incorrect email or password.");
    // 2-step verification turned on from the Security page is honoured here,
    // so the whole code step can be tried in the demo.
    if (mockSecurityFor(user.user_id).mfa) {
      const mfaToken = `mfa.${user.user_id}.${mockSeedRef().slice(0, 8)}`;
      mockState.pendingMfa[mfaToken] = email;
      return mockOk(config, { mfa_required: true, mfa_token: mfaToken, expires_in: 300 });
    }
    return mockOk(config, mockSignIn(email));
  }

  if (method === "post" && url === "/auth/mfa/verify") {
    const email = mockState.pendingMfa[body.mfa_token];
    if (!email) return mockFail(config, 401, "Verification timed out. Please sign in again.");
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^\d{6}$/.test(code) && !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return mockFail(config, 401, "Invalid code.");
    delete mockState.pendingMfa[body.mfa_token];
    return mockOk(config, mockSignIn(email));
  }

  // Everything past this point needs a token, exactly as the real API does.
  if (!role) return mockFail(config, 401, "Not authenticated");

  /* --------------------------------------------------- session + 2-step -- */
  const me = mockUserFromConfig(config);
  const sec = me ? mockSecurityFor(me.user_id) : null;
  const sessionId = mockSessionIdFromConfig(config);

  if (method === "post" && url === "/auth/refresh") {
    const email = Object.keys(MOCK_USERS).find((k) => MOCK_USERS[k] === me);
    return mockOk(config, { ...mockTokenResponse(email, sessionId), last_login_at: sec.previousLogin?.at ?? null, last_login_ip: sec.previousLogin?.ip ?? null });
  }
  if (method === "post" && url === "/auth/logout") {
    sec.sessions = sec.sessions.filter((s) => s.id !== sessionId);
    return mockOk(config, { ok: true });
  }
  if (method === "get" && url === "/auth/me") {
    const email = Object.keys(MOCK_USERS).find((k) => MOCK_USERS[k] === me);
    const current = sec.sessions.find((s) => s.id === sessionId);
    return mockOk(config, {
      user_id: me.user_id,
      email,
      name: me.name,
      role: me.role,
      mfa_enabled: sec.mfa,
      last_login_at: sec.previousLogin?.at ?? null,
      last_login_ip: sec.previousLogin?.ip ?? null,
      password_changed_at: sec.passwordChangedAt,
      session_expires_at: current?.expires_at ?? null,
    });
  }
  if (method === "get" && url === "/auth/sessions") {
    return mockOk(config, sec.sessions.map((s) => ({ ...s, current: s.id === sessionId })));
  }
  const sessionMatch = url.match(/^\/auth\/sessions\/([^/]+)$/);
  if (method === "delete" && sessionMatch) {
    sec.sessions = sec.sessions.filter((s) => s.id !== sessionMatch[1]);
    return mockOk(config, { ok: true });
  }
  if (method === "post" && url === "/auth/logout-others") {
    const before = sec.sessions.length;
    sec.sessions = sec.sessions.filter((s) => s.id === sessionId);
    return mockOk(config, { revoked: before - sec.sessions.length });
  }
  if (method === "post" && url === "/auth/mfa/setup") {
    if (!body.password) return mockFail(config, 401, "Incorrect password.");
    // A real, scannable secret: any authenticator app accepts it, although
    // the demo accepts any 6-digit code back.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    sec.pendingSecret = [...bytes].map((b) => alphabet[b % 32]).join("");
    const email = Object.keys(MOCK_USERS).find((k) => MOCK_USERS[k] === me);
    return mockOk(config, {
      secret: sec.pendingSecret,
      otpauth_uri: `otpauth://totp/DoSJE%20Nigrani:${encodeURIComponent(email)}?secret=${sec.pendingSecret}&issuer=DoSJE%20Nigrani`,
    });
  }
  if (method === "post" && url === "/auth/mfa/enable") {
    if (!sec.pendingSecret || !/^\d{6}$/.test(String(body.code || ""))) return mockFail(config, 400, "Invalid code.");
    sec.mfa = true;
    sec.pendingSecret = null;
    const codes = Array.from({ length: 10 }, () => mockSeedRef().slice(0, 8).toUpperCase().replace(/(.{4})/, "$1-"));
    mockAudit(config, "auth.mfa_enabled", "user", me.user_id, me.name, "2-step verification turned on");
    return mockOk(config, { enabled: true, recovery_codes: codes });
  }
  if (method === "post" && url === "/auth/mfa/disable") {
    if (!body.password) return mockFail(config, 401, "Incorrect password.");
    if (!/^\d{6}$/.test(String(body.code || "")) && !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(String(body.code || ""))) return mockFail(config, 400, "Invalid code.");
    sec.mfa = false;
    mockAudit(config, "auth.mfa_disabled", "user", me.user_id, me.name, "2-step verification turned off");
    return mockOk(config, { enabled: false });
  }
  if (method === "post" && url === "/auth/change-password") {
    if (!body.current_password) return mockFail(config, 401, "Current password is incorrect.");
    const failed = passwordPolicy(String(body.new_password || ""), { name: me.name, email: Object.keys(MOCK_USERS).find((k) => MOCK_USERS[k] === me), current: body.current_password }).find((r) => !r.ok);
    if (failed) return mockFail(config, 400, `The new password must meet every rule: ${failed.label.toLowerCase()}.`);
    const revoked = sec.sessions.filter((s) => s.id !== sessionId).length;
    sec.sessions = sec.sessions.filter((s) => s.id === sessionId);
    sec.passwordChangedAt = mockNowIso();
    mockAudit(config, "auth.password_changed", "user", me.user_id, me.name, "Password changed");
    return mockOk(config, { ok: true, revoked_other_sessions: revoked });
  }

  // Region scoping: the server is asked (X-Sentinel-Region) to return only
  // the official's jurisdiction. The mock does the same.
  const regionName = config.headers?.["X-Sentinel-Region"] || config.headers?.["x-sentinel-region"] || "";
  const regionScope = regionName && regionName !== "ALL" ? new Set(mockState.institutes.filter((i) => i.state === regionName).map((i) => i.id)) : null;
  const inScope = (row) => !regionScope || regionScope.has(row.institute_id);

  /* ------------------------------------------------------- institutes --- */
  if (method === "get" && url === "/institutes") {
    return mockOk(config, mockState.institutes.filter((i) => !regionScope || regionScope.has(i.id)));
  }

  const renewalMatch = url.match(/^\/institutes\/([^/]+)\/renewal$/);
  if (method === "patch" && renewalMatch) {
    if (!["official", "admin"].includes(role)) return mockFail(config, 403, "Not permitted for your role");
    const inst = mockState.institutes.find((i) => i.id === renewalMatch[1]);
    if (!inst) return mockFail(config, 404, "Institute not found");
    const beforeRenewal = inst.renewal_status;
    inst.renewal_status = body.decision;
    mockAudit(config, `renewal.${body.decision}`, "institute", inst.id, inst.name, `${beforeRenewal} → ${body.decision}`, { renewal_status: beforeRenewal }, { renewal_status: body.decision });
    return mockOk(config, inst);
  }

  const instAlertsMatch = url.match(/^\/institutes\/([^/]+)\/alerts$/);
  if (method === "get" && instAlertsMatch) {
    return mockOk(config, mockState.alerts.filter((a) => a.institute_id === instAlertsMatch[1]));
  }

  /* ------------------------------------------------------------ alerts -- */
  if (method === "get" && url === "/alerts") {
    return mockOk(config, mockState.alerts.filter(inScope));
  }

  const alertActionMatch = url.match(/^\/alerts\/([^/]+)\/action$/);
  if (method === "patch" && alertActionMatch) {
    if (!["official", "admin"].includes(role)) return mockFail(config, 403, "Not permitted for your role");
    const alert = mockState.alerts.find((a) => a.id === alertActionMatch[1]);
    if (!alert) return mockFail(config, 404, "Alert not found");
    const beforeAlert = alert.status;
    alert.status = body.action;
    mockAudit(config, `alert.${body.action}`, "alert", alert.id, alertTypeLabel(alert.type), `${beforeAlert} → ${body.action}`, { status: beforeAlert }, { status: body.action });
    return mockOk(config, alert);
  }

  /* ----------------------------------------------------------- cameras -- */
  if (method === "get" && url === "/cameras") {
    // Mirrors test_official_sees_camera_wall_across_institutes.
    if (role === "institute_staff" || role === "beneficiary") {
      return mockFail(config, 403, "Not permitted for your role");
    }
    return mockOk(config, mockState.cameras.filter(inScope));
  }

  /* --------------------------------------------------------- analytics -- */
  if (method === "get" && url === "/analytics/compliance-summary") {
    const list = mockState.institutes.filter((i) => !regionScope || regionScope.has(i.id));
    const scores = list.map((i) => Number(i.compliance_score));
    const open = mockState.alerts.filter((a) => a.status === "open" && inScope(a));
    return mockOk(config, {
      total_institutes: list.length,
      green_count: list.filter((i) => i.status === "green").length,
      yellow_count: list.filter((i) => i.status === "yellow").length,
      red_count: list.filter((i) => i.status === "red").length,
      average_compliance_score:
        Math.round((scores.reduce((a, b) => a + b, 0) / (scores.length || 1)) * 100) / 100,
      open_alerts_count: open.length,
      red_alerts_count: open.filter((a) => a.severity === "red").length,
    });
  }

  /* -------------------------------------------------------- grievances -- */
  if (method === "get" && url === "/grievances") {
    return mockOk(config, mockState.grievances.filter(inScope));
  }

  const grievanceStatusMatch = url.match(/^\/grievances\/([^/]+)\/status$/);
  if (method === "patch" && grievanceStatusMatch) {
    if (!["official", "admin"].includes(role)) return mockFail(config, 403, "Not permitted for your role");
    const g = mockState.grievances.find((x) => x.id === grievanceStatusMatch[1]);
    if (!g) return mockFail(config, 404, "Grievance not found");
    const beforeStatus = g.status;
    g.status = body.status;
    mockAudit(config, "grievance.status", "grievance", g.id, g.subject, `${beforeStatus} → ${body.status}`, { status: beforeStatus }, { status: body.status });
    return mockOk(config, g);
  }


  /* -------------------------------------------------------- inspectors -- */
  if (url === "/inspectors" || url.startsWith("/inspectors/")) {
    if (!["official", "admin"].includes(role)) return mockFail(config, 403, "Not permitted for your role");
    mockAdvanceMessages();
  }
  if (method === "get" && url === "/inspectors") {
    const list = MOCK_INSPECTORS.filter((i) => !regionScope || i.state === regionName).map((i) => mockInspectorRow(i, regionScope));
    return mockOk(config, list);
  }
  const inspMsgMatch = url.match(/^\/inspectors\/([^/]+)\/messages$/);
  if (inspMsgMatch && method === "get") {
    const q = new URLSearchParams(String(config.url).split("?")[1] || "");
    const inst = q.get("institute_id") || config.params?.institute_id;
    const rows = mockState.messages.filter((m) => m.inspector_id === inspMsgMatch[1] && (!inst || m.institute_id === inst));
    return mockOk(config, rows.map(({ _deliverAt, _readAt, _replyAt, _replied, ...m }) => m));
  }
  if (inspMsgMatch && method === "post") {
    const insp = MOCK_INSPECTORS.find((i) => i.id === inspMsgMatch[1]);
    if (!insp) return mockFail(config, 404, "Inspector not found");
    const text = String(body.body || "").trim();
    if (!text) return mockFail(config, 422, "Message can't be empty");
    const now = Date.now();
    const online = insp.status !== "offline";
    const auth = String(config.headers?.Authorization || "");
    const me = Object.values(MOCK_USERS).find((u) => auth.includes(u.user_id));
    const msg = {
      id: `msg-${now.toString(36)}`,
      inspector_id: insp.id,
      direction: "to_inspector",
      sender_name: me?.name || "Official",
      body: text.slice(0, 2000),
      kind: ["instruction", "update_request"].includes(body.kind) ? body.kind : "message",
      priority: body.priority === "urgent" ? "urgent" : "normal",
      institute_id: body.institute_id || null,
      status: "sent",
      created_at: mockNowIso(),
      // An offline inspector's phone can't acknowledge: it stays "sent" (queued).
      _deliverAt: online ? now + 1500 : null,
      _readAt: online ? now + 4500 : null,
      _replyAt: online ? now + 8000 : null,
    };
    mockState.messages.push(msg);
    const site = mockState.institutes.find((x) => x.id === msg.institute_id)?.name;
    mockAudit(config, "inspector.message", "inspector", insp.id, insp.name, `${msg.kind === "message" ? "Message" : msg.kind === "instruction" ? "Instruction" : "Update request"}${msg.priority === "urgent" ? " (urgent)" : ""}${site ? ` · ${site}` : ""}`);
    const { _deliverAt, _readAt, _replyAt, ...out } = msg;
    return mockOk(config, out, 201);
  }
  const inspReadMatch = url.match(/^\/inspectors\/([^/]+)\/messages\/read$/);
  if (inspReadMatch && method === "post") {
    mockState.messages.forEach((m) => {
      if (m.inspector_id === inspReadMatch[1] && m.direction === "from_inspector") m.status = "read";
    });
    return mockOk(config, { ok: true });
  }

  /* ---------------------------------------------- grievance escalation -- */
  const grievanceEscalateMatch = url.match(/^\/grievances\/([^/]+)\/escalate$/);
  if (method === "post" && grievanceEscalateMatch) {
    if (!["official", "admin"].includes(role)) return mockFail(config, 403, "Not permitted for your role");
    const g = mockState.grievances.find((x) => x.id === grievanceEscalateMatch[1]);
    if (!g) return mockFail(config, 404, "Grievance not found");
    if (g.status === "resolved") return mockFail(config, 409, "A resolved grievance can't be escalated");
    const from = g.escalation_level || 1;
    if (from >= 3) return mockFail(config, 409, "Already at the highest level");
    g.escalation_level = from + 1;
    g.escalated_at = mockNowIso();
    if (g.status === "open") g.status = "in_review";
    mockAudit(config, "grievance.escalated", "grievance", g.id, g.subject, `L${from} → L${from + 1}${body.reason ? ` · ${body.reason}` : ""}`, { level: from }, { level: from + 1 });
    return mockOk(config, g);
  }

  /* ------------------------------------------------------------- audit -- */
  if (method === "get" && url === "/audit-log") {
    if (!["official", "admin"].includes(role)) return mockFail(config, 403, "Not permitted for your role");
    return mockOk(config, await mockAuditChained());
  }
  if (method === "post" && url === "/audit-log/events") {
    mockAudit(config, body.action || "client.event", body.entity_type || "report", body.entity_id || null, body.entity_label || null, body.detail || "");
    return mockOk(config, { ok: true }, 201);
  }

  /* ------------------------------------------------------- assignments -- */
  if (method === "post" && url === "/assignments/generate") {
    // test_rbac_blocks_wrong_role proves institute_staff gets a 403 here.
    if (!["admin", "official"].includes(role)) return mockFail(config, 403, "Not permitted for your role");

    // A genuine draw, not a rotation: CSPRNG over both pools, weighted toward
    // institutes that have gone longest without one, and never repeating the
    // most recent inspector for the same institute.
    const weighted = mockState.institutes.flatMap((inst) => {
      const last = mockState.assignments.filter((a) => a.institute_id === inst.id).length;
      return Array(Math.max(1, 4 - last)).fill(inst);
    });
    const institute = weighted[mockRandomIndex(weighted.length)];

    const recentForInstitute = mockState.assignments
      .filter((a) => a.institute_id === institute.id)
      .slice(-2)
      .map((a) => a.inspector_id);
    const eligible = MOCK_INSPECTOR_IDS.filter((i) => !recentForInstitute.includes(i));
    const pool = eligible.length ? eligible : MOCK_INSPECTOR_IDS; // fairness fallback
    const inspectorId = pool[mockRandomIndex(pool.length)];

    const dispatch = new Date();
    dispatch.setDate(dispatch.getDate() + 1);
    dispatch.setHours(9 + mockRandomIndex(8), mockRandomIndex(60), 0, 0);

    const assignment = {
      id: `as-${Date.now().toString(36)}`,
      institute_id: institute.id,
      inspector_id: inspectorId,
      random_seed_ref: mockSeedRef(),
      created_at: mockNowIso(),
      dispatch_time: dispatch.toISOString().replace("Z", ""),
      geofence_triggered_at: null,
      notified_institute_at: null,
    };
    mockState.assignments.push(assignment);
    mockAudit(config, "assignment.drawn", "assignment", assignment.id, institute.name, `CSPRNG draw · seed ${assignment.random_seed_ref.slice(0, 8)}…`);
    return mockOk(config, assignment, 201);
  }

  if (method === "get" && url === "/assignments") {
    return mockOk(config, [...mockState.assignments].filter(inScope).reverse());
  }

  /* ------------------------------------------- deliberately not mocked -- */
  // Routes tagged ASSUMED in endpoints.js that the backend may never build.
  // Left as 404s so the "not wired yet" states are exercised in mock mode too,
  // rather than being code nobody ever sees run.
  // /assistant/* is left unmocked on purpose: Yukt then shows "local mode" and
  // answers from live data, which is exactly what happens before the backend
  // has an AI key configured.
  if (url === "/evidence" || url === "/vc/calls" || url.startsWith("/assistant/")) {
    return mockFail(config, 404, "Not implemented");
  }

  return mockFail(config, 404, `No mock handler for ${method.toUpperCase()} ${url}`);
}

/** Unbiased index from the browser's CSPRNG — no Math.random here either. */
function mockRandomIndex(length) {
  if (length <= 0) return 0;
  const limit = Math.floor(0xffffffff / length) * length;
  const buf = new Uint32Array(1);
  let value;
  do {
    crypto.getRandomValues(buf);
    [value] = buf;
  } while (value >= limit);
  return value % length;
}

/* ══════════════════════════════════════════════════════════════════════════
   §7  HTTP CLIENT
   ══════════════════════════════════════════════════════════════════════════ */

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

/** Sent as X-Client so the server can label this device in "Active sessions". */
const CLIENT_ID = "sentinel-web/1.0.0";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api/v1",
  timeout: 20000,
});

// The token comes from memory (§7a), never from browser storage. A request
// that already carries its own Authorization (the sign-out call, made after
// the session is wiped) keeps it.
api.interceptors.request.use((config) => {
  const token = getSession()?.token;
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  config.headers["X-Client"] = CLIENT_ID;
  return config;
});

/* ── Demo fallback ──────────────────────────────────────────────────────────
 * If the backend simply isn't running, every page would otherwise fill with
 * "can't reach the backend". That's correct but useless: you can't look at the
 * dashboard at all until the API exists.
 *
 * So the first time a request finds nobody home, Sentinel switches itself to
 * the built-in demo data (§5/§6) and keeps going — with a banner across the top
 * saying so, because silently showing fake numbers would be worse than the
 * error. Start the real backend and reload, and it goes straight back to live
 * data.
 *
 * A real error FROM the backend (a 500 with a JSON body, a 403, a 422) is left
 * alone — that's the API talking, and it should surface.
 */
let DEMO_FALLBACK = false;
const demoListeners = new Set();

/**
 * True whenever the screen is showing demo data — either because mock mode was
 * asked for, or because the backend went missing and Sentinel fell back.
 */
function useDemoFallback() {
  const [on, setOn] = useState(DEMO_FALLBACK);
  useEffect(() => {
    demoListeners.add(setOn);
    // A request may have already failed between first render and this effect.
    if (DEMO_FALLBACK) setOn(true);
    return () => demoListeners.delete(setOn);
  }, []);
  return USE_MOCK || on;
}

function enterDemoFallback() {
  if (DEMO_FALLBACK) return;
  DEMO_FALLBACK = true;
  // Stop trying the network entirely from here on.
  api.defaults.adapter = (config) => handleMockRequest(config);
  demoListeners.forEach((fn) => fn(true));
}

/** "Nobody answered", as distinct from "the server answered with an error". */
function backendUnreachable(error) {
  if (error.code === "ECONNABORTED") return false; // it's there, just slow
  if (!error.response) return true; // connection refused / DNS / CORS
  const { status, data } = error.response;
  if (status === 502 || status === 503 || status === 504) return true;
  // Vite's dev proxy answers 500 with a plain-text body when the target refuses
  // the connection. A genuine FastAPI 500 is JSON carrying `detail`.
  if (status === 500 && !(data && typeof data === "object" && "detail" in data)) return true;
  return false;
}

api.interceptors.response.use(
  (response) => {
    // Aadhaar / bank / phone numbers are masked before any page sees them.
    response.data = redactSensitive(response.data);
    return response;
  },
  (error) => {
    // 1. Nobody home? Switch to demo data and serve this request from it.
    //    Note there's no `!DEMO_FALLBACK` guard here: a page fires several
    //    requests at once, and they all fail within milliseconds of each other.
    //    Only the first would flip the flag — the rest must still be served
    //    from the demo data rather than rejected, or the page comes up with one
    //    panel populated and the others showing errors.
    if (!USE_MOCK && error.config && backendUnreachable(error)) {
      enterDemoFallback();
      return handleMockRequest(error.config).then((response) => ({ ...response, data: redactSensitive(response.data) }));
    }

    // 2. A 401 means the session is over (expired, idle, revoked, or signed
    //    out elsewhere): sign out and let the login page say why. See
    //    sessionEndingError() for the few 401s that are form errors instead.
    if (sessionEndingError(error)) {
      endSession("expired", { detail: error.response.data?.detail });
    }
    return Promise.reject(error);
  }
);

// `npm run dev:mock` sets this, which skips the network from the very first
// request instead of waiting for one to fail.
if (USE_MOCK) {
  api.defaults.adapter = (config) => handleMockRequest(config);
}

/** True when the screen is showing demo data rather than live data. */
function usingDemoData() {
  return USE_MOCK || DEMO_FALLBACK;
}

/**
 * The banner. Deliberately hard to miss — nobody should mistake these numbers
 * for real ones, least of all during a demo.
 */
function DemoBanner() {
  const demoData = useDemoFallback();
  if (!demoData) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-signal-watch px-4 py-1.5 text-center text-xs text-ink">
      <span className="font-semibold uppercase tracking-wide">Mock data</span>
      <span className="opacity-80">
        {USE_MOCK
          ? "Running in mock mode — no backend is being contacted."
          : "The backend isn't responding, so these are sample figures. Start it and reload for live data."}
      </span>
    </div>
  );
}

/** Turns an axios failure into one sentence a person can act on. */
function errorMessage(error, fallback = "Something went wrong") {
  if (!error) return fallback;
  const status = error.response?.status;
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (status === 403) return "Your role doesn't have access to this";
  if (status === 404) return "The backend doesn't expose this yet";
  if (status === 409) return "That conflicts with something already on record";
  if (status === 422) return "The server rejected those values";
  if (status >= 500) return "The backend hit an error handling that";
  if (error.code === "ECONNABORTED") return "The backend took too long to respond";
  if (!error.response) return "Can't reach the backend";
  return fallback;
}

/** True when the failure means "this route isn't implemented", not "it broke". */
function isMissingEndpoint(error) {
  return error?.response?.status === 404 || error?.response?.status === 405;
}

/* ══════════════════════════════════════════════════════════════════════════
   §7a  SESSION
   Who is signed in — held in memory only — plus idle sign-out, silent token
   refresh, and signing every open tab out together.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The session lives in this module's memory and nowhere else: no token or
 * profile ever touches localStorage, sessionStorage, IndexedDB or a cookie.
 * The consequence is deliberate — reloading or reopening Sentinel always
 * lands on the sign-in page, whatever URL was open.
 *
 * Timings (security contract §1–§2):
 *   access token   15 min. Renewed silently when < 3 min remain and the
 *                  official was active in the last 5 min — and, so someone
 *                  reading without touching the mouse isn't cut off before
 *                  the idle warning, in its final minute while the idle
 *                  window below is still open.
 *   idle sign-out  15 min without pointer / key / scroll / touch. A warning
 *                  with a live countdown appears at 13 min.
 * Everything is judged from timestamps, not by counting timer ticks, so a tab
 * that slept (laptop lid shut) is signed out correctly the moment it wakes.
 */
const IDLE_SIGN_OUT_MS = 15 * 60_000;
const IDLE_WARNING_MS = 13 * 60_000;
const REFRESH_BEFORE_EXPIRY_MS = 3 * 60_000;
const REFRESH_IF_ACTIVE_WITHIN_MS = 5 * 60_000;
const REFRESH_LAST_CHANCE_MS = 60_000;
const REFRESH_RETRY_MS = 30_000;

// Versions before this one kept the token and profile in localStorage.
const LEGACY_SESSION_KEYS = ["dosje_token", "dosje_user"];
["localStorage", "sessionStorage"].forEach((store) => {
  try {
    LEGACY_SESSION_KEYS.forEach((key) => window[store].removeItem(key));
  } catch {
    /* storage blocked: there is nothing to purge */
  }
});

/* ------------------------------------------------------------ the store -- */
const sessionStore = { current: null, notice: null, subs: new Set() };
const emitSession = () => sessionStore.subs.forEach((fn) => fn());

function getSession() {
  return sessionStore.current;
}

function subscribeSession(fn) {
  sessionStore.subs.add(fn);
  return () => sessionStore.subs.delete(fn);
}

/** Why the last session ended, for the sign-in page. The next sign-in clears it. */
function getSessionNotice() {
  return sessionStore.notice;
}

const tokenExpiry = (data) => Date.now() + (Number(data.expires_in) || 900) * 1000;

/** Turns a TokenResponse (login or 2-step verify) into the in-memory session. */
function startSession(data, email) {
  sessionStore.current = {
    token: data.access_token,
    expiresAt: tokenExpiry(data),
    sessionId: data.session_id ?? null,
    lastLogin: data.last_login_at ? { at: data.last_login_at, ip: data.last_login_ip ?? null } : null,
    user: {
      user_id: data.user_id,
      name: data.name,
      role: data.role,
      email,
      institute_id: data.institute_id ?? null,
      designation: data.designation ?? null,
      district: data.district ?? null,
      state: data.state ?? null,
    },
  };
  sessionStore.notice = null;
  markActive();
  emitSession();
  return sessionStore.current;
}

/** A refresh swaps the token in place; the profile and session id stay. */
function renewSession(data) {
  const s = sessionStore.current;
  if (!s || !data?.access_token) return;
  sessionStore.current = { ...s, token: data.access_token, expiresAt: tokenExpiry(data) };
  emitSession();
}

/* ------------------------------------------------------------ sign-out -- */
const SIGN_OUT_NOTICES = {
  signout: "You have signed out.",
  idle: "You were signed out after 15 minutes of inactivity.",
  expired: "Your session ended. Please sign in again.",
  elsewhere: "You were signed out in another tab.",
};

const sessionEndHandlers = new Set();

/** Lets a module-level cache (the inspector directory, say) empty itself on sign-out. */
function onSessionEnd(fn) {
  sessionEndHandlers.add(fn);
}

/**
 * The one way out, whatever the cause: the button ("signout"), the idle timer
 * ("idle"), a 401 ("expired", with the server's sentence) or another tab
 * ("elsewhere"). Idempotent — a second call finds no session and does nothing,
 * which is what keeps a burst of 401s from looping.
 */
function endSession(reason, { detail, broadcast = true } = {}) {
  const ending = sessionStore.current;
  if (!ending) return;
  sessionStore.current = null;
  // Revoke it on the server, best effort. After a 401 the server already has.
  if (reason !== "expired") {
    api.post(API.auth.logout(), null, { headers: { Authorization: `Bearer ${ending.token}` } }).catch(() => {});
  }
  wipeAppData();
  if (broadcast) authChannel?.postMessage({ type: "signout" });
  const text = reason === "expired" && typeof detail === "string" && detail ? detail : SIGN_OUT_NOTICES[reason];
  sessionStore.notice = { reason, text };
  emitSession();
}

/**
 * Everything a signed-in official left in this tab, except UI preferences
 * (theme, language order, text size, column choices, saved views): the
 * per-page filter/search state and one-time flags in sessionStorage, and the
 * module-level caches that registered with onSessionEnd(). React state goes
 * with the signed-in shell, which unmounts.
 */
function wipeAppData() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) keys.push(sessionStorage.key(i));
    keys.filter((k) => k?.startsWith("sentinel.")).forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* storage blocked: nothing was written either */
  }
  sessionEndHandlers.forEach((fn) => fn());
}
// A fresh page load is always signed out, so whatever the last session left
// in this tab's sessionStorage (a reload skips sign-out) goes now too.
wipeAppData();

/**
 * Which failures end the session. Any 401 does, except: a wrong password or
 * code on sign-in / 2-step verify, and the same on the three forms that ask
 * for the current password or a code again (change password, 2-step setup
 * and disable) — there a 401 is the form's answer, not the session's end.
 */
const REAUTH_FORM_URLS = ["/auth/mfa/setup", "/auth/mfa/disable", "/auth/change-password"];
function sessionEndingError(error) {
  if (error?.response?.status !== 401) return false;
  const url = String(error.config?.url || "");
  if (url.includes("/auth/login") || url.includes("/auth/mfa/verify") || url.includes("/auth/logout")) return false;
  const detail = String(error.response.data?.detail || "");
  if (REAUTH_FORM_URLS.some((u) => url.includes(u)) && /incorrect|invalid code/i.test(detail)) return false;
  return true;
}

/* ------------------------------------------------------ across tabs ---- */
/**
 * Signing out in one tab signs out every Sentinel tab in this browser. Tabs
 * also share activity, so working in one tab keeps a background tab from
 * idling out (and, through its sign-out broadcast, taking the busy tab too).
 */
const authChannel = typeof BroadcastChannel === "function" ? new BroadcastChannel("sentinel-auth") : null;
if (authChannel) {
  authChannel.onmessage = ({ data }) => {
    if (data?.type === "signout") endSession("elsewhere", { broadcast: false });
    if (data?.type === "activity" && sessionStore.current && data.at > activity.last) {
      activity.last = data.at;
      activity.held = false;
    }
  };
}

/* ------------------------------------------------------------ activity -- */
// `held` is set while the idle warning is up: from then on only its
// "Stay signed in" button (or work in another tab) counts as activity.
const activity = { last: Date.now(), held: false, sharedAt: 0 };
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];

function markActive() {
  const now = Date.now();
  activity.last = now;
  activity.held = false;
  if (now - activity.sharedAt > 30_000) {
    activity.sharedAt = now;
    authChannel?.postMessage({ type: "activity", at: now });
  }
}

function noteActivity() {
  if (!sessionStore.current || activity.held || Date.now() - activity.last < 1000) return; // throttled
  markActive();
}
// Capture phase: scrolling inside a panel doesn't bubble to window.
ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, noteActivity, { capture: true, passive: true }));

/* ------------------------------------------------------------- refresh -- */
let refreshing = null;
let refreshTriedAt = 0;

/** POST /auth/refresh, once at a time. A 401 signs out through the interceptor. */
function refreshSession({ force = false } = {}) {
  if (refreshing) return refreshing;
  if (!force && Date.now() - refreshTriedAt < REFRESH_RETRY_MS) return Promise.resolve();
  refreshTriedAt = Date.now();
  refreshing = api
    .post(API.auth.refresh())
    .then(({ data }) => renewSession(data))
    .catch(() => {})
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/* ------------------------------------------------------------- hooks ---- */
/** The session, re-rendering when it starts, renews or ends. */
function useSession() {
  return useSyncExternalStore(subscribeSession, getSession);
}

function useSessionNotice() {
  return useSyncExternalStore(subscribeSession, getSessionNotice);
}

/** Runs `check` every `everyMs`, and at once whenever the tab wakes or regains focus. */
function useWakefulInterval(check, everyMs) {
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && check();
    check();
    const id = setInterval(check, everyMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [check, everyMs]);
}

/**
 * Idle sign-out. Returns the whole seconds left once the warning is due
 * (null before that), plus `stay` for the warning's button.
 */
function useIdleTimer() {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const check = useCallback(() => {
    if (!getSession()) return;
    const idle = Date.now() - activity.last;
    if (idle >= IDLE_SIGN_OUT_MS) {
      endSession("idle");
      return;
    }
    const warn = idle >= IDLE_WARNING_MS;
    activity.held = warn;
    setSecondsLeft(warn ? Math.ceil((IDLE_SIGN_OUT_MS - idle) / 1000) : null);
  }, []);
  useWakefulInterval(check, 1000);

  const stay = useCallback(() => {
    markActive();
    setSecondsLeft(null);
    return refreshSession({ force: true });
  }, []);
  return { secondsLeft, stay };
}

/** Silent token renewal, per the timings at the top of this section. */
function useTokenRefresh() {
  const check = useCallback(() => {
    const s = getSession();
    if (!s) return;
    const now = Date.now();
    const left = s.expiresAt - now;
    const idle = now - activity.last;
    if ((left < REFRESH_BEFORE_EXPIRY_MS && idle < REFRESH_IF_ACTIVE_WITHIN_MS) || (left < REFRESH_LAST_CHANCE_MS && idle < IDLE_SIGN_OUT_MS)) {
      refreshSession();
    }
  }, []);
  useWakefulInterval(check, 15_000);
}

/* ══════════════════════════════════════════════════════════════════════════
   §8  DATA HOOK
   ══════════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------------------------ live data -- */
/**
 * Auto-refresh (security contract §2.8). While signed in and the tab is
 * visible, every mounted useApi() re-fetches quietly every 60 s, and at once
 * when the tab comes back into view or regains focus; nothing runs while it
 * is hidden. The trigger is the app-wide "sentinel:refresh" event (Yukt
 * already fires it after an action), so the ticker, the bell, the inspector
 * directory and the page all move together.
 *
 * A background refresh never shows a spinner or an error over data already on
 * screen, keeps the same object when nothing changed (so nothing re-renders),
 * and never touches the page's filters, scroll, open dialogs or form input —
 * those live in the page's own state, not in the fetched data.
 */
const LIVE_REFRESH_MS = 60_000;
const LIVE_REFOCUS_GAP_MS = 10_000;
const liveData = { snapshot: { updatedAt: 0, busy: false }, inFlight: 0, subs: new Set() };

function setLiveData(patch) {
  liveData.snapshot = { ...liveData.snapshot, ...patch };
  liveData.subs.forEach((fn) => fn());
}
function trackLiveRequest(delta) {
  liveData.inFlight = Math.max(0, liveData.inFlight + delta);
  if (liveData.snapshot.busy !== liveData.inFlight > 0) setLiveData({ busy: liveData.inFlight > 0 });
}
function subscribeLiveData(fn) {
  liveData.subs.add(fn);
  return () => liveData.subs.delete(fn);
}
onSessionEnd(() => setLiveData({ updatedAt: 0 }));

/** Ask every mounted data hook (and the shell's signals) to re-fetch now. */
function refreshLiveData() {
  window.dispatchEvent(new CustomEvent("sentinel:refresh"));
}

/** {updatedAt, busy} — when data last landed, and whether a fetch is running. */
function useLiveData() {
  return useSyncExternalStore(subscribeLiveData, () => liveData.snapshot);
}

/** Mounted once by the signed-in shell: the 60-second, visible-only clock. */
function useAutoRefresh() {
  useEffect(() => {
    let last = Date.now();
    const visible = () => document.visibilityState === "visible";
    const onRefresh = () => {
      last = Date.now();
    };
    const tick = () => visible() && Date.now() - last >= LIVE_REFRESH_MS && refreshLiveData();
    const onReturn = () => visible() && Date.now() - last >= LIVE_REFOCUS_GAP_MS && refreshLiveData();
    // Checked often and judged by elapsed time, so a throttled timer in a
    // background tab can't bunch refreshes up when it comes back.
    const id = setInterval(tick, 5000);
    window.addEventListener("sentinel:refresh", onRefresh);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearInterval(id);
      window.removeEventListener("sentinel:refresh", onRefresh);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, []);
}

/**
 * One GET, with the four states every page actually needs: loading, error,
 * data, and refetch. Pages were repeating this by hand and quietly skipping
 * the error branch, which is how a dashboard ends up showing a blank panel
 * when the backend is down.
 *
 * `optional: true` marks a route tagged ASSUMED in endpoints.js: a 404/405
 * resolves to the fallback instead of surfacing as an error, so an endpoint
 * the backend hasn't built yet reads as "nothing here" rather than "broken".
 *
 * Every instance also joins the auto-refresh above.
 */
function useApi(path, { optional = false, fallback = null, skip = false, deps = [] } = {}) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const alive = useRef(true);
  const lastJson = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async ({ quiet = false, background = false } = {}) => {
      if (skip || !path) {
        setLoading(false);
        return;
      }
      if (!quiet && !background) setLoading(true);
      if (!background) setError("");
      trackLiveRequest(1);
      try {
        const res = await api.get(path);
        if (!alive.current) return;
        const json = JSON.stringify(res.data);
        if (json !== lastJson.current) {
          lastJson.current = json;
          setData(res.data);
        }
        setUnavailable(false);
        setError("");
        setLiveData({ updatedAt: Date.now() });
      } catch (err) {
        if (!alive.current) return;
        if (optional && isMissingEndpoint(err)) {
          lastJson.current = null;
          setData(fallback);
          setUnavailable(true);
        } else if (!background) {
          setError(errorMessage(err, "Could not load this view"));
        }
      } finally {
        trackLiveRequest(-1);
        if (alive.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, optional, skip, ...deps]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const again = () => load({ background: true });
    window.addEventListener("sentinel:refresh", again);
    return () => window.removeEventListener("sentinel:refresh", again);
  }, [load]);

  return { data, loading, error, unavailable, reload: () => load({ quiet: true }), setData };
}

/* ══════════════════════════════════════════════════════════════════════════
   §9  UI KIT
   ══════════════════════════════════════════════════════════════════════════ */

/* ---------------------------------------------------------------- tone ---- */
/**
 * Status tones. `signal-*` colours are reserved for state and never reused as
 * chart series. Each tone ships with a glyph in <StatusDot>, because three of
 * these sit below 3:1 against paper — colour alone is never the carrier.
 */
const TONE = {
  good: { text: "text-signal-good", bg: "bg-signal-good", soft: "bg-signal-good-soft", border: "border-signal-good" },
  watch: { text: "text-signal-watch", bg: "bg-signal-watch", soft: "bg-signal-watch-soft", border: "border-signal-watch" },
  flag: { text: "text-signal-flag", bg: "bg-signal-flag", soft: "bg-signal-flag-soft", border: "border-signal-flag" },
  neutral: { text: "text-ink-muted", bg: "bg-ink-muted", soft: "bg-ink/5", border: "border-ink/20" },
};
const tone = (name) => TONE[name] || TONE.neutral;

/* --------------------------------------------------------------- glyphs --- */
/** The shape that carries status when colour can't: never decorative. */
function StatusGlyph({ kind = "dot", className = "" }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true, className };
  if (kind === "check")
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5L5 9l4.5-6" />
      </svg>
    );
  if (kind === "watch")
    return (
      <svg {...common} fill="currentColor">
        <path d="M6 1l5 9.5H1L6 1z" />
        <path d="M5.4 4.6h1.2v3H5.4zM5.4 8.2h1.2v1.1H5.4z" fill="#F3F0E7" />
      </svg>
    );
  if (kind === "flag")
    return (
      <svg {...common} fill="currentColor">
        <circle cx="6" cy="6" r="5.5" />
        <path d="M5.4 2.8h1.2v4H5.4zM5.4 7.7h1.2v1.3H5.4z" fill="#F3F0E7" />
      </svg>
    );
  return (
    <svg {...common} fill="currentColor">
      <circle cx="6" cy="6" r="4" />
    </svg>
  );
}

/* ---------------------------------------------------------------- badge --- */
function Badge({ children, toneName = "neutral", glyph, className = "" }) {
  const t = tone(toneName);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium ${t.soft} ${t.text} ${className}`}
    >
      {glyph && <StatusGlyph kind={glyph} />}
      {children}
    </span>
  );
}

/** Status as a dot + word. The word is what makes this accessible. */
function StatusDot({ toneName, glyph, label, className = "" }) {
  const t = tone(toneName);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <span className={`${t.text} flex`}>
        <StatusGlyph kind={glyph} />
      </span>
      <span className="text-ink/80">{label}</span>
    </span>
  );
}

/* --------------------------------------------------------------- button --- */
const BUTTON_VARIANTS = {
  primary: "bg-ink text-paper hover:bg-ink-2 disabled:bg-ink/40",
  secondary: "border border-ink/20 bg-paper-raised text-ink hover:border-ink/40 hover:bg-ink/[0.03]",
  ghost: "text-ink/70 hover:bg-ink/5 hover:text-ink",
  danger: "bg-signal-flag text-white hover:brightness-110",
  approve: "bg-signal-good text-white hover:brightness-110",
};
const BUTTON_SIZES = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
        BUTTON_VARIANTS[variant]
      } ${BUTTON_SIZES[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" className="animate-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M8 1.5A6.5 6.5 0 0114.5 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ----------------------------------------------------------------- card --- */
function Card({ children, className = "", as: As = "div", ...props }) {
  return (
    <As className={`card ${className}`} {...props}>
      {children}
    </As>
  );
}

function CardHeader({ title, subtitle, action, className = "" }) {
  return (
    <div className={`flex items-start justify-between gap-4 border-b border-paper-line px-5 py-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-base font-medium leading-tight">
          {typeof title === "string" ? <Bi en={title} inline altClassName="text-[0.85em] font-normal text-ink-muted" /> : title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------- page header -- */
/** `live={false}` for a page with no server data (it drops the "Updated …" control). */
function PageHeader({ title, lede, children, live = true }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <TricolourMini className="mb-2.5" />
        <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-[-0.01em]">
          {typeof title === "string" ? <Bi en={title} altClassName="mt-0.5 text-[1.05rem] font-normal tracking-normal text-ink-muted" /> : title}
        </h1>
        {lede && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{lede}</p>}
      </div>
      {(children || live) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {live && <LiveStamp />}
          {children}
        </div>
      )}
    </header>
  );
}

/** "Updated 2 min ago" and a refresh button — the page-header face of §8's auto-refresh. */
function LiveStamp() {
  const { updatedAt, busy } = useLiveData();
  const now = useNow(15_000);
  const { t } = useT();
  if (!updatedAt) return null;
  const minutes = Math.floor((now.getTime() - updatedAt) / 60_000);
  const [en, vars] =
    minutes < 1 ? ["Updated just now", undefined] : minutes < 60 ? ["Updated {n} min ago", { n: minutes }] : ["Updated {n} hr ago", { n: Math.floor(minutes / 60) }];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-paper-line bg-paper-raised/95 py-1 pl-2.5 pr-1 text-[11px] text-ink-muted" title={formatDateTime(new Date(updatedAt))}>
      <span className="snt-live-dot" aria-hidden="true" />
      <span aria-live="polite">
        <Bi en={en} vars={vars} inline altClassName="hidden xl:inline" />
      </span>
      <button
        type="button"
        onClick={refreshLiveData}
        disabled={busy}
        aria-label={t("Refresh now")}
        title={t("Refresh now")}
        className="grid h-6 w-6 place-items-center rounded-full text-ink/60 hover:bg-ink/5 hover:text-ink disabled:cursor-default"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={busy ? "animate-spin" : ""}>
          <path d="M13.5 8a5.5 5.5 0 11-1.6-3.9M13.5 2.5v3h-3" />
        </svg>
      </button>
    </span>
  );
}

/** Every page body gets the same gutter, max width and scroll behaviour. */
function Page({ children, width = "max-w-6xl", className = "" }) {
  return (
    <div className={`scroll-area h-full overflow-y-auto ${className}`}>
      <div className={`mx-auto ${width} animate-fade-up px-5 py-7 sm:px-8 sm:py-9`}>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- states -- */
function Skeleton({ className = "", style }) {
  return (
    <div className={`relative overflow-hidden rounded bg-ink/[0.06] ${className}`} style={style}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-paper-raised/70 to-transparent" />
    </div>
  );
}

function SkeletonRows({ rows = 4, height = "h-16", className = "" }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        // Each row a touch fainter than the last, so the block reads as a list
        // settling in rather than a solid grey slab.
        <Skeleton key={i} className={`w-full ${height}`} style={{ opacity: 1 - i * 0.14 }} />
      ))}
    </div>
  );
}

function EmptyState({ title, body, icon, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-paper-line px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink/25">{icon}</div>}
      <p className="font-display text-base">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-signal-flag/30 bg-signal-flag-soft px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-signal-flag">
          <StatusGlyph kind="flag" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-signal-flag">{message}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            The dashboard is fine — this is the backend not answering. Nothing you see below is stale data pretending
            to be live.
          </p>
        </div>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

/** Shown where an endpoint tagged ASSUMED in endpoints.js isn't built yet. */
function NotWiredState({ what, path }) {
  return (
    <div className="rounded-lg border border-dashed border-paper-line bg-paper-dim/40 px-5 py-6 text-center">
      <p className="font-display text-sm">{what} isn't available from the backend yet</p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-muted">
        Sentinel expects <code className="rounded bg-ink/5 px-1 py-0.5 font-mono text-[11px]">{path}</code>. The page
        works without it — this panel fills in on its own the moment the route exists.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- table --- */
/**
 * `sort` + `onSort` make headings clickable: a head item with `sortKey` sorts
 * by that field; shift-click adds it as a tie-breaker (the small number shows
 * the level). Pass the Data View's `state.sort` and `toggleSort`.
 */
function Table({ head, children, className = "", sort, onSort }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-paper-line text-left">
            {head.map((h) => {
              const level = sort ? sort.findIndex((s) => s.key === h.sortKey) : -1;
              const current = level >= 0 ? sort[level] : null;
              const sortable = Boolean(onSort && h.sortKey);
              return (
                <th
                  key={h.key ?? h.label}
                  scope="col"
                  aria-sort={current ? (current.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted ${
                    h.align === "right" ? "text-right" : ""
                  }`}
                  style={h.width ? { width: h.width } : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={(e) => onSort(h.sortKey, e.shiftKey)}
                      className={`snt-th-sort ${current ? "is-on" : ""} ${h.align === "right" ? "flex-row-reverse" : ""}`}
                      title="Click to sort · Shift-click to add as a tie-breaker"
                    >
                      <span>{h.label}</span>
                      <span className="snt-th-arrow" aria-hidden="true">
                        {current ? (current.dir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                      {current && sort.length > 1 && <span className="snt-th-level">{level + 1}</span>}
                    </button>
                  ) : (
                    h.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-line">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, align, className = "", ...props }) {
  return (
    <td className={`px-4 py-3 align-middle ${align === "right" ? "text-right" : ""} ${className}`} {...props}>
      {children}
    </td>
  );
}

/* --------------------------------------------------------------- filters -- */
/** One filter row above the content, never scattered beside each panel. */
function FilterBar({ children }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

function SegmentedControl({ options, value, onChange, label }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-md border border-paper-line bg-paper-raised p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? "bg-ink text-paper" : "text-ink/60 hover:text-ink"
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={`ml-1.5 tnum ${active ? "text-paper/60" : "text-ink/35"}`}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder = "Search", className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-paper-line bg-paper-raised py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-ink/35 focus:border-ink/40"
      />
    </div>
  );
}

/* ----------------------------------------------------------------- modal -- */
function Modal({ open, onClose, title, children, footer, wide = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${wide ? "max-w-4xl" : "max-w-lg"} animate-fade-up rounded-lg border border-paper-line bg-paper-raised shadow-float`}
      >
        <div className="flex items-center justify-between border-b border-paper-line px-5 py-3.5">
          <h2 className="font-display text-base">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink/40 hover:bg-ink/5 hover:text-ink">
            <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="scroll-area max-h-[60vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-paper-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- key/value - */
function KeyValue({ items, className = "" }) {
  return (
    <dl className={`grid gap-x-6 gap-y-3 sm:grid-cols-2 ${className}`}>
      {items.map(({ label, value, mono }) => (
        <div key={label} className="min-w-0">
          <dt className="text-2xs uppercase tracking-wider text-ink-muted">{label}</dt>
          <dd className={`mt-0.5 truncate text-sm ${mono ? "font-mono text-xs" : ""}`}>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §9b  DATA VIEW
   Filter, search, sort, group, saved views and CSV export, one toolbar for
   every list in the dashboard.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Each page describes its data once, as a list of FIELDS, and gets the whole
 * toolbar for free:
 *
 *   { key, label, type, get?, options?, display?, format?, presets?,
 *     searchable?, filterable?, sortable?, groupable?, compare? }
 *
 *   type "enum"   → multi-select filter with live counts, groupable
 *   type "number" → min/max range filter with presets
 *   type "date"   → "last 24 h / 7 days / …" or a custom from–to
 *   type "text"   → searchable and sortable only
 *   type "sort"   → a named ordering only (e.g. "Urgency"); needs `compare`
 *
 * Search understands several words (all must match), quoted phrases, and a
 * leading minus to exclude:  lucknow -hostel "cctv tamper"
 *
 * The current view is remembered until sign-out (sessionStorage, wiped by
 * §7a), so leaving a page and coming back doesn't lose the official's
 * filters. Named views are a preference, like column choices, and are kept
 * on this browser (localStorage) until the backend has somewhere to put them.
 */

const DAY_MS = 864e5;
const DATE_PRESETS = [
  { key: "24h", label: "Last 24 hours", within: DAY_MS },
  { key: "7d", label: "Last 7 days", within: 7 * DAY_MS },
  { key: "30d", label: "Last 30 days", within: 30 * DAY_MS },
  { key: "90d", label: "Last 90 days", within: 90 * DAY_MS },
  { key: "older24", label: "Older than 24 hours", olderThan: DAY_MS },
  { key: "older3", label: "Older than 3 days", olderThan: 3 * DAY_MS },
  { key: "older7", label: "Older than 7 days", olderThan: 7 * DAY_MS },
  { key: "older30", label: "Older than 30 days", olderThan: 30 * DAY_MS },
];

function emptyViewState(initial = {}) {
  return { q: "", qField: "all", facets: {}, ranges: {}, dates: {}, sort: [], groupBy: null, ...initial };
}

const isBlank = (v) => v === null || v === undefined || v === "";
const fieldValue = (field, row) => (field.get ? field.get(row) : row[field.key]);

function enumLabel(field, value) {
  if (isBlank(value)) return "Not set";
  const opt = field.options?.find((o) => o.value === value);
  if (opt) return opt.label;
  return field.display ? field.display(value) : String(value);
}

/** What a person would read for this cell — used by search and by CSV export. */
function displayValue(field, row) {
  const v = fieldValue(field, row);
  if (field.type === "enum") return enumLabel(field, v);
  if (field.type === "date") return v ? formatDateTime(v) : "";
  if (field.type === "number") return isBlank(v) ? "" : String(field.format ? field.format(v) : v);
  return isBlank(v) ? "" : String(v);
}

/** Splits a search box into include/exclude terms, keeping "quoted phrases" whole. */
function parseQuery(raw) {
  const include = [];
  const exclude = [];
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g;
  let m;
  while ((m = re.exec(raw.toLowerCase()))) {
    const neg = m[1] || m[3];
    const term = (m[2] || m[4] || "").trim();
    if (!term || term === "-") continue;
    (neg ? exclude : include).push(term);
  }
  return { include, exclude };
}

function rangeActive(r) {
  return r && (!isBlank(r.min) || !isBlank(r.max));
}

function rowPasses(row, state, fields, skipKey) {
  const { include, exclude } = parseQuery(state.q || "");
  if (include.length || exclude.length) {
    const pool = fields
      .filter((f) => (state.qField === "all" ? f.searchable !== false && f.type !== "sort" : f.key === state.qField))
      .map((f) => displayValue(f, row).toLowerCase())
      .join(" ␟ ");
    if (!include.every((t) => pool.includes(t))) return false;
    if (exclude.some((t) => pool.includes(t))) return false;
  }
  const now = Date.now();
  for (const f of fields) {
    if (f.key === skipKey) continue;
    if (f.type === "enum") {
      const sel = state.facets[f.key];
      if (sel?.length) {
        const v = fieldValue(f, row);
        if (!sel.includes(isBlank(v) ? "" : v)) return false;
      }
    } else if (f.type === "number") {
      const r = state.ranges[f.key];
      if (rangeActive(r)) {
        const v = toNumber(fieldValue(f, row), null);
        if (v === null) return false;
        if (!isBlank(r.min) && v < Number(r.min)) return false;
        if (!isBlank(r.max) && v > Number(r.max)) return false;
      }
    } else if (f.type === "date") {
      const d = state.dates[f.key];
      if (d && (d.preset || d.from || d.to)) {
        const t = parseDate(fieldValue(f, row))?.getTime();
        if (!t) return false;
        const p = DATE_PRESETS.find((x) => x.key === d.preset);
        if (p?.within && now - t > p.within) return false;
        if (p?.olderThan && now - t < p.olderThan) return false;
        if (d.from && t < new Date(`${d.from}T00:00:00`).getTime()) return false;
        if (d.to && t > new Date(`${d.to}T23:59:59`).getTime()) return false;
      }
    }
  }
  return true;
}

function comparatorFor(field, dir) {
  const mul = dir === "desc" ? -1 : 1;
  if (field.compare) return (a, b) => mul * field.compare(a, b);
  const norm = (v) => {
    if (field.type === "number") return toNumber(v, null);
    if (field.type === "date") return parseDate(v)?.getTime() ?? null;
    if (field.type === "enum" && field.options) {
      const i = field.options.findIndex((o) => o.value === v);
      return i < 0 ? null : i;
    }
    if (field.type === "enum") return isBlank(v) ? null : enumLabel(field, v);
    return isBlank(v) ? null : String(v);
  };
  return (a, b) => {
    const va = norm(fieldValue(field, a));
    const vb = norm(fieldValue(field, b));
    // Empty values sink to the bottom whichever way the column is sorted.
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "number" && typeof vb === "number") return mul * (va - vb);
    return mul * String(va).localeCompare(String(vb), "en-IN", { numeric: true, sensitivity: "base" });
  };
}

function readStore(store, key, fallback) {
  try {
    const raw = window[store].getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(store, key, value) {
  try {
    window[store].setItem(key, JSON.stringify(value));
  } catch {
    /* private window or storage full: the view just isn't remembered */
  }
}

function useDataView(rows = [], { fields, initial = {}, storageKey, presets = [] }) {
  const base = useMemo(() => emptyViewState(initial), []); // eslint-disable-line react-hooks/exhaustive-deps
  const sessionKey = `sentinel.view.${storageKey}`;
  const savedKey = `sentinel.savedViews.${storageKey}`;

  const [state, setState] = useState(() => ({ ...base, ...readStore("sessionStorage", sessionKey, {}) }));
  const [saved, setSaved] = useState(() => readStore("localStorage", savedKey, []));

  useEffect(() => writeStore("sessionStorage", sessionKey, state), [sessionKey, state]);
  useEffect(() => writeStore("localStorage", savedKey, saved), [savedKey, saved]);

  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);

  const result = useMemo(() => {
    const filtered = rows.filter((r) => rowPasses(r, state, fields));
    const levels = (state.sort || []).filter((s) => fieldMap.has(s.key));
    if (!levels.length) return filtered;
    const cmps = levels.map((s) => comparatorFor(fieldMap.get(s.key), s.dir));
    return [...filtered].sort((a, b) => {
      for (const c of cmps) {
        const r = c(a, b);
        if (r) return r;
      }
      return 0;
    });
  }, [rows, state, fields, fieldMap]);

  /** Options for one enum field, each counted against every OTHER active filter. */
  const facetOptions = useCallback(
    (key) => {
      const f = fieldMap.get(key);
      if (!f) return [];
      const pool = rows.filter((r) => rowPasses(r, state, fields, key));
      const counts = new Map();
      rows.forEach((r) => {
        const v = fieldValue(f, r);
        counts.set(isBlank(v) ? "" : v, 0);
      });
      pool.forEach((r) => {
        const v = fieldValue(f, r);
        const k = isBlank(v) ? "" : v;
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      const order = f.options?.map((o) => o.value) || [];
      return [...counts.entries()]
        .map(([value, count]) => ({ value, count, label: enumLabel(f, value) }))
        .sort((a, b) => {
          const ia = order.indexOf(a.value);
          const ib = order.indexOf(b.value);
          if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          return a.label.localeCompare(b.label, "en-IN");
        });
    },
    [rows, state, fields, fieldMap]
  );

  const groups = useMemo(() => {
    const f = state.groupBy && fieldMap.get(state.groupBy);
    if (!f) return null;
    const map = new Map();
    result.forEach((r) => {
      const v = fieldValue(f, r);
      const k = isBlank(v) ? "" : v;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    });
    const order = f.options?.map((o) => o.value) || [];
    return [...map.entries()]
      .map(([key, items]) => ({ key, label: enumLabel(f, key), rows: items }))
      .sort((a, b) => {
        const ia = order.indexOf(a.key);
        const ib = order.indexOf(b.key);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        return b.rows.length - a.rows.length;
      });
  }, [state.groupBy, result, fieldMap]);

  const set = useCallback((patch) => setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })), []);

  const api = useMemo(
    () => ({
      setQ: (q) => set({ q }),
      setQField: (qField) => set({ qField }),
      setFacet: (key, values) => set((s) => ({ facets: { ...s.facets, [key]: values } })),
      toggleFacet: (key, value) =>
        set((s) => {
          const cur = s.facets[key] || [];
          return { facets: { ...s.facets, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] } };
        }),
      setRange: (key, range) => set((s) => ({ ranges: { ...s.ranges, [key]: range } })),
      setDate: (key, value) => set((s) => ({ dates: { ...s.dates, [key]: value } })),
      setSort: (sort) => set({ sort }),
      /** Header click: plain click sorts by this alone; shift-click adds it as a tie-breaker. */
      toggleSort: (key, additive = false) =>
        set((s) => {
          const cur = s.sort || [];
          const existing = cur.find((x) => x.key === key);
          if (!additive) {
            if (!existing || cur.length > 1) return { sort: [{ key, dir: existing?.dir === "asc" ? "desc" : "asc" }] };
            return { sort: existing.dir === "asc" ? [{ key, dir: "desc" }] : [] };
          }
          if (!existing) return { sort: [...cur, { key, dir: "asc" }] };
          if (existing.dir === "asc") return { sort: cur.map((x) => (x.key === key ? { ...x, dir: "desc" } : x)) };
          return { sort: cur.filter((x) => x.key !== key) };
        }),
      setGroupBy: (groupBy) => set({ groupBy }),
      reset: () => setState(base),
      clearFilters: () => set({ q: "", qField: "all", facets: {}, ranges: {}, dates: {} }),
      apply: (view) => setState({ ...emptyViewState(), ...view }),
      saveView: (name) =>
        setSaved((list) => [
          ...list.filter((v) => v.name !== name),
          { name, state: { ...state }, savedAt: new Date().toISOString() },
        ]),
      deleteView: (name) => setSaved((list) => list.filter((v) => v.name !== name)),
    }),
    [set, base, state]
  );

  const chips = useMemo(() => {
    const out = [];
    if (state.q.trim()) {
      const scope = state.qField === "all" ? "" : `${fieldMap.get(state.qField)?.label || state.qField}: `;
      out.push({ id: "q", label: `${scope}“${state.q.trim()}”`, onRemove: () => api.setQ("") });
    }
    fields.forEach((f) => {
      if (f.type === "enum" && state.facets[f.key]?.length) {
        const vals = state.facets[f.key];
        const text = vals.length <= 2 ? vals.map((v) => enumLabel(f, v)).join(", ") : `${vals.length} selected`;
        out.push({ id: `f-${f.key}`, label: `${f.label}: ${text}`, onRemove: () => api.setFacet(f.key, []) });
      }
      if (f.type === "number" && rangeActive(state.ranges[f.key])) {
        const r = state.ranges[f.key];
        const text = !isBlank(r.min) && !isBlank(r.max) ? `${r.min}–${r.max}` : !isBlank(r.min) ? `≥ ${r.min}` : `≤ ${r.max}`;
        out.push({ id: `r-${f.key}`, label: `${f.label}: ${text}`, onRemove: () => api.setRange(f.key, null) });
      }
      const d = f.type === "date" && state.dates[f.key];
      if (d && (d.preset || d.from || d.to)) {
        const p = DATE_PRESETS.find((x) => x.key === d.preset);
        const text = p ? p.label : `${d.from || "…"} → ${d.to || "…"}`;
        out.push({ id: `d-${f.key}`, label: `${f.label}: ${text}`, onRemove: () => api.setDate(f.key, null) });
      }
    });
    return out;
  }, [state, fields, fieldMap, api]);

  return {
    ...api,
    state,
    fields,
    fieldMap,
    rows,
    result,
    groups,
    total: rows.length,
    chips,
    facetOptions,
    presets,
    saved,
  };
}

/* ------------------------------------------------------------- export ---- */
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads exactly what's on screen — filtered and in the current order. */
function exportCsv(rows, fields, name = "sentinel") {
  const cols = fields.filter((f) => f.type !== "sort" && f.exportable !== false);
  const lines = [cols.map((f) => csvCell(f.label)).join(",")];
  rows.forEach((r) => lines.push(cols.map((f) => csvCell(displayValue(f, r))).join(",")));
  // Leading BOM so Excel opens Hindi / ₹ / accented names correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------ pieces ----- */
const DV_ICON = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true };

function Chevron() {
  return (
    <svg {...DV_ICON} width="11" height="11">
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A toolbar pill that opens a small glass panel below it. */
function ToolPill({ label, icon, count, active, align = "left", width = 260, children, title }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`snt-pill ${active ? "is-active" : ""}`}
      >
        {icon}
        <span>{label}</span>
        {count ? <span className="snt-pill-count tnum">{count}</span> : null}
        <Chevron />
      </button>
      {open && (
        <div
          className="snt-pop p-2"
          style={align === "left" ? { left: 0, right: "auto", minWidth: width } : { right: 0, minWidth: width }}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

function MenuLabel({ children }) {
  return <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a93a8]">{children}</p>;
}

function FacetMenu({ view, field }) {
  const [find, setFind] = useState("");
  const options = view.facetOptions(field.key);
  const selected = view.state.facets[field.key] || [];
  const shown = find ? options.filter((o) => o.label.toLowerCase().includes(find.toLowerCase())) : options;
  return (
    <div>
      <MenuLabel>{field.label}</MenuLabel>
      {options.length > 7 && (
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={`Find ${field.label.toLowerCase()}…`}
          className="mb-1.5 w-full rounded-md border border-[#0B2A6F]/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0B2A6F]/40"
        />
      )}
      <ul className="scroll-area max-h-64 overflow-y-auto">
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <li key={String(o.value)} className="group flex items-center">
              <label
                className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[#0B2A6F]/[0.05] ${
                  o.count === 0 && !on ? "opacity-45" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => view.toggleFacet(field.key, o.value)}
                  className="h-3.5 w-3.5 accent-[#0B2A6F]"
                />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="tnum text-[11px] text-[#8a93a8]">{o.count}</span>
              </label>
              <button
                type="button"
                onClick={() => view.setFacet(field.key, [o.value])}
                className="ml-0.5 rounded px-1.5 py-1 text-[10px] font-medium text-[#0B2A6F]/60 opacity-0 hover:text-[#0B2A6F] group-hover:opacity-100"
                title={`Show only ${o.label}`}
              >
                only
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-2 py-2 text-xs text-[#8a93a8]">Nothing matches.</li>}
      </ul>
      <div className="mt-1.5 flex justify-between border-t border-[#0B2A6F]/10 px-1 pt-1.5">
        <button type="button" className="rounded px-1.5 py-1 text-[11px] font-medium text-[#0B2A6F]" onClick={() => view.setFacet(field.key, options.map((o) => o.value))}>
          Select all
        </button>
        <button type="button" className="rounded px-1.5 py-1 text-[11px] text-[#6b7590]" onClick={() => view.setFacet(field.key, [])}>
          Clear
        </button>
      </div>
    </div>
  );
}

function RangeMenu({ view, field }) {
  const r = view.state.ranges[field.key] || {};
  const values = view.rows.map((row) => toNumber(fieldValue(field, row), null)).filter((v) => v !== null);
  const lo = values.length ? Math.floor(Math.min(...values)) : 0;
  const hi = values.length ? Math.ceil(Math.max(...values)) : 100;
  const input = "w-full rounded-md border border-[#0B2A6F]/15 bg-white px-2.5 py-1.5 text-xs tnum outline-none focus:border-[#0B2A6F]/40";
  return (
    <div>
      <MenuLabel>{field.label}</MenuLabel>
      <div className="flex items-center gap-2 px-2">
        <label className="flex-1 text-[10px] text-[#6b7590]">
          Min
          <input type="number" className={`${input} mt-0.5`} placeholder={String(lo)} value={r.min ?? ""} onChange={(e) => view.setRange(field.key, { ...r, min: e.target.value })} />
        </label>
        <span className="mt-4 text-[#8a93a8]">–</span>
        <label className="flex-1 text-[10px] text-[#6b7590]">
          Max
          <input type="number" className={`${input} mt-0.5`} placeholder={String(hi)} value={r.max ?? ""} onChange={(e) => view.setRange(field.key, { ...r, max: e.target.value })} />
        </label>
      </div>
      {field.presets?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 px-2">
          {field.presets.map((p) => {
            const on = String(r.min ?? "") === String(p.min ?? "") && String(r.max ?? "") === String(p.max ?? "");
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => view.setRange(field.key, on ? null : { min: p.min ?? "", max: p.max ?? "" })}
                className={`snt-chip-btn ${on ? "is-on" : ""}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 px-2 text-[10px] text-[#8a93a8]">
        Data spans {lo}–{hi}.
      </p>
    </div>
  );
}

function DateMenu({ view, field }) {
  const d = view.state.dates[field.key] || {};
  const input = "w-full rounded-md border border-[#0B2A6F]/15 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0B2A6F]/40";
  return (
    <div>
      <MenuLabel>{field.label}</MenuLabel>
      <ul>
        {DATE_PRESETS.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => view.setDate(field.key, d.preset === p.key ? null : { preset: p.key })}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#0B2A6F]/[0.05] ${
                d.preset === p.key ? "font-semibold text-[#0B2A6F]" : ""
              }`}
            >
              {p.label}
              {d.preset === p.key && <StatusGlyph kind="check" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 border-t border-[#0B2A6F]/10 px-2 pt-2">
        <p className="mb-1 text-[10px] text-[#6b7590]">Custom range</p>
        <div className="flex items-center gap-1.5">
          <input type="date" className={input} value={d.from || ""} onChange={(e) => view.setDate(field.key, { from: e.target.value, to: d.to || "" })} />
          <span className="text-[#8a93a8]">→</span>
          <input type="date" className={input} value={d.to || ""} onChange={(e) => view.setDate(field.key, { from: d.from || "", to: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function SortMenu({ view }) {
  const sortable = view.fields.filter((f) => f.sortable !== false);
  const levels = view.state.sort || [];
  const used = new Set(levels.map((l) => l.key));
  const select = "min-w-0 flex-1 rounded-md border border-[#0B2A6F]/15 bg-white px-2 py-1.5 text-xs outline-none";
  const update = (i, patch) => view.setSort(levels.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div>
      <MenuLabel>Sort by · क्रम</MenuLabel>
      {levels.length === 0 && <p className="px-2 pb-2 text-xs text-[#6b7590]">Default order. Add a level below.</p>}
      <ol className="space-y-1.5 px-1">
        {levels.map((l, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-9 shrink-0 text-[10px] text-[#8a93a8]">{i === 0 ? "Sort" : "then"}</span>
            <select className={select} value={l.key} onChange={(e) => update(i, { key: e.target.value })}>
              {sortable
                .filter((f) => f.key === l.key || !used.has(f.key))
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </select>
            {view.fieldMap.get(l.key)?.type !== "sort" && (
              <button
                type="button"
                onClick={() => update(i, { dir: l.dir === "asc" ? "desc" : "asc" })}
                className="shrink-0 rounded-md border border-[#0B2A6F]/15 bg-white px-2 py-1.5 text-[11px] font-medium text-[#0B2A6F]"
                title="Flip direction"
              >
                {l.dir === "asc" ? "↑ Asc" : "↓ Desc"}
              </button>
            )}
            <button
              type="button"
              onClick={() => view.setSort(levels.filter((_, j) => j !== i))}
              className="shrink-0 rounded p-1 text-[#8a93a8] hover:text-[#b42318]"
              aria-label="Remove sort level"
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex justify-between border-t border-[#0B2A6F]/10 px-1 pt-1.5">
        <button
          type="button"
          disabled={levels.length >= 3 || used.size >= sortable.length}
          onClick={() => {
            const next = sortable.find((f) => !used.has(f.key));
            if (next) view.setSort([...levels, { key: next.key, dir: next.type === "date" ? "desc" : "asc" }]);
          }}
          className="rounded px-1.5 py-1 text-[11px] font-medium text-[#0B2A6F] disabled:opacity-40"
        >
          + Add level
        </button>
        <button type="button" onClick={() => view.setSort([])} className="rounded px-1.5 py-1 text-[11px] text-[#6b7590]">
          Reset
        </button>
      </div>
      <p className="mt-1.5 px-2 text-[10px] leading-snug text-[#8a93a8]">Tip: on tables, click a column heading to sort; shift-click to add it as a tie-breaker.</p>
    </div>
  );
}

function GroupMenu({ view, close }) {
  const groupable = view.fields.filter((f) => f.type === "enum" && f.groupable !== false);
  const opts = [{ key: null, label: "No grouping" }, ...groupable.map((f) => ({ key: f.key, label: f.label }))];
  return (
    <div>
      <MenuLabel>Group by · समूह</MenuLabel>
      {opts.map((o) => (
        <button
          key={o.key ?? "none"}
          type="button"
          onClick={() => {
            view.setGroupBy(o.key);
            close();
          }}
          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#0B2A6F]/[0.05] ${
            view.state.groupBy === o.key ? "font-semibold text-[#0B2A6F]" : ""
          }`}
        >
          {o.label}
          {view.state.groupBy === o.key && <StatusGlyph kind="check" />}
        </button>
      ))}
    </div>
  );
}

function ViewsMenu({ view, close }) {
  const [name, setName] = useState("");
  const row = "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[#0B2A6F]/[0.05]";
  return (
    <div>
      {view.presets.length > 0 && (
        <>
          <MenuLabel>Quick views</MenuLabel>
          {view.presets.map((p) => (
            <button
              key={p.name}
              type="button"
              className={row}
              onClick={() => {
                view.apply(p.state);
                close();
              }}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-[#0B2A6F]">{p.name}</span>
                {p.hint && <span className="block truncate text-[10.5px] text-[#8a93a8]">{p.hint}</span>}
              </span>
            </button>
          ))}
        </>
      )}
      <MenuLabel>My saved views</MenuLabel>
      {view.saved.length === 0 && <p className="px-2 pb-1 text-xs text-[#8a93a8]">None yet. Set filters, then save them here.</p>}
      {view.saved.map((s) => (
        <div key={s.name} className="group flex items-center">
          <button
            type="button"
            className={row}
            onClick={() => {
              view.apply(s.state);
              close();
            }}
          >
            <span className="truncate">{s.name}</span>
          </button>
          <button
            type="button"
            onClick={() => view.deleteView(s.name)}
            className="rounded p-1 text-[#8a93a8] opacity-0 hover:text-[#b42318] group-hover:opacity-100"
            aria-label={`Delete view ${s.name}`}
          >
            ×
          </button>
        </div>
      ))}
      <form
        className="mt-1.5 flex gap-1.5 border-t border-[#0B2A6F]/10 px-1 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          view.saveView(name.trim());
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this view…"
          className="min-w-0 flex-1 rounded-md border border-[#0B2A6F]/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#0B2A6F]/40"
        />
        <button type="submit" className="rounded-md bg-[#0B2A6F] px-2.5 py-1.5 text-[11px] font-semibold text-white">
          Save
        </button>
      </form>
      <p className="mt-1.5 px-2 text-[10px] text-[#8a93a8]">Saved on this browser only.</p>
    </div>
  );
}

const ToolIcons = {
  filter: (
    <svg {...DV_ICON}>
      <path d="M2.5 3.5h11l-4.2 5v4l-2.6 1.2V8.5z" strokeLinejoin="round" />
    </svg>
  ),
  sort: (
    <svg {...DV_ICON}>
      <path d="M5 3v10M5 13l-2.2-2.2M5 13l2.2-2.2M11 13V3M11 3L8.8 5.2M11 3l2.2 2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  group: (
    <svg {...DV_ICON}>
      <rect x="2.5" y="2.5" width="11" height="4" rx="1" />
      <rect x="2.5" y="9.5" width="11" height="4" rx="1" />
    </svg>
  ),
  views: (
    <svg {...DV_ICON}>
      <path d="M4 2.5h8a1 1 0 011 1v10l-5-3-5 3v-10a1 1 0 011-1z" strokeLinejoin="round" />
    </svg>
  ),
  download: (
    <svg {...DV_ICON}>
      <path d="M8 2.5v8M4.8 7.5L8 10.7l3.2-3.2M3 13.5h10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (
    <svg {...DV_ICON}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" strokeLinecap="round" />
    </svg>
  ),
  range: (
    <svg {...DV_ICON}>
      <path d="M2.5 8h11M5 5.5v5M11 5.5v5" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * The toolbar. Three rows:
 *   1. quick tabs for the one filter used most (optional) and the result count
 *   2. search, every filter as a pill, then sort / group / views / export
 *   3. the active filters as removable chips
 */
function DataToolbar({ view, quick, searchPlaceholder = "Search…", exportName, extra, allowGroup = true }) {
  const { t } = useT();
  const searchable = view.fields.filter((f) => f.searchable !== false && f.type !== "sort" && f.type !== "date");
  const quickField = quick && view.fieldMap.get(quick);
  const quickOptions = quickField ? view.facetOptions(quick) : [];
  const quickSel = quickField ? view.state.facets[quick] || [] : [];
  const sortCount = (view.state.sort || []).length;
  const shown = view.result.length;

  return (
    <div className="snt-toolbar mb-4">
      {(
        <div className="flex flex-wrap items-center justify-between gap-3">
          {quickField ? (
            <div role="group" aria-label={quickField.label} className="snt-quick">
              <button type="button" aria-pressed={!quickSel.length} onClick={() => view.setFacet(quick, [])} className={!quickSel.length ? "is-on" : ""}>
                All <span className="tnum">{view.rows.filter((r) => rowPasses(r, view.state, view.fields, quick)).length}</span>
              </button>
              {quickOptions.map((o) => {
                const on = quickSel.length === 1 && quickSel[0] === o.value;
                return (
                  <button key={String(o.value)} type="button" aria-pressed={on} onClick={() => view.setFacet(quick, on ? [] : [o.value])} className={on ? "is-on" : ""}>
                    {o.label} <span className="tnum">{o.count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          <p className="text-xs text-ink-muted" aria-live="polite">
            {t("Showing {n} of {total}", { n: shown, total: view.total })}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="snt-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0 text-[#8a93a8]">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={view.state.q}
            onChange={(e) => view.setQ(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            title='Several words must all match · "quoted phrase" · -word to exclude'
          />
          <select value={view.state.qField} onChange={(e) => view.setQField(e.target.value)} aria-label="Search in">
            <option value="all">All fields</option>
            {searchable.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {view.fields
          .filter((f) => f.filterable !== false && f.key !== quick)
          .map((f) => {
            if (f.type === "enum") {
              const n = view.state.facets[f.key]?.length || 0;
              return (
                <ToolPill key={f.key} label={f.label} count={n} active={n > 0} icon={ToolIcons.filter}>
                  <FacetMenu view={view} field={f} />
                </ToolPill>
              );
            }
            if (f.type === "number") {
              const on = rangeActive(view.state.ranges[f.key]);
              return (
                <ToolPill key={f.key} label={f.label} active={on} count={on ? 1 : 0} icon={ToolIcons.range}>
                  <RangeMenu view={view} field={f} />
                </ToolPill>
              );
            }
            if (f.type === "date") {
              const d = view.state.dates[f.key];
              const on = Boolean(d && (d.preset || d.from || d.to));
              return (
                <ToolPill key={f.key} label={f.label} active={on} count={on ? 1 : 0} icon={ToolIcons.calendar}>
                  <DateMenu view={view} field={f} />
                </ToolPill>
              );
            }
            return null;
          })}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToolPill label={t("Sort")} count={sortCount} active={sortCount > 0} icon={ToolIcons.sort} align="right" width={320}>
            <SortMenu view={view} />
          </ToolPill>
          {allowGroup && (
            <ToolPill
              label={view.state.groupBy ? `Grouped: ${view.fieldMap.get(view.state.groupBy)?.label}` : t("Group")}
              active={Boolean(view.state.groupBy)}
              icon={ToolIcons.group}
              align="right"
              width={200}
            >
              {(close) => <GroupMenu view={view} close={close} />}
            </ToolPill>
          )}
          <ToolPill label={t("Views")} icon={ToolIcons.views} align="right" width={270}>
            {(close) => <ViewsMenu view={view} close={close} />}
          </ToolPill>
          {extra}
          <button
            type="button"
            className="snt-pill snt-clear-all"
            onClick={view.clearFilters}
            disabled={!view.chips.length}
            title={view.chips.length ? "Remove every filter and the search" : "No filters applied"}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M2.5 3.5h11l-4.2 5v4.3l-2.6 1.2V8.5z" strokeLinejoin="round" />
              <path d="M10.8 10.8l3.4 3.4M14.2 10.8l-3.4 3.4" strokeLinecap="round" />
            </svg>
            <span>{t("Clear all filters")}</span>
            {view.chips.length > 0 && <span className="snt-pill-count tnum">{view.chips.length}</span>}
          </button>
          <button
            type="button"
            className="snt-pill"
            onClick={() => exportCsv(view.result, view.fields, exportName)}
            disabled={!shown}
            title="Download what's shown as a spreadsheet (CSV)"
          >
            {ToolIcons.download}
            <span>{t("Export")}</span>
          </button>
        </div>
      </div>

      {view.chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#8a93a8]">{t("Filters")}</span>
          {view.chips.map((c) => (
            <span key={c.id} className="snt-chip">
              {c.label}
              <button type="button" onClick={c.onRemove} aria-label={`Remove ${c.label}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders the list as-is, or in collapsible sections when a Group is chosen. */
function GroupedList({ view, children }) {
  const [collapsed, setCollapsed] = useState({});
  if (!view.groups) return children(view.result);
  return (
    <div className="space-y-5">
      {view.groups.map((g) => {
        const k = String(g.key);
        const shut = collapsed[k];
        return (
          <section key={k}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [k]: !c[k] }))}
              className="snt-group-head"
              aria-expanded={!shut}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: shut ? "rotate(-90deg)" : "none", transition: "transform .2s" }}>
                <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>{g.label}</span>
              <span className="snt-pill-count tnum">{g.rows.length}</span>
            </button>
            {!shut && <div className="mt-2.5">{children(g.rows)}</div>}
          </section>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- pagination ---- */
function usePaged(rows, initialSize = 25) {
  const [size, setSize] = useState(initialSize);
  const [page, setPage] = useState(0);
  const pages = size === Infinity ? 1 : Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pages - 1);
  useEffect(() => setPage(0), [rows.length, size]);
  const slice = size === Infinity ? rows : rows.slice(safe * size, safe * size + size);
  return { slice, page: safe, pages, size, setSize, setPage, total: rows.length };
}

function Paginator({ paged }) {
  if (paged.total <= 10) return null;
  const from = paged.size === Infinity ? 1 : paged.page * paged.size + 1;
  const to = paged.size === Infinity ? paged.total : Math.min(paged.total, from + paged.size - 1);
  const btn = "rounded-md border border-[#0B2A6F]/15 bg-white/80 px-2.5 py-1 text-xs font-medium text-[#0B2A6F] disabled:opacity-35";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-paper-line px-4 py-2.5 text-xs text-ink-muted">
      <label className="flex items-center gap-2">
        Rows per page
        <select
          value={paged.size === Infinity ? "all" : paged.size}
          onChange={(e) => paged.setSize(e.target.value === "all" ? Infinity : Number(e.target.value))}
          className="rounded-md border border-[#0B2A6F]/15 bg-white px-1.5 py-1 text-xs"
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="all">All</option>
        </select>
      </label>
      <span className="tnum">
        {from}–{to} of {paged.total}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={paged.page === 0} onClick={() => paged.setPage(0)} aria-label="First page">
          «
        </button>
        <button type="button" className={btn} disabled={paged.page === 0} onClick={() => paged.setPage(paged.page - 1)}>
          Prev
        </button>
        <span className="tnum px-1">
          {paged.page + 1} / {paged.pages}
        </span>
        <button type="button" className={btn} disabled={paged.page >= paged.pages - 1} onClick={() => paged.setPage(paged.page + 1)}>
          Next
        </button>
        <button type="button" className={btn} disabled={paged.page >= paged.pages - 1} onClick={() => paged.setPage(paged.pages - 1)} aria-label="Last page">
          »
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------ shared field helpers --- */
/** Turns a §1 vocabulary map into enum options, in the order given. */
function optsFrom(vocab, order) {
  const keys = order || Object.keys(vocab);
  return keys.map((value) => ({ value, label: vocab[value]?.label ?? humanise(value) }));
}

/** Institute + district columns for any row that carries an institute_id. */
function instituteLinkFields(index) {
  return [
    {
      key: "institute",
      label: "Institute",
      type: "enum",
      get: (r) => r.institute_id,
      display: (id) => index.get(id)?.name || `Institute ${shortId(id)}`,
    },
    { key: "district", label: "District", type: "enum", get: (r) => index.get(r.institute_id)?.district },
  ];
}

/** Critical before warning, then newest first — the same order as alertsByUrgency. */
function alertUrgencyCompare(a, b) {
  const rank = { red: 0, yellow: 1 };
  const s = (rank[a.severity] ?? 2) - (rank[b.severity] ?? 2);
  if (s) return s;
  return (parseDate(b.created_at)?.getTime() ?? 0) - (parseDate(a.created_at)?.getTime() ?? 0);
}

/** Column show/hide for wide tables. */
function ColumnPicker({ columns, hidden, onChange }) {
  return (
    <ToolPill label="Columns" count={hidden.length ? columns.length - hidden.length : 0} active={hidden.length > 0} align="right" width={200} icon={
      <svg {...DV_ICON}>
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
        <path d="M6.2 2.5v11M9.8 2.5v11" />
      </svg>
    }>
      <MenuLabel>Show columns</MenuLabel>
      {columns.map((c) => (
        <label key={c.key} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs hover:bg-[#0B2A6F]/[0.05] ${c.locked ? "opacity-50" : "cursor-pointer"}`}>
          <input
            type="checkbox"
            disabled={c.locked}
            checked={!hidden.includes(c.key)}
            onChange={() => onChange(hidden.includes(c.key) ? hidden.filter((k) => k !== c.key) : [...hidden, c.key])}
            className="h-3.5 w-3.5 accent-[#0B2A6F]"
          />
          {c.label}
        </label>
      ))}
    </ToolPill>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   §9c  EXCEL (.xlsx) WRITER
   A real Office Open XML workbook, built in the browser — no library.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * An .xlsx file is a zip of a few XML files. This writes that zip uncompressed
 * ("stored"), which every version of Excel, LibreOffice and Google Sheets
 * opens. Sheets get a styled header row, frozen panes, sensible column widths
 * and real numbers (so the official can sum and chart in Excel directly).
 *
 *   downloadXlsx("report", [{ name: "Institutes", columns: [{label, width?}], rows: [[...], ...] }])
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal zip writer (store method). files: [{ name, data: Uint8Array }] */
function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  files.forEach(({ name, data }) => {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
    ]);
    chunks.push(local, nameBytes, data);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset),
      ]),
      nameBytes
    );
    offset += local.length + nameBytes.length + data.length;
  });

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  return new Blob([...chunks, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const xmlEsc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 forbids would corrupt the file.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colName(i) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml({ columns, rows, title }) {
  // Style ids (see styles below): 0 normal · 1 header · 2 title · 3 number 0.0 · 4 wrap
  const lines = [];
  let r = 1;
  const cell = (ci, v, style = 0) => {
    const ref = `${colName(ci)}${r}`;
    if (v === null || v === undefined || v === "") return `<c r="${ref}" s="${style}"/>`;
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${style === 0 ? 3 : style}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  };
  if (title) {
    lines.push(`<row r="${r}" ht="22" customHeight="1">${cell(0, title, 2)}</row>`);
    r += 2;
  }
  const headerRow = r;
  lines.push(`<row r="${r}" ht="20" customHeight="1">${columns.map((c, i) => cell(i, c.label, 1)).join("")}</row>`);
  r += 1;
  rows.forEach((row) => {
    lines.push(`<row r="${r}">${row.map((v, i) => cell(i, v, columns[i]?.wrap ? 4 : 0)).join("")}</row>`);
    r += 1;
  });
  const widths = columns.map((c, i) => {
    if (c.width) return c.width;
    const longest = Math.max(String(c.label).length, ...rows.slice(0, 200).map((row) => String(row[i] ?? "").length));
    return Math.min(60, Math.max(9, longest + 2));
  });
  const lastCol = colName(Math.max(0, columns.length - 1));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${lines.join("")}</sheetData>
${rows.length ? `<autoFilter ref="A${headerRow}:${lastCol}${headerRow + rows.length}"/>` : ""}
</worksheet>`;
}

const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0##"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF0B2A6F"/><name val="Calibri"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0B2A6F"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="medium"><color rgb="FFFF9933"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function buildXlsx(sheets) {
  const enc = new TextEncoder();
  // Excel sheet names: max 31 chars, none of : \ / ? * [ ]
  const names = sheets.map((s, i) => (s.name || `Sheet${i + 1}`).replace(/[:\\/?*[\]]/g, " ").slice(0, 31));
  const files = [
    {
      name: "[Content_Types].xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/core.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Sentinel report</dc:title><dc:creator>Sentinel</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created>
</cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", text: XLSX_STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
  ];
  return zipStore(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadXlsx(name, sheets) {
  downloadBlob(buildXlsx(sheets), `${name}.xlsx`);
}

/**
 * The report sheet as a standalone HTML document: the page's own stylesheets
 * plus just the sheet. Printing that (instead of the dashboard) means the
 * sheet flows across as many A4 pages as it needs — the app's fixed-height
 * layout would otherwise clip it to one.
 */
function reportPrintHtml(el, title) {
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${xmlEsc(document.baseURI)}"><title>${xmlEsc(title)}</title>${styles}
<style>html,body{background:#fff !important;margin:0;height:auto !important;overflow:visible !important}
.snt-report{box-shadow:none !important;max-width:none !important;min-width:0 !important;margin:0 !important;padding:0 !important}</style>
</head><body>${el.outerHTML}</body></html>`;
}

function printReport(el, title) {
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(reportPrintHtml(el, title));
  doc.close();
  // Give fonts a moment, then print; the frame goes away afterwards.
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 60000);
  }, 450);
}

/* ══════════════════════════════════════════════════════════════════════════
   §10  CHARTS
   Hand-rolled SVG — no charting library.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Charts, hand-rolled in SVG.
 *
 * No charting library: the whole visual need here is four forms, and a
 * dependency would cost more in bundle size and style-override fights than the
 * ~200 lines below.
 *
 * Rules these follow, in order:
 *   - the data's job picks the form (magnitude -> bars, part-to-whole ->
 *     stacked share bar, change over time -> columns, one number -> stat tile)
 *   - magnitude is a SINGLE hue; length carries the value, colour adds nothing
 *   - status colours (good/watch/flag) are reserved for state, never a series,
 *     and always ship with a glyph + written label
 *   - thin marks, 2px gaps between adjacent fills, recessive axes
 *   - every plotted mark has a hover tooltip; a bare stat tile does not
 */

const SEQ = "#345A6C"; // one-hue sequential default, 6.5:1 on paper
const SEQ_SOFT = "#CBD8DE";
const AXIS = "rgba(18,34,46,0.14)";

/* ------------------------------------------------------------- stat tile -- */
/**
 * A single current value. Deliberately not a one-bar bar chart.
 * `hint` is where the caveat goes — how a number was derived, or that it is
 * client-side rather than served.
 */
function StatTile({ label, value, unit, hint, toneName, glyph, footer, loading }) {
  const t = toneName ? tone(toneName) : null;
  return (
    <div className="card px-4 py-3.5">
      <p className="text-2xs uppercase tracking-wider text-ink-muted">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-ink/[0.07]" />
      ) : (
        <p className={`mt-1 flex items-baseline gap-1.5 ${t ? t.text : "text-ink"}`}>
          {glyph && (
            <span className="translate-y-[-2px]">
              <StatusGlyph kind={glyph} />
            </span>
          )}
          <span className="tnum font-display text-3xl font-medium leading-none">{value}</span>
          {unit && <span className="text-sm text-ink-muted">{unit}</span>}
        </p>
      )}
      {footer && <div className="mt-2">{footer}</div>}
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------- share (stacked) -- */
/**
 * Part-to-whole across a small set of statuses. Segments are separated by a
 * 2px surface gap and every segment is direct-labelled below with its glyph,
 * colour swatch, count and name — so identity never rests on colour.
 */
function ShareBar({ segments, total, caption }) {
  const sum = total ?? segments.reduce((a, s) => a + s.value, 0);
  const safe = sum || 1;

  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-ink/[0.06]">
        {segments.map((s) => {
          if (s.value <= 0) return null;
          const t = tone(s.toneName);
          return (
            <div
              key={s.name}
              className={`${t.bg} first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(s.value / safe) * 100}%` }}
              title={`${s.name}: ${s.value}`}
            />
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => {
          const t = tone(s.toneName);
          const pct = sum ? Math.round((s.value / sum) * 100) : 0;
          return (
            <li key={s.name} className="flex items-center gap-1.5 text-xs">
              <span className={`flex ${t.text}`}>
                <StatusGlyph kind={s.glyph} />
              </span>
              <span className="tnum font-medium">{s.value}</span>
              <span className="text-ink-muted">
                {s.name} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
      {caption && <p className="mt-2.5 text-[11px] leading-snug text-ink-muted">{caption}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ ordinal bars */
/**
 * Compare magnitude across named categories. Horizontal, because category
 * names here ("attendance_spike") are long. One hue throughout: the bar's
 * length is the measure, so tinting by rank would encode nothing new.
 */
function BarList({ items, emptyLabel = "Nothing to chart yet", formatValue = (v) => v, note }) {
  const [hover, setHover] = useState(null);
  if (!items.length) return <p className="py-6 text-center text-xs text-ink-muted">{emptyLabel}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div>
      <ul className="space-y-2.5">
        {items.map((item) => {
          const pct = (item.value / max) * 100;
          const active = hover === item.name;
          return (
            <li
              key={item.name}
              onMouseEnter={() => setHover(item.name)}
              onMouseLeave={() => setHover(null)}
              className="group"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-xs text-ink/80">{item.label ?? item.name}</span>
                <span className="tnum shrink-0 text-xs font-medium">{formatValue(item.value)}</span>
              </div>
              {/* 6px track, 4px rounded data-end, anchored at the baseline */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: active ? "#1B3446" : SEQ,
                  }}
                />
              </div>
              {item.note && active && (
                <p className="mt-1 text-[11px] leading-snug text-ink-muted">{item.note}</p>
              )}
            </li>
          );
        })}
      </ul>
      {note && <p className="mt-3 text-[11px] leading-snug text-ink-muted">{note}</p>}
    </div>
  );
}

/* ---------------------------------------------------------- time columns -- */
/**
 * Change over time for a single measure. Columns rather than a line because
 * these are discrete daily counts, often zero — a line would imply values
 * between the days that don't exist.
 */
function TimeColumns({ buckets, height = 92, label = "per day", caption }) {
  const [hover, setHover] = useState(null);
  const id = useId();
  const max = Math.max(...buckets.map((b) => b.value), 1);
  const total = buckets.reduce((a, b) => a + b.value, 0);

  return (
    <div>
      <div className="relative flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {/* baseline */}
        <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: AXIS }} aria-hidden="true" />
        {buckets.map((b, i) => {
          const h = (b.value / max) * (height - 12);
          const active = hover === i;
          return (
            <div
              key={b.key}
              className="group relative flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
            >
              {/* An invisible full-height target, so hovering a zero-count day still works */}
              <div className="absolute inset-0" aria-hidden="true" />
              <div
                className="w-full rounded-t-[3px] transition-colors"
                style={{
                  height: Math.max(h, b.value > 0 ? 3 : 1),
                  backgroundColor: b.value === 0 ? SEQ_SOFT : active ? "#12222E" : SEQ,
                }}
              />
              {active && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded border border-paper-line bg-paper-raised px-2 py-1 text-[11px] shadow-float">
                  <span className="tnum font-medium">{b.value}</span> {label}
                  <span className="ml-1.5 text-ink-muted">
                    {b.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-muted">
        <span>{buckets[0]?.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
        <span className="tnum">{total} total</span>
        <span>{buckets[buckets.length - 1]?.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
      </div>
      {caption && <p className="mt-2 text-[11px] leading-snug text-ink-muted" id={id}>{caption}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- meter -- */
/**
 * A single ratio against a limit — a compliance score out of 100.
 * `compact` drops the caption row for use inside a table cell, where the
 * column header already says what the number is; the label still reaches
 * screen readers through aria-label.
 */
function Meter({ value, max = 100, toneName = "neutral", label, compact = false }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const t = tone(toneName);
  return (
    <div>
      {compact ? (
        <div className="mb-1 flex justify-end">
          <span className="tnum font-mono text-xs">
            {value}
            <span className="text-ink-muted">/{max}</span>
          </span>
        </div>
      ) : (
        <div className="flex items-baseline justify-between">
          <span className="text-2xs uppercase tracking-wider text-ink-muted">{label}</span>
          <span className="tnum font-mono text-xs">
            {value}
            <span className="text-ink-muted">/{max}</span>
          </span>
        </div>
      )}
      <div
        className={`${compact ? "mt-0" : "mt-1.5"} h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]`}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${t.bg} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sparkline - */
/** Context beside a stat tile, never a chart in its own right. */
function Sparkline({ values, width = 68, height = 20 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - (v / max) * (height - 2) - 1}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <polyline points={points} fill="none" stroke={SEQ} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -------------------------------------------------------- table fallback -- */
/**
 * The table view every chart above can fall back to. Required relief: two of
 * the status colours sit under 3:1 on paper, so the numbers must also be
 * readable as text somewhere.
 */
function DataTable({ columns, rows, caption }) {
  return (
    <div className="overflow-x-auto">
      {caption && <p className="mb-2 text-[11px] text-ink-muted">{caption}</p>}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-paper-line">
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wider text-ink-muted last:text-right"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={`px-2 py-1.5 ${j === r.length - 1 ? "tnum text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §11  AUTH
   ══════════════════════════════════════════════════════════════════════════ */

const AuthContext = createContext(null);

/** Thrown when the credentials are valid but the account belongs in Setu. */
class WrongAppError extends Error {
  constructor(role) {
    super("wrong-app");
    this.role = role;
  }
}

/** Thrown by login() when the account has 2-step verification turned on. */
class MfaRequired extends Error {
  constructor(mfaToken, expiresIn) {
    super("mfa-required");
    this.mfaToken = mfaToken;
    this.expiresIn = expiresIn;
  }
}

/**
 * The React face of the in-memory session (§7a). There is nothing to restore
 * on boot — a fresh page load is always signed out — so this only ever
 * starts a session from a sign-in and ends it through endSession().
 */
function AuthProvider({ children }) {
  const session = useSession();
  const user = session?.user ?? null;

  /** Completes a sign-in from a TokenResponse, turning away Setu accounts. */
  const finish = useCallback((data, email) => {
    // Sentinel is the officials' console. An institute-staff or beneficiary
    // account authenticates perfectly well and would then hit 403s across half
    // the app (/cameras is proven to refuse them), so turn them away here with
    // a reason instead — and revoke the session the server just opened.
    if (!SENTINEL_ROLES.includes(data.role)) {
      api.post(API.auth.logout(), null, { headers: { Authorization: `Bearer ${data.access_token}` } }).catch(() => {});
      throw new WrongAppError(data.role);
    }
    return startSession(data, email);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post(API.auth.login(), { email, password });
      if (data.mfa_required) throw new MfaRequired(data.mfa_token, data.expires_in);
      return finish(data, email);
    },
    [finish]
  );

  const verifyMfa = useCallback(
    async (mfaToken, code, email) => {
      const { data } = await api.post(API.auth.mfaVerify(), { mfa_token: mfaToken, code });
      return finish(data, email);
    },
    [finish]
  );

  const logout = useCallback(() => endSession("signout"), []);

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user,
      login,
      verifyMfa,
      logout,
      role,
      // Who may act, not just look. Derived from the RBAC the tests pin down:
      // assignment generation is proven admin-allowed and staff-forbidden;
      // review/renewal decisions are an official's job.
      canReviewAlerts: role === ROLES.OFFICIAL || role === ROLES.ADMIN,
      canDecideRenewals: role === ROLES.OFFICIAL || role === ROLES.ADMIN,
      canHandleGrievances: role === ROLES.OFFICIAL || role === ROLES.ADMIN,
      canDrawAssignments: role === ROLES.ADMIN || role === ROLES.OFFICIAL,
    };
  }, [user, login, verifyMfa, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/* ------------------------------------------------------ password policy -- */
/**
 * The server's password policy, mirrored so the form can show a live
 * checklist. The server still decides — a 400 carries its own sentence.
 */
const COMMON_PASSWORD_WORDS = new Set([
  "password", "passw", "qwerty", "qwertyuiop", "asdfgh", "letmein", "welcome", "admin", "administrator",
  "india", "bharat", "iloveyou", "monkey", "dragon", "sunshine", "princess", "football", "cricket",
  "changeme", "default", "secret", "login", "sentinel", "dosje", "nigrani", "government", "abc", "abcdef",
]);

function isCommonPassword(pw) {
  const lower = pw.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, "");
  if (COMMON_PASSWORD_WORDS.has(letters)) return true; // "Welcome@2026", "Password123!"
  if (/^(.)\1+$/.test(lower)) return true; // "aaaaaaaaaaaa"
  return "01234567890123456789".includes(lower) || "abcdefghijklmnopqrstuvwxyz".includes(lower);
}

function passwordPolicy(pw, { name = "", email = "", current = "" } = {}) {
  const lower = pw.toLowerCase();
  const nameParts = String(name).toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 3);
  const local = String(email || "").split("@")[0].toLowerCase();
  const typed = pw.length > 0;
  return [
    { key: "length", label: "At least 12 characters", ok: pw.length >= 12 },
    { key: "upper", label: "An uppercase letter", ok: /[A-Z]/.test(pw) },
    { key: "lower", label: "A lowercase letter", ok: /[a-z]/.test(pw) },
    { key: "digit", label: "A number", ok: /\d/.test(pw) },
    { key: "symbol", label: "A symbol", ok: /[^A-Za-z0-9\s]/.test(pw) },
    {
      key: "personal",
      label: "Doesn't contain your name or email",
      ok: typed && !nameParts.some((part) => lower.includes(part)) && !(local.length >= 3 && lower.includes(local)),
    },
    { key: "common", label: "Not a common password", ok: typed && !isCommonPassword(pw) },
    { key: "different", label: "Different from your current password", ok: typed && pw !== current },
  ];
}

/** 0–4 for the strength meter: the rules met, with a nudge for extra length. */
function passwordStrength(rules, pw) {
  if (!pw) return 0;
  const met = rules.filter((r) => r.ok).length;
  if (met < rules.length) return met >= 6 ? 2 : 1;
  return pw.length >= 16 ? 4 : 3;
}

/* ------------------------------------------------------ session guard ---- */
/** "2:00" */
const clockMinutes = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Mounted once inside the signed-in shell: keeps the token fresh and runs the
 * idle timer, showing the two-minute warning before an idle sign-out.
 */
function SessionGuard() {
  useTokenRefresh();
  const { secondsLeft, stay } = useIdleTimer();
  if (secondsLeft === null) return null;
  return <IdleWarning secondsLeft={secondsLeft} onStay={stay} onSignOut={() => endSession("signout")} />;
}

function IdleWarning({ secondsLeft, onStay, onSignOut }) {
  const { t, alt } = useT();
  const titleId = useId();
  const total = (IDLE_SIGN_OUT_MS - IDLE_WARNING_MS) / 1000;
  const time = clockMinutes(secondsLeft);
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[3px]" aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => e.key === "Escape" && onStay()}
        className="card relative w-full max-w-md animate-fade-up overflow-hidden shadow-float"
      >
        <div className="snt-tricolour" style={{ height: 3 }} />
        <div className="flex items-start gap-5 px-6 pb-5 pt-6">
          <div className="relative grid h-[84px] w-[84px] shrink-0 place-items-center" aria-hidden="true">
            <svg width="84" height="84" viewBox="0 0 84 84" className="absolute inset-0 -rotate-90">
              <circle cx="42" cy="42" r={R} fill="none" stroke="currentColor" strokeWidth="6" className="text-ink/[0.07]" />
              <circle
                cx="42"
                cy="42"
                r={R}
                fill="none"
                stroke={INDIA.saffron}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - Math.max(0, Math.min(1, secondsLeft / total)))}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <span className="snt-navy font-display text-xl tnum">{time}</span>
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg leading-snug">
              <Bi en="Still there?" altClassName="text-sm text-ink-muted" />
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/80">
              {t("For your security you'll be signed out in {time}", { time })}
            </p>
            {alt("For your security you'll be signed out in {time}", { time }) && (
              <p className="snt-script-hi mt-0.5 text-xs leading-relaxed text-ink-muted" lang="hi">
                {alt("For your security you'll be signed out in {time}", { time })}
              </p>
            )}
            <p className="sr-only" aria-live="assertive">
              {secondsLeft % 30 === 0 || secondsLeft <= 10 ? t("For your security you'll be signed out in {time}", { time }) : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-paper-line bg-paper-dim/40 px-6 py-3.5">
          <Button variant="ghost" onClick={onSignOut}>
            <Bi en="Sign out now" inline altClassName="text-xs opacity-80" />
          </Button>
          <Button autoFocus variant="primary" onClick={onStay}>
            <Bi en="Stay signed in" inline altClassName="text-xs opacity-80" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §12  TOASTS
   ══════════════════════════════════════════════════════════════════════════ */

const ToastContext = createContext(null);

let nextId = 0;

/**
 * Confirmation for actions that change server state. Escalating an alert used
 * to just silently refetch, which left the official unsure whether the click
 * registered.
 */
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, { toneName = "neutral", glyph, timeout = 4000 } = {}) => {
      const id = (nextId += 1);
      setToasts((t) => [...t, { id, message, toneName, glyph }]);
      if (timeout) setTimeout(() => dismiss(id), timeout);
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (m) => push(m, { toneName: "good", glyph: "check" }),
      warn: (m) => push(m, { toneName: "watch", glyph: "watch" }),
      error: (m) => push(m, { toneName: "flag", glyph: "flag", timeout: 6000 }),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-5 left-1/2 z-[3000] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const c = tone(t.toneName);
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex animate-fade-up items-center gap-2.5 rounded-lg border border-paper-line bg-paper-raised px-3.5 py-2.5 text-sm shadow-float"
            >
              {t.glyph && (
                <span className={c.text}>
                  <StatusGlyph kind={t.glyph} />
                </span>
              )}
              <span className="flex-1">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="rounded p-0.5 text-ink/30 hover:text-ink"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.8" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/* ══════════════════════════════════════════════════════════════════════════
   §13  NAVIGATION
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The navigation now runs across the top, the way Indian government portals
 * lay out: a thin Government-of-India strip, the tricolour, the masthead with
 * the tabs on the right, then a running news ticker fed by live data.
 *
 * Tabs are grouped the way an official's attention moves: what needs me now
 * (Watch / निगरानी), what I'm deciding on (Act / कार्रवाई), and the
 * portfolio-wide read (Assess / आकलन). Every tab carries a Hindi label too.
 */
const NAV_GROUPS = [
  {
    label: "Watch",
    hi: "निगरानी",
    items: [
      { to: "/", label: "Overview", hi: "अवलोकन", icon: OverviewIcon, end: true },
      { to: "/map", label: "Map", hi: "मानचित्र", icon: MapIcon },
      { to: "/alerts", label: "Alerts", hi: "चेतावनी", icon: AlertIcon },
      { to: "/cameras", label: "Cameras", hi: "कैमरा", icon: CameraIcon },
    ],
  },
  {
    label: "Act",
    hi: "कार्रवाई",
    items: [
      { to: "/assignments", label: "Draw", hi: "आवंटन", icon: DrawIcon, roles: [ROLES.ADMIN, ROLES.OFFICIAL] },
      { to: "/grievances", label: "Grievances", hi: "शिकायतें", icon: GrievanceIcon, roles: [ROLES.ADMIN, ROLES.OFFICIAL] },
      { to: "/renewals", label: "Renewals", hi: "नवीनीकरण", icon: RenewalIcon, roles: [ROLES.ADMIN, ROLES.OFFICIAL] },
      { to: "/inspectors", label: "Inspectors", hi: "निरीक्षक", icon: InspectorIcon, roles: [ROLES.ADMIN, ROLES.OFFICIAL], badge: "inspectors" },
    ],
  },
  {
    // Five pages under one drop-down tab, so the bar stays one clean row.
    label: "Assess",
    hi: "आकलन",
    menu: true,
    icon: AssessIcon,
    items: [
      { to: "/institutes", label: "Register", hi: "पंजिका", icon: RegisterIcon, desc: "Every institute, filter and sort" },
      { to: "/districts", label: "Districts", hi: "ज़िले", icon: DistrictIcon, desc: "Heatmap and ranking" },
      { to: "/analytics", label: "Analytics", hi: "विश्लेषण", icon: AnalyticsIcon, desc: "Portfolio charts" },
      { to: "/reports", label: "Reports", hi: "रिपोर्ट", icon: ReportIcon, desc: "PDF and Excel" },
      { to: "/audit", label: "Audit trail", hi: "ऑडिट", icon: AuditIcon, desc: "Who did what, when", roles: [ROLES.ADMIN, ROLES.OFFICIAL] },
    ],
  },
];

/** The groups, with only the items this role may actually reach. */
function visibleGroups(role) {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter(
    (g) => g.items.length
  );
}

/* ---------------------------------------------------------------- theme --- */
/**
 * The visual layer: tricolour, glass hover, ticker, masthead. It lives here as
 * one CSS string (rather than in index.css) so this file stays the only one
 * you edit. Everything is prefixed `snt-` so nothing collides with Tailwind.
 *
 * The glass hover on buttons uses `:where()` so its specificity is zero — any
 * Tailwind class on a button still wins, and the effect only ADDS a sheen,
 * blur and shadow on top of the button's own colour. Dark buttons stay dark.
 */
const INDIA = {
  saffron: "#FF9933",
  green: "#138808",
  navy: "#0B2A6F",
  navyDeep: "#081C4A",
};

const THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');

.snt-hi { font-family: 'Noto Sans Devanagari', system-ui, sans-serif; }

/* ── tricolour ─────────────────────────────────────────────────────────── */
.snt-tricolour {
  height: 4px; flex: none;
  background: linear-gradient(90deg, ${INDIA.saffron} 0 33.33%, #ffffff 33.33% 66.66%, ${INDIA.green} 66.66% 100%);
  box-shadow: 0 1px 0 rgba(11,42,111,.08);
}
.snt-tricolour-mini { display: inline-flex; height: 3px; width: 34px; border-radius: 3px; overflow: hidden; }
.snt-tricolour-mini > i { flex: 1; }
.snt-tricolour-mini > i:nth-child(1) { background: ${INDIA.saffron}; }
.snt-tricolour-mini > i:nth-child(2) { background: ${INDIA.navy}; flex: .45; }
.snt-tricolour-mini > i:nth-child(3) { background: ${INDIA.green}; }

/* ── glass hover, for every button in the app ──────────────────────────── */
:where(.snt-app) :where(button, .snt-glass) {
  transition: box-shadow .28s ease, translate .2s ease, backdrop-filter .28s ease, border-color .28s ease,
              background-color .2s ease, color .2s ease;
}
:where(.snt-app) :where(button:not(:disabled), .snt-glass):hover {
  background-image:
    linear-gradient(115deg, transparent 25%, rgba(255,255,255,.6) 45%, transparent 62%),
    linear-gradient(180deg, rgba(255,255,255,.46) 0%, rgba(255,255,255,.16) 48%, rgba(255,255,255,.04) 52%, rgba(255,255,255,.14) 100%);
  background-size: 260% 100%, 100% 100%;
  background-repeat: no-repeat;
  animation: snt-sweep .85s ease-out 1;
  -webkit-backdrop-filter: blur(10px) saturate(170%);
  backdrop-filter: blur(10px) saturate(170%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.8),
    inset 0 0 0 1px rgba(255,255,255,.45),
    0 0 0 3px rgba(255,153,51,.14),
    0 12px 28px -12px rgba(11,42,111,.5);
  translate: 0 -1px;
}
:where(.snt-app) :where(button:not(:disabled), .snt-glass):active { translate: 0 0; }
@keyframes snt-sweep {
  from { background-position: 140% 0, 0 0; }
  to   { background-position: -140% 0, 0 0; }
}

/* cards: a quiet lift and the tricolour hairline on hover */
.snt-app .card { transition: box-shadow .3s ease, border-color .3s ease; }
.snt-app .card:hover {
  box-shadow: 0 16px 34px -22px rgba(11,42,111,.42);
  border-color: rgba(255,153,51,.38);
  background-image: linear-gradient(90deg, ${INDIA.saffron}, ${INDIA.navy} 50%, ${INDIA.green});
  background-size: 100% 2px;
  background-repeat: no-repeat;
  background-position: top;
}

/* ── government strip ──────────────────────────────────────────────────── */
.snt-govstrip {
  background: ${INDIA.navyDeep};
  color: rgba(255,255,255,.72);
  font-size: 11px; line-height: 1;
}
.snt-govstrip a, .snt-govstrip button { color: rgba(255,255,255,.72); }
.snt-govstrip a:hover, .snt-govstrip button:hover { color: #fff; }
.snt-fontbtn {
  min-width: 24px; height: 20px; padding: 0 5px; border-radius: 5px;
  border: 1px solid rgba(255,255,255,.18); font-weight: 600;
}
.snt-fontbtn[aria-pressed="true"] { background: rgba(255,153,51,.9); color: ${INDIA.navyDeep} !important; border-color: transparent; }

/* ── masthead ──────────────────────────────────────────────────────────── */
.snt-masthead {
  position: relative; z-index: 1100;
  border-bottom: 1px solid rgba(11,42,111,.09);
  box-shadow: 0 8px 26px -20px rgba(11,42,111,.55);
}
/* The frosted layer sits on a pseudo-element: a backdrop-filter on the header
   itself would stop the drop-down menus inside it from blurring what's below. */
.snt-masthead::before {
  content: ""; position: absolute; inset: 0; z-index: -1;
  background: rgba(255,255,255,.82);
  -webkit-backdrop-filter: blur(16px) saturate(1.5);
  backdrop-filter: blur(16px) saturate(1.5);
}
.snt-emblem {
  display: grid; place-items: center; width: 42px; height: 42px; border-radius: 9999px; flex: none;
  border: 2.5px solid transparent;
  background:
    radial-gradient(circle, #ffffff 0 60%, #f6f8ff 100%) padding-box,
    conic-gradient(from -90deg, ${INDIA.saffron} 0 33.3%, #e8e3d4 0 66.6%, ${INDIA.green} 0) border-box;
  box-shadow: 0 4px 14px -6px rgba(11,42,111,.45);
}
.snt-spin { animation: snt-spin 40s linear infinite; transform-origin: center; }
/* sign-in page */
.snt-login-chakra { right: -20%; bottom: -34%; width: min(54vw, 900px); aspect-ratio: 1; opacity: .055; }
.snt-login-chakra svg { width: 100%; height: 100%; }
.snt-login-feature { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(4px); }
.snt-login-card { border-radius: 16px; background: #FBFAF6; border: 1px solid #E3DED1; padding: 24px; box-shadow: 0 24px 50px -28px rgba(11,42,111,.45), 0 2px 6px -2px rgba(0,0,0,.06); }
.snt-login-field { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px; border-radius: 10px; border: 1.5px solid #E3DED1; background: #fff; color: #6a6f7d; transition: border-color .15s, box-shadow .15s; }
.snt-login-field:focus-within { border-color: #0B2A6F; box-shadow: 0 0 0 3px rgba(11,42,111,.12); color: #0B2A6F; }
.snt-login-field input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; color: #1b1f2a; }
.snt-login-field input::placeholder { color: rgba(27,31,42,.35); }
.snt-login-eye { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: #6a6f7d; }
.snt-login-eye:hover { background-color: rgba(27,31,42,.06); color: #1b1f2a; }
.snt-login-demo { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-radius: 10px; border: 1px dashed #D5CFBF; font-size: 13px; color: #262b38; }
.snt-login-submit { background-color: #0B2A6F !important; color: #fff !important; }
.snt-login-submit:hover { background-color: #0E3585 !important; }
.snt-login-chip { display: inline-flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); font-size: 12.5px; color: #F3F0E7; }
.snt-login-demo:hover { border-color: #0B2A6F; background-color: rgba(11,42,111,.03); }
.snt-login-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 30; padding: 6px; border-radius: 12px; background: #fff; border: 1px solid #E3DED1; box-shadow: 0 18px 40px -16px rgba(0,0,0,.3); }
:root[data-theme="dark"] .snt-login-card { background: #141b2d; border-color: #263049; }
:root[data-theme="dark"] .snt-login-field, :root[data-theme="dark"] .snt-login-menu { background: #0f1626; border-color: #263049; color: #9aa4bd; }
:root[data-theme="dark"] .snt-login-field input { color: #e6e9f2; }
:root[data-theme="dark"] .snt-login-demo { border-color: #33405e; color: #c8cfe0; }
@media (prefers-reduced-motion: reduce) { .snt-login-chakra .snt-spin { animation: none; } }
.snt-brand:hover .snt-spin { animation-duration: 4s; }
@keyframes snt-spin { to { transform: rotate(360deg); } }

.snt-nav { scrollbar-width: none; }
.snt-nav::-webkit-scrollbar { display: none; }
.snt-tab {
  position: relative; display: flex; align-items: center; gap: .45rem;
  padding: .5rem .62rem; border-radius: .7rem; border: 1px solid transparent;
  color: #3b4660; font-size: 13px; font-weight: 500; white-space: nowrap; line-height: 1;
}
.snt-tab svg { width: 18px; height: 18px; flex: none; }
.snt-tab:hover { color: ${INDIA.navy}; border-color: rgba(255,255,255,.7); }
.snt-tab.is-active {
  color: ${INDIA.navy}; font-weight: 600;
  background-color: rgba(255,153,51,.10);
  border-color: rgba(255,153,51,.32);
}
.snt-tab.is-active::after {
  content: ""; position: absolute; left: 18%; right: 18%; bottom: 2px; height: 2.5px; border-radius: 3px;
  background: linear-gradient(90deg, ${INDIA.saffron}, ${INDIA.navy} 50%, ${INDIA.green});
}
.snt-tab .snt-tab-hi { margin-top: 3px; font-size: 9.5px; font-weight: 500; color: #8a93a8; }
.snt-tab.is-active .snt-tab-hi { color: #b35f00; }
.snt-divider { width: 1px; height: 26px; background: linear-gradient(transparent, rgba(11,42,111,.18), transparent); flex: none; }

.snt-avatar {
  display: grid; place-items: center; width: 36px; height: 36px; border-radius: 9999px; flex: none;
  font-size: 12px; font-weight: 700; color: #fff; letter-spacing: .02em;
  background: linear-gradient(135deg, ${INDIA.navy}, #2446a8);
  box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px rgba(255,153,51,.7);
}
.snt-pop {
  position: absolute; right: 0; top: calc(100% + 10px); z-index: 1200; min-width: 250px;
  border-radius: 14px; border: 1px solid rgba(255,255,255,.7);
  background: rgba(255,255,255,.96);
  -webkit-backdrop-filter: blur(18px) saturate(1.6); backdrop-filter: blur(18px) saturate(1.6);
  box-shadow: 0 24px 50px -20px rgba(11,42,111,.5);
  animation: snt-drop .18s ease-out;
}
@keyframes snt-drop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.snt-badge-count {
  position: absolute; top: -4px; right: -5px; min-width: 17px; height: 17px; padding: 0 4px;
  display: grid; place-items: center; border-radius: 9999px;
  background: #d92d20; color: #fff; font-size: 10px; font-weight: 700; box-shadow: 0 0 0 2px #fff;
}

/* ── the running billboard ─────────────────────────────────────────────── */
.snt-ticker {
  position: relative; display: flex; align-items: stretch; height: 34px; flex: none; overflow: hidden;
  background: linear-gradient(90deg, ${INDIA.navy}, #173a8a 55%, ${INDIA.navy});
  color: #fff; font-size: 12.5px;
}
.snt-ticker-label {
  position: relative; z-index: 2; flex: none; display: flex; align-items: center; gap: .5rem;
  padding: 0 1.7rem 0 .9rem; font-weight: 700; letter-spacing: .04em; font-size: 11.5px;
  color: ${INDIA.navyDeep};
  background: linear-gradient(90deg, #ffb35c, ${INDIA.saffron});
  clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
}
.snt-live { width: 8px; height: 8px; border-radius: 9999px; background: #d92d20; position: relative; }
/* the "Updated …" stamp in page headers */
.snt-live-dot { width: 6px; height: 6px; border-radius: 9999px; background: ${INDIA.green}; box-shadow: 0 0 0 3px rgba(19,136,8,.15); flex: none; }
.snt-live::after {
  content: ""; position: absolute; inset: -4px; border-radius: 9999px; border: 2px solid #d92d20;
  animation: snt-pulse 1.6s ease-out infinite;
}
@keyframes snt-pulse { from { transform: scale(.5); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
.snt-ticker-viewport {
  position: relative; flex: 1; min-width: 0; overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent);
}
.snt-ticker-track {
  display: flex; align-items: center; height: 100%; width: max-content;
  animation: snt-marquee var(--snt-dur, 70s) linear infinite;
}
.snt-ticker:hover .snt-ticker-track, .snt-ticker:focus-within .snt-ticker-track { animation-play-state: paused; }
@keyframes snt-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.snt-ticker-item { display: inline-flex; align-items: center; gap: .55rem; padding: 0 1.1rem; white-space: nowrap; color: rgba(255,255,255,.9); }
a.snt-ticker-item:hover { color: #ffd29e; text-decoration: underline; text-underline-offset: 3px; }
.snt-ticker-tag {
  font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
  padding: 3px 6px; border-radius: 4px; line-height: 1;
}
.snt-tag-red { background: #d92d20; color: #fff; }
.snt-tag-amber { background: ${INDIA.saffron}; color: ${INDIA.navyDeep}; }
.snt-tag-green { background: ${INDIA.green}; color: #fff; }
.snt-tag-info { background: rgba(255,255,255,.16); color: #fff; }
.snt-ticker-sep { opacity: .55; display: inline-flex; }
.snt-ticker-pause {
  position: relative; z-index: 2; flex: none; display: grid; place-items: center; width: 34px;
  color: rgba(255,255,255,.75); border-left: 1px solid rgba(255,255,255,.12);
}

/* ── data toolbar ──────────────────────────────────────────────────────── */
.snt-toolbar {
  padding: 12px 14px; border-radius: 14px;
  background: rgba(255,255,255,.62);
  border: 1px solid rgba(11,42,111,.09);
  box-shadow: 0 10px 30px -26px rgba(11,42,111,.6);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
}
.snt-pill {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 11px;
  border-radius: 9999px; border: 1px solid rgba(11,42,111,.15); background: rgba(255,255,255,.85);
  font-size: 12px; font-weight: 500; color: #3b4660; white-space: nowrap;
}
.snt-pill:hover { color: ${INDIA.navy}; border-color: rgba(11,42,111,.3); }
.snt-pill.is-active { border-color: rgba(255,153,51,.6); background-color: rgba(255,153,51,.11); color: ${INDIA.navy}; font-weight: 600; }
.snt-pill:disabled { opacity: .45; cursor: not-allowed; }
.snt-pill-count {
  display: inline-grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9999px;
  background: ${INDIA.navy}; color: #fff; font-size: 10px; font-weight: 700;
}
.snt-search {
  display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 4px 0 11px; min-width: min(100%, 330px); flex: 1 1 280px; max-width: 460px;
  border-radius: 10px; border: 1px solid rgba(11,42,111,.15); background: #fff;
  transition: border-color .2s, box-shadow .2s;
}
.snt-search:focus-within { border-color: rgba(11,42,111,.45); box-shadow: 0 0 0 3px rgba(255,153,51,.18); }
.snt-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 12.5px; }
.snt-search select {
  border: 0; border-left: 1px solid rgba(11,42,111,.12); background: transparent; padding: 0 6px 0 8px;
  font-size: 11.5px; color: #6b7590; outline: 0; height: 24px;
}
.snt-chip {
  display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 4px 0 10px; border-radius: 9999px;
  background: rgba(11,42,111,.07); color: ${INDIA.navy}; font-size: 11.5px; font-weight: 500;
  animation: snt-drop .18s ease-out;
}
.snt-chip button { width: 18px; height: 18px; border-radius: 9999px; display: grid; place-items: center; font-size: 13px; line-height: 1; color: #6b7590; }
.snt-chip button:hover { background: rgba(180,35,24,.12); color: #b42318; }
.snt-chip-btn { padding: 4px 9px; border-radius: 9999px; border: 1px solid rgba(11,42,111,.15); font-size: 11px; background: #fff; }
.snt-chip-btn.is-on { background: ${INDIA.navy}; color: #fff; border-color: ${INDIA.navy}; }
.snt-quick { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: 11px; background: rgba(11,42,111,.06); }
.snt-quick button { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; color: #3b4660; }
.snt-quick button span { margin-left: 4px; font-size: 11px; color: #8a93a8; }
.snt-quick button.is-on { background: #fff; color: ${INDIA.navy}; font-weight: 600; box-shadow: 0 2px 8px -3px rgba(11,42,111,.35); }
.snt-quick button.is-on span { color: #c26a00; }
.snt-group-head {
  display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 6px; border-radius: 8px;
  font-size: 12.5px; font-weight: 600; color: ${INDIA.navy};
}
.snt-th-sort { display: inline-flex; align-items: center; gap: 5px; text-transform: inherit; letter-spacing: inherit; font-weight: inherit; border-radius: 6px; padding: 2px 4px; margin: -2px -4px; }
.snt-th-sort:hover, .snt-th-sort.is-on { color: ${INDIA.navy}; }
.snt-th-arrow { font-size: 9px; opacity: .5; }
.snt-th-sort.is-on .snt-th-arrow { opacity: 1; color: #c26a00; }
.snt-th-level { font-size: 9px; background: ${INDIA.navy}; color: #fff; border-radius: 9999px; width: 14px; height: 14px; display: inline-grid; place-items: center; }


/* ── Yukt, the assistant ───────────────────────────────────────────────── */
.snt-yukt-orb { position: relative; display: inline-grid; place-items: center; flex: none; border-radius: 9999px; }
.snt-yukt-orb-ring {
  position: absolute; inset: 0; border-radius: 9999px;
  background: conic-gradient(from 0deg, ${INDIA.saffron}, #ffffff, ${INDIA.green}, ${INDIA.navy}, ${INDIA.saffron});
  animation: snt-spin 6s linear infinite;
}
.snt-yukt-orb-core {
  position: absolute; inset: 2.5px; border-radius: 9999px; display: grid; place-items: center;
  background: radial-gradient(circle at 35% 30%, #ffffff, #eef2ff 70%);
  box-shadow: inset 0 -3px 8px rgba(11,42,111,.12);
}
.snt-yukt-fab {
  position: fixed; right: 20px; bottom: 46px; z-index: 1500;
  display: flex; align-items: center; gap: 0; padding: 5px; border-radius: 9999px;
  background: linear-gradient(135deg, ${INDIA.navy}, #1d3f94);
  color: #fff; box-shadow: 0 14px 34px -10px rgba(11,42,111,.6), 0 0 0 1px rgba(255,255,255,.18) inset;
  animation: snt-bob 3.2s ease-in-out infinite;
  transition: gap .3s ease, padding .3s ease, box-shadow .3s ease;
}
.snt-yukt-fab-label { max-width: 0; overflow: hidden; white-space: nowrap; text-align: left; opacity: 0; transition: max-width .35s ease, opacity .25s ease; }
.snt-yukt-fab:hover, .snt-yukt-fab:focus-visible { gap: 10px; padding-right: 18px; animation-play-state: paused; }
.snt-yukt-fab:hover .snt-yukt-fab-label, .snt-yukt-fab:focus-visible .snt-yukt-fab-label { max-width: 140px; opacity: 1; }
.snt-app .snt-yukt-fab:hover {
  background-image: linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.04) 60%), linear-gradient(135deg, ${INDIA.navy}, #1d3f94);
  box-shadow: 0 18px 40px -10px rgba(11,42,111,.7), 0 0 0 4px rgba(255,153,51,.25), inset 0 1px 0 rgba(255,255,255,.4);
}
.snt-yukt-fab:hover .snt-yukt-orb-ring { animation-duration: 1.6s; }
.snt-yukt-fab.is-open { animation: none; }
.snt-yukt-pulse { position: absolute; left: 5px; top: 5px; width: 48px; height: 48px; border-radius: 9999px; pointer-events: none; }
.snt-yukt-pulse::before, .snt-yukt-pulse::after {
  content: ""; position: absolute; inset: 0; border-radius: 9999px; border: 2px solid rgba(255,153,51,.7);
  animation: snt-ring 2.6s ease-out infinite;
}
.snt-yukt-pulse::after { animation-delay: 1.3s; border-color: rgba(19,136,8,.6); }
.snt-yukt-fab.is-open .snt-yukt-pulse { display: none; }
@keyframes snt-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes snt-ring { from { transform: scale(1); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }

.snt-yukt-teaser {
  position: fixed; right: 84px; bottom: 58px; z-index: 1500; max-width: 250px;
  padding: 10px 14px; border-radius: 14px 14px 4px 14px; font-size: 12.5px; color: ${INDIA.navy}; text-align: left;
  background: rgba(255,255,255,.95); border: 1px solid rgba(255,153,51,.4);
  box-shadow: 0 16px 34px -14px rgba(11,42,111,.5); animation: snt-pop-in .35s cubic-bezier(.2,1.4,.4,1);
}
@keyframes snt-pop-in { from { opacity: 0; transform: translateY(8px) scale(.9); } to { opacity: 1; transform: none; } }

.snt-yukt-panel {
  position: fixed; right: 20px; bottom: 112px; z-index: 1500;
  width: min(390px, calc(100vw - 24px)); height: min(600px, calc(100vh - 150px));
  display: flex; flex-direction: column; overflow: hidden; border-radius: 20px;
  background: rgba(248,249,253,.9);
  -webkit-backdrop-filter: blur(20px) saturate(1.6); backdrop-filter: blur(20px) saturate(1.6);
  border: 1px solid rgba(255,255,255,.7);
  box-shadow: 0 30px 70px -24px rgba(11,42,111,.6);
  animation: snt-panel-in .3s cubic-bezier(.2,1.2,.4,1); transform-origin: bottom right;
}
@keyframes snt-panel-in { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
.snt-yukt-head {
  display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px;
  background: linear-gradient(135deg, ${INDIA.navyDeep}, ${INDIA.navy} 60%, #1d3f94);
}
.snt-yukt-iconbtn { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: rgba(255,255,255,.75); flex: none; }
.snt-yukt-iconbtn:hover { color: #fff; }
.snt-yukt-iconbtn.is-dark { color: #6b7590; }
.snt-yukt-iconbtn.is-dark:hover { color: ${INDIA.navy}; }
.snt-yukt-iconbtn.is-live { color: #d92d20; animation: snt-blink 1s ease-in-out infinite; }
@keyframes snt-blink { 50% { opacity: .35; } }
.snt-yukt-list { flex: 1; overflow-y: auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.snt-yukt-msg { display: flex; gap: 8px; align-items: flex-start; animation: snt-drop .22s ease-out; }
.snt-yukt-msg.is-user { justify-content: flex-end; }
.snt-yukt-bubble { padding: 9px 12px; border-radius: 14px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
.is-bot .snt-yukt-bubble { background: #fff; color: #1f2a44; border: 1px solid rgba(11,42,111,.08); border-top-left-radius: 4px; box-shadow: 0 4px 14px -10px rgba(11,42,111,.4); }
.is-user .snt-yukt-bubble { background: linear-gradient(135deg, ${INDIA.navy}, #2446a8); color: #fff; border-top-right-radius: 4px; }
.snt-yukt-card {
  display: flex; gap: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.8);
  border: 1px solid rgba(11,42,111,.08); transition: border-color .2s, transform .2s;
}
.snt-yukt-card:hover { border-color: rgba(255,153,51,.55); transform: translateX(2px); }
.snt-yukt-action {
  display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 9999px; font-size: 11.5px; font-weight: 600;
  color: ${INDIA.navy}; background: rgba(255,153,51,.12); border: 1px solid rgba(255,153,51,.4);
}
.snt-yukt-suggest {
  padding: 5px 10px; border-radius: 9999px; font-size: 11.5px; color: ${INDIA.navy};
  background: #fff; border: 1px solid rgba(11,42,111,.15);
}
.snt-yukt-suggest:hover { border-color: ${INDIA.navy}; }
.snt-yukt-typing { display: inline-flex; gap: 4px; padding: 12px 14px; }
.snt-yukt-typing i { width: 6px; height: 6px; border-radius: 9999px; background: #9aa4bd; animation: snt-dot 1.1s ease-in-out infinite; }
.snt-yukt-typing i:nth-child(2) { animation-delay: .15s; }
.snt-yukt-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes snt-dot { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }
.snt-yukt-input { display: flex; align-items: center; gap: 4px; margin: 0 10px; padding: 5px 5px 5px 12px; border-radius: 14px; background: #fff; border: 1px solid rgba(11,42,111,.14); }
.snt-yukt-input:focus-within { border-color: rgba(11,42,111,.4); box-shadow: 0 0 0 3px rgba(255,153,51,.18); }
.snt-yukt-input input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13px; }
.snt-yukt-send { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: #fff; background: linear-gradient(135deg, ${INDIA.saffron}, #e67e00); flex: none; }
.snt-yukt-send:disabled { background: #cfd5e3; }
.snt-yukt-foot { padding: 6px 12px 10px; font-size: 10px; color: #8a93a8; text-align: center; }
@media (max-width: 640px) {
  .snt-yukt-fab { right: 12px; bottom: 40px; }
  .snt-yukt-panel { right: 8px; left: 8px; width: auto; bottom: 104px; height: calc(100vh - 170px); }
  .snt-yukt-teaser { right: 72px; bottom: 50px; }
}
@media (prefers-reduced-motion: reduce) {
  .snt-yukt-fab, .snt-yukt-orb-ring, .snt-yukt-pulse::before, .snt-yukt-pulse::after { animation: none !important; }
}

.snt-pill.snt-clear-all:not(:disabled) { color: #b42318; border-color: rgba(180,35,24,.35); }
.snt-pill.snt-clear-all:not(:disabled) .snt-pill-count { background: #b42318; }
:root[data-theme="dark"] .snt-pill.snt-clear-all:not(:disabled) { color: #ff8a7e; border-color: rgba(255,138,126,.4); }

/* Yukt: autocomplete */
.snt-yukt-ac {
  position: absolute; left: 10px; right: 10px; bottom: calc(100% + 6px); z-index: 5; max-height: 19rem; overflow-y: auto;
  border-radius: 14px; background: rgba(255,255,255,.98); border: 1px solid rgba(11,42,111,.12);
  box-shadow: 0 -12px 34px -16px rgba(11,42,111,.45); animation: snt-drop .14s ease-out;
}
.snt-yukt-ac-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 12px; text-align: left; color: #1f2a44; }
.snt-yukt-ac-item.is-on, .snt-yukt-ac-item:hover { background: rgba(255,153,51,.1); }
:root[data-theme="dark"] .snt-yukt-ac { background: rgba(20,27,45,.98); border-color: rgba(255,255,255,.1); }
:root[data-theme="dark"] .snt-yukt-ac-item { color: #e6e9f2; }
:root[data-theme="contrast"] .snt-yukt-ac { background: #000; border: 2px solid #fff; }
:root[data-theme="contrast"] .snt-yukt-ac-item { color: #fff; }
:root[data-theme="contrast"] .snt-yukt-ac-item.is-on { background: #ffd400; color: #000; }

/* Yukt: language picker, action confirmation */
.snt-yukt-lang {
  max-width: 7.5rem; height: 28px; border-radius: 8px; padding: 0 6px; font-size: 11px;
  color: #fff; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2); outline: 0;
}
.snt-yukt-lang option { color: #111827; background: #fff; }
.snt-yukt-confirm {
  padding: 9px 11px; border-radius: 11px; background: #fff;
  border: 1px solid rgba(255,153,51,.5); box-shadow: 0 6px 16px -12px rgba(11,42,111,.5);
}
.snt-yukt-ok {
  padding: 5px 11px; border-radius: 9999px; font-size: 11.5px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, ${INDIA.saffron}, #e67e00);
}
.snt-yukt-ok:disabled { opacity: .6; }
.snt-navy { color: ${INDIA.navy}; }
.snt-saffron-text { color: #c26a00; }

/* Nav group drop-down */
.snt-menu-item { display: flex; align-items: center; gap: .6rem; padding: .55rem .6rem; border-radius: .6rem; color: #3b4660; font-size: 13px; }
.snt-menu-item svg { width: 18px; height: 18px; flex: none; }
.snt-menu-item:hover { background: rgba(11,42,111,.05); color: ${INDIA.navy}; }
.snt-menu-item.is-active { background: rgba(255,153,51,.12); color: ${INDIA.navy}; font-weight: 600; }
:root[data-theme="dark"] .snt-menu-item { color: #c8cfe0; }
:root[data-theme="dark"] .snt-menu-item:hover { background: rgba(255,255,255,.06); color: #fff; }
:root[data-theme="dark"] .snt-menu-item.is-active { color: #ffcf99; }
:root[data-theme="contrast"] .snt-menu-item { color: #fff; }
:root[data-theme="contrast"] .snt-menu-item.is-active { background: #ffd400; color: #000; }

/* ── canvas behind the pages, so the glass has something to refract ───── */
.snt-canvas {
  background:
    radial-gradient(900px 420px at -5% -10%, rgba(255,153,51,.09), transparent 60%),
    radial-gradient(900px 480px at 105% 110%, rgba(19,136,8,.08), transparent 60%),
    radial-gradient(700px 380px at 60% -20%, rgba(11,42,111,.05), transparent 65%);
}
.snt-watermark { position: absolute; right: -90px; bottom: -110px; opacity: .045; pointer-events: none; }

.snt-footer {
  flex: none; font-size: 10.5px; color: rgba(255,255,255,.6);
  background: ${INDIA.navyDeep};
}

@media (prefers-reduced-motion: reduce) {
  .snt-ticker-track, .snt-spin, .snt-live::after { animation: none !important; }
  .snt-ticker-viewport { overflow-x: auto; }
  :where(.snt-app) :where(button, .snt-glass):hover { animation: none; translate: none; }
}
`;

const DRAWER_CSS = `
.snt-drawer {
  background: rgba(248,249,253,.97); border-left: 1px solid rgba(11,42,111,.1);
  box-shadow: -24px 0 60px -30px rgba(11,42,111,.55);
  -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
}
.snt-drawer .snt-yukt-list { background: transparent; }
:root[data-theme="dark"] .snt-drawer { background: rgba(16,22,37,.97); border-left-color: rgba(255,255,255,.08); --snt-ring: #101625; }
:root[data-theme="contrast"] .snt-drawer { background: #000; border-left: 2px solid #fff; backdrop-filter: none; }
`;

function SentinelTheme() {
  return (
    <>
      <style>{THEME_CSS}</style>
      <style>{I18N_CSS}</style>
      <style>{DRAWER_CSS}</style>
      <style>{THEME_VARIANTS_CSS}</style>
    </>
  );
}

/* ------------------------------------------------ light / dark / contrast -- */
/**
 * Three display modes. Light is the default; Dark is for long evening shifts;
 * High contrast is the GIGW 3.0 / WCAG option (black, white and yellow, no
 * translucency). The choice is remembered on this browser.
 *
 * How it works: the palette lives in tailwind.config.js, so rather than
 * touching that file, the overrides below re-point the colour utilities this
 * file actually uses (bg-paper, text-ink, border-paper-line, …) when
 * <html data-theme="dark|contrast"> is set. The per-class rules were generated
 * from the classes in use — if you add a new colour class to a page and it
 * looks wrong in dark mode, add one line for it here.
 */
const THEME_MODES = [
  { key: "light", label: "Light", hi: "हल्का" },
  { key: "dark", label: "Dark", hi: "गहरा" },
  { key: "contrast", label: "High contrast", hi: "उच्च कंट्रास्ट" },
];
const THEME_KEY = "sentinel.theme";

function readThemeMode() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return THEME_MODES.some((m) => m.key === t) ? t : "light";
  } catch {
    return "light";
  }
}

function applyThemeMode(mode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "light") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  root.style.colorScheme = mode === "light" ? "light" : "dark";
}

// Applied at load, before the first paint, so there's no flash of light mode.
applyThemeMode(readThemeMode());

function setThemeMode(mode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* private window — the choice lasts for this tab only */
  }
  applyThemeMode(mode);
  window.dispatchEvent(new CustomEvent("sentinel:theme", { detail: mode }));
}

function useThemeMode() {
  const [mode, setMode] = useState(readThemeMode);
  useEffect(() => {
    const on = (e) => setMode(e.detail);
    window.addEventListener("sentinel:theme", on);
    return () => window.removeEventListener("sentinel:theme", on);
  }, []);
  return [mode, setThemeMode];
}

const THEME_VARIANTS_CSS = String.raw`
/* ═══ generated: colour utilities re-pointed per mode ═══ */
:root[data-theme="dark"] .bg-\[\#0B2A6F\]\/10{background-color:rgba(168,192,255,0.1)}
:root[data-theme="dark"] .bg-\[\#0B2A6F\]\/\[0\.08\]{background-color:rgba(168,192,255,0.08)}
:root[data-theme="dark"] .bg-ink{background-color:#2f54c9}
:root[data-theme="dark"] .bg-ink-muted{background-color:#9aa4bd}
:root[data-theme="dark"] .bg-ink\/40{background-color:rgba(230,233,242,0.4)}
:root[data-theme="dark"] .bg-ink\/5{background-color:rgba(230,233,242,0.05)}
:root[data-theme="dark"] .bg-ink\/\[0\.03\]{background-color:rgba(230,233,242,0.03)}
:root[data-theme="dark"] .bg-ink\/\[0\.05\]{background-color:rgba(230,233,242,0.05)}
:root[data-theme="dark"] .bg-ink\/\[0\.06\]{background-color:rgba(230,233,242,0.06)}
:root[data-theme="dark"] .bg-ink\/\[0\.07\]{background-color:rgba(230,233,242,0.07)}
:root[data-theme="dark"] .bg-paper{background-color:#0c1220}
:root[data-theme="dark"] .bg-paper-dim{background-color:#1a2236}
:root[data-theme="dark"] .bg-paper-dim\/40{background-color:rgba(26,34,54,0.4)}
:root[data-theme="dark"] .bg-paper-dim\/50{background-color:rgba(26,34,54,0.5)}
:root[data-theme="dark"] .bg-paper-raised{background-color:#141b2d}
:root[data-theme="dark"] .bg-paper-raised\/95{background-color:rgba(20,27,45,0.95)}
:root[data-theme="dark"] .bg-paper\/30{background-color:rgba(12,18,32,0.3)}
:root[data-theme="dark"] .bg-paper\/70{background-color:rgba(12,18,32,0.7)}
:root[data-theme="dark"] .bg-signal-flag-soft{background-color:#3a1512}
:root[data-theme="dark"] .bg-signal-good-soft{background-color:#12301f}
:root[data-theme="dark"] .bg-signal-good-soft\/40{background-color:rgba(18,48,31,0.4)}
:root[data-theme="dark"] .bg-signal-watch-soft{background-color:#33260c}
:root[data-theme="dark"] .bg-white{background-color:#141b2d}
:root[data-theme="dark"] .bg-white\/70{background-color:rgba(20,27,45,0.7)}
:root[data-theme="dark"] .bg-white\/80{background-color:rgba(20,27,45,0.8)}
:root[data-theme="dark"] .border-\[\#0B2A6F\]\/10{border-color:rgba(168,192,255,0.1)}
:root[data-theme="dark"] .border-\[\#0B2A6F\]\/12{border-color:rgba(168,192,255,0.12)}
:root[data-theme="dark"] .border-\[\#0B2A6F\]\/15{border-color:rgba(168,192,255,0.15)}
:root[data-theme="dark"] .border-ink{border-color:#e6e9f2}
:root[data-theme="dark"] .border-ink\/20{border-color:rgba(230,233,242,0.2)}
:root[data-theme="dark"] .border-l-ink\/20{border-left-color:rgba(230,233,242,0.2)}
:root[data-theme="dark"] .border-l-signal-flag{border-left-color:#ff7a6b}
:root[data-theme="dark"] .border-l-signal-good{border-left-color:#4cc47f}
:root[data-theme="dark"] .border-l-signal-watch{border-left-color:#e8a93c}
:root[data-theme="dark"] .border-paper-line{border-color:#27314a}
:root[data-theme="dark"] .border-signal-flag{border-color:#ff7a6b}
:root[data-theme="dark"] .border-signal-flag\/30{border-color:rgba(255,122,107,0.3)}
:root[data-theme="dark"] .border-signal-good{border-color:#4cc47f}
:root[data-theme="dark"] .border-signal-watch{border-color:#e8a93c}
:root[data-theme="dark"] .border-signal-watch\/30{border-color:rgba(232,169,60,0.3)}
:root[data-theme="dark"] .disabled\:bg-ink\/40:disabled{background-color:rgba(230,233,242,0.4)}
:root[data-theme="dark"] .divide-paper-line > * + *{border-color:#27314a}
:root[data-theme="dark"] .focus\:border-\[\#0B2A6F\]\/40:focus{border-color:rgba(168,192,255,0.4)}
:root[data-theme="dark"] .focus\:border-ink\/40:focus{border-color:rgba(230,233,242,0.4)}
:root[data-theme="dark"] .group:hover .group-hover\:text-ink\/60{color:rgba(230,233,242,0.6)}
:root[data-theme="dark"] .hover\:bg-\[\#0B2A6F\]\/\[0\.05\]:hover{background-color:rgba(168,192,255,0.05)}
:root[data-theme="dark"] .hover\:bg-\[\#FF9933\]\/\[0\.05\]:hover{background-color:rgba(255,153,51,0.05)}
:root[data-theme="dark"] .hover\:bg-ink-2:hover{background-color:#3d5fcc}
:root[data-theme="dark"] .hover\:bg-ink\/5:hover{background-color:rgba(230,233,242,0.05)}
:root[data-theme="dark"] .hover\:bg-ink\/\[0\.02\]:hover{background-color:rgba(230,233,242,0.02)}
:root[data-theme="dark"] .hover\:bg-ink\/\[0\.03\]:hover{background-color:rgba(230,233,242,0.03)}
:root[data-theme="dark"] .hover\:border-ink\/30:hover{border-color:rgba(230,233,242,0.3)}
:root[data-theme="dark"] .hover\:border-ink\/40:hover{border-color:rgba(230,233,242,0.4)}
:root[data-theme="dark"] .hover\:text-\[\#0B2A6F\]:hover{color:#a8c0ff}
:root[data-theme="dark"] .hover\:text-\[\#b42318\]:hover{color:#ff8a7e}
:root[data-theme="dark"] .hover\:text-ink:hover{color:#e6e9f2}
:root[data-theme="dark"] .placeholder\:text-ink\/30::placeholder{color:rgba(230,233,242,0.3)}
:root[data-theme="dark"] .placeholder\:text-ink\/35::placeholder{color:rgba(230,233,242,0.35)}
:root[data-theme="dark"] .ring-ink-3{--tw-ring-color:#4a6ad6}
:root[data-theme="dark"] .text-\[\#0B2A6F\]{color:#a8c0ff}
:root[data-theme="dark"] .text-\[\#0B2A6F\]\/60{color:rgba(168,192,255,0.6)}
:root[data-theme="dark"] .text-\[\#6b7590\]{color:#9aa4bd}
:root[data-theme="dark"] .text-\[\#8a93a8\]{color:#8a94ad}
:root[data-theme="dark"] .text-\[\#b42318\]{color:#ff8a7e}
:root[data-theme="dark"] .text-ink{color:#e6e9f2}
:root[data-theme="dark"] .text-ink-muted{color:#9aa4bd}
:root[data-theme="dark"] .text-ink\/25{color:rgba(230,233,242,0.25)}
:root[data-theme="dark"] .text-ink\/30{color:rgba(230,233,242,0.3)}
:root[data-theme="dark"] .text-ink\/35{color:rgba(230,233,242,0.35)}
:root[data-theme="dark"] .text-ink\/40{color:rgba(230,233,242,0.4)}
:root[data-theme="dark"] .text-ink\/60{color:rgba(230,233,242,0.6)}
:root[data-theme="dark"] .text-ink\/70{color:rgba(230,233,242,0.7)}
:root[data-theme="dark"] .text-ink\/75{color:rgba(230,233,242,0.75)}
:root[data-theme="dark"] .text-ink\/80{color:rgba(230,233,242,0.8)}
:root[data-theme="dark"] .text-signal-flag{color:#ff7a6b}
:root[data-theme="dark"] .text-signal-good{color:#4cc47f}
:root[data-theme="dark"] .text-signal-watch{color:#e8a93c}
:root[data-theme="contrast"] .bg-\[\#0B2A6F\]\/10{background-color:rgba(255,212,0,0.1)}
:root[data-theme="contrast"] .bg-\[\#0B2A6F\]\/\[0\.08\]{background-color:rgba(255,212,0,0.08)}
:root[data-theme="contrast"] .bg-ink{background-color:#000000}
:root[data-theme="contrast"] .bg-ink-muted{background-color:#ffffff}
:root[data-theme="contrast"] .bg-ink\/40{background-color:rgba(255,255,255,0.4)}
:root[data-theme="contrast"] .bg-ink\/5{background-color:rgba(255,255,255,0.05)}
:root[data-theme="contrast"] .bg-ink\/\[0\.03\]{background-color:rgba(255,255,255,0.03)}
:root[data-theme="contrast"] .bg-ink\/\[0\.05\]{background-color:rgba(255,255,255,0.05)}
:root[data-theme="contrast"] .bg-ink\/\[0\.06\]{background-color:rgba(255,255,255,0.06)}
:root[data-theme="contrast"] .bg-ink\/\[0\.07\]{background-color:rgba(255,255,255,0.07)}
:root[data-theme="contrast"] .bg-paper{background-color:#000000}
:root[data-theme="contrast"] .bg-paper-dim{background-color:#0a0a0a}
:root[data-theme="contrast"] .bg-paper-dim\/40{background-color:rgba(10,10,10,0.4)}
:root[data-theme="contrast"] .bg-paper-dim\/50{background-color:rgba(10,10,10,0.5)}
:root[data-theme="contrast"] .bg-paper-raised{background-color:#000000}
:root[data-theme="contrast"] .bg-paper-raised\/95{background-color:rgba(0,0,0,0.95)}
:root[data-theme="contrast"] .bg-paper\/30{background-color:rgba(0,0,0,0.3)}
:root[data-theme="contrast"] .bg-paper\/70{background-color:rgba(0,0,0,0.7)}
:root[data-theme="contrast"] .bg-signal-flag-soft{background-color:#000000}
:root[data-theme="contrast"] .bg-signal-good-soft{background-color:#000000}
:root[data-theme="contrast"] .bg-signal-good-soft\/40{background-color:rgba(0,0,0,0.4)}
:root[data-theme="contrast"] .bg-signal-watch-soft{background-color:#000000}
:root[data-theme="contrast"] .bg-white{background-color:#000000}
:root[data-theme="contrast"] .bg-white\/70{background-color:rgba(0,0,0,0.7)}
:root[data-theme="contrast"] .bg-white\/80{background-color:rgba(0,0,0,0.8)}
:root[data-theme="contrast"] .border-\[\#0B2A6F\]\/10{border-color:rgba(255,212,0,0.1)}
:root[data-theme="contrast"] .border-\[\#0B2A6F\]\/12{border-color:rgba(255,212,0,0.12)}
:root[data-theme="contrast"] .border-\[\#0B2A6F\]\/15{border-color:rgba(255,212,0,0.15)}
:root[data-theme="contrast"] .border-ink{border-color:#ffffff}
:root[data-theme="contrast"] .border-ink\/20{border-color:rgba(255,255,255,0.2)}
:root[data-theme="contrast"] .border-l-ink\/20{border-left-color:rgba(255,255,255,0.2)}
:root[data-theme="contrast"] .border-l-signal-flag{border-left-color:#ff6b6b}
:root[data-theme="contrast"] .border-l-signal-good{border-left-color:#5dff8f}
:root[data-theme="contrast"] .border-l-signal-watch{border-left-color:#ffd400}
:root[data-theme="contrast"] .border-paper-line{border-color:#ffffff}
:root[data-theme="contrast"] .border-signal-flag{border-color:#ff6b6b}
:root[data-theme="contrast"] .border-signal-flag\/30{border-color:rgba(255,107,107,0.3)}
:root[data-theme="contrast"] .border-signal-good{border-color:#5dff8f}
:root[data-theme="contrast"] .border-signal-watch{border-color:#ffd400}
:root[data-theme="contrast"] .border-signal-watch\/30{border-color:rgba(255,212,0,0.3)}
:root[data-theme="contrast"] .disabled\:bg-ink\/40:disabled{background-color:rgba(255,255,255,0.4)}
:root[data-theme="contrast"] .divide-paper-line > * + *{border-color:#ffffff}
:root[data-theme="contrast"] .focus\:border-\[\#0B2A6F\]\/40:focus{border-color:rgba(255,212,0,0.4)}
:root[data-theme="contrast"] .focus\:border-ink\/40:focus{border-color:rgba(255,255,255,0.4)}
:root[data-theme="contrast"] .group:hover .group-hover\:text-ink\/60{color:rgba(255,255,255,0.6)}
:root[data-theme="contrast"] .hover\:bg-\[\#0B2A6F\]\/\[0\.05\]:hover{background-color:rgba(255,212,0,0.05)}
:root[data-theme="contrast"] .hover\:bg-\[\#FF9933\]\/\[0\.05\]:hover{background-color:rgba(255,212,0,0.05)}
:root[data-theme="contrast"] .hover\:bg-ink-2:hover{background-color:#1a1a1a}
:root[data-theme="contrast"] .hover\:bg-ink\/5:hover{background-color:rgba(255,255,255,0.05)}
:root[data-theme="contrast"] .hover\:bg-ink\/\[0\.02\]:hover{background-color:rgba(255,255,255,0.02)}
:root[data-theme="contrast"] .hover\:bg-ink\/\[0\.03\]:hover{background-color:rgba(255,255,255,0.03)}
:root[data-theme="contrast"] .hover\:border-ink\/30:hover{border-color:rgba(255,255,255,0.3)}
:root[data-theme="contrast"] .hover\:border-ink\/40:hover{border-color:rgba(255,255,255,0.4)}
:root[data-theme="contrast"] .hover\:text-\[\#0B2A6F\]:hover{color:#ffd400}
:root[data-theme="contrast"] .hover\:text-\[\#b42318\]:hover{color:#ff6b6b}
:root[data-theme="contrast"] .hover\:text-ink:hover{color:#ffffff}
:root[data-theme="contrast"] .placeholder\:text-ink\/30::placeholder{color:rgba(255,255,255,0.3)}
:root[data-theme="contrast"] .placeholder\:text-ink\/35::placeholder{color:rgba(255,255,255,0.35)}
:root[data-theme="contrast"] .ring-ink-3{--tw-ring-color:#333333}
:root[data-theme="contrast"] .text-\[\#0B2A6F\]{color:#ffd400}
:root[data-theme="contrast"] .text-\[\#0B2A6F\]\/60{color:rgba(255,212,0,0.6)}
:root[data-theme="contrast"] .text-\[\#6b7590\]{color:#ffffff}
:root[data-theme="contrast"] .text-\[\#8a93a8\]{color:#e6e6e6}
:root[data-theme="contrast"] .text-\[\#b42318\]{color:#ff6b6b}
:root[data-theme="contrast"] .text-ink{color:#ffffff}
:root[data-theme="contrast"] .text-ink-muted{color:#ffffff}
:root[data-theme="contrast"] .text-ink\/25{color:rgba(255,255,255,0.25)}
:root[data-theme="contrast"] .text-ink\/30{color:rgba(255,255,255,0.3)}
:root[data-theme="contrast"] .text-ink\/35{color:rgba(255,255,255,0.35)}
:root[data-theme="contrast"] .text-ink\/40{color:rgba(255,255,255,0.4)}
:root[data-theme="contrast"] .text-ink\/60{color:rgba(255,255,255,0.6)}
:root[data-theme="contrast"] .text-ink\/70{color:rgba(255,255,255,0.7)}
:root[data-theme="contrast"] .text-ink\/75{color:rgba(255,255,255,0.75)}
:root[data-theme="contrast"] .text-ink\/80{color:rgba(255,255,255,0.8)}
:root[data-theme="contrast"] .text-signal-flag{color:#ff6b6b}
:root[data-theme="contrast"] .text-signal-good{color:#5dff8f}
:root[data-theme="contrast"] .text-signal-watch{color:#ffd400}

/* ═══ dark ═══ */
:root[data-theme="dark"] body { background: #0c1220; color: #e6e9f2; }
:root[data-theme="dark"] .card { background-color: #141b2d; border-color: #27314a; }
:root[data-theme="dark"] .snt-navy { color: #a8c0ff; }
:root[data-theme="dark"] .snt-saffron-text { color: #ffb35c; }
:root[data-theme="dark"] .snt-masthead { border-bottom-color: rgba(255,255,255,.07); box-shadow: 0 8px 26px -18px rgba(0,0,0,.8); }
:root[data-theme="dark"] .snt-masthead::before { background: rgba(12,18,32,.86); }
:root[data-theme="dark"] .snt-tab { color: #b8c1d9; }
:root[data-theme="dark"] .snt-tab:hover { color: #fff; border-color: rgba(255,255,255,.12); }
:root[data-theme="dark"] .snt-tab.is-active { color: #ffcf99; background-color: rgba(255,153,51,.13); border-color: rgba(255,153,51,.35); }
:root[data-theme="dark"] .snt-tab .snt-tab-hi { color: #7f89a3; }
:root[data-theme="dark"] .snt-tab.is-active .snt-tab-hi { color: #ffb35c; }
:root[data-theme="dark"] .snt-divider { background: linear-gradient(transparent, rgba(255,255,255,.14), transparent); }
:root[data-theme="dark"] .snt-avatar { box-shadow: 0 0 0 2px #0c1220, 0 0 0 3.5px rgba(255,153,51,.7); }
:root[data-theme="dark"] .snt-badge-count { box-shadow: 0 0 0 2px #0c1220; }
:root[data-theme="dark"] .snt-pop { background: rgba(20,27,45,.97); border-color: rgba(255,255,255,.08); box-shadow: 0 24px 50px -18px rgba(0,0,0,.8); }
:root[data-theme="dark"] .snt-canvas {
  background:
    radial-gradient(900px 420px at -5% -10%, rgba(255,153,51,.07), transparent 60%),
    radial-gradient(900px 480px at 105% 110%, rgba(19,136,8,.07), transparent 60%);
}
:root[data-theme="dark"] .snt-watermark { filter: invert(1); opacity: .035; }
:root[data-theme="dark"] .snt-toolbar { background: rgba(20,27,45,.72); border-color: rgba(255,255,255,.07); }
:root[data-theme="dark"] .snt-pill { background: rgba(26,34,54,.9); border-color: rgba(255,255,255,.12); color: #c8cfe0; }
:root[data-theme="dark"] .snt-pill:hover { color: #fff; border-color: rgba(255,255,255,.25); }
:root[data-theme="dark"] .snt-pill.is-active { color: #ffcf99; background-color: rgba(255,153,51,.14); border-color: rgba(255,153,51,.5); }
:root[data-theme="dark"] .snt-search, :root[data-theme="dark"] .snt-chip-btn { background: #141b2d; border-color: rgba(255,255,255,.12); color: #e6e9f2; }
:root[data-theme="dark"] .snt-search select { color: #9aa4bd; border-left-color: rgba(255,255,255,.1); }
:root[data-theme="dark"] .snt-search select option { background: #141b2d; }
:root[data-theme="dark"] .snt-chip { background: rgba(168,192,255,.1); color: #c9d6ff; }
:root[data-theme="dark"] .snt-quick { background: rgba(255,255,255,.05); }
:root[data-theme="dark"] .snt-quick button { color: #b8c1d9; }
:root[data-theme="dark"] .snt-quick button.is-on { background: #1f2842; color: #fff; }
:root[data-theme="dark"] .snt-group-head, :root[data-theme="dark"] .snt-th-sort:hover, :root[data-theme="dark"] .snt-th-sort.is-on { color: #c9d6ff; }
:root[data-theme="dark"] .snt-yukt-panel { background: rgba(16,22,37,.95); border-color: rgba(255,255,255,.08); }
:root[data-theme="dark"] .is-bot .snt-yukt-bubble { background: #1a2236; color: #e6e9f2; border-color: rgba(255,255,255,.06); }
:root[data-theme="dark"] .snt-yukt-card { background: rgba(26,34,54,.9); border-color: rgba(255,255,255,.07); }
:root[data-theme="dark"] .snt-yukt-action { color: #ffcf99; }
:root[data-theme="dark"] .snt-yukt-suggest, :root[data-theme="dark"] .snt-yukt-input { background: #1a2236; color: #c9d6ff; border-color: rgba(255,255,255,.1); }
:root[data-theme="dark"] .snt-yukt-input input { color: #e6e9f2; }
:root[data-theme="dark"] .snt-yukt-teaser { background: rgba(20,27,45,.96); color: #e6e9f2; }
:root[data-theme="dark"] .snt-yukt-send:disabled { background: #2b3550; }
:root[data-theme="dark"] .snt-yukt-confirm { background: #1a2236; border-color: rgba(255,153,51,.4); }
:root[data-theme="dark"] .leaflet-tile { filter: brightness(.72) invert(1) contrast(.9) hue-rotate(200deg) saturate(.4); }
:root[data-theme="dark"] .leaflet-container { background: #0c1220; }
:root[data-theme="dark"] .leaflet-popup-content-wrapper, :root[data-theme="dark"] .leaflet-popup-tip { background: #141b2d; color: #e6e9f2; }
:root[data-theme="dark"] input, :root[data-theme="dark"] select, :root[data-theme="dark"] textarea { color-scheme: dark; }
:root[data-theme="dark"] .snt-heat-cell { color: #e6e9f2; }

/* ═══ high contrast: black, white, yellow — no translucency, no motion ═══ */
:root[data-theme="contrast"] body { background: #000; color: #fff; }
:root[data-theme="contrast"] .card { background: #000 !important; border: 2px solid #fff !important; box-shadow: none !important; }
:root[data-theme="contrast"] .snt-navy, :root[data-theme="contrast"] .snt-saffron-text { color: #ffd400 !important; }
:root[data-theme="contrast"] .snt-masthead::before { background: #000; backdrop-filter: none; -webkit-backdrop-filter: none; }
:root[data-theme="contrast"] .snt-masthead { border-bottom: 2px solid #fff; }
:root[data-theme="contrast"] .snt-tab { color: #fff; }
:root[data-theme="contrast"] .snt-tab.is-active { color: #000; background: #ffd400; border-color: #ffd400; }
:root[data-theme="contrast"] .snt-tab.is-active .snt-tab-hi { color: #000; }
:root[data-theme="contrast"] .snt-tab .snt-tab-hi { color: #fff; }
:root[data-theme="contrast"] .snt-pop, :root[data-theme="contrast"] .snt-yukt-panel, :root[data-theme="contrast"] .snt-toolbar { background: #000 !important; border: 2px solid #fff !important; backdrop-filter: none !important; }
:root[data-theme="contrast"] .snt-pill, :root[data-theme="contrast"] .snt-search, :root[data-theme="contrast"] .snt-chip-btn,
:root[data-theme="contrast"] .snt-yukt-suggest, :root[data-theme="contrast"] .snt-yukt-input, :root[data-theme="contrast"] .snt-yukt-card,
:root[data-theme="contrast"] .snt-chip, :root[data-theme="contrast"] .snt-quick button, :root[data-theme="contrast"] .is-bot .snt-yukt-bubble {
  background: #000 !important; color: #fff !important; border: 1.5px solid #fff !important;
}
:root[data-theme="contrast"] .snt-pill.is-active, :root[data-theme="contrast"] .snt-quick button.is-on, :root[data-theme="contrast"] .snt-chip-btn.is-on {
  background: #ffd400 !important; color: #000 !important; border-color: #ffd400 !important;
}
:root[data-theme="contrast"] .snt-search input, :root[data-theme="contrast"] .snt-yukt-input input { color: #fff; }
:root[data-theme="contrast"] .snt-canvas { background: #000; }
:root[data-theme="contrast"] .snt-watermark { display: none; }
:root[data-theme="contrast"] .bg-ink { border: 2px solid #fff; }
:root[data-theme="contrast"] a:not(.snt-tab):not(.snt-glass):not(.snt-ticker-item) { text-decoration: underline; text-underline-offset: 3px; }
:root[data-theme="contrast"] :focus-visible { outline: 3px solid #ffd400 !important; outline-offset: 2px !important; }
:root[data-theme="contrast"] :where(.snt-app) :where(button:not(:disabled), .snt-glass):hover {
  background-image: none; backdrop-filter: none; -webkit-backdrop-filter: none; animation: none;
  box-shadow: 0 0 0 2px #ffd400; translate: none;
}
:root[data-theme="contrast"] .snt-app .card:hover { background-image: none; }
:root[data-theme="contrast"] *, :root[data-theme="contrast"] *::before, :root[data-theme="contrast"] *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
:root[data-theme="contrast"] .leaflet-tile { filter: grayscale(1) contrast(1.4); }
:root[data-theme="contrast"] .snt-heat-cell { outline: 1px solid #fff; }

/* ═══ print (the report is printed from its own frame, see printReport) ═══ */
@media print {
  @page { size: A4; margin: 14mm 12mm; }
  .snt-report .snt-noprint { display: none !important; }
  .snt-report thead { display: table-header-group; }
  .snt-report tr, .snt-report .snt-avoid-break, .snt-report-section { page-break-inside: avoid; }
  .snt-report h3 { page-break-after: avoid; break-after: avoid; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

/** The Light / Dark / High-contrast switch in the government strip. */
function ThemeSwitch() {
  const [mode, setMode] = useThemeMode();
  const icon = {
    light: (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" strokeLinecap="round" />
      </svg>
    ),
    dark: (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M13.5 10.2A6 6 0 015.8 2.5a6 6 0 107.7 7.7z" />
      </svg>
    ),
    contrast: (
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 2a6 6 0 010 12z" fill="currentColor" />
      </svg>
    ),
  };
  return (
    <span className="flex items-center gap-1" role="group" aria-label="Display mode">
      {THEME_MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={mode === m.key}
          aria-label={`${m.label} mode`}
          title={`${m.label} · ${m.hi}`}
          onClick={() => setMode(m.key)}
          className="snt-fontbtn grid place-items-center"
        >
          {icon[m.key]}
        </button>
      ))}
    </span>
  );
}

/* --------------------------------------------------- keyboard shortcuts --- */
/**
 * Two-key "go to" shortcuts (press g, then a letter), the way Gmail and GitHub
 * do it, plus a handful of single keys. Ignored while typing in a field.
 */
const GO_KEYS = [
  { key: "o", to: "/", label: "Overview" },
  { key: "m", to: "/map", label: "Map" },
  { key: "a", to: "/alerts", label: "Alerts" },
  { key: "c", to: "/cameras", label: "Cameras" },
  { key: "d", to: "/assignments", label: "Draw", deciders: true },
  { key: "g", to: "/grievances", label: "Grievances", deciders: true },
  { key: "w", to: "/renewals", label: "Renewals", deciders: true },
  { key: "i", to: "/inspectors", label: "Inspectors", deciders: true },
  { key: "r", to: "/institutes", label: "Register" },
  { key: "s", to: "/districts", label: "Districts" },
  { key: "n", to: "/analytics", label: "Analytics" },
  { key: "p", to: "/reports", label: "Reports" },
  { key: "t", to: "/audit", label: "Audit trail", deciders: true },
  { key: "x", to: "/accessibility", label: "Accessibility" },
];
const SINGLE_KEYS = [
  { keys: ["?"], label: "Show this list of shortcuts" },
  { keys: ["/"], label: "Jump to the search box on this page" },
  { keys: ["y"], label: "Open or close Yukt" },
  { keys: ["Shift", "T"], label: "Cycle Light → Dark → High contrast" },
  { keys: ["Esc"], label: "Close a dialog, menu or Yukt" },
];

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function useGlobalShortcuts({ isDecider, onHelp }) {
  const navigate = useNavigate();
  useEffect(() => {
    let pendingG = false;
    let timer = null;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (pendingG) {
        pendingG = false;
        clearTimeout(timer);
        const hit = GO_KEYS.find((g) => g.key === e.key.toLowerCase() && (!g.deciders || isDecider));
        if (hit) {
          e.preventDefault();
          navigate(hit.to);
        }
        return;
      }
      if (e.key === "g") {
        pendingG = true;
        timer = setTimeout(() => (pendingG = false), 1200);
      } else if (e.key === "?") {
        e.preventDefault();
        onHelp();
      } else if (e.key === "/") {
        const box = document.querySelector('main input[type="search"], main .snt-search input');
        if (box) {
          e.preventDefault();
          box.focus();
        }
      } else if (e.key === "y") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("sentinel:yukt"));
      } else if (e.key === "T" && e.shiftKey) {
        const order = THEME_MODES.map((m) => m.key);
        setThemeMode(order[(order.indexOf(readThemeMode()) + 1) % order.length]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [navigate, isDecider, onHelp]);
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md border border-paper-line bg-paper-raised px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink shadow-[0_1px_0_rgba(0,0,0,.12)]">
      {children}
    </kbd>
  );
}

function ShortcutList({ isDecider }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted"><Bi en="Go to a page" inline altClassName="normal-case tracking-normal" /></p>
        <ul className="space-y-1.5">
          {GO_KEYS.filter((g) => !g.deciders || isDecider).map((g) => (
            <li key={g.key} className="flex items-center justify-between gap-3 text-sm">
              <span>{g.label}</span>
              <span className="flex items-center gap-1">
                <Kbd>g</Kbd>
                <span className="text-xs text-ink-muted">then</span>
                <Kbd>{g.key}</Kbd>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted"><Bi en="Anywhere" inline altClassName="normal-case tracking-normal" /></p>
        <ul className="space-y-1.5">
          {SINGLE_KEYS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
              <span>{s.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


/* --------------------------------------------------------- ashoka chakra -- */
/** The 24-spoke wheel from the national flag, drawn in SVG. */
function AshokaChakra({ size = 28, color = INDIA.navy, className = "" }) {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 * Math.PI) / 180;
    const r = (n) => Math.round(n * 1000) / 1000;
    return (
      <line
        key={i}
        x1={r(12 + 2.4 * Math.cos(a))}
        y1={r(12 + 2.4 * Math.sin(a))}
        x2={r(12 + 10.3 * Math.cos(a))}
        y2={r(12 + 10.3 * Math.sin(a))}
      />
    );
  });
  const rim = Array.from({ length: 24 }, (_, i) => {
    const a = ((i * 15 + 7.5) * Math.PI) / 180;
    return <circle key={i} cx={12 + 10.2 * Math.cos(a)} cy={12 + 10.2 * Math.sin(a)} r="0.42" fill={color} stroke="none" />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11.2" strokeWidth="1.3" />
      <g strokeWidth="0.55" strokeLinecap="round">{spokes}</g>
      {rim}
      <circle cx="12" cy="12" r="2.3" fill={color} stroke="none" />
    </svg>
  );
}

function TricolourMini({ className = "" }) {
  return (
    <span className={`snt-tricolour-mini ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/* ------------------------------------------------------------- clock ------ */
function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

const IST_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});
const IST_DATE_HI = new Intl.DateTimeFormat("hi-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/* ---------------------------------------------------- text size (GIGW) ---- */
/**
 * A−/A/A+ — the text-size control every Indian government site carries under
 * the GIGW accessibility guidelines. Tailwind sizes are in rem, so scaling the
 * root font size scales the whole dashboard. Remembered on this browser only.
 */
const TEXT_SIZES = [
  { key: "sm", label: "A−", aria: "Smaller text", size: "87.5%" },
  { key: "md", label: "A", aria: "Normal text", size: "100%" },
  { key: "lg", label: "A+", aria: "Larger text", size: "112.5%" },
];

function useTextSize() {
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem("sentinel.textSize") || "md";
    } catch {
      return "md";
    }
  });
  useEffect(() => {
    const found = TEXT_SIZES.find((t) => t.key === key) || TEXT_SIZES[1];
    document.documentElement.style.fontSize = found.size;
    try {
      localStorage.setItem("sentinel.textSize", key);
    } catch {
      /* private window — the choice just won't persist */
    }
  }, [key]);
  return [key, setKey];
}

/* ------------------------------------------------------ government strip -- */
function GovStrip({ showClock = true, minimal = false }) {
  const now = useNow(1000);
  const [size, setSize] = useTextSize();
  const { tr, lang } = useT();
  // Regional name first, the way government portals set their masthead.
  const regional = "सामाजिक न्याय और अधिकारिता विभाग";
  const ministry = lang !== "en" ? tr("Ministry of Social Justice & Empowerment") : "Ministry of Social Justice & Empowerment";
  const scriptLang = lang !== "en" ? lang : "hi";
  return (
    <div className="snt-govstrip">
      <div className={`flex h-7 items-center justify-between gap-3 px-4 sm:px-6 ${minimal ? "" : "mx-auto max-w-[1600px]"}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="snt-hi truncate" lang="hi">{regional}</span>
          <span className="opacity-40">|</span>
          <span className="truncate">Department of Social Justice &amp; Empowerment</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <LangOrderSwitch />
          {!minimal && showClock && (
            <span className="tnum hidden items-center gap-1.5 xl:inline-flex" title="Indian Standard Time">
              <span className="snt-hi">{IST_DATE_HI.format(now)}</span>
              <span className="opacity-40">·</span>
              <span>{IST_TIME.format(now).toUpperCase()} IST</span>
            </span>
          )}
          {!minimal && <ThemeSwitch />}
          {!minimal && <span className="flex items-center gap-1" role="group" aria-label="Text size">
            {TEXT_SIZES.map((sz) => (
              <button
                key={sz.key}
                type="button"
                aria-label={sz.aria}
                aria-pressed={size === sz.key}
                onClick={() => setSize(sz.key)}
                className="snt-fontbtn"
                style={{ fontSize: sz.key === "sm" ? 9.5 : sz.key === "lg" ? 12 : 10.5 }}
              >
                {sz.label}
              </button>
            ))}
          </span>}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §13c  LANGUAGE — English + Hindi
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Sentinel speaks English and Hindi, together: English is the primary line and
 * Hindi sits beneath it on navigation, page titles and key controls
 * ("Alerts / चेतावनियाँ"). The only choice an official makes is the order —
 * the EN | हिन्दी switch in the top strip puts Hindi first and larger.
 * There is no language picker and no region picker: the server scopes data by
 * the signed-in official's role.
 *
 * Translations are keyed by the English string (gettext-style), so a page
 * just writes t("Alerts"). A string with no Hindi falls back to English — the
 * interface never shows a blank. (The dictionaries for other languages remain
 * below as data only; the interface does not offer them.)
 */
const UI_LANGS = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी", font: "Noto+Sans+Devanagari", family: "Noto Sans Devanagari" },
  { code: "bn", name: "Bengali", native: "বাংলা", font: "Noto+Sans+Bengali", family: "Noto Sans Bengali" },
  { code: "mr", name: "Marathi", native: "मराठी", font: "Noto+Sans+Devanagari", family: "Noto Sans Devanagari" },
  { code: "te", name: "Telugu", native: "తెలుగు", font: "Noto+Sans+Telugu", family: "Noto Sans Telugu" },
  { code: "ta", name: "Tamil", native: "தமிழ்", font: "Noto+Sans+Tamil", family: "Noto Sans Tamil" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", font: "Noto+Sans+Gujarati", family: "Noto Sans Gujarati" },
  { code: "ur", name: "Urdu", native: "اردو", font: "Noto+Nastaliq+Urdu", family: "Noto Nastaliq Urdu", rtl: true },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", font: "Noto+Sans+Kannada", family: "Noto Sans Kannada" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", font: "Noto+Sans+Oriya", family: "Noto Sans Oriya" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", font: "Noto+Sans+Malayalam", family: "Noto Sans Malayalam" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", font: "Noto+Sans+Gurmukhi", family: "Noto Sans Gurmukhi" },
];
const uiLang = (code) => UI_LANGS.find((l) => l.code === code) || UI_LANGS[0];

/** [value, English, Hindi, suggested language] — every State and Union Territory. */
const REGIONS = [
  ["ALL", "All India", "संपूर्ण भारत", null, "national"],
  ["Andhra Pradesh", "Andhra Pradesh", "आंध्र प्रदेश", "te", "state"],
  ["Arunachal Pradesh", "Arunachal Pradesh", "अरुणाचल प्रदेश", "en", "state"],
  ["Assam", "Assam", "असम", "en", "state"],
  ["Bihar", "Bihar", "बिहार", "hi", "state"],
  ["Chhattisgarh", "Chhattisgarh", "छत्तीसगढ़", "hi", "state"],
  ["Goa", "Goa", "गोवा", "en", "state"],
  ["Gujarat", "Gujarat", "गुजरात", "gu", "state"],
  ["Haryana", "Haryana", "हरियाणा", "hi", "state"],
  ["Himachal Pradesh", "Himachal Pradesh", "हिमाचल प्रदेश", "hi", "state"],
  ["Jharkhand", "Jharkhand", "झारखंड", "hi", "state"],
  ["Karnataka", "Karnataka", "कर्नाटक", "kn", "state"],
  ["Kerala", "Kerala", "केरल", "ml", "state"],
  ["Madhya Pradesh", "Madhya Pradesh", "मध्य प्रदेश", "hi", "state"],
  ["Maharashtra", "Maharashtra", "महाराष्ट्र", "mr", "state"],
  ["Manipur", "Manipur", "मणिपुर", "en", "state"],
  ["Meghalaya", "Meghalaya", "मेघालय", "en", "state"],
  ["Mizoram", "Mizoram", "मिज़ोरम", "en", "state"],
  ["Nagaland", "Nagaland", "नागालैंड", "en", "state"],
  ["Odisha", "Odisha", "ओडिशा", "or", "state"],
  ["Punjab", "Punjab", "पंजाब", "pa", "state"],
  ["Rajasthan", "Rajasthan", "राजस्थान", "hi", "state"],
  ["Sikkim", "Sikkim", "सिक्किम", "en", "state"],
  ["Tamil Nadu", "Tamil Nadu", "तमिलनाडु", "ta", "state"],
  ["Telangana", "Telangana", "तेलंगाना", "te", "state"],
  ["Tripura", "Tripura", "त्रिपुरा", "bn", "state"],
  ["Uttar Pradesh", "Uttar Pradesh", "उत्तर प्रदेश", "hi", "state"],
  ["Uttarakhand", "Uttarakhand", "उत्तराखंड", "hi", "state"],
  ["West Bengal", "West Bengal", "पश्चिम बंगाल", "bn", "state"],
  ["Andaman and Nicobar Islands", "Andaman and Nicobar Islands", "अंडमान और निकोबार द्वीपसमूह", "hi", "ut"],
  ["Chandigarh", "Chandigarh", "चंडीगढ़", "hi", "ut"],
  ["Dadra and Nagar Haveli and Daman and Diu", "Dadra and Nagar Haveli and Daman and Diu", "दादरा और नगर हवेली और दमन और दीव", "gu", "ut"],
  ["Delhi", "Delhi (NCT)", "दिल्ली", "hi", "ut"],
  ["Jammu and Kashmir", "Jammu and Kashmir", "जम्मू और कश्मीर", "ur", "ut"],
  ["Ladakh", "Ladakh", "लद्दाख", "hi", "ut"],
  ["Lakshadweep", "Lakshadweep", "लक्षद्वीप", "ml", "ut"],
  ["Puducherry", "Puducherry", "पुडुचेरी", "ta", "ut"],
].map(([value, en, hi, suggest, kind]) => ({ value, en, hi, suggest, kind }));
const regionOf = (v) => REGIONS.find((r) => r.value === v) || REGIONS[0];

/* ------------------------------------------------------- translations ---- */
// The core interface, in every language — same order as I18N_KEYS.
const I18N_KEYS = [
  "Overview", "Map", "Alerts", "Cameras", "Draw", "Grievances", "Renewals", "Inspectors", "Register", "Districts",
  "Analytics", "Reports", "Audit trail", "Watch", "Act", "Assess", "Government of India",
  "Ministry of Social Justice & Empowerment", "Sign in", "Sign out", "Email", "Password", "Language", "Region",
  "Language & region", "Continue", "Save", "Cancel", "Search", "Refresh", "Assigned inspector",
  "Connect with Inspector", "Send message", "Message history", "Available", "On site", "Offline", "Good morning",
  "Good afternoon", "Good evening", "LIVE", "Sort", "Group", "Views", "Columns", "Export", "Clear all", "Filters",
  "Showing {n} of {total}", "Help", "Welcome to Sentinel", "Choose your region and language", "All India",
  "Accessibility", "Preferences", "Clear all filters",
];
const I18N_CORE = {
  hi: "अवलोकन|मानचित्र|चेतावनियाँ|कैमरे|आवंटन|शिकायतें|नवीनीकरण|निरीक्षक|पंजिका|ज़िले|विश्लेषण|रिपोर्ट|ऑडिट ट्रेल|निगरानी|कार्रवाई|आकलन|भारत सरकार|सामाजिक न्याय और अधिकारिता मंत्रालय|साइन इन करें|साइन आउट|ईमेल|पासवर्ड|भाषा|क्षेत्र|भाषा और क्षेत्र|आगे बढ़ें|सहेजें|रद्द करें|खोजें|रीफ़्रेश|नियुक्त निरीक्षक|निरीक्षक से जुड़ें|संदेश भेजें|संदेश इतिहास|उपलब्ध|स्थल पर|ऑफ़लाइन|सुप्रभात|नमस्कार|शुभ संध्या|लाइव|क्रम|समूह|व्यू|कॉलम|निर्यात|सभी हटाएँ|फ़िल्टर|{total} में से {n} दिखाए गए|सहायता|Sentinel में आपका स्वागत है|अपना क्षेत्र और भाषा चुनें|संपूर्ण भारत|सुगम्यता|प्राथमिकताएँ|सभी फ़िल्टर हटाएँ",
  bn: "সংক্ষিপ্ত বিবরণ|মানচিত্র|সতর্কতা|ক্যামেরা|বরাদ্দ|অভিযোগ|নবীকরণ|পরিদর্শক|রেজিস্টার|জেলা|বিশ্লেষণ|প্রতিবেদন|অডিট ট্রেইল|নজরদারি|পদক্ষেপ|মূল্যায়ন|ভারত সরকার|সামাজিক ন্যায় ও ক্ষমতায়ন মন্ত্রক|সাইন ইন|সাইন আউট|ইমেল|পাসওয়ার্ড|ভাষা|অঞ্চল|ভাষা ও অঞ্চল|এগিয়ে যান|সংরক্ষণ করুন|বাতিল|খুঁজুন|রিফ্রেশ|নিযুক্ত পরিদর্শক|পরিদর্শকের সাথে যোগাযোগ করুন|বার্তা পাঠান|বার্তার ইতিহাস|উপলব্ধ|স্থানে উপস্থিত|অফলাইন|সুপ্রভাত|শুভ অপরাহ্ন|শুভ সন্ধ্যা|লাইভ|সাজান|গোষ্ঠী|ভিউ|কলাম|রপ্তানি|সব মুছুন|ফিল্টার|{total}-এর মধ্যে {n}টি দেখানো হচ্ছে|সাহায্য|Sentinel-এ স্বাগতম|আপনার অঞ্চল ও ভাষা বেছে নিন|সমগ্র ভারত|প্রবেশযোগ্যতা|পছন্দসমূহ|সব ফিল্টার মুছুন",
  mr: "आढावा|नकाशा|इशारे|कॅमेरे|वाटप|तक्रारी|नूतनीकरण|निरीक्षक|नोंदवही|जिल्हे|विश्लेषण|अहवाल|लेखापरीक्षण नोंद|देखरेख|कार्यवाही|मूल्यमापन|भारत सरकार|सामाजिक न्याय आणि सक्षमीकरण मंत्रालय|साइन इन करा|साइन आउट|ईमेल|पासवर्ड|भाषा|प्रदेश|भाषा आणि प्रदेश|पुढे चला|जतन करा|रद्द करा|शोधा|रिफ्रेश|नियुक्त निरीक्षक|निरीक्षकाशी संपर्क साधा|संदेश पाठवा|संदेश इतिहास|उपलब्ध|स्थळावर|ऑफलाइन|सुप्रभात|शुभ दुपार|शुभ संध्याकाळ|थेट|क्रमवारी|गट|दृश्ये|स्तंभ|निर्यात|सर्व काढा|फिल्टर|{total} पैकी {n} दाखवत आहे|मदत|Sentinel मध्ये आपले स्वागत आहे|आपला प्रदेश आणि भाषा निवडा|संपूर्ण भारत|सुलभता|प्राधान्ये|सर्व फिल्टर काढा",
  te: "అవలోకనం|మ్యాప్|హెచ్చరికలు|కెమెరాలు|కేటాయింపు|ఫిర్యాదులు|పునరుద్ధరణలు|తనిఖీ అధికారులు|రిజిస్టర్|జిల్లాలు|విశ్లేషణ|నివేదికలు|ఆడిట్ ట్రైల్|పర్యవేక్షణ|చర్య|అంచనా|భారత ప్రభుత్వం|సామాజిక న్యాయం మరియు సాధికారత మంత్రిత్వ శాఖ|సైన్ ఇన్|సైన్ అవుట్|ఇమెయిల్|పాస్‌వర్డ్|భాష|ప్రాంతం|భాష & ప్రాంతం|కొనసాగించు|సేవ్ చేయి|రద్దు చేయి|వెతకండి|రిఫ్రెష్|కేటాయించిన తనిఖీ అధికారి|తనిఖీ అధికారిని సంప్రదించండి|సందేశం పంపండి|సందేశ చరిత్ర|అందుబాటులో ఉన్నారు|స్థలంలో ఉన్నారు|ఆఫ్‌లైన్|శుభోదయం|శుభ మధ్యాహ్నం|శుభ సాయంత్రం|ప్రత్యక్షం|క్రమం|సమూహం|వీక్షణలు|నిలువు వరుసలు|ఎగుమతి|అన్నీ తొలగించు|ఫిల్టర్లు|{total}లో {n} చూపుతోంది|సహాయం|Sentinelకు స్వాగతం|మీ ప్రాంతం మరియు భాషను ఎంచుకోండి|అఖిల భారతం|సౌలభ్యం|ప్రాధాన్యతలు|అన్ని ఫిల్టర్లను తొలగించు",
  ta: "மேலோட்டம்|வரைபடம்|எச்சரிக்கைகள்|கேமராக்கள்|ஒதுக்கீடு|குறைகள்|புதுப்பித்தல்கள்|ஆய்வாளர்கள்|பதிவேடு|மாவட்டங்கள்|பகுப்பாய்வு|அறிக்கைகள்|தணிக்கைப் பதிவு|கண்காணிப்பு|நடவடிக்கை|மதிப்பீடு|இந்திய அரசு|சமூக நீதி மற்றும் அதிகாரமளித்தல் அமைச்சகம்|உள்நுழை|வெளியேறு|மின்னஞ்சல்|கடவுச்சொல்|மொழி|பிராந்தியம்|மொழி & பிராந்தியம்|தொடரவும்|சேமி|ரத்து செய்|தேடு|புதுப்பி|நியமிக்கப்பட்ட ஆய்வாளர்|ஆய்வாளருடன் தொடர்பு கொள்ளுங்கள்|செய்தி அனுப்பு|செய்தி வரலாறு|கிடைக்கிறார்|தளத்தில்|இணைப்பில் இல்லை|காலை வணக்கம்|மதிய வணக்கம்|மாலை வணக்கம்|நேரலை|வரிசைப்படுத்து|குழு|காட்சிகள்|நெடுவரிசைகள்|ஏற்றுமதி|அனைத்தையும் அழி|வடிகட்டிகள்|{total}-இல் {n} காட்டப்படுகிறது|உதவி|Sentinel-க்கு வரவேற்கிறோம்|உங்கள் பிராந்தியம் மற்றும் மொழியைத் தேர்ந்தெடுக்கவும்|அகில இந்தியா|அணுகல்தன்மை|விருப்பங்கள்|அனைத்து வடிகட்டிகளையும் அழி",
  gu: "ઝાંખી|નકશો|ચેતવણીઓ|કેમેરા|ફાળવણી|ફરિયાદો|નવીકરણ|નિરીક્ષકો|રજિસ્ટર|જિલ્લાઓ|વિશ્લેષણ|અહેવાલો|ઓડિટ ટ્રેલ|દેખરેખ|કાર્યવાહી|મૂલ્યાંકન|ભારત સરકાર|સામાજિક ન્યાય અને અધિકારિતા મંત્રાલય|સાઇન ઇન|સાઇન આઉટ|ઇમેઇલ|પાસવર્ડ|ભાષા|પ્રદેશ|ભાષા અને પ્રદેશ|આગળ વધો|સાચવો|રદ કરો|શોધો|રિફ્રેશ|નિયુક્ત નિરીક્ષક|નિરીક્ષક સાથે સંપર્ક કરો|સંદેશ મોકલો|સંદેશ ઇતિહાસ|ઉપલબ્ધ|સ્થળ પર|ઓફલાઇન|સુપ્રભાત|શુભ બપોર|શુભ સાંજ|લાઇવ|ક્રમ|જૂથ|દૃશ્યો|કૉલમ|નિકાસ|બધું દૂર કરો|ફિલ્ટર|{total}માંથી {n} બતાવી રહ્યા છીએ|મદદ|Sentinelમાં આપનું સ્વાગત છે|તમારો પ્રદેશ અને ભાષા પસંદ કરો|સમગ્ર ભારત|સુલભતા|પસંદગીઓ|બધા ફિલ્ટર દૂર કરો",
  ur: "جائزہ|نقشہ|انتباہات|کیمرے|تفویض|شکایات|تجدید|معائنہ کار|رجسٹر|اضلاع|تجزیہ|رپورٹس|آڈٹ ٹریل|نگرانی|کارروائی|تشخیص|حکومتِ ہند|وزارتِ سماجی انصاف و تفویضِ اختیارات|سائن ان|سائن آؤٹ|ای میل|پاس ورڈ|زبان|علاقہ|زبان اور علاقہ|جاری رکھیں|محفوظ کریں|منسوخ کریں|تلاش کریں|تازہ کریں|مقررہ معائنہ کار|معائنہ کار سے رابطہ کریں|پیغام بھیجیں|پیغامات کی تاریخ|دستیاب|موقع پر|آف لائن|صبح بخیر|سہ پہر بخیر|شام بخیر|براہِ راست|ترتیب|گروپ|منظر|کالم|برآمد|سب صاف کریں|فلٹر|{total} میں سے {n} دکھائے جا رہے ہیں|مدد|Sentinel میں خوش آمدید|اپنا علاقہ اور زبان منتخب کریں|پورا ہندوستان|رسائی|ترجیحات|تمام فلٹر صاف کریں",
  kn: "ಅವಲೋಕನ|ನಕ್ಷೆ|ಎಚ್ಚರಿಕೆಗಳು|ಕ್ಯಾಮೆರಾಗಳು|ಹಂಚಿಕೆ|ದೂರುಗಳು|ನವೀಕರಣಗಳು|ತನಿಖಾಧಿಕಾರಿಗಳು|ರಿಜಿಸ್ಟರ್|ಜಿಲ್ಲೆಗಳು|ವಿಶ್ಲೇಷಣೆ|ವರದಿಗಳು|ಲೆಕ್ಕಪರಿಶೋಧನಾ ದಾಖಲೆ|ನಿಗಾ|ಕ್ರಮ|ಮೌಲ್ಯಮಾಪನ|ಭಾರತ ಸರ್ಕಾರ|ಸಾಮಾಜಿಕ ನ್ಯಾಯ ಮತ್ತು ಸಬಲೀಕರಣ ಸಚಿವಾಲಯ|ಸೈನ್ ಇನ್|ಸೈನ್ ಔಟ್|ಇಮೇಲ್|ಪಾಸ್‌ವರ್ಡ್|ಭಾಷೆ|ಪ್ರದೇಶ|ಭಾಷೆ ಮತ್ತು ಪ್ರದೇಶ|ಮುಂದುವರಿಸಿ|ಉಳಿಸಿ|ರದ್ದುಮಾಡಿ|ಹುಡುಕಿ|ರಿಫ್ರೆಶ್|ನಿಯೋಜಿತ ತನಿಖಾಧಿಕಾರಿ|ತನಿಖಾಧಿಕಾರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ|ಸಂದೇಶ ಕಳುಹಿಸಿ|ಸಂದೇಶ ಇತಿಹಾಸ|ಲಭ್ಯವಿದ್ದಾರೆ|ಸ್ಥಳದಲ್ಲಿದ್ದಾರೆ|ಆಫ್‌ಲೈನ್|ಶುಭೋದಯ|ಶುಭ ಮಧ್ಯಾಹ್ನ|ಶುಭ ಸಂಜೆ|ನೇರ|ವಿಂಗಡಿಸು|ಗುಂಪು|ವೀಕ್ಷಣೆಗಳು|ಕಾಲಮ್‌ಗಳು|ರಫ್ತು|ಎಲ್ಲವನ್ನೂ ತೆರವುಗೊಳಿಸಿ|ಫಿಲ್ಟರ್‌ಗಳು|{total} ರಲ್ಲಿ {n} ತೋರಿಸಲಾಗುತ್ತಿದೆ|ಸಹಾಯ|Sentinel ಗೆ ಸ್ವಾಗತ|ನಿಮ್ಮ ಪ್ರದೇಶ ಮತ್ತು ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ|ಅಖಿಲ ಭಾರತ|ಪ್ರವೇಶಸಾಧ್ಯತೆ|ಆದ್ಯತೆಗಳು|ಎಲ್ಲ ಫಿಲ್ಟರ್‌ಗಳನ್ನು ತೆರವುಗೊಳಿಸಿ",
  or: "ସମୀକ୍ଷା|ମାନଚିତ୍ର|ସତର୍କତା|କ୍ୟାମେରା|ଆବଣ୍ଟନ|ଅଭିଯୋଗ|ନବୀକରଣ|ନିରୀକ୍ଷକ|ପଞ୍ଜିକା|ଜିଲ୍ଲା|ବିଶ୍ଳେଷଣ|ରିପୋର୍ଟ|ଅଡିଟ୍ ଟ୍ରେଲ୍|ତଦାରଖ|କାର୍ଯ୍ୟାନୁଷ୍ଠାନ|ମୂଲ୍ୟାଙ୍କନ|ଭାରତ ସରକାର|ସାମାଜିକ ନ୍ୟାୟ ଓ ସଶକ୍ତିକରଣ ମନ୍ତ୍ରଣାଳୟ|ସାଇନ୍ ଇନ୍|ସାଇନ୍ ଆଉଟ୍|ଇମେଲ୍|ପାସୱାର୍ଡ|ଭାଷା|ଅଞ୍ଚଳ|ଭାଷା ଓ ଅଞ୍ଚଳ|ଆଗକୁ ବଢ଼ନ୍ତୁ|ସଞ୍ଚୟ କରନ୍ତୁ|ବାତିଲ୍|ଖୋଜନ୍ତୁ|ରିଫ୍ରେସ୍|ନିଯୁକ୍ତ ନିରୀକ୍ଷକ|ନିରୀକ୍ଷକଙ୍କ ସହ ଯୋଗାଯୋଗ କରନ୍ତୁ|ବାର୍ତ୍ତା ପଠାନ୍ତୁ|ବାର୍ତ୍ତା ଇତିହାସ|ଉପଲବ୍ଧ|ସ୍ଥଳରେ|ଅଫଲାଇନ୍|ସୁପ୍ରଭାତ|ଶୁଭ ଅପରାହ୍ନ|ଶୁଭ ସନ୍ଧ୍ୟା|ଲାଇଭ୍|କ୍ରମ|ଗୋଷ୍ଠୀ|ଦୃଶ୍ୟ|ସ୍ତମ୍ଭ|ରପ୍ତାନି|ସବୁ ହଟାନ୍ତୁ|ଫିଲ୍ଟର୍|{total}ରୁ {n} ଦେଖାଯାଉଛି|ସହାୟତା|Sentinelକୁ ସ୍ୱାଗତ|ଆପଣଙ୍କ ଅଞ୍ଚଳ ଓ ଭାଷା ବାଛନ୍ତୁ|ସମଗ୍ର ଭାରତ|ସୁଗମତା|ପସନ୍ଦ|ସବୁ ଫିଲ୍ଟର୍ ହଟାନ୍ତୁ",
  ml: "അവലോകനം|മാപ്പ്|മുന്നറിയിപ്പുകൾ|ക്യാമറകൾ|നിയോഗം|പരാതികൾ|പുതുക്കലുകൾ|പരിശോധകർ|രജിസ്റ്റർ|ജില്ലകൾ|വിശകലനം|റിപ്പോർട്ടുകൾ|ഓഡിറ്റ് രേഖ|നിരീക്ഷണം|നടപടി|വിലയിരുത്തൽ|ഭാരത സർക്കാർ|സാമൂഹിക നീതി ശാക്തീകരണ മന്ത്രാലയം|സൈൻ ഇൻ|സൈൻ ഔട്ട്|ഇമെയിൽ|പാസ്‌വേഡ്|ഭാഷ|പ്രദേശം|ഭാഷയും പ്രദേശവും|തുടരുക|സംരക്ഷിക്കുക|റദ്ദാക്കുക|തിരയുക|പുതുക്കുക|നിയോഗിച്ച പരിശോധകൻ|പരിശോധകനുമായി ബന്ധപ്പെടുക|സന്ദേശം അയയ്ക്കുക|സന്ദേശ ചരിത്രം|ലഭ്യമാണ്|സ്ഥലത്തുണ്ട്|ഓഫ്‌ലൈൻ|സുപ്രഭാതം|ശുഭ ഉച്ച|ശുഭ സന്ധ്യ|തത്സമയം|ക്രമീകരിക്കുക|ഗ്രൂപ്പ്|കാഴ്ചകൾ|നിരകൾ|കയറ്റുമതി|എല്ലാം മായ്ക്കുക|ഫിൽട്ടറുകൾ|{total}-ൽ {n} കാണിക്കുന്നു|സഹായം|Sentinel-ലേക്ക് സ്വാഗതം|നിങ്ങളുടെ പ്രദേശവും ഭാഷയും തിരഞ്ഞെടുക്കുക|അഖിലേന്ത്യ|പ്രവേശനക്ഷമത|മുൻഗണനകൾ|എല്ലാ ഫിൽട്ടറുകളും മായ്ക്കുക",
  pa: "ਸੰਖੇਪ ਝਲਕ|ਨਕਸ਼ਾ|ਚੇਤਾਵਨੀਆਂ|ਕੈਮਰੇ|ਵੰਡ|ਸ਼ਿਕਾਇਤਾਂ|ਨਵੀਨੀਕਰਨ|ਨਿਰੀਖਕ|ਰਜਿਸਟਰ|ਜ਼ਿਲ੍ਹੇ|ਵਿਸ਼ਲੇਸ਼ਣ|ਰਿਪੋਰਟਾਂ|ਆਡਿਟ ਟ੍ਰੇਲ|ਨਿਗਰਾਨੀ|ਕਾਰਵਾਈ|ਮੁਲਾਂਕਣ|ਭਾਰਤ ਸਰਕਾਰ|ਸਮਾਜਿਕ ਨਿਆਂ ਅਤੇ ਅਧਿਕਾਰਤਾ ਮੰਤਰਾਲਾ|ਸਾਈਨ ਇਨ|ਸਾਈਨ ਆਊਟ|ਈਮੇਲ|ਪਾਸਵਰਡ|ਭਾਸ਼ਾ|ਖੇਤਰ|ਭਾਸ਼ਾ ਅਤੇ ਖੇਤਰ|ਅੱਗੇ ਵਧੋ|ਸੰਭਾਲੋ|ਰੱਦ ਕਰੋ|ਖੋਜੋ|ਤਾਜ਼ਾ ਕਰੋ|ਨਿਯੁਕਤ ਨਿਰੀਖਕ|ਨਿਰੀਖਕ ਨਾਲ ਸੰਪਰਕ ਕਰੋ|ਸੁਨੇਹਾ ਭੇਜੋ|ਸੁਨੇਹਿਆਂ ਦਾ ਇਤਿਹਾਸ|ਉਪਲਬਧ|ਸਥਾਨ 'ਤੇ|ਔਫਲਾਈਨ|ਸ਼ੁਭ ਸਵੇਰ|ਸ਼ੁਭ ਦੁਪਹਿਰ|ਸ਼ੁਭ ਸ਼ਾਮ|ਲਾਈਵ|ਕ੍ਰਮ|ਸਮੂਹ|ਦ੍ਰਿਸ਼|ਕਾਲਮ|ਨਿਰਯਾਤ|ਸਭ ਹਟਾਓ|ਫਿਲਟਰ|{total} ਵਿੱਚੋਂ {n} ਦਿਖਾਏ ਜਾ ਰਹੇ ਹਨ|ਮਦਦ|Sentinel ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ|ਆਪਣਾ ਖੇਤਰ ਅਤੇ ਭਾਸ਼ਾ ਚੁਣੋ|ਸਮੁੱਚਾ ਭਾਰਤ|ਪਹੁੰਚਯੋਗਤਾ|ਤਰਜੀਹਾਂ|ਸਾਰੇ ਫਿਲਟਰ ਹਟਾਓ",
};

// Hindi goes further: page titles, panels, the inspector workspace.
const I18N_HI_EXTRA = {
  "Institute register": "संस्था पंजिका",
  "Keyboard shortcuts": "कीबोर्ड शॉर्टकट",
  "Display mode": "प्रदर्शन मोड",
  "Text size": "अक्षर आकार",
  "Account": "खाता",
  "Show English first": "पहले अंग्रेज़ी",
  "Show my language first": "पहले मेरी भाषा",
  "Display order": "दिखाने का क्रम",
  "Suggested for your region": "आपके क्षेत्र के लिए सुझाई गई",
  "Type a message…": "संदेश लिखें…",
  "Urgent": "अत्यावश्यक",
  "Message": "संदेश",
  "Instruction": "निर्देश",
  "Update request": "स्थिति अनुरोध",
  "Quick messages": "त्वरित संदेश",
  "Sent": "भेजा गया",
  "Delivered": "पहुँच गया",
  "Read": "पढ़ लिया",
  "Responsible for": "ज़िम्मेदारी",
  "Last seen": "अंतिम बार सक्रिय",
  "Field inspectors": "क्षेत्रीय निरीक्षक",
  "Sites assigned": "आवंटित स्थल",
  "Unread": "अपठित",
  "Regarding": "विषय",
  "All sites": "सभी स्थल",
  "Details": "विवरण",
  "Messages": "संदेश",
  "No messages yet": "अभी कोई संदेश नहीं",
  "Test access": "परीक्षण प्रवेश",
  "Other Sentinel services": "अन्य Sentinel सेवाएँ",
  "States": "राज्य",
  "Union Territories": "केंद्र शासित प्रदेश",
  "National view": "राष्ट्रीय दृश्य",
  "Open alerts": "खुली चेतावनियाँ",
  "Critical alerts": "गंभीर चेतावनियाँ",
  "Institutes monitored": "निगरानी में संस्थाएँ",
  "Average compliance": "औसत अनुपालन",
  "Needs a decision": "निर्णय आवश्यक",
  "Camera health": "कैमरा स्थिति",
  "Portfolio status": "समग्र स्थिति",
  "Download PDF": "PDF डाउनलोड करें",
  "Download Excel": "Excel डाउनलोड करें",
  "Skip to main content": "मुख्य सामग्री पर जाएँ",
  "Screen reader access": "स्क्रीन रीडर सुविधा",
  "Officials and administrators": "अधिकारी और प्रशासक",
  "Top performing": "सर्वश्रेष्ठ ज़िले",
  "Needs attention": "ध्यान दें",
  "District heatmap": "ज़िला हीटमैप",
  "Breached": "समय-सीमा पार",
  "Due in 3 days": "3 दिन में देय",
  "On track": "समय पर",
  "No first response": "पहला जवाब नहीं",
  "Due soon": "जल्द देय",
  "Scope": "क्षेत्र",
  "Period": "अवधि",
  "Sections": "खंड",
  "Display": "प्रदर्शन",
  "What we've done": "सुविधाएँ",
  "Found a barrier?": "समस्या बताएँ",
  "Go to a page": "पेज पर जाएँ",
  "Anywhere": "कहीं भी",
  "Avg compliance": "औसत अनुपालन",
  "Flagged": "चिह्नित",
  "Critical": "गंभीर",
  "Cameras dark": "कैमरे बंद",
  "SLA breached": "शिकायत देरी",
  "Renewals due": "नवीनीकरण",
  "Summary": "सारांश",
  "District table": "ज़िला तालिका",
  "Institutes": "संस्थाएँ",
  "Alerts in period": "अवधि की चेतावनियाँ",
  "Grievances & SLA": "शिकायतें और SLA",
  "Cameras not reporting": "बंद कैमरे",
  "Pending renewals": "लंबित नवीनीकरण",
  "Assignment draw": "निरीक्षण आवंटन",
  "Recent assignments": "हाल के आवंटन",
  "Field team": "क्षेत्रीय दल",
  "Voice and video": "वॉइस और वीडियो",
  "Change": "बदलें",
  "Done": "हो गया",
  "Your jurisdiction": "आपका अधिकार क्षेत्र",
  "Interface language": "इंटरफ़ेस भाषा",
  // Session, sign-in and the Security page (§7a, §11, §14, §31)
  "You have signed out.": "आपने साइन आउट कर दिया है।",
  "You were signed out after 15 minutes of inactivity.": "15 मिनट तक कोई गतिविधि न होने पर आपको साइन आउट कर दिया गया।",
  "Your session ended. Please sign in again.": "आपका सत्र समाप्त हो गया। कृपया फिर से साइन इन करें।",
  "Session expired. Please sign in again.": "सत्र की अवधि समाप्त हो गई। कृपया फिर से साइन इन करें।",
  "You were signed out in another tab.": "किसी दूसरे टैब में आपको साइन आउट कर दिया गया।",
  "Still there?": "क्या आप अभी भी यहाँ हैं?",
  "For your security you'll be signed out in {time}": "आपकी सुरक्षा के लिए {time} में आपको साइन आउट कर दिया जाएगा",
  "Stay signed in": "साइन इन रहें",
  "Sign out now": "अभी साइन आउट करें",
  "Last signed in {when} from {ip}": "पिछला साइन इन {when}, {ip} से",
  "Last signed in {when}": "पिछला साइन इन {when}",
  "Enter your email and password to continue": "आगे बढ़ने के लिए अपना ईमेल और पासवर्ड दर्ज करें",
  "Incorrect email or password.": "ईमेल या पासवर्ड गलत है।",
  "Can't reach the server. Check your connection and try again.": "सर्वर से संपर्क नहीं हो पा रहा। अपना कनेक्शन जाँचें और फिर प्रयास करें।",
  "Too many failed sign-ins. Try again later.": "बहुत अधिक असफल साइन इन। कुछ देर बाद प्रयास करें।",
  "Too many attempts from this network. Please wait a minute and try again.": "इस नेटवर्क से बहुत अधिक प्रयास हुए। कृपया एक मिनट रुककर फिर प्रयास करें।",
  "This account is disabled. Contact your administrator.": "यह खाता निष्क्रिय है। अपने प्रशासक से संपर्क करें।",
  "Invalid code.": "कोड अमान्य है।",
  "Verification timed out. Please sign in again.": "सत्यापन का समय समाप्त हो गया। कृपया फिर से साइन इन करें।",
  "You can try again in {time}": "आप {time} बाद फिर प्रयास कर सकते हैं",
  "Show password": "पासवर्ड दिखाएँ",
  "Hide password": "पासवर्ड छिपाएँ",
  "Caps Lock is on": "कैप्स लॉक चालू है",
  "Signing in…": "साइन इन हो रहा है…",
  "2-step verification": "दो-चरणीय सत्यापन",
  "Enter the 6-digit code from your authenticator app.": "अपने ऑथेंटिकेटर ऐप से 6 अंकों का कोड दर्ज करें।",
  "Enter one of your recovery codes.": "अपने रिकवरी कोड में से कोई एक दर्ज करें।",
  "Verification code": "सत्यापन कोड",
  "Recovery code": "रिकवरी कोड",
  "Verify": "सत्यापित करें",
  "Verifying…": "सत्यापन हो रहा है…",
  "Back": "वापस",
  "Use a recovery code instead": "इसके बजाय रिकवरी कोड का उपयोग करें",
  "Use the authenticator code instead": "इसके बजाय ऑथेंटिकेटर कोड का उपयोग करें",
  "Mock mode: any 6-digit code (or any XXXX-XXXX recovery code) is accepted.": "मॉक मोड: कोई भी 6 अंकों का कोड (या कोई भी XXXX-XXXX रिकवरी कोड) स्वीकार है।",
  "Updated just now": "अभी अपडेट हुआ",
  "Updated {n} min ago": "{n} मिनट पहले अपडेट हुआ",
  "Updated {n} hr ago": "{n} घंटे पहले अपडेट हुआ",
  "Refresh now": "अभी रीफ़्रेश करें",
  "Security": "सुरक्षा",
  "Password, 2-step verification, devices": "पासवर्ड, दो-चरणीय सत्यापन, डिवाइस",
  "Your password, 2-step verification, and every device signed in to your account.": "आपका पासवर्ड, दो-चरणीय सत्यापन, और आपके खाते में साइन इन हर डिवाइस।",
  "Mock mode: these controls work on sample data in this browser. Nothing is sent to a server.": "मॉक मोड: ये नियंत्रण इस ब्राउज़र में नमूना डेटा पर काम करते हैं। सर्वर को कुछ नहीं भेजा जाता।",
  "Available when connected to the server": "सर्वर से जुड़ने पर उपलब्ध",
  "Copied": "कॉपी हो गया",
  "Couldn't copy — select the text and copy it yourself": "कॉपी नहीं हो सका — टेक्स्ट चुनकर स्वयं कॉपी करें",
  "Sign-in activity": "साइन इन गतिविधि",
  "If a sign-in here isn't yours, change your password and sign out the other devices.": "यदि यहाँ कोई साइन इन आपका नहीं है, तो पासवर्ड बदलें और अन्य डिवाइस से साइन आउट करें।",
  "Previous sign-in": "पिछला साइन इन",
  "From IP address": "IP पता",
  "Password last changed": "पासवर्ड पिछली बार बदला",
  "This session ends by": "यह सत्र समाप्त होगा",
  "First sign-in on this account": "इस खाते पर पहला साइन इन",
  "Or after 15 minutes without activity": "या 15 मिनट निष्क्रिय रहने पर",
  "Password and session dates appear when connected to the server.": "सर्वर से जुड़ने पर पासवर्ड और सत्र की तिथियाँ दिखेंगी।",
  "A 6-digit code from an authenticator app, asked for after your password.": "पासवर्ड के बाद ऑथेंटिकेटर ऐप से 6 अंकों का कोड माँगा जाता है।",
  "On": "चालू",
  "Off": "बंद",
  "Signing in needs your password and a code from your phone, so a stolen password alone can't open your account.": "साइन इन के लिए पासवर्ड और आपके फ़ोन का कोड दोनों चाहिए, इसलिए केवल चोरी हुआ पासवर्ड आपका खाता नहीं खोल सकता।",
  "Add a second step so a stolen password alone can't open your account. Works with Google Authenticator, Microsoft Authenticator, Authy and similar apps.": "दूसरा चरण जोड़ें ताकि केवल चोरी हुआ पासवर्ड आपका खाता न खोल सके। Google Authenticator, Microsoft Authenticator, Authy जैसे ऐप के साथ काम करता है।",
  "Turn on 2-step verification": "दो-चरणीय सत्यापन चालू करें",
  "Turn off 2-step verification": "दो-चरणीय सत्यापन बंद करें",
  "Turn on": "चालू करें",
  "Turn off": "बंद करें",
  "Confirm password": "पासवर्ड की पुष्टि",
  "Add to your app": "ऐप में जोड़ें",
  "Save recovery codes": "रिकवरी कोड सहेजें",
  "Steps": "चरण",
  "2-step verification is on": "दो-चरणीय सत्यापन चालू है",
  "2-step verification is off": "दो-चरणीय सत्यापन बंद है",
  "I've saved my recovery codes": "मैंने अपने रिकवरी कोड सहेज लिए हैं",
  "Confirm it's you with your current password.": "अपने वर्तमान पासवर्ड से पुष्टि करें कि यह आप ही हैं।",
  "Current password": "वर्तमान पासवर्ड",
  "In your authenticator app, add an account and enter this setup key (choose “time-based”). On a phone, the button below opens the app directly.": "अपने ऑथेंटिकेटर ऐप में खाता जोड़ें और यह सेटअप कुंजी दर्ज करें (“समय-आधारित” चुनें)। फ़ोन पर नीचे का बटन सीधे ऐप खोलता है।",
  "Setup key": "सेटअप कुंजी",
  "Setup key copied": "सेटअप कुंजी कॉपी हो गई",
  "Copy key": "कुंजी कॉपी करें",
  "Open in authenticator app": "ऑथेंटिकेटर ऐप में खोलें",
  "6-digit code from the app": "ऐप से 6 अंकों का कोड",
  "Save these recovery codes now — they won't be shown again. Each one signs you in once if you lose your phone.": "ये रिकवरी कोड अभी सहेज लें — ये दोबारा नहीं दिखाए जाएँगे। फ़ोन खो जाने पर हर कोड से एक बार साइन इन किया जा सकता है।",
  "Recovery codes": "रिकवरी कोड",
  "Recovery codes copied": "रिकवरी कोड कॉपी हो गए",
  "Copy all": "सभी कॉपी करें",
  "Download .txt": ".txt डाउनलोड करें",
  "Your account will be protected by your password alone. Confirm with your password and a current code (or a recovery code).": "आपका खाता केवल पासवर्ड से सुरक्षित रहेगा। अपने पासवर्ड और वर्तमान कोड (या रिकवरी कोड) से पुष्टि करें।",
  "Code from the app, or a recovery code": "ऐप का कोड, या रिकवरी कोड",
  "Too weak": "बहुत कमज़ोर",
  "Weak": "कमज़ोर",
  "Fair": "ठीक-ठाक",
  "Good": "अच्छा",
  "Strong": "मज़बूत",
  "Change password": "पासवर्ड बदलें",
  "Changing it signs out every other device.": "इसे बदलने से अन्य सभी डिवाइस साइन आउट हो जाते हैं।",
  "New password": "नया पासवर्ड",
  "Confirm new password": "नए पासवर्ड की पुष्टि करें",
  "The two new passwords don't match": "दोनों नए पासवर्ड मेल नहीं खाते",
  "Password changed": "पासवर्ड बदल गया",
  "Password changed. {n} other device(s) were signed out.": "पासवर्ड बदल गया। {n} अन्य डिवाइस साइन आउट किए गए।",
  "Met:": "पूरा:",
  "Not yet:": "अभी नहीं:",
  "At least 12 characters": "कम से कम 12 अक्षर",
  "An uppercase letter": "एक बड़ा अक्षर (A–Z)",
  "A lowercase letter": "एक छोटा अक्षर (a–z)",
  "A number": "एक अंक",
  "A symbol": "एक चिह्न",
  "Doesn't contain your name or email": "आपका नाम या ईमेल शामिल न हो",
  "Not a common password": "आम पासवर्ड न हो",
  "Different from your current password": "वर्तमान पासवर्ड से अलग हो",
  "Signed-in devices": "साइन इन डिवाइस",
  "Every place your account is signed in right now.": "वे सभी स्थान जहाँ आपका खाता अभी साइन इन है।",
  "Sign out all other devices": "अन्य सभी डिवाइस से साइन आउट करें",
  "Sign out all other devices?": "अन्य सभी डिवाइस से साइन आउट करें?",
  "Everywhere else your account is signed in will need your password again. This device stays signed in.": "जहाँ-जहाँ आपका खाता साइन इन है, वहाँ फिर से पासवर्ड चाहिए होगा। यह डिवाइस साइन इन रहेगा।",
  "Sign out {n} device(s)": "{n} डिवाइस से साइन आउट करें",
  "Signed out {device}": "{device} से साइन आउट किया गया",
  "Signed out {n} other device(s)": "{n} अन्य डिवाइस से साइन आउट किया गया",
  "that device": "उस डिवाइस",
  "This device": "यह डिवाइस",
  "Unknown device": "अज्ञात डिवाइस",
  "Signed in": "साइन इन",
  "Last active": "अंतिम सक्रियता",
  "now": "अभी",
  "No other devices are signed in.": "कोई अन्य डिवाइस साइन इन नहीं है।",
};

const I18N = (() => {
  const out = {};
  Object.entries(I18N_CORE).forEach(([code, joined]) => {
    const vals = joined.split("|");
    if (vals.length !== I18N_KEYS.length) console.warn(`[Sentinel] ${code}: ${vals.length}/${I18N_KEYS.length} strings`); // eslint-disable-line no-console
    out[code] = Object.fromEntries(I18N_KEYS.map((k, i) => [k, vals[i]]));
  });
  Object.assign(out.hi, I18N_HI_EXTRA);
  return out;
})();

/* ------------------------------------------------------------ prefs ------- */
const PREFS_KEY = "sentinel.prefs";
// Fixed: English + Hindi, national view. Only `order` is the official's choice.
const DEFAULT_PREFS = { region: "ALL", lang: "hi", order: "en", onboarded: true };

function readPrefs() {
  let order = "en";
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    if (saved.order === "regional") order = "regional";
  } catch {
    /* private window */
  }
  return { ...DEFAULT_PREFS, order };
}

function applyPrefs(p) {
  const root = document.documentElement;
  root.setAttribute("data-ui-lang", p.lang);
  root.lang = p.order === "regional" && p.lang !== "en" ? p.lang : "en";
  // Load the script's font only when it's actually chosen.
  const L = uiLang(p.lang);
  if (L.font && !document.getElementById(`snt-font-${L.code}`)) {
    const link = document.createElement("link");
    link.id = `snt-font-${L.code}`;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${L.font}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
}
applyPrefs(readPrefs());

function setPrefs(patch) {
  const prev = readPrefs();
  const next = { ...prev, order: patch.order === "regional" ? "regional" : "en" };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* private window: lasts for this tab */
  }
  window.__sentinelPrefs = next;
  applyPrefs(next);
  window.dispatchEvent(new CustomEvent("sentinel:prefs", { detail: next }));
}

function usePrefs() {
  const [p, setP] = useState(readPrefs);
  useEffect(() => {
    const on = (e) => setP(e.detail);
    window.addEventListener("sentinel:prefs", on);
    return () => window.removeEventListener("sentinel:prefs", on);
  }, []);
  return [p, setPrefs];
}

function fill(s, vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : s;
}

/**
 * t(en)   → the string in the primary display language
 * alt(en) → the "other" line: the regional translation under English, or the
 *           English under the regional one. null when there's nothing to add.
 */
function useT() {
  const [p] = usePrefs();
  return useMemo(() => {
    const dict = I18N[p.lang] || {};
    const regionalFirst = p.order === "regional" && p.lang !== "en";
    const tr = (en, vars) => (dict[en] ? fill(dict[en], vars) : null);
    const t = (en, vars) => (regionalFirst ? tr(en, vars) || fill(en, vars) : fill(en, vars));
    const alt = (en, vars) => {
      if (p.lang === "en") return null;
      const x = tr(en, vars);
      if (!x) return null;
      return regionalFirst ? fill(en, vars) : x;
    };
    return { t, alt, tr, prefs: p, regionalFirst, lang: p.lang, altLang: regionalFirst ? "en" : p.lang, mainLang: regionalFirst ? p.lang : "en" };
  }, [p]);
}

/** Script-aware class so each language gets its own Noto face. */
const scriptClass = (code) => (code && code !== "en" ? `snt-script snt-script-${code}` : "");

/**
 * A bilingual label. Block: English on top, regional below (or flipped).
 * Inline: "English · regional". The regional line uses the right font and
 * direction for its script.
 */
function Bi({ en, vars, inline = false, className = "", altClassName = "" }) {
  const { t, alt, altLang, mainLang } = useT();
  const main = t(en, vars);
  const second = alt(en, vars);
  const rtl = (code) => (uiLang(code).rtl ? "rtl" : undefined);
  if (inline) {
    return (
      <span className={className}>
        <span lang={mainLang} dir={rtl(mainLang)} className={scriptClass(mainLang)}>
          {main}
        </span>
        {second && (
          <span lang={altLang} dir={rtl(altLang)} className={`${scriptClass(altLang)} snt-bi-alt ${altClassName}`}>
            {" · "}
            {second}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className={`snt-bi ${className}`}>
      <span lang={mainLang} dir={rtl(mainLang)} className={`block ${scriptClass(mainLang)}`}>
        {main}
      </span>
      {second && (
        <span lang={altLang} dir={rtl(altLang)} className={`snt-bi-alt block ${scriptClass(altLang)} ${altClassName}`}>
          {second}
        </span>
      )}
    </span>
  );
}

const I18N_CSS = `
.snt-script-hi, .snt-script-mr { font-family: 'Noto Sans Devanagari', system-ui, sans-serif; }
.snt-script-bn { font-family: 'Noto Sans Bengali', system-ui, sans-serif; }
.snt-script-te { font-family: 'Noto Sans Telugu', system-ui, sans-serif; }
.snt-script-ta { font-family: 'Noto Sans Tamil', system-ui, sans-serif; }
.snt-script-gu { font-family: 'Noto Sans Gujarati', system-ui, sans-serif; }
.snt-script-ur { font-family: 'Noto Nastaliq Urdu', 'Noto Naskh Arabic', system-ui, sans-serif; line-height: 1.9; }
.snt-script-kn { font-family: 'Noto Sans Kannada', system-ui, sans-serif; }
.snt-script-or { font-family: 'Noto Sans Oriya', system-ui, sans-serif; }
.snt-script-ml { font-family: 'Noto Sans Malayalam', system-ui, sans-serif; }
.snt-script-pa { font-family: 'Noto Sans Gurmukhi', system-ui, sans-serif; }
.snt-bi-alt { opacity: .78; }
/* Regional scripts run longer than English: in "my language first" mode the
   tabs drop their icons on mid-size screens so the bar stays one row. */
@media (min-width: 1280px) {
  .snt-nav-regional .snt-tab > span:first-child { display: none !important; }
  .snt-nav-regional .snt-tab { padding: .45rem .45rem; font-size: 12px; }
  .snt-nav-regional .snt-divider { margin-left: 2px !important; margin-right: 2px !important; }
}
/* "My language first": the regional line leads and is set a touch larger. */
:root[data-ui-lang]:not([data-ui-lang="en"]) .snt-order-regional .snt-bi > span:first-child { font-size: 1.08em; }
/* Decorative Hindi written straight into older labels shows only in Hindi. */
:root:not([data-ui-lang="hi"]) .snt-hi-only { display: none !important; }

.snt-lang-card {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;
  padding: 12px 14px; border-radius: 12px; border: 1.5px solid rgba(11,42,111,.12); background: rgba(255,255,255,.85);
}
.snt-lang-card:hover { border-color: rgba(11,42,111,.35); }
.snt-lang-card[aria-checked="true"] { border-color: #FF9933; background: rgba(255,153,51,.09); box-shadow: 0 0 0 3px rgba(255,153,51,.16); }
.snt-lang-card .snt-lang-native { font-size: 18px; font-weight: 600; color: #0B2A6F; line-height: 1.3; }
.snt-lang-card .snt-lang-en { font-size: 11.5px; color: #6b7590; }
.snt-lang-tag { position: absolute; top: 8px; right: 8px; font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 2px 6px; border-radius: 9999px; }
.snt-region-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; border-radius: 9px; text-align: left; font-size: 13px; }
.snt-region-item:hover { background: rgba(11,42,111,.05); }
.snt-region-item[aria-selected="true"] { background: rgba(255,153,51,.12); color: #0B2A6F; font-weight: 600; box-shadow: inset 3px 0 0 #FF9933; }
.snt-langswitch { display: inline-flex; height: 20px; border-radius: 6px; border: 1px solid rgba(255,255,255,.25); overflow: hidden; }
.snt-langswitch button { padding: 0 8px; font-size: 10.5px; font-weight: 600; color: inherit; opacity: .75; transition: background .2s, opacity .2s; }
.snt-langswitch button:hover { opacity: 1; }
.snt-langswitch button[aria-pressed="true"] { background: rgba(255,255,255,.2); opacity: 1; }
.snt-langbtn-unused { display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,.2); }
.snt-langbtn:hover { border-color: rgba(255,255,255,.45); }
:root[data-theme="dark"] .snt-lang-card { background: #141b2d; border-color: rgba(255,255,255,.1); }
:root[data-theme="dark"] .snt-lang-card .snt-lang-native { color: #c9d6ff; }
:root[data-theme="dark"] .snt-region-item[aria-selected="true"] { color: #ffcf99; }
:root[data-theme="dark"] .snt-region-item:hover { background: rgba(255,255,255,.05); }
:root[data-theme="contrast"] .snt-lang-card { background: #000; border: 2px solid #fff; }
:root[data-theme="contrast"] .snt-lang-card[aria-checked="true"] { border-color: #ffd400; background: #1a1600; }
:root[data-theme="contrast"] .snt-lang-card .snt-lang-native, :root[data-theme="contrast"] .snt-lang-card .snt-lang-en { color: #fff; }
`;

/* ------------------------------------------------ EN | हिन्दी switch ------ */
/** Top strip: which of the two lines leads. Both are always shown. */
function LangOrderSwitch() {
  const [p] = usePrefs();
  const hiFirst = p.order === "regional";
  return (
    <span className="snt-langswitch" role="group" aria-label="Language order · भाषा क्रम">
      <button type="button" aria-pressed={!hiFirst} onClick={() => setPrefs({ order: "en" })} title="English first">
        EN
      </button>
      <button type="button" aria-pressed={hiFirst} onClick={() => setPrefs({ order: "regional" })} className="snt-script-hi" lang="hi" title="हिन्दी पहले">
        हिन्दी
      </button>
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §13d  INSPECTORS — directory, assigned inspector, Connect with Inspector
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Inspectors don't sign in to Sentinel. Officials see who is assigned where,
 * and reach them through "Connect with Inspector" — messaging first, because
 * a written, timestamped thread is what an official needs on record. Voice and
 * video calling is planned for later.
 *
 * One shared directory store, so the nav badge, the institute page, the draw
 * cards and the drawer all read the same data without fetching it four times.
 */
const INSPECTOR_STATUS = {
  available: { label: "Available", tone: "good", dot: "#16a34a" },
  on_site: { label: "On site", tone: "watch", dot: "#f59e0b" },
  offline: { label: "Offline", tone: "neutral", dot: "#9aa4bd" },
};
const inspectorStatus = (s) => INSPECTOR_STATUS[s] || INSPECTOR_STATUS.offline;

const MSG_KIND = {
  message: { label: "Message" },
  instruction: { label: "Instruction" },
  update_request: { label: "Update request" },
};

const QUICK_MESSAGES = [
  { kind: "update_request", text: "Please share a status update on this site." },
  { kind: "instruction", text: "Please visit this site today and verify the open alerts." },
  { kind: "instruction", text: "Please upload photo evidence from your visit through the field app." },
  { kind: "update_request", text: "Has the inspection report been filed? Please confirm." },
  { kind: "instruction", text: "Please check the CCTV feeds reported offline at this site." },
];

const inspectorStore = { data: null, loading: false, error: "", unavailable: false, at: 0, subs: new Set() };
// Names, sites and message previews: gone the moment the official signs out.
onSessionEnd(() => {
  Object.assign(inspectorStore, { data: null, loading: false, error: "", unavailable: false, at: 0 });
  notifyInspectors();
});
function notifyInspectors() {
  inspectorStore.subs.forEach((f) => f({ ...inspectorStore }));
}
async function loadInspectors(force = false) {
  if (inspectorStore.loading) return;
  if (!force && inspectorStore.data && Date.now() - inspectorStore.at < 30000) return;
  inspectorStore.loading = true;
  notifyInspectors();
  try {
    const { data } = await api.get(API.inspectors.list());
    if (!getSession()) return; // signed out while this was in flight
    Object.assign(inspectorStore, { data: data || [], error: "", unavailable: false, at: Date.now() });
  } catch (err) {
    if (isMissingEndpoint(err)) Object.assign(inspectorStore, { data: [], unavailable: true, at: Date.now() });
    else Object.assign(inspectorStore, { error: errorMessage(err, "Couldn't load inspectors"), at: Date.now() });
  } finally {
    inspectorStore.loading = false;
    notifyInspectors();
  }
}

function useInspectors({ enabled = true } = {}) {
  const [s, setS] = useState({ ...inspectorStore });
  useEffect(() => {
    if (!enabled) return undefined;
    inspectorStore.subs.add(setS);
    loadInspectors();
    // Kept fresh by the app-wide auto-refresh (§8), like every other panel.
    const again = () => loadInspectors(true);
    window.addEventListener("sentinel:refresh", again);
    return () => {
      inspectorStore.subs.delete(setS);
      window.removeEventListener("sentinel:refresh", again);
    };
  }, [enabled]);
  return useMemo(() => {
    const list = s.data || [];
    const index = byId(list);
    const byInstitute = new Map();
    list.forEach((i) => (i.assigned_institute_ids || []).forEach((id) => byInstitute.set(id, i)));
    return {
      list,
      index,
      byInstitute,
      unread: list.reduce((a, i) => a + (i.unread || 0), 0),
      loading: s.loading && !s.data,
      error: s.error,
      unavailable: s.unavailable,
      reload: () => loadInspectors(true),
    };
  }, [s]);
}

/** Anywhere in the app: openConnect(inspectorId, instituteId?) */
const openConnect = (inspectorId, instituteId = null) =>
  window.dispatchEvent(new CustomEvent("sentinel:connect", { detail: { inspectorId, instituteId } }));

function StatusDotLive({ status, size = 9 }) {
  const st = inspectorStatus(status);
  return (
    <span className="relative inline-flex" style={{ width: size, height: size }} aria-hidden="true">
      {status !== "offline" && <span className="absolute inset-0 animate-ping rounded-full opacity-40" style={{ background: st.dot }} />}
      <span className="relative inline-block rounded-full" style={{ width: size, height: size, background: st.dot, boxShadow: "0 0 0 2px var(--snt-ring, #fff)" }} />
    </span>
  );
}

function InspectorAvatar({ name, status, size = 40 }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span className="snt-avatar" style={{ width: size, height: size, fontSize: size * 0.32 }}>
        {initials(name)}
      </span>
      <span className="absolute -bottom-0.5 -right-0.5">
        <StatusDotLive status={status} size={Math.max(8, size * 0.24)} />
      </span>
    </span>
  );
}

function InspectorStatusText({ inspector }) {
  const { t } = useT();
  const st = inspectorStatus(inspector.status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <StatusDotLive status={inspector.status} size={7} />
      <span className="font-medium">{t(st.label)}</span>
      {inspector.status === "offline" && inspector.last_seen_at && <span className="text-ink-muted">· {t("Last seen")} {relativeTime(inspector.last_seen_at)}</span>}
    </span>
  );
}

/** The card on an institute's page: who is responsible, and how to reach them. */
function AssignedInspectorCard({ institute }) {
  const { role } = useAuth();
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;
  const dir = useInspectors({ enabled: isDecider });
  const { t } = useT();
  if (!isDecider) return null;
  const insp = dir.byInstitute.get(institute.id);
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            <Bi en="Assigned inspector" inline altClassName="normal-case tracking-normal font-normal" />
          </p>
          {dir.loading ? (
            <Skeleton className="mt-2 h-10 w-64" />
          ) : dir.unavailable ? (
            <p className="mt-1 text-sm text-ink-muted">The inspector directory isn't available from the backend yet (GET /api/v1/inspectors).</p>
          ) : !insp ? (
            <p className="mt-1 text-sm text-ink-muted">No inspector is assigned to this site yet. Run the draw to assign one.</p>
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <InspectorAvatar name={insp.name} status={insp.status} size={42} />
              <div className="min-w-0">
                <p className="truncate font-display text-base leading-tight">{insp.name}</p>
                <p className="truncate text-xs text-ink-muted">
                  {insp.designation} · {insp.employee_id} · {insp.district}
                </p>
                <div className="mt-0.5">
                  <InspectorStatusText inspector={insp} />
                </div>
              </div>
            </div>
          )}
        </div>
        {insp && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Button variant="primary" onClick={() => openConnect(insp.id, institute.id)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M2.5 3.5h11v7.5H6.5L3.5 13.5v-2.5h-1z" strokeLinejoin="round" />
              </svg>
              {t("Connect with Inspector")}
              {insp.unread > 0 && <span className="snt-pill-count tnum">{insp.unread}</span>}
            </Button>
            <p className="text-[11px] text-ink-muted">
              {t("Responsible for")} {insp.assigned_institute_ids.length} site{insp.assigned_institute_ids.length === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Compact version for the draw cards. */
function InspectorInline({ inspectorId, instituteId }) {
  const dir = useInspectors();
  const { t } = useT();
  const insp = dir.index.get(inspectorId);
  if (!insp) return <p className="font-mono text-xs">{shortId(inspectorId)}</p>;
  return (
    <div className="flex items-center gap-2">
      <InspectorAvatar name={insp.name} status={insp.status} size={26} />
      <div className="min-w-0">
        <p className="truncate text-sm leading-tight">{insp.name}</p>
        <button type="button" onClick={() => openConnect(insp.id, instituteId)} className="text-[11px] font-semibold text-[#c26a00] hover:underline">
          {t("Connect with Inspector")} →
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- the drawer ----- */
function dayLabel(iso) {
  const d = parseDate(iso);
  if (!d) return "";
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Ticks({ status }) {
  const { t } = useT();
  const read = status === "read";
  const title = t(status === "read" ? "Read" : status === "delivered" ? "Delivered" : "Sent");
  return (
    <span title={title} aria-label={title} className={`inline-flex ${read ? "text-[#38bdf8]" : "opacity-70"}`}>
      <svg width={status === "sent" ? 11 : 15} height="11" viewBox={status === "sent" ? "0 0 11 11" : "0 0 15 11"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 6l3 3 6-7" />
        {status !== "sent" && <path d="M6.5 8.5l.5.5 6-7" />}
      </svg>
    </span>
  );
}

function ConnectDrawer() {
  const { role } = useAuth();
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;
  const dir = useInspectors({ enabled: isDecider });
  const toast = useToast();
  const { t, alt } = useT();
  const [state, setState] = useState(null); // {inspectorId, instituteId}
  const [tab, setTab] = useState("messages");
  const [siteFilter, setSiteFilter] = useState("all");
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("message");
  const [urgent, setUrgent] = useState(false);
  const [sending, setSending] = useState(false);
  const [missing, setMissing] = useState(false);
  const listRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const on = (e) => {
      setState(e.detail);
      setTab("messages");
      setSiteFilter(e.detail.instituteId || "all");
      setMsgs(null);
      setMissing(false);
      setText("");
      setKind("message");
      setUrgent(false);
    };
    window.addEventListener("sentinel:connect", on);
    return () => window.removeEventListener("sentinel:connect", on);
  }, []);

  const open = Boolean(state);
  const insp = state ? dir.index.get(state.inspectorId) : null;
  const instIndex = useApi(API.institutes.list(), { fallback: [], skip: !open });
  const sites = (insp?.assigned_institute_ids || []).map((id) => (instIndex.data || []).find((i) => i.id === id)).filter(Boolean);
  const context = state?.instituteId ? (instIndex.data || []).find((i) => i.id === state.instituteId) : null;

  const load = useCallback(
    async (quiet = false) => {
      if (!state) return;
      try {
        const { data } = await api.get(API.inspectors.messages(state.inspectorId));
        setMsgs(data || []);
        setMissing(false);
      } catch (err) {
        if (isMissingEndpoint(err)) setMissing(true);
        else if (!quiet) toast.error(errorMessage(err, "Couldn't load messages"));
        setMsgs((m) => m || []);
      }
    },
    [state, toast]
  );

  // Open: load, mark read, then poll while the drawer stays open.
  useEffect(() => {
    if (!open) return undefined;
    load();
    api.post(API.inspectors.markRead(state.inspectorId)).then(() => loadInspectors(true)).catch(() => {});
    const id = setInterval(() => load(true), 4000);
    return () => clearInterval(id);
  }, [open, state, load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, siteFilter, tab]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setState(null);
    document.addEventListener("keydown", onKey);
    setTimeout(() => boxRef.current?.focus(), 200);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(API.inspectors.messages(state.inspectorId), {
        body,
        kind,
        priority: urgent ? "urgent" : "normal",
        institute_id: siteFilter !== "all" ? siteFilter : state.instituteId,
      });
      setMsgs((m) => [...(m || []), data]);
      setText("");
      setUrgent(false);
      setKind("message");
      loadInspectors(true);
    } catch (err) {
      toast.error(isMissingEndpoint(err) ? "Messaging isn't wired on the backend yet — POST /inspectors/{id}/messages" : errorMessage(err, "Message not sent"));
    } finally {
      setSending(false);
    }
  }

  if (!open || !isDecider) return null;

  const shown = (msgs || []).filter((m) => siteFilter === "all" || m.institute_id === siteFilter);
  let lastDay = "";
  const siteName = (id) => (instIndex.data || []).find((i) => i.id === id)?.name;
  const awaitingReply = shown.length > 0 && shown[shown.length - 1].direction === "to_inspector" && shown[shown.length - 1].status === "read";

  return (
    <div className="fixed inset-0 z-[1900]" role="dialog" aria-modal="true" aria-label="Connect with Inspector">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setState(null)} aria-hidden="true" />
      <aside className="snt-drawer absolute bottom-0 right-0 top-0 flex w-full max-w-[30rem] flex-col animate-fade-up">
        {/* Who */}
        <header className="snt-yukt-head">
          {insp ? <InspectorAvatar name={insp.name} status={insp.status} size={40} /> : <span className="snt-avatar">…</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-white">{insp?.name || "Inspector"}</p>
            <p className="truncate text-[11px] text-white/70">
              {insp ? `${insp.designation} · ${insp.district}` : "Loading…"}
            </p>
            {insp && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/85">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: inspectorStatus(insp.status).dot }} />
                {t(inspectorStatus(insp.status).label)}
                {insp.status === "offline" && ` · ${t("Last seen")} ${relativeTime(insp.last_seen_at)}`}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setState(null)} className="snt-yukt-iconbtn" aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="snt-tricolour" style={{ height: 3 }} />

        {/* Where */}
        <div className="border-b border-paper-line px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div role="tablist" className="snt-quick">
              {["messages", "details"].map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
                  {t(k === "messages" ? "Messages" : "Details")}
                </button>
              ))}
            </div>
            {tab === "messages" && sites.length > 0 && (
              <label className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
                <span className="shrink-0">{t("Regarding")}</span>
                <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="min-w-0 max-w-[12rem] truncate rounded-md border border-paper-line bg-paper-raised px-2 py-1 text-xs text-ink">
                  <option value="all">{t("All sites")}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {insp?.status === "offline" && tab === "messages" && (
            <p className="mt-2 rounded-md bg-signal-watch-soft px-2.5 py-1.5 text-[11.5px] text-ink/80">
              {insp.name.split(" ")[0]} is offline. Messages will be queued and delivered when their device reconnects.
            </p>
          )}
        </div>

        {tab === "messages" ? (
          <>
            <div ref={listRef} className="snt-yukt-list scroll-area" aria-live="polite">
              {msgs === null ? (
                <SkeletonRows rows={3} height="h-12" />
              ) : missing ? (
                <NotWiredState what="Inspector messaging" path="GET /api/v1/inspectors/{id}/messages" />
              ) : shown.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="font-display text-base">{t("No messages yet")}</p>
                  <p className="mt-1 text-xs text-ink-muted">Start the conversation — every message is timestamped and kept on record.</p>
                </div>
              ) : (
                shown.map((m) => {
                  const mine = m.direction === "to_inspector";
                  const day = dayLabel(m.created_at);
                  const sep = day !== lastDay;
                  lastDay = day;
                  return (
                    <Fragment key={m.id}>
                      {sep && (
                        <p className="my-1 text-center">
                          <span className="rounded-full bg-ink/[0.05] px-2.5 py-0.5 text-[10.5px] font-medium text-ink-muted">{day}</span>
                        </p>
                      )}
                      <div className={`snt-yukt-msg ${mine ? "is-user" : "is-bot"}`}>
                        <div className={`max-w-[85%] ${mine ? "text-right" : ""}`}>
                          {(m.kind !== "message" || m.priority === "urgent") && (
                            <div className={`mb-1 flex gap-1 ${mine ? "justify-end" : ""}`}>
                              {m.priority === "urgent" && <span className="rounded bg-signal-flag px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white">{t("Urgent")}</span>}
                              {m.kind !== "message" && <span className="rounded bg-[#0B2A6F]/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#0B2A6F]">{t(MSG_KIND[m.kind]?.label || "Message")}</span>}
                            </div>
                          )}
                          <div className="snt-yukt-bubble text-left">{m.body}</div>
                          <div className={`mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-muted ${mine ? "justify-end" : ""}`}>
                            {!mine && <span className="font-medium">{m.sender_name}</span>}
                            {m.institute_id && siteFilter === "all" && siteName(m.institute_id) && <span className="truncate">· {siteName(m.institute_id)}</span>}
                            <span>{formatDateTime(m.created_at).split(", ").pop()}</span>
                            {mine && <Ticks status={m.status} />}
                          </div>
                        </div>
                      </div>
                    </Fragment>
                  );
                })
              )}
              {awaitingReply && insp?.status !== "offline" && (
                <div className="snt-yukt-msg is-bot">
                  <div className="snt-yukt-bubble snt-yukt-typing" aria-label={`${insp?.name} has read your message`}>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
            </div>

            {/* Compose */}
            <div className="border-t border-paper-line px-3 pb-3 pt-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {Object.entries(MSG_KIND).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={`snt-chip-btn ${kind === k ? "is-on" : ""}`} aria-pressed={kind === k}>
                    {t(v.label)}
                  </button>
                ))}
                <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px] font-medium">
                  <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                  <span className={urgent ? "text-signal-flag" : "text-ink-muted"}>{t("Urgent")}</span>
                </label>
              </div>
              <details className="mb-2">
                <summary className="cursor-pointer text-[11.5px] font-medium text-ink-muted">{t("Quick messages")}</summary>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {QUICK_MESSAGES.map((q) => (
                    <button
                      key={q.text}
                      type="button"
                      className="snt-yukt-suggest text-left"
                      onClick={() => {
                        setText(q.text);
                        setKind(q.kind);
                        boxRef.current?.focus();
                      }}
                    >
                      {q.text}
                    </button>
                  ))}
                </div>
              </details>
              <div className="snt-yukt-input !mx-0 items-end">
                <textarea
                  ref={boxRef}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 2000))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  placeholder={t("Type a message…")}
                  aria-label="Message"
                  className="min-h-[2.6rem] flex-1 resize-none border-0 bg-transparent py-1.5 text-[13px] outline-none"
                />
                <button type="button" className="snt-yukt-send mb-0.5" disabled={!text.trim() || sending} onClick={send} aria-label={t("Send message")} title={t("Send message")}>
                  {sending ? (
                    <Spinner />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M2.5 8h10M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-ink-muted">
                <span>Enter to send · Shift+Enter for a new line</span>
                <span className="tnum">{text.length}/2000</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 rounded-md bg-ink/[0.03] px-2.5 py-1.5 text-[10.5px] text-ink-muted">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
                  <path d="M10.5 7l4-2.5v7l-4-2.5" strokeLinejoin="round" />
                </svg>
                {t("Voice and video")}: planned for later. Messages are the record for now.
              </p>
            </div>
          </>
        ) : (
          <div className="scroll-area flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {insp && (
              <>
                <KeyValue
                  items={[
                    { label: "Designation", value: insp.designation },
                    { label: "Employee ID", value: insp.employee_id, mono: true },
                    { label: "District", value: `${insp.district}, ${insp.state}` },
                    { label: "Contact", value: insp.phone_masked || "—", mono: true },
                    { label: "Status", value: t(inspectorStatus(insp.status).label) },
                    { label: "Last active", value: relativeTime(insp.last_seen_at) },
                  ]}
                />
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                    {t("Responsible for")} · {sites.length} site{sites.length === 1 ? "" : "s"}
                  </p>
                  <ul className="space-y-1.5">
                    {sites.map((s) => {
                      const st = instituteStatus(s.status);
                      return (
                        <li key={s.id}>
                          <Link to={`/institutes/${s.id}`} onClick={() => setState(null)} className="snt-yukt-card">
                            <span className={`mt-0.5 flex ${tone(st.tone).text}`}>
                              <StatusGlyph kind={st.glyph} />
                            </span>
                            <span className="min-w-0">
                              <span className="snt-navy block truncate text-[12.5px] font-medium">{s.name}</span>
                              <span className="block truncate text-[11px] text-[#6b7590]">
                                {instituteType(s.type)} · {s.district} · {formatScore(s.compliance_score)}/100
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Assignments come from the cryptographic draw. Messages sent here reach the inspector's field app and are kept,
                  with delivery and read times, in the audit trail.
                </p>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §30  PAGE: Inspectors (field team)
   ══════════════════════════════════════════════════════════════════════════ */

function Inspectors() {
  const dir = useInspectors();
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const { t } = useT();
  const instIndex = useMemo(() => byId(institutes.data || []), [institutes.data]);
  const rows = dir.list;

  const fields = useMemo(
    () => [
      { key: "name", label: "Name", type: "text" },
      { key: "status", label: "Status", type: "enum", options: Object.entries(INSPECTOR_STATUS).map(([value, v]) => ({ value, label: v.label })) },
      { key: "district", label: "District", type: "enum" },
      { key: "state", label: "State", type: "enum" },
      { key: "sites", label: "Sites", type: "number", get: (r) => (r.assigned_institute_ids || []).length, searchable: false },
      { key: "unread", label: "Unread", type: "number", searchable: false },
      { key: "last", label: "Last message", type: "date", get: (r) => r.last_message?.created_at },
    ],
    []
  );
  const view = useDataView(rows, {
    fields,
    storageKey: "inspectors",
    initial: { sort: [{ key: "unread", dir: "desc" }, { key: "last", dir: "desc" }] },
    presets: [
      { name: "Unread first", hint: "Replies waiting for you", state: { sort: [{ key: "unread", dir: "desc" }, { key: "last", dir: "desc" }] } },
      { name: "Available now", hint: "Reachable right away", state: { facets: { status: ["available", "on_site"] }, sort: [{ key: "name", dir: "asc" }] } },
      { name: "By district", hint: "Grouped by district", state: { groupBy: "district", sort: [{ key: "name", dir: "asc" }] } },
    ],
  });
  const counts = { available: 0, on_site: 0, offline: 0 };
  rows.forEach((r) => (counts[r.status] = (counts[r.status] || 0) + 1));

  return (
    <Page>
      <PageHeader
        title="Inspectors"
        lede="The field team for your region: who is assigned to which sites, whether they're reachable right now, and the message thread with each. Inspectors work from the field app; you reach them from here."
      >
        <Button variant="secondary" size="sm" onClick={dir.reload}>
          {t("Refresh")}
        </Button>
      </PageHeader>

      {dir.error && <ErrorState message={dir.error} onRetry={dir.reload} />}

      {dir.unavailable ? (
        <NotWiredState what="The inspector directory" path="GET /api/v1/inspectors" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["available", "Available", "good"],
              ["on_site", "On site", "watch"],
              ["offline", "Offline", "neutral"],
            ].map(([k, label, toneName]) => (
              <button key={k} type="button" className="card snt-glass px-4 py-3.5 text-left" onClick={() => view.apply({ facets: { status: [k] }, sort: [{ key: "name", dir: "asc" }] })}>
                <p className="text-2xs uppercase tracking-wider text-ink-muted">
                  <Bi en={label} inline altClassName="normal-case tracking-normal" />
                </p>
                <p className={`mt-1 flex items-center gap-2 ${tone(toneName).text}`}>
                  <StatusDotLive status={k} size={9} />
                  <span className="tnum font-display text-3xl font-medium leading-none">{counts[k] || 0}</span>
                </p>
              </button>
            ))}
            <div className="card px-4 py-3.5">
              <p className="text-2xs uppercase tracking-wider text-ink-muted">
                <Bi en="Unread" inline altClassName="normal-case tracking-normal" />
              </p>
              <p className={`mt-1 tnum font-display text-3xl font-medium leading-none ${dir.unread ? "text-signal-watch" : ""}`}>{dir.unread}</p>
            </div>
          </div>

          <DataToolbar view={view} quick="status" searchPlaceholder="Search name, district…" exportName="sentinel-inspectors" />

          {dir.loading ? (
            <SkeletonRows rows={3} height="h-28" />
          ) : view.result.length === 0 ? (
            <EmptyState title={rows.length ? "No inspectors match these filters" : "No inspectors yet"} body={rows.length ? "Loosen a filter above." : "Change the region from the top bar to see another jurisdiction."} />
          ) : (
            <GroupedList view={view}>
              {(list) => (
                <ul className="grid gap-3 md:grid-cols-2">
                  {list.map((insp) => {
                    const sites = (insp.assigned_institute_ids || []).map((id) => instIndex.get(id)).filter(Boolean);
                    return (
                      <li key={insp.id}>
                        <Card as="article" className="flex h-full flex-col p-4">
                          <div className="flex items-start gap-3">
                            <InspectorAvatar name={insp.name} status={insp.status} size={44} />
                            <div className="min-w-0 flex-1">
                              <h2 className="truncate font-display text-base leading-tight">{insp.name}</h2>
                              <p className="truncate text-xs text-ink-muted">
                                {insp.designation} · {insp.employee_id}
                              </p>
                              <div className="mt-1">
                                <InspectorStatusText inspector={insp} />
                              </div>
                            </div>
                            {insp.unread > 0 && (
                              <span className="rounded-full bg-signal-watch-soft px-2 py-0.5 text-[11px] font-semibold text-signal-watch">
                                {insp.unread} {t("Unread").toLowerCase()}
                              </span>
                            )}
                          </div>

                          <div className="mt-3">
                            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                              {t("Responsible for")} · {insp.district}
                            </p>
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                              {sites.map((s) => (
                                <li key={s.id}>
                                  <Link to={`/institutes/${s.id}`} className="snt-chip hover:underline">
                                    {s.name}
                                  </Link>
                                </li>
                              ))}
                              {!sites.length && <li className="text-xs text-ink-muted">No sites in this region</li>}
                            </ul>
                          </div>

                          {insp.last_message && (
                            <p className="mt-3 line-clamp-2 rounded-md bg-ink/[0.03] px-3 py-2 text-xs text-ink/75">
                              <span className="font-semibold">{insp.last_message.direction === "to_inspector" ? "You" : insp.name.split(" ")[0]}:</span> {insp.last_message.body}
                              <span className="ml-1 text-ink-muted">· {relativeTime(insp.last_message.created_at)}</span>
                            </p>
                          )}

                          <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                            <span className="text-[11px] text-ink-muted">
                              {t("Last seen")} {relativeTime(insp.last_seen_at)}
                            </span>
                            <Button size="sm" variant="primary" onClick={() => openConnect(insp.id, sites[0]?.id || null)}>
                              {t("Connect with Inspector")}
                            </Button>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </GroupedList>
          )}
        </>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------- brand ------ */
function Brand({ compact = false }) {
  return (
    <Link to="/" className="snt-brand flex min-w-0 items-center gap-3" aria-label="Sentinel — home">
      <span className="snt-emblem">
        <AshokaChakra size={30} className="snt-spin" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="snt-navy font-display text-[17px] font-semibold tracking-[-0.01em]">
            Sentinel
          </span>
          <span className="snt-hi snt-saffron-text hidden text-[13px] font-semibold sm:inline">
            प्रहरी
          </span>
        </span>
        {!compact && (
          <span className="mt-0.5 block truncate text-[10.5px] uppercase tracking-[0.12em] text-[#6b7590] lg:hidden min-[1600px]:block">
            Dept. of Social Justice &amp; Empowerment
          </span>
        )}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------- tabs ------- */
function NavTab({ item, badge = 0 }) {
  const { to, label, icon: Icon, end } = item;
  const { t, alt, prefs } = useT();
  return (
    <NavLink
      to={to}
      end={end}
      title={[label, alt(label)].filter(Boolean).join(" · ")}
      className={({ isActive }) => `snt-tab snt-glass ${isActive ? "is-active" : ""} ${prefs.order === "regional" ? "snt-order-regional" : ""}`}
    >
      {/* lg: icon only · xl: words only · 1400px+: icon and words */}
      <span className="relative flex xl:hidden min-[1400px]:flex">
        <Icon />
        {badge > 0 && <span className="snt-badge-count tnum" style={{ top: -6, right: -8 }}>{badge}</span>}
      </span>
      <span className="hidden xl:block">
        <Bi en={label} altClassName="snt-tab-hi" />
      </span>
      {badge > 0 && (
        <span className="hidden xl:inline min-[1400px]:hidden">
          <span className="snt-pill-count tnum">{badge}</span>
        </span>
      )}
    </NavLink>
  );
}

/** A group shown as one tab that drops down its pages (used for Assess). */
function NavMenu({ group }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const location = useLocation();
  const active = group.items.some((i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`));
  const Icon = group.icon;
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={group.label}
        className={`snt-tab snt-glass ${active ? "is-active" : ""}`}
      >
        <span className="flex xl:hidden min-[1400px]:flex">
          <Icon />
        </span>
        <span className="hidden text-left xl:flex xl:items-center xl:gap-1">
          <Bi en={group.label} altClassName="snt-tab-hi" />
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" style={{ width: 10, height: 10 }}>
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div role="menu" className="snt-pop p-1.5" style={{ minWidth: 270 }}>
          {group.items.map(({ to, label, hi, icon: ItemIcon, desc }) => (
            <NavLink key={to} to={to} role="menuitem" className={({ isActive }) => `snt-menu-item ${isActive ? "is-active" : ""}`}>
              <ItemIcon />
              <span className="min-w-0 flex-1">
                <Bi en={label} inline altClassName="text-[10.5px] font-normal opacity-70" />
                {desc && <span className="block text-[11px] font-normal text-[#8a93a8]">{desc}</span>}
              </span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

/** Closes a popover when the user clicks elsewhere or presses Escape. */
function useDismiss(open, setOpen) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
  return ref;
}

function UserMenu() {
  const { user, logout, role } = useAuth();
  const demoData = useDemoFallback();
  const { t, prefs } = useT();
  const [themeMode] = useThemeMode();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2"
      >
        <span className="snt-avatar">{initials(user?.name)}</span>
        <span className="hidden text-left leading-tight min-[1700px]:block">
          <span className="snt-navy block max-w-[9rem] truncate text-[12.5px] font-semibold">
            {user?.name}
          </span>
          <span className="block text-[10.5px] text-[#6b7590]">{ROLE_LABEL[role] || role}</span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="hidden text-[#6b7590] sm:block">
          <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="snt-pop p-2" style={{ minWidth: 290 }}>
          {/* Account */}
          <div className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
            <span className="snt-avatar">{initials(user?.name)}</span>
            <div className="min-w-0">
              <p className="snt-navy truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-[11px] text-[#6b7590]">{user?.email}</p>
            </div>
          </div>
          <div className="mx-2.5 mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#0B2A6F]/[0.08] px-2 py-0.5 text-[10.5px] font-semibold text-[#0B2A6F]">{ROLE_LABEL[role] || role}</span>
            {demoData && <span className="rounded-full bg-signal-watch-soft px-2 py-0.5 text-[10.5px] font-semibold text-signal-watch">Mock data</span>}
          </div>

          {/* Preferences */}
          <MenuSection title="Preferences">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <span className="text-[12.5px]">{t("Display mode")}</span>
              <span className="flex gap-1">
                {THEME_MODES.map((m) => (
                  <button key={m.key} type="button" onClick={() => setThemeMode(m.key)} aria-pressed={themeMode === m.key} className={`snt-chip-btn ${themeMode === m.key ? "is-on" : ""}`}>
                    {m.key === "contrast" ? "Contrast" : m.label}
                  </button>
                ))}
              </span>
            </div>
          </MenuSection>

          {/* Account security */}
          <MenuSection title="Account">
            <MenuItem
              icon={<path d="M8 1.8l5 1.9v3.8c0 3.1-2.1 5.6-5 6.7-2.9-1.1-5-3.6-5-6.7V3.7l5-1.9zM6 8l1.5 1.5L10.3 6.6" />}
              label={t("Security")}
              hint={t("Password, 2-step verification, devices")}
              to="/security"
              onClick={() => setOpen(false)}
            />
          </MenuSection>

          {/* Help */}
          <MenuSection title="Help">
            <MenuItem
              icon={<path d="M8 2.5a1.3 1.3 0 110 2.6 1.3 1.3 0 010-2.6zM3.5 6.5l4.5 1 4.5-1M8 7.5v3M6 14l2-3.5 2 3.5" />}
              label={t("Accessibility")}
              hint="Screen readers, contrast, text size"
              to="/accessibility"
              onClick={() => setOpen(false)}
            />
          </MenuSection>

          <div className="my-1 h-px bg-[#0B2A6F]/10" />
          <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[#b42318]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <Bi en="Sign out" inline altClassName="text-[12px] opacity-80" />
          </button>
        </div>
      )}
    </div>
  );
}

function MenuSection({ title, children }) {
  const { t, alt } = useT();
  return (
    <div className="border-t border-[#0B2A6F]/10 pt-1.5 pb-1">
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a93a8]">
        {t(title)}
        {alt(title) && <span className="normal-case tracking-normal"> · {alt(title)}</span>}
      </p>
      {children}
    </div>
  );
}

function MenuItem({ icon, label, hint, onClick, to }) {
  const inner = (
    <>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[#6b7590]">
        {icon}
      </svg>
      <span className="min-w-0">
        <span className="block text-[12.5px]">{label}</span>
        {hint && <span className="block truncate text-[10.5px] text-[#8a93a8]">{hint}</span>}
      </span>
    </>
  );
  const cls = "snt-menu-item w-full text-left";
  return to ? (
    <Link to={to} role="menuitem" onClick={onClick} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" role="menuitem" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function AlertBell({ count }) {
  return (
    <Link
      to="/alerts"
      className="snt-glass relative grid h-9 w-9 place-items-center rounded-full border border-[#0B2A6F]/10 bg-white/70 text-[#0B2A6F]"
      aria-label={count ? `${count} open alerts` : "Alerts"}
      title={count ? `${count} open alerts` : "No open alerts"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M6 9a6 6 0 1112 0c0 5 2 6.5 2 6.5H4S6 14 6 9z" strokeLinejoin="round" />
        <path d="M10 19a2 2 0 004 0" strokeLinecap="round" />
      </svg>
      {count > 0 && <span className="snt-badge-count tnum">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}

/** Below `lg` the tabs fold into a menu button that drops a grouped panel. */
function MobileMenu({ groups }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div ref={ref} className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Menu"
        className="grid h-9 w-9 place-items-center rounded-lg border border-[#0B2A6F]/12 bg-white/70 text-[#0B2A6F]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
        </svg>
      </button>
      {open && (
        <div className="snt-pop max-h-[70vh] overflow-y-auto p-3" style={{ left: 12, right: 12, top: "calc(100% + 4px)" }}>
          {groups.map((g) => (
            <div key={g.label} className="mb-2 last:mb-0">
              <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a93a8]">
                <Bi en={g.label} inline altClassName="normal-case tracking-normal" />
              </p>
              <div className="grid grid-cols-2 gap-1">
                {g.items.map(({ to, label, hi, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `snt-tab snt-glass ${isActive ? "is-active" : ""}`}
                  >
                    <Icon />
                    <Bi en={label} altClassName="snt-tab-hi" />
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Masthead({ openAlerts }) {
  const { role } = useAuth();
  const groups = visibleGroups(role);
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;
  const inspectorUnread = useInspectors({ enabled: isDecider }).unread;
  const { regionalFirst } = useT();

  return (
    <header className="snt-masthead">
      <div className="relative mx-auto flex h-[62px] max-w-[1600px] items-center gap-3 px-3 sm:gap-4 sm:px-6">
        <Brand />

        {/* Tabs sit on the right, as on most Indian government portals. */}
        <nav aria-label="Main" className={`snt-nav ml-auto hidden min-w-0 items-center gap-1 py-1 lg:flex ${regionalFirst ? "snt-nav-regional" : ""}`}>
          {groups.map((g, gi) => (
            <div key={g.label} className="flex items-center gap-0.5">
              {gi > 0 && <span className="snt-divider mx-1.5" aria-hidden="true" />}
              <span className="sr-only">{g.label}</span>
              {g.menu ? <NavMenu group={g} /> : g.items.map((item) => <NavTab key={item.to} item={item} badge={item.badge === "inspectors" ? inspectorUnread : 0} />)}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-2">
          <AlertBell count={openAlerts} />
          <span className="snt-divider hidden lg:block" aria-hidden="true" />
          <UserMenu />
          <MobileMenu groups={groups} />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------ live signals ------ */
/**
 * What the ticker and the bell read. Fetched once by the shell (which no longer
 * remounts on navigation) and kept fresh by the auto-refresh in §8 — which
 * also answers "sentinel:refresh" from anything that changes data (e.g. an
 * action taken through Yukt), so the ticker, bell and Yukt update at once.
 */
function useShellSignals() {
  const summary = useApi(API.analytics.complianceSummary());
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const alerts = useApi(API.alerts.list(), { fallback: [] });
  const cameras = useApi(API.cameras.list(), { fallback: [] });

  const insts = useMemo(() => institutes.data || [], [institutes.data]);
  const instituteIndex = useMemo(() => byId(insts), [insts]);
  const open = useMemo(() => (alerts.data || []).filter((a) => a.status === "open"), [alerts.data]);
  const dark = useMemo(() => darkCameras(cameras.data || []), [cameras.data]);
  // Stamped when the data actually lands, not on every render.
  const updatedAt = useMemo(() => new Date(), [alerts.data, institutes.data, cameras.data, summary.data]);

  return {
    ready: !institutes.loading && !alerts.loading,
    summary: summary.data,
    institutes: insts,
    instituteIndex,
    openAlerts: open,
    dark,
    updatedAt,
  };
}

/* ------------------------------------------------------ the ticker -------- */
const TICKER_STANDING = [
  { tag: "info", text: "Surprise inspections are drawn by a cryptographic lottery — no institute can predict its turn" },
  { tag: "info", text: "Every photo and video is SHA-256 sealed on the inspector's device and re-verified on arrival" },
  { tag: "green", text: "Beneficiaries can raise grievances directly through Setu — staff cannot see or block them" },
  { tag: "info", text: "Anomaly scores compare each institute with its own history, not a national average" },
];

function TickerItem({ item, inert = false }) {
  const inner = (
    <>
      {item.tagLabel && <span className={`snt-ticker-tag snt-tag-${item.tag}`}>{item.tagLabel}</span>}
      <span>{item.text}</span>
    </>
  );
  return item.to && !inert ? (
    <Link to={item.to} className="snt-ticker-item">
      {inner}
    </Link>
  ) : (
    <span className="snt-ticker-item">{inner}</span>
  );
}

function NewsTicker({ signals }) {
  const [paused, setPaused] = useState(false);
  const { summary, institutes, instituteIndex, openAlerts, dark, ready } = signals;

  const items = useMemo(() => {
    const out = [];
    if (ready) {
      const districts = new Set(institutes.map((i) => i.district).filter(Boolean)).size;
      out.push({
        tag: "info",
        tagLabel: "Portfolio",
        text: `${summary?.total_institutes ?? institutes.length} institutes under watch across ${districts} district${districts === 1 ? "" : "s"}`,
      });
      if (summary?.average_compliance_score != null) {
        out.push({
          tag: "green",
          tagLabel: "Compliance",
          text: `Average compliance score ${formatScore(summary.average_compliance_score)} / 100`,
          to: "/analytics",
        });
      }
      alertsByUrgency(openAlerts)
        .slice(0, 4)
        .forEach((a) => {
          const inst = instituteIndex.get(a.institute_id);
          const red = a.severity === "red";
          out.push({
            tag: red ? "red" : "amber",
            tagLabel: red ? "Critical" : "Alert",
            text: `${alertTypeLabel(a.type)} — ${inst?.name || "an institute"}${inst?.district ? `, ${inst.district}` : ""}`,
            to: `/alerts?focus=${a.id}`,
          });
        });
      out.push(
        openAlerts.length
          ? { tag: "amber", tagLabel: "Open", text: `${openAlerts.length} alert${openAlerts.length === 1 ? "" : "s"} awaiting review`, to: "/alerts" }
          : { tag: "green", tagLabel: "Clear", text: "No open alerts — every flag has been reviewed" }
      );
      if (dark.length) {
        out.push({
          tag: "amber",
          tagLabel: "CCTV",
          text: `${dark.length} camera feed${dark.length === 1 ? " is" : "s are"} offline or stale`,
          to: "/cameras",
        });
      }
    }
    TICKER_STANDING.forEach((s) => out.push({ ...s, tagLabel: "Sentinel" }));
    return out;
  }, [ready, summary, institutes, instituteIndex, openAlerts, dark]);

  // Speed tracks length, so a long list doesn't race and a short one doesn't crawl.
  const duration = Math.max(40, items.length * 7);

  const run = (copy) =>
    items.map((item, i) => (
      <span key={`${copy}-${i}`} className="flex items-center" aria-hidden={copy === "b" ? true : undefined}>
        {/* The second copy exists only so the loop is seamless: hidden from
            screen readers and kept out of the tab order. */}
        <TickerItem item={item} inert={copy === "b"} />
        <span className="snt-ticker-sep">
          <AshokaChakra size={12} color="#ffb35c" />
        </span>
      </span>
    ));

  return (
    <div className="snt-ticker" role="region" aria-label="Live updates">
      <div className="snt-ticker-label">
        <span className="snt-live" aria-hidden="true" />
        <Bi en="LIVE" inline altClassName="hidden font-semibold tracking-normal sm:inline" />
      </div>
      <div className="snt-ticker-viewport">
        <div
          className="snt-ticker-track"
          style={{ "--snt-dur": `${duration}s`, animationPlayState: paused ? "paused" : undefined }}
        >
          {run("a")}
          {run("b")}
        </div>
      </div>
      <button
        type="button"
        className="snt-ticker-pause"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Resume ticker" : "Pause ticker"}
        title={paused ? "Resume" : "Pause"}
      >
        {paused ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M3 1.5v9l7.5-4.5z" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <rect x="2.5" y="1.5" width="2.5" height="9" rx="0.6" />
            <rect x="7" y="1.5" width="2.5" height="9" rx="0.6" />
          </svg>
        )}
      </button>
    </div>
  );
}

/* ------------------------------------------------------ footer ------------ */
function ShellFooter({ updatedAt }) {
  return (
    <footer className="snt-footer">
      <div className="snt-tricolour" style={{ height: 2 }} />
      <div className="mx-auto flex h-7 max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6">
        <span className="truncate">
          © {new Date().getFullYear()} Sentinel · built for the Department of Social Justice &amp; Empowerment
        </span>
        <span className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="snt-hi">प्रहरी</span>
          <span className="opacity-40">·</span>
          <span>Officials' console</span>
          <span className="opacity-40">·</span>
          <span className="tnum">Signals refreshed {IST_TIME.format(updatedAt).toUpperCase()} IST</span>
          <span className="opacity-40">·</span>
          <Link to="/accessibility" className="underline-offset-2 hover:text-white hover:underline">
            Accessibility
          </Link>
          <span className="opacity-40">·</span>
          <span title="Press ? for keyboard shortcuts">Press ? for shortcuts</span>
        </span>
      </div>
    </footer>
  );
}


/* ══════════════════════════════════════════════════════════════════════════
   §13b  YUKT — the assistant (युक्त)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Yukt answers questions about what's on the dashboard ("aaj ka haal", "Lucknow
 * mein kya chal raha hai", "Ashray Balika Grih ka score") and can take actions
 * ("sabse gambhir alert escalate karo", "Excel report banao", "dark mode").
 *
 * Three layers, each optional except the last:
 *   1. AI backend  — POST /assistant/chat. The server holds the LLM key
 *                    (see backend_assistant.py) and answers from a snapshot
 *                    of the same live data the official sees.
 *   2. Bhashini    — /assistant/translate, /tts, /asr. 22 Indian languages in
 *                    and out, via the Government of India's Bhashini platform.
 *   3. Local engine — yuktReply(): rules over live data. Always works, never
 *                    invents a figure. Used whenever 1 isn't available.
 *
 * Actions are only ever PROPOSED; the official confirms, and the normal
 * endpoint is called with their token, so role checks still apply.
 *
 * Language: Devanagari or Hinglish ("kitne alerts hai") gets a Hindi reply;
 * otherwise English — unless a language is picked in the header.
 */

const YUKT_KW = {
  greet: ["hello", "hey", "namaste", "namaskar", "pranam", "नमस्ते", "नमस्कार", "प्रणाम", "good morning", "good evening"],
  help: ["help", "madad", "what can you", "kya kar sakt", "मदद", "सहायता", "क्या कर सक"],
  summary: ["summary", "overview", "status", "haal", "report", "saransh", "overall", "kaisa chal", "सारांश", "स्थिति", "हाल", "रिपोर्ट", "आज"],
  critical: ["critical", "urgent", "gambhir", "serious", "red alert", "गंभीर", "ज़रूरी", "जरूरी", "लाल"],
  alerts: ["alert", "chetavani", "warning", "चेतावनी", "अलर्ट"],
  worst: ["worst", "flagged", "lowest", "poor", "kharab", "kam score", "weak", "bottom", "खराब", "सबसे कम", "कमज़ोर", "कमजोर"],
  best: ["best", "top", "highest", "achha", "acche", "sabse badhiya", "अच्छ", "सर्वश्रेष्ठ", "बढ़िया"],
  camera: ["camera", "cctv", "feed", "कैमरा", "सीसीटीवी", "ऑफलाइन"],
  renewal: ["renewal", "navinikaran", "renew", "नवीनीकरण", "रिन्यू"],
  grievance: ["grievance", "complaint", "shikayat", "शिकायत"],
  draw: ["draw", "random", "lottery", "inspection", "nirikshan", "निरीक्षण", "ड्रॉ", "surprise"],
  thanks: ["thank", "shukriya", "dhanyavad", "धन्यवाद", "शुक्रिया"],
  // "Show me" usually wants an answer, not a page — so only these open pages.
  nav: ["open", "go to", "take me", "kholo", "khol do", "le chalo", "jao", "खोलो", "खोल दो", "ले चलो", "जाओ"],
  show: ["show", "dikhao", "दिखाओ"],
};

// Latin-script words that mark a message as Hinglish, so the reply comes in Hindi.
const HINGLISH = ["kaha", "milega", "milegi", "karni", "karna", "karu", "baat", "mujhe", "chahta", "sakte", "karo", "kar do", "banao", "bhejo", "chahiye", "kya", "hai", "hain", "kitne", "kitna", "kaun", "kaunse", "batao", "dikhao", "kholo", "mein", "ka ", "ki ", "ke ", "aaj", "sabse", "kaise", "kahan", "haal", "chahiye", "wala", "wale"];

const YUKT_PAGES = [
  { to: "/map", words: ["map", "naksha", "manchitra", "मानचित्र", "नक्शा"], en: "Map", hi: "मानचित्र" },
  { to: "/alerts", words: ["alert", "chetavani", "चेतावनी"], en: "Alerts", hi: "चेतावनी" },
  { to: "/cameras", words: ["camera", "cctv", "कैमरा"], en: "Cameras", hi: "कैमरा" },
  { to: "/institutes", words: ["register", "list", "panjika", "पंजिका", "सूची", "institutes"], en: "Register", hi: "पंजिका" },
  { to: "/analytics", words: ["analytics", "chart", "graph", "vishleshan", "विश्लेषण"], en: "Analytics", hi: "विश्लेषण" },
  { to: "/assignments", words: ["draw", "assignment", "ड्रॉ", "आवंटन"], en: "Draw", hi: "आवंटन", deciders: true },
  { to: "/grievances", words: ["grievance", "shikayat", "शिकायत"], en: "Grievances", hi: "शिकायतें", deciders: true },
  { to: "/renewals", words: ["renewal", "नवीनीकरण"], en: "Renewals", hi: "नवीनीकरण", deciders: true },
  { to: "/", words: ["home", "overview", "dashboard", "होम", "अवलोकन"], en: "Overview", hi: "अवलोकन" },
];

// So "लखनऊ" finds Lucknow. Extend as districts are added.
const DISTRICT_HI = {
  लखनऊ: "Lucknow", प्रयागराज: "Prayagraj", गोरखपुर: "Gorakhpur", वाराणसी: "Varanasi", कानपुर: "Kanpur", आगरा: "Agra",
  मेरठ: "Meerut", बरेली: "Bareilly", गाजियाबाद: "Ghaziabad", ग़ाज़ियाबाद: "Ghaziabad", अयोध्या: "Ayodhya", झांसी: "Jhansi",
  मथुरा: "Mathura", अलीगढ़: "Aligarh", मुरादाबाद: "Moradabad", नोएडा: "Gautam Buddh Nagar", सहारनपुर: "Saharanpur",
};

// Words too common in institute names to identify one on their own.
const NAME_STOP = new Set(["home", "grih", "griha", "kendra", "centre", "center", "hostel", "school", "sadan", "ashram", "niketan", "bhawan", "bhavan", "sansthan", "chhatravas", "shelter", "nagar", "road", "the", "and"]);

const includesAny = (text, words) => words.some((w) => text.includes(w));

function yuktLang(raw) {
  if (/[ऀ-ॿ]/.test(raw)) return "hi";
  const t = ` ${raw.toLowerCase()} `;
  return HINGLISH.filter((w) => t.includes(` ${w.trim()} `) || t.includes(w)).length >= 2 ? "hi" : "en";
}

const tr = (lang, en, hi) => (lang === "hi" ? hi : en);

function instituteTokens(name = "") {
  return name
    .toLowerCase()
    .split(/[^a-zऀ-ॿ]+/)
    .filter((w) => w.length >= 4 && !NAME_STOP.has(w));
}

/** The local engine. Pure: data in, one reply out. */
function yuktReply(raw, ctx) {
  const text = raw.toLowerCase().trim();
  const lang = yuktLang(raw);
  const { institutes, instituteIndex, openAlerts, dark, summary, grievances, isDecider, pendingRenewals } = ctx;
  const nameOf = (id) => instituteIndex.get(id)?.name || tr(lang, "an institute", "एक संस्था");

  const alertItem = (a) => {
    const inst = instituteIndex.get(a.institute_id);
    return {
      title: alertTypeLabel(a.type),
      sub: `${inst?.name || "—"}${inst?.district ? ` · ${inst.district}` : ""} · ${relativeTime(a.created_at)}`,
      to: `/alerts?focus=${a.id}`,
      tone: a.severity === "red" ? "flag" : "watch",
    };
  };
  const instItem = (i) => ({
    title: i.name,
    sub: `${instituteType(i.type)} · ${i.district || "—"} · ${formatScore(i.compliance_score)}/100`,
    to: `/institutes/${i.id}`,
    tone: instituteStatus(i.status).tone,
  });

  if (!text) return { text: tr(lang, "Ask me anything about the dashboard.", "डैशबोर्ड के बारे में कुछ भी पूछिए।") };

  if (includesAny(text, YUKT_KW.thanks)) {
    return { text: tr(lang, "Happy to help. Anything else?", "आपकी सेवा में। और कुछ?") };
  }

  // ── navigation: "map kholo", "open alerts"
  const wantsMap = includesAny(text, YUKT_KW.show) && includesAny(text, YUKT_PAGES[0].words);
  if (includesAny(text, YUKT_KW.nav) || wantsMap) {
    const page = YUKT_PAGES.find((p) => (!p.deciders || isDecider) && includesAny(text, p.words));
    if (page) {
      return {
        text: tr(lang, `Opening ${page.en}.`, `${page.hi} खोल रहा हूँ।`),
        nav: page.to,
      };
    }
  }

  // ── a specific institute, by a distinctive word in its name
  let best = null;
  institutes.forEach((i) => {
    const hits = instituteTokens(i.name).filter((tok) => text.includes(tok)).length;
    if (hits && (!best || hits > best.hits)) best = { inst: i, hits };
  });
  if (best) {
    const i = best.inst;
    const st = instituteStatus(i.status);
    const its = openAlerts.filter((a) => a.institute_id === i.id);
    const cams = dark.filter((c) => c.institute_id === i.id).length;
    return {
      text: tr(
        lang,
        `${i.name} (${instituteType(i.type)}, ${i.district || "—"}) scores ${formatScore(i.compliance_score)}/100 and is marked ${st.label}. ${its.length ? `It has ${its.length} open alert${its.length === 1 ? "" : "s"}.` : "No open alerts."}${cams ? ` ${cams} camera feed${cams === 1 ? " is" : "s are"} not reporting.` : ""} Renewal: ${renewalStatus(i.renewal_status).label}.`,
        `${i.name} (${instituteType(i.type)}, ${i.district || "—"}) का अनुपालन स्कोर ${formatScore(i.compliance_score)}/100 है, स्थिति: ${st.label}। ${its.length ? `${its.length} चेतावनी खुली हैं।` : "कोई खुली चेतावनी नहीं।"}${cams ? ` ${cams} कैमरा फ़ीड बंद हैं।` : ""} नवीनीकरण: ${renewalStatus(i.renewal_status).label}।`
      ),
      items: its.slice(0, 3).map(alertItem),
      actions: [
        { label: tr(lang, "Open institute", "संस्था खोलें"), to: `/institutes/${i.id}` },
        ...(its.length ? [{ label: tr(lang, "Its alerts", "इसकी चेतावनियाँ"), to: `/alerts?institute=${i.id}` }] : []),
      ],
    };
  }

  // ── a district: "Lucknow mein kya haal hai"
  const districts = [...new Set(institutes.map((i) => i.district).filter(Boolean))];
  const hiHit = Object.entries(DISTRICT_HI).find(([hi]) => raw.includes(hi));
  const district = districts.find((d) => text.includes(d.toLowerCase()) || (hiHit && hiHit[1] === d));
  if (district) {
    const inD = institutes.filter((i) => i.district === district);
    const ids = new Set(inD.map((i) => i.id));
    const al = openAlerts.filter((a) => ids.has(a.institute_id));
    const avg = mean(inD, "compliance_score");
    const flagged = inD.filter((i) => i.status === "red").length;
    return {
      text: tr(
        lang,
        `${district}: ${inD.length} institute${inD.length === 1 ? "" : "s"}, average compliance ${formatScore(avg)}/100, ${flagged} flagged, ${al.length} open alert${al.length === 1 ? "" : "s"}.`,
        `${district}: ${inD.length} संस्थाएँ, औसत अनुपालन ${formatScore(avg)}/100, ${flagged} चिह्नित, ${al.length} खुली चेतावनियाँ।`
      ),
      items: worstFirst(inD).slice(0, 4).map(instItem),
      actions: [{ label: tr(lang, "See on map", "मानचित्र पर देखें"), to: "/map" }],
    };
  }

  if (includesAny(text, YUKT_KW.critical)) {
    const crit = alertsByUrgency(openAlerts.filter((a) => a.severity === "red"));
    return {
      text: crit.length
        ? tr(lang, `${crit.length} critical alert${crit.length === 1 ? " is" : "s are"} open. Most recent first:`, `${crit.length} गंभीर चेतावनियाँ खुली हैं:`)
        : tr(lang, "No critical alerts are open right now.", "अभी कोई गंभीर चेतावनी खुली नहीं है।"),
      items: crit.slice(0, 5).map(alertItem),
      actions: crit.length ? [{ label: tr(lang, "Open alerts", "चेतावनियाँ खोलें"), to: "/alerts" }] : [],
    };
  }

  if (includesAny(text, YUKT_KW.camera)) {
    const sorted = [...dark].sort((a, b) => (parseDate(a.last_ping_at)?.getTime() ?? 0) - (parseDate(b.last_ping_at)?.getTime() ?? 0));
    return {
      text: dark.length
        ? tr(lang, `${dark.length} camera feed${dark.length === 1 ? " is" : "s are"} offline or stale. Longest-silent first:`, `${dark.length} कैमरा फ़ीड बंद या पुरानी हैं:`)
        : tr(lang, "Every camera feed is reporting normally.", "सभी कैमरे ठीक से चल रहे हैं।"),
      items: sorted.slice(0, 5).map((c) => ({
        title: c.name,
        sub: `${nameOf(c.institute_id)} · ${c.last_ping_at ? relativeTime(c.last_ping_at) : tr(lang, "never pinged", "कभी नहीं")}`,
        to: "/cameras",
        tone: c.status === "offline" ? "flag" : "watch",
      })),
      actions: [{ label: tr(lang, "Camera wall", "कैमरा वॉल"), to: "/cameras" }],
    };
  }

  if (includesAny(text, YUKT_KW.renewal)) {
    if (!isDecider) return { text: tr(lang, "Renewal decisions are made by officials and administrators.", "नवीनीकरण के निर्णय अधिकारी लेते हैं।") };
    const low = pendingRenewals.filter((i) => toNumber(i.compliance_score, 100) < 70).length;
    return {
      text: tr(
        lang,
        `${pendingRenewals.length} renewal${pendingRenewals.length === 1 ? " is" : "s are"} awaiting a decision${low ? `, ${low} of them scoring below 70` : ""}.`,
        `${pendingRenewals.length} नवीनीकरण निर्णय बाकी हैं${low ? `, जिनमें ${low} का स्कोर 70 से कम है` : ""}।`
      ),
      items: pendingRenewals.slice(0, 4).map(instItem),
      actions: [{ label: tr(lang, "Open renewals", "नवीनीकरण खोलें"), to: "/renewals" }],
    };
  }

  if (includesAny(text, YUKT_KW.grievance)) {
    if (!isDecider) return { text: tr(lang, "Grievances are handled by officials and administrators.", "शिकायतें अधिकारी देखते हैं।") };
    if (grievances === null) return { text: tr(lang, "Fetching grievances — ask me again in a moment.", "शिकायतें ला रहा हूँ — एक क्षण बाद फिर पूछिए।") };
    const open = grievances.filter((g) => g.status !== "resolved");
    return {
      text: tr(lang, `${open.length} grievance${open.length === 1 ? " is" : "s are"} open or in review.`, `${open.length} शिकायतें खुली या समीक्षा में हैं।`),
      items: open.slice(0, 4).map((g) => ({ title: g.subject, sub: `${nameOf(g.institute_id)} · ${relativeTime(g.created_at)}`, to: "/grievances", tone: "watch" })),
      actions: [{ label: tr(lang, "Open grievances", "शिकायतें खोलें"), to: "/grievances" }],
    };
  }

  if (includesAny(text, YUKT_KW.worst)) {
    return {
      text: tr(lang, "Institutes needing the most attention:", "सबसे ज़्यादा ध्यान माँगने वाली संस्थाएँ:"),
      items: worstFirst(institutes).slice(0, 5).map(instItem),
      actions: [{ label: tr(lang, "Open register", "पंजिका खोलें"), to: "/institutes" }],
    };
  }

  if (includesAny(text, YUKT_KW.best)) {
    const top = [...institutes].sort((a, b) => toNumber(b.compliance_score, 0) - toNumber(a.compliance_score, 0)).slice(0, 5);
    return {
      text: tr(lang, "Highest compliance scores:", "सबसे ऊँचे अनुपालन स्कोर:"),
      items: top.map(instItem),
      actions: [{ label: tr(lang, "Open register", "पंजिका खोलें"), to: "/institutes" }],
    };
  }

  if (includesAny(text, YUKT_KW.alerts)) {
    const red = openAlerts.filter((a) => a.severity === "red").length;
    return {
      text: tr(
        lang,
        `${openAlerts.length} alert${openAlerts.length === 1 ? " is" : "s are"} open — ${red} critical, ${openAlerts.length - red} warnings.`,
        `${openAlerts.length} चेतावनियाँ खुली हैं — ${red} गंभीर, ${openAlerts.length - red} सामान्य।`
      ),
      items: alertsByUrgency(openAlerts).slice(0, 5).map(alertItem),
      actions: [{ label: tr(lang, "Open alerts", "चेतावनियाँ खोलें"), to: "/alerts" }],
    };
  }

  if (includesAny(text, YUKT_KW.draw)) {
    return {
      text: tr(
        lang,
        "Inspections are assigned by a cryptographic draw (CSPRNG) with a fairness window, so no institute can predict its turn and no inspector gets the same place twice in a row.",
        "निरीक्षण एक क्रिप्टोग्राफ़िक ड्रॉ (CSPRNG) से तय होते हैं, fairness window के साथ — इसलिए कोई संस्था अपनी बारी का अनुमान नहीं लगा सकती।"
      ),
      actions: isDecider ? [{ label: tr(lang, "Open the draw", "ड्रॉ खोलें"), to: "/assignments" }] : [],
    };
  }

  if (includesAny(text, YUKT_KW.summary)) {
    const red = openAlerts.filter((a) => a.severity === "red").length;
    const flagged = institutes.filter((i) => i.status === "red").length;
    const avg = summary?.average_compliance_score ?? mean(institutes, "compliance_score");
    return {
      text: tr(
        lang,
        `Today: ${summary?.total_institutes ?? institutes.length} institutes monitored, average compliance ${formatScore(avg)}/100. ${flagged} flagged. ${openAlerts.length} open alerts (${red} critical). ${dark.length} camera feeds not reporting.${isDecider ? ` ${pendingRenewals.length} renewals pending.` : ""}`,
        `आज: ${summary?.total_institutes ?? institutes.length} संस्थाओं पर निगरानी, औसत अनुपालन ${formatScore(avg)}/100। ${flagged} चिह्नित। ${openAlerts.length} खुली चेतावनियाँ (${red} गंभीर)। ${dark.length} कैमरा फ़ीड बंद।${isDecider ? ` ${pendingRenewals.length} नवीनीकरण बाकी।` : ""}`
      ),
      items: alertsByUrgency(openAlerts).slice(0, 3).map(alertItem),
      actions: [{ label: tr(lang, "Overview", "अवलोकन"), to: "/" }],
    };
  }

  if (includesAny(text, YUKT_KW.greet) || includesAny(text, YUKT_KW.help) || /^(hi|hii|hello|yo)\b/.test(text)) {
    return {
      text: tr(
        lang,
        "Namaste! I'm Yukt. I can summarise the day, list critical alerts, find an institute or district, check cameras, renewals and grievances, and open any page for you. Try one of these:",
        "नमस्ते! मैं युक्त हूँ। मैं आज का सारांश, गंभीर चेतावनियाँ, किसी संस्था या ज़िले की जानकारी, कैमरे, नवीनीकरण और शिकायतें बता सकता हूँ, और कोई भी पेज खोल सकता हूँ। इनमें से कुछ पूछिए:"
      ),
      suggest: true,
    };
  }

  return {
    text: tr(
      lang,
      "I didn't catch that. I answer from Sentinel's live data — try an institute or district name, or one of these:",
      "यह समझ नहीं पाया। मैं Sentinel के लाइव डेटा से जवाब देता हूँ — किसी संस्था या ज़िले का नाम लिखिए, या इनमें से चुनिए:"
    ),
    suggest: true,
    fallback: true,
  };
}

/* --------------------------------------------------- languages (Bhashini) - */
/**
 * The 22 scheduled languages of the Eighth Schedule, plus English, with the
 * codes Bhashini's pipeline uses. Hindi and English are answered directly;
 * every other language goes through Bhashini (translate in → answer → translate
 * out) when the backend has it connected. `speech` is the browser locale used
 * for the built-in voice fallback.
 */
const YUKT_LANGS = [
  { code: "auto", name: "Auto · हिंदी/English", speech: "hi-IN" },
  { code: "hi", name: "हिन्दी (Hindi)", speech: "hi-IN" },
  { code: "en", name: "English", speech: "en-IN" },
  { code: "as", name: "অসমীয়া (Assamese)", speech: "as-IN" },
  { code: "bn", name: "বাংলা (Bengali)", speech: "bn-IN" },
  { code: "brx", name: "बड़ो (Bodo)", speech: "brx-IN" },
  { code: "doi", name: "डोगरी (Dogri)", speech: "doi-IN" },
  { code: "gu", name: "ગુજરાતી (Gujarati)", speech: "gu-IN" },
  { code: "kn", name: "ಕನ್ನಡ (Kannada)", speech: "kn-IN" },
  { code: "ks", name: "कॉशुर (Kashmiri)", speech: "ks-IN" },
  { code: "gom", name: "कोंकणी (Konkani)", speech: "kok-IN" },
  { code: "mai", name: "मैथिली (Maithili)", speech: "mai-IN" },
  { code: "ml", name: "മലയാളം (Malayalam)", speech: "ml-IN" },
  { code: "mni", name: "মৈতৈলোন্ (Manipuri)", speech: "mni-IN" },
  { code: "mr", name: "मराठी (Marathi)", speech: "mr-IN" },
  { code: "ne", name: "नेपाली (Nepali)", speech: "ne-IN" },
  { code: "or", name: "ଓଡ଼ିଆ (Odia)", speech: "or-IN" },
  { code: "pa", name: "ਪੰਜਾਬੀ (Punjabi)", speech: "pa-IN" },
  { code: "sa", name: "संस्कृतम् (Sanskrit)", speech: "sa-IN" },
  { code: "sat", name: "ᱥᱟᱱᱛᱟᱲᱤ (Santali)", speech: "sat-IN" },
  { code: "sd", name: "سنڌي (Sindhi)", speech: "sd-IN" },
  { code: "ta", name: "தமிழ் (Tamil)", speech: "ta-IN" },
  { code: "te", name: "తెలుగు (Telugu)", speech: "te-IN" },
  { code: "ur", name: "اردو (Urdu)", speech: "ur-IN" },
];
const NATIVE_LANGS = new Set(["auto", "hi", "en"]);
const RTL_LANGS = new Set(["ur", "sd", "ks"]);

/* ----------------------------------------------------- actions by chat ---- */
/**
 * Yukt can DO things — escalate an alert, mark one reviewed, resolve or
 * escalate a grievance, switch the display mode, build a report — but it
 * never does anything with a side effect on its own: it proposes, shows
 * exactly what will change, and waits for the official to press Confirm.
 * The call then goes through the same endpoint (and the same RBAC) as the
 * button on the page would.
 */
const YUKT_ACT = {
  escalate: ["escalate", "escalat", "upar bhejo", "aage bhejo", "upar bhej", "आगे भेज", "ऊपर भेज", "एस्केलेट"],
  review: ["mark reviewed", "mark as reviewed", "review kar", "reviewed kar", "समीक्षित", "रिव्यू कर", "समीक्षा कर"],
  resolve: ["resolve", "hal kar", "hal karo", "nipta", "निपटा", "हल कर", "समाधान कर"],
  dark: ["dark mode", "dark theme", "dark kar", "डार्क मोड", "गहरा मोड"],
  light: ["light mode", "light theme", "light kar", "लाइट मोड", "हल्का मोड"],
  contrast: ["high contrast", "contrast mode", "हाई कंट्रास्ट", "उच्च कंट्रास्ट"],
  report: ["download report", "report download", "report bana", "report banao", "report chahiye", "pdf", "excel", "रिपोर्ट बना", "रिपोर्ट डाउनलोड", "रिपोर्ट चाहिए"],
};

/** Finds the institute a message names, by a distinctive word in its name. */
function mentionedInstitute(text, institutes) {
  let best = null;
  institutes.forEach((i) => {
    const hits = instituteTokens(i.name).filter((tok) => text.includes(tok)).length;
    if (hits && (!best || hits > best.hits)) best = { inst: i, hits };
  });
  return best?.inst || null;
}

/** Local intent → a proposal, a direct action, or null (not an action). */
function yuktLocalAction(raw, ctx) {
  const text = raw.toLowerCase();
  const lang = yuktLang(raw);
  const { institutes, instituteIndex, openAlerts, isDecider } = ctx;

  // Display mode needs no confirmation — it's instantly reversible.
  for (const [key, mode] of [["contrast", "contrast"], ["dark", "dark"], ["light", "light"]]) {
    if (includesAny(text, YUKT_ACT[key])) {
      return { text: tr(lang, `Switched to ${THEME_MODES.find((m) => m.key === mode).label} mode.`, `${THEME_MODES.find((m) => m.key === mode).hi} मोड चालू कर दिया।`), theme: mode };
    }
  }

  if (includesAny(text, YUKT_ACT.report)) {
    const format = text.includes("excel") || text.includes("xlsx") || text.includes("एक्सेल") ? "excel" : text.includes("pdf") ? "pdf" : null;
    return {
      text: tr(lang, format ? `Opening Reports and preparing the ${format === "excel" ? "Excel" : "PDF"} file.` : "Opening Reports — pick the scope and download PDF or Excel.", format ? `रिपोर्ट पेज खोल रहा हूँ, ${format === "excel" ? "Excel" : "PDF"} तैयार हो रही है।` : "रिपोर्ट पेज खोल रहा हूँ — क्षेत्र चुनकर PDF या Excel डाउनलोड करें।"),
      nav: format ? `/reports?auto=${format}` : "/reports",
    };
  }

  const wantsEscalate = includesAny(text, YUKT_ACT.escalate);
  const wantsReview = includesAny(text, YUKT_ACT.review);
  const wantsResolve = includesAny(text, YUKT_ACT.resolve);
  if (!wantsEscalate && !wantsReview && !wantsResolve) return null;

  if (!isDecider) {
    return { text: tr(lang, "Only officials and administrators can take actions. I can still tell you what's open.", "कार्रवाई केवल अधिकारी और प्रशासक कर सकते हैं। मैं जानकारी दे सकता हूँ।") };
  }

  const inst = mentionedInstitute(text, institutes);
  const aboutGrievance = includesAny(text, YUKT_KW.grievance) || wantsResolve;

  if (aboutGrievance) {
    const pool = (ctx.grievances || []).filter((g) => g.status !== "resolved" && (!inst || g.institute_id === inst.id));
    const idHit = pool.find((g) => text.includes(g.id.toLowerCase()));
    const byUrgency = [...pool].sort((a, b) => {
      const sa = grievanceSla(a);
      const sb = grievanceSla(b);
      return SLA_STATE[sa.state].rank - SLA_STATE[sb.state].rank || sa.due - sb.due;
    });
    const g = idHit || byUrgency[0];
    if (!g) return { text: tr(lang, "I couldn't find an open grievance matching that.", "ऐसी कोई खुली शिकायत नहीं मिली।") };
    const s = grievanceSla(g);
    if (wantsEscalate && !s.canEscalate) return { text: tr(lang, "That grievance is already at the highest level.", "यह शिकायत पहले से सबसे ऊँचे स्तर पर है।") };
    const type = wantsEscalate ? "grievance_escalate" : "grievance_resolve";
    return {
      text: tr(lang, "Please confirm:", "कृपया पुष्टि करें:"),
      proposals: [
        {
          type,
          id: g.id,
          title: wantsEscalate ? `Escalate grievance → ${escalationLevel(s.level + 1).short} (${escalationLevel(s.level + 1).label})` : "Mark grievance resolved",
          sub: `${g.subject} · ${instituteIndex.get(g.institute_id)?.name || "—"} · SLA ${SLA_STATE[s.state].label}`,
        },
      ],
    };
  }

  // An alert: by id, by institute, or the most urgent open one.
  const pool = openAlerts.filter((a) => !inst || a.institute_id === inst.id);
  const idHit = pool.find((a) => text.includes(a.id.toLowerCase()));
  const a = idHit || alertsByUrgency(pool)[0];
  if (!a) return { text: tr(lang, "There's no open alert matching that.", "ऐसी कोई खुली चेतावनी नहीं है।") };
  const action = wantsEscalate ? "escalated" : "reviewed";
  return {
    text: tr(lang, "Please confirm:", "कृपया पुष्टि करें:"),
    proposals: [
      {
        type: "alert_action",
        action,
        id: a.id,
        title: `${action === "escalated" ? "Escalate" : "Mark reviewed"}: ${alertTypeLabel(a.type)}`,
        sub: `${instituteIndex.get(a.institute_id)?.name || "—"} · ${severity(a.severity).label} · ${relativeTime(a.created_at)}`,
      },
    ],
  };
}

/** Turns the AI backend's proposed actions into the same shape the UI renders. */
function normaliseAiActions(actions = [], ctx) {
  const out = { proposals: [], nav: null, theme: null, kb: [] };
  actions.forEach((a) => {
    if (a.type === "navigate" && typeof a.to === "string" && a.to.startsWith("/")) out.nav = a.to;
    else if (a.type === "set_theme" && THEME_MODES.some((m) => m.key === a.theme)) out.theme = a.theme;
    else if (a.type === "download_report") out.nav = `/reports?auto=${a.format === "excel" ? "excel" : "pdf"}`;
    else if (a.type === "open_feature" && a.doc_id) {
      const d = YUKT_KB.find((x) => x.id === a.doc_id);
      if (d) {
        out.kb = [...(out.kb || []), d];
        if (d.app === "sentinel" && d.route && a.navigate) out.nav = d.route;
      }
    }
    else if ((a.type === "escalate_alert" || a.type === "mark_alert_reviewed") && a.alert_id) {
      const al = ctx.openAlerts.find((x) => x.id === a.alert_id);
      if (!al) return;
      const action = a.type === "escalate_alert" ? "escalated" : "reviewed";
      out.proposals.push({
        type: "alert_action",
        action,
        id: al.id,
        title: `${action === "escalated" ? "Escalate" : "Mark reviewed"}: ${alertTypeLabel(al.type)}`,
        sub: `${ctx.instituteIndex.get(al.institute_id)?.name || "—"} · ${severity(al.severity).label}`,
      });
    } else if ((a.type === "resolve_grievance" || a.type === "escalate_grievance") && a.grievance_id) {
      const g = (ctx.grievances || []).find((x) => x.id === a.grievance_id);
      if (!g) return;
      out.proposals.push({
        type: a.type === "resolve_grievance" ? "grievance_resolve" : "grievance_escalate",
        id: g.id,
        title: a.type === "resolve_grievance" ? "Mark grievance resolved" : "Escalate grievance to the next level",
        sub: g.subject,
      });
    }
  });
  return out;
}

/**
 * What the AI backend gets to reason over: the same live data the official
 * sees, trimmed. It answers ONLY from this — the system prompt on the server
 * forbids inventing figures (see backend_assistant.py).
 */
function yuktSnapshot(ctx, page) {
  const worst = worstFirst(ctx.institutes).slice(0, 60);
  return {
    page,
    role: ctx.role,
    generated_at: new Date().toISOString(),
    summary: ctx.summary || null,
    institutes: worst.map((i) => ({ id: i.id, name: i.name, type: i.type, district: i.district, score: toNumber(i.compliance_score, null), status: i.status, renewal: i.renewal_status })),
    open_alerts: alertsByUrgency(ctx.openAlerts)
      .slice(0, 60)
      .map((a) => ({ id: a.id, type: a.type, severity: a.severity, institute_id: a.institute_id, created_at: a.created_at, detail: a.detail?.slice(0, 200) })),
    dark_cameras: ctx.dark.slice(0, 60).map((c) => ({ id: c.id, name: c.name, status: c.status, institute_id: c.institute_id, last_ping_at: c.last_ping_at })),
    grievances: (ctx.grievances || [])
      .filter((g) => g.status !== "resolved")
      .slice(0, 60)
      .map((g) => {
        const s = grievanceSla(g);
        return { id: g.id, subject: g.subject, status: g.status, institute_id: g.institute_id, sla: s.state, level: s.level, due: new Date(s.due).toISOString() };
      }),
  };
}

/* ------------------------------------------------------ voice helpers ----- */
function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    o += 2;
  }
  return buf;
}

function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Records from the mic and hands back 16 kHz mono WAV — what Bhashini ASR takes. */
async function startWavRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((resolve, reject) => {
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      try {
        const raw = await new Blob(chunks).arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ac = new Ctx();
        const decoded = await ac.decodeAudioData(raw);
        const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
        const src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start();
        const rendered = await off.startRendering();
        ac.close();
        resolve(encodeWav(rendered.getChannelData(0), 16000));
      } catch (err) {
        reject(err);
      }
    };
  });
  rec.start();
  return { stop: () => rec.state !== "inactive" && rec.stop(), done };
}


/* --------------------------------------------------- knowledge (RAG) ------ */
/**
 * What Yukt knows about the three apps. Each entry is one feature: which app
 * it lives in (sentinel / setu / nayan), where it is (route), other names
 * people use for it (aliases — these drive autocomplete), keywords in
 * English, Hinglish and Hindi, and a plain-language summary.
 *
 * The same file ships to the backend as yukt_knowledge.json. Retrieval runs
 * in both places: here for instant autocomplete and offline answers, and on
 * the server, which grounds the AI model's answer in the retrieved entries
 * (retrieval-augmented generation) rather than one giant prompt.
 *
 * To teach Yukt a new feature: add an entry here and to yukt_knowledge.json.
 */
const YUKT_KB = [
 {
  "id": "about-sentinel",
  "app": "sentinel",
  "title": "About Sentinel",
  "hi": "Sentinel क्या है",
  "summary": "Sentinel is the officials' dashboard of the Department of Social Justice & Empowerment for monitoring welfare institutes — shelter homes, hostels, old-age homes and rehabilitation centres. It brings every signal about an institute into one place: anomaly alerts, CCTV health, compliance scores, grievances and renewals, and it assigns surprise inspections by a cryptographic draw so no institute can predict a visit.",
  "category": "about",
  "aliases": [
   "Sentinel",
   "Dashboard purpose",
   "What is Sentinel"
  ],
  "keywords": [
   "about",
   "purpose",
   "what does",
   "kya karta",
   "kya hai",
   "dashboard ka purpose",
   "उद्देश्य",
   "क्या करता",
   "introduction",
   "overview of sentinel",
   "help",
   "madad"
  ],
  "route": "/"
 },
 {
  "id": "overview",
  "app": "sentinel",
  "title": "Overview",
  "hi": "अवलोकन",
  "summary": "The landing page: the queue of open alerts that need a decision (most serious first), four headline numbers — institutes monitored, average compliance, open alerts, critical alerts — portfolio status, camera health and the institutes needing attention.",
  "category": "monitoring",
  "aliases": [
   "Home",
   "Dashboard",
   "Summary page",
   "Needs a decision"
  ],
  "keywords": [
   "home",
   "dashboard",
   "main page",
   "summary",
   "kpi",
   "headline",
   "aaj ka haal",
   "today",
   "होम",
   "डैशबोर्ड",
   "सारांश"
  ],
  "route": "/"
 },
 {
  "id": "map",
  "app": "sentinel",
  "title": "Map",
  "hi": "मानचित्र",
  "summary": "Every institute on a map of the region, with pins whose colour and shape both show status (compliant, watch, flagged). Filter by status, search by name, click a pin for the score and a link to the institute.",
  "category": "monitoring",
  "aliases": [
   "Map view",
   "Locations"
  ],
  "keywords": [
   "map",
   "naksha",
   "location",
   "where are institutes",
   "pins",
   "geography",
   "नक्शा",
   "मानचित्र",
   "jagah",
   "naksha"
  ],
  "route": "/map"
 },
 {
  "id": "alerts",
  "app": "sentinel",
  "title": "Alerts",
  "hi": "चेतावनियाँ",
  "summary": "The alert ledger. Every alert is written by an automated check — an anomaly score against the institute's own history, a frozen or offline camera, a missed verification call, an evidence hash mismatch, a geofence breach. Filter, sort, group and export; mark alerts reviewed or escalate them.",
  "category": "monitoring",
  "aliases": [
   "Alert ledger",
   "Warnings",
   "Anomalies",
   "Notifications"
  ],
  "keywords": [
   "alert",
   "alerts",
   "warning",
   "chetavani",
   "anomaly",
   "critical",
   "red",
   "flag",
   "notification",
   "चेतावनी",
   "अलर्ट",
   "tamper",
   "chetavani"
  ],
  "route": "/alerts"
 },
 {
  "id": "alert-actions",
  "app": "sentinel",
  "title": "Review or escalate an alert",
  "hi": "चेतावनी की समीक्षा या आगे भेजना",
  "summary": "On the Alerts page each open alert has 'Mark reviewed' and 'Escalate'. Escalating sends it up for action; both are recorded in the audit trail. You can also ask Yukt to do it, and confirm.",
  "category": "action",
  "aliases": [
   "Escalate alert",
   "Mark reviewed"
  ],
  "keywords": [
   "escalate",
   "review",
   "mark reviewed",
   "upar bhejo",
   "aage bhejo",
   "act on alert",
   "close alert",
   "समीक्षा",
   "एस्केलेट"
  ],
  "route": "/alerts",
  "how": [
   "Open Alerts",
   "Find the alert (use Critical or search)",
   "Press Mark reviewed or Escalate"
  ],
  "roles": "deciders"
 },
 {
  "id": "cameras",
  "app": "sentinel",
  "title": "Cameras",
  "hi": "कैमरे",
  "summary": "The CCTV health wall: every camera feed with its connection status — online, stale or offline — and when it last reported. It shows connection health, not live video. A feed going dark just before a visit is itself a signal.",
  "category": "monitoring",
  "aliases": [
   "Camera",
   "CCTV",
   "Camera wall",
   "Feeds",
   "Video feeds"
  ],
  "keywords": [
   "camera",
   "cameras",
   "cctv",
   "feed",
   "video",
   "offline camera",
   "camera kaha",
   "camera dekhna",
   "कैमरा",
   "सीसीटीवी",
   "फ़ीड",
   "band camera"
  ],
  "route": "/cameras"
 },
 {
  "id": "register",
  "app": "sentinel",
  "title": "Institute register",
  "hi": "संस्था पंजिका",
  "summary": "The list of every institute in your region with type, district, compliance score, status and renewal state. Advanced filters, multi-level sort, grouping, saved views, column picker and CSV export.",
  "category": "assessment",
  "aliases": [
   "Register",
   "Institutes",
   "Institute list",
   "Shelter homes list"
  ],
  "keywords": [
   "register",
   "institutes",
   "institute list",
   "list",
   "shelter",
   "hostel",
   "old age home",
   "sanstha",
   "संस्था",
   "पंजिका",
   "सूची",
   "compliance score",
   "sanstha"
  ],
  "route": "/institutes"
 },
 {
  "id": "institute-detail",
  "app": "sentinel",
  "title": "Institute profile",
  "hi": "संस्था विवरण",
  "summary": "Open any institute to see its compliance score, open alerts, camera status, grievances, renewal decision, documents and its assigned inspector — with Connect with Inspector right there.",
  "category": "assessment",
  "aliases": [
   "Institute page",
   "Institute details",
   "Profile"
  ],
  "keywords": [
   "institute detail",
   "profile",
   "one institute",
   "specific institute",
   "details",
   "विवरण"
  ],
  "route": "/institutes"
 },
 {
  "id": "districts",
  "app": "sentinel",
  "title": "Districts",
  "hi": "ज़िले",
  "summary": "A heatmap of every district across compliance, flagged share, open and critical alerts, cameras dark, SLA breaches and renewals due — darker means needs attention — plus top-performing and needs-attention rankings.",
  "category": "assessment",
  "aliases": [
   "District heatmap",
   "Heatmap",
   "District ranking",
   "Leaderboard"
  ],
  "keywords": [
   "district",
   "districts",
   "heatmap",
   "ranking",
   "leaderboard",
   "zila",
   "jila",
   "ज़िला",
   "जिला",
   "best district",
   "worst district",
   "zila"
  ],
  "route": "/districts"
 },
 {
  "id": "analytics",
  "app": "sentinel",
  "title": "Analytics",
  "hi": "विश्लेषण",
  "summary": "Portfolio charts: status distribution, compliance score bands, alerts by detector, alerts over time, institutes by district and type, and camera health — each with a table view.",
  "category": "assessment",
  "aliases": [
   "Charts",
   "Graphs",
   "Statistics",
   "Stats",
   "Trends"
  ],
  "keywords": [
   "chart",
   "charts",
   "graph",
   "graphs",
   "analytics",
   "statistics",
   "stats",
   "trend",
   "vishleshan",
   "विश्लेषण",
   "ग्राफ",
   "चार्ट",
   "आँकड़े",
   "vishleshan"
  ],
  "route": "/analytics"
 },
 {
  "id": "reports",
  "app": "sentinel",
  "title": "Reports",
  "hi": "रिपोर्ट",
  "summary": "Build a formal report on the department's letterhead for a district or the whole region and period, then download it as a multi-page PDF or a multi-sheet Excel workbook. Every download is recorded in the audit trail.",
  "category": "assessment",
  "aliases": [
   "Report",
   "PDF report",
   "Excel report",
   "Download report",
   "Export report",
   "Monthly report"
  ],
  "keywords": [
   "report",
   "pdf",
   "excel",
   "xlsx",
   "download",
   "print",
   "monthly report",
   "riport",
   "रिपोर्ट",
   "डाउनलोड"
  ],
  "route": "/reports"
 },
 {
  "id": "audit",
  "app": "sentinel",
  "title": "Audit trail",
  "hi": "ऑडिट ट्रेल",
  "summary": "Who did what and when — every review, escalation, renewal decision, draw, message and export. Rows are SHA-256 hash-chained and re-verified in your browser, so an edited or deleted record is detected.",
  "category": "assessment",
  "aliases": [
   "Audit log",
   "Activity log",
   "History",
   "Logs"
  ],
  "keywords": [
   "audit",
   "log",
   "history",
   "who did",
   "activity",
   "record",
   "trail",
   "ऑडिट",
   "इतिहास",
   "hash chain"
  ],
  "route": "/audit",
  "roles": "deciders"
 },
 {
  "id": "draw",
  "app": "sentinel",
  "title": "Assignment draw",
  "hi": "निरीक्षण आवंटन",
  "summary": "Surprise inspections: each run of the draw pairs an inspector with an institute using a cryptographic random generator (CSPRNG), weighted toward institutes that haven't been visited in a while, with a fairness window so an inspector isn't sent back to the same place. Every draw has a seed reference as proof.",
  "category": "action",
  "aliases": [
   "Draw",
   "Random inspection",
   "Surprise inspection",
   "Assign inspector",
   "Assignments",
   "Lottery"
  ],
  "keywords": [
   "draw",
   "random",
   "surprise",
   "inspection",
   "assign",
   "assignment",
   "lottery",
   "nirikshan",
   "निरीक्षण",
   "आवंटन",
   "inspector assign"
  ],
  "route": "/assignments",
  "roles": "deciders"
 },
 {
  "id": "grievances",
  "app": "sentinel",
  "title": "Grievances",
  "hi": "शिकायतें",
  "summary": "Complaints raised in Setu by institute staff and beneficiaries, each on a clock: first response within 3 days, resolution within 21 days of reaching its current level. Breached ones can be escalated L1 → L2 → L3 (District → State → Ministry), one by one or all at once.",
  "category": "action",
  "aliases": [
   "Complaints",
   "SLA",
   "Grievance escalation"
  ],
  "keywords": [
   "grievance",
   "complaint",
   "shikayat",
   "sla",
   "escalate grievance",
   "breached",
   "शिकायत",
   "समय-सीमा",
   "shikayat"
  ],
  "route": "/grievances",
  "roles": "deciders"
 },
 {
  "id": "renewals",
  "app": "sentinel",
  "title": "Renewals",
  "hi": "नवीनीकरण",
  "summary": "Registration renewals awaiting a decision, separated from those already decided. Approve or reject (rejecting asks for confirmation), with the institute's score and status alongside.",
  "category": "action",
  "aliases": [
   "Registration renewal",
   "Approve renewal",
   "License renewal"
  ],
  "keywords": [
   "renewal",
   "renew",
   "registration",
   "approve",
   "reject",
   "license",
   "navinikaran",
   "नवीनीकरण",
   "मंज़ूरी"
  ],
  "route": "/renewals",
  "roles": "deciders"
 },
 {
  "id": "inspectors",
  "app": "sentinel",
  "title": "Inspectors",
  "hi": "निरीक्षक",
  "summary": "The field team for your region: who is assigned to which sites, whether they're available, on site or offline, unread replies and the last message with each.",
  "category": "communication",
  "aliases": [
   "Field team",
   "Inspector list"
  ],
  "keywords": [
   "inspectors",
   "field team",
   "inspector list",
   "who is assigned",
   "nirikshak",
   "निरीक्षक",
   "staff on field",
   "nirikshak"
  ],
  "route": "/inspectors",
  "roles": "deciders"
 },
 {
  "id": "connect-inspector",
  "app": "sentinel",
  "title": "Connect with Inspector",
  "hi": "निरीक्षक से जुड़ें",
  "summary": "Message the inspector assigned to a site directly from Sentinel: send a message, an instruction or an update request, mark it urgent, pick a quick message, see the full conversation history and delivery/read ticks. Open it from an institute's page (Assigned inspector card), the Inspectors page or the draw. Voice and video calling is planned for later.",
  "category": "communication",
  "aliases": [
   "Message inspector",
   "Contact inspector",
   "Chat with inspector",
   "Talk to inspector"
  ],
  "keywords": [
   "connect",
   "contact",
   "message",
   "chat",
   "talk",
   "baat",
   "baat karni",
   "sampark",
   "inspector se",
   "assigned inspector",
   "संपर्क",
   "संदेश",
   "बात",
   "inspector se baat"
  ],
  "route": "/inspectors",
  "how": [
   "Open the institute (Register → the institute) or the Inspectors page",
   "Press Connect with Inspector",
   "Type your message, choose Message / Instruction / Update request, and send"
  ],
  "roles": "deciders"
 },
 {
  "id": "language-region",
  "app": "sentinel",
  "title": "English + Hindi",
  "hi": "अंग्रेज़ी + हिन्दी",
  "summary": "Sentinel shows every label in English with Hindi beneath it. The EN | हिन्दी switch in the top strip puts Hindi first. There is no separate language or region picker — data is scoped by your role.",
  "category": "settings",
  "aliases": [
   "Language",
   "Hindi",
   "Change language",
   "Bhasha"
  ],
  "keywords": [
   "language",
   "bhasha",
   "hindi",
   "english",
   "change language",
   "translate",
   "भाषा",
   "हिन्दी"
  ]
 },
 {
  "id": "display-mode",
  "app": "sentinel",
  "title": "Display mode",
  "hi": "प्रदर्शन मोड",
  "summary": "Light (default), Dark, or High contrast (black, white and yellow, no transparency or motion). Switch from the sun/moon/contrast buttons at the top, the account menu, or press Shift+T.",
  "category": "settings",
  "aliases": [
   "Dark mode",
   "Light mode",
   "High contrast",
   "Theme",
   "Night mode"
  ],
  "keywords": [
   "dark",
   "light",
   "theme",
   "contrast",
   "night",
   "mode",
   "गहरा",
   "डार्क"
  ]
 },
 {
  "id": "text-size",
  "app": "sentinel",
  "title": "Text size",
  "hi": "अक्षर आकार",
  "summary": "A−, A and A+ at the top right scale the whole dashboard, as on every government portal (GIGW).",
  "category": "settings",
  "aliases": [
   "Font size",
   "Bigger text",
   "Zoom"
  ],
  "keywords": [
   "text size",
   "font",
   "bigger",
   "smaller",
   "zoom",
   "अक्षर"
  ]
 },
 {
  "id": "shortcuts",
  "app": "sentinel",
  "title": "Keyboard shortcuts",
  "hi": "कीबोर्ड शॉर्टकट",
  "summary": "Press ? to see them all. g then a letter goes to a page (g a Alerts, g c Cameras, g i Inspectors…), / jumps to search, y opens Yukt.",
  "category": "help",
  "aliases": [
   "Shortcuts",
   "Hotkeys"
  ],
  "keywords": [
   "keyboard",
   "shortcut",
   "hotkey",
   "keys",
   "शॉर्टकट"
  ],
  "route": "/accessibility"
 },
 {
  "id": "accessibility",
  "app": "sentinel",
  "title": "Accessibility",
  "hi": "सुगम्यता",
  "summary": "Built to follow GIGW 3.0 and WCAG 2.1 AA: screen reader support, full keyboard use, high contrast, text resizing, status always shown as a word and not only a colour, table views for charts.",
  "category": "help",
  "aliases": [
   "Screen reader",
   "Accessibility statement"
  ],
  "keywords": [
   "accessibility",
   "screen reader",
   "blind",
   "disability",
   "gigw",
   "wcag",
   "सुगम्यता"
  ],
  "route": "/accessibility"
 },
 {
  "id": "filters",
  "app": "sentinel",
  "title": "Filters, sorting and saved views",
  "hi": "फ़िल्टर और क्रम",
  "summary": "Every list has one toolbar: quick status tabs, smart search (several words, \"quoted phrase\", -exclude), multi-select filters with counts, score ranges, date ranges, multi-level sort, grouping, saved views and CSV export.",
  "category": "help",
  "aliases": [
   "Filter",
   "Sort",
   "Search",
   "Saved views",
   "Export CSV"
  ],
  "keywords": [
   "filter",
   "sort",
   "search",
   "group",
   "saved view",
   "export",
   "csv",
   "फ़िल्टर",
   "खोज"
  ]
 },
 {
  "id": "ticker",
  "app": "sentinel",
  "title": "Live ticker",
  "hi": "लाइव पट्टी",
  "summary": "The running strip under the menu shows live updates — critical alerts, compliance, cameras offline — and each item opens the page behind it. Hover or press pause to stop it.",
  "category": "monitoring",
  "aliases": [
   "Live updates",
   "Billboard",
   "News strip"
  ],
  "keywords": [
   "ticker",
   "live",
   "running",
   "billboard",
   "updates",
   "ताज़ा"
  ]
 },
 {
  "id": "yukt",
  "app": "sentinel",
  "title": "Yukt",
  "hi": "युक्त",
  "summary": "Yukt is Sentinel's built-in assistant. It answers from live dashboard data and from its knowledge of Sentinel, Setu and Nayan, finds features, explains pages, takes actions after you confirm (escalate, resolve, report, theme), and replies in 22 Indian languages.",
  "category": "help",
  "aliases": [
   "Assistant"
  ],
  "keywords": [
   "yukt",
   "assistant",
   "ai",
   "chatbot",
   "bot",
   "help",
   "युक्त",
   "सहायक",
   "chatbot",
   "help bot"
  ]
 },
 {
  "id": "setu-about",
  "app": "setu",
  "title": "About Setu",
  "hi": "Setu क्या है",
  "summary": "Setu is the web dashboard (a website, like Sentinel) for institutes and beneficiaries. Institute staff see their own institute's compliance score and findings and respond to them; beneficiaries and staff raise grievances, which officials then handle in Sentinel.",
  "category": "about",
  "aliases": [
   "Setu",
   "Setu app",
   "Institute app",
   "Beneficiary app"
  ],
  "keywords": [
   "setu",
   "institute app",
   "beneficiary",
   "staff app",
   "सेतु"
  ]
 },
 {
  "id": "setu-raise-grievance",
  "app": "setu",
  "title": "Raise a grievance",
  "hi": "शिकायत दर्ज करें",
  "summary": "Institute staff and beneficiaries file a grievance in Setu (subject and description). It appears in Sentinel's Grievances page with its response clock.",
  "category": "institute",
  "aliases": [
   "File complaint",
   "Submit grievance"
  ],
  "keywords": [
   "raise grievance",
   "file complaint",
   "submit complaint",
   "new complaint",
   "shikayat darj",
   "complaint karna",
   "शिकायत दर्ज",
   "complaint register karna"
  ]
 },
 {
  "id": "setu-compliance",
  "app": "setu",
  "title": "Institute's own compliance score",
  "hi": "संस्था का अपना अनुपालन स्कोर",
  "summary": "An institute sees its own compliance score, status and the findings behind it in Setu — never another institute's.",
  "category": "institute",
  "aliases": [
   "My score",
   "Institute score",
   "My institute"
  ],
  "keywords": [
   "my score",
   "own score",
   "institute sees",
   "my institute",
   "hamara score",
   "apna score"
  ]
 },
 {
  "id": "setu-respond",
  "app": "setu",
  "title": "Respond to findings",
  "hi": "निष्कर्षों का जवाब",
  "summary": "Institutes answer inspection findings and alerts from Setu, attaching documents as evidence of corrective action.",
  "category": "institute",
  "aliases": [
   "Reply to finding",
   "Corrective action",
   "Respond to alert"
  ],
  "keywords": [
   "respond",
   "reply",
   "finding",
   "corrective",
   "action taken",
   "jawab"
  ]
 },
 {
  "id": "setu-documents",
  "app": "setu",
  "title": "Upload documents",
  "hi": "दस्तावेज़ अपलोड",
  "summary": "Institutes upload documents (for renewals and corrective actions) in Setu; officials read them on the institute's page in Sentinel.",
  "category": "institute",
  "aliases": [
   "Upload document",
   "Documents",
   "Registration documents",
   "File upload"
  ],
  "keywords": [
   "upload",
   "document",
   "documents",
   "certificate",
   "file",
   "dastavez",
   "दस्तावेज़"
  ]
 },
 {
  "id": "setu-track-grievance",
  "app": "setu",
  "title": "Track grievance status",
  "hi": "शिकायत की स्थिति",
  "summary": "The person who raised a grievance follows its status (open, in review, resolved) in Setu.",
  "category": "institute",
  "aliases": [
   "Grievance status",
   "Complaint status"
  ],
  "keywords": [
   "track",
   "status of my complaint",
   "my grievance",
   "kya hua complaint"
  ]
 },
 {
  "id": "setu-renewal-apply",
  "app": "setu",
  "title": "Apply for registration renewal",
  "hi": "नवीनीकरण के लिए आवेदन",
  "summary": "Institutes apply for renewal and submit supporting documents in Setu; the decision is made by officials in Sentinel's Renewals page.",
  "category": "institute",
  "aliases": [
   "Renewal application",
   "Apply renewal"
  ],
  "keywords": [
   "apply renewal",
   "renewal application",
   "submit renewal",
   "aavedan"
  ]
 },
 {
  "id": "nayan-about",
  "app": "nayan",
  "title": "About Nayan",
  "hi": "Nayan क्या है",
  "summary": "Nayan is the inspectors' mobile app (Android, Play Store). Inspectors receive their assignments from the draw, check in at the site, capture sealed evidence, file inspection reports and receive officials' messages. Inspectors don't sign in to Sentinel.",
  "category": "about",
  "aliases": [
   "Nayan",
   "Nayan app",
   "Inspector app",
   "Field app"
  ],
  "keywords": [
   "nayan",
   "inspector app",
   "field app",
   "mobile app",
   "नयन"
  ]
 },
 {
  "id": "nayan-assignments",
  "app": "nayan",
  "title": "Assigned inspections",
  "hi": "आवंटित निरीक्षण",
  "summary": "Inspectors see the inspections the draw assigned to them, with dispatch time and site, in Nayan.",
  "category": "field",
  "aliases": [
   "My inspections",
   "Inspection list",
   "Today's visits"
  ],
  "keywords": [
   "my inspections",
   "assigned to me",
   "visit list",
   "inspection schedule"
  ]
 },
 {
  "id": "nayan-evidence",
  "app": "nayan",
  "title": "Capture evidence",
  "hi": "साक्ष्य लेना",
  "summary": "Photos and video are captured in Nayan with GPS and device ID; a SHA-256 hash is computed on the device and re-verified on the server, so evidence can't be swapped.",
  "category": "field",
  "aliases": [
   "Take photo",
   "Upload evidence",
   "Photo evidence",
   "Video evidence"
  ],
  "keywords": [
   "photo",
   "evidence",
   "capture",
   "upload photo",
   "picture",
   "video",
   "hash",
   "sabut",
   "साक्ष्य",
   "फ़ोटो"
  ]
 },
 {
  "id": "nayan-checkin",
  "app": "nayan",
  "title": "Geofence check-in",
  "hi": "स्थल पर चेक-इन",
  "summary": "Nayan confirms the inspector is physically at the institute (geofence) when the inspection starts.",
  "category": "field",
  "aliases": [
   "Check in",
   "Location check",
   "Geofence"
  ],
  "keywords": [
   "check in",
   "geofence",
   "reached site",
   "location verify",
   "gps"
  ]
 },
 {
  "id": "nayan-report",
  "app": "nayan",
  "title": "File inspection report",
  "hi": "निरीक्षण रिपोर्ट",
  "summary": "Inspectors complete the checklist and file the inspection report from Nayan; it feeds the institute's record in Sentinel.",
  "category": "field",
  "aliases": [
   "Inspection report",
   "Checklist",
   "Submit report"
  ],
  "keywords": [
   "inspection report",
   "checklist",
   "submit report",
   "file report",
   "visit report"
  ]
 },
 {
  "id": "nayan-messages",
  "app": "nayan",
  "title": "Messages from officials",
  "hi": "अधिकारियों के संदेश",
  "summary": "Messages officials send through Connect with Inspector arrive in Nayan; the inspector replies from the field and delivery/read status flows back to Sentinel.",
  "category": "field",
  "aliases": [
   "Inspector inbox",
   "Reply to official"
  ],
  "keywords": [
   "inspector reply",
   "inbox",
   "receive message",
   "field message"
  ]
 },
 {
  "id": "nayan-calls",
  "app": "nayan",
  "title": "Voice and video calls",
  "hi": "वॉइस और वीडियो कॉल",
  "summary": "Voice and video calling with inspectors is planned for later. For now, messaging is how officials reach inspectors from Sentinel.",
  "category": "field",
  "aliases": [
   "Call inspector",
   "Video call",
   "Phone call"
  ],
  "keywords": [
   "call",
   "video call",
   "phone",
   "voice",
   "ring",
   "कॉल"
  ]
 }
];

const YUKT_APPS = {
  sentinel: { name: "Sentinel", hi: "Sentinel", who: "officials", url: null },
  setu: { name: "Setu", hi: "Setu", who: "institutes and beneficiaries", url: import.meta.env?.VITE_SETU_URL || null },
  nayan: { name: "Nayan", hi: "Nayan", who: "inspectors in the field", url: import.meta.env?.VITE_NAYAN_URL || null },
};

/**
 * Concepts: many surface forms, one meaning. This is what lets "camera",
 * "CCTV", "कैमरा" and "kamera" find the same feature, and "baat karni hai",
 * "contact", "message" all reach Connect with Inspector.
 */
const YUKT_CONCEPTS = {
  camera: ["camera", "cameras", "cam", "cctv", "kamera", "camra", "feed", "feeds", "कैमरा", "कैमरे", "सीसीटीवी", "फ़ीड"],
  inspector: ["inspector", "inspectors", "nirikshak", "inspektor", "field", "निरीक्षक", "इंस्पेक्टर"],
  message: ["message", "messages", "msg", "chat", "baat", "bat", "talk", "contact", "sampark", "connect", "reach", "संदेश", "बात", "संपर्क", "मैसेज"],
  complaint: ["complaint", "complaints", "grievance", "grievances", "shikayat", "shikayaten", "शिकायत", "शिकायतें"],
  alert: ["alert", "alerts", "warning", "warnings", "chetavani", "anomaly", "anomalies", "चेतावनी", "अलर्ट"],
  chart: ["chart", "charts", "graph", "graphs", "analytics", "statistics", "stats", "trend", "trends", "vishleshan", "ग्राफ", "चार्ट", "विश्लेषण"],
  map: ["map", "maps", "naksha", "location", "locations", "नक्शा", "मानचित्र"],
  report: ["report", "reports", "riport", "pdf", "excel", "xlsx", "print", "रिपोर्ट"],
  renewal: ["renewal", "renewals", "renew", "registration", "license", "licence", "navinikaran", "नवीनीकरण"],
  district: ["district", "districts", "zila", "jila", "zilla", "heatmap", "ज़िला", "जिला", "ज़िले"],
  institute: ["institute", "institutes", "sanstha", "shelter", "hostel", "home", "homes", "संस्था", "संस्थाएँ"],
  draw: ["draw", "random", "surprise", "lottery", "assign", "assignment", "assignments", "आवंटन", "ड्रॉ"],
  audit: ["audit", "log", "logs", "history", "trail", "ऑडिट"],
  language: ["language", "languages", "bhasha", "hindi", "translate", "भाषा", "हिंदी"],
  region: ["region", "state", "rajya", "jurisdiction", "क्षेत्र", "राज्य"],
  theme: ["dark", "light", "theme", "contrast", "night", "गहरा", "डार्क"],
  evidence: ["evidence", "photo", "photos", "picture", "sabut", "proof", "साक्ष्य", "फ़ोटो", "सबूत"],
  upload: ["upload", "document", "documents", "dastavez", "file", "certificate", "दस्तावेज़"],
  call: ["call", "calls", "phone", "video-call", "voice", "कॉल"],
  help: ["help", "madad", "assistant", "yukt", "मदद", "युक्त"],
};
const CONCEPT_OF = (() => {
  const m = new Map();
  Object.entries(YUKT_CONCEPTS).forEach(([c, forms]) => forms.forEach((f) => m.set(f, c)));
  return m;
})();

// Words that carry intent, not topic — kept out of topic matching.
const YUKT_STOP = new Set(
  ("a an the is are am to of in on for and or me my i you it this that these those do does can could should would how what where which who kya hai hain ho " +
    "mujhe muje hume humein mera meri hamara karna karni karne karu karun kare karo kar ka ki ke ko se mein me par pe tak bhi hi ye yeh woh wo is us " +
    "kaha kahan kidhar milega milegi milta milti dikhao dikha show open kholo khol use feature features option options available please pls batao bataiye " +
    "chahiye chaiye jaana jana jao hota hoti kaise kis kaun kaunsa kaunse wala wale waali sab saare simple language explain samjhao samjha " +
    "है हैं को का की के में से मुझे कहाँ कहां क्या कैसे खोलो दिखाओ करना करनी बताओ").split(/\s+/)
);

function ytokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Edit distance, capped — for typos like "camra", "grievence", "inspecter". */
function ylev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
const typoOk = (t, w) => t.length >= 4 && w.length >= 4 && ylev(t, w) <= (t.length >= 7 ? 2 : 1);

function trigrams(w) {
  const s = `  ${w} `;
  const out = new Set();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}
function trigramSim(a, b) {
  if (a === b) return 1;
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}

/** Pre-computed per document: its words, alias words and concepts. */
const YUKT_INDEX = YUKT_KB.map((d) => {
  const titleWords = ytokens(`${d.title} ${d.hi} ${d.aliases.join(" ")}`);
  const keyWords = ytokens(d.keywords.join(" "));
  const bodyWords = ytokens(d.summary);
  const all = [...titleWords, ...keyWords];
  const concepts = new Set(all.map((w) => CONCEPT_OF.get(w)).filter(Boolean));
  const labels = [d.title, ...d.aliases];
  return { d, titleWords: new Set(titleWords), keyWords: new Set(keyWords), bodyWords: new Set(bodyWords), vocab: [...new Set(all)], concepts, labels, phrases: d.keywords.filter((k) => k.includes(" ")).map((k) => k.toLowerCase()) };
});

/** Relevance of one entry to a query: exact > concept > prefix > fuzzy > body. */
function yscore(entry, qTokens, qText) {
  let s = 0;
  const topic = qTokens.filter((t) => !YUKT_STOP.has(t) && t.length > 1);
  topic.forEach((t) => {
    const concept = CONCEPT_OF.get(t);
    if (entry.titleWords.has(t)) s += 6;
    else if (entry.keyWords.has(t)) s += 4;
    else if (concept && entry.concepts.has(concept)) s += 4.5;
    else {
      let best = 0;
      entry.vocab.forEach((w) => {
        if (w.length > 2 && t.length > 1 && w.startsWith(t)) best = Math.max(best, 2.5);
        else if (typoOk(t, w)) best = Math.max(best, 3.5);
        else if (t.length > 3 && w.length > 3) {
          const sim = trigramSim(t, w);
          if (sim >= 0.45) best = Math.max(best, sim * 3.5);
        }
      });
      if (!best && entry.bodyWords.has(t)) best = 0.8;
      s += best;
    }
  });
  entry.phrases.forEach((p) => qText.includes(p) && (s += 3));
  return s;
}

/** Top entries for a query. */
function yuktRetrieve(q, { limit = 5, app = null } = {}) {
  const qt = ytokens(q);
  const text = ` ${String(q).toLowerCase()} `;
  return YUKT_INDEX.filter((e) => !app || e.d.app === app)
    .map((e) => ({ doc: e.d, score: yscore(e, qt, text) }))
    .filter((r) => r.score > 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Autocomplete: as the official types, the features that match — by the
 * start of a name or alias ("c" → Camera, Charts, Complaints…; "ch" → Charts,
 * Chat with inspector…), by meaning (concepts), and by near-spelling.
 */
function yuktSuggest(input, limit = 6) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return [];
  const toks = ytokens(raw);
  const last = toks[toks.length - 1] || raw;
  const head = toks.slice(0, -1);
  const text = ` ${raw} `;
  const out = [];
  YUKT_INDEX.forEach((e) => {
    let s = head.length ? yscore(e, head, text) * 0.6 : 0;
    let label = e.d.title;
    let prefix = 0;
    e.labels.forEach((l, i) => {
      const lw = l.toLowerCase();
      const words = ytokens(lw);
      // Whole-label prefix beats a word inside it; the feature's own name
      // beats an alias; shorter beats longer.
      let p = 0;
      if (lw.startsWith(raw)) p = 12 - Math.min(4, lw.length / 6) + (i === 0 ? 0.6 : 0);
      else if (words.some((w) => w.startsWith(last))) p = 8 - Math.min(3, lw.length / 8) + (i === 0 ? 0.4 : 0);
      if (p > prefix) (prefix = p), (label = l);
    });
    s += prefix;
    if (!prefix && last.length >= 2) {
      if (e.keyWords.has(last) || [...e.keyWords].some((w) => w.startsWith(last))) s += 4;
      const c = CONCEPT_OF.get(last);
      if (c && e.concepts.has(c)) s += 5;
      if (last.length >= 4) {
        let best = 0;
        e.vocab.forEach((w) => (best = Math.max(best, typoOk(last, w) ? 1 : w.length > 3 ? trigramSim(last, w) : 0)));
        if (best >= 0.4) s += best * 5;
      }
    }
    if (s > 2) out.push({ doc: e.d, label, score: s });
  });
  return out.sort((a, b) => b.score - a.score || a.label.length - b.label.length).slice(0, limit);
}

/* ------------------------------------------------------- intent ----------- */
const YI = {
  locate: /(kaha|kahan|kidhar|where|find|milega|milegi|milta|kaise pahunch|go to|le chalo|take me|kaha hai|कहाँ|कहां|मिलेगा)/,
  open: /(\bopen\b|kholo|khol do|khol|dikhao|show me|\bshow\b|use karna|use karni|karna hai|chahiye|jana hai|खोलो|दिखाओ|चाहिए)/,
  explain: /(kya hai|kya karta|kya karti|what is|what does|what's|purpose|explain|samjha|simple|matlab|meaning|use kya|kis liye|kisliye|summar|about|batao|bataiye|क्या है|क्या करता|समझा|उद्देश्य)/,
  how: /(kaise|how (do|can|to|should)|steps|tarika|process|कैसे)/,
  whichApp: /((sentinel|setu|nayan)\s*(mein|me|में)?\s*(hai|he)?\s*(ya|or)\s*(sentinel|setu|nayan))|(which app|kis app|kaunse app|kahan milega.*(app))/,
  list: /(options|features|kya available|kya kya|list|all features|sab kuch|everything|कौन से|सुविधाएँ|what can)/,
  page: /(is section|this section|is page|this page|ye page|yeh page|is screen|this screen|yahan|is feature|this feature|ye feature|yeh feature|यह पेज|इस पेज)/,
  data: /(kitne|kitna|kitni|how many|count|offline|\bband\b|status of|abhi|right now|today|aaj|haal|critical|open alerts|pending|breached|worst|best|lowest|highest|sabse|score of|कितने|आज|गंभीर)/,
};

function yuktIntent(q) {
  const t = String(q).toLowerCase();
  return {
    locate: YI.locate.test(t),
    open: YI.open.test(t),
    explain: YI.explain.test(t),
    how: YI.how.test(t),
    whichApp: YI.whichApp.test(t),
    list: YI.list.test(t),
    page: YI.page.test(t),
    data: YI.data.test(t),
    apps: ["sentinel", "setu", "nayan"].filter((a) => t.includes(a) || t.includes({ sentinel: "सेंटिनल", setu: "सेतु", nayan: "नयन" }[a])),
  };
}

const appLine = (lang, doc) => {
  const app = YUKT_APPS[doc.app];
  if (doc.app === "sentinel") return tr(lang, `${doc.title} is available in Sentinel.`, `${doc.title} (${doc.hi}) Sentinel में उपलब्ध है।`);
  return tr(lang, `This feature is available in ${app.name}.`, `यह सुविधा ${app.name} में उपलब्ध है।`);
};

/**
 * The knowledge engine: answers "where is / open / what is / how do I /
 * which app / what's in Nayan" from the knowledge base, with result cards.
 * Returns null when the question is really about live data (counts, status).
 */
function yuktKnowledge(q, ctx, page) {
  const lang = yuktLang(q);
  const it = yuktIntent(q);
  const results = yuktRetrieve(q, { limit: 5 });
  const top = results[0];
  const featureIntent = it.locate || it.open || it.explain || it.how || it.whichApp || it.list || it.page;

  // "Is section ko simple language mein explain karo" → the page they're on.
  if (it.page && (it.explain || !top)) {
    const here = YUKT_KB.find((d) => d.app === "sentinel" && d.route && (page === d.route || (d.route !== "/" && page?.startsWith(d.route)))) || YUKT_KB.find((d) => d.id === "overview");
    return {
      text: tr(lang, `You're on ${here.title}. ${here.summary}`, `आप ${here.title} (${here.hi}) पेज पर हैं। ${here.summary}`),
      kb: [here],
      how: here.how,
    };
  }

  // "Nayan mein kya available hai?" / "Setu ke features" → the app's list.
  if (it.apps.length === 1 && (it.list || (it.explain && !top) || /available|kya kya|features|सुविधा/.test(q.toLowerCase()))) {
    const app = it.apps[0];
    const docs = YUKT_KB.filter((d) => d.app === app && !d.id.endsWith("-about"));
    const about = YUKT_KB.find((d) => d.id === `${app}-about`) || YUKT_KB.find((d) => d.id === "about-sentinel");
    return {
      text: tr(lang, `${about.summary}\n\nWhat ${YUKT_APPS[app].name} offers:`, `${about.summary}\n\n${YUKT_APPS[app].name} में उपलब्ध सुविधाएँ:`),
      kb: docs.slice(0, 8),
    };
  }

  // "Sentinel kya karta hai?" / "Is dashboard ka purpose kya hai?"
  if (it.explain && (/\b(sentinel|dashboard|portal|website)\b|सेंटिनल|डैशबोर्ड/.test(q.toLowerCase())) && (!top || top.doc.category === "about" || top.score < 7)) {
    const d = YUKT_KB.find((x) => x.id === "about-sentinel");
    return {
      text: `${d.summary}\n\n${tr(lang, "The main areas:", "मुख्य हिस्से:")}`,
      kb: ["overview", "alerts", "cameras", "grievances", "connect-inspector", "reports"].map((id) => YUKT_KB.find((x) => x.id === id)),
    };
  }

  // "Monitoring options batao" → a category.
  const cat = /monitor|nigrani|निगरानी/.test(q.toLowerCase()) ? "monitoring" : /communicat|sampark|contact options/.test(q.toLowerCase()) ? "communication" : /assess|report options|analysis/.test(q.toLowerCase()) ? "assessment" : null;
  if (cat && (it.list || it.explain)) {
    const docs = YUKT_KB.filter((d) => d.app === "sentinel" && d.category === cat);
    return { text: tr(lang, `Sentinel's ${cat} options:`, `Sentinel के ${cat === "monitoring" ? "निगरानी" : cat === "communication" ? "संपर्क" : "आकलन"} विकल्प:`), kb: docs };
  }

  if (!top) return null;
  // A live-data question ("kitne cameras offline hain") goes to the data engine.
  if (it.data && !featureIntent) return null;
  if (!featureIntent && top.score < 6) return null;

  const d = top.doc;
  const others = results.slice(1).filter((r) => r.score >= top.score * 0.6).map((r) => r.doc);

  // "Ye feature Sentinel mein hai ya Setu mein?"
  if (it.whichApp) {
    return {
      text: `${appLine(lang, d)} ${d.app === "sentinel" ? "" : tr(lang, `(${YUKT_APPS[d.app].name} is for ${YUKT_APPS[d.app].who}.)`, `(${YUKT_APPS[d.app].name} ${d.app === "setu" ? "संस्थाओं और लाभार्थियों" : "क्षेत्रीय निरीक्षकों"} के लिए है।)`)}`.trim(),
      kb: [d, ...others.slice(0, 2)],
    };
  }

  const lead = appLine(lang, d);
  const body = it.how && d.how ? "" : ` ${d.summary}`;
  return {
    text: `${lead}${body}`,
    kb: [d, ...others.slice(0, 2)],
    how: it.how || d.id === "connect-inspector" ? d.how : undefined,
    // "Mujhe camera open karna hai" → take them there.
    nav: it.open && !it.explain && !it.how && d.app === "sentinel" && d.route && top.score >= 6 && (!d.roles || ctx.isDecider) ? d.route : undefined,
  };
}

/* --------------------------------------------------------- the brain ------ */
/**
 * One question in, one reply out. Order of preference:
 *   1. a local action intent ("escalate the Ashray alert") → a proposal
 *   2. the AI backend (/assistant/chat), if /assistant/status said it's there
 *   3. the local data engine (yuktReply) — always available, never invents
 * For languages other than Hindi/English, Bhashini translates the question to
 * English on the way in and the answer back on the way out.
 */
async function askYukt(text, ctx, { lang, history, status, page }) {
  const foreign = !NATIVE_LANGS.has(lang);
  const canTranslate = foreign && status?.bhashini;
  let q = text;
  let note = null;

  if (canTranslate) {
    try {
      const { data } = await api.post(API.assistant.translate(), { text, source: lang, target: "en" });
      q = data?.text || text;
    } catch {
      note = "Bhashini translation failed — answering in English.";
    }
  } else if (foreign) {
    note = "Bhashini isn't connected on the server yet, so I'm answering in English. (Hindi and English work without it.)";
  }

  let reply = yuktLocalAction(q, ctx);
  let source = "local";
  // Retrieval runs every time: it grounds the AI answer and gives the cards.
  const knowledge = reply ? null : yuktKnowledge(q, ctx, page);
  const retrieved = yuktRetrieve(q, { limit: 6 });

  if (!reply && status?.llm) {
    try {
      const { data } = await api.post(API.assistant.chat(), {
        message: q,
        lang: foreign ? "en" : lang === "auto" ? yuktLang(q) : lang,
        history: history.slice(-8),
        page,
        // Only ids travel: the server looks the text up in its own copy of the
        // knowledge base and adds what its retrieval finds.
        doc_ids: [...new Set([...(knowledge?.kb || []).map((d) => d.id), ...retrieved.map((r) => r.doc.id)])].slice(0, 8),
        context: yuktSnapshot(ctx, page),
      });
      const acts = normaliseAiActions(data?.actions, ctx);
      const sourceDocs = (data?.sources || []).map((id) => YUKT_KB.find((d) => d.id === id)).filter(Boolean);
      reply = {
        text: data?.reply || "",
        items: data?.items,
        ...acts,
        proposals: acts.proposals.length ? acts.proposals : undefined,
        kb: acts.kb?.length ? acts.kb : sourceDocs.length ? sourceDocs.slice(0, 3) : knowledge?.kb?.slice(0, 3),
        how: knowledge?.how,
      };
      source = "ai";
    } catch {
      reply = null; // fall through to the local engines
    }
  }

  if (!reply && knowledge) reply = knowledge;
  if (!reply) {
    reply = yuktReply(q, ctx);
    // Nothing in the live data either: offer the closest features instead.
    if (reply.fallback && retrieved.length) {
      const lng = yuktLang(q);
      reply = {
        text: tr(lng, "Here's what I found in Sentinel, Setu and Nayan that matches:", "Sentinel, Setu और Nayan में मिलती-जुलती सुविधाएँ:"),
        kb: retrieved.slice(0, 4).map((r) => r.doc),
      };
    }
  }

  if (canTranslate && reply.text) {
    try {
      const { data } = await api.post(API.assistant.translate(), { text: reply.text, source: "en", target: lang });
      if (data?.text) reply = { ...reply, text: data.text, original: reply.text };
    } catch {
      note = "Bhashini couldn't translate the reply, so it's in English.";
    }
  }

  return { ...reply, source, note, lang: canTranslate ? lang : undefined };
}

const YUKT_SUGGEST = {
  en: ["What does Sentinel do?", "Today's summary", "Critical alerts", "Where are the cameras?", "Message an inspector", "What's in Nayan?", "Download report in Excel"],
  hi: ["Sentinel क्या करता है?", "आज का हाल", "गंभीर चेतावनी", "Camera kaha milega?", "Inspector se baat karni hai", "Nayan mein kya available hai?", "Excel रिपोर्ट बनाओ"],
};

/** Bolds the part of a suggestion that matches what was typed. */
function Highlight({ text, q }) {
  const needle = String(q || "").trim().split(/\s+/).pop()?.toLowerCase();
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-[#FF9933]/25 px-0.5 text-inherit">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

/** A result card: Sentinel features open in place; Setu / Nayan say where they live. */
function YuktFeatureCard({ doc, onOpen }) {
  const app = YUKT_APPS[doc.app];
  const badge = {
    sentinel: "bg-[#0B2A6F]/10 text-[#0B2A6F]",
    setu: "bg-[#138808]/12 text-[#138808]",
    nayan: "bg-[#FF9933]/15 text-[#b35f00]",
  }[doc.app];
  return (
    <div className="snt-yukt-card flex-col !gap-1.5">
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="snt-navy truncate text-[12.5px] font-semibold">{doc.title}</p>
          <p className="snt-script-hi truncate text-[10.5px] text-[#8a93a8]">{doc.hi}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${badge}`}>
          {doc.app === "sentinel" ? "Sentinel" : `Available in ${app.name}`}
        </span>
      </div>
      <p className="line-clamp-2 text-[11px] leading-snug text-[#6b7590]">{doc.summary}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {doc.app === "sentinel" && doc.route && (
          <button type="button" onClick={() => onOpen(doc.route)} className="snt-yukt-ok !px-2.5 !py-1 !text-[11px]">
            Open {doc.title} →
          </button>
        )}
        {doc.app !== "sentinel" &&
          (app.url ? (
            <a href={app.url} target="_blank" rel="noreferrer" className="snt-yukt-action snt-glass !py-1 !text-[11px]">
              Open {app.name} ↗
            </a>
          ) : (
            <span className="text-[10.5px] text-[#8a93a8]">
              {app.name} is the app for {app.who}.
            </span>
          ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the UI ---- */
function YuktOrb({ size = 44 }) {
  return (
    <span className="snt-yukt-orb" style={{ width: size, height: size }} aria-hidden="true">
      <span className="snt-yukt-orb-ring" />
      <span className="snt-yukt-orb-core">
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <path d="M12 2.8l1.9 5.3 5.3 1.9-5.3 1.9L12 17.2l-1.9-5.3L4.8 10l5.3-1.9z" fill="url(#yukt-g)" />
          <circle cx="18.6" cy="17.6" r="1.7" fill="#138808" />
          <circle cx="5.6" cy="18.8" r="1.1" fill="#FF9933" />
          <defs>
            <linearGradient id="yukt-g" x1="4" y1="3" x2="20" y2="17">
              <stop offset="0" stopColor="#FF9933" />
              <stop offset="1" stopColor="#0B2A6F" />
            </linearGradient>
          </defs>
        </svg>
      </span>
    </span>
  );
}

function Yukt({ signals }) {
  const { role, user, canHandleGrievances } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;

  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [chosenLang, setChosenLang] = useState(() => readStore("localStorage", "sentinel.yuktLang", null) || (["en", "hi"].includes(readPrefs().lang) ? "auto" : readPrefs().lang));
  const [detected, setDetected] = useState("hi");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState(null); // {llm, bhashini, model?} | {local: true}
  const [busyProposal, setBusyProposal] = useState(null);
  const [sel, setSel] = useState(-1);
  const [acOff, setAcOff] = useState(false);
  // Autocomplete: features as you type (short inputs; long sentences are questions).
  const sugs = useMemo(() => {
    const v = input.trim();
    if (!v || acOff || listening || v.split(/\s+/).length > 4) return [];
    return yuktSuggest(v, 6);
  }, [input, acOff, listening]);
  useEffect(() => setAcOff(false), [input]);
  const [speaking, setSpeaking] = useState(null);
  const [messages, setMessages] = useState(() => [
    {
      role: "bot",
      text: `नमस्ते${user?.name ? ` ${user.name.split(" ")[0]}` : ""}! मैं युक्त हूँ — Sentinel का सहायक। Ask in Hindi, Hinglish, English — or pick one of 22 Indian languages above.`,
      suggest: true,
    },
  ]);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const recRef = useRef(null);
  const audioRef = useRef(null);

  const grievances = useApi(API.grievances.list(), { fallback: null, optional: true, skip: !open || !canHandleGrievances });
  const uiLang = chosenLang === "auto" ? detected : NATIVE_LANGS.has(chosenLang) ? chosenLang : "en";
  const langMeta = YUKT_LANGS.find((l) => l.code === chosenLang) || YUKT_LANGS[0];

  useEffect(() => writeStore("localStorage", "sentinel.yuktLang", chosenLang), [chosenLang]);

  // Ask the backend once what it can do. A 404 (or no backend) = local mode.
  useEffect(() => {
    if (!open || status) return;
    api
      .get(API.assistant.status())
      .then(({ data }) => setStatus({ llm: Boolean(data?.llm), bhashini: Boolean(data?.bhashini) }))
      .catch(() => setStatus({ llm: false, bhashini: false, local: true }));
  }, [open, status]);

  // The "y" shortcut and anything else can toggle Yukt with this event.
  useEffect(() => {
    const on = () => setOpen((v) => !v);
    window.addEventListener("sentinel:yukt", on);
    return () => window.removeEventListener("sentinel:yukt", on);
  }, []);

  // A one-time greeting bubble per session, so the button explains itself.
  useEffect(() => {
    if (readStore("sessionStorage", "sentinel.yuktGreeted", false)) return undefined;
    const show = setTimeout(() => setTeaser(true), 2500);
    const hide = setTimeout(() => setTeaser(false), 11000);
    writeStore("sessionStorage", "sentinel.yuktGreeted", true);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTeaser(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const ctx = useMemo(
    () => ({
      role,
      institutes: signals.institutes,
      instituteIndex: signals.instituteIndex,
      openAlerts: signals.openAlerts,
      dark: signals.dark,
      summary: signals.summary,
      grievances: canHandleGrievances ? (grievances.loading ? null : grievances.data || []) : [],
      isDecider,
      pendingRenewals: worstFirst(signals.institutes.filter((i) => i.renewal_status === "pending")),
    }),
    [signals, grievances.loading, grievances.data, canHandleGrievances, isDecider, role]
  );

  function pickSuggestion(s) {
    setSel(-1);
    const d = s.doc;
    const lng = yuktLang(input) === "hi" || uiLang === "hi" ? "hi" : "en";
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text: s.label },
      { role: "bot", text: appLine(lng, d), kb: [d], how: d.how },
    ]);
  }

  async function send(text) {
    const q = String(text ?? input).trim();
    if (!q || typing) return;
    setInput("");
    if (chosenLang === "auto") setDetected(yuktLang(q));
    const history = messages.filter((m) => m.text).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.original || m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setTyping(true);
    let reply;
    try {
      reply = await askYukt(q, ctx, { lang: chosenLang, history, status, page: location.pathname });
    } catch {
      reply = yuktReply(q, ctx);
    }
    // A short, human pause — instant replies read as canned.
    await new Promise((r) => setTimeout(r, 350 + Math.min(600, (reply.text?.length || 0) * 3)));
    setTyping(false);
    setMessages((m) => {
      // Say the Bhashini caveat once, not under every answer.
      const lastNote = [...m].reverse().find((x) => x.role === "bot" && x.note)?.note;
      return [...m, { role: "bot", ...reply, note: reply.note && reply.note === lastNote ? null : reply.note }];
    });
    if (reply.theme) setThemeMode(reply.theme);
    if (reply.nav) setTimeout(() => navigate(reply.nav), 400);
  }

  async function confirmProposal(msgIndex, p) {
    setBusyProposal(`${msgIndex}-${p.id}`);
    const lang = uiLang;
    try {
      if (p.type === "alert_action") await api.patch(API.alerts.action(p.id), { action: p.action });
      else if (p.type === "grievance_resolve") await api.patch(API.grievances.status(p.id), { status: "resolved" });
      else if (p.type === "grievance_escalate") await api.post(API.grievances.escalate(p.id), { reason: "Escalated via Yukt" });
      api.post(API.audit.record(), { action: "assistant.action", entity_type: p.type.split("_")[0], entity_id: p.id, entity_label: p.sub, detail: p.title }).catch(() => {});
      setMessages((m) => [
        ...m.map((x, i) => (i === msgIndex ? { ...x, done: { ...(x.done || {}), [p.id]: "ok" } } : x)),
        { role: "bot", text: tr(lang, `Done: ${p.title}. This is recorded in the audit trail.`, `हो गया: ${p.title}। यह ऑडिट ट्रेल में दर्ज है।`) },
      ]);
      toast.success(p.title);
      grievances.reload();
      window.dispatchEvent(new CustomEvent("sentinel:refresh"));
    } catch (err) {
      const msg = isMissingEndpoint(err) ? "The backend doesn't support this action yet." : errorMessage(err, "That didn't go through");
      setMessages((m) => [...m, { role: "bot", text: tr(lang, `Couldn't do that: ${msg}`, `यह नहीं हो पाया: ${msg}`) }]);
    } finally {
      setBusyProposal(null);
    }
  }

  function cancelProposal(msgIndex, p) {
    setMessages((m) => m.map((x, i) => (i === msgIndex ? { ...x, done: { ...(x.done || {}), [p.id]: "cancelled" } } : x)));
  }

  /* voice in */
  const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const canBhashiniAsr = status?.bhashini && typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia;
  const useBrowserAsr = SpeechRec && (NATIVE_LANGS.has(chosenLang) || !canBhashiniAsr);
  const micAvailable = useBrowserAsr || canBhashiniAsr;

  async function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (useBrowserAsr) {
      const rec = new SpeechRec();
      rec.lang = langMeta.speech || "hi-IN";
      rec.interimResults = true;
      rec.onresult = (e) => {
        const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
        setInput(t);
        if (e.results[e.results.length - 1].isFinal) {
          rec.stop();
          send(t);
        }
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
      return;
    }
    // Bhashini ASR for the other 20 languages.
    try {
      const session = await startWavRecording();
      recRef.current = session;
      setListening(true);
      const auto = setTimeout(() => session.stop(), 8000);
      const wav = await session.done;
      clearTimeout(auto);
      setListening(false);
      const { data } = await api.post(API.assistant.asr(), { audio_base64: bufferToBase64(wav), lang: chosenLang, sample_rate: 16000 });
      if (data?.text) send(data.text);
    } catch {
      setListening(false);
      toast.error("Couldn't use the microphone or reach Bhashini");
    }
  }

  /* voice out */
  async function speak(i, m) {
    if (speaking === i) {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setSpeaking(null);
      return;
    }
    const code = m.lang || (chosenLang === "auto" ? detected : chosenLang);
    setSpeaking(i);
    if (status?.bhashini && !NATIVE_LANGS.has(code)) {
      try {
        const { data } = await api.post(API.assistant.tts(), { text: m.text, lang: code });
        const audio = new Audio(`data:${data.mime || "audio/wav"};base64,${data.audio_base64}`);
        audioRef.current = audio;
        audio.onended = () => setSpeaking(null);
        await audio.play();
        return;
      } catch {
        /* fall back to the browser voice */
      }
    }
    if (!window.speechSynthesis) {
      setSpeaking(null);
      return;
    }
    const u = new SpeechSynthesisUtterance(m.text);
    u.lang = (YUKT_LANGS.find((l) => l.code === code) || YUKT_LANGS[1]).speech;
    u.rate = 0.98;
    u.onend = () => setSpeaking(null);
    u.onerror = () => setSpeaking(null);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function clearChat() {
    setMessages([{ role: "bot", text: tr(uiLang, "Fresh start. What would you like to know?", "नई शुरुआत। क्या जानना चाहेंगे?"), suggest: true }]);
  }

  // Only ever "Yukt" to the user — never the name of the model behind it.
  const modeLabel = !status ? "connecting…" : status.llm ? `Assistant · online${status.bhashini ? " · 22 languages" : ""}` : "Knowledge mode";

  return (
    <>
      {open && (
        <section className="snt-yukt-panel" role="dialog" aria-label="Yukt assistant">
          <header className="snt-yukt-head">
            <YuktOrb size={38} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-[15px] font-semibold leading-tight text-white">
                Yukt <span className="snt-hi text-[13px] font-medium text-[#ffcf99]">युक्त</span>
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/65" title={status?.llm ? "Yukt is online" : "Yukt is answering from live dashboard data and its built-in knowledge of Sentinel, Setu and Nayan"}>
                <span className={`h-1.5 w-1.5 rounded-full ${status?.llm ? "bg-[#4ade80]" : "bg-[#ffb35c]"}`} aria-hidden="true" />
                <span className="truncate">{modeLabel}</span>
              </p>
            </div>
            <label className="sr-only" htmlFor="yukt-lang">
              Reply language
            </label>
            <select
              id="yukt-lang"
              value={chosenLang}
              onChange={(e) => setChosenLang(e.target.value)}
              className="snt-yukt-lang"
              title="Language · भाषा"
            >
              {YUKT_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={clearChat} className="snt-yukt-iconbtn" title="New chat" aria-label="New chat">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M2.5 8a5.5 5.5 0 109.4-3.9M12.5 1.8v2.6H9.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" onClick={() => setOpen(false)} className="snt-yukt-iconbtn" aria-label="Close">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="snt-tricolour" style={{ height: 3 }} />

          <div ref={listRef} className="snt-yukt-list scroll-area" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`snt-yukt-msg ${m.role === "user" ? "is-user" : "is-bot"}`}>
                {m.role === "bot" && <YuktOrb size={26} />}
                <div className="min-w-0 max-w-[85%]">
                  <div className="snt-yukt-bubble" dir={m.lang && RTL_LANGS.has(m.lang) ? "rtl" : undefined}>
                    {m.text}
                  </div>
                  {m.role === "bot" && (m.source === "ai" || m.note || m.text) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-1 text-[10px] text-[#8a93a8]">
                      {m.source === "ai" && <span>✦ Answer, from live data</span>}
                      {m.note && <span>{m.note}</span>}
                      {m.text && (
                        <button type="button" onClick={() => speak(i, m)} className="underline-offset-2 hover:underline" aria-label={speaking === i ? "Stop reading" : "Read aloud"}>
                          {speaking === i ? "■ stop" : "🔊 listen"}
                        </button>
                      )}
                    </div>
                  )}
                  {m.items?.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {m.items.map((it, j) => (
                        <li key={j}>
                          <Link to={it.to} className="snt-yukt-card">
                            <span className={`mt-0.5 flex ${tone(it.tone).text}`}>
                              <StatusGlyph kind={it.tone === "flag" ? "flag" : it.tone === "watch" ? "watch" : it.tone === "good" ? "check" : "dot"} />
                            </span>
                            <span className="min-w-0">
                              <span className="snt-navy block truncate text-[12.5px] font-medium">{it.title}</span>
                              <span className="block truncate text-[11px] text-[#6b7590]">{it.sub}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.how?.length > 0 && (
                    <ol className="mt-1.5 list-decimal space-y-0.5 rounded-lg bg-[#0B2A6F]/[0.04] py-2 pl-7 pr-3 text-[11.5px] text-[#3b4660]">
                      {m.how.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  )}
                  {m.kb?.length > 0 && (
                    <div className="mt-1.5 space-y-1.5">
                      {m.kb.map((d) => (
                        <YuktFeatureCard key={d.id} doc={d} onOpen={(to) => navigate(to)} />
                      ))}
                    </div>
                  )}
                  {m.proposals?.length > 0 && (
                    <ul className="mt-1.5 space-y-1.5">
                      {m.proposals.map((p) => {
                        const state = m.done?.[p.id];
                        return (
                          <li key={p.id} className="snt-yukt-confirm">
                            <p className="snt-navy text-[12.5px] font-semibold">{p.title}</p>
                            <p className="mt-0.5 text-[11px] text-[#6b7590]">{p.sub}</p>
                            {state === "ok" ? (
                              <p className="mt-2 text-[11.5px] font-semibold text-signal-good">✓ Done</p>
                            ) : state === "cancelled" ? (
                              <p className="mt-2 text-[11.5px] text-[#8a93a8]">Cancelled</p>
                            ) : (
                              <div className="mt-2 flex gap-1.5">
                                <button
                                  type="button"
                                  className="snt-yukt-ok"
                                  disabled={busyProposal === `${i}-${p.id}`}
                                  onClick={() => confirmProposal(i, p)}
                                >
                                  {busyProposal === `${i}-${p.id}` ? "…" : "Confirm · पुष्टि"}
                                </button>
                                <button type="button" className="snt-yukt-suggest" onClick={() => cancelProposal(i, p)}>
                                  Cancel
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {m.actions?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.actions.map((a) => (
                        <Link key={a.to + a.label} to={a.to} className="snt-yukt-action snt-glass">
                          {a.label} →
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.suggest && i === messages.length - 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {YUKT_SUGGEST[uiLang === "hi" ? "hi" : "en"]
                        .filter((s) => isDecider || !/escalate|रिपोर्ट|report/i.test(s))
                        .map((s) => (
                          <button key={s} type="button" className={`snt-yukt-suggest ${uiLang === "hi" ? "snt-hi" : ""}`} onClick={() => send(s)}>
                            {s}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="snt-yukt-msg is-bot">
                <YuktOrb size={26} />
                <div className="snt-yukt-bubble snt-yukt-typing" aria-label="Yukt is typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>

          <div className="relative">
          {sugs.length > 0 && (
            <ul role="listbox" id="yukt-suggest" aria-label="Suggestions" className="snt-yukt-ac">
              <li className="px-3 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#8a93a8]">Suggestions · Sentinel, Setu, Nayan</li>
              {sugs.map((s, i) => (
                <li key={s.doc.id} role="option" aria-selected={i === sel}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => pickSuggestion(s)}
                    className={`snt-yukt-ac-item ${i === sel ? "is-on" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        <Highlight text={s.label} q={input} />
                      </span>
                      <span className="block truncate text-[10.5px] text-[#8a93a8]">
                        {s.label !== s.doc.title ? `${s.doc.title} · ` : ""}
                        <span className="snt-script-hi">{s.doc.hi}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${s.doc.app === "sentinel" ? "bg-[#0B2A6F]/10 text-[#0B2A6F]" : s.doc.app === "setu" ? "bg-[#138808]/12 text-[#138808]" : "bg-[#FF9933]/15 text-[#b35f00]"}`}>
                      {YUKT_APPS[s.doc.app].name}
                    </span>
                  </button>
                </li>
              ))}
              <li className="px-3 pb-2 pt-1 text-[9.5px] text-[#8a93a8]">↑↓ to choose · Enter to open · Esc to close</li>
            </ul>
          )}
          <form
            className="snt-yukt-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (sugs.length && sel >= 0) pickSuggestion(sugs[sel]);
              else send();
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setSel(-1);
              }}
              onKeyDown={(e) => {
                if (!sugs.length) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((v) => (v + 1) % sugs.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((v) => (v <= 0 ? sugs.length - 1 : v - 1));
                } else if (e.key === "Tab" && sel >= 0) {
                  e.preventDefault();
                  setInput(sugs[sel].label);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setAcOff(true);
                }
              }}
              placeholder={listening ? "Listening… · सुन रहा हूँ…" : "Ask Yukt…"}
              aria-label="Ask Yukt"
              aria-autocomplete="list"
              aria-controls="yukt-suggest"
              aria-expanded={sugs.length > 0}
              className="snt-hi"
              dir={RTL_LANGS.has(chosenLang) ? "rtl" : undefined}
            />
            {micAvailable && (
              <button
                type="button"
                onClick={toggleMic}
                className={`snt-yukt-iconbtn is-dark ${listening ? "is-live" : ""}`}
                aria-label={listening ? "Stop listening" : "Speak"}
                title={useBrowserAsr ? `Speak (${langMeta.name})` : `Speak (${langMeta.name}, via Bhashini)`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <rect x="5.5" y="1.8" width="5" height="8" rx="2.5" />
                  <path d="M3 7.5a5 5 0 0010 0M8 12.5v2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <button type="submit" className="snt-yukt-send" disabled={!input.trim() || typing} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M2.5 8h10M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
          </div>
          <p className="snt-yukt-foot">Yukt answers from Sentinel's live data and its knowledge of Sentinel, Setu and Nayan. Actions always ask you to confirm first.</p>
        </section>
      )}

      {teaser && !open && (
        <button type="button" className="snt-yukt-teaser snt-hi" onClick={() => setOpen(true)}>
          नमस्ते! मैं <strong>युक्त</strong> हूँ — कुछ भी पूछिए 👋
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`snt-yukt-fab ${open ? "is-open" : ""}`}
        aria-label={open ? "Close Yukt" : "Ask Yukt"}
        aria-expanded={open}
      >
        <span className="snt-yukt-pulse" aria-hidden="true" />
        <YuktOrb size={48} />
        <span className="snt-yukt-fab-label">
          <span className="block text-[13px] font-semibold leading-tight">Yukt</span>
          <span className="snt-hi block text-[10.5px] leading-tight opacity-80">युक्त से पूछें</span>
        </span>
      </button>
    </>
  );
}

/* Icons: 20px, 1.5 stroke, currentColor — one visual family. */
const ICON = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, "aria-hidden": true };

function OverviewIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="4.5" rx="1.5" />
      <rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg {...ICON}>
      <path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z" strokeLinejoin="round" />
      <path d="M9 7v13M15 4v13" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 3l9 16H3l9-16z" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CameraIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="7" width="13" height="11" rx="2" strokeLinejoin="round" />
      <path d="M16 10.5l5-3v9l-5-3" strokeLinejoin="round" />
    </svg>
  );
}
function DrawIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
function GrievanceIcon() {
  return (
    <svg {...ICON}>
      <path d="M20 14a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h12a2 2 0 012 2v9z" strokeLinejoin="round" />
      <path d="M12 7v3.5" strokeLinecap="round" />
      <circle cx="12" cy="12.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function RenewalIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 12a8 8 0 0113.66-5.66M20 12a8 8 0 01-13.66 5.66" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 4v3h-3M7 20v-3h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RegisterIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 5.5A1.5 1.5 0 015.5 4H19a1 1 0 011 1v14a1 1 0 01-1 1H5.5A1.5 1.5 0 014 18.5v-13z" strokeLinejoin="round" />
      <path d="M8 4v16M11.5 9h5M11.5 13h5" strokeLinecap="round" />
    </svg>
  );
}
function InspectorIcon() {
  return (
    <svg {...ICON}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c.8-3.6 3.4-5.5 6.5-5.5 1.4 0 2.7.4 3.8 1.1" strokeLinecap="round" />
      <path d="M15 17.5h6M15 14.5h6M15 20.5h4" strokeLinecap="round" />
    </svg>
  );
}
function AssessIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 19h16M6 16V11M10 16V7M14 16v-4M18 16V9" strokeLinecap="round" />
    </svg>
  );
}
function DistrictIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" fillOpacity=".25" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" fillOpacity=".5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
function ReportIcon() {
  return (
    <svg {...ICON}>
      <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
      <path d="M14 3v4h4M9 12h6M9 15.5h6M9 9h2" strokeLinecap="round" />
    </svg>
  );
}
function AuditIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AnalyticsIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProtectedRoute({ children, allow }) {
  const { user, role } = useAuth();

  if (!user) {
    // Signed out — a fresh load always is (§7a) — means the sign-in page,
    // whatever URL was open. After signing in, everyone starts at Overview.
    return <Navigate to="/login" replace />;
  }
  if (allow && !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

/**
 * One render error in one panel used to take down the whole dashboard. This
 * keeps the failure inside the content area, with the navigation still usable.
 */
class PanelBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[Sentinel] page crashed", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md text-center">
            <p className="font-display text-xl">This page hit an error</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              The rest of the dashboard is still working. The details are in the browser console.
            </p>
            <p className="mt-3 break-words rounded bg-ink/5 px-3 py-2 text-left font-mono text-[11px] text-ink-muted">
              {String(this.state.error?.message || this.state.error)}
            </p>
            <Button className="mt-4" variant="secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * One column, top to bottom: government strip, tricolour, masthead with the
 * tabs, the live ticker, the page, and a slim footer. Rendered once as a
 * layout route, so the ticker keeps running as the official moves between
 * pages instead of restarting on every click.
 */
function AppShell() {
  const location = useLocation();
  const signals = useShellSignals();
  const { role } = useAuth();
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const { t, prefs } = useT();
  useGlobalShortcuts({ isDecider, onHelp: openHelp });
  useAutoRefresh();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-paper">
      <DemoBanner />
      <GovStrip />
      <div className="snt-tricolour" />
      <Masthead openAlerts={signals.openAlerts.length} />
      <NewsTicker signals={signals} />
      <main id="main" tabIndex={-1} className="snt-canvas relative min-h-0 min-w-0 flex-1 overflow-hidden outline-none">
        <AshokaChakra size={520} className="snt-watermark" />
        <div className="relative h-full">
          {/* Keyed on the path so a crashed page recovers when you navigate away. */}
          <PanelBoundary key={`${location.pathname}|${prefs.region}`}>
            <Outlet />
          </PanelBoundary>
        </div>
      </main>
      <ShellFooter updatedAt={signals.updatedAt} />
      <Yukt signals={signals} />
      <ConnectDrawer />
      <SessionGuard />
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title={t("Keyboard shortcuts")}>
        <ShortcutList isDecider={isDecider} />
        <p className="mt-4 text-xs text-ink-muted">
          More on the <Link to="/accessibility" className="underline" onClick={() => setHelpOpen(false)}>accessibility page</Link>.
        </p>
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §14  PAGE: Login
   ══════════════════════════════════════════════════════════════════════════ */

/** Seeded by backend/app/seed/seed_data.py — all share password Password123!. */
const DEMO_ACCOUNTS = [
  { role: "official", email: "official@dosje.gov.in", note: "Monitor sites, decide on alerts, renewals and grievances, message inspectors" },
  { role: "admin", email: "admin@dosje.gov.in", note: "Everything an official can do, plus run the inspection draw" },
];

function Login() {
  const { user, login, verifyMfa } = useAuth();
  const demoData = useDemoFallback();
  const notice = useSessionNotice();
  const toast = useToast();
  const { t } = useT();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [wrongApp, setWrongApp] = useState(null);
  const [loading, setLoading] = useState(false);
  // Set once the password is accepted but the account wants its 2-step code.
  const [mfa, setMfa] = useState(null);
  const [showTest, setShowTest] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const testRef = useRef(null);
  useEffect(() => {
    if (!showTest) return undefined;
    const onDoc = (e) => !testRef.current?.contains(e.target) && setShowTest(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showTest]);

  /** Lands on Overview (the Navigate below) with the previous sign-in in a toast. */
  function welcome(session) {
    const last = session.lastLogin;
    if (!last) return;
    const vars = { when: formatDateTime(last.at), ip: last.ip };
    toast.toast(<Bi en={last.ip ? "Last signed in {when} from {ip}" : "Last signed in {when}"} vars={vars} altClassName="text-xs text-ink-muted" />, {
      glyph: "check",
      toneName: "good",
      timeout: 7000,
    });
  }

  function fail(err) {
    const { text, retryAfter } = signInFailure(err);
    setError(text);
    setLockedUntil(retryAfter ? Date.now() + retryAfter * 1000 : 0);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return; // no double submit, even from the Enter key
    const cleanEmail = email.trim().toLowerCase();
    setEmail(cleanEmail);
    setError("");
    setWrongApp(null);
    if (!cleanEmail || !password) {
      setError("Enter your email and password to continue");
      return;
    }
    setLoading(true);
    try {
      welcome(await login(cleanEmail, password));
    } catch (err) {
      if (err instanceof MfaRequired) {
        setMfa({ token: err.mfaToken, email: cleanEmail, expiresAt: Date.now() + (err.expiresIn || 300) * 1000 });
        setPassword("");
      } else if (err instanceof WrongAppError) {
        setWrongApp(err.role);
      } else {
        fail(err);
      }
    } finally {
      setLoading(false);
    }
  }

  /** The code step's submit. Throws back to it for "Invalid code". */
  async function handleCode(code) {
    if (Date.now() > mfa.expiresAt) {
      backToPassword("Verification timed out. Please sign in again.");
      return;
    }
    try {
      welcome(await verifyMfa(mfa.token, code, mfa.email));
    } catch (err) {
      if (err instanceof WrongAppError) {
        backToPassword("");
        setWrongApp(err.role);
        return;
      }
      const detail = String(err.response?.data?.detail || "");
      if (err.response?.status === 401 && /timed out|sign in again/i.test(detail)) {
        backToPassword(detail);
        return;
      }
      throw err;
    }
  }

  function backToPassword(message) {
    setMfa(null);
    setError(message);
    setLockedUntil(0);
  }

  function fillDemo(demoEmail) {
    setEmail(demoEmail);
    setPassword("Password123!");
    setError("");
    setLockedUntil(0);
    setWrongApp(null);
  }

  if (user) return <Navigate to="/" replace />;

  const FEATURES = [
    ["M12 3l7 4v5c0 4.4-3 8.3-7 9-4-.7-7-4.6-7-9V7l7-4z M9 12l2 2 4-4", "Surprise inspections", "अचानक निरीक्षण", "Visits are drawn at random — no institute can predict or prepare."],
    ["M7 3h7l5 5v13H7z M14 3v5h5 M10 14l2 2 3-4", "Tamper-proof evidence", "छेड़छाड़-रहित साक्ष्य", "Every photo and report carries its own fingerprint, checked again on arrival."],
    ["M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1C10.7 20 4 13.3 4 5a1 1 0 011-1z", "Direct calls to residents", "निवासियों से सीधी कॉल", "Officials verify well-being with residents, without institute staff on the line."],
    ["M12 3a9 9 0 100 18 9 9 0 000-18z M12 8v4l3 2", "Early-warning alerts", "पूर्व चेतावनी", "Each institute is read against its own history, so problems surface early."],
  ];
  const setuUrl = YUKT_APPS.setu?.url;

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden lg:h-screen lg:overflow-hidden">
      <GovStrip minimal />
      <div className="snt-tricolour" />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* ---------------------------------------------- the console ---- */}
        <aside
          className="relative hidden flex-col overflow-hidden px-10 py-8 lg:flex xl:px-14 xl:py-10"
          style={{ background: `linear-gradient(150deg, ${INDIA.navyDeep} 0%, ${INDIA.navy} 58%, #173a8a 100%)` }}
        >
          <div className="snt-login-chakra pointer-events-none absolute" aria-hidden="true">
            <AshokaChakra size={800} color="#ffffff" className="snt-spin" />
          </div>
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(#F3F0E7 1px, transparent 1px)", backgroundSize: "26px 26px" }} aria-hidden="true" />

          <div className="relative flex items-center gap-3.5">
            <span className="snt-emblem" style={{ width: 48, height: 48 }}>
              <AshokaChakra size={34} className="snt-spin" />
            </span>
            <div>
              <p className="font-display text-xl leading-none text-paper">
                Sentinel <span className="snt-hi ml-1 text-base text-[#ffb35c]">प्रहरी</span>
              </p>
              <p className="mt-1.5 text-2xs uppercase tracking-[0.14em] text-paper/55">Ministry of Social Justice &amp; Empowerment</p>
            </div>
          </div>

          <div className="relative my-auto py-8" style={{ maxWidth: "min(46vw, 760px)" }}>
            <p className="font-semibold uppercase tracking-[0.18em] text-[#ffb35c]" style={{ fontSize: "clamp(11px, .8vw, 14px)" }}>
              Officials' console · <span className="snt-hi normal-case tracking-normal">अधिकारी कंसोल</span>
            </p>
            <h2 className="mt-3 font-display font-medium leading-[1.12] text-paper" style={{ fontSize: "clamp(30px, 2.7vw, 56px)" }}>
              Inspections stop being predictable.
            </h2>
            <p className="snt-hi mt-2 text-paper/60" style={{ fontSize: "clamp(15px, 1.2vw, 24px)" }}>निरीक्षण अब पहले से तय नहीं।</p>
            <p className="mt-4 leading-relaxed text-paper/75" style={{ fontSize: "clamp(14px, 1vw, 19px)", maxWidth: "min(40vw, 640px)" }}>
              One console for every welfare institute — alerts, camera health, compliance, grievances and renewals — with inspections that no institute can see coming.
            </p>
            <ul className="mt-6 grid gap-2.5 [@media(max-height:700px)]:hidden" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", maxWidth: "min(44vw, 720px)" }}>
              {FEATURES.map(([d, en, hi, body]) => (
                <li key={en} className="snt-login-feature">
                  <svg {...ICON} width={20} height={20} className="shrink-0 text-[#ffb35c]"><path d={d} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="min-w-0">
                    <span className="block font-semibold text-paper" style={{ fontSize: "clamp(13px, .9vw, 16px)" }}>{en}</span>
                    <span className="snt-hi block text-paper/50" style={{ fontSize: "clamp(11.5px, .75vw, 14px)" }}>{hi}</span>
                    <span className="mt-0.5 block leading-snug text-paper/60" style={{ fontSize: "clamp(12px, .78vw, 14px)" }}>{body}</span>
                  </span>
                </li>
              ))}
            </ul>
            {/* Short screens: the same four points as a single row of labels. */}
            <ul className="mt-5 hidden flex-wrap gap-2 [@media(max-height:700px)]:flex">
              {FEATURES.map(([d, en]) => (
                <li key={en} className="snt-login-chip">
                  <svg {...ICON} width={15} height={15} className="shrink-0 text-[#ffb35c]"><path d={d} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {en}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-end justify-between gap-4">
            <p className="text-2xs text-paper/50">Built for the Department of Social Justice &amp; Empowerment</p>
            <p className="text-2xs text-paper/45">Prototype · not an official government website</p>
          </div>
        </aside>

        {/* ----------------------------------------------- the form ------ */}
        <main className="snt-canvas flex bg-paper px-4 py-6 sm:px-8 lg:min-h-0 lg:overflow-y-auto lg:py-4">
          <div className="m-auto w-full max-w-[26rem]">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <span className="snt-emblem" style={{ width: 42, height: 42 }}>
                <AshokaChakra size={30} className="snt-spin" />
              </span>
              <div>
                <p className="font-display text-xl leading-none">Sentinel <span className="snt-hi text-base text-[#c26a00]">प्रहरी</span></p>
                <p className="mt-1 text-2xs uppercase tracking-[0.14em] text-ink-muted">Ministry of Social Justice &amp; Empowerment</p>
              </div>
            </div>

            <div className="snt-login-card">
              <TricolourMini />
              {mfa ? (
                <MfaStep email={mfa.email} demo={demoData} onVerify={handleCode} onBack={() => backToPassword("")} />
              ) : (
                <>
                  <h1 className="mt-2.5 font-display text-2xl">
                    <Bi en="Sign in" inline altClassName="text-base text-ink-muted" />
                  </h1>
                  <p className="mt-1 text-sm text-ink-muted">
                    <Bi en="Officials and administrators" inline />
                  </p>

                  {notice && !error && <SignOutNotice notice={notice} />}

                  <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" noValidate>
                    <div>
                      <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-ink-muted">{t("Email")}</label>
                      <div className="snt-login-field">
                        <svg {...ICON} width={17} height={17}><path d="M4 6h16v12H4z M4 7l8 6 8-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <input
                          id="email"
                          type="email"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          onBlur={() => setEmail((v) => v.trim().toLowerCase())}
                          placeholder="you@dosje.gov.in"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-ink-muted">{t("Password")}</label>
                      <div className="snt-login-field">
                        <svg {...ICON} width={17} height={17}><path d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 017 0v3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <input id="password" type={showPw ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                        <button type="button" onClick={() => setShowPw((v) => !v)} className="snt-login-eye" aria-label={showPw ? "Hide password" : "Show password"} title={showPw ? "Hide password" : "Show password"}>
                          <svg {...ICON} width={17} height={17}>
                            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" strokeLinejoin="round" />
                            <circle cx="12" cy="12" r="2.8" />
                            {showPw && <path d="M4 4l16 16" strokeLinecap="round" />}
                          </svg>
                        </button>
                      </div>
                    </div>

                    {error && <SignInError text={error} lockedUntil={lockedUntil} onUnlock={() => setLockedUntil(0)} />}

                    {wrongApp && (
                      <div role="alert" className="rounded-md bg-signal-watch-soft px-3 py-2.5 text-xs leading-relaxed">
                        <p className="font-medium text-signal-watch">This console is for officials and administrators</p>
                        <p className="mt-1 text-ink-muted">
                          {wrongApp === "institute_staff" || wrongApp === "beneficiary"
                            ? "Institute and beneficiary accounts sign in through Setu or the Nayan app."
                            : "Your account doesn't have access to Sentinel."}
                        </p>
                      </div>
                    )}

                    <Button type="submit" variant="primary" size="lg" loading={loading} disabled={lockedUntil > Date.now()} className="snt-login-submit w-full">
                      {loading ? t("Signing in…") : t("Sign in")}
                    </Button>
                  </form>

                  {/* Test sign-ins, folded away until wanted. */}
                  <div className="relative mt-3" ref={testRef}>
                    <button type="button" onClick={() => setShowTest((v) => !v)} aria-expanded={showTest} className="snt-login-demo">
                      <span className="flex items-center gap-2">
                        <svg {...ICON} width={15} height={15}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" strokeLinecap="round" /></svg>
                        <Bi en="Use a test account" inline altClassName="text-ink-muted" />
                      </span>
                      <svg {...ICON} width={15} height={15} style={{ transform: showTest ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    {showTest && (
                      <ul className="snt-login-menu" role="listbox" aria-label="Test accounts">
                        {DEMO_ACCOUNTS.map((a) => (
                          <li key={a.email} role="option" aria-selected="false">
                            <button type="button" onClick={() => { fillDemo(a.email); setShowTest(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-ink/5">
                              <span className="snt-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>{a.role === "admin" ? "AD" : "OF"}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">{ROLE_LABEL[a.role]}</span>
                                <span className="block truncate text-[11px] text-ink-muted">{a.note}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                        <li className="px-2.5 pb-1 pt-1.5 text-[10.5px] leading-snug text-ink-muted">
                          Test accounts we created for this demo (no department database is connected yet). The password Password123! is filled in for you.
                        </li>
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-ink-muted">
              Institutes and beneficiaries?{" "}
              {setuUrl ? (
                <a href={setuUrl} className="font-semibold text-ink underline-offset-2 hover:underline">Sign in to Setu →</a>
              ) : (
                <span><strong className="text-ink">Setu</strong> is your portal.</span>
              )}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

/** One sentence for each way a sign-in can fail (security contract §1). */
function signInFailure(err) {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  const said = typeof detail === "string" && detail ? detail : null;
  if (err instanceof MfaRequired || err instanceof WrongAppError) return { text: "" };
  if (!err?.response) return { text: "Can't reach the server. Check your connection and try again." };
  if (status === 401) return { text: said || "Incorrect email or password." };
  if (status === 423) {
    const retryAfter = Number(err.response.headers?.["retry-after"]) || 0;
    return { text: said || "Too many failed sign-ins. Try again later.", retryAfter };
  }
  if (status === 429) return { text: "Too many attempts from this network. Please wait a minute and try again." };
  if (status === 403) return { text: said || "This account is disabled. Contact your administrator." };
  return { text: errorMessage(err, "Couldn't sign you in") };
}

/** The calm line on the sign-in page saying why the last session ended. */
function SignOutNotice({ notice }) {
  return (
    <div role="status" className="mt-4 flex items-start gap-2.5 rounded-md border border-[#0B2A6F]/10 bg-[#0B2A6F]/[0.08] px-3 py-2.5 text-xs leading-relaxed">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="mt-px shrink-0 text-[#0B2A6F]">
        <circle cx="8" cy="8" r="6.3" />
        <path d="M8 7.2v3.8M8 4.9v.2" strokeLinecap="round" />
      </svg>
      <Bi en={notice.text} className="text-[#0B2A6F]" altClassName="mt-0.5 text-ink-muted" />
    </div>
  );
}

/** A sign-in error, with a live countdown while the account is locked (423). */
function SignInError({ text, lockedUntil, onUnlock }) {
  const now = useNow(1000);
  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now.getTime()) / 1000));
  useEffect(() => {
    if (lockedUntil && !secondsLeft) onUnlock();
  }, [lockedUntil, secondsLeft, onUnlock]);
  return (
    <div role="alert" className="rounded-md bg-signal-flag-soft px-3 py-2 text-xs text-signal-flag">
      <Bi en={text} altClassName="mt-0.5 opacity-80" />
      {secondsLeft > 0 && (
        <p className="mt-1 font-medium tnum">
          <Bi en="You can try again in {time}" vars={{ time: clockMinutes(secondsLeft) }} inline altClassName="font-normal opacity-80" />
        </p>
      )}
    </div>
  );
}

/**
 * A password input with show/hide and a Caps Lock warning. Used by the
 * sign-in form and every Security page form that asks for a password.
 */
function PasswordField({ id, label, value, onChange, autoComplete = "current-password", placeholder = "••••••••", describedBy }) {
  const { t } = useT();
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const readCaps = (e) => setCapsLock(Boolean(e.getModifierState?.("CapsLock")));
  const capsId = `${id}-caps`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={readCaps}
          onKeyUp={readCaps}
          onBlur={() => setCapsLock(false)}
          placeholder={placeholder}
          aria-describedby={[capsLock ? capsId : null, describedBy].filter(Boolean).join(" ") || undefined}
          className="w-full rounded-md border border-paper-line bg-paper-raised py-2 pl-3 pr-10 text-sm outline-none transition-colors placeholder:text-ink/30 focus:border-ink/40"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-label={shown ? t("Hide password") : t("Show password")}
          title={shown ? t("Hide password") : t("Show password")}
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded text-ink/40 hover:text-ink"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
            {shown && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {capsLock && (
        <p id={capsId} role="status" className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-signal-watch">
          <StatusGlyph kind="watch" />
          <Bi en="Caps Lock is on" inline altClassName="font-normal opacity-80" />
        </p>
      )}
    </div>
  );
}

/**
 * Step two of a sign-in with 2-step verification: a 6-digit code from an
 * authenticator app (submits itself on the sixth digit; pasting "123 456"
 * works), or a single-use recovery code.
 */
function MfaStep({ email, demo, onVerify, onBack }) {
  const { t } = useT();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), [recovery]);

  async function submit(value) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await onVerify(value);
    } catch (err) {
      const { text, retryAfter } = signInFailure(err);
      setError(err.response?.status === 401 ? err.response.data?.detail || "Invalid code." : text);
      setLockedUntil(retryAfter ? Date.now() + retryAfter * 1000 : 0);
      setCode("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onDigits(raw) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) submit(digits);
  }

  function onRecovery(raw) {
    const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    setCode(chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars);
  }

  const ready = recovery ? /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) : code.length === 6;
  const locked = lockedUntil > Date.now();

  return (
    <div>
      <h1 className="mt-2.5 font-display text-xl">
        <Bi en="2-step verification" inline altClassName="text-base text-ink-muted" />
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        <Bi en={recovery ? "Enter one of your recovery codes." : "Enter the 6-digit code from your authenticator app."} altClassName="mt-0.5 text-xs" />
      </p>
      <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-paper-line bg-paper-raised py-1 pl-1 pr-3 text-xs">
        <span className="snt-avatar" style={{ width: 22, height: 22, fontSize: 9, boxShadow: "none" }}>
          {email.slice(0, 2).toUpperCase()}
        </span>
        <span className="truncate font-mono text-[11.5px]">{email}</span>
      </p>

      <form
        className="mt-4 space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !locked) submit(code);
        }}
      >
        <div>
          <label htmlFor="mfa-code" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            {recovery ? t("Recovery code") : t("Verification code")}
          </label>
          <input
            ref={inputRef}
            id="mfa-code"
            key={recovery ? "recovery" : "totp"}
            type="text"
            inputMode={recovery ? "text" : "numeric"}
            autoComplete={recovery ? "off" : "one-time-code"}
            autoCapitalize="characters"
            spellCheck={false}
            pattern={recovery ? "[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}" : "[0-9]{6}"}
            maxLength={recovery ? 9 : 12}
            value={code}
            disabled={busy}
            onChange={(e) => (recovery ? onRecovery(e.target.value) : onDigits(e.target.value))}
            placeholder={recovery ? "XXXX-XXXX" : "000000"}
            className="w-full rounded-md border border-paper-line bg-paper-raised px-3 py-2.5 text-center font-mono text-2xl tracking-[0.45em] outline-none transition-colors placeholder:text-ink/25 focus:border-ink/40 disabled:opacity-60"
          />
        </div>

        {error && <SignInError text={error} lockedUntil={lockedUntil} onUnlock={() => setLockedUntil(0)} />}

        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!ready || locked} className="w-full">
          {busy ? t("Verifying…") : t("Verify")}
        </Button>

        <div className="flex items-center justify-between gap-3 pt-0.5 text-xs">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-ink-muted hover:text-ink">
            <span aria-hidden="true">←</span> {t("Back")}
          </button>
          <button
            type="button"
            onClick={() => {
              setRecovery((v) => !v);
              setCode("");
              setError("");
            }}
            className="rounded px-1 py-0.5 font-medium text-[#0B2A6F] underline-offset-2 hover:underline"
          >
            {recovery ? t("Use the authenticator code instead") : t("Use a recovery code instead")}
          </button>
        </div>
      </form>

      {demo && (
        <p className="mt-4 text-center text-[10.5px] text-ink-muted">
          <Bi en="Mock mode: any 6-digit code (or any XXXX-XXXX recovery code) is accepted." altClassName="mt-0.5" />
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §15  PAGE: Overview
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The landing page. v1 dropped an official straight onto a map, which answers
 * "where is everything" but not "what needs me first" — so this page leads with
 * the queue and keeps the map one click away.
 */
function Overview() {
  const { user } = useAuth();

  const summary = useApi(API.analytics.complianceSummary());
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const alerts = useApi(API.alerts.list(), { fallback: [] });
  const cameras = useApi(API.cameras.list(), { fallback: [] });

  const loading = summary.loading || institutes.loading || alerts.loading;
  const failure = summary.error || institutes.error || alerts.error;

  const instituteIndex = byId(institutes.data || []);
  const openAlerts = (alerts.data || []).filter((a) => a.status === "open");
  const urgent = alertsByUrgency(openAlerts).slice(0, 6);
  const attention = worstFirst(institutes.data || []).filter((i) => i.status !== "green").slice(0, 5);
  const dark = darkCameras(cameras.data || []);
  const perDay = alertsPerDay(alerts.data || [], 14);

  const statusCounts = tally(institutes.data || [], "status", ["green", "yellow", "red"]);
  const s = summary.data;

  const typeBreakdown = countBy(openAlerts, "type")
    .slice(0, 6)
    .map((row) => ({ ...row, label: alertTypeLabel(row.name) }));

  const greeting = timeGreeting();
  const { t: tGreet, alt: altGreet, altLang: greetLang } = useT();

  return (
    <Page>
      <PageHeader
        title={
          <>
            <span className="block">{`${tGreet(greeting)}, ${user?.name?.split(" ")[0] || "there"}`}</span>
            {altGreet(greeting) && (
              <span className={`snt-bi-alt mt-0.5 block text-[1.05rem] font-normal tracking-normal text-ink-muted ${scriptClass(greetLang)}`}>
                {altGreet(greeting)}
              </span>
            )}
          </>
        }
        lede="Everything below was written by a check that ran — an anomaly score, a missed pickup, a hash that didn't match. Nothing here is a manual flag."
      >
        <Link
          to="/map"
          className="snt-glass rounded-md border border-ink/20 bg-paper-raised px-3.5 py-2 text-sm font-medium hover:border-ink/40"
        >
          Open map
        </Link>
      </PageHeader>

      {failure && <ErrorState message={failure} onRetry={() => { summary.reload(); institutes.reload(); alerts.reload(); }} />}

      {/* KPI row — four headline numbers, as stat tiles rather than a chart. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Institutes monitored"
          value={s?.total_institutes ?? institutes.data?.length ?? "—"}
          loading={loading && !s}
        />
        <StatTile
          label="Average compliance"
          value={s ? formatScore(s.average_compliance_score) : "—"}
          unit="/ 100"
          loading={loading && !s}
        />
        <StatTile
          label="Open alerts"
          value={s?.open_alerts_count ?? openAlerts.length}
          toneName={openAlerts.length ? "watch" : "good"}
          glyph={openAlerts.length ? "watch" : "check"}
          loading={loading && !s}
        />
        <StatTile
          label="Critical alerts"
          value={s?.red_alerts_count ?? openAlerts.filter((a) => a.severity === "red").length}
          toneName={(s?.red_alerts_count ?? 0) > 0 ? "flag" : "good"}
          glyph={(s?.red_alerts_count ?? 0) > 0 ? "flag" : "check"}
          loading={loading && !s}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------ the queue ---- */}
        <Card>
          <CardHeader
            title="Needs a decision"
            subtitle="Open alerts, most serious first."
            action={
              <Link to="/alerts" className="text-xs font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline">
                All alerts →
              </Link>
            }
          />
          <div className="px-5 py-4">
            {alerts.loading ? (
              <SkeletonRows rows={4} height="h-14" />
            ) : urgent.length === 0 ? (
              <EmptyState
                title="Nothing open"
                body="Every alert raised so far has been reviewed or escalated. New ones appear here as the detectors write them."
              />
            ) : (
              <ul className="divide-y divide-paper-line">
                {urgent.map((a) => {
                  const sev = severityOf(a.severity);
                  const inst = instituteIndex.get(a.institute_id);
                  return (
                    <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                      <Link to={`/alerts?focus=${a.id}`} className="group block">
                        <div className="flex items-start gap-3">
                          <span className={`mt-1 shrink-0 ${sev.tone === "flag" ? "text-signal-flag" : "text-signal-watch"}`}>
                            <StatusDot toneName={sev.tone} glyph={sev.glyph} label="" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                              <span className="font-medium group-hover:underline">{alertTypeLabel(a.type)}</span>
                              <Badge toneName={sev.tone} glyph={sev.glyph}>
                                {sev.label}
                              </Badge>
                            </p>
                            <p className="mt-0.5 truncate text-xs text-ink-muted">
                              {inst?.name || "Unknown institute"} · {relativeTime(a.created_at)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {/* -------------------------------------------- portfolio state -- */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Portfolio status" subtitle="Where every institute currently sits." />
            <div className="px-5 py-4">
              {institutes.loading ? (
                <SkeletonRows rows={1} height="h-16" />
              ) : (
                <ShareBar
                  segments={[
                    { name: "Compliant", value: statusCounts.green, toneName: "good", glyph: "check" },
                    { name: "Watch", value: statusCounts.yellow, toneName: "watch", glyph: "watch" },
                    { name: "Flagged", value: statusCounts.red, toneName: "flag", glyph: "flag" },
                  ]}
                  caption="Status is set by the backend from each institute's compliance score and open findings."
                />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Camera health"
              subtitle="A feed going dark just before a visit is a signal in itself."
              action={
                <Link to="/cameras" className="text-xs font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline">
                  Wall →
                </Link>
              }
            />
            <div className="px-5 py-4">
              {cameras.loading ? (
                <SkeletonRows rows={1} height="h-16" />
              ) : cameras.error ? (
                <p className="text-xs text-ink-muted">{cameras.error}</p>
              ) : (
                <ShareBar
                  segments={[
                    {
                      name: "Online",
                      value: (cameras.data || []).filter((c) => c.status === "online").length,
                      toneName: "good",
                      glyph: "check",
                    },
                    {
                      name: "Stale",
                      value: (cameras.data || []).filter((c) => c.status === "stale").length,
                      toneName: "watch",
                      glyph: "watch",
                    },
                    {
                      name: "Offline",
                      value: (cameras.data || []).filter((c) => c.status === "offline").length,
                      toneName: "flag",
                      glyph: "flag",
                    },
                  ]}
                  caption={
                    dark.length
                      ? `${dark.length} feed${dark.length === 1 ? "" : "s"} not reporting normally.`
                      : "Every feed is reporting."
                  }
                />
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* -------------------------------------------- alerts over time -- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Alerts raised, last 14 days"
            subtitle="Counted client-side from each alert's created_at — there is no server-side time series endpoint yet."
          />
          <div className="px-5 py-4">
            {alerts.loading ? (
              <SkeletonRows rows={1} height="h-24" />
            ) : (
              <TimeColumns
                buckets={perDay}
                label="alerts"
                caption="Days with no alerts are kept as real zeros rather than dropped, so a quiet week reads as quiet."
              />
            )}
          </div>
        </Card>

        {/* ------------------------------------------------ what's firing -- */}
        <Card>
          <CardHeader title="What's firing" subtitle="Open alerts by detector." />
          <div className="px-5 py-4">
            {alerts.loading ? (
              <SkeletonRows rows={3} height="h-8" />
            ) : (
              <BarList items={typeBreakdown} emptyLabel="No open alerts to break down" />
            )}
          </div>
        </Card>
      </div>

      {/* ----------------------------------------------- watchlist ------- */}
      <Card className="mt-4">
        <CardHeader
          title="Institutes to look at"
          subtitle="Flagged first, then lowest compliance score."
          action={
            <Link to="/institutes" className="text-xs font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline">
              Full register →
            </Link>
          }
        />
        <div className="px-5 py-4">
          {institutes.loading ? (
            <SkeletonRows rows={3} height="h-10" />
          ) : attention.length === 0 ? (
            <EmptyState title="Every institute is compliant" body="Nothing is on watch or flagged right now." />
          ) : (
            <ul className="divide-y divide-paper-line">
              {attention.map((inst) => {
                const st = instituteStatus(inst.status);
                return (
                  <li key={inst.id}>
                    <Link
                      to={`/institutes/${inst.id}`}
                      className="flex items-center justify-between gap-4 py-2.5 transition-colors hover:bg-ink/[0.02]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{inst.name}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {[inst.district, inst.state].filter(Boolean).join(", ") || "Location not recorded"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className="tnum font-mono text-sm">{formatScore(inst.compliance_score)}</span>
                        <StatusDot toneName={st.tone} glyph={st.glyph} label={st.label} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </Page>
  );
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ══════════════════════════════════════════════════════════════════════════
   §16  PAGE: Map
   ══════════════════════════════════════════════════════════════════════════ */

const PIN_COLOR = { green: "#2E7D4F", yellow: "#C99A1A", red: "#B02E1E" };
// Pin shape carries status alongside colour: a ring for compliant, a filled
// dot for watch, a filled dot with a halo for flagged. Colour alone would fail
// anyone who can't separate the amber and red.
const PIN_SHAPE = {
  green: (c) => `<circle cx="11" cy="11" r="5.5" fill="#FBFAF5" stroke="${c}" stroke-width="3"/>`,
  yellow: (c) => `<circle cx="11" cy="11" r="6.5" fill="${c}" stroke="#FBFAF5" stroke-width="2.5"/>`,
  red: (c) =>
    `<circle cx="11" cy="11" r="9.5" fill="${c}" opacity="0.22"/><circle cx="11" cy="11" r="6" fill="${c}" stroke="#FBFAF5" stroke-width="2"/>`,
};

function pinIcon(status, dimmed) {
  const color = PIN_COLOR[status] || "#5C6A73";
  const shape = (PIN_SHAPE[status] || PIN_SHAPE.yellow)(color);
  return L.divIcon({
    className: "",
    html: `<svg width="22" height="22" viewBox="0 0 22 22" style="opacity:${dimmed ? 0.3 : 1}">${shape}</svg>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/** Lets the side list drive the map without remounting it. */
function FlyTo({ target }) {
  const map = useMap();
  // In an effect, keyed on the target — calling flyTo during render made the
  // map fly again on every keystroke in the search box.
  useEffect(() => {
    if (target && map) map.flyTo(target, Math.max(map.getZoom(), 11), { duration: 0.8 });
  }, [target, map]);
  return null;
}

function MapView() {
  const { data, loading, error, reload } = useApi(API.institutes.list(), { fallback: [] });
  const [statusFilter, setStatusFilter] = useState("all");
  const { t: tMap } = useT();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState(null);

  const institutes = data || [];
  const counts = tally(institutes, "status", ["green", "yellow", "red"]);

  const mappable = institutes.filter(
    (i) => Number.isFinite(toNumber(i.latitude, NaN)) && Number.isFinite(toNumber(i.longitude, NaN))
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mappable.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (!q) return true;
      return [i.name, i.district, i.state].filter(Boolean).some((v) => v.toLowerCase().includes(q));
    });
  }, [mappable, statusFilter, query]);

  const visibleIds = new Set(visible.map((i) => i.id));

  // Centre on the mean of what we actually have, falling back to Lucknow.
  const center = mappable.length
    ? [
        mappable.reduce((a, i) => a + toNumber(i.latitude), 0) / mappable.length,
        mappable.reduce((a, i) => a + toNumber(i.longitude), 0) / mappable.length,
      ]
    : [26.8467, 80.9462];

  return (
    <div className="flex h-full">
      {/* ------------------------------------------------- side list ---- */}
      <aside className="hidden w-80 shrink-0 flex-col border-r border-paper-line bg-paper-raised lg:flex">
        <div className="border-b border-paper-line px-4 py-4">
          <h1 className="font-display text-lg">Institutes</h1>
          <p className="mt-0.5 text-xs text-ink-muted">
            {loading ? "Loading…" : `${visible.length} of ${mappable.length} shown`}
          </p>
          <div className="mt-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name or district" />
          </div>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
            }}
            disabled={!query && statusFilter === "all"}
            className="snt-pill snt-clear-all mt-2 w-full justify-center"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M2.5 3.5h11l-4.2 5v4.3l-2.6 1.2V8.5z" strokeLinejoin="round" />
              <path d="M10.8 10.8l3.4 3.4M14.2 10.8l-3.4 3.4" strokeLinecap="round" />
            </svg>
            <span>{tMap("Clear all filters")}</span>
          </button>
          <div className="mt-2.5 flex gap-1">
            {[
              { value: "all", label: "All", count: mappable.length, tone: null },
              { value: "red", label: "Flagged", count: counts.red, tone: "flag" },
              { value: "yellow", label: "Watch", count: counts.yellow, tone: "watch" },
              { value: "green", label: "OK", count: counts.green, tone: "good" },
            ].map((f) => {
              const active = statusFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  aria-pressed={active}
                  className={`flex-1 rounded border px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-ink bg-ink text-paper"
                      : "border-paper-line bg-paper text-ink/60 hover:border-ink/30"
                  }`}
                >
                  {f.label}
                  <span className={`ml-1 tnum ${active ? "text-paper/60" : "text-ink/35"}`}>{f.count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <ul className="scroll-area flex-1 divide-y divide-paper-line overflow-y-auto">
          {worstFirst(visible).map((inst) => {
            const st = instituteStatus(inst.status);
            return (
              <li key={inst.id}>
                <button
                  onClick={() => setTarget([toNumber(inst.latitude), toNumber(inst.longitude)])}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-ink/[0.03]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{inst.name}</span>
                    <span className="tnum shrink-0 font-mono text-xs text-ink-muted">
                      {formatScore(inst.compliance_score)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-ink-muted">
                      {[inst.district, inst.state].filter(Boolean).join(", ") || instituteType(inst.type)}
                    </span>
                    <StatusDot toneName={st.tone} glyph={st.glyph} label={st.label} />
                  </div>
                </button>
              </li>
            );
          })}
          {!loading && visible.length === 0 && (
            <li className="px-4 py-10 text-center text-xs text-ink-muted">Nothing matches that filter.</li>
          )}
        </ul>
      </aside>

      {/* ----------------------------------------------------- map ------ */}
      <div className="relative min-w-0 flex-1">
        {error ? (
          <div className="p-6">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : (
          <MapContainer center={center} zoom={6} className="h-full w-full" scrollWheelZoom zoomControl={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FlyTo target={target} />
            {mappable.map((inst) => {
              const st = instituteStatus(inst.status);
              const dimmed = !visibleIds.has(inst.id);
              return (
                <Marker
                  key={inst.id}
                  position={[toNumber(inst.latitude), toNumber(inst.longitude)]}
                  icon={pinIcon(inst.status, dimmed)}
                  zIndexOffset={inst.status === "red" ? 1000 : 0}
                >
                  <Popup>
                    <div className="min-w-[13rem] px-3 py-2.5 font-sans">
                      <p className="text-sm font-medium leading-tight">{inst.name}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {instituteType(inst.type)}
                        {inst.district ? ` · ${inst.district}` : ""}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-paper-line pt-2">
                        <StatusDot toneName={st.tone} glyph={st.glyph} label={st.label} />
                        <span className="tnum font-mono text-xs">{formatScore(inst.compliance_score)}/100</span>
                      </div>
                      <Link
                        to={`/institutes/${inst.id}`}
                        className="mt-2 block text-xs font-medium text-ink underline underline-offset-2"
                      >
                        Open institute →
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}

        {/* Legend: shape + colour + word, so the map is readable without colour */}
        <div className="pointer-events-none absolute bottom-5 left-4 z-[1000] rounded-lg border border-paper-line bg-paper-raised/95 px-3.5 py-2.5 shadow-card backdrop-blur">
          <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">Status</p>
          <ul className="space-y-1">
            {[
              { status: "green", label: "Compliant", count: counts.green },
              { status: "yellow", label: "Watch", count: counts.yellow },
              { status: "red", label: "Flagged", count: counts.red },
            ].map((row) => (
              <li key={row.status} className="flex items-center gap-2 text-xs">
                <span
                  className="flex h-[22px] w-[22px] items-center justify-center"
                  dangerouslySetInnerHTML={{
                    __html: `<svg width="22" height="22" viewBox="0 0 22 22">${(
                      PIN_SHAPE[row.status] || PIN_SHAPE.yellow
                    )(PIN_COLOR[row.status])}</svg>`,
                  }}
                />
                <span className="tnum w-5 text-right font-medium">{row.count}</span>
                <span className="text-ink-muted">{row.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {loading && (
          <div className="absolute inset-0 z-[1100] flex items-center justify-center bg-paper/70">
            <p className="text-sm text-ink-muted">Loading institutes…</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §17  PAGE: Alerts
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The alert ledger. Two things v1 got wrong that this fixes:
 *   - an action optimistically refetched with no confirmation, so an official
 *     couldn't tell whether their click landed
 *   - the institute was shown as a truncated UUID, which is unreadable; it now
 *     resolves to the institute's name and links to its page
 */
function Alerts() {
  const { canReviewAlerts } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const alerts = useApi(API.alerts.list(), { fallback: [] });
  const institutes = useApi(API.institutes.list(), { fallback: [] });

  // One busy marker per (alert, action), so only the clicked button spins.
  const [busy, setBusy] = useState(null);

  const instituteFilter = searchParams.get("institute");
  const focusId = searchParams.get("focus");
  const focusRef = useRef(null);
  const focusHandled = useRef(null);

  const instituteIndex = useMemo(() => byId(institutes.data || []), [institutes.data]);
  const rows = alerts.data || [];

  const fields = useMemo(
    () => [
      { key: "urgency", label: "Urgency", type: "sort", compare: alertUrgencyCompare },
      { key: "status", label: "Status", type: "enum", options: optsFrom(ALERT_STATUS) },
      { key: "severity", label: "Severity", type: "enum", options: optsFrom(SEVERITY) },
      { key: "type", label: "Alert type", type: "enum", display: alertTypeLabel },
      ...instituteLinkFields(instituteIndex),
      { key: "created_at", label: "Raised", type: "date" },
      { key: "detail", label: "Detail", type: "text", sortable: false },
    ],
    [instituteIndex]
  );

  const view = useDataView(rows, {
    fields,
    storageKey: "alerts",
    initial: { facets: { status: ["open"] }, sort: [{ key: "urgency", dir: "asc" }] },
    presets: [
      { name: "Critical & still open", hint: "What needs a decision today", state: { facets: { status: ["open"], severity: ["red"] }, sort: [{ key: "urgency", dir: "asc" }] } },
      { name: "Raised in the last 24 hours", hint: "Everything new, newest first", state: { dates: { created_at: { preset: "24h" } }, sort: [{ key: "created_at", dir: "desc" }] } },
      { name: "Open, grouped by district", hint: "Where the pressure is", state: { facets: { status: ["open"] }, groupBy: "district", sort: [{ key: "urgency", dir: "asc" }] } },
      { name: "Escalated, by institute", hint: "What's gone upstairs", state: { facets: { status: ["escalated"] }, groupBy: "institute", sort: [{ key: "created_at", dir: "desc" }] } },
      { name: "Open for over a week", hint: "Ageing alerts", state: { facets: { status: ["open"] }, dates: { created_at: { preset: "older7" } }, sort: [{ key: "created_at", dir: "asc" }] } },
    ],
  });

  // A link from an institute page (?institute=) becomes an ordinary filter chip.
  useEffect(() => {
    if (!instituteFilter) return;
    view.setFacet("institute", [instituteFilter]);
    const next = new URLSearchParams(searchParams);
    next.delete("institute");
    setSearchParams(next, { replace: true });
  }, [instituteFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // A deep link lands on one alert: if the current filters hide it, widen them
  // once, then scroll it into view. Only once per link, so later filtering by
  // the official is never undone.
  useEffect(() => {
    if (!focusId || !rows.length || focusHandled.current === focusId) return;
    focusHandled.current = focusId;
    if (!view.result.some((a) => a.id === focusId)) view.clearFilters();
    requestAnimationFrame(() => focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [focusId, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(alert, action) {
    setBusy({ id: alert.id, action });
    try {
      await api.patch(API.alerts.action(alert.id), { action });
      toast.success(action === "escalated" ? "Alert escalated" : "Alert marked reviewed");
      alerts.reload();
    } catch (err) {
      toast.error(errorMessage(err, "That action couldn't be completed"));
    } finally {
      setBusy(null);
    }
  }

  const renderList = (list) => (
    <ul className="space-y-2.5">
      {list.map((a) => {
        const sev = severityOf(a.severity);
        const st = alertStatus(a.status);
        const inst = instituteIndex.get(a.institute_id);
        const isFocus = a.id === focusId;
        const note = ALERT_TYPE_NOTE[a.type];

        return (
          <li
            key={a.id}
            ref={isFocus ? focusRef : null}
            className={`card overflow-hidden border-l-[3px] transition-shadow ${
              sev.tone === "flag" ? "border-l-signal-flag" : sev.tone === "watch" ? "border-l-signal-watch" : "border-l-ink/20"
            } ${isFocus ? "ring-2 ring-ink-3 ring-offset-2 ring-offset-paper" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge toneName={sev.tone} glyph={sev.glyph}>
                    {sev.label}
                  </Badge>
                  <span className="font-display text-base">{alertTypeLabel(a.type)}</span>
                  <Badge toneName={st.tone}>{st.label}</Badge>
                </div>

                {note && <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{note}</p>}
                {a.detail && (
                  <p className="mt-1.5 max-w-3xl rounded bg-ink/[0.03] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-ink/80">
                    {a.detail}
                  </p>
                )}

                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                  {inst ? (
                    <Link to={`/institutes/${inst.id}`} className="font-medium text-ink/70 underline-offset-2 hover:underline">
                      {inst.name}
                    </Link>
                  ) : (
                    <span className="font-mono">institute {shortId(a.institute_id)}</span>
                  )}
                  {inst?.district && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{inst.district}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>
                    {relativeTime(a.created_at)}
                  </time>
                </p>
              </div>

              {canReviewAlerts && a.status === "open" && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy?.id === a.id && busy.action === "reviewed"}
                    disabled={busy?.id === a.id}
                    onClick={() => act(a, "reviewed")}
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy?.id === a.id && busy.action === "escalated"}
                    disabled={busy?.id === a.id}
                    onClick={() => act(a, "escalated")}
                  >
                    Escalate
                  </Button>
                </div>
              )}
              {!canReviewAlerts && a.status === "open" && <p className="shrink-0 text-xs text-ink-muted">Officials action these</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Page>
      <PageHeader
        title="Alerts"
        lede="Every row was written by a check that ran — an anomaly score, a missed verification call, a hash that didn't match its bytes. None of these is a manual flag."
      >
        <Button variant="secondary" size="sm" onClick={alerts.reload} loading={alerts.loading}>
          Refresh
        </Button>
      </PageHeader>

      {alerts.error && <ErrorState message={alerts.error} onRetry={alerts.reload} />}

      <DataToolbar view={view} quick="status" searchPlaceholder="Search type, detail, institute, district…" exportName="sentinel-alerts" />

      {alerts.loading ? (
        <SkeletonRows rows={5} />
      ) : view.result.length === 0 ? (
        <EmptyState
          title={rows.length ? "No alerts match these filters" : "No alerts yet"}
          body={rows.length ? "Loosen a filter above, or clear them all." : "New ones land here as the detectors write them."}
          action={rows.length > 0 && <Button size="sm" onClick={view.clearFilters}>Clear all filters</Button>}
        />
      ) : (
        <GroupedList view={view}>{renderList}</GroupedList>
      )}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §18  PAGE: Cameras
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Connection health across every institute's cameras.
 *
 * This is NOT a live video wall, and the page says so in as many words. Live
 * streaming needs a WebRTC/RTSP gateway — materially heavier infrastructure,
 * documented as a separate integration step. Rendering a fake video frame here
 * would be exactly the overclaim the rest of this project avoids.
 *
 * What it IS: last-ping monitoring, which is a real signal. A feed going stale
 * shortly before a scheduled visit is worth flagging on its own.
 */
function CameraWall() {
  const cameras = useApi(API.cameras.list(), { fallback: [] });
  const institutes = useApi(API.institutes.list(), { fallback: [] });

  const instituteIndex = useMemo(() => byId(institutes.data || []), [institutes.data]);
  const rows = cameras.data || [];

  const counts = useMemo(
    () => ({
      all: rows.length,
      online: rows.filter((c) => c.status === "online").length,
      stale: rows.filter((c) => c.status === "stale").length,
      offline: rows.filter((c) => c.status === "offline").length,
    }),
    [rows]
  );

  const fields = useMemo(
    () => [
      { key: "status", label: "Feed status", type: "enum", options: optsFrom(CAMERA_STATUS, ["offline", "stale", "online"]) },
      { key: "name", label: "Camera", type: "text" },
      ...instituteLinkFields(instituteIndex),
      { key: "last_ping_at", label: "Last ping", type: "date" },
    ],
    [instituteIndex]
  );

  const view = useDataView(rows, {
    fields,
    storageKey: "cameras",
    initial: { sort: [{ key: "status", dir: "asc" }, { key: "last_ping_at", dir: "asc" }] },
    presets: [
      { name: "Not reporting", hint: "Offline or stale, longest-silent first", state: { facets: { status: ["offline", "stale"] }, sort: [{ key: "last_ping_at", dir: "asc" }] } },
      { name: "Silent for over 24 hours", hint: "Worth a phone call", state: { dates: { last_ping_at: { preset: "older24" } }, sort: [{ key: "last_ping_at", dir: "asc" }] } },
      { name: "By institute", hint: "Every feed, grouped", state: { groupBy: "institute", sort: [{ key: "status", dir: "asc" }] } },
      { name: "By district", hint: "Coverage across the map", state: { groupBy: "district", sort: [{ key: "status", dir: "asc" }] } },
    ],
  });

  const uptime = counts.all ? Math.round((counts.online / counts.all) * 100) : null;

  const renderGrid = (list) => (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((cam) => {
        const cs = cameraStatus(cam.status);
        const inst = instituteIndex.get(cam.institute_id);
        return (
          <li key={cam.id}>
            <Card
              as="article"
              className={`h-full border-l-[3px] p-4 transition-shadow hover:shadow-float ${
                cs.tone === "flag" ? "border-l-signal-flag" : cs.tone === "watch" ? "border-l-signal-watch" : "border-l-signal-good"
              }`}
            >
              <StatusDot toneName={cs.tone} glyph={cs.glyph} label={cs.label} />
              <p className="mt-2 truncate text-sm font-medium" title={cam.name}>
                {cam.name}
              </p>
              {inst ? (
                <Link
                  to={`/institutes/${inst.id}`}
                  className="mt-0.5 block truncate text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  {inst.name}
                </Link>
              ) : (
                <p className="mt-0.5 text-xs text-ink-muted">Institute not in register</p>
              )}
              <p className="mt-3 border-t border-paper-line pt-2 font-mono text-[11px] text-ink-muted" title={formatDateTime(cam.last_ping_at)}>
                {cam.last_ping_at ? `last ping ${relativeTime(cam.last_ping_at)}` : "never pinged"}
              </p>
            </Card>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Page>
      <PageHeader
        title="Camera wall"
        lede="Connection health for every registered feed. A camera going dark shortly before a scheduled visit is itself a signal, which is why this sits beside the anomaly model rather than under it."
      />

      {cameras.error && <ErrorState message={cameras.error} onRetry={cameras.reload} />}

      {/* The honesty note, above the grid rather than buried in a code comment */}
      <div className="mb-5 rounded-lg border border-paper-line bg-paper-dim/50 px-4 py-3">
        <p className="text-xs leading-relaxed text-ink/70">
          <strong className="font-medium">This is not live video.</strong> Each tile shows whether a feed is reachable
          and when it last checked in. Streaming the footage itself needs a WebRTC/RTSP gateway, which is a separate
          piece of infrastructure — so rather than show a placeholder video frame, this page shows the signal it
          actually has.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Feeds registered" value={counts.all} loading={cameras.loading} />
        <StatTile
          label="Reporting normally"
          value={uptime === null ? "—" : `${uptime}%`}
          toneName={uptime !== null && uptime < 80 ? "watch" : "good"}
          glyph={uptime !== null && uptime < 80 ? "watch" : "check"}
          loading={cameras.loading}
          hint={`${counts.online} of ${counts.all} online`}
        />
        <StatTile
          label="Stale"
          value={counts.stale}
          toneName={counts.stale ? "watch" : "good"}
          glyph={counts.stale ? "watch" : "check"}
          loading={cameras.loading}
          hint="Reachable, but hasn't pinged recently"
        />
        <StatTile
          label="Offline"
          value={counts.offline}
          toneName={counts.offline ? "flag" : "good"}
          glyph={counts.offline ? "flag" : "check"}
          loading={cameras.loading}
          hint="Not responding at all"
        />
      </div>

      <Card className="mb-4 mt-4 px-5 py-4">
        <ShareBar
          segments={[
            { name: "Online", value: counts.online, toneName: "good", glyph: "check" },
            { name: "Stale", value: counts.stale, toneName: "watch", glyph: "watch" },
            { name: "Offline", value: counts.offline, toneName: "flag", glyph: "flag" },
          ]}
          caption="Status is set by the backend from each feed's last_ping_at."
        />
      </Card>

      <DataToolbar view={view} quick="status" searchPlaceholder="Search camera, institute, district…" exportName="sentinel-cameras" />

      {cameras.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-ink/[0.05]" />
          ))}
        </div>
      ) : view.result.length === 0 ? (
        <EmptyState
          title={rows.length ? "No feeds match these filters" : "No cameras registered"}
          body={rows.length ? "Loosen a filter above, or clear them all." : "Once an institute's feeds are registered they appear here with their connection status."}
          action={rows.length > 0 && <Button size="sm" onClick={view.clearFilters}>Clear all filters</Button>}
        />
      ) : (
        <GroupedList view={view}>{renderGrid}</GroupedList>
      )}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §19  PAGE: Register
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The register: every institute in one sortable table. The map answers "where",
 * this answers "which" — and it is the only place an official can rank the
 * whole portfolio by score.
 */
const scoreOf = (i) => toNumber(i.compliance_score, 0);
const rankOf = (i) => ({ red: 0, yellow: 1, green: 2 }[i.status] ?? 3);

const SCORE_PRESETS = [
  { label: "Below 60", max: 59.99 },
  { label: "60 – 70", min: 60, max: 69.99 },
  { label: "70 – 85", min: 70, max: 84.99 },
  { label: "85 and above", min: 85 },
];

/** The register's fields — also reused by Renewals. */
const INSTITUTE_FIELDS = [
  {
    key: "attention",
    label: "Needs attention",
    type: "sort",
    compare: (a, b) => rankOf(a) - rankOf(b) || scoreOf(a) - scoreOf(b),
  },
  { key: "name", label: "Institute", type: "text" },
  { key: "type", label: "Type", type: "enum", display: instituteType },
  { key: "district", label: "District", type: "enum" },
  { key: "state", label: "State", type: "enum" },
  { key: "status", label: "Status", type: "enum", options: optsFrom(INSTITUTE_STATUS, ["red", "yellow", "green"]) },
  { key: "renewal_status", label: "Renewal", type: "enum", options: optsFrom(RENEWAL_STATUS) },
  { key: "compliance_score", label: "Compliance", type: "number", format: formatScore, presets: SCORE_PRESETS, searchable: false },
];

const REGISTER_COLUMNS = [
  { key: "name", label: "Institute", sortKey: "name", locked: true },
  { key: "type", label: "Type", sortKey: "type" },
  { key: "district", label: "District", sortKey: "district" },
  { key: "state", label: "State", sortKey: "state" },
  { key: "score", label: "Compliance", sortKey: "compliance_score", width: "11rem" },
  { key: "status", label: "Status", sortKey: "status" },
  { key: "renewal", label: "Renewal", sortKey: "renewal_status" },
];

function Institutes() {
  const { data, loading, error, reload } = useApi(API.institutes.list(), { fallback: [] });
  const institutes = data || [];
  const districts = countBy(institutes, "district");

  const view = useDataView(institutes, {
    fields: INSTITUTE_FIELDS,
    storageKey: "register",
    initial: { sort: [{ key: "attention", dir: "asc" }] },
    presets: [
      { name: "Needs attention first", hint: "Flagged, then watch, lowest score first", state: { sort: [{ key: "attention", dir: "asc" }] } },
      { name: "Below 60 — act now", hint: "Lowest compliance scores", state: { ranges: { compliance_score: { min: "", max: 59.99 } }, sort: [{ key: "compliance_score", dir: "asc" }] } },
      { name: "District league table", hint: "Grouped by district, best first", state: { groupBy: "district", sort: [{ key: "compliance_score", dir: "desc" }] } },
      { name: "Renewal pending", hint: "Awaiting a decision", state: { facets: { renewal_status: ["pending"] }, sort: [{ key: "compliance_score", dir: "asc" }] } },
      { name: "By institute type", hint: "Shelters, hostels, homes…", state: { groupBy: "type", sort: [{ key: "attention", dir: "asc" }] } },
      { name: "A → Z", hint: "Alphabetical", state: { sort: [{ key: "name", dir: "asc" }] } },
    ],
  });

  const [hidden, setHidden] = useState(() => readStore("localStorage", "sentinel.registerHidden", ["state"]));
  useEffect(() => writeStore("localStorage", "sentinel.registerHidden", hidden), [hidden]);
  const columns = REGISTER_COLUMNS.filter((c) => !hidden.includes(c.key));
  const show = (k) => !hidden.includes(k);

  const renderTable = (list) => <RegisterTable list={list} columns={columns} show={show} view={view} />;

  return (
    <Page>
      <PageHeader
        title="Institute register"
        lede={`Every institute under monitoring${
          districts.length ? `, across ${districts.length} district${districts.length === 1 ? "" : "s"}` : ""
        }. Ranked by what needs looking at, not alphabetically.`}
      />

      {error && <ErrorState message={error} onRetry={reload} />}

      <DataToolbar
        view={view}
        quick="status"
        searchPlaceholder="Search name, district, type…"
        exportName="sentinel-register"
        extra={<ColumnPicker columns={REGISTER_COLUMNS} hidden={hidden} onChange={setHidden} />}
      />

      {loading ? (
        <SkeletonRows rows={6} height="h-12" />
      ) : view.result.length === 0 ? (
        <EmptyState
          title="No institutes match"
          body="Loosen a filter above, or clear them all."
          action={institutes.length > 0 && <Button size="sm" onClick={view.clearFilters}>Clear all filters</Button>}
        />
      ) : (
        <GroupedList view={view}>{renderTable}</GroupedList>
      )}

      {!loading && districts.length > 1 && (
        <p className="mt-4 text-xs text-ink-muted">
          Districts represented: {districts.map((d) => `${d.name} (${d.value})`).join(", ")}.
        </p>
      )}
    </Page>
  );
}

function RegisterTable({ list, columns, show, view }) {
  const paged = usePaged(list, 25);
  return (
    <Card className="overflow-hidden">
      <Table head={columns} sort={view.state.sort} onSort={view.toggleSort}>
        {paged.slice.map((inst) => {
          const st = instituteStatus(inst.status);
          const rn = renewalStatus(inst.renewal_status);
          return (
            <tr key={inst.id} className="group transition-colors hover:bg-[#FF9933]/[0.05]">
              <Td>
                <Link to={`/institutes/${inst.id}`} className="font-medium underline-offset-2 group-hover:underline">
                  {inst.name}
                </Link>
              </Td>
              {show("type") && <Td className="text-ink-muted">{instituteType(inst.type)}</Td>}
              {show("district") && <Td className="text-ink-muted">{inst.district || "—"}</Td>}
              {show("state") && <Td className="text-ink-muted">{inst.state || "—"}</Td>}
              {show("score") && (
                <Td>
                  <Meter compact value={Number(formatScore(inst.compliance_score)) || 0} toneName={st.tone} label={`${inst.name} compliance score`} />
                </Td>
              )}
              {show("status") && (
                <Td>
                  <StatusDot toneName={st.tone} glyph={st.glyph} label={st.label} />
                </Td>
              )}
              {show("renewal") && (
                <Td>
                  <StatusDot toneName={rn.tone} glyph={rn.glyph} label={rn.label} />
                </Td>
              )}
            </tr>
          );
        })}
      </Table>
      <Paginator paged={paged} />
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §20  PAGE: Institute detail
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * One institute, everything about it.
 *
 * v1 had no such page — the map popup could only link to a filtered alert list,
 * so "tell me about this institute" meant reading four screens. This assembles
 * the same picture from endpoints that already exist.
 *
 * Note it does NOT call GET /institutes/{id}: that route is tagged DERIVED in
 * endpoints.js and isn't proven by a test. The list endpoint is proven, so the
 * institute is read out of it. One fewer thing for the backend to have to match.
 */
function InstituteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canDecideRenewals } = useAuth();
  const toast = useToast();

  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const scopedAlerts = useApi(API.institutes.alerts(id), { fallback: [], optional: true, deps: [id] });
  const allAlerts = useApi(API.alerts.list(), { fallback: [] });
  const cameras = useApi(API.cameras.list(), { fallback: [] });
  const grievances = useApi(API.grievances.list(), { fallback: [], optional: true });

  const [deciding, setDeciding] = useState(false);

  const institute = (institutes.data || []).find((i) => i.id === id);

  // Prefer the institute-scoped endpoint; fall back to filtering the global
  // ledger if it isn't wired yet. Either way the page has its alerts.
  const alerts = useMemo(() => {
    const scoped = scopedAlerts.data || [];
    if (scoped.length || scopedAlerts.unavailable === false) {
      if (scoped.length) return scoped;
    }
    return (allAlerts.data || []).filter((a) => a.institute_id === id);
  }, [scopedAlerts.data, scopedAlerts.unavailable, allAlerts.data, id]);

  const ourCameras = (cameras.data || []).filter((c) => c.institute_id === id);
  const ourGrievances = (grievances.data || []).filter((g) => g.institute_id === id);

  const openAlerts = alerts.filter((a) => a.status === "open");
  const criticalCount = openAlerts.filter((a) => a.severity === "red").length;
  const perDay = alertsPerDay(alerts, 21);
  const byType = countBy(openAlerts, "type").map((r) => ({ ...r, label: alertTypeLabel(r.name), note: ALERT_TYPE_NOTE[r.name] }));

  async function decideRenewal(decision) {
    setDeciding(true);
    try {
      await api.patch(API.institutes.renewal(id), { decision });
      toast.success(decision === "approved" ? "Renewal approved" : "Renewal rejected");
      institutes.reload();
    } catch (err) {
      toast.error(errorMessage(err, "That decision couldn't be recorded"));
    } finally {
      setDeciding(false);
    }
  }

  if (institutes.loading) {
    return (
      <Page>
        <SkeletonRows rows={5} />
      </Page>
    );
  }

  if (institutes.error) {
    return (
      <Page>
        <ErrorState message={institutes.error} onRetry={institutes.reload} />
      </Page>
    );
  }

  if (!institute) {
    return (
      <Page>
        <EmptyState
          title="No such institute"
          body={`Nothing in the register has the id ${shortId(id)}. It may have been removed since this link was made.`}
          action={<Button onClick={() => navigate("/institutes")}>Back to the register</Button>}
        />
      </Page>
    );
  }

  const st = instituteStatus(institute.status);
  const rn = renewalStatus(institute.renewal_status);
  const score = Number(formatScore(institute.compliance_score)) || 0;

  return (
    <Page>
      <nav className="mb-3 text-xs text-ink-muted" aria-label="Breadcrumb">
        <Link to="/institutes" className="underline-offset-2 hover:text-ink hover:underline">
          Register
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          /
        </span>
        <span className="text-ink/70">{institute.name}</span>
      </nav>

      <PageHeader
        title={institute.name}
        lede={[instituteType(institute.type), institute.district, institute.state].filter(Boolean).join(" · ")}
      >
        <Link
          to={`/alerts?institute=${institute.id}`}
          className="snt-glass rounded-md border border-ink/20 bg-paper-raised px-3.5 py-2 text-sm font-medium hover:border-ink/40"
        >
          Alert history
        </Link>
        <Link
          to="/map"
          className="snt-glass rounded-md border border-ink/20 bg-paper-raised px-3.5 py-2 text-sm font-medium hover:border-ink/40"
        >
          On the map
        </Link>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge toneName={st.tone} glyph={st.glyph}>
          {st.label}
        </Badge>
        <Badge toneName={rn.tone} glyph={rn.glyph}>
          Renewal {rn.label.toLowerCase()}
        </Badge>
        {criticalCount > 0 && (
          <Badge toneName="flag" glyph="flag">
            {criticalCount} critical open
          </Badge>
        )}
      </div>

      {/* --------------------------------------------------- headline ---- */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Compliance score"
          value={formatScore(institute.compliance_score)}
          unit="/ 100"
          toneName={st.tone}
          footer={<Meter compact value={score} toneName={st.tone} label="Compliance score" />}
        />
        <StatTile
          label="Open alerts"
          value={openAlerts.length}
          toneName={openAlerts.length ? "watch" : "good"}
          glyph={openAlerts.length ? "watch" : "check"}
          hint={`${alerts.length} raised in total`}
        />
        <StatTile
          label="Cameras reporting"
          value={`${ourCameras.filter((c) => c.status === "online").length}/${ourCameras.length || 0}`}
          toneName={ourCameras.some((c) => c.status === "offline") ? "flag" : "good"}
          glyph={ourCameras.some((c) => c.status === "offline") ? "flag" : "check"}
          hint="Connection health, not live video"
        />
        <StatTile
          label="Open grievances"
          value={ourGrievances.filter((g) => g.status !== "resolved").length}
          toneName={ourGrievances.some((g) => g.status !== "resolved") ? "watch" : "good"}
          glyph={ourGrievances.some((g) => g.status !== "resolved") ? "watch" : "check"}
          hint="Raised through Setu"
        />
      </div>

      <AssignedInspectorCard institute={institute} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* ------------------------------------------------- alerts ------ */}
        <Card>
          <CardHeader
            title="Alerts"
            subtitle="Everything the detectors have written about this institute."
            action={
              <Link
                to={`/alerts?institute=${institute.id}`}
                className="text-xs font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline"
              >
                Open in ledger →
              </Link>
            }
          />
          <div className="px-5 py-4">
            {allAlerts.loading && scopedAlerts.loading ? (
              <SkeletonRows rows={3} height="h-12" />
            ) : alerts.length === 0 ? (
              <EmptyState title="No alerts on record" body="No detector has flagged anything at this institute yet." />
            ) : (
              <ul className="divide-y divide-paper-line">
                {alertsByUrgency(alerts)
                  .slice(0, 8)
                  .map((a) => {
                    const sev = severityOf(a.severity);
                    return (
                      <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm">
                              <Badge toneName={sev.tone} glyph={sev.glyph}>
                                {sev.label}
                              </Badge>
                              <span className="font-medium">{alertTypeLabel(a.type)}</span>
                              <span className="text-2xs uppercase tracking-wide text-ink-muted">{a.status}</span>
                            </p>
                            {a.detail && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{a.detail}</p>}
                          </div>
                          <time
                            dateTime={a.created_at}
                            title={formatDateTime(a.created_at)}
                            className="shrink-0 text-xs text-ink-muted"
                          >
                            {relativeTime(a.created_at)}
                          </time>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </Card>

        {/* ---------------------------------------------- the record ----- */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Record" />
            <div className="px-5 py-4">
              <KeyValue
                items={[
                  { label: "Type", value: instituteType(institute.type) },
                  { label: "District", value: institute.district },
                  { label: "State", value: institute.state },
                  { label: "Renewal", value: <StatusDot toneName={rn.tone} glyph={rn.glyph} label={rn.label} /> },
                  {
                    label: "Coordinates",
                    value: `${toNumber(institute.latitude).toFixed(4)}, ${toNumber(institute.longitude).toFixed(4)}`,
                    mono: true,
                  },
                  { label: "Institute ID", value: shortId(institute.id), mono: true },
                ]}
              />

              {canDecideRenewals && institute.renewal_status === "pending" && (
                <div className="mt-4 border-t border-paper-line pt-4">
                  <p className="text-xs text-ink-muted">This institute's registration renewal is awaiting a decision.</p>
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" variant="approve" loading={deciding} onClick={() => decideRenewal("approved")}>
                      Approve renewal
                    </Button>
                    <Button size="sm" variant="secondary" loading={deciding} onClick={() => decideRenewal("rejected")}>
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Cameras" subtitle="Connection health only." />
            <div className="px-5 py-4">
              {cameras.loading ? (
                <SkeletonRows rows={1} height="h-14" />
              ) : ourCameras.length === 0 ? (
                <p className="py-2 text-xs text-ink-muted">No camera feeds registered for this institute.</p>
              ) : (
                <>
                  <ShareBar
                    segments={["online", "stale", "offline"].map((s) => ({
                      name: cameraStatus(s).label,
                      value: ourCameras.filter((c) => c.status === s).length,
                      toneName: cameraStatus(s).tone,
                      glyph: cameraStatus(s).glyph,
                    }))}
                  />
                  <ul className="mt-3 space-y-1.5 border-t border-paper-line pt-3">
                    {ourCameras.map((cam) => {
                      const cs = cameraStatus(cam.status);
                      return (
                        <li key={cam.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate">{cam.name}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-ink-muted">{relativeTime(cam.last_ping_at)}</span>
                            <StatusDot toneName={cs.tone} glyph={cs.glyph} label={cs.label} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Alert rhythm, last 21 days"
            subtitle="The pattern matters more than any single flag — a cluster right before a scheduled visit is exactly what the anomaly model is built to catch."
          />
          <div className="px-5 py-4">
            <TimeColumns buckets={perDay} label="alerts" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Open alerts by detector" />
          <div className="px-5 py-4">
            <BarList items={byType} emptyLabel="Nothing open" />
          </div>
        </Card>
      </div>

      {ourGrievances.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            title="Grievances from this institute"
            subtitle="Raised in Setu by staff or beneficiaries."
            action={
              <Link to="/grievances" className="text-xs font-medium text-ink/60 underline-offset-4 hover:text-ink hover:underline">
                All grievances →
              </Link>
            }
          />
          <ul className="divide-y divide-paper-line px-5">
            {ourGrievances.slice(0, 5).map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{g.subject}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{g.description}</p>
                </div>
                <span className="shrink-0 text-xs text-ink-muted">{relativeTime(g.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §21  PAGE: Analytics
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The portfolio-wide read — the view a single institute's score can't give.
 *
 * Every number here is either served by /analytics/compliance-summary or
 * computed client-side from a list endpoint. Where it's the latter, the panel
 * says so: an official should know which figures the server stands behind.
 */
function Analytics() {
  const summary = useApi(API.analytics.complianceSummary());
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const alerts = useApi(API.alerts.list(), { fallback: [] });
  const cameras = useApi(API.cameras.list(), { fallback: [] });

  const [view, setView] = useState("chart");

  const s = summary.data;
  const rows = institutes.data || [];
  const alertRows = alerts.data || [];

  const statusCounts = tally(rows, "status", ["green", "yellow", "red"]);
  const bands = scoreHistogram(rows);
  const byDistrict = countBy(rows, "district").slice(0, 8);
  const byType = countBy(rows, "type").map((r) => ({ ...r, label: instituteType(r.name) }));
  const alertTypes = countBy(alertRows, "type").map((r) => ({ ...r, label: alertTypeLabel(r.name) }));
  const perDay = alertsPerDay(alertRows, 30);
  const avgLocal = mean(rows, "compliance_score");

  const cameraCounts = tally(cameras.data || [], "status", ["online", "stale", "offline"]);

  if (summary.error && institutes.error) {
    return (
      <Page>
        <PageHeader title="Analytics" />
        <ErrorState message={summary.error} onRetry={() => { summary.reload(); institutes.reload(); }} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Analytics"
        lede="The aggregate an official needs and a single institute's page can't show: how the whole portfolio is sitting, and where the pressure is concentrated."
      >
        <SegmentedControl
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Charts" },
            { value: "table", label: "Table" },
          ]}
        />
      </PageHeader>

      {/* ------------------------------------------------------ headline -- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Institutes"
          value={s?.total_institutes ?? rows.length ?? "—"}
          loading={summary.loading && institutes.loading}
        />
        <StatTile
          label="Average compliance"
          value={s ? formatScore(s.average_compliance_score) : avgLocal !== null ? formatScore(avgLocal) : "—"}
          unit="/ 100"
          loading={summary.loading && institutes.loading}
          hint={s ? "Served by the backend" : "Computed here — summary endpoint unavailable"}
        />
        <StatTile
          label="Open alerts"
          value={s?.open_alerts_count ?? alertRows.filter((a) => a.status === "open").length}
          toneName="watch"
          glyph="watch"
          loading={summary.loading && alerts.loading}
        />
        <StatTile
          label="Critical alerts"
          value={s?.red_alerts_count ?? alertRows.filter((a) => a.severity === "red" && a.status === "open").length}
          toneName={(s?.red_alerts_count ?? 0) > 0 ? "flag" : "good"}
          glyph={(s?.red_alerts_count ?? 0) > 0 ? "flag" : "check"}
          loading={summary.loading && alerts.loading}
        />
      </div>

      {view === "table" ? (
        /* The table view. Required relief, not an afterthought: two of the
           status colours sit under 3:1 on this surface, so every figure a
           chart encodes has to be readable as a number somewhere. */
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Status distribution" />
            <div className="px-5 py-4">
              <DataTable
                columns={["Status", "Institutes"]}
                rows={[
                  ["Compliant", statusCounts.green],
                  ["Watch", statusCounts.yellow],
                  ["Flagged", statusCounts.red],
                  ["Total", rows.length],
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Compliance score bands" />
            <div className="px-5 py-4">
              <DataTable columns={["Band", "Institutes"]} rows={bands.map((b) => [b.name, b.value])} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Alerts by detector" />
            <div className="px-5 py-4">
              <DataTable
                columns={["Detector", "Alerts"]}
                rows={alertTypes.length ? alertTypes.map((a) => [a.label, a.value]) : [["No alerts on record", 0]]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Institutes by district" />
            <div className="px-5 py-4">
              <DataTable
                columns={["District", "Institutes"]}
                rows={byDistrict.length ? byDistrict.map((d) => [d.name, d.value]) : [["Not recorded", 0]]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Camera health" />
            <div className="px-5 py-4">
              <DataTable
                columns={["Feed status", "Cameras"]}
                rows={[
                  ["Online", cameraCounts.online],
                  ["Stale", cameraCounts.stale],
                  ["Offline", cameraCounts.offline],
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Institutes by type" />
            <div className="px-5 py-4">
              <DataTable
                columns={["Type", "Institutes"]}
                rows={byType.length ? byType.map((t) => [t.label, t.value]) : [["Not recorded", 0]]}
              />
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Status distribution"
                subtitle="Where the portfolio sits right now."
              />
              <div className="px-5 py-5">
                {institutes.loading ? (
                  <SkeletonRows rows={1} height="h-16" />
                ) : (
                  <ShareBar
                    segments={[
                      { name: "Compliant", value: statusCounts.green, toneName: "good", glyph: "check" },
                      { name: "Watch", value: statusCounts.yellow, toneName: "watch", glyph: "watch" },
                      { name: "Flagged", value: statusCounts.red, toneName: "flag", glyph: "flag" },
                    ]}
                    total={rows.length}
                  />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Compliance score bands"
                subtitle="How scores are spread — an average of 82 looks different if it's everyone at 82 or half at 95 and half at 69."
              />
              <div className="px-5 py-4">
                {institutes.loading ? <SkeletonRows rows={3} height="h-8" /> : <BarList items={bands} />}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Alerts raised, last 30 days"
              subtitle="Counted client-side from each alert's created_at — there is no server-side time series endpoint yet."
            />
            <div className="px-5 py-5">
              {alerts.loading ? (
                <SkeletonRows rows={1} height="h-24" />
              ) : (
                <TimeColumns
                  buckets={perDay}
                  height={110}
                  label="alerts"
                  caption="Empty days are kept as zeros. Clusters are the thing to look for — a run of flags before a scheduled visit is what the anomaly model exists to catch."
                />
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Alerts by detector" subtitle="Which check is firing most." />
              <div className="px-5 py-4">
                {alerts.loading ? (
                  <SkeletonRows rows={3} height="h-8" />
                ) : (
                  <BarList items={alertTypes} emptyLabel="No alerts on record" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Institutes by district" subtitle="Where the portfolio is concentrated." />
              <div className="px-5 py-4">
                {institutes.loading ? (
                  <SkeletonRows rows={3} height="h-8" />
                ) : (
                  <BarList items={byDistrict} emptyLabel="No districts recorded" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Institutes by type" />
              <div className="px-5 py-4">
                {institutes.loading ? (
                  <SkeletonRows rows={3} height="h-8" />
                ) : (
                  <BarList items={byType} emptyLabel="No types recorded" />
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-ink-muted">
        Figures marked as served come from <code className="font-mono">/analytics/compliance-summary</code>. Everything
        else on this page is aggregated in the browser from the institute, alert and camera lists — no metric here is
        invented, and none is shown that the backend can't currently support.
      </p>
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §22  PAGE: Draw
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The draw.
 *
 * This is the project's headline claim and v1 had no UI for it at all — the
 * demo script told judges to hit /assignments/generate in Swagger. That
 * undersells it: the point worth seeing is that two consecutive draws produce
 * different pairs and each carries its own 32-hex seed reference, which is
 * exactly what this page puts on screen.
 *
 * POST /assignments/generate is CONFIRMED (test_auth_rbac.py, test_evidence.py).
 * GET /assignments is ASSUMED — the page works entirely without it, keeping the
 * draws made in this session in local state.
 */
function Assignments() {
  const toast = useToast();
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const history = useApi(API.assignments.list(), { fallback: [], optional: true });

  const [drawing, setDrawing] = useState(false);
  const [sessionDraws, setSessionDraws] = useState([]);
  const [error, setError] = useState("");

  const instituteIndex = byId(institutes.data || []);

  async function draw() {
    setDrawing(true);
    setError("");
    try {
      const { data } = await api.post(API.assignments.generate());
      setSessionDraws((prev) => [{ ...data, _drawnAt: new Date().toISOString() }, ...prev]);
      toast.success("Assignment drawn");
      history.reload();
    } catch (err) {
      const message = errorMessage(err, "The draw couldn't be completed");
      setError(
        err.response?.status === 403
          ? "Your role can't run the draw — that's an administrator action."
          : message
      );
      toast.error(message);
    } finally {
      setDrawing(false);
    }
  }

  // Session draws first (they're what the person just did), then any server
  // history, with duplicates removed by id.
  const seen = new Set(sessionDraws.map((d) => d.id));
  const combined = [...sessionDraws, ...(history.data || []).filter((d) => !seen.has(d.id))];

  return (
    <Page>
      <PageHeader
        title="Assignment draw"
        lede="Inspector-to-institute pairings are drawn from a CSPRNG, not a rotation. A rolling fairness window blocks an inspector being sent back to an institute they recently visited, so neither side can anticipate the other."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* ------------------------------------------------- the action -- */}
        <Card className="overflow-hidden">
          <div className="bg-ink px-6 py-7 text-paper">
            <p className="text-2xs uppercase tracking-[0.14em] text-paper/45">Live draw</p>
            <p className="mt-2 font-display text-2xl leading-tight">Generate an assignment</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/60">
              Each call is an independent cryptographic draw. Run it twice — the pairs differ, and each carries its own
              seed reference. That's the proof it isn't a lookup table.
            </p>
            <Button
              variant="secondary"
              size="lg"
              loading={drawing}
              onClick={draw}
              className="mt-5 w-full !border-paper/25 !bg-paper !text-ink hover:!bg-paper-dim"
            >
              {drawing ? "Drawing…" : "Run the draw"}
            </Button>
            {error && <p className="mt-3 text-xs leading-relaxed text-signal-watch">{error}</p>}
          </div>

          <div className="space-y-3 px-5 py-4 text-xs leading-relaxed text-ink-muted">
            <Detail
              term="CSPRNG, not random()"
              body="The engine uses Python's secrets module. A seedable PRNG would make a draw reproducible by anyone who learned the seed."
            />
            <Detail
              term="Weighted by overdue-ness"
              body="Institutes that haven't been inspected in a while enter the pool more times, so the draw stays random without being uniform."
            />
            <Detail
              term="Fairness window"
              body="An inspector recently paired with an institute is excluded from that institute's draw — unless they're the only one left, where the engine falls back rather than failing the cycle."
            />
            <Detail
              term="Working-hours dispatch"
              body="Dispatch times land between 09:00 and 17:00."
            />
          </div>
        </Card>

        {/* ----------------------------------------------- the results --- */}
        <div className="space-y-4">
          {sessionDraws.length > 0 && (
            <Card>
              <CardHeader
                title="Drawn just now"
                subtitle={`${sessionDraws.length} draw${sessionDraws.length === 1 ? "" : "s"} this session.`}
                action={
                  <button
                    onClick={() => setSessionDraws([])}
                    className="text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                  >
                    Clear
                  </button>
                }
              />
              <ul className="divide-y divide-paper-line">
                {sessionDraws.map((d, i) => (
                  <DrawCard key={d.id || i} draw={d} instituteIndex={instituteIndex} fresh={i === 0} />
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Assignment history" subtitle="Every pairing on record." />
            <div className="px-5 py-4">
              {history.loading ? (
                <SkeletonRows rows={3} height="h-10" />
              ) : history.unavailable ? (
                <NotWiredState what="Assignment history" path="GET /api/v1/assignments" />
              ) : combined.length === 0 ? (
                <EmptyState
                  title="No assignments yet"
                  body="Run the draw to create the first pairing. It'll appear here and on the inspector's device in Nayan."
                />
              ) : (
                <Table
                  head={[
                    { key: "institute", label: "Institute" },
                    { key: "inspector", label: "Inspector" },
                    { key: "seed", label: "Seed ref" },
                    { key: "when", label: "Drawn", align: "right" },
                  ]}
                >
                  {combined.map((d, i) => (
                    <tr key={d.id || i}>
                      <Td>
                        {instituteIndex.get(d.institute_id) ? (
                          <Link
                            to={`/institutes/${d.institute_id}`}
                            className="font-medium underline-offset-2 hover:underline"
                          >
                            {instituteIndex.get(d.institute_id).name}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{shortId(d.institute_id)}</span>
                        )}
                      </Td>
                      <Td>
                        <InspectorInline inspectorId={d.inspector_id} instituteId={d.institute_id} />
                      </Td>
                      <Td className="font-mono text-[11px] text-ink-muted">{d.random_seed_ref || "—"}</Td>
                      <Td align="right" className="text-xs text-ink-muted">
                        {relativeTime(d.created_at || d._drawnAt)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Detail({ term, body }) {
  return (
    <div>
      <p className="font-medium text-ink/80">{term}</p>
      <p className="mt-0.5">{body}</p>
    </div>
  );
}

/** A single draw, laid out so the seed reference is the thing you notice. */
function DrawCard({ draw, instituteIndex, fresh }) {
  const institute = instituteIndex.get(draw.institute_id);
  return (
    <li className={`px-5 py-4 ${fresh ? "animate-fade-up bg-signal-good-soft/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs uppercase tracking-wider text-ink-muted">Institute</p>
          <p className="truncate font-display text-base">
            {institute ? (
              <Link to={`/institutes/${institute.id}`} className="underline-offset-2 hover:underline">
                {institute.name}
              </Link>
            ) : (
              <span className="font-mono text-sm">{shortId(draw.institute_id)}</span>
            )}
          </p>
        </div>
        {fresh && (
          <Badge toneName="good" glyph="check">
            New
          </Badge>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-2xs uppercase tracking-wider text-ink-muted">Inspector</p>
          <InspectorInline inspectorId={draw.inspector_id} instituteId={draw.institute_id} />
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-ink-muted">Dispatch</p>
          <p className="text-xs">
            {draw.dispatch_time ? formatDateTime(draw.dispatch_time) : <span className="text-ink-muted">not returned</span>}
          </p>
        </div>
      </div>

      {/* The seed reference is the artefact that makes the draw auditable, so
          it gets the emphasis rather than being tucked into a detail row. */}
      <div className="mt-3 rounded-md bg-ink px-3 py-2">
        <p className="text-2xs uppercase tracking-wider text-paper/40">Seed reference</p>
        <p className="mt-0.5 break-all font-mono text-xs text-paper">{draw.random_seed_ref || "—"}</p>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-muted">
        32 hex characters from <code className="font-mono">secrets.token_hex(16)</code> — the record that this pairing
        was drawn, not chosen.
      </p>
    </li>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §23  PAGE: Grievances
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Grievances raised in Setu, answered here.
 *
 * The backend has had this endpoint all along — with cross-institute isolation
 * proven by three separate tests — and v1's Sentinel never showed it. That left
 * the "institutes have a real channel to respond" claim with no official on the
 * other end of it.
 */
function Grievances() {
  const toast = useToast();
  const grievances = useApi(API.grievances.list(), { fallback: [], optional: true });
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  // Re-evaluate the clocks every minute, so "due soon" flips without a reload.
  const now = useNow(60000).getTime();

  const [selected, setSelected] = useState(null);
  const [escalating, setEscalating] = useState(null); // a grievance, or "breached" for the bulk action
  const [reason, setReason] = useState("No response within the window");
  const [note, setNote] = useState("");
  // Which grievance is being updated, so only its own buttons spin.
  const [busyId, setBusyId] = useState(null);

  const instituteIndex = useMemo(() => byId(institutes.data || []), [institutes.data]);
  const rows = grievances.data || [];
  const slaOf = useCallback((g) => grievanceSla(g, now), [now]);

  const fields = useMemo(
    () => [
      { key: "status", label: "Status", type: "enum", options: optsFrom(GRIEVANCE_STATUS) },
      {
        key: "sla",
        label: "SLA",
        type: "enum",
        get: (r) => slaOf(r).state,
        options: optsFrom(SLA_STATE, ["breached", "due_soon", "on_track", "closed"]),
      },
      {
        key: "level",
        label: "Level",
        type: "enum",
        get: (r) => r.escalation_level || 1,
        options: ESCALATION_LEVELS.map((l) => ({ value: l.level, label: `${l.short} · ${l.label}` })),
      },
      { key: "due", label: "Due", type: "date", get: (r) => new Date(slaOf(r).due).toISOString() },
      { key: "subject", label: "Subject", type: "text" },
      { key: "description", label: "Text", type: "text", sortable: false },
      ...instituteLinkFields(instituteIndex),
      { key: "created_at", label: "Raised", type: "date" },
      {
        key: "urgency",
        label: "SLA urgency",
        type: "sort",
        compare: (a, b) => {
          const sa = slaOf(a);
          const sb = slaOf(b);
          return SLA_STATE[sa.state].rank - SLA_STATE[sb.state].rank || sa.due - sb.due;
        },
      },
    ],
    [instituteIndex, slaOf]
  );

  const view = useDataView(rows, {
    fields,
    storageKey: "grievances",
    initial: { facets: { status: ["open", "in_review"] }, sort: [{ key: "urgency", dir: "asc" }] },
    presets: [
      { name: "Breached SLA", hint: "Past the 21-day window at their current level", state: { facets: { sla: ["breached"] }, sort: [{ key: "due", dir: "asc" }] } },
      { name: "Due in 3 days", hint: "Act before these breach", state: { facets: { sla: ["due_soon"] }, sort: [{ key: "due", dir: "asc" }] } },
      { name: "Escalated (L2 and above)", hint: "Now with the State or the Ministry", state: { facets: { level: [2, 3] }, sort: [{ key: "urgency", dir: "asc" }] } },
      { name: "Waiting on us", hint: "Open or in review, most urgent first", state: { facets: { status: ["open", "in_review"] }, sort: [{ key: "urgency", dir: "asc" }] } },
      { name: "By institute", hint: "Repeat complaints stand out", state: { groupBy: "institute", sort: [{ key: "created_at", dir: "desc" }] } },
      { name: "By district", hint: "Where grievances cluster", state: { groupBy: "district", sort: [{ key: "urgency", dir: "asc" }] } },
    ],
  });

  const counts = useMemo(() => {
    const c = { breached: 0, due_soon: 0, on_track: 0, closed: 0, firstOverdue: 0 };
    rows.forEach((g) => {
      const s = slaOf(g);
      c[s.state] += 1;
      if (s.firstResponseOverdue) c.firstOverdue += 1;
    });
    return c;
  }, [rows, slaOf]);
  const breachedList = rows.filter((g) => {
    const s = slaOf(g);
    return s.state === "breached" && s.canEscalate;
  });

  async function setStatus(grievance, status) {
    setBusyId(grievance.id);
    try {
      await api.patch(API.grievances.status(grievance.id), { status });
      toast.success(status === "resolved" ? "Grievance marked resolved" : `Moved to ${status.replace("_", " ")}`);
      setSelected(null);
      grievances.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't update that grievance"));
    } finally {
      setBusyId(null);
    }
  }

  async function escalate(list) {
    const why = note.trim() ? `${reason} — ${note.trim()}` : reason;
    let ok = 0;
    let missing = false;
    for (const g of list) {
      setBusyId(g.id);
      try {
        // eslint-disable-next-line no-await-in-loop
        await api.post(API.grievances.escalate(g.id), { reason: why });
        ok += 1;
      } catch (err) {
        if (isMissingEndpoint(err)) {
          missing = true;
          break;
        }
        toast.error(`${g.subject}: ${errorMessage(err, "couldn't escalate")}`);
      }
    }
    setBusyId(null);
    setEscalating(null);
    setNote("");
    if (missing) toast.error("Escalation isn't wired on the backend yet — POST /grievances/{id}/escalate");
    else if (ok) toast.success(ok === 1 ? "Escalated to the next level" : `${ok} grievances escalated`);
    grievances.reload();
  }

  const escalateTargets = escalating === "breached" ? breachedList : escalating ? [escalating] : [];

  return (
    <Page>
      <PageHeader
        title="Grievances"
        lede="Raised in Setu by institute staff and beneficiaries. Each one runs on a clock: a first response within 3 days, resolution within 21 days of reaching its current level — or it goes up a level."
      >
        {breachedList.length > 0 && (
          <Button variant="danger" size="sm" onClick={() => setEscalating("breached")}>
            Escalate all breached ({breachedList.length})
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={grievances.reload} loading={grievances.loading}>
          Refresh
        </Button>
      </PageHeader>

      {grievances.error && <ErrorState message={grievances.error} onRetry={grievances.reload} />}

      {grievances.unavailable ? (
        <NotWiredState what="The grievance feed" path="GET /api/v1/grievances" />
      ) : (
        <>
          {/* SLA strip — each tile is also a one-click filter. */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { key: "breached", label: "Breached", value: counts.breached, tone: "flag", glyph: "flag", hint: "Past the window — escalate" },
              { key: "due_soon", label: "Due in 3 days", value: counts.due_soon, tone: "watch", glyph: "watch", hint: "Act before these breach" },
              { key: "on_track", label: "On track", value: counts.on_track, tone: "good", glyph: "check", hint: "Inside the window" },
              { key: "first", label: "No first response", value: counts.firstOverdue, tone: counts.firstOverdue ? "watch" : "good", glyph: counts.firstOverdue ? "watch" : "check", hint: "Still 'open' after 3 days" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() =>
                  t.key === "first"
                    ? view.apply({ facets: { status: ["open"] }, dates: { created_at: { preset: "older7" } }, sort: [{ key: "created_at", dir: "asc" }] })
                    : view.apply({ facets: { sla: [t.key] }, sort: [{ key: "due", dir: "asc" }] })
                }
                className="card snt-glass px-4 py-3.5 text-left"
              >
                <p className="text-2xs uppercase tracking-wider text-ink-muted">
                  <Bi en={t.label} inline altClassName="normal-case tracking-normal" />
                </p>
                <p className={`mt-1 flex items-baseline gap-1.5 ${tone(t.tone).text}`}>
                  <StatusGlyph kind={t.glyph} />
                  <span className="tnum font-display text-3xl font-medium leading-none">{t.value}</span>
                </p>
                <p className="mt-1.5 text-[11px] text-ink-muted">{t.hint}</p>
              </button>
            ))}
          </div>

          <DataToolbar view={view} quick="sla" searchPlaceholder="Search subject, text, institute…" exportName="sentinel-grievances" />

          {grievances.loading ? (
            <SkeletonRows rows={4} />
          ) : view.result.length === 0 ? (
            <EmptyState
              title={rows.length ? "No grievances match these filters" : "No grievances yet"}
              body={rows.length ? "Loosen a filter above, or clear them all." : "Grievances raised in Setu will appear here."}
              action={rows.length > 0 && <Button size="sm" onClick={view.clearFilters}>Clear all filters</Button>}
            />
          ) : (
            <GroupedList view={view}>
              {(list) => (
                <ul className="grid gap-3 md:grid-cols-2">
                  {list.map((g) => {
                    const gs = grievanceStatus(g.status);
                    const inst = instituteIndex.get(g.institute_id);
                    const sla = slaOf(g);
                    const st = SLA_STATE[sla.state];
                    const lvl = escalationLevel(sla.level);
                    return (
                      <li key={g.id}>
                        <Card as="article" className="flex h-full flex-col p-4 transition-shadow hover:shadow-float">
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="font-display text-base leading-snug">{g.subject}</h2>
                            <Badge toneName={gs.tone} glyph={gs.glyph}>
                              {gs.label}
                            </Badge>
                          </div>

                          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-ink/75">{g.description}</p>

                          {/* The clock */}
                          <div className="mt-3 rounded-md border border-paper-line px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className={`inline-flex items-center gap-1.5 font-semibold ${tone(st.tone).text}`}>
                                <StatusGlyph kind={st.glyph} />
                                {st.label}
                                <span className="snt-hi snt-hi-only font-normal opacity-80">· {st.hi}</span>
                              </span>
                              <span className="tnum text-ink-muted">
                                {sla.state === "closed"
                                  ? "Resolved"
                                  : sla.state === "breached"
                                    ? `${sla.daysOver || "<1"} day${sla.daysOver === 1 ? "" : "s"} over`
                                    : `${sla.daysLeft} day${sla.daysLeft === 1 ? "" : "s"} left · due ${formatDate(new Date(sla.due).toISOString())}`}
                              </span>
                            </div>
                            {sla.state !== "closed" && (
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]" role="img" aria-label={`${Math.round(sla.pct)}% of the window used`}>
                                <div className={`h-full rounded-full ${tone(st.tone).bg}`} style={{ width: `${sla.pct}%` }} />
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                              <span>
                                <span className="font-semibold text-ink/80">{lvl.short}</span> · {lvl.label}
                              </span>
                              {sla.firstResponseOverdue && <span className="font-medium text-signal-watch">No first response in 3 days</span>}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-paper-line pt-3 text-xs text-ink-muted">
                            <span className="min-w-0 truncate">
                              {inst ? (
                                <Link to={`/institutes/${inst.id}`} className="underline-offset-2 hover:text-ink hover:underline">
                                  {inst.name}
                                </Link>
                              ) : (
                                <span className="font-mono">institute {shortId(g.institute_id)}</span>
                              )}
                            </span>
                            <time dateTime={g.created_at} title={formatDateTime(g.created_at)}>
                              {relativeTime(g.created_at)}
                            </time>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setSelected(g)}>
                              Read &amp; respond
                            </Button>
                            {g.status !== "resolved" && (
                              <Button size="sm" variant="approve" loading={busyId === g.id} onClick={() => setStatus(g, "resolved")}>
                                Resolve
                              </Button>
                            )}
                            {sla.canEscalate && (
                              <Button size="sm" variant={sla.state === "breached" ? "danger" : "ghost"} disabled={busyId === g.id} onClick={() => setEscalating(g)}>
                                ↑ Escalate to L{sla.level + 1}
                              </Button>
                            )}
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </GroupedList>
          )}
        </>
      )}

      {/* Read & respond */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject || "Grievance"}
        footer={
          selected && (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
              {selected.status === "open" && (
                <Button variant="secondary" loading={busyId === selected.id} onClick={() => setStatus(selected, "in_review")}>
                  Move to in review
                </Button>
              )}
              {selected.status !== "resolved" && (
                <Button variant="approve" loading={busyId === selected.id} onClick={() => setStatus(selected, "resolved")}>
                  Mark resolved
                </Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge toneName={grievanceStatus(selected.status).tone} glyph={grievanceStatus(selected.status).glyph}>
                {grievanceStatus(selected.status).label}
              </Badge>
              <Badge toneName={SLA_STATE[slaOf(selected).state].tone} glyph={SLA_STATE[slaOf(selected).state].glyph}>
                SLA: {SLA_STATE[slaOf(selected).state].label}
              </Badge>
              <span className="text-xs text-ink-muted">Raised {formatDateTime(selected.created_at)}</span>
            </div>

            <p className="whitespace-pre-wrap text-sm leading-relaxed">{selected.description}</p>

            <dl className="grid grid-cols-2 gap-3 border-t border-paper-line pt-3 text-xs">
              <div>
                <dt className="text-2xs uppercase tracking-wider text-ink-muted">Institute</dt>
                <dd className="mt-0.5">{instituteIndex.get(selected.institute_id)?.name || shortId(selected.institute_id)}</dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wider text-ink-muted">Submitted by</dt>
                <dd className="mt-0.5 font-mono">{shortId(selected.submitted_by_id)}</dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wider text-ink-muted">Current level</dt>
                <dd className="mt-0.5">
                  {escalationLevel(slaOf(selected).level).short} · {escalationLevel(slaOf(selected).level).label}
                </dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wider text-ink-muted">Resolve by</dt>
                <dd className="mt-0.5">{formatDateTime(new Date(slaOf(selected).due).toISOString())}</dd>
              </div>
            </dl>

            <p className="rounded-md bg-ink/[0.03] px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
              Status changes are written straight to the grievance record, and the institute sees the new state in Setu.
              Every change is also written to the audit trail.
            </p>
          </div>
        )}
      </Modal>

      {/* Escalate — one, or every breached grievance at once */}
      <Modal
        open={escalateTargets.length > 0}
        onClose={() => setEscalating(null)}
        title={escalateTargets.length > 1 ? `Escalate ${escalateTargets.length} breached grievances` : "Escalate to the next level"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEscalating(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={Boolean(busyId)} onClick={() => escalate(escalateTargets)}>
              Escalate {escalateTargets.length > 1 ? `all ${escalateTargets.length}` : ""}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ul className="space-y-1.5">
            {escalateTargets.map((g) => {
              const s = slaOf(g);
              return (
                <li key={g.id} className="flex items-center justify-between gap-3 rounded-md border border-paper-line px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{g.subject}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {escalationLevel(s.level).short} → <strong className="text-ink">{escalationLevel(s.level + 1).short}</strong>
                  </span>
                </li>
              );
            })}
          </ul>
          {escalateTargets.length === 1 && (
            <p className="text-xs text-ink-muted">
              Goes to <strong className="text-ink">{escalationLevel(slaOf(escalateTargets[0]).level + 1).label}</strong> (
              <span className="snt-hi">{escalationLevel(slaOf(escalateTargets[0]).level + 1).hi}</span>) with a fresh{" "}
              {GRIEVANCE_SLA.resolveDays}-day window.
            </p>
          )}
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-ink-muted">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-sm"
            >
              {["No response within the window", "Needs sanction above district level", "Repeat complaint", "Safety or welfare risk to residents", "Other"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-ink-muted">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-sm"
              placeholder="Anything the next level should know"
            />
          </label>
        </div>
      </Modal>
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §24  PAGE: Renewals
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Registration renewals.
 *
 * Two things this adds over v1's flat list: the pending queue is separated from
 * the decided record (a decision list you have to scan for the actionable rows
 * is a worse queue), and rejecting now asks for confirmation — it's the one
 * irreversible-feeling action in the dashboard and a stray click shouldn't do it.
 */
function Renewals() {
  const { canDecideRenewals } = useAuth();
  const toast = useToast();
  const institutes = useApi(API.institutes.list(), { fallback: [] });

  const [busyId, setBusyId] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const rows = institutes.data || [];
  const counts = tally(rows, "renewal_status", ["pending", "approved", "rejected"]);

  // One toolbar filters both the queue and the record below it.
  const view = useDataView(rows, {
    fields: INSTITUTE_FIELDS,
    storageKey: "renewals",
    // Worst compliance first: that's the decision that needs the most thought.
    initial: { sort: [{ key: "compliance_score", dir: "asc" }] },
    presets: [
      { name: "Risky approvals", hint: "Pending, score below 70", state: { facets: { renewal_status: ["pending"] }, ranges: { compliance_score: { min: "", max: 69.99 } }, sort: [{ key: "compliance_score", dir: "asc" }] } },
      { name: "Easy approvals", hint: "Pending, compliant, score 85+", state: { facets: { renewal_status: ["pending"], status: ["green"] }, ranges: { compliance_score: { min: 85, max: "" } }, sort: [{ key: "compliance_score", dir: "desc" }] } },
      { name: "Rejected so far", hint: "The standing record", state: { facets: { renewal_status: ["rejected"] }, sort: [{ key: "name", dir: "asc" }] } },
    ],
  });
  const pending = view.result.filter((i) => i.renewal_status === "pending");
  const decided = view.result.filter((i) => i.renewal_status && i.renewal_status !== "pending");

  async function decide(institute, decision) {
    setBusyId(institute.id);
    setConfirming(null);
    try {
      await api.patch(API.institutes.renewal(institute.id), { decision });
      toast.success(`${institute.name} — renewal ${decision}`);
      institutes.reload();
    } catch (err) {
      toast.error(errorMessage(err, "That decision couldn't be recorded"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Renewals"
        lede="Registration renewal decisions. Each one is recorded against the institute and visible to its staff in Setu straight away."
      />

      {institutes.error && <ErrorState message={institutes.error} onRetry={institutes.reload} />}

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Awaiting decision"
          value={counts.pending}
          toneName={counts.pending ? "watch" : "good"}
          glyph={counts.pending ? "watch" : "check"}
          loading={institutes.loading}
        />
        <StatTile label="Approved" value={counts.approved} toneName="good" glyph="check" loading={institutes.loading} />
        <StatTile label="Rejected" value={counts.rejected} toneName="flag" glyph="flag" loading={institutes.loading} />
      </div>

      <div className="mt-4">
        <DataToolbar view={view} quick="renewal_status" searchPlaceholder="Search institute, district, type…" exportName="sentinel-renewals" allowGroup={false} />
      </div>

      {/* ------------------------------------------------- the queue ----- */}
      <Card>
        <CardHeader
          title="Awaiting your decision"
          subtitle="Lowest compliance score first — those are the ones worth reading the record on."
        />
        <div className="px-5 py-4">
          {institutes.loading ? (
            <SkeletonRows rows={2} height="h-14" />
          ) : pending.length === 0 ? (
            <EmptyState
              title={counts.pending ? "No pending renewals match these filters" : "Nothing pending"}
              body={counts.pending ? "Loosen a filter above to see the rest of the queue." : "Every renewal on file has been decided."}
            />
          ) : (
            <ul className="divide-y divide-paper-line">
              {pending.map((inst) => {
                const st = instituteStatus(inst.status);
                return (
                  <li key={inst.id} className="flex flex-wrap items-center justify-between gap-4 py-3.5 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/institutes/${inst.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {inst.name}
                        </Link>
                        <Badge toneName={st.tone} glyph={st.glyph}>
                          {st.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {instituteType(inst.type)}
                        {inst.district ? ` · ${inst.district}` : ""} · compliance{" "}
                        <span className="tnum font-mono">{formatScore(inst.compliance_score)}/100</span>
                      </p>
                      {toNumber(inst.compliance_score, 100) < 70 && (
                        <p className="mt-1 text-xs text-signal-flag">
                          Score is below 70 — worth reading the alert history before approving.
                        </p>
                      )}
                    </div>

                    {canDecideRenewals ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="approve"
                          loading={busyId === inst.id}
                          onClick={() => decide(inst, "approved")}
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConfirming(inst)}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <p className="shrink-0 text-xs text-ink-muted">Officials decide these</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------ the record ----- */}
      {decided.length > 0 && (
        <Card className="mt-4 overflow-hidden">
          <CardHeader title="Decided" subtitle="The standing record for every other institute." />
          <Table
            sort={view.state.sort}
            onSort={view.toggleSort}
            head={[
              { key: "name", label: "Institute", sortKey: "name" },
              { key: "district", label: "District", sortKey: "district" },
              { key: "score", label: "Compliance", align: "right", sortKey: "compliance_score" },
              { key: "renewal", label: "Renewal", sortKey: "renewal_status" },
            ]}
          >
            {decided.map((inst) => {
              const rn = renewalStatus(inst.renewal_status);
              return (
                <tr key={inst.id} className="group transition-colors hover:bg-ink/[0.02]">
                  <Td>
                    <Link to={`/institutes/${inst.id}`} className="font-medium underline-offset-2 group-hover:underline">
                      {inst.name}
                    </Link>
                  </Td>
                  <Td className="text-ink-muted">{inst.district || "—"}</Td>
                  <Td align="right" className="tnum font-mono text-xs">
                    {formatScore(inst.compliance_score)}
                  </Td>
                  <Td>
                    <StatusDot toneName={rn.tone} glyph={rn.glyph} label={rn.label} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      <Modal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title="Reject this renewal?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busyId === confirming?.id} onClick={() => decide(confirming, "rejected")}>
              Reject renewal
            </Button>
          </>
        }
      >
        {confirming && (
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              <strong className="font-medium">{confirming.name}</strong>'s registration renewal will be recorded as
              rejected, and its staff will see that in Setu.
            </p>
            <p className="text-ink-muted">
              Current compliance score is{" "}
              <span className="tnum font-mono">{formatScore(confirming.compliance_score)}/100</span>. You can change the
              decision later by approving it, but the institute sees the rejection in the meantime.
            </p>
          </div>
        )}
      </Modal>
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §26  PAGE: Districts — heatmap and ranking
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Every district on one screen. The heatmap is a table first — each cell has
 * its number — with one sequential hue on top: darker always means "needs more
 * attention", whichever direction the underlying number runs (a LOW score is
 * dark, a HIGH alert count is dark). Hover a cell for the detail.
 */
const HEAT_METRICS = [
  { key: "avgScore", label: "Avg compliance", hi: "औसत अनुपालन", worse: "low", fmt: (v) => formatScore(v) },
  { key: "flaggedPct", label: "Flagged", hi: "चिह्नित", worse: "high", fmt: (v) => `${Math.round(v)}%` },
  { key: "openAlerts", label: "Open alerts", hi: "खुली चेतावनी", worse: "high", fmt: (v) => v },
  { key: "critical", label: "Critical", hi: "गंभीर", worse: "high", fmt: (v) => v },
  { key: "darkPct", label: "Cameras dark", hi: "कैमरे बंद", worse: "high", fmt: (v) => `${Math.round(v)}%` },
  { key: "breachedGrievances", label: "SLA breached", hi: "शिकायत देरी", worse: "high", fmt: (v) => v, deciders: true },
  { key: "pendingRenewals", label: "Renewals due", hi: "नवीनीकरण", worse: "high", fmt: (v) => v },
];

// One hue (the chakra navy), light → dark. Separate steps for dark mode.
const HEAT_RAMP = {
  light: ["#eef2fb", "#d3dcf2", "#a9bbe6", "#7b95d4", "#4f6fbf", "#2b4ea3", "#123482"],
  dark: ["#172038", "#1d2c52", "#24396b", "#2e4b8a", "#3d62ad", "#5b82cf", "#8aa8ea"],
};

function heatStep(value, min, max, worse) {
  if (value === null || value === undefined || max === min) return 0;
  const t = (value - min) / (max - min);
  const bad = worse === "low" ? 1 - t : t;
  return Math.max(0, Math.min(6, Math.round(bad * 6)));
}

function Districts() {
  const { role } = useAuth();
  const [mode] = useThemeMode();
  const navigate = useNavigate();
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const alerts = useApi(API.alerts.list(), { fallback: [] });
  const cameras = useApi(API.cameras.list(), { fallback: [] });
  const grievances = useApi(API.grievances.list(), { fallback: [], optional: true, skip: !isDecider });

  const [rankBy, setRankBy] = useState("attention");
  const [hover, setHover] = useState(null);

  const metrics = HEAT_METRICS.filter((m) => !m.deciders || isDecider);
  const stats = useMemo(
    () =>
      districtStats({
        institutes: institutes.data || [],
        alerts: alerts.data || [],
        cameras: cameras.data || [],
        grievances: isDecider ? grievances.data || [] : [],
      }),
    [institutes.data, alerts.data, cameras.data, grievances.data, isDecider]
  );

  const ranked = useMemo(() => {
    const list = [...stats];
    if (rankBy === "attention") list.sort((a, b) => b.attention - a.attention);
    else if (rankBy === "best") list.sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
    else list.sort((a, b) => a.district.localeCompare(b.district));
    return list;
  }, [stats, rankBy]);

  const ranges = useMemo(() => {
    const r = {};
    metrics.forEach((m) => {
      const vals = stats.map((s) => s[m.key]).filter((v) => v !== null && v !== undefined);
      r[m.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    });
    return r;
  }, [stats, metrics]);

  const ramp = mode === "dark" ? HEAT_RAMP.dark : HEAT_RAMP.light;
  const loading = institutes.loading || alerts.loading;
  const best = [...stats].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0)).slice(0, 3);
  const worst = [...stats].sort((a, b) => b.attention - a.attention).slice(0, 3);

  function openInRegister(district) {
    writeStore("sessionStorage", "sentinel.view.register", { ...emptyViewState(), facets: { district: [district] }, sort: [{ key: "compliance_score", dir: "asc" }] });
    navigate("/institutes");
  }

  return (
    <Page width="max-w-7xl">
      <PageHeader
        title="Districts"
        lede="Every district side by side. Darker cells need more attention — whichever way the number runs. The ranking uses one attention index, and every part of it is a column you can see."
      >
        <SegmentedControl
          label="Rank by"
          value={rankBy}
          onChange={setRankBy}
          options={[
            { value: "attention", label: "Needs attention" },
            { value: "best", label: "Best compliance" },
            { value: "name", label: "A–Z" },
          ]}
        />
      </PageHeader>

      {(institutes.error || alerts.error) && <ErrorState message={institutes.error || alerts.error} onRetry={() => { institutes.reload(); alerts.reload(); }} />}

      {/* Leaderboard */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Top performing" subtitle="Highest average compliance." />
          <ol className="divide-y divide-paper-line px-5 py-2">
            {loading ? (
              <SkeletonRows rows={3} height="h-10" className="py-2" />
            ) : (
              best.map((d, i) => (
                <li key={d.district} className="flex items-center gap-3 py-2.5">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ background: ["#C9A227", "#8E9AAF", "#B0703C"][i] }}
                    aria-label={`Rank ${i + 1}`}
                  >
                    {i + 1}
                  </span>
                  <button type="button" onClick={() => openInRegister(d.district)} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline">
                    {d.district}
                  </button>
                  <span className="tnum text-sm">
                    {formatScore(d.avgScore)}
                    <span className="text-ink-muted">/100</span>
                  </span>
                </li>
              ))
            )}
          </ol>
        </Card>
        <Card>
          <CardHeader title="Needs attention" subtitle="Highest attention index." />
          <ol className="divide-y divide-paper-line px-5 py-2">
            {loading ? (
              <SkeletonRows rows={3} height="h-10" className="py-2" />
            ) : (
              worst.map((d, i) => (
                <li key={d.district} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-signal-flag-soft text-xs font-bold text-signal-flag">{i + 1}</span>
                  <button type="button" onClick={() => openInRegister(d.district)} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline">
                    {d.district}
                  </button>
                  <span className="text-xs text-ink-muted">
                    {d.flagged} flagged · {d.openAlerts} alerts
                  </span>
                  <span className="tnum w-12 text-right text-sm font-semibold">{d.attention}</span>
                </li>
              ))
            )}
          </ol>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader
          title="District heatmap"
          subtitle="Click a district to open its institutes in the register."
          action={
            <div className="flex items-center gap-2 text-[11px] text-ink-muted" aria-hidden="true">
              <span>Better</span>
              <span className="flex overflow-hidden rounded">
                {ramp.map((c) => (
                  <span key={c} className="h-3 w-4" style={{ background: c }} />
                ))}
              </span>
              <span>Needs attention</span>
            </div>
          }
        />
        <div className="overflow-x-auto p-3">
          {loading ? (
            <SkeletonRows rows={5} height="h-9" />
          ) : (
            <table className="w-full min-w-[46rem] border-separate text-sm" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                    #
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                    District
                  </th>
                  <th scope="col" className="px-2 py-2 text-right text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                    Institutes
                  </th>
                  {metrics.map((m) => (
                    <th key={m.key} scope="col" className="px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                      <Bi en={m.label} altClassName="text-[10px] font-medium normal-case tracking-normal" />
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 text-right text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                    Index
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((d, i) => (
                  <tr key={d.district}>
                    <td className="px-3 py-2 text-xs text-ink-muted tnum">{i + 1}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => openInRegister(d.district)} className="text-left font-medium hover:underline">
                        {d.district}
                      </button>
                      {d.state && <span className="block text-[10.5px] text-ink-muted">{d.state}</span>}
                    </td>
                    <td className="px-2 py-2 text-right tnum">{d.institutes}</td>
                    {metrics.map((m) => {
                      const step = heatStep(d[m.key], ranges[m.key].min, ranges[m.key].max, m.worse);
                      const isHover = hover && hover.d === d.district && hover.m === m.key;
                      return (
                        <td
                          key={m.key}
                          className="snt-heat-cell relative rounded px-2 py-2 text-center tnum text-[12.5px] font-medium"
                          style={{
                            background: ramp[step],
                            // Light mode darkens toward "needs attention", dark mode brightens —
                            // so the text flips to whichever keeps 4.5:1 contrast.
                            color: step >= 4 ? (mode === "dark" ? "#0c1220" : "#ffffff") : undefined,
                            outline: isHover ? "2px solid #FF9933" : undefined,
                          }}
                          onMouseEnter={() => setHover({ d: d.district, m: m.key })}
                          onMouseLeave={() => setHover(null)}
                          title={`${d.district} · ${m.label}: ${d[m.key] === null ? "—" : m.fmt(d[m.key])}`}
                        >
                          {d[m.key] === null || d[m.key] === undefined ? "—" : m.fmt(d[m.key])}
                          {isHover && (
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 w-48 -translate-x-1/2 rounded-md border border-paper-line bg-paper-raised px-2.5 py-2 text-left text-[11px] font-normal text-ink shadow-float">
                              <strong className="block text-xs">{d.district}</strong>
                              {m.label}: <strong>{m.fmt(d[m.key])}</strong>
                              <span className="block text-ink-muted">
                                Range across districts: {m.fmt(ranges[m.key].min)} – {m.fmt(ranges[m.key].max)}
                              </span>
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right font-semibold tnum">{d.attention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="border-t border-paper-line px-5 py-3 text-[11px] leading-relaxed text-ink-muted">
          Attention index (0–100, higher needs more attention) = 45% compliance gap + 20% share flagged + 15% open alerts per
          institute + 10% cameras dark + 10% breached grievances per institute. Colour is scaled within each column.
        </p>
      </Card>
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §27  PAGE: Reports — PDF and Excel
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A formal report, laid out like the department's own letterhead: pick the
 * scope and the sections, check the preview, then "Download PDF" (the
 * browser's print-to-PDF, with print styles that keep only the report sheet)
 * or "Download Excel" (a real multi-sheet .xlsx). Each download is written to
 * the audit trail.
 */
const REPORT_SECTIONS = [
  { key: "summary", label: "Summary", hi: "सारांश" },
  { key: "districts", label: "District table", hi: "ज़िले" },
  { key: "institutes", label: "Institutes", hi: "संस्थाएँ" },
  { key: "alerts", label: "Alerts in period", hi: "चेतावनियाँ" },
  { key: "grievances", label: "Grievances & SLA", hi: "शिकायतें", deciders: true },
  { key: "cameras", label: "Cameras not reporting", hi: "कैमरे" },
  { key: "renewals", label: "Pending renewals", hi: "नवीनीकरण" },
];
const REPORT_PERIODS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

function reportRef(scope) {
  const d = new Date();
  const code = scope === "all" ? (readPrefs().region === "ALL" ? "IN" : readPrefs().region.split(" ").map((w) => w[0]).join("").toUpperCase()) : scope.slice(0, 3).toUpperCase();
  const seq = String(d.getHours() * 60 + d.getMinutes()).padStart(4, "0");
  return `SNT/${code}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${seq}`;
}

function Reports() {
  const { user, role } = useAuth();
  const toast = useToast();
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;
  const institutes = useApi(API.institutes.list(), { fallback: [] });
  const alerts = useApi(API.alerts.list(), { fallback: [] });
  const cameras = useApi(API.cameras.list(), { fallback: [] });
  const grievances = useApi(API.grievances.list(), { fallback: [], optional: true, skip: !isDecider });

  const [scope, setScope] = useState("all");
  const [period, setPeriod] = useState("30");
  const [sections, setSections] = useState(() => REPORT_SECTIONS.filter((s) => !s.deciders || isDecider).map((s) => s.key));
  const generatedAt = useMemo(() => new Date(), [scope, period, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  const allInst = institutes.data || [];
  const districts = [...new Set(allInst.map((i) => i.district).filter(Boolean))].sort();
  const inScope = scope === "all" ? allInst : allInst.filter((i) => i.district === scope);
  const ids = new Set(inScope.map((i) => i.id));
  const idx = byId(allInst);
  const days = REPORT_PERIODS.find((p) => p.key === period)?.days;
  const since = days ? Date.now() - days * DAY_MS : 0;
  const inPeriod = (iso) => !days || (parseDate(iso)?.getTime() ?? 0) >= since;

  const al = (alerts.data || []).filter((a) => ids.has(a.institute_id) && inPeriod(a.created_at));
  const openAl = (alerts.data || []).filter((a) => ids.has(a.institute_id) && a.status === "open");
  const cams = (cameras.data || []).filter((c) => ids.has(c.institute_id));
  const darkCams = darkCameras(cams);
  const gr = (grievances.data || []).filter((g) => ids.has(g.institute_id) && inPeriod(g.created_at));
  const pending = worstFirst(inScope.filter((i) => i.renewal_status === "pending"));
  const dStats = districtStats({ institutes: inScope, alerts: alerts.data || [], cameras: cameras.data || [], grievances: grievances.data || [] }).sort((a, b) => b.attention - a.attention);
  const avg = mean(inScope, "compliance_score");
  const regionLabel = regionOf(readPrefs().region).value === "ALL" ? "All India" : regionOf(readPrefs().region).en;
  const scopeLabel = scope === "all" ? `${regionLabel} — all districts` : `${scope} district`;
  const periodLabel = REPORT_PERIODS.find((p) => p.key === period)?.label;
  const ref = reportRef(scope);
  const has = (k) => sections.includes(k);
  const loading = institutes.loading || alerts.loading;

  // "/reports?auto=excel" (Yukt uses this) downloads once the data is in.
  const [searchParams, setSearchParams] = useSearchParams();
  const auto = searchParams.get("auto");
  const autoDone = useRef(false);

  function logExport(format) {
    api
      .post(API.audit.record(), { action: "report.exported", entity_type: "report", entity_label: `Compliance report · ${scopeLabel} · ${periodLabel}`, detail: format })
      .catch(() => {});
  }

  const sheetRef = useRef(null);
  function downloadPdf() {
    if (!sheetRef.current) return;
    logExport("PDF");
    printReport(sheetRef.current, `Sentinel report ${ref.replace(/\//g, "-")}`);
  }

  function downloadExcel() {
    const sheets = [];
    if (has("summary"))
      sheets.push({
        name: "Summary",
        title: `Sentinel — ${scopeLabel} — ${periodLabel}`,
        columns: [{ label: "Measure", width: 34 }, { label: "Value", width: 18 }],
        rows: [
          ["Reference", ref],
          ["Generated", formatDateTime(generatedAt.toISOString())],
          ["Generated by", `${user?.name || "—"} (${ROLE_LABEL[role] || role})`],
          ["Institutes", inScope.length],
          ["Average compliance (/100)", avg === null ? "" : Math.round(avg * 10) / 10],
          ["Flagged (red)", inScope.filter((i) => i.status === "red").length],
          ["Watch (yellow)", inScope.filter((i) => i.status === "yellow").length],
          ["Compliant (green)", inScope.filter((i) => i.status === "green").length],
          ["Alerts raised in period", al.length],
          ["Open alerts now", openAl.length],
          ["Critical open alerts", openAl.filter((a) => a.severity === "red").length],
          ["Camera feeds not reporting", `${darkCams.length} of ${cams.length}`],
          ["Pending renewals", pending.length],
          ...(isDecider ? [["Grievances in period", gr.length], ["Grievances past SLA", gr.filter((g) => grievanceSla(g).state === "breached").length]] : []),
        ],
      });
    if (has("districts"))
      sheets.push({
        name: "Districts",
        columns: ["District", "State", "Institutes", "Avg compliance", "Flagged", "Open alerts", "Critical", "Cameras dark", "SLA breached", "Renewals due", "Attention index"].map((label) => ({ label })),
        rows: dStats.map((d) => [d.district, d.state, d.institutes, d.avgScore === null ? "" : Math.round(d.avgScore * 10) / 10, d.flagged, d.openAlerts, d.critical, d.darkCameras, d.breachedGrievances, d.pendingRenewals, d.attention]),
      });
    if (has("institutes"))
      sheets.push({
        name: "Institutes",
        columns: ["Institute", "Type", "District", "Compliance", "Status", "Renewal"].map((label) => ({ label })),
        rows: worstFirst(inScope).map((i) => [i.name, instituteType(i.type), i.district, toNumber(i.compliance_score, null), instituteStatus(i.status).label, renewalStatus(i.renewal_status).label]),
      });
    if (has("alerts"))
      sheets.push({
        name: "Alerts",
        columns: [{ label: "Raised" }, { label: "Type" }, { label: "Severity" }, { label: "Status" }, { label: "Institute" }, { label: "District" }, { label: "Detail", width: 70, wrap: true }],
        rows: alertsByUrgency(al).map((a) => [formatDateTime(a.created_at), alertTypeLabel(a.type), severity(a.severity).label, alertStatus(a.status).label, idx.get(a.institute_id)?.name || "", idx.get(a.institute_id)?.district || "", a.detail || ""]),
      });
    if (has("grievances") && isDecider)
      sheets.push({
        name: "Grievances",
        columns: [{ label: "Raised" }, { label: "Subject", width: 40 }, { label: "Status" }, { label: "SLA" }, { label: "Level" }, { label: "Resolve by" }, { label: "Institute" }, { label: "District" }],
        rows: gr.map((g) => {
          const s = grievanceSla(g);
          return [formatDateTime(g.created_at), g.subject, grievanceStatus(g.status).label, SLA_STATE[s.state].label, escalationLevel(s.level).short, formatDate(new Date(s.due).toISOString()), idx.get(g.institute_id)?.name || "", idx.get(g.institute_id)?.district || ""];
        }),
      });
    if (has("cameras"))
      sheets.push({
        name: "Cameras",
        columns: ["Camera", "Status", "Last ping", "Institute", "District"].map((label) => ({ label })),
        rows: darkCams.map((c) => [c.name, cameraStatus(c.status).label, c.last_ping_at ? formatDateTime(c.last_ping_at) : "never", idx.get(c.institute_id)?.name || "", idx.get(c.institute_id)?.district || ""]),
      });
    if (has("renewals"))
      sheets.push({
        name: "Renewals",
        columns: ["Institute", "District", "Compliance", "Status"].map((label) => ({ label })),
        rows: pending.map((i) => [i.name, i.district, toNumber(i.compliance_score, null), instituteStatus(i.status).label]),
      });
    if (!sheets.length) {
      toast.error("Pick at least one section");
      return;
    }
    downloadXlsx(`sentinel-report-${scope === "all" ? "UP" : scope}-${new Date().toISOString().slice(0, 10)}`, sheets);
    logExport("Excel");
    toast.success("Excel report downloaded");
  }

  useEffect(() => {
    if (!auto || loading || autoDone.current || grievances.loading) return;
    autoDone.current = true;
    setSearchParams({}, { replace: true });
    setTimeout(() => (auto === "excel" ? downloadExcel() : downloadPdf()), 300);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const Th = ({ children, right }) => <th className={`border-b-2 border-[#FF9933] px-2 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#0B2A6F] ${right ? "text-right" : ""}`}>{children}</th>;
  const Td2 = ({ children, right }) => <td className={`border-b border-[#e3e6ee] px-2 py-1.5 align-top text-[12px] ${right ? "text-right tnum" : ""}`}>{children}</td>;
  const SectionTitle = ({ n, children }) => (
    <h3 className="mb-2 mt-6 flex items-baseline gap-2 border-l-4 border-[#FF9933] pl-2 text-[14px] font-bold text-[#0B2A6F]">
      <span className="tnum">{n}.</span> {children}
    </h3>
  );
  let n = 0;

  return (
    <Page width="max-w-6xl">
      <PageHeader title="Reports" lede="Build a formal report for a district or the whole state, check the preview, and download it as a PDF or an Excel workbook. Every download is recorded in the audit trail.">
        <Button variant="secondary" onClick={downloadExcel} disabled={loading}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
            <path d="M5.5 6l5 5M10.5 6l-5 5" strokeLinecap="round" />
          </svg>
          Download Excel
        </Button>
        <Button variant="primary" onClick={downloadPdf} disabled={loading}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M4 1.8h5.5L12.5 5v9.2H4z" strokeLinejoin="round" />
            <path d="M9.5 1.8V5h3M6 9.5h4.5M6 12h3" strokeLinecap="round" />
          </svg>
          Download PDF
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Controls */}
        <Card className="h-fit p-4">
          <label className="block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-ink-muted"><Bi en="Scope" inline altClassName="normal-case tracking-normal" /></span>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="w-full rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-sm">
              <option value="all">All districts (state)</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-ink-muted"><Bi en="Period" inline altClassName="normal-case tracking-normal" /></span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-sm">
              {REPORT_PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="mt-4">
            <legend className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted"><Bi en="Sections" inline altClassName="normal-case tracking-normal" /></legend>
            <ul className="space-y-1">
              {REPORT_SECTIONS.filter((s) => !s.deciders || isDecider).map((s) => (
                <li key={s.key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-ink/[0.03]">
                    <input
                      type="checkbox"
                      checked={has(s.key)}
                      onChange={() => setSections((cur) => (cur.includes(s.key) ? cur.filter((k) => k !== s.key) : [...cur, s.key]))}
                    />
                    <span>{s.label}</span>
                    <span className="snt-hi snt-hi-only ml-auto text-[11px] text-ink-muted">{s.hi}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
            PDF: your browser's print dialog opens — choose <strong>Save as PDF</strong>. Only the report sheet is printed,
            on as many A4 pages as it needs.
          </p>
        </Card>

        {/* The sheet itself — this is exactly what prints. */}
        <div className="overflow-x-auto rounded-lg border border-paper-line bg-[#d9dce4] p-3 sm:p-6">
          {loading ? (
            <SkeletonRows rows={6} />
          ) : (
            <article ref={sheetRef} className="snt-report mx-auto min-w-[40rem] max-w-[52rem] bg-white px-10 py-9 text-[#111827] shadow-float">
              <div className="snt-tricolour mb-5" />
              <header className="flex items-start gap-4 border-b-2 border-[#0B2A6F] pb-4">
                <AshokaChakra size={54} />
                <div className="min-w-0 flex-1">
                  <p className="snt-hi text-[13px] font-semibold text-[#0B2A6F]">सामाजिक न्याय और अधिकारिता विभाग</p>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0B2A6F]">Department of Social Justice &amp; Empowerment</p>
                  <p className="text-[11.5px] text-[#4b5563]">Department of Social Justice &amp; Empowerment — Sentinel</p>
                </div>
                <div className="text-right text-[10.5px] leading-relaxed text-[#4b5563]">
                  <p>
                    <strong className="text-[#111827]">Ref:</strong> {ref}
                  </p>
                  <p>
                    <strong className="text-[#111827]">Date:</strong> {IST_DATE_HI.format(generatedAt)} · {IST_TIME.format(generatedAt).toUpperCase()} IST
                  </p>
                </div>
              </header>

              <h2 className="mt-5 text-center text-[19px] font-bold text-[#0B2A6F]">Welfare Institute Compliance Report</h2>
              <p className="snt-hi text-center text-[13px] text-[#374151]">कल्याण संस्था अनुपालन रिपोर्ट</p>
              <p className="mt-1 text-center text-[12px] text-[#4b5563]">
                {scopeLabel} · {periodLabel} · prepared by {user?.name || "—"} ({ROLE_LABEL[role] || role})
              </p>

              {has("summary") && (
                <section className="snt-report-section">
                  <SectionTitle n={++n}>Summary · सारांश</SectionTitle>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      ["Institutes", inScope.length],
                      ["Avg compliance", `${formatScore(avg)}/100`],
                      ["Open alerts", `${openAl.length} (${openAl.filter((a) => a.severity === "red").length} critical)`],
                      ["Cameras dark", `${darkCams.length} / ${cams.length}`],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded border border-[#e3e6ee] px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-[#6b7280]">{k}</p>
                        <p className="mt-0.5 text-[15px] font-bold">{v}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed">
                    Of {inScope.length} institutes, {inScope.filter((i) => i.status === "red").length} are flagged, {inScope.filter((i) => i.status === "yellow").length} are on watch and{" "}
                    {inScope.filter((i) => i.status === "green").length} are compliant. {al.length} alerts were raised in the period; {pending.length} registration renewals await a decision
                    {isDecider ? `, and ${gr.filter((g) => grievanceSla(g).state === "breached").length} grievances are past their response window` : ""}.
                  </p>
                </section>
              )}

              {has("districts") && dStats.length > 0 && (
                <section className="snt-report-section">
                  <SectionTitle n={++n}>Districts · ज़िले (by attention index)</SectionTitle>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <Th>District</Th>
                        <Th right>Inst.</Th>
                        <Th right>Avg score</Th>
                        <Th right>Flagged</Th>
                        <Th right>Open alerts</Th>
                        <Th right>Cams dark</Th>
                        <Th right>Index</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {dStats.map((d) => (
                        <tr key={d.district}>
                          <Td2>{d.district}</Td2>
                          <Td2 right>{d.institutes}</Td2>
                          <Td2 right>{formatScore(d.avgScore)}</Td2>
                          <Td2 right>{d.flagged}</Td2>
                          <Td2 right>{d.openAlerts}</Td2>
                          <Td2 right>{d.darkCameras}</Td2>
                          <Td2 right>{d.attention}</Td2>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {has("institutes") && (
                <section>
                  <SectionTitle n={++n}>Institutes · संस्थाएँ (lowest score first)</SectionTitle>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <Th>Institute</Th>
                        <Th>Type</Th>
                        <Th>District</Th>
                        <Th right>Score</Th>
                        <Th>Status</Th>
                        <Th>Renewal</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {worstFirst(inScope).map((i) => (
                        <tr key={i.id}>
                          <Td2>{i.name}</Td2>
                          <Td2>{instituteType(i.type)}</Td2>
                          <Td2>{i.district}</Td2>
                          <Td2 right>{formatScore(i.compliance_score)}</Td2>
                          <Td2>{instituteStatus(i.status).label}</Td2>
                          <Td2>{renewalStatus(i.renewal_status).label}</Td2>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {has("alerts") && (
                <section>
                  <SectionTitle n={++n}>Alerts raised in the period · चेतावनियाँ ({al.length})</SectionTitle>
                  {al.length === 0 ? (
                    <p className="text-[12px] text-[#6b7280]">No alerts were raised in this period.</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Raised</Th>
                          <Th>Type</Th>
                          <Th>Severity</Th>
                          <Th>Status</Th>
                          <Th>Institute</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertsByUrgency(al).map((a) => (
                          <tr key={a.id}>
                            <Td2>{formatDate(a.created_at)}</Td2>
                            <Td2>{alertTypeLabel(a.type)}</Td2>
                            <Td2>{severity(a.severity).label}</Td2>
                            <Td2>{alertStatus(a.status).label}</Td2>
                            <Td2>{idx.get(a.institute_id)?.name || "—"}</Td2>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {has("grievances") && isDecider && (
                <section>
                  <SectionTitle n={++n}>Grievances and response windows · शिकायतें ({gr.length})</SectionTitle>
                  {gr.length === 0 ? (
                    <p className="text-[12px] text-[#6b7280]">No grievances in this period.</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Raised</Th>
                          <Th>Subject</Th>
                          <Th>Status</Th>
                          <Th>SLA</Th>
                          <Th>Level</Th>
                          <Th>Institute</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {gr.map((g) => {
                          const s = grievanceSla(g);
                          return (
                            <tr key={g.id}>
                              <Td2>{formatDate(g.created_at)}</Td2>
                              <Td2>{g.subject}</Td2>
                              <Td2>{grievanceStatus(g.status).label}</Td2>
                              <Td2>{SLA_STATE[s.state].label}</Td2>
                              <Td2>{escalationLevel(s.level).short}</Td2>
                              <Td2>{idx.get(g.institute_id)?.name || "—"}</Td2>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {has("cameras") && (
                <section>
                  <SectionTitle n={++n}>Camera feeds not reporting · कैमरे ({darkCams.length})</SectionTitle>
                  {darkCams.length === 0 ? (
                    <p className="text-[12px] text-[#6b7280]">Every feed in scope is reporting.</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Camera</Th>
                          <Th>Status</Th>
                          <Th>Last ping</Th>
                          <Th>Institute</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {darkCams.map((c) => (
                          <tr key={c.id}>
                            <Td2>{c.name}</Td2>
                            <Td2>{cameraStatus(c.status).label}</Td2>
                            <Td2>{c.last_ping_at ? formatDateTime(c.last_ping_at) : "never"}</Td2>
                            <Td2>{idx.get(c.institute_id)?.name || "—"}</Td2>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {has("renewals") && (
                <section>
                  <SectionTitle n={++n}>Registration renewals awaiting a decision · नवीनीकरण ({pending.length})</SectionTitle>
                  {pending.length === 0 ? (
                    <p className="text-[12px] text-[#6b7280]">None pending.</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Institute</Th>
                          <Th>District</Th>
                          <Th right>Score</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {pending.map((i) => (
                          <tr key={i.id}>
                            <Td2>{i.name}</Td2>
                            <Td2>{i.district}</Td2>
                            <Td2 right>{formatScore(i.compliance_score)}</Td2>
                            <Td2>{instituteStatus(i.status).label}</Td2>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              <footer className="snt-avoid-break mt-8 flex items-end justify-between gap-6 border-t border-[#e3e6ee] pt-4 text-[10.5px] text-[#6b7280]">
                <p className="max-w-md leading-relaxed">
                  Generated by Sentinel from live monitoring data. Figures reflect the state of records at the time shown
                  above. This is a system-generated report.
                </p>
                <div className="text-center">
                  <div className="mb-1 h-10 w-44 border-b border-[#9ca3af]" />
                  <p>Signature of reviewing officer</p>
                </div>
              </footer>
            </article>
          )}
        </div>
      </div>
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §28  PAGE: Audit trail
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Who did what, when — every review, escalation, renewal decision, draw and
 * export. Each row carries a SHA-256 hash of itself chained to the row before,
 * and the page re-computes the whole chain in the browser: if anyone edits or
 * deletes a row in the database, the badge turns red and names the row.
 */
const AUDIT_ACTIONS = {
  "auth.login": { label: "Signed in", tone: "neutral" },
  "alert.reviewed": { label: "Alert reviewed", tone: "good" },
  "alert.escalated": { label: "Alert escalated", tone: "flag" },
  "renewal.approved": { label: "Renewal approved", tone: "good" },
  "renewal.rejected": { label: "Renewal rejected", tone: "flag" },
  "grievance.status": { label: "Grievance status changed", tone: "watch" },
  "grievance.escalated": { label: "Grievance escalated", tone: "flag" },
  "assignment.drawn": { label: "Inspection drawn", tone: "neutral" },
  "report.exported": { label: "Report exported", tone: "neutral" },
  "assistant.action": { label: "Action via Yukt", tone: "watch" },
  "inspector.message": { label: "Message to inspector", tone: "neutral" },
};
const auditAction = (a) => AUDIT_ACTIONS[a] || { label: humanise(String(a).replace(/\./g, " ")), tone: "neutral" };

function AuditTrail() {
  const log = useApi(API.audit.list(), { fallback: [], optional: true });
  const [verify, setVerify] = useState({ ok: null, checked: 0, brokenAt: null, running: false });
  const [selected, setSelected] = useState(null);
  const rows = log.data || [];

  useEffect(() => {
    let alive = true;
    if (!rows.length) return undefined;
    setVerify((v) => ({ ...v, running: true }));
    verifyAuditChain(rows).then((r) => alive && setVerify({ ...r, running: false }));
    return () => {
      alive = false;
    };
  }, [rows]);

  const fields = useMemo(
    () => [
      { key: "at", label: "When", type: "date" },
      { key: "actor_name", label: "Who", type: "enum" },
      { key: "actor_role", label: "Role", type: "enum", display: (v) => ROLE_LABEL[v] || humanise(v) },
      { key: "action", label: "Action", type: "enum", display: (v) => auditAction(v).label },
      { key: "entity_type", label: "Record type", type: "enum", display: (v) => humanise(v) },
      { key: "entity_label", label: "Record", type: "text" },
      { key: "detail", label: "Detail", type: "text", sortable: false },
    ],
    []
  );
  const view = useDataView(rows, {
    fields,
    storageKey: "audit",
    initial: { sort: [{ key: "at", dir: "desc" }] },
    presets: [
      { name: "Today", hint: "Everything in the last 24 hours", state: { dates: { at: { preset: "24h" } }, sort: [{ key: "at", dir: "desc" }] } },
      { name: "Escalations", hint: "Alerts and grievances sent up", state: { facets: { action: ["alert.escalated", "grievance.escalated"] }, sort: [{ key: "at", dir: "desc" }] } },
      { name: "Renewal decisions", hint: "Approvals and rejections", state: { facets: { action: ["renewal.approved", "renewal.rejected"] }, sort: [{ key: "at", dir: "desc" }] } },
      { name: "By person", hint: "Grouped by who acted", state: { groupBy: "actor_name", sort: [{ key: "at", dir: "desc" }] } },
    ],
  });
  const paged = usePaged(view.result, 25);

  return (
    <Page width="max-w-7xl">
      <PageHeader
        title="Audit trail"
        lede="Every action taken in Sentinel, with who took it and when. Rows are hash-chained — the check below re-computes the chain in your browser, so an edited or deleted row can't go unnoticed."
      >
        <Button variant="secondary" size="sm" onClick={log.reload} loading={log.loading}>
          Refresh
        </Button>
      </PageHeader>

      {log.error && <ErrorState message={log.error} onRetry={log.reload} />}

      {log.unavailable ? (
        <NotWiredState what="The audit log" path="GET /api/v1/audit-log" />
      ) : (
        <>
          <div
            className={`mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
              verify.ok === false ? "border-signal-flag/30 bg-signal-flag-soft" : verify.ok ? "border-signal-good bg-signal-good-soft/40" : "border-paper-line bg-paper-raised"
            }`}
            role="status"
          >
            <span className={verify.ok === false ? "text-signal-flag" : verify.ok ? "text-signal-good" : "text-ink-muted"}>
              <StatusGlyph kind={verify.ok === false ? "flag" : verify.ok ? "check" : "dot"} />
            </span>
            <span className="font-medium">
              {verify.running
                ? "Verifying the hash chain…"
                : verify.ok === true
                  ? `Chain intact — all ${verify.checked} entries verified (SHA-256)`
                  : verify.ok === false
                    ? `Chain broken at entry ${verify.brokenAt} — a row was changed or removed after it was written`
                    : "The server hasn't sent hashes yet, so the chain can't be verified"}
            </span>
          </div>

          <DataToolbar view={view} quick="action" searchPlaceholder="Search person, record, detail…" exportName="sentinel-audit" />

          {log.loading ? (
            <SkeletonRows rows={6} height="h-12" />
          ) : view.result.length === 0 ? (
            <EmptyState title={rows.length ? "No entries match these filters" : "Nothing recorded yet"} body="Actions appear here as officials take them." />
          ) : (
            <Card>
              <Table
                head={[
                  { label: "When", width: "11rem" },
                  { label: "Who" },
                  { label: "Action" },
                  { label: "Record" },
                  { label: "Detail" },
                  { label: "Hash", width: "7rem" },
                ]}
              >
                {paged.slice.map((e) => {
                  const act = auditAction(e.action);
                  return (
                    <tr key={e.id} className="cursor-pointer hover:bg-ink/[0.02]" onClick={() => setSelected(e)}>
                      <Td className="whitespace-nowrap text-xs">
                        <span className="block">{formatDateTime(e.at)}</span>
                        <span className="text-ink-muted">{relativeTime(e.at)}</span>
                      </Td>
                      <Td>
                        <span className="block text-sm">{e.actor_name}</span>
                        <span className="text-[11px] text-ink-muted">{ROLE_LABEL[e.actor_role] || e.actor_role}</span>
                      </Td>
                      <Td>
                        <Badge toneName={act.tone}>{act.label}</Badge>
                      </Td>
                      <Td className="max-w-[16rem] truncate text-sm">{e.entity_label || (e.entity_id ? `${humanise(e.entity_type)} ${shortId(e.entity_id)}` : "—")}</Td>
                      <Td className="max-w-[18rem] truncate text-xs text-ink-muted">{e.detail || "—"}</Td>
                      <Td className={`font-mono text-[10.5px] ${verify.brokenAt === e.id ? "text-signal-flag" : "text-ink-muted"}`}>{e.hash ? `${e.hash.slice(0, 10)}…` : "—"}</Td>
                    </tr>
                  );
                })}
              </Table>
              <Paginator paged={paged} />
            </Card>
          )}
        </>
      )}

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? auditAction(selected.action).label : "Entry"}>
        {selected && (
          <div className="space-y-3 text-sm">
            <KeyValue
              items={[
                { label: "When", value: formatDateTime(selected.at) },
                { label: "Who", value: `${selected.actor_name} · ${ROLE_LABEL[selected.actor_role] || selected.actor_role}` },
                { label: "Record type", value: humanise(selected.entity_type) },
                { label: "Record", value: selected.entity_label || selected.entity_id || "—" },
                { label: "Detail", value: selected.detail || "—" },
                { label: "Entry id", value: selected.id, mono: true },
              ]}
            />
            {(selected.before || selected.after) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <pre className="overflow-x-auto rounded bg-ink/[0.04] p-2 font-mono">before {JSON.stringify(selected.before, null, 1)}</pre>
                <pre className="overflow-x-auto rounded bg-ink/[0.04] p-2 font-mono">after {JSON.stringify(selected.after, null, 1)}</pre>
              </div>
            )}
            <div className="space-y-1 border-t border-paper-line pt-3 font-mono text-[10.5px] text-ink-muted">
              <p className="break-all">prev {selected.prev_hash || "— (first entry)"}</p>
              <p className="break-all">hash {selected.hash || "—"}</p>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §29  PAGE: Accessibility · screen reader access
   ══════════════════════════════════════════════════════════════════════════ */

const SCREEN_READERS = [
  { name: "NVDA (NonVisual Desktop Access)", platform: "Windows", cost: "Free, open source", url: "https://www.nvaccess.org" },
  { name: "Narrator", platform: "Windows", cost: "Built in", url: null },
  { name: "JAWS", platform: "Windows", cost: "Commercial", url: "https://www.freedomscientific.com" },
  { name: "VoiceOver", platform: "macOS, iOS", cost: "Built in", url: null },
  { name: "TalkBack", platform: "Android", cost: "Built in", url: null },
  { name: "Orca", platform: "Linux", cost: "Free, open source", url: null },
];

function Accessibility() {
  const { role } = useAuth();
  const isDecider = role === ROLES.ADMIN || role === ROLES.OFFICIAL;
  const [mode, setMode] = useThemeMode();
  return (
    <Page width="max-w-4xl">
      <PageHeader
        live={false}
        title="Accessibility"
        lede="Sentinel is built to follow the Guidelines for Indian Government Websites and Apps (GIGW 3.0) and WCAG 2.1 level AA, so every official can use it — with a screen reader, a keyboard alone, large text or high contrast."
      />

      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="font-display text-lg"><Bi en="Display" inline altClassName="text-base text-ink-muted" /></h2>
          <p className="mt-1 text-sm text-ink-muted">These are also in the strip at the very top of every page.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">Colour mode</p>
              <SegmentedControl label="Colour mode" value={mode} onChange={setMode} options={THEME_MODES.map((m) => ({ value: m.key, label: m.label }))} />
            </div>
            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted">Text size</p>
              <p className="text-sm">
                Use <Kbd>A−</Kbd> <Kbd>A</Kbd> <Kbd>A+</Kbd> at the top right. The whole dashboard scales, not just the text.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg"><Bi en="Keyboard shortcuts" inline altClassName="text-base text-ink-muted" /></h2>
          <p className="mt-1 text-sm text-ink-muted">
            Press <Kbd>?</Kbd> on any page to see these. Shortcuts are ignored while you're typing in a field.
          </p>
          <div className="mt-4">
            <ShortcutList isDecider={isDecider} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg"><Bi en="Screen reader access" inline altClassName="text-base text-ink-muted" /></h2>
          <p className="mt-1 text-sm text-ink-muted">
            Every status is written as a word, not only shown as a colour; every chart has a table view; dialogs trap focus
            and close with Esc; and the page structure is marked up for assistive technology. Sentinel works with:
          </p>
          <Table head={[{ label: "Screen reader" }, { label: "Platform" }, { label: "Availability" }]} className="mt-3">
            {SCREEN_READERS.map((s) => (
              <tr key={s.name}>
                <Td>{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.name}</a> : s.name}</Td>
                <Td>{s.platform}</Td>
                <Td className="text-ink-muted">{s.cost}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg"><Bi en="What we've done" inline altClassName="text-base text-ink-muted" /></h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {[
              "Status never carried by colour alone — always a glyph and a word",
              "High-contrast mode: black, white and yellow, no transparency, no motion",
              "Respects the operating system's 'reduce motion' setting",
              "Full keyboard operation, with a visible focus ring",
              "Text resizes up to 112.5% without breaking the layout",
              "Bilingual labels — English with Hindi throughout",
              "Yukt accepts voice, and can reply in 22 Indian languages when Bhashini is connected",
              "Every chart has an equivalent table view",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-0.5 text-signal-good">
                  <StatusGlyph kind="check" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg"><Bi en="Found a barrier?" inline altClassName="text-base text-ink-muted" /></h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            If any part of Sentinel is hard to use with your assistive technology, please report it to the department's Web
            Information Manager with the page address and what happened. Accessibility issues are treated as defects and
            fixed in the next release.
          </p>
        </Card>
      </div>
    </Page>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §31  PAGE: Security — password, 2-step verification, signed-in devices
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The official's own account security (security contract §2.7), opened from
 * the account menu. Four cards: recent sign-in activity, 2-step verification
 * (setup → code → recovery codes, and turning it off), change password (live
 * checklist + strength meter), and the devices signed in right now.
 *
 * In demo mode every control works against the mock (§6). Against a backend
 * that hasn't built a route yet, that card says it's available once connected
 * to the server instead of showing an error.
 */
function SecurityPage() {
  const { user } = useAuth();
  const session = useSession();
  const demo = useDemoFallback();
  const me = useApi(API.auth.me(), { optional: true });
  const sessions = useApi(API.auth.sessions(), { fallback: [], optional: true });
  // A new password signs the other devices out, so both lists change.
  const afterPasswordChange = () => {
    me.reload();
    sessions.reload();
  };

  return (
    <Page width="max-w-5xl">
      <PageHeader title="Security" lede={<Bi en="Your password, 2-step verification, and every device signed in to your account." altClassName="mt-0.5" />} />

      {demo && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-signal-watch/30 bg-signal-watch-soft px-4 py-3 text-xs leading-relaxed">
          <span className="mt-0.5 text-signal-watch">
            <StatusGlyph kind="watch" />
          </span>
          <Bi en="Mock mode: these controls work on sample data in this browser. Nothing is sent to a server." altClassName="mt-0.5 text-ink-muted" />
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <TwoStepCard enabled={Boolean(me.data?.mfa_enabled)} unavailable={me.unavailable} loading={me.loading} onChanged={me.reload} />
          <SignInActivityCard me={me.data} unavailable={me.unavailable} loading={me.loading} session={session} />
        </div>
        <ChangePasswordCard user={user} onChanged={afterPasswordChange} />
        <SessionsCard sessions={sessions} className="lg:col-span-2" />
      </div>
    </Page>
  );
}

/** Shown in a card whose route the connected backend doesn't offer yet. */
function ServerOnlyNote() {
  return (
    <div className="rounded-lg border border-dashed border-paper-line bg-paper-dim/40 px-4 py-5 text-center text-xs text-ink-muted">
      <Bi en="Available when connected to the server" altClassName="mt-0.5" />
    </div>
  );
}

/** A toast line in both languages. */
const biToast = (en, vars) => <Bi en={en} vars={vars} altClassName="mt-0.5 text-xs text-ink-muted" />;

/** Copies text and says so. */
function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text, what = "Copied") => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(biToast(what));
      } catch {
        toast.error(biToast("Couldn't copy — select the text and copy it yourself"));
      }
    },
    [toast]
  );
}

/* --------------------------------------------------------- activity --- */
/** "3 days ago" under a date — unless, past a month, it would just repeat the date. */
const ageNote = (value) => {
  const rel = relativeTime(value);
  return rel === formatDate(value) ? null : rel;
};

function SignInActivityCard({ me, unavailable, loading, session }) {
  const { t } = useT();
  const last = me ? (me.last_login_at ? { at: me.last_login_at, ip: me.last_login_ip } : null) : session?.lastLogin;
  const items = [
    {
      label: <Bi en="Previous sign-in" inline altClassName="normal-case tracking-normal" />,
      value: last ? formatDateTime(last.at) : "—",
      sub: last ? ageNote(last.at) : t("First sign-in on this account"),
    },
    { label: <Bi en="From IP address" inline altClassName="normal-case tracking-normal" />, value: last?.ip || "—", mono: true },
    {
      label: <Bi en="Password last changed" inline altClassName="normal-case tracking-normal" />,
      value: me?.password_changed_at ? formatDate(me.password_changed_at) : "—",
      sub: me?.password_changed_at ? ageNote(me.password_changed_at) : null,
    },
    {
      label: <Bi en="This session ends by" inline altClassName="normal-case tracking-normal" />,
      value: me?.session_expires_at ? formatDateTime(me.session_expires_at) : "—",
      sub: t("Or after 15 minutes without activity"),
    },
  ];
  return (
    <Card>
      <CardHeader title="Sign-in activity" subtitle={<Bi en="If a sign-in here isn't yours, change your password and sign out the other devices." />} />
      <div className="px-5 py-4">
        {loading && !me ? (
          <SkeletonRows rows={1} height="h-12" />
        ) : (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {items.map((it, i) => (
              <div key={i} className="min-w-0">
                <dt className="text-2xs uppercase tracking-wider text-ink-muted">{it.label}</dt>
                <dd className={`mt-1 truncate text-sm font-medium ${it.mono ? "font-mono text-[13px]" : ""}`}>{it.value}</dd>
                {it.sub && <dd className="mt-0.5 truncate text-[11px] text-ink-muted">{it.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
        {unavailable && <p className="mt-3 text-[11px] text-ink-muted">{t("Password and session dates appear when connected to the server.")}</p>}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------- 2-step ------ */
function TwoStepCard({ enabled, unavailable, loading, onChanged }) {
  const [flow, setFlow] = useState(null); // "enable" | "disable" | null
  return (
    <Card>
      <CardHeader
        title="2-step verification"
        subtitle={<Bi en="A 6-digit code from an authenticator app, asked for after your password." />}
        action={
          !unavailable &&
          !loading && (
            <Badge toneName={enabled ? "good" : "watch"} glyph={enabled ? "check" : "watch"}>
              <Bi en={enabled ? "On" : "Off"} inline />
            </Badge>
          )
        }
      />
      <div className="px-5 py-4">
        {unavailable ? (
          <ServerOnlyNote />
        ) : loading ? (
          <SkeletonRows rows={2} height="h-8" />
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink/80">
              <Bi
                en={
                  enabled
                    ? "Signing in needs your password and a code from your phone, so a stolen password alone can't open your account."
                    : "Add a second step so a stolen password alone can't open your account. Works with Google Authenticator, Microsoft Authenticator, Authy and similar apps."
                }
                altClassName="mt-1 text-xs text-ink-muted"
              />
            </p>
            <div className="mt-4">
              {enabled ? (
                <Button variant="secondary" onClick={() => setFlow("disable")}>
                  <Bi en="Turn off" inline altClassName="text-xs opacity-80" />
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setFlow("enable")}>
                  <Bi en="Turn on 2-step verification" inline altClassName="text-xs opacity-80" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      {flow === "enable" && <EnableTwoStep onClose={() => setFlow(null)} onEnabled={onChanged} />}
      {flow === "disable" && <DisableTwoStep onClose={() => setFlow(null)} onDisabled={onChanged} />}
    </Card>
  );
}

const TWO_STEP_STAGES = ["Confirm password", "Add to your app", "Save recovery codes"];

/** Password → secret + first code → recovery codes (shown once). */
function EnableTwoStep({ onClose, onEnabled }) {
  const { t } = useT();
  const toast = useToast();
  const copy = useCopy();
  const [stage, setStage] = useState(0);
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err, "That didn't work — try again"));
    } finally {
      setBusy(false);
    }
  }

  const begin = () =>
    run(async () => {
      const { data } = await api.post(API.auth.mfaSetup(), { password });
      setSetup(data);
      setPassword("");
      setStage(1);
    });

  const confirm = () =>
    run(async () => {
      const { data } = await api.post(API.auth.mfaEnable(), { code });
      setCodes(data.recovery_codes || []);
      setStage(2);
      onEnabled();
      toast.success(biToast("2-step verification is on"));
    });

  const codesText = () =>
    [
      "DoSJE Nigrani — Sentinel recovery codes",
      `Created ${formatDateTime(new Date())}`,
      "Each code works once. Keep them somewhere safe.",
      "",
      ...codes,
      "",
    ].join("\n");

  const footer =
    stage === 0 ? (
      <>
        <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
        <Button variant="primary" loading={busy} disabled={!password} onClick={begin}>{t("Continue")}</Button>
      </>
    ) : stage === 1 ? (
      <>
        <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
        <Button variant="primary" loading={busy} disabled={!/^\d{6}$/.test(code)} onClick={confirm}>{t("Turn on")}</Button>
      </>
    ) : (
      <Button variant="primary" onClick={onClose}>{t("I've saved my recovery codes")}</Button>
    );

  return (
    <Modal open onClose={onClose} title={t("Turn on 2-step verification")} footer={footer}>
      <ol className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" aria-label={t("Steps")}>
        {TWO_STEP_STAGES.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-4 bg-ink/20" aria-hidden="true" />}
            <span
              className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${
                i < stage ? "bg-signal-good text-white" : i === stage ? "bg-ink text-paper" : "bg-ink/[0.07] text-ink-muted"
              }`}
              aria-hidden="true"
            >
              {i < stage ? "✓" : i + 1}
            </span>
            <span className={i === stage ? "font-semibold text-ink" : "text-ink-muted"} aria-current={i === stage ? "step" : undefined}>
              {t(label)}
            </span>
          </li>
        ))}
      </ol>

      {stage === 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password && !busy) begin();
          }}
          className="space-y-3"
        >
          <p className="text-sm text-ink/80">
            <Bi en="Confirm it's you with your current password." altClassName="mt-0.5 text-xs text-ink-muted" />
          </p>
          <PasswordField id="mfa-setup-password" label={t("Current password")} value={password} onChange={setPassword} />
        </form>
      )}

      {stage === 1 && setup && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{6}$/.test(code) && !busy) confirm();
          }}
          className="space-y-4"
        >
          <p className="text-sm leading-relaxed text-ink/80">
            <Bi en="In your authenticator app, add an account and enter this setup key (choose “time-based”). On a phone, the button below opens the app directly." altClassName="mt-1 text-xs text-ink-muted" />
          </p>
          <div className="rounded-lg border border-paper-line bg-paper-dim/40 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{t("Setup key")}</p>
            <p className="mt-1.5 select-all break-all font-mono text-[15px] font-semibold tracking-wider text-ink">{groupKey(setup.secret)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => copy(setup.secret, "Setup key copied")}>
                <CopyGlyph /> {t("Copy key")}
              </Button>
              <a href={setup.otpauth_uri} className="inline-flex items-center gap-2 rounded-md border border-ink/20 bg-paper-raised px-2.5 py-1.5 text-xs font-medium text-ink hover:border-ink/40">
                {t("Open in authenticator app")}
              </a>
            </div>
          </div>
          <div>
            <label htmlFor="mfa-enable-code" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-muted">
              {t("6-digit code from the app")}
            </label>
            <input
              id="mfa-enable-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-44 rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-center font-mono text-lg tracking-[0.35em] outline-none placeholder:text-ink/25 focus:border-ink/40"
            />
          </div>
        </form>
      )}

      {stage === 2 && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-md bg-signal-watch-soft px-3 py-2.5 text-xs leading-relaxed">
            <span className="mt-0.5 text-signal-watch">
              <StatusGlyph kind="watch" />
            </span>
            <Bi en="Save these recovery codes now — they won't be shown again. Each one signs you in once if you lose your phone." altClassName="mt-0.5 text-ink-muted" />
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-paper-line bg-paper-dim/40 p-3 font-mono text-sm tracking-wider" aria-label={t("Recovery codes")}>
            {codes.map((c) => (
              <li key={c} className="select-all">{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => copy(codes.join("\n"), "Recovery codes copied")}>
              <CopyGlyph /> {t("Copy all")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => downloadBlob(new Blob([codesText()], { type: "text/plain" }), "sentinel-recovery-codes.txt")}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10" />
              </svg>
              {t("Download .txt")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-signal-flag-soft px-3 py-2 text-xs text-signal-flag">
          {error}
        </p>
      )}
    </Modal>
  );
}

/** "JBSW Y3DP EHPK 3PXP" — a base32 secret in blocks of four. */
const groupKey = (secret = "") => secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

function CopyGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5v-.5A1.5 1.5 0 009 1.5H4A1.5 1.5 0 002.5 3v5A1.5 1.5 0 004 9.5h.5" />
    </svg>
  );
}

function DisableTwoStep({ onClose, onDisabled }) {
  const { t } = useT();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = password && (/^\d{6}$/.test(code) || /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code));

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.post(API.auth.mfaDisable(), { password, code });
      onDisabled();
      toast.success(biToast("2-step verification is off"));
      onClose();
    } catch (err) {
      setError(errorMessage(err, "That didn't work — try again"));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("Turn off 2-step verification")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="danger" loading={busy} disabled={!ready} onClick={submit}>{t("Turn off")}</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) submit();
        }}
        className="space-y-3"
      >
        <p className="text-sm leading-relaxed text-ink/80">
          <Bi en="Your account will be protected by your password alone. Confirm with your password and a current code (or a recovery code)." altClassName="mt-1 text-xs text-ink-muted" />
        </p>
        <PasswordField id="mfa-disable-password" label={t("Current password")} value={password} onChange={setPassword} />
        <div>
          <label htmlFor="mfa-disable-code" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-ink-muted">
            {t("Code from the app, or a recovery code")}
          </label>
          <input
            id="mfa-disable-code"
            type="text"
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={9}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
            placeholder="000000"
            className="w-44 rounded-md border border-paper-line bg-paper-raised px-3 py-2 text-center font-mono text-lg tracking-[0.2em] outline-none placeholder:text-ink/25 focus:border-ink/40"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-signal-flag-soft px-3 py-2 text-xs text-signal-flag">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------- password ---- */
const STRENGTH = [
  { label: "Too weak", tone: "flag" },
  { label: "Weak", tone: "flag" },
  { label: "Fair", tone: "watch" },
  { label: "Good", tone: "good" },
  { label: "Strong", tone: "good" },
];

function ChangePasswordCard({ user, onChanged }) {
  const { t } = useT();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rulesId = useId();

  const rules = useMemo(() => passwordPolicy(next, { name: user?.name, email: user?.email, current }), [next, user, current]);
  const strength = passwordStrength(rules, next);
  const matches = again.length > 0 && again === next;
  const ready = current && rules.every((r) => r.ok) && matches;

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(API.auth.changePassword(), { current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setAgain("");
      const n = Number(data?.revoked_other_sessions) || 0;
      toast.success(n ? biToast("Password changed. {n} other device(s) were signed out.", { n }) : biToast("Password changed"));
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the password"));
    } finally {
      setBusy(false);
    }
  }

  const s = STRENGTH[strength];
  return (
    <Card>
      <CardHeader title="Change password" subtitle={<Bi en="Changing it signs out every other device." />} />
      <form onSubmit={submit} className="space-y-3 px-5 py-4" noValidate>
        <input type="text" autoComplete="username" value={user?.email || ""} readOnly hidden />
        <PasswordField id="pw-current" label={t("Current password")} value={current} onChange={setCurrent} />
        <PasswordField id="pw-new" label={t("New password")} value={next} onChange={setNext} autoComplete="new-password" describedBy={rulesId} />

        {/* strength meter */}
        <div aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength ? tone(s.tone).bg : "bg-ink/[0.07]"}`} />
            ))}
          </div>
          {next && (
            <p className={`mt-1 text-[11px] font-medium ${tone(s.tone).text}`}>
              <Bi en={s.label} inline altClassName="font-normal opacity-80" />
            </p>
          )}
        </div>

        <ul id={rulesId} className="grid gap-x-3 gap-y-1 text-[11.5px] sm:grid-cols-2">
          {rules.map((r) => (
            <li key={r.key} className={`flex items-start gap-1.5 ${r.ok ? "text-signal-good" : "text-ink-muted"}`}>
              <span className="mt-[3px] flex" aria-hidden="true">
                {r.ok ? <StatusGlyph kind="check" /> : <span className="mx-[3px] mt-[3px] h-1.5 w-1.5 rounded-full border border-current" />}
              </span>
              <span>
                <span className="sr-only">{r.ok ? t("Met:") : t("Not yet:")} </span>
                <Bi en={r.label} altClassName="opacity-75" />
              </span>
            </li>
          ))}
        </ul>

        <PasswordField id="pw-again" label={t("Confirm new password")} value={again} onChange={setAgain} autoComplete="new-password" />
        {again && !matches && (
          <p className="text-[11.5px] text-signal-flag">
            <Bi en="The two new passwords don't match" inline altClassName="opacity-80" />
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-signal-flag-soft px-3 py-2 text-xs text-signal-flag">
            {error}
          </p>
        )}

        <div className="pt-1">
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            <Bi en="Change password" inline altClassName="text-xs opacity-80" />
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* --------------------------------------------------------- devices ----- */
const isPhoneDevice = (label = "") => /android|iphone|ipad|mobile|app on/i.test(label);

function SessionsCard({ sessions, className = "" }) {
  const { t } = useT();
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const list = useMemo(() => [...(sessions.data || [])].sort((a, b) => Number(b.current) - Number(a.current) || String(b.last_seen_at).localeCompare(String(a.last_seen_at))), [sessions.data]);
  const others = list.filter((s) => !s.current);

  async function signOutOne(s) {
    setBusyId(s.id);
    try {
      await api.delete(API.auth.session(s.id));
      toast.success(biToast("Signed out {device}", { device: s.device || t("that device") }));
      sessions.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't sign that device out"));
    } finally {
      setBusyId(null);
    }
  }

  async function signOutOthers() {
    setBusyId("others");
    try {
      const { data } = await api.post(API.auth.logoutOthers());
      toast.success(biToast("Signed out {n} other device(s)", { n: data?.revoked ?? others.length }));
      setConfirmAll(false);
      sessions.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't sign the other devices out"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className={className}>
      <CardHeader
        title="Signed-in devices"
        subtitle={<Bi en="Every place your account is signed in right now." />}
        action={
          !sessions.unavailable &&
          others.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setConfirmAll(true)}>
              <Bi en="Sign out all other devices" inline altClassName="text-[11px] opacity-80" />
            </Button>
          )
        }
      />
      <div className="px-5 py-3">
        {sessions.unavailable ? (
          <div className="py-2">
            <ServerOnlyNote />
          </div>
        ) : sessions.loading ? (
          <SkeletonRows rows={2} height="h-12" className="py-2" />
        ) : sessions.error ? (
          <ErrorState message={sessions.error} onRetry={sessions.reload} />
        ) : (
          <ul className="divide-y divide-paper-line">
            {list.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${s.current ? "bg-signal-good-soft text-signal-good" : "bg-ink/5 text-ink/60"}`} aria-hidden="true">
                  {isPhoneDevice(s.device) ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
                      <path d="M11 18.5h2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <rect x="3" y="4" width="18" height="12" rx="1.8" />
                      <path d="M9 20h6M12 16v4" strokeLinecap="round" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {s.device || t("Unknown device")}
                    {s.current && (
                      <Badge toneName="good" glyph="check">
                        <Bi en="This device" inline />
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">
                    <span className="font-mono">{s.ip || "—"}</span>
                    <span className="opacity-50"> · </span>
                    {t("Signed in")} {formatDateTime(s.created_at)}
                    <span className="opacity-50"> · </span>
                    {t("Last active")} {s.current ? t("now") : relativeTime(s.last_seen_at)}
                  </p>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => signOutOne(s)}
                    className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#b42318] hover:bg-ink/5 disabled:opacity-60"
                  >
                    {busyId === s.id && <Spinner />}
                    <Bi en="Sign out" inline altClassName="text-[11px] opacity-80" />
                  </button>
                )}
              </li>
            ))}
            {!list.length && <li className="py-6 text-center text-sm text-ink-muted">{t("No other devices are signed in.")}</li>}
          </ul>
        )}
      </div>

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={t("Sign out all other devices?")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>{t("Cancel")}</Button>
            <Button variant="danger" loading={busyId === "others"} onClick={signOutOthers}>
              {t("Sign out {n} device(s)", { n: others.length })}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink/80">
          <Bi en="Everywhere else your account is signed in will need your password again. This device stays signed in." altClassName="mt-1 text-xs text-ink-muted" />
        </p>
        <ul className="mt-3 space-y-1 text-xs text-ink-muted">
          {others.map((s) => (
            <li key={s.id}>
              {s.device} · <span className="font-mono">{s.ip}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §25  ROUTES
   ══════════════════════════════════════════════════════════════════════════ */

const DECIDERS = [ROLES.ADMIN, ROLES.OFFICIAL];

/** Pages only some roles may open (the shell itself is gated for everyone). */
function only(allow, element) {
  return <ProtectedRoute allow={allow}>{element}</ProtectedRoute>;
}

/**
 * Add a page in three steps:
 *   1. write a `function MyPage() { return <Page>…</Page>; }` above this
 *   2. add a <Route> line here
 *   3. add an entry to NAV_GROUPS in §13 so it appears in the top navigation
 */
function Routed() {
  return (
    <Routes>
      <Route path="/welcome" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      {/* Every signed-in page shares one shell (the layout route below). */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Overview />} />
        <Route path="/map" element={<MapView />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/cameras" element={<CameraWall />} />
        <Route path="/institutes" element={<Institutes />} />
        <Route path="/institutes/:id" element={<InstituteDetail />} />
        <Route path="/analytics" element={<Analytics />} />

        <Route path="/districts" element={<Districts />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/accessibility" element={<Accessibility />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/audit" element={only(DECIDERS, <AuditTrail />)} />
        <Route path="/inspectors" element={only(DECIDERS, <Inspectors />)} />
        <Route path="/assignments" element={only(DECIDERS, <Assignments />)} />
        <Route path="/grievances" element={only(DECIDERS, <Grievances />)} />
        <Route path="/renewals" element={only(DECIDERS, <Renewals />)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/**
 * The providers live here rather than in main.jsx, so main.jsx never needs
 * touching and this really is the only file you edit.
 */
function App() {
  return (
    <BrowserRouter basename={ROUTER_BASE}>
      <SentinelTheme />
      <div className="snt-app">
      <AuthProvider>
        <ToastProvider>
          <Routed />
        </ToastProvider>
      </AuthProvider>
      </div>
    </BrowserRouter>
  );
}

export default App;
