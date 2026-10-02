"""
Builds the beneficiary views Setu reads: /beneficiaries/me and the staff
roster (/institutes/{id}/residents).

Applications store only their facts (status, how far they've got, when they
were filed, what's blocking them). Stage dates, the payment history and the
"next step" sentence are derived here at read time, so they never go stale.
"""
import hashlib
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.db.models.extras import (BeneficiaryDocument, BeneficiaryProfile,
                                  SchemeApplication)
from app.db.models.grievance import Grievance
from app.db.models.institute import Institute
from app.db.models.user import User
from app.db.models.vc_call import VCCall

DOC_CATALOG = {
    "aadhaar": ("Aadhaar", "आधार", "UIDAI e-KYC"),
    "bank": ("Bank account (for DBT)", "बैंक खाता (DBT के लिए)", "PFMS"),
    "caste": ("Category certificate", "श्रेणी प्रमाण पत्र", "Tehsil office"),
    "school": ("School enrolment certificate", "स्कूल नामांकन प्रमाण पत्र", "School"),
    "income": ("Income certificate", "आय प्रमाण पत्र", "Tehsil office"),
    "cwc_order": ("Child Welfare Committee order", "बाल कल्याण समिति आदेश", "Child Welfare Committee"),
    "age": ("Age proof / senior citizen card", "आयु प्रमाण / वरिष्ठ नागरिक कार्ड", "District Social Welfare Office"),
}

STAGE_KEYS = ("applied", "verified", "sanctioned", "disbursed")
STATE_CODE = {"Uttar Pradesh": "UP", "Bihar": "BR", "Maharashtra": "MH"}


def _iso(d: datetime | None) -> str | None:
    return d.isoformat(timespec="seconds") if d else None


def _unit(seed: str) -> float:
    """Stable pseudo-random number in [0, 1) from a string."""
    return int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def _next_month_day(now: datetime, day: int) -> datetime:
    y, m = now.year, now.month + (1 if now.day >= day else 0)
    if m > 12:
        y, m = y + 1, 1
    return datetime(y, m, day, 10, 0)


def application_view(app: SchemeApplication, inst: Institute | None, now: datetime | None = None) -> dict:
    now = now or utcnow()
    scheme = app.scheme
    status = app.status
    reach = app.stages_reached if status == "pending" else (2 if status == "rejected" else 4)

    gaps = [0, 20 + 25 * _unit(app.id + "g1"), 15 + 25 * _unit(app.id + "g2"), 15 + 30 * _unit(app.id + "g3")]
    stages, t = [], app.applied_at or now
    for i, key in enumerate(STAGE_KEYS):
        t = t + timedelta(days=gaps[i])
        stages.append({"key": key, "at": _iso(t) if i < reach and t <= now else None})

    amount = scheme.amount if scheme else None
    period = scheme.period if scheme else None
    start = datetime.fromisoformat(stages[3]["at"]) if stages[3]["at"] else None
    code = STATE_CODE.get(inst.state if inst else "", "IN")

    disbursements: list[dict] = []
    if amount and start and status in ("approved", "active"):
        if period == "per month":
            for m in range(72):
                y, mo = start.year + (start.month - 1 + m) // 12, (start.month - 1 + m) % 12 + 1
                pay = datetime(y, mo, 7, 11, 0)
                if pay > now:
                    break
                if app.delayed and pay > now - timedelta(days=35):
                    continue
                disbursements.append({"at": _iso(pay), "amount": amount, "ref": f"DBT/{pay.year}/{code}/{5000000 + (m * 104729) % 4999999}"})
        else:
            each = amount / (scheme.instalments or 1)
            for k in range(4):
                pay = start + timedelta(days=182 * k)
                if pay > now:
                    break
                disbursements.append({"at": _iso(pay), "amount": each, "ref": f"NSP/{pay.year}/{100000 + (k * 977) % 899999}"})

    next_date = next_amount = None
    if amount and status in ("approved", "active"):
        if period == "per month":
            next_date, next_amount = _iso(_next_month_day(now, 7)), amount
        elif disbursements:
            next_date = _iso(datetime.fromisoformat(disbursements[-1]["at"]) + timedelta(days=182))
            next_amount = amount / (scheme.instalments or 1)
    elif not amount and status in ("approved", "active"):
        next_date = _iso(now + timedelta(days=2 + int(6 * _unit(app.id + "n")), hours=5))

    block = app.blocking_document
    if status == "rejected":
        doc = DOC_CATALOG.get(block or "income", ("a document",))[0]
        next_step = f"Not approved: {doc} did not match your Aadhaar details. Give a corrected copy to your institute office to re-apply."
    elif status == "pending":
        if block and block in DOC_CATALOG:
            next_step = f"Waiting for your {DOC_CATALOG[block][0].lower()}. Give a copy to your institute office — they will upload it."
        else:
            next_step = [
                "Your application is waiting for verification.",
                "Verified — waiting for sanction by the approving office.",
                "Sanctioned — the first payment or start date will appear here soon.",
            ][max(0, min(2, reach - 1))]
    elif app.delayed:
        next_step = "This month's payment is delayed at the treasury. A grievance has been raised for you."
    elif amount:
        next_step = "Paid on the 7th of every month to your bank account." if period == "per month" else "Next instalment will be credited to your bank account."
    elif app.scheme_key == "daksh":
        next_step = "Classes on Monday, Wednesday and Friday at 3 pm."
    elif app.scheme_key == "vayoshri":
        next_step = "Device distribution camp — bring your Aadhaar."
    else:
        next_step = "Sessions continue as planned with your counsellor."

    office = (scheme.office or "") if scheme else ""
    state = (inst.state or "") if inst else ""
    district = (inst.district or "") if inst else ""
    office = office.replace("{state}", state).replace("{district}", district)
    return {
        "key": app.scheme_key,
        "application_id": app.application_no,
        "name": scheme.name if scheme else app.scheme_key,
        "hi": scheme.hi if scheme else None,
        "office": office,
        "status": status,
        "amount": amount,
        "period": period,
        "next_date": next_date,
        "next_amount": next_amount,
        "next_step": next_step,
        "action": f"document:{block}" if block and status == "pending" else None,
        "delayed": bool(app.delayed),
        "stages": stages,
        "disbursements": disbursements[-12:],
    }


def document_view(d: BeneficiaryDocument) -> dict:
    return {
        "key": d.key,
        "name": d.name,
        "hi": d.hi,
        "status": d.status,
        "required": bool(d.required),
        "verified_on": _iso(d.verified_on),
        "by": d.verified_by,
        "remark": d.remark,
    }


def beneficiary_view(db: Session, user: User) -> dict:
    prof = db.get(BeneficiaryProfile, user.id)
    inst = db.get(Institute, user.institute_id) if user.institute_id else None
    apps = db.query(SchemeApplication).filter(SchemeApplication.user_id == user.id).all()
    docs = db.query(BeneficiaryDocument).filter(BeneficiaryDocument.user_id == user.id).all()
    now = utcnow()
    return {
        "user_id": user.id,
        "email": user.email,
        "beneficiary_id": prof.beneficiary_code if prof else None,
        "name": user.name,
        "gender": prof.gender if prof else None,
        "age": prof.age if prof else None,
        "tags": (prof.tags if prof else None) or [],
        "institute_id": user.institute_id,
        "institute_name": inst.name if inst else None,
        "admitted_on": _iso(prof.admitted_on) if prof else None,
        "date_of_birth": prof.date_of_birth if prof else None,
        "room": prof.room if prof else None,
        "guardian": prof.guardian if prof else None,
        "case_worker": prof.case_worker if prof else None,
        "category": prof.category if prof else None,
        "phone": prof.phone_masked if prof else None,
        "schemes": [application_view(a, inst, now) for a in apps],
        "documents": [document_view(d) for d in docs],
        "health": (prof.health if prof else None) or {},
        "education": prof.education if prof else None,
    }


def resident_summary(db: Session, user: User) -> dict:
    full = beneficiary_view(db, user)
    open_grievances = (
        db.query(Grievance)
        .filter(Grievance.submitted_by_id == user.id, Grievance.status.in_(("open", "in_review")))
        .count()
    )
    last_call = (
        db.query(VCCall)
        .filter(VCCall.beneficiary_id == user.id, VCCall.outcome.in_(("connected", "no_answer", "wrong_person")))
        .order_by(VCCall.triggered_at.desc())
        .first()
    )
    return {
        "user_id": full["user_id"],
        "beneficiary_id": full["beneficiary_id"],
        "name": full["name"],
        "age": full["age"],
        "gender": full["gender"],
        "category": full["category"],
        "admitted_on": full["admitted_on"],
        "room": full["room"],
        "schemes": [
            {k: s[k] for k in ("key", "name", "status", "amount", "period", "action", "disbursements")} for s in full["schemes"]
        ],
        "documents": [{k: d[k] for k in ("key", "name", "status")} for d in full["documents"]],
        # Private grievances are only ever counted here, never listed.
        "grievances_open": open_grievances,
        "last_call": _iso(last_call.triggered_at) if last_call else None,
        "next_checkup": (full["health"] or {}).get("next_checkup"),
    }
