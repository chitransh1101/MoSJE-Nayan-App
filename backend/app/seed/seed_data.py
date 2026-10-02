"""
Populates the database with the SAME demo world the three frontends show in
their demo mode - same institutes (same ids), same people, same emails - so
switching Sentinel, Setu or Nayan from demo data to this backend changes
nothing on screen except that it is now real, shared and persistent.

All demo accounts use the password  Password123!

Run with:  python -m app.seed.seed_data
"""
import hashlib
import math
import random
import sys
from datetime import date, datetime, timedelta

from app.core.security import hash_password
from app.core.time import utcnow
from app.db.base import Base, SessionLocal, engine
from app.db.models.alert import Alert
from app.db.models.assignment import Assignment
from app.db.models.camera_feed import CameraFeed
from app.db.models.extras import (AttendanceDaily, BeneficiaryDocument,
                                  BeneficiaryProfile, Inspection,
                                  InspectorMessage, Notice, Scheme,
                                  SchemeApplication)
from app.db.models.grievance import Grievance
from app.db.models.institute import Institute
from app.db.models.institute_document import InstituteDocument
from app.db.models.user import User
from app.db.models.vc_call import VCCall
from app.services import audit
from app.services.anomaly import (generate_synthetic_history, score_day,
                                  train_model)
from app.services.benefits import DOC_CATALOG

DEMO_PASSWORD = "Password123!"

# ---------------------------------------------------------------- institutes
# (id, name, type, lat, lng, district, state, score, status, renewal, capacity)
INSTITUTES = [
    ("3f6c1a20-8e41-4b17-9d02-5a7cbe91d411", "Ashray Balika Grih, Aishbagh", "shelter", 26.8385, 80.9006, "Lucknow", "Uttar Pradesh", 58.40, "red", "pending", 80),
    ("7b2d9e54-1c88-49a3-8f60-2ed4417ba903", "Nav Jeevan Balgruh, Gomti Nagar", "shelter", 26.8512, 81.0064, "Lucknow", "Uttar Pradesh", 71.20, "yellow", "pending", 60),
    ("c41a7f38-5b02-4d9e-a716-90f3c28e6d55", "Sarvodaya Vidyalaya Hostel, Kanpur", "hostel", 26.4499, 80.3319, "Kanpur Nagar", "Uttar Pradesh", 88.60, "green", "approved", 140),
    ("e8903b71-4a6f-4c25-b83d-1f7e50c9a264", "Matru Chhaya Vridhashram, Varanasi", "old_age_home", 25.3176, 82.9739, "Varanasi", "Uttar Pradesh", 93.10, "green", "approved", 50),
    ("a15d6c93-2e78-4f10-9b44-6c8a3de71f02", "Disha Punarvas Kendra, Prayagraj", "rehab_centre", 25.4358, 81.8463, "Prayagraj", "Uttar Pradesh", 64.90, "yellow", "rejected", 40),
    ("d72f4e18-9b35-4a6c-8e21-5470ac93b6df", "Shanti Niketan Balika Chhatravas, Agra", "hostel", 27.1767, 78.0081, "Agra", "Uttar Pradesh", 81.75, "green", "approved", 100),
    ("b6e0937a-c142-4d58-91af-3e85d206c7b4", "Samarth Divyang Chhatravas, Gorakhpur", "hostel", 26.7606, 83.3732, "Gorakhpur", "Uttar Pradesh", 76.30, "yellow", "approved", 60),
    ("f4c82d15-6039-4e7b-a2c8-71bd94e3f0aa", "Anand Ashram Vridhashram, Meerut", "old_age_home", 28.9845, 77.7064, "Meerut", "Uttar Pradesh", 90.20, "green", "approved", 50),
    ("8c1e2f30-4a55-4b6c-9d7e-1f2a3b4c5d61", "Snehalaya Balgruha, Hadapsar", "shelter", 18.5089, 73.926, "Pune", "Maharashtra", 74.60, "yellow", "pending", 60),
    ("9d2f3a41-5b66-4c7d-8e8f-2a3b4c5d6e72", "Aadhar Vriddhashram, Nagpur", "old_age_home", 21.1458, 79.0882, "Nagpur", "Maharashtra", 87.20, "green", "approved", 45),
    ("ae3a4b52-6c77-4d8e-9f90-3b4c5d6e7f83", "Asha Kiran Chhatravas, Patna", "hostel", 25.5941, 85.1376, "Patna", "Bihar", 61.30, "red", "pending", 80),
]
ENROLMENT = [64, 48, 120, 40, 36, 90, 55, 42, 50, 38, 70]

# ------------------------------------------------------------------- people
OFFICIALS = [
    ("1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", "official@dosje.gov.in", "Anita Deshmukh", "official", "Deputy Secretary, DoSJE Division", "DOSJE-DS-0021", None, None),
    ("2b5a8d31-0e44-4f92-c7b6-1d38fa6092bc", "admin@dosje.gov.in", "R. Venkatesan", "admin", "PMU Administrator", "DOSJE-PMU-0003", None, None),
    ("8b3d0e61-7c22-4a91-b5f4-2e6a9c1d7f30", "district@dosje.gov.in", "Rakesh Srivastava", "district_authority", "District Social Welfare Officer", "UP-DSWO-LKO", "Lucknow", "Uttar Pradesh"),
]
# (id, email, name, designation, employee_id, district, state, phone, sites)
INSPECTORS = [
    ("3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd", "inspector1@dosje.gov.in", "Farhan Qureshi", "District Inspector", "UP-INS-0142", "Lucknow", "Uttar Pradesh", "+919876500142", [0, 2, 1]),
    ("4d7caf53-2066-41b4-e9d8-3f5abc82b4de", "inspector2@dosje.gov.in", "Meera Nair", "Senior Inspector", "UP-INS-0087", "Kanpur Nagar", "Uttar Pradesh", "+919876500087", [5, 4, 7]),
    ("5e8db064-3177-42c5-fae9-405bcd93c5ef", "inspector3@dosje.gov.in", "Rajesh Yadav", "District Inspector", "UP-INS-0203", "Gorakhpur", "Uttar Pradesh", "+919876500203", [3, 6]),
    ("6f9fc175-4288-43d6-ab01-516cde04d7a1", "inspector4@dosje.gov.in", "Sunil Patil", "District Inspector", "MH-INS-0311", "Pune", "Maharashtra", "+919876500311", [8, 9]),
    ("7a0ad286-5399-44e7-bc12-627def15e8b2", "inspector5@dosje.gov.in", "Anjali Kumari", "District Inspector", "BR-INS-0058", "Patna", "Bihar", "+919876500058", [10]),
]
# (id, email, name, designation, institute index)
STAFF = [
    ("6f9ec175-4288-43d6-ab01-516cde04d6f0", "staff@dosje.gov.in", "Sunita Rao", "Superintendent", 0),
    ("5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c01", "matruchhaya@demo.setu.gov.in", "Vinod Mishra", "Home Manager", 3),
    ("5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c02", "disha@demo.setu.gov.in", "Dr. Neha Srivastava", "Centre In-charge", 4),
    ("5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c03", "snehalaya@demo.setu.gov.in", "Prakash More", "Superintendent", 8),
    ("5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c04", "ashakiran@demo.setu.gov.in", "Ravi Ranjan", "Warden", 10),
]

# ------------------------------------------------------------------ schemes
SCHEMES = [
    ("pms_sc", "Post-Matric Scholarship for SC Students", "अनुसूचित जाति के छात्रों के लिए पोस्ट-मैट्रिक छात्रवृत्ति", "Directorate of Social Welfare, {state}", 12000, "per year", 2, ["student", "sc"], "Tuition fees and a maintenance allowance for Scheduled Caste students in Class 11 and above.", ["aadhaar", "bank", "caste", "school", "income"]),
    ("pre_sc", "Pre-Matric Scholarship for SC Students", "अनुसूचित जाति के छात्रों के लिए प्री-मैट्रिक छात्रवृत्ति", "Directorate of Social Welfare, {state}", 3500, "per year", 1, ["school", "sc"], "Support for Scheduled Caste students in Classes 9 and 10 so they stay in school.", ["aadhaar", "bank", "caste", "school"]),
    ("yasasvi", "PM YASASVI Scholarship for OBC Students", "ओबीसी छात्रों के लिए पीएम यशस्वी छात्रवृत्ति", "Backward Classes Welfare Department, {state}", 5000, "per year", 1, ["student", "obc"], "Scholarship for OBC, EBC and DNT students in Class 11 and above.", ["aadhaar", "bank", "caste", "school", "income"]),
    ("vatsalya", "Sponsorship support — Mission Vatsalya", "प्रायोजन सहायता — मिशन वात्सल्य", "District Child Protection Unit, {district}", 4000, "per month", 1, ["child"], "Monthly support for children in need of care and protection, paid for their education, health and needs.", ["aadhaar", "bank", "cwc_order"]),
    ("daksh", "Skill training — PM-DAKSH", "कौशल प्रशिक्षण — पीएम-दक्ष", "PM-DAKSH training partner, {district}", None, None, 1, ["youth"], "Free, certified skill training (tailoring, electrician, data entry and more) with placement support.", ["aadhaar", "caste"]),
    ("shreshta", "SHRESHTA — residential education", "श्रेष्ठा — आवासीय शिक्षा", "National Testing Agency / Ministry of Social Justice", None, None, 1, ["school", "sc"], "Seats in reputed residential schools for meritorious Scheduled Caste students in Classes 9 and 11.", ["aadhaar", "caste", "school"]),
    ("ignoaps", "Indira Gandhi National Old Age Pension", "इंदिरा गांधी राष्ट्रीय वृद्धावस्था पेंशन", "District Social Welfare Office, {district}", 1000, "per month", 1, ["senior"], "Monthly pension for senior citizens, with the Centre's and the State's share paid together.", ["aadhaar", "bank", "age"]),
    ("vayoshri", "Rashtriya Vayoshri Yojana — assistive devices", "राष्ट्रीय वयोश्री योजना — सहायक उपकरण", "ALIMCO camp, {district}", None, None, 1, ["senior"], "Free walking sticks, hearing aids, spectacles, dentures and wheelchairs for senior citizens.", ["aadhaar", "age", "income"]),
    ("nmba", "Nasha Mukt Bharat Abhiyaan — rehabilitation", "नशा मुक्त भारत अभियान — पुनर्वास", "Integrated Rehabilitation Centre, {district}", None, None, 1, ["rehab"], "Counselling, treatment and aftercare through an Integrated Rehabilitation Centre for Addicts.", ["aadhaar"]),
    ("smile", "SMILE — livelihood stipend", "स्माइल — आजीविका वजीफ़ा", "District Social Welfare Office, {district}", 1500, "per month", 1, ["rehab"], "A monthly stipend during skill training for people rebuilding their livelihood.", ["aadhaar", "bank"]),
]

# -------------------------------------------------------------- beneficiaries
# (id or None, email, name, gender, age, tags, institute index, schemes, doc overrides)
# scheme spec: (key, status, applied days ago, stages reached if pending, blocking doc, flag)
BENEFICIARIES = [
    ("701fd286-5399-44e7-bc12-627def15e701", "beneficiary@dosje.gov.in", "Kavya Iyer", "F", 17, ["child", "student", "sc"], 0,
     [("vatsalya", "active", 480), ("pms_sc", "pending", 34, 1, "caste"), ("daksh", "active", 80)], {"caste": "pending"}),
    (None, "priya.kumari@demo.setu.gov.in", "Priya Kumari", "F", 15, ["child", "school", "sc"], 0, [("pre_sc", "approved", 400), ("vatsalya", "active", 400)], {}),
    (None, "anjali.verma@demo.setu.gov.in", "Anjali Verma", "F", 18, ["child", "student", "obc", "youth"], 0, [("yasasvi", "approved", 390), ("vatsalya", "active", 300), ("daksh", "pending", 21, 2)], {}),
    (None, "sana.parveen@demo.setu.gov.in", "Sana Parveen", "F", 14, ["child", "school"], 0, [("vatsalya", "active", 330), ("daksh", "pending", 16, 1)], {"cwc_order": "pending"}),
    (None, "rekha.yadav@demo.setu.gov.in", "Rekha Yadav", "F", 17, ["child", "student", "obc"], 0, [("vatsalya", "active", 520), ("yasasvi", "rejected", 95, None, "income")], {"income": "rejected"}),
    (None, "pooja.nishad@demo.setu.gov.in", "Pooja Nishad", "F", 14, ["child", "school", "sc"], 0, [("vatsalya", "active", 300), ("pre_sc", "pending", 40, 2)], {}),
    (None, "meera.pal@demo.setu.gov.in", "Meera Pal", "F", 18, ["child", "student", "obc", "youth"], 0, [("yasasvi", "approved", 430), ("daksh", "active", 120)], {}),
    (None, "ramesh.tiwari@demo.setu.gov.in", "Ramesh Chandra Tiwari", "M", 72, ["senior"], 3, [("ignoaps", "active", 700), ("vayoshri", "approved", 75)], {}),
    (None, "arjun.paswan@demo.setu.gov.in", "Arjun Paswan", "M", 19, ["student", "sc", "youth"], 10, [("pms_sc", "approved", 450), ("daksh", "pending", 18, 1)], {}),
    (None, "lakshmi.sharma@demo.setu.gov.in", "Lakshmi Sharma", "F", 68, ["senior"], 7, [("ignoaps", "active", 560), ("vayoshri", "pending", 30, 2)], {}),
    (None, "imran.sheikh@demo.setu.gov.in", "Imran Sheikh", "M", 27, ["rehab", "youth"], 4, [("nmba", "active", 150), ("smile", "active", 330), ("daksh", "approved", 60)], {}),
    (None, "rohan.jadhav@demo.setu.gov.in", "Rohan Jadhav", "M", 16, ["child", "school"], 8, [("vatsalya", "active", 380)], {}),
    (None, "fatima.khatoon@demo.setu.gov.in", "Fatima Khatoon", "F", 17, ["child", "student", "youth"], 1, [("vatsalya", "active", 260), ("daksh", "pending", 12, 1)], {}),
    (None, "suresh.kumar@demo.setu.gov.in", "Suresh Kumar", "M", 20, ["student", "sc", "youth"], 2, [("pms_sc", "approved", 420), ("daksh", "pending", 70, 3)], {}),
    (None, "kamla.devi@demo.setu.gov.in", "Kamla Devi", "F", 75, ["senior"], 3, [("ignoaps", "active", 900, None, None, "delayed")], {}),
    (None, "shanti.devi@demo.setu.gov.in", "Shanti Devi", "F", 70, ["senior"], 3, [("ignoaps", "active", 420), ("vayoshri", "pending", 22, 1)], {}),
    (None, "vikas.yadav@demo.setu.gov.in", "Vikas Yadav", "M", 24, ["rehab", "youth"], 4, [("nmba", "active", 90), ("smile", "active", 210), ("daksh", "pending", 20, 2)], {}),
    (None, "aarav.shinde@demo.setu.gov.in", "Aarav Shinde", "M", 13, ["child", "school"], 8, [("vatsalya", "active", 250)], {}),
    (None, "gopal.rao@demo.setu.gov.in", "Gopal Rao", "M", 80, ["senior"], 9, [("ignoaps", "active", 800), ("vayoshri", "approved", 120)], {}),
    (None, "nisha.kumari@demo.setu.gov.in", "Nisha Kumari", "F", 19, ["student", "sc", "youth"], 5, [("pms_sc", "approved", 380), ("shreshta", "rejected", 200, None, "school")], {"school": "rejected"}),
    (None, "deepak.gupta@demo.setu.gov.in", "Deepak Gupta", "M", 18, ["student", "obc", "youth"], 6, [("yasasvi", "approved", 400), ("daksh", "active", 100)], {}),
]
STATE_CODE = {"Uttar Pradesh": "UP", "Bihar": "BR", "Maharashtra": "MH"}
CASE_WORKERS = ["Meena Srivastava", "Rajiv Ranjan", "S. Kalaivani", "Anil Deshmukh", "Pema Lhamu", "Soma Chatterjee", "Kiran Choudhary", "Nirmala Singh"]
HEALTH_NOTES = ["Routine check-up — all normal.", "Anaemia follow-up — iron supplements given.", "Vision test due — referred to eye camp.", "Blood pressure monitored monthly.", "Dental check-up recommended.", "Weight gain on track."]
SCHOOLS = ["Govt. Girls Inter College", "Kendriya Vidyalaya", "Govt. Senior Secondary School", "Jawahar Navodaya Vidyalaya", "Govt. Polytechnic"]

# (institute index, camera names, statuses)
CAMERA_PLAN = [
    (0, ["Main Gate", "Dormitory A", "Dormitory B", "Kitchen"], ["online", "online", "stale", "online"]),
    (1, ["Main Gate", "Common Hall", "Dormitory"], ["online", "online", "online"]),
    (2, ["Main Gate", "Study Hall", "Mess"], ["online", "online", "online"]),
    (3, ["Reception", "Ward A"], ["online", "online"]),
    (4, ["Main Gate", "Counselling Room"], ["stale", "online"]),
    (5, ["Main Gate", "Dormitory"], ["online", "online"]),
    (6, ["Main Gate", "Corridor"], ["offline", "online"]),
    (7, ["Reception", "Garden"], ["online", "online"]),
    (8, ["Main Gate", "Dormitory"], ["offline", "online"]),
    (9, ["Reception"], ["online"]),
    (10, ["Main Gate", "Mess"], ["online", "stale"]),
]


def _h(s: str) -> float:
    return int(hashlib.sha256(s.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def _attendance(idx: int, inst_id: str, today: date) -> list[AttendanceDaily]:
    """30 days per institute, with the same patterns Nayan's demo shows:
    Ashray spikes while CCTV drops, Nav Jeevan spike, Gorakhpur marked while
    cameras were off, Disha 100% staff, Patna identical (and impossible)
    numbers - the rules in Nayan's AI insights catch each one."""
    rng = random.Random(inst_id)
    enrolled = ENROLMENT[idx]
    staff_total = round(enrolled / 8) + 3
    rows = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        weekend = d.weekday() >= 5
        base = enrolled * (0.84 if weekend else 0.91) + (rng.random() * 6 - 3)
        uptime = 0.9 + rng.random() * 0.1
        staff = round(staff_total * (0.78 + rng.random() * 0.2))
        if idx == 0 and i in (4, 5):
            base, uptime = enrolled * 0.91 * 1.41, 0.52
        if idx == 0 and i == 13:
            base = enrolled * 1.28
        if idx == 1 and i == 2:
            base = enrolled * 0.9 * 1.34
        if idx == 6 and i == 1:
            uptime = 0.05
        if idx == 4 and i <= 13:
            staff = staff_total
        present = round(base)
        if idx == 10 and i <= 8:
            present = round(enrolled * 1.3)
        rows.append(AttendanceDaily(
            institute_id=inst_id, date=d, present=max(0, present), enrolled=enrolled,
            staff_present=min(staff_total, max(0, staff)), staff_total=staff_total, camera_uptime=round(uptime, 3),
        ))
    return rows


def run():
    # Same guard as app/main.py: only auto-create tables for local SQLite.
    # On Postgres, Alembic (`alembic upgrade head`) owns the schema.
    from app.core.config import settings
    if settings.DATABASE_URL.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    if db.query(User).count() > 0:
        print("Database already has data - skipping seed. Delete dosje_nigrani.db (or drop the Postgres DB) to reseed.")
        db.close()
        return

    now = utcnow()
    today = now.date()
    pw = hash_password(DEMO_PASSWORD)

    # --- institutes ---
    insts: list[Institute] = []
    for k, (iid, name, typ, lat, lng, dist, state, score, status, renewal, cap) in enumerate(INSTITUTES):
        r = _h(iid)
        hist = [round(score - 6 + j * 1.2 + _h(iid + str(j)) * 3, 1) for j in range(5)] + [score]
        insts.append(Institute(
            id=iid, name=name, type=typ, latitude=lat, longitude=lng, district=dist, state=state,
            compliance_score=score, status=status, renewal_status=renewal,
            address="Aishbagh Road, Lucknow 226004" if k == 0 else f"{dist}, {state}",
            capacity=cap, residents_count=ENROLMENT[k],
            registration_no=f"{STATE_CODE.get(state, 'IN')}/{dist[:3].upper()}/{typ[:2].upper()}/{2018 + int(r * 6)}/{100 + int(r * 800):04d}",
            registration_valid_until=(today + timedelta(days=120 + int(r * 500))).isoformat(),
            superintendent=next((s[2] for s in STAFF if s[4] == k), None),
            last_inspection_at=now - timedelta(days=2 if k == 0 else 3 + int(r * 40)),
            score_history=hist,
        ))
    db.add_all(insts)
    db.commit()

    # --- people ---
    users: list[User] = []
    for uid, email, name, role, desig, emp, dist, state in OFFICIALS:
        users.append(User(id=uid, email=email, name=name, role=role, password_hash=pw, designation=desig, employee_id=emp, district=dist, state=state))
    for uid, email, name, desig, emp, dist, state, phone, _sites in INSPECTORS:
        users.append(User(id=uid, email=email, name=name, role="inspector", password_hash=pw, designation=desig, employee_id=emp, district=dist, state=state, phone_number=phone))
    for uid, email, name, desig, k in STAFF:
        users.append(User(id=uid, email=email, name=name, role="institute_staff", password_hash=pw, designation=desig, institute_id=INSTITUTES[k][0],
                          district=INSTITUTES[k][5], state=INSTITUTES[k][6], phone_number=f"+91945{k:02d}0{k}112"))
    db.add_all(users)
    db.commit()

    # --- schemes ---
    db.add_all([
        Scheme(key=k, name=n, hi=hi, office=o, amount=a, period=p, instalments=inst_n, audience=aud, about=ab, documents=docs)
        for k, n, hi, o, a, p, inst_n, aud, ab, docs in SCHEMES
    ])
    db.commit()
    scheme_docs = {s[0]: s[9] for s in SCHEMES}

    # --- beneficiaries: account, profile, applications, documents ---
    beneficiaries: list[User] = []
    for i, (bid, email, name, gender, age, tags, k, specs, doc_over) in enumerate(BENEFICIARIES):
        iid, _, typ, _, _, dist, state, *_ = INSTITUTES[k]
        rng = random.Random(email)
        u = User(email=email, name=name, role="beneficiary", password_hash=pw, institute_id=iid,
                 phone_number=f"+9198{(i * 7919) % 100000000:08d}", district=dist, state=state, **({"id": bid} if bid else {}))
        db.add(u)
        db.flush()
        beneficiaries.append(u)
        is_child = "child" in tags or "school" in tags
        is_senior, is_rehab = "senior" in tags, "rehab" in tags
        is_student = "student" in tags or "school" in tags
        room = (f"Ward {1 + rng.randrange(4)} · Bed {1 + rng.randrange(30)}" if is_senior
                else f"Ward {1 + rng.randrange(3)}" if is_rehab
                else f"Room {101 + rng.randrange(40)}" if typ == "hostel"
                else f"Dormitory {'ABCD'[rng.randrange(4)]} · Bed {1 + rng.randrange(30)}")
        db.add(BeneficiaryProfile(
            user_id=u.id,
            beneficiary_code=f"BEN-{STATE_CODE.get(state, 'IN')}-{dist[:3].upper()}-{417 + i * 53:05d}",
            gender=gender, age=age,
            date_of_birth=(today - timedelta(days=age * 365 + rng.randrange(300))).isoformat(),
            tags=tags,
            category=("Senior citizen (BPL)" if is_senior else "Person in recovery" if is_rehab
                      else "Child in need of care and protection" if is_child
                      else "Scheduled Caste student" if "sc" in tags else "Other Backward Class student"),
            admitted_on=now - timedelta(days=640 if bid else 150 + rng.randrange(1200)),
            room=room,
            guardian=(f"Child Welfare Committee, {dist}" if is_child else "Self (family contact on record)" if is_senior else "Parent / family"),
            case_worker=f"{rng.choice(CASE_WORKERS)}, {'District Child Protection Unit' if is_child else 'District Social Welfare Office'}",
            phone_masked=f"+91 9{(i * 7919 * 13) % 10000:04d}X XXXXX",
            health={"last_checkup": (now - timedelta(days=30 + rng.randrange(80))).isoformat(timespec="seconds"),
                    "next_checkup": (now + timedelta(days=4 + rng.randrange(25))).isoformat(timespec="seconds"),
                    "notes": rng.choice(HEALTH_NOTES)},
            education=({"school": f"{rng.choice(SCHOOLS)}, {dist}",
                        "klass": f"Diploma, year {age - 17}" if age >= 18 else f"Class {min(12, age - 5)}",
                        "attendance": 72 + rng.randrange(26)} if is_student else None),
        ))
        needed = ["aadhaar"]
        for spec in specs:
            key, status, ago = spec[0], spec[1], spec[2]
            reach = spec[3] if len(spec) > 3 and spec[3] else 1
            block = spec[4] if len(spec) > 4 else None
            flag = spec[5] if len(spec) > 5 else None
            db.add(SchemeApplication(
                user_id=u.id, scheme_key=key,
                application_no=f"{key.upper().replace('_', '')}/{STATE_CODE.get(state, 'IN')}/{(now - timedelta(days=ago)).year}/{10000 + (i * 3571 + len(key) * 911) % 89999}",
                status=status, stages_reached=reach, applied_at=now - timedelta(days=ago),
                blocking_document=block, delayed=flag == "delayed",
            ))
            for dk in scheme_docs[key]:
                if dk not in needed:
                    needed.append(dk)
        if is_senior and "age" not in needed:
            needed.append("age")
        for dk in needed:
            name_en, name_hi, by = DOC_CATALOG[dk]
            st = doc_over.get(dk, "verified")
            db.add(BeneficiaryDocument(
                user_id=u.id, key=dk, name=name_en, hi=name_hi, status=st, required=True,
                verified_on=now - timedelta(days=120 + rng.randrange(500)) if st == "verified" else None,
                verified_by=by if st == "verified" else None,
                remark=("Needed for your application. Give a copy to your institute office — they will upload it." if st == "pending"
                        else "Name does not match your Aadhaar. Give a corrected copy to your institute office." if st == "rejected" else None),
            ))
        if is_child:
            db.add(BeneficiaryDocument(user_id=u.id, key="income_g", name="Guardian income certificate", hi="अभिभावक आय प्रमाण पत्र",
                                       status="not_required", required=False,
                                       remark="Not needed — you are under the care of the Child Welfare Committee."))
    db.commit()

    # --- cameras ---
    for k, names, statuses in CAMERA_PLAN:
        for j, (nm, st) in enumerate(zip(names, statuses)):
            db.add(CameraFeed(
                institute_id=INSTITUTES[k][0], name=nm, status=st,
                last_ping_at=now - (timedelta(minutes=1) if st == "online" else timedelta(hours=7) if st == "stale" else timedelta(hours=14 + j * 3)),
            ))
    db.commit()

    # --- attendance roll-ups ---
    for k, row in enumerate(INSTITUTES):
        db.add_all(_attendance(k, row[0], today))
    db.commit()

    # --- alerts: the Isolation Forest run writes the headline one for real ---
    history_df = generate_synthetic_history(days=60, inject_anomaly_on_last_n=5)
    model = train_model(history_df.iloc[:-5])
    result = score_day(model, history_df.iloc[-1].to_dict())
    I = [r[0] for r in INSTITUTES]
    alert_rows = [
        (0, "anomaly", "red", "open", 5, f"Anomaly score {result['anomaly_score']:.4f} against 60 days of this institute's own history. Attendance 41% above baseline while CCTV uptime fell to 52% — the combination, not either figure alone, drove the flag."),
        (0, "cctv_tamper", "red", "open", 9, "Perceptual hash identical across 7 consecutive frames on feed 'Dormitory B' — feed is frozen or looping."),
        (1, "vc_miss", "yellow", "open", 26, "Verification call to a registered beneficiary went unanswered across a 20-minute pickup window."),
        (4, "hash_mismatch", "red", "open", 31, "Evidence upload rejected: client hash 0e3b…a91f, server-computed 7c42…08dd. The bytes that arrived are not the bytes that were hashed on the device."),
        (1, "attendance_spike", "yellow", "open", 48, "Recorded attendance 34% above this institute's 30-day mean, with no corresponding intake records."),
        (6, "camera_offline", "yellow", "open", 14, "Feed 'Main Gate' stopped reporting 14 hours ago."),
        (4, "geofence_breach", "yellow", "reviewed", 72, "Evidence captured 1.2 km from the registered location, outside the 500 m geofence."),
        (0, "attendance_spike", "red", "escalated", 96, "Third attendance anomaly in nine days at the same institute."),
        (2, "vc_miss", "yellow", "reviewed", 144, "Beneficiary did not pick up; a second attempt the following day connected."),
        (6, "anomaly", "yellow", "reviewed", 192, "Anomaly score -0.0121 — borderline, driven mostly by a single low-uptime day."),
        (1, "camera_offline", "yellow", "reviewed", 264, "Feed 'Kitchen' offline for 6 hours during a power outage confirmed by the district office."),
        (5, "vc_miss", "yellow", "reviewed", 312, "Call unanswered; beneficiary's registered number has since been updated."),
        (8, "camera_offline", "yellow", "open", 11, "Feed 'Main Gate' offline since last night."),
        (10, "anomaly", "red", "open", 7, "Anomaly score -0.0712: meal counts 30% above enrolment for 9 straight days."),
    ]
    for k, typ, sev, st, hours, detail in alert_rows:
        db.add(Alert(institute_id=I[k], type=typ, severity=sev, status=st, detail=detail, created_at=now - timedelta(hours=hours)))
    db.commit()

    # --- assignments: each inspector's visits, plus history for fairness ---
    admin = next(u for u in users if u.role == "admin")
    for n, (uid, _e, name, *_rest, sites) in enumerate(INSPECTORS):
        for j, site in enumerate(sites):
            done = j == 2
            a = Assignment(
                institute_id=I[site], inspector_id=uid, random_seed_ref=hashlib.sha256(f"{uid}{site}".encode()).hexdigest()[:32],
                created_at=now - timedelta(days=5 if done else 1, hours=j),
                dispatch_time=(now - timedelta(days=3)).replace(hour=15, minute=0, second=0, microsecond=0) if done
                else (now + timedelta(days=j)).replace(hour=17 if j == 0 else 12, minute=0, second=0, microsecond=0),
                status="verified" if done else "assigned",
                priority="urgent" if j == 0 else "normal",
                strategy="engine",
                instructions=(["Verify the Dormitory B camera — the feed has been frozen and the institute has not explained it.",
                               "Photograph the DVR screen and the network switch."] if site == 0 and j == 0
                              else ["Routine quarterly inspection. Cross-check the meals complaint with at least five residents."] if j == 1
                              else ["Renewal inspection before the licence decision."]),
                geofence_triggered_at=now - timedelta(days=3, hours=-1) if done else None,
                notified_institute_at=now - timedelta(days=3, hours=-1) if done else None,
            )
            db.add(a)
            db.flush()
            if done:
                db.add(Inspection(
                    assignment_id=a.id, inspector_id=uid, institute_id=I[site],
                    remarks="Visited with the superintendent. Registers updated till date; kitchen clean and menu followed. One fire extinguisher past its refill date — asked the institute to refill within 7 days.",
                    checklist={"register": "yes", "cctv": "yes", "food": "yes", "water": "yes", "toilets": "yes", "fire": "no", "grievance": "yes", "staff": "yes"},
                    evidence_ids=[], client_hashes=[], gps_lat=INSTITUTES[site][3] + 0.0002, gps_lng=INSTITUTES[site][4] - 0.0002,
                    distance_m=28.0, device_id="NYN-ANDROID-demo", started_at=now - timedelta(days=3, hours=1), submitted_at=now - timedelta(days=3),
                ))
    db.commit()

    # --- grievances ---
    staff_user = next(u for u in users if u.email == "staff@dosje.gov.in")
    def upd(days_ago: float, text: str) -> dict:
        return {"at": (now - timedelta(days=days_ago)).isoformat(timespec="seconds"), "text": text}
    db.add(Grievance(institute_id=I[0], submitted_by_id=staff_user.id, subject="Water supply interrupted since Monday",
                     description="The borewell pump has been out since Monday morning. We are managing with tankers twice a day, but that is not enough for 64 residents. A repair estimate has been submitted and we await sanction.",
                     category="water", urgency="high", status="open", created_at=now - timedelta(days=1), sla_due_at=now + timedelta(days=20),
                     updates=[upd(0.9, "Received by the Ministry and logged in Sentinel.")]))
    kavya = beneficiaries[0]
    db.add(Grievance(institute_id=I[0], submitted_by_id=kavya.id, subject="Medical check-ups not held this quarter",
                     description="The quarterly health camp did not happen. Two of us were told to come back for anaemia follow-up.",
                     category="health", urgency="normal", status="in_review", confidential=True, created_at=now - timedelta(days=27),
                     escalation_level=2, escalated_at=now - timedelta(days=15), sla_due_at=now + timedelta(days=6),
                     updates=[upd(26.5, "Received by the Ministry and logged in Sentinel."), upd(24, "Assigned to the District Social Welfare Officer."),
                              upd(15, "Escalated to the State Directorate for action.")]))
    db.add(Grievance(institute_id=I[0], submitted_by_id=kavya.id, subject="Hot water not available in winter mornings",
                     description="The geyser on the first floor has not worked for two weeks.", category="facilities", status="resolved",
                     created_at=now - timedelta(days=40), updates=[upd(39.5, "Received by the Ministry and logged in Sentinel."),
                                                                     upd(37, "Assigned to the District Social Welfare Officer."),
                                                                     upd(33, "Resolved. Please tell us if the problem comes back.")]))
    senior = next(b for b in beneficiaries if b.email == "kamla.devi@demo.setu.gov.in")
    db.add(Grievance(institute_id=senior.institute_id, submitted_by_id=senior.id, subject="Pension not credited this month",
                     description="My pension for this month has not come to my account. Last month it was also late.", category="benefits",
                     urgency="high", status="open", created_at=now - timedelta(days=4), sla_due_at=now + timedelta(days=17),
                     updates=[upd(3.8, "Received by the Ministry and logged in Sentinel.")]))
    db.add(Grievance(institute_id=I[4], submitted_by_id=next(b.id for b in beneficiaries if b.email == "imran.sheikh@demo.setu.gov.in"),
                     subject="Meals not matching the posted menu", description="For the last two weeks the evening meal has not matched what is posted on the noticeboard. Milk has not been served since the 8th.",
                     category="food", status="open", created_at=now - timedelta(days=3), sla_due_at=now + timedelta(days=18),
                     updates=[upd(2.9, "Received by the Ministry and logged in Sentinel.")]))
    db.add(InstituteDocument(institute_id=I[0], uploaded_by_id=staff_user.id, file_url="local:///institute-documents/demo/fire-safety-certificate.pdf",
                             description="Updated fire safety certificate, submitted in response to the compliance review."))
    db.commit()

    # --- VC: logged random calls (Nayan/Sentinel) and beneficiaries' scheduled calls (Setu) ---
    official = next(u for u in users if u.role == "official")
    farhan = next(u for u in users if u.email == "inspector1@dosje.gov.in")
    db.add(VCCall(institute_id=I[2], participant_name="S. P. · Room 7", participant_role="beneficiary", called_by_id=official.id, called_by_name=official.name,
                  room="DoSJE-Nayan-demo3", outcome="connected", identity_ok=True, premises_shown=True, headcount=38,
                  notes="Beneficiary confirmed meals and medical check-up. Showed the study hall.", triggered_at=now - timedelta(hours=20), picked_up_at=now - timedelta(hours=20)))
    db.add(VCCall(institute_id=I[1], participant_name="N. D. · Room 2", participant_role="beneficiary", called_by_id=official.id, called_by_name=official.name,
                  room="DoSJE-Nayan-demo2", outcome="no_answer", notes="No pickup in 20 minutes — flagged.", triggered_at=now - timedelta(hours=26)))
    db.add(VCCall(institute_id=I[0], participant_name="Sunita Rao", participant_role="incharge", called_by_id=farhan.id, called_by_name=farhan.name,
                  room="DoSJE-Nayan-demo1", outcome="connected", identity_ok=True, premises_shown=False, headcount=51,
                  notes="In-charge declined to show Dormitory B on camera citing a power issue.", triggered_at=now - timedelta(hours=50), picked_up_at=now - timedelta(hours=50)))
    for i, b in enumerate(beneficiaries):
        inst = next(x for x in insts if x.id == b.institute_id)
        office = f"District Social Welfare Office, {inst.district}"
        db.add(VCCall(institute_id=b.institute_id, beneficiary_id=b.id, participant_name=b.name, participant_role="beneficiary",
                      scheduled_at=now + timedelta(days=1 + i % 9, hours=10), triggered_at=now, official_name=office, outcome="pending",
                      notes="A routine well-being call. Staff will not be on the call.", is_random=False))
        for k in range(2):
            missed = _h(f"{b.email}{k}") > 0.75
            when = now - timedelta(days=8 + k * 30 + int(_h(b.email + 'c' + str(k)) * 10))
            db.add(VCCall(institute_id=b.institute_id, beneficiary_id=b.id, participant_name=b.name, participant_role="beneficiary",
                          scheduled_at=when, triggered_at=when, picked_up_at=None if missed else when, official_name=office,
                          outcome="no_answer" if missed else "connected", is_random=False,
                          notes="Not answered — called again the next day." if missed else f"Spoke for {3 + k * 4} minutes. No concerns raised."))
    db.commit()

    # --- notices ---
    for title, body, audience, days in [
        ("Winter kit distribution", "Blankets, sweaters and shoes will be distributed at all child care institutes between the 1st and 10th of next month.", "all", 2),
        ("Scholarship portal open", "Post-Matric and YASASVI scholarship applications for this academic year are open. Institute offices can upload documents on residents' behalf.", "all", 5),
        ("Quarterly health camp schedule", "District health teams will visit every institute this month. Superintendents should share the resident list in advance.", "staff", 7),
        ("Grievance helpline", "Residents can raise a complaint any time through Setu or by asking for a call. Confidential complaints are never shown to institute staff.", "beneficiary", 10),
    ]:
        db.add(Notice(title=title, body=body, audience=audience, created_at=now - timedelta(days=days)))
    db.commit()

    # --- official <-> inspector messages ---
    meera = next(u for u in users if u.email == "inspector2@dosje.gov.in")
    for insp, direction, k, body, kind, hours, status, prio in [
        (farhan, "to_inspector", 0, "Please verify the Dormitory B camera during tomorrow's visit — the feed has been frozen for 7 frames and the institute hasn't explained it.", "instruction", 49, "read", "urgent"),
        (farhan, "from_inspector", 0, "Noted. I'll check the DVR and the network switch on site and upload photos from the field app.", "message", 48, "read", "normal"),
        (farhan, "from_inspector", 0, "Visited today. The Dormitory B camera had been covered with a cloth; staff removed it in my presence. 3 photos uploaded — hashes verified on the server.", "message", 5, "delivered", "normal"),
        (meera, "to_inspector", 5, "Status update on the meals complaint at Disha Punarvas Kendra? Residents say milk hasn't been served since the 8th.", "update_request", 26, "read", "normal"),
        (meera, "from_inspector", 5, "Menu board updated and cross-checked with 6 residents. Milk supply resumed from today. I'll file the report by evening.", "message", 24, "read", "normal"),
    ]:
        db.add(InspectorMessage(inspector_id=insp.id, direction=direction, sender_id=official.id if direction == "to_inspector" else insp.id,
                                sender_name=official.name if direction == "to_inspector" else insp.name, body=body, kind=kind, priority=prio,
                                institute_id=I[k], status=status, created_at=now - timedelta(hours=hours)))
    db.commit()

    # --- first rows of the audit chain ---
    audit.record(db, admin, action="system.seeded", entity_type="system", detail="Demo data loaded for Sentinel, Setu and Nayan")
    audit.record(db, official, action="renewal.rejected", entity_type="institute", entity_id=I[4], entity_label=INSTITUTES[4][1], detail="pending → rejected")

    account_lines = [(u.role, u.email) for u in users] + [(b.role, b.email) for b in beneficiaries[:3]]
    db.close()

    print(f"\nSeed complete. Demo accounts (all use password: {DEMO_PASSWORD}):")
    for role, email in account_lines:
        print(f"  {role:<20} {email}")
    print(f"  ...and {len(BENEFICIARIES) - 3} more beneficiaries (see app/seed/seed_data.py)")


if __name__ == "__main__":
    sys.exit(run() or 0)
