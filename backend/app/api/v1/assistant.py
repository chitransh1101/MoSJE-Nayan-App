"""
Yukt backend (FastAPI router) - one assistant for Sentinel, Setu and Nayan
==========================================================================

Yukt is the AI assistant inside all three apps. The client says which app
it is (`app`: sentinel | setu | nayan); the prompt and the actions Yukt may
propose follow from that. yukt_knowledge.json (Sentinel's feature guide)
sits next to this file.

    GET  /assistant/status     -> {llm, bhashini, knowledge_docs}
    POST /assistant/chat       -> {reply, actions, sources}
    GET  /assistant/knowledge  -> the knowledge base (for admin tooling)
    POST /assistant/translate  -> {text}               (Bhashini NMT)
    POST /assistant/tts        -> {audio_base64, mime}  (Bhashini TTS)
    POST /assistant/asr        -> {text}               (Bhashini ASR)

HOW AN ANSWER IS MADE (retrieval-augmented generation)
  1. Retrieve: BM25 over yukt_knowledge.json finds the features relevant to
     the question. The browser also sends the ids its own retrieval found;
     only ids are accepted — the text always comes from the server's copy.
  2. Ground: the prompt gets those entries + a snapshot of the official's live
     dashboard data (counts, alerts, grievances), nothing else.
  3. Generate: the configured model answers as Yukt, in Hindi or English,
     and may PROPOSE actions via tools. The server never performs them: Yukt
     shows a Confirm card and the browser calls the normal endpoint with the
     official's own token, so role checks still apply.

SWITCHING THE MODEL: set environment variables — nothing in code changes.
    YUKT_LLM_PROVIDER   "anthropic" (default) or "openai" (any OpenAI-
                        compatible endpoint: OpenAI, Azure OpenAI, a
                        self-hosted or government-cloud model server…)
    YUKT_LLM_MODEL      model name for that provider
    YUKT_LLM_API_KEY    the key (falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY)
    YUKT_LLM_BASE_URL   for "openai": the base URL, e.g. https://api.openai.com/v1
    YUKT_KB_PATH        path to yukt_knowledge.json (default: next to this file)
    BHASHINI_USER_ID, BHASHINI_API_KEY, BHASHINI_PIPELINE_ID   (22 languages)

Keys live only in the server environment (or your secrets manager). The
browser never sees them, and the user only ever sees the name "Yukt".

    pip install fastapi httpx
"""

from __future__ import annotations

import json
import math
import os
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.deps import get_current_user  # noqa: E402

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])

PROVIDER = os.getenv("YUKT_LLM_PROVIDER", "anthropic").lower()
MODEL = os.getenv("YUKT_LLM_MODEL", "claude-sonnet-5" if PROVIDER == "anthropic" else "gpt-4o-mini")
API_KEY = os.getenv("YUKT_LLM_API_KEY") or os.getenv("ANTHROPIC_API_KEY" if PROVIDER == "anthropic" else "OPENAI_API_KEY", "")
BASE_URL = os.getenv("YUKT_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
KB_PATH = Path(os.getenv("YUKT_KB_PATH", Path(__file__).with_name("yukt_knowledge.json")))

BHASHINI_USER_ID = os.getenv("BHASHINI_USER_ID", "")
BHASHINI_API_KEY = os.getenv("BHASHINI_API_KEY", "")
BHASHINI_PIPELINE_ID = os.getenv("BHASHINI_PIPELINE_ID", "64392f96daac500b55c543cd")
BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"

LANGUAGES = [
    "hi", "en", "as", "bn", "brx", "doi", "gu", "kn", "ks", "gom", "mai", "ml",
    "mni", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur",
]
TIMEOUT = httpx.Timeout(30.0, connect=10.0)


# ═══════════════════════════════════════════════════════ knowledge + BM25 ══
class KnowledgeBase:
    """yukt_knowledge.json, indexed for BM25. Reloads when the file changes,
    so editing the knowledge base needs no restart."""

    # A few Hinglish / Hindi forms folded onto one word, so "kamera",
    # "कैमरा" and "cctv" all hit the camera feature.
    SYNONYMS = {
        "cctv": "camera", "kamera": "camera", "कैमरा": "camera", "कैमरे": "camera", "cameras": "camera",
        "shikayat": "grievance", "शिकायत": "grievance", "complaint": "grievance", "complaints": "grievance",
        "nirikshak": "inspector", "निरीक्षक": "inspector", "inspectors": "inspector",
        "baat": "message", "contact": "message", "sampark": "message", "chat": "message", "संदेश": "message",
        "chetavani": "alert", "चेतावनी": "alert", "alerts": "alert",
        "graph": "chart", "graphs": "chart", "charts": "chart", "analytics": "chart",
        "naksha": "map", "नक्शा": "map", "zila": "district", "jila": "district", "ज़िला": "district",
        "riport": "report", "रिपोर्ट": "report", "reports": "report",
    }
    STOP = set("a an the is are to of in on for and or me my i you it this that how what where which kya hai hain ho mujhe karna karni ka ki ke ko se mein me kaha kahan milega open kholo dikhao show".split())

    def __init__(self, path: Path):
        self.path = path
        self.mtime = 0.0
        self.docs: list[dict] = []
        self.by_id: dict[str, dict] = {}
        self._load()

    def _tok(self, text: str) -> list[str]:
        words = re.findall(r"[a-z0-9\u0900-\u097f]+", str(text).lower())
        return [self.SYNONYMS.get(w, w) for w in words if w not in self.STOP and len(w) > 1]

    def _load(self):
        if not self.path.exists():
            return
        mtime = self.path.stat().st_mtime
        if mtime == self.mtime:
            return
        self.docs = json.loads(self.path.read_text(encoding="utf-8"))["docs"]
        self.by_id = {d["id"]: d for d in self.docs}
        # Title and aliases count three times, keywords twice, summary once.
        self.tf = []
        for d in self.docs:
            toks = self._tok(" ".join([d["title"], d.get("hi", ""), *d.get("aliases", [])])) * 3
            toks += self._tok(" ".join(d.get("keywords", []))) * 2
            toks += self._tok(d.get("summary", ""))
            self.tf.append(Counter(toks))
        self.avgdl = sum(sum(c.values()) for c in self.tf) / max(1, len(self.tf))
        df = Counter(t for c in self.tf for t in c)
        n = len(self.docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.mtime = mtime

    def search(self, query: str, k: int = 6) -> list[dict]:
        self._load()
        q = self._tok(query)
        scored = []
        for d, tf in zip(self.docs, self.tf):
            dl = sum(tf.values())
            s = 0.0
            for t in q:
                f = tf.get(t, 0)
                if f:
                    s += self.idf.get(t, 0) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * dl / self.avgdl))
            if s > 0:
                scored.append((s, d))
        scored.sort(key=lambda x: -x[0])
        return [d for _, d in scored[:k]]


KB = KnowledgeBase(KB_PATH)


@router.get("/status")
async def status(user=Depends(get_current_user)) -> dict[str, Any]:
    # Deliberately no model or provider name: users only ever see "Yukt".
    return {
        "llm": bool(API_KEY),
        "bhashini": bool(BHASHINI_USER_ID and BHASHINI_API_KEY),
        "knowledge_docs": len(KB.docs),
        "languages": LANGUAGES,
    }


@router.get("/knowledge")
async def knowledge(user=Depends(get_current_user)) -> dict[str, Any]:
    KB._load()
    return {"docs": KB.docs}


# ═══════════════════════════════════════════════════════════════════ chat ══
class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str


class ChatIn(BaseModel):
    message: str = Field(..., max_length=2000)
    lang: str = "en"  # "hi" or "en" — other languages arrive already translated
    history: list[Turn] = []
    page: str = "/"
    doc_ids: list[str] = []  # the browser's own retrieval, ids only
    context: dict[str, Any] = {}  # live-data snapshot
    app: str = "sentinel"  # sentinel | setu | nayan
    role: str | None = None  # ignored - the server uses the signed-in user's role


SYSTEM_PROMPT = """You are Yukt (युक्त), the AI assistant built into Sentinel — the officials' \
dashboard of India's Department of Social Justice & Empowerment for monitoring welfare \
institutes. Your name is Yukt. Never call yourself anything else and never name the \
company, model or technology behind you; if asked, say you are Yukt, Sentinel's assistant.

THREE PLATFORMS
- Sentinel: web dashboard for officials and administrators (this one).
- Setu: web dashboard for institutes and beneficiaries (their status, compliance score, findings, grievances, documents, calls).
- Nayan: inspectors' mobile app on the Play Store (assignments, check-in, evidence capture, reports, officials' messages).

RULES
1. Answer ONLY from the KNOWLEDGE entries and the LIVE SNAPSHOT below. Never invent a \
feature, page, institute, number or policy. If the answer isn't there, say so and point to \
the closest feature.
2. When a feature is asked about: say which app it's in. If it is in Setu say "This feature \
is available in Setu." If in Nayan say "This feature is available in Nayan." If in Sentinel, \
say where it is and call open_feature so the official gets an Open button.
3. Explain simply when asked — short sentences, plain words, no jargon.
4. Reply in {lang_name}. Be brief: 1–4 sentences, then at most a short list.
5. To DO something (escalate, mark reviewed, resolve, switch theme, make a report) call the \
matching tool. Tools are proposals the official confirms in the UI — never claim an action is \
done. Only propose alert/grievance actions for role "official" or "admin".
6. Use ids exactly as they appear below.

The official is on page {page}. Their role: {role}.

KNOWLEDGE (retrieved for this question):
{knowledge}

LIVE SNAPSHOT (generated {generated_at}):
{snapshot}"""

TOOLS = [
    {"name": "open_feature", "description": "Show an Open button for a Sentinel feature from KNOWLEDGE (or where a Setu/Nayan feature lives). Set navigate=true only when the official asked to open/go there.",
     "input_schema": {"type": "object", "properties": {"doc_id": {"type": "string"}, "navigate": {"type": "boolean"}}, "required": ["doc_id"]}},
    {"name": "escalate_alert", "description": "Propose escalating an open alert. Needs confirmation.",
     "input_schema": {"type": "object", "properties": {"alert_id": {"type": "string"}}, "required": ["alert_id"]}},
    {"name": "mark_alert_reviewed", "description": "Propose marking an open alert reviewed. Needs confirmation.",
     "input_schema": {"type": "object", "properties": {"alert_id": {"type": "string"}}, "required": ["alert_id"]}},
    {"name": "resolve_grievance", "description": "Propose marking a grievance resolved. Needs confirmation.",
     "input_schema": {"type": "object", "properties": {"grievance_id": {"type": "string"}}, "required": ["grievance_id"]}},
    {"name": "escalate_grievance", "description": "Propose escalating a grievance to the next level. Needs confirmation.",
     "input_schema": {"type": "object", "properties": {"grievance_id": {"type": "string"}}, "required": ["grievance_id"]}},
    {"name": "set_theme", "description": "Switch the dashboard display mode.",
     "input_schema": {"type": "object", "properties": {"theme": {"type": "string", "enum": ["light", "dark", "contrast"]}}, "required": ["theme"]}},
    {"name": "download_report", "description": "Open Reports and download the report.",
     "input_schema": {"type": "object", "properties": {"format": {"type": "string", "enum": ["pdf", "excel"]}}, "required": ["format"]}},
]


APP_PROMPTS = {
    "setu": """You are Yukt (युक्त), the assistant inside Setu — the web portal where institutes and \
beneficiaries of India's Department of Social Justice & Empowerment see their status, schemes, \
payments, findings, grievances and calls. Your name is Yukt; never name the technology behind you.
Answer ONLY from the LIVE SNAPSHOT (the person's own record). Never invent a payment, date or status.
Reply in {lang_name}, briefly and kindly, in plain words. You may PROPOSE actions with tools \
(raise a grievance, request a call, request a scheme, change language, open a page); the person \
confirms them — never say an action is done. The person's role: {role}. Page: {page}.

LIVE SNAPSHOT (generated {generated_at}):
{snapshot}""",
    "nayan": """You are Yukt (युक्त), the assistant inside Nayan — the mobile app of India's Department \
of Social Justice & Empowerment for inspection teams and officials: surprise visits, geo-tagged \
evidence sealed with SHA-256, live CCTV, random verification video calls, random assignment and \
attendance anomaly analytics. Your name is Yukt; never name the technology behind you.
Answer ONLY from the LIVE SNAPSHOT. Reply in {lang_name}, in 1–4 short sentences. To open a visit \
call open_assignment with its id; to open a section call open_tab. The person confirms every action. \
Role: {role}.

LIVE SNAPSHOT (generated {generated_at}):
{snapshot}""",
}

APP_TOOLS = {
    "setu": [
        {"name": "navigate", "description": "Open a page of Setu.",
         "input_schema": {"type": "object", "properties": {"to": {"type": "string"}}, "required": ["to"]}},
        {"name": "raise_grievance", "description": "Propose filing a grievance. Needs confirmation.",
         "input_schema": {"type": "object", "properties": {"subject": {"type": "string"}, "description": {"type": "string"},
                                                           "category": {"type": "string"}, "urgency": {"type": "string", "enum": ["normal", "high"]}},
                          "required": ["subject", "description"]}},
        {"name": "request_call", "description": "Propose asking the Department to call. Needs confirmation.",
         "input_schema": {"type": "object", "properties": {"preferred_time": {"type": "string"}}}},
        {"name": "request_scheme", "description": "Propose applying for a scheme by key. Needs confirmation.",
         "input_schema": {"type": "object", "properties": {"scheme_key": {"type": "string"}}, "required": ["scheme_key"]}},
        {"name": "set_language", "description": "Switch the language.",
         "input_schema": {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]}},
    ],
    "nayan": [
        {"name": "open_assignment", "description": "Offer to open one of the person's visits.",
         "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "label": {"type": "string"}}, "required": ["id"]}},
        {"name": "open_tab", "description": "Offer to open a section of Nayan.",
         "input_schema": {"type": "object", "properties": {"tab": {"type": "string", "enum": ["visits", "cctv", "vc", "assign", "insights"]}}, "required": ["tab"]}},
    ],
}


def _kb_block(docs: list[dict]) -> str:
    lines = []
    for d in docs:
        where = f"route {d['route']}" if d.get("route") else "no page"
        how = (" Steps: " + " → ".join(d["how"])) if d.get("how") else ""
        lines.append(f"- [{d['id']}] {d['title']} ({d.get('hi', '')}) — app: {d['app']}; {where}. {d['summary']}{how}")
    return "\n".join(lines) or "- (nothing relevant found)"


async def _call_anthropic(system: str, messages: list[dict], tools: list[dict] | None = None) -> tuple[str, list[dict]]:
    tools = tools if tools is not None else TOOLS
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": MODEL, "max_tokens": 800, "system": system, "messages": messages, "tools": tools},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Yukt couldn't reach its AI service")
    text, calls = [], []
    for b in r.json().get("content", []):
        if b.get("type") == "text":
            text.append(b.get("text", ""))
        elif b.get("type") == "tool_use":
            calls.append({"name": b.get("name"), "input": b.get("input") or {}})
    return "\n".join(t.strip() for t in text if t.strip()), calls


async def _call_openai(system: str, messages: list[dict], tools_in: list[dict] | None = None) -> tuple[str, list[dict]]:
    tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}} for t in (tools_in if tools_in is not None else TOOLS)]
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(
            f"{BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "max_tokens": 800, "messages": [{"role": "system", "content": system}, *messages], "tools": tools},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Yukt couldn't reach its AI service")
    msg = (r.json().get("choices") or [{}])[0].get("message", {})
    calls = []
    for c in msg.get("tool_calls") or []:
        try:
            calls.append({"name": c["function"]["name"], "input": json.loads(c["function"].get("arguments") or "{}")})
        except (KeyError, json.JSONDecodeError):
            continue
    return (msg.get("content") or "").strip(), calls


def _to_action(call: dict, app: str = "sentinel") -> dict | None:
    n, i = call["name"], call["input"]
    if app == "setu":
        if n in ("navigate", "raise_grievance", "request_call", "request_scheme", "set_language"):
            return {"type": n, **{k: v for k, v in i.items() if isinstance(v, (str, int, bool))}}
        return None
    if app == "nayan":
        if n == "open_assignment" and i.get("id"):
            return {"type": "open_assignment", "id": str(i["id"]), "label": str(i.get("label") or "Open visit")}
        if n == "open_tab" and i.get("tab"):
            return {"type": "open_tab", "id": str(i["tab"]), "label": str(i["tab"]).upper()}
        return None
    if n == "open_feature" and i.get("doc_id") in KB.by_id:
        return {"type": "open_feature", "doc_id": i["doc_id"], "navigate": bool(i.get("navigate"))}
    if n in ("escalate_alert", "mark_alert_reviewed") and i.get("alert_id"):
        return {"type": n, "alert_id": i["alert_id"]}
    if n in ("resolve_grievance", "escalate_grievance") and i.get("grievance_id"):
        return {"type": n, "grievance_id": i["grievance_id"]}
    if n == "set_theme" and i.get("theme") in ("light", "dark", "contrast"):
        return {"type": "set_theme", "theme": i["theme"]}
    if n == "download_report":
        return {"type": "download_report", "format": "excel" if i.get("format") == "excel" else "pdf"}
    return None


_CHAT_LIMIT = 20  # questions per user per minute - protects the model budget
_chat_calls: dict[str, list[float]] = {}


def _check_chat_rate(user_id: str) -> None:
    now = time.time()
    recent = [t for t in _chat_calls.get(user_id, []) if now - t < 60]
    if len(recent) >= _CHAT_LIMIT:
        raise HTTPException(status_code=429, detail="Too many questions in a minute. Please wait a moment.",
                            headers={"Retry-After": str(int(60 - (now - recent[0])) + 1)})
    recent.append(now)
    _chat_calls[user_id] = recent


@router.post("/chat")
async def chat(body: ChatIn, user=Depends(get_current_user)) -> dict[str, Any]:
    _check_chat_rate(str(getattr(user, "id", "")))
    if not API_KEY:
        raise HTTPException(status_code=404, detail="AI not configured")  # Yukt falls back to on-device knowledge

    # 1. Retrieve — the server's own BM25, plus the browser's ids (validated).
    docs = KB.search(body.message, k=6)
    for doc_id in body.doc_ids[:8]:
        d = KB.by_id.get(doc_id)
        if d and d not in docs:
            docs.append(d)
    docs = docs[:8]

    # 2. Ground.
    ctx = body.context or {}
    app = (body.app or "sentinel").lower()
    template = APP_PROMPTS.get(app)
    if template:
        system = template.format(
            lang_name="Hindi (Devanagari)" if body.lang == "hi" else "English",
            page=body.page or "/",
            role=getattr(user, "role", ""),
            generated_at=ctx.get("generated_at", ""),
            snapshot=json.dumps(ctx, ensure_ascii=False, default=str)[:30000],
        )
    else:
        system = SYSTEM_PROMPT.format(
            lang_name="Hindi (Devanagari) — Hinglish questions also get Hindi" if body.lang == "hi" else "English",
            page=body.page or ctx.get("page", "/"),
            role=getattr(user, "role", "official"),  # the server's view, not the browser's
            knowledge=_kb_block(docs),
            generated_at=ctx.get("generated_at", ""),
            snapshot=json.dumps({k: v for k, v in ctx.items() if k not in ("page", "role")}, ensure_ascii=False)[:50000],
        )
    messages = [{"role": t.role, "content": t.text} for t in body.history[-8:] if t.text.strip()]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    messages.append({"role": "user", "content": body.message})
    merged: list[dict] = []
    for m in messages:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] += "\n" + m["content"]
        else:
            merged.append(m)

    # 3. Generate.
    tools = APP_TOOLS.get(app, TOOLS)
    text, calls = await (_call_openai(system, merged, tools) if PROVIDER == "openai" else _call_anthropic(system, merged, tools))
    actions = [a for a in (_to_action(c, app) for c in calls) if a]
    if not text and actions:
        text = "मैंने यह तैयार कर दिया है — कृपया पुष्टि करें।" if body.lang == "hi" else "I've prepared that — please confirm."
    cited = [a["doc_id"] for a in actions if a["type"] == "open_feature" and "doc_id" in a]
    return {"reply": text, "actions": actions, "sources": cited or [d["id"] for d in docs[:3]]}


# ═══════════════════════════════════════════════════════════════ Bhashini ══
_pipeline_cache: dict[tuple, tuple[float, dict]] = {}
PIPELINE_TTL = 30 * 60  # seconds


def _need_bhashini():
    if not (BHASHINI_USER_ID and BHASHINI_API_KEY):
        raise HTTPException(status_code=404, detail="Bhashini not configured")


async def _pipeline(task: str, language: dict) -> dict:
    """Step 1 of every Bhashini call: ask which service handles this task and
    language, and get the inference endpoint + key. Cached for 30 minutes."""
    key = (task, json.dumps(language, sort_keys=True))
    hit = _pipeline_cache.get(key)
    if hit and time.time() - hit[0] < PIPELINE_TTL:
        return hit[1]
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(
            BHASHINI_CONFIG_URL,
            headers={"userID": BHASHINI_USER_ID, "ulcaApiKey": BHASHINI_API_KEY, "Content-Type": "application/json"},
            json={
                "pipelineTasks": [{"taskType": task, "config": {"language": language}}],
                "pipelineRequestConfig": {"pipelineId": BHASHINI_PIPELINE_ID},
            },
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Bhashini configuration call failed")
    cfg = r.json()
    try:
        out = {
            "service_id": cfg["pipelineResponseConfig"][0]["config"][0]["serviceId"],
            "url": cfg["pipelineInferenceAPIEndPoint"]["callbackUrl"],
            "auth_name": cfg["pipelineInferenceAPIEndPoint"]["inferenceApiKey"]["name"],
            "auth_value": cfg["pipelineInferenceAPIEndPoint"]["inferenceApiKey"]["value"],
        }
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Bhashini has no model for that language")
    _pipeline_cache[key] = (time.time(), out)
    return out


async def _compute(p: dict, task: str, config: dict, input_data: dict) -> dict:
    """Step 2: run the task on the endpoint step 1 returned."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(
            p["url"],
            headers={p["auth_name"]: p["auth_value"], "Content-Type": "application/json"},
            json={
                "pipelineTasks": [{"taskType": task, "config": {**config, "serviceId": p["service_id"]}}],
                "inputData": input_data,
            },
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Bhashini inference call failed")
    return r.json()


class TranslateIn(BaseModel):
    text: str = Field(..., max_length=5000)
    source: str
    target: str


@router.post("/translate")
async def translate(body: TranslateIn, user=Depends(get_current_user)) -> dict[str, str]:
    _need_bhashini()
    if body.source == body.target:
        return {"text": body.text}
    lang = {"sourceLanguage": body.source, "targetLanguage": body.target}
    p = await _pipeline("translation", lang)
    res = await _compute(p, "translation", {"language": lang}, {"input": [{"source": body.text}]})
    try:
        return {"text": res["pipelineResponse"][0]["output"][0]["target"]}
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Unexpected Bhashini response")


class TtsIn(BaseModel):
    text: str = Field(..., max_length=2000)
    lang: str
    gender: Literal["female", "male"] = "female"


@router.post("/tts")
async def tts(body: TtsIn, user=Depends(get_current_user)) -> dict[str, str]:
    _need_bhashini()
    lang = {"sourceLanguage": body.lang}
    p = await _pipeline("tts", lang)
    res = await _compute(p, "tts", {"language": lang, "gender": body.gender, "samplingRate": 22050}, {"input": [{"source": body.text}]})
    try:
        return {"audio_base64": res["pipelineResponse"][0]["audio"][0]["audioContent"], "mime": "audio/wav"}
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Unexpected Bhashini response")


class AsrIn(BaseModel):
    audio_base64: str = Field(..., max_length=4_000_000)  # ~8 s of 16 kHz WAV is ~350 KB
    lang: str
    sample_rate: int = 16000


@router.post("/asr")
async def asr(body: AsrIn, user=Depends(get_current_user)) -> dict[str, str]:
    _need_bhashini()
    lang = {"sourceLanguage": body.lang}
    p = await _pipeline("asr", lang)
    res = await _compute(
        p,
        "asr",
        {"language": lang, "audioFormat": "wav", "samplingRate": body.sample_rate},
        {"audio": [{"audioContent": body.audio_base64}]},
    )
    try:
        return {"text": res["pipelineResponse"][0]["output"][0]["source"]}
    except (KeyError, IndexError):
        raise HTTPException(status_code=502, detail="Unexpected Bhashini response")


# ═══════════════════════════════════════════ other routes Sentinel now uses ══
# Not implemented here because they touch your database models. The contract
# is in App.jsx §4 (search for "ASSUMED"):
#
#   POST /grievances/{id}/escalate   {reason} -> Grievance (escalation_level+1,
#                                    escalated_at=now). 409 at L3 or resolved.
#   GET  /audit-log                  -> AuditEntry[] newest first, each with
#                                    prev_hash + hash (SHA-256 of
#                                    "prev_hash|id|at|actor_id|action|entity_type|entity_id|detail")
#   POST /audit-log/events           {action, entity_type, entity_id?, entity_label?, detail}
#
# Suggested: a daily job that escalates any grievance whose 21-day window has
# passed (the frontend shows "Escalate all breached", but the server should
# not depend on someone clicking it).
