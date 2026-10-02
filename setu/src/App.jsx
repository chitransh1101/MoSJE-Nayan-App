/**
 * Setu — the beneficiary services portal, in one file.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Setu (सेतु, "bridge") is the web portal of the Ministry of Social Justice &
 * Empowerment for the people inside welfare institutes. It is a website, like
 * Sentinel — not a mobile app.
 *
 *   · BENEFICIARIES see, at a glance: where their applications stand, what
 *     benefits they receive, which documents are verified or still needed,
 *     whether anything needs their action, and the latest Government updates.
 *     They raise grievances, follow them step by step, see verification calls,
 *     know their rights and reach emergency help.
 *   · INSTITUTE STAFF see their institute's compliance, respond to findings
 *     with evidence, upload documents, track renewal and raise grievances.
 *
 * One of three platforms on one backend:
 *   · Sentinel — officials' web dashboard
 *   · Setu     — this portal, for beneficiaries and institutes
 *   · Nayan    — inspectors' mobile app (Play Store)
 * Officials and inspectors who sign in here are sent to their own platform.
 *
 * ── HOW TO FIND THINGS ──────────────────────────────────────────────────────
 *   §1  LANGUAGE        22 scheduled languages + English; tx(), <Tx>
 *   §2  GEOGRAPHY       every State and Union Territory
 *   §3  VOCABULARY      status names, categories, formatting
 *   §4  API CONTRACT    every backend URL, tagged CONFIRMED / DERIVED / ASSUMED
 *   §5  MOCK DATA       demo beneficiary, institute directory, applications…
 *   §6  MOCK TRANSPORT  fake backend (VITE_USE_MOCK=true, or auto when offline)
 *   §7  HTTP + DATA     axios client, useApi, the in-memory session, sign-out
 *   §8  THEME           the Setu visual language (injected CSS)
 *   §9  UI KIT          buttons, cards, badges, track, timeline, modal, icons…
 *   §10 SHELL           government bar, header, sidebar, footer
 *   §11 START & SIGN IN state → language → institute → sign in
 *   §12 STAFF PAGES     overview, findings, documents, renewal, institute
 *   §13 SHARED PAGES    grievances, notices, help, ecosystem
 *   §14 BENEFICIARY     overview, benefits, documents, profile, grievances,
 *                       verification calls, rights
 *   §15 YUKT            the assistant (युक्त): answers from the person's own
 *                       record, knows every feature, acts only on Confirm
 *   §16 SECURITY        idle sign-out, silent token refresh, live data,
 *                       the Security page (2-step, password, devices)
 *   §17 ROUTES
 *
 * Environment (all optional):
 *   VITE_API_BASE_URL   backend, default /api/v1
 *   VITE_USE_MOCK       "true" = built-in demo data, no backend
 *   VITE_SENTINEL_URL   link for the Sentinel promotion + officials
 *   VITE_NAYAN_URL      link for "Know about Nayan" + inspectors
 *   (Yukt's AI and 22-language voice are server-side: /assistant/* in §4)
 *
 * Styling uses Tailwind's default utilities plus the CSS in §8, so it works
 * with a stock tailwind.config.js.
 */

import axios from "axios";
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";

/** Where the app is served from: "/" normally, "/Nayan/sentinel/"-style
 *  sub-paths on GitHub Pages (set by `vite build --base`). */
const ROUTER_BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "") || undefined;

const ENV = import.meta.env || {};
const USE_MOCK = ENV.VITE_USE_MOCK === "true";
const SENTINEL_URL = ENV.VITE_SENTINEL_URL || null;
const NAYAN_URL = ENV.VITE_NAYAN_URL || null;

/* ══════════════════════════════════════════════════════════════════════════
   §1  LANGUAGE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The beneficiary picks one of the 22 languages of the Eighth Schedule (or
 * English) when they start. How the interface uses it:
 *
 *   · English  — English only.
 *   · हिन्दी    — every screen is fully bilingual (tx(en, hi) everywhere).
 *   · 12 more  — navigation, page titles and the start flow carry the chosen
 *                language beneath the English (UI_DICT below).
 *   · the rest — the choice is saved and the interface stays in English until
 *                translations land; the picker says so honestly.
 *
 * The header switch flips which line leads: English first, or the chosen
 * language first. Adding a language = adding a row to UI_DICT.
 */
const LANGUAGES = [
  { code: "en", name: "English", native: "English", script: "latin" },
  { code: "hi", name: "Hindi", native: "हिन्दी", script: "deva" },
  { code: "bn", name: "Bengali", native: "বাংলা", script: "beng" },
  { code: "mr", name: "Marathi", native: "मराठी", script: "deva" },
  { code: "te", name: "Telugu", native: "తెలుగు", script: "telu" },
  { code: "ta", name: "Tamil", native: "தமிழ்", script: "taml" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", script: "gujr" },
  { code: "ur", name: "Urdu", native: "اردو", script: "arab", rtl: true },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", script: "knda" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", script: "orya" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", script: "mlym" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", script: "guru" },
  { code: "as", name: "Assamese", native: "অসমীয়া", script: "beng" },
  { code: "ne", name: "Nepali", native: "नेपाली", script: "deva" },
  { code: "mai", name: "Maithili", native: "मैथिली", script: "deva" },
  { code: "sat", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ", script: "olck" },
  { code: "ks", name: "Kashmiri", native: "کٲشُر", script: "arab", rtl: true },
  { code: "kok", name: "Konkani", native: "कोंकणी", script: "deva" },
  { code: "sd", name: "Sindhi", native: "سنڌي", script: "arab", rtl: true },
  { code: "doi", name: "Dogri", native: "डोगरी", script: "deva" },
  { code: "mni", name: "Manipuri", native: "ꯃꯤꯇꯩꯂꯣꯟ", script: "mtei" },
  { code: "brx", name: "Bodo", native: "बड़ो", script: "deva" },
  { code: "sa", name: "Sanskrit", native: "संस्कृतम्", script: "deva" },
];
const langOf = (code) => LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];

/** Web fonts per script — loaded only when that script is chosen. */
const SCRIPT_FONT = {
  deva: ["Noto+Sans+Devanagari", "Noto Sans Devanagari"],
  beng: ["Noto+Sans+Bengali", "Noto Sans Bengali"],
  telu: ["Noto+Sans+Telugu", "Noto Sans Telugu"],
  taml: ["Noto+Sans+Tamil", "Noto Sans Tamil"],
  gujr: ["Noto+Sans+Gujarati", "Noto Sans Gujarati"],
  arab: ["Noto+Naskh+Arabic", "Noto Naskh Arabic"],
  knda: ["Noto+Sans+Kannada", "Noto Sans Kannada"],
  orya: ["Noto+Sans+Oriya", "Noto Sans Oriya"],
  mlym: ["Noto+Sans+Malayalam", "Noto Sans Malayalam"],
  guru: ["Noto+Sans+Gurmukhi", "Noto Sans Gurmukhi"],
  olck: ["Noto+Sans+Ol+Chiki", "Noto Sans Ol Chiki"],
  mtei: ["Noto+Sans+Meetei+Mayek", "Noto Sans Meetei Mayek"],
};

/** Interface strings beyond English and Hindi, keyed by the English text. */
const UI_KEYS = [
  "Overview", "Benefits & applications", "Documents & verification", "Raise a grievance", "My grievances",
  "Verification calls", "Updates & notices", "Rights & entitlements", "My profile", "Help & support",
  "Findings", "Grievances", "Documents", "Registration renewal", "Institute profile",
  "Sign out", "Dashboard", "Services", "Information", "Account",
  "Choose your state", "Choose your language", "Choose your institute", "Sign in", "Continue",
  "Back", "Action required", "Application status", "Welcome to Setu", "Emergency helplines",
  "Language", "State", "Institute", "Beneficiary", "Institute staff",
  "Search", "Compliance", "Records", "Support", "Notices",
  "Activity", "Schemes & eligibility", "Residents", "Know about Nayan",
];
const UI_ROWS = {
  bn: ["সংক্ষিপ্ত বিবরণ", "সুবিধা ও আবেদন", "নথি ও যাচাই", "অভিযোগ জানান", "আমার অভিযোগ", "যাচাই কল", "আপডেট ও বিজ্ঞপ্তি", "অধিকার ও প্রাপ্য", "আমার প্রোফাইল", "সাহায্য ও সহায়তা", "পর্যবেক্ষণ", "অভিযোগ", "নথি", "নিবন্ধন নবীকরণ", "প্রতিষ্ঠানের প্রোফাইল", "সাইন আউট", "ড্যাশবোর্ড", "পরিষেবা", "তথ্য", "অ্যাকাউন্ট", "আপনার রাজ্য বেছে নিন", "আপনার ভাষা বেছে নিন", "আপনার প্রতিষ্ঠান বেছে নিন", "সাইন ইন", "এগিয়ে যান", "পিছনে", "পদক্ষেপ প্রয়োজন", "আবেদনের অবস্থা", "Setu-তে স্বাগতম", "জরুরি হেল্পলাইন", "ভাষা", "রাজ্য", "প্রতিষ্ঠান", "সুবিধাভোগী", "প্রতিষ্ঠানের কর্মী", "খুঁজুন", "সম্মতি", "রেকর্ড", "সহায়তা", "বিজ্ঞপ্তি", "কার্যকলাপ", "প্রকল্প ও যোগ্যতা", "আবাসিক", "নয়ন সম্পর্কে জানুন"],
  mr: ["विहंगावलोकन", "लाभ व अर्ज", "कागदपत्रे व पडताळणी", "तक्रार नोंदवा", "माझ्या तक्रारी", "पडताळणी कॉल", "अद्यतने व सूचना", "हक्क व पात्रता", "माझे प्रोफाइल", "मदत व सहाय्य", "निरीक्षणे", "तक्रारी", "कागदपत्रे", "नोंदणी नूतनीकरण", "संस्थेचे प्रोफाइल", "साइन आउट", "डॅशबोर्ड", "सेवा", "माहिती", "खाते", "तुमचे राज्य निवडा", "तुमची भाषा निवडा", "तुमची संस्था निवडा", "साइन इन", "पुढे जा", "मागे", "कृती आवश्यक", "अर्जाची स्थिती", "Setu मध्ये स्वागत आहे", "आपत्कालीन हेल्पलाइन", "भाषा", "राज्य", "संस्था", "लाभार्थी", "संस्थेचे कर्मचारी", "शोधा", "अनुपालन", "नोंदी", "सहाय्य", "सूचना", "क्रियाकलाप", "योजना व पात्रता", "रहिवासी", "नयनबद्दल जाणून घ्या"],
  te: ["అవలోకనం", "ప్రయోజనాలు & దరఖాస్తులు", "పత్రాలు & ధృవీకరణ", "ఫిర్యాదు చేయండి", "నా ఫిర్యాదులు", "ధృవీకరణ కాల్స్", "నవీకరణలు & నోటీసులు", "హక్కులు & అర్హతలు", "నా ప్రొఫైల్", "సహాయం & మద్దతు", "పరిశీలనలు", "ఫిర్యాదులు", "పత్రాలు", "రిజిస్ట్రేషన్ పునరుద్ధరణ", "సంస్థ ప్రొఫైల్", "సైన్ అవుట్", "డాష్‌బోర్డ్", "సేవలు", "సమాచారం", "ఖాతా", "మీ రాష్ట్రాన్ని ఎంచుకోండి", "మీ భాషను ఎంచుకోండి", "మీ సంస్థను ఎంచుకోండి", "సైన్ ఇన్", "కొనసాగించండి", "వెనుకకు", "చర్య అవసరం", "దరఖాస్తు స్థితి", "Setuకు స్వాగతం", "అత్యవసర హెల్ప్‌లైన్లు", "భాష", "రాష్ట్రం", "సంస్థ", "లబ్ధిదారు", "సంస్థ సిబ్బంది", "వెతకండి", "నిబంధనల పాటింపు", "రికార్డులు", "మద్దతు", "నోటీసులు", "కార్యకలాపాలు", "పథకాలు & అర్హత", "నివాసితులు", "నయన్ గురించి తెలుసుకోండి"],
  ta: ["கண்ணோட்டம்", "நலன்கள் & விண்ணப்பங்கள்", "ஆவணங்கள் & சரிபார்ப்பு", "புகார் அளிக்கவும்", "எனது புகார்கள்", "சரிபார்ப்பு அழைப்புகள்", "புதுப்பிப்புகள் & அறிவிப்புகள்", "உரிமைகள் & தகுதிகள்", "எனது சுயவிவரம்", "உதவி & ஆதரவு", "கண்டறிதல்கள்", "புகார்கள்", "ஆவணங்கள்", "பதிவு புதுப்பித்தல்", "நிறுவன சுயவிவரம்", "வெளியேறு", "டாஷ்போர்டு", "சேவைகள்", "தகவல்", "கணக்கு", "உங்கள் மாநிலத்தைத் தேர்ந்தெடுக்கவும்", "உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்", "உங்கள் நிறுவனத்தைத் தேர்ந்தெடுக்கவும்", "உள்நுழைக", "தொடரவும்", "பின்செல்", "நடவடிக்கை தேவை", "விண்ணப்ப நிலை", "Setu-க்கு வரவேற்கிறோம்", "அவசர உதவி எண்கள்", "மொழி", "மாநிலம்", "நிறுவனம்", "பயனாளி", "நிறுவன ஊழியர்கள்", "தேடு", "இணக்கம்", "பதிவுகள்", "ஆதரவு", "அறிவிப்புகள்", "செயல்பாடுகள்", "திட்டங்கள் & தகுதி", "குடியிருப்போர்", "நயன் பற்றி அறிக"],
  gu: ["ઝાંખી", "લાભ અને અરજીઓ", "દસ્તાવેજો અને ચકાસણી", "ફરિયાદ નોંધાવો", "મારી ફરિયાદો", "ચકાસણી કૉલ", "અપડેટ અને સૂચનાઓ", "અધિકારો અને હકદારી", "મારી પ્રોફાઇલ", "મદદ અને સહાય", "તારણો", "ફરિયાદો", "દસ્તાવેજો", "નોંધણી નવીકરણ", "સંસ્થાની પ્રોફાઇલ", "સાઇન આઉટ", "ડેશબોર્ડ", "સેવાઓ", "માહિતી", "ખાતું", "તમારું રાજ્ય પસંદ કરો", "તમારી ભાષા પસંદ કરો", "તમારી સંસ્થા પસંદ કરો", "સાઇન ઇન", "આગળ વધો", "પાછળ", "પગલાં જરૂરી", "અરજીની સ્થિતિ", "Setu માં આપનું સ્વાગત છે", "ઇમરજન્સી હેલ્પલાઇન", "ભાષા", "રાજ્ય", "સંસ્થા", "લાભાર્થી", "સંસ્થાના કર્મચારી", "શોધો", "અનુપાલન", "રેકોર્ડ", "સહાય", "સૂચનાઓ", "પ્રવૃત્તિ", "યોજનાઓ અને પાત્રતા", "નિવાસીઓ", "નયન વિશે જાણો"],
  ur: ["جائزہ", "فوائد اور درخواستیں", "دستاویزات اور تصدیق", "شکایت درج کریں", "میری شکایات", "تصدیقی کالز", "تازہ ترین اور نوٹس", "حقوق اور استحقاق", "میری پروفائل", "مدد اور تعاون", "مشاہدات", "شکایات", "دستاویزات", "رجسٹریشن کی تجدید", "ادارے کی پروفائل", "سائن آؤٹ", "ڈیش بورڈ", "خدمات", "معلومات", "اکاؤنٹ", "اپنی ریاست منتخب کریں", "اپنی زبان منتخب کریں", "اپنا ادارہ منتخب کریں", "سائن ان", "جاری رکھیں", "واپس", "کارروائی درکار", "درخواست کی صورتحال", "Setu میں خوش آمدید", "ہنگامی ہیلپ لائنز", "زبان", "ریاست", "ادارہ", "مستفید", "ادارے کا عملہ", "تلاش کریں", "تعمیل", "ریکارڈ", "تعاون", "نوٹس", "سرگرمی", "اسکیمیں اور اہلیت", "مکین", "نین کے بارے میں جانیں"],
  kn: ["ಅವಲೋಕನ", "ಪ್ರಯೋಜನಗಳು ಮತ್ತು ಅರ್ಜಿಗಳು", "ದಾಖಲೆಗಳು ಮತ್ತು ಪರಿಶೀಲನೆ", "ದೂರು ಸಲ್ಲಿಸಿ", "ನನ್ನ ದೂರುಗಳು", "ಪರಿಶೀಲನಾ ಕರೆಗಳು", "ನವೀಕರಣಗಳು ಮತ್ತು ಸೂಚನೆಗಳು", "ಹಕ್ಕುಗಳು ಮತ್ತು ಅರ್ಹತೆಗಳು", "ನನ್ನ ಪ್ರೊಫೈಲ್", "ಸಹಾಯ ಮತ್ತು ಬೆಂಬಲ", "ಪತ್ತೆಗಳು", "ದೂರುಗಳು", "ದಾಖಲೆಗಳು", "ನೋಂದಣಿ ನವೀಕರಣ", "ಸಂಸ್ಥೆಯ ಪ್ರೊಫೈಲ್", "ಸೈನ್ ಔಟ್", "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", "ಸೇವೆಗಳು", "ಮಾಹಿತಿ", "ಖಾತೆ", "ನಿಮ್ಮ ರಾಜ್ಯವನ್ನು ಆಯ್ಕೆಮಾಡಿ", "ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ", "ನಿಮ್ಮ ಸಂಸ್ಥೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ", "ಸೈನ್ ಇನ್", "ಮುಂದುವರಿಸಿ", "ಹಿಂದೆ", "ಕ್ರಮ ಅಗತ್ಯ", "ಅರ್ಜಿಯ ಸ್ಥಿತಿ", "Setuಗೆ ಸ್ವಾಗತ", "ತುರ್ತು ಸಹಾಯವಾಣಿಗಳು", "ಭಾಷೆ", "ರಾಜ್ಯ", "ಸಂಸ್ಥೆ", "ಫಲಾನುಭವಿ", "ಸಂಸ್ಥೆಯ ಸಿಬ್ಬಂದಿ", "ಹುಡುಕಿ", "ಅನುಸರಣೆ", "ದಾಖಲೆಗಳು", "ಬೆಂಬಲ", "ಸೂಚನೆಗಳು", "ಚಟುವಟಿಕೆ", "ಯೋಜನೆಗಳು ಮತ್ತು ಅರ್ಹತೆ", "ನಿವಾಸಿಗಳು", "ನಯನ್ ಬಗ್ಗೆ ತಿಳಿಯಿರಿ"],
  or: ["ସାରାଂଶ", "ସୁବିଧା ଓ ଆବେଦନ", "ଦଲିଲ ଓ ଯାଞ୍ଚ", "ଅଭିଯୋଗ କରନ୍ତୁ", "ମୋର ଅଭିଯୋଗ", "ଯାଞ୍ଚ କଲ୍", "ଅପଡେଟ୍ ଓ ବିଜ୍ଞପ୍ତି", "ଅଧିକାର ଓ ପ୍ରାପ୍ୟ", "ମୋ ପ୍ରୋଫାଇଲ୍", "ସାହାଯ୍ୟ ଓ ସହାୟତା", "ପର୍ଯ୍ୟବେକ୍ଷଣ", "ଅଭିଯୋଗ", "ଦଲିଲ", "ପଞ୍ଜୀକରଣ ନବୀକରଣ", "ଅନୁଷ୍ଠାନ ପ୍ରୋଫାଇଲ୍", "ସାଇନ୍ ଆଉଟ୍", "ଡ୍ୟାସବୋର୍ଡ", "ସେବା", "ସୂଚନା", "ଖାତା", "ଆପଣଙ୍କ ରାଜ୍ୟ ବାଛନ୍ତୁ", "ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ", "ଆପଣଙ୍କ ଅନୁଷ୍ଠାନ ବାଛନ୍ତୁ", "ସାଇନ୍ ଇନ୍", "ଆଗକୁ ବଢ଼ନ୍ତୁ", "ପଛକୁ", "ପଦକ୍ଷେପ ଆବଶ୍ୟକ", "ଆବେଦନ ସ୍ଥିତି", "Setuକୁ ସ୍ୱାଗତ", "ଜରୁରୀ ହେଲ୍ପଲାଇନ୍", "ଭାଷା", "ରାଜ୍ୟ", "ଅନୁଷ୍ଠାନ", "ହିତାଧିକାରୀ", "ଅନୁଷ୍ଠାନ କର୍ମଚାରୀ", "ଖୋଜନ୍ତୁ", "ଅନୁପାଳନ", "ରେକର୍ଡ", "ସହାୟତା", "ବିଜ୍ଞପ୍ତି", "କାର୍ଯ୍ୟକଳାପ", "ଯୋଜନା ଓ ଯୋଗ୍ୟତା", "ଆବାସିକ", "ନୟନ ବିଷୟରେ ଜାଣନ୍ତୁ"],
  ml: ["അവലോകനം", "ആനുകൂല്യങ്ങളും അപേക്ഷകളും", "രേഖകളും പരിശോധനയും", "പരാതി നൽകുക", "എന്റെ പരാതികൾ", "പരിശോധനാ കോളുകൾ", "അറിയിപ്പുകളും നോട്ടീസുകളും", "അവകാശങ്ങളും അർഹതകളും", "എന്റെ പ്രൊഫൈൽ", "സഹായവും പിന്തുണയും", "കണ്ടെത്തലുകൾ", "പരാതികൾ", "രേഖകൾ", "രജിസ്ട്രേഷൻ പുതുക്കൽ", "സ്ഥാപന പ്രൊഫൈൽ", "സൈൻ ഔട്ട്", "ഡാഷ്‌ബോർഡ്", "സേവനങ്ങൾ", "വിവരങ്ങൾ", "അക്കൗണ്ട്", "നിങ്ങളുടെ സംസ്ഥാനം തിരഞ്ഞെടുക്കുക", "നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക", "നിങ്ങളുടെ സ്ഥാപനം തിരഞ്ഞെടുക്കുക", "സൈൻ ഇൻ", "തുടരുക", "പിന്നോട്ട്", "നടപടി ആവശ്യമാണ്", "അപേക്ഷയുടെ നില", "Setu-ലേക്ക് സ്വാഗതം", "അടിയന്തര ഹെൽപ്‌ലൈനുകൾ", "ഭാഷ", "സംസ്ഥാനം", "സ്ഥാപനം", "ഗുണഭോക്താവ്", "സ്ഥാപന ജീവനക്കാർ", "തിരയുക", "പാലനം", "രേഖകൾ", "പിന്തുണ", "നോട്ടീസുകൾ", "പ്രവർത്തനങ്ങൾ", "പദ്ധതികളും യോഗ്യതയും", "താമസക്കാർ", "നയനെക്കുറിച്ച് അറിയുക"],
  pa: ["ਸੰਖੇਪ ਜਾਣਕਾਰੀ", "ਲਾਭ ਅਤੇ ਅਰਜ਼ੀਆਂ", "ਦਸਤਾਵੇਜ਼ ਅਤੇ ਤਸਦੀਕ", "ਸ਼ਿਕਾਇਤ ਦਰਜ ਕਰੋ", "ਮੇਰੀਆਂ ਸ਼ਿਕਾਇਤਾਂ", "ਤਸਦੀਕ ਕਾਲਾਂ", "ਅੱਪਡੇਟ ਅਤੇ ਨੋਟਿਸ", "ਅਧਿਕਾਰ ਅਤੇ ਹੱਕ", "ਮੇਰੀ ਪ੍ਰੋਫਾਈਲ", "ਮਦਦ ਅਤੇ ਸਹਾਇਤਾ", "ਨਿਰੀਖਣ", "ਸ਼ਿਕਾਇਤਾਂ", "ਦਸਤਾਵੇਜ਼", "ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਨਵੀਨੀਕਰਨ", "ਸੰਸਥਾ ਪ੍ਰੋਫਾਈਲ", "ਸਾਈਨ ਆਊਟ", "ਡੈਸ਼ਬੋਰਡ", "ਸੇਵਾਵਾਂ", "ਜਾਣਕਾਰੀ", "ਖਾਤਾ", "ਆਪਣਾ ਰਾਜ ਚੁਣੋ", "ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ", "ਆਪਣੀ ਸੰਸਥਾ ਚੁਣੋ", "ਸਾਈਨ ਇਨ", "ਜਾਰੀ ਰੱਖੋ", "ਪਿੱਛੇ", "ਕਾਰਵਾਈ ਲੋੜੀਂਦੀ", "ਅਰਜ਼ੀ ਦੀ ਸਥਿਤੀ", "Setu ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ", "ਐਮਰਜੈਂਸੀ ਹੈਲਪਲਾਈਨਾਂ", "ਭਾਸ਼ਾ", "ਰਾਜ", "ਸੰਸਥਾ", "ਲਾਭਪਾਤਰੀ", "ਸੰਸਥਾ ਸਟਾਫ਼", "ਖੋਜੋ", "ਪਾਲਣਾ", "ਰਿਕਾਰਡ", "ਸਹਾਇਤਾ", "ਨੋਟਿਸ", "ਗਤੀਵਿਧੀ", "ਯੋਜਨਾਵਾਂ ਅਤੇ ਯੋਗਤਾ", "ਨਿਵਾਸੀ", "ਨਯਨ ਬਾਰੇ ਜਾਣੋ"],
  as: ["অৱলোকন", "সুবিধা আৰু আবেদন", "নথি আৰু পৰীক্ষণ", "অভিযোগ দাখিল কৰক", "মোৰ অভিযোগসমূহ", "পৰীক্ষণ কল", "আপডেট আৰু জাননী", "অধিকাৰ আৰু প্ৰাপ্য", "মোৰ প্ৰফাইল", "সহায় আৰু সমৰ্থন", "পৰ্যবেক্ষণ", "অভিযোগসমূহ", "নথি", "পঞ্জীয়ন নবীকৰণ", "প্ৰতিষ্ঠানৰ প্ৰফাইল", "ছাইন আউট", "ডেশ্বব'ৰ্ড", "সেৱা", "তথ্য", "একাউণ্ট", "আপোনাৰ ৰাজ্য বাছক", "আপোনাৰ ভাষা বাছক", "আপোনাৰ প্ৰতিষ্ঠান বাছক", "ছাইন ইন", "আগবাঢ়ক", "উভতি যাওক", "পদক্ষেপ প্ৰয়োজন", "আবেদনৰ স্থিতি", "Setuলৈ স্বাগতম", "জৰুৰীকালীন হেল্পলাইন", "ভাষা", "ৰাজ্য", "প্ৰতিষ্ঠান", "হিতাধিকাৰী", "প্ৰতিষ্ঠানৰ কৰ্মচাৰী", "সন্ধান কৰক", "অনুপালন", "ৰেকৰ্ড", "সমৰ্থন", "জাননী", "কাৰ্যকলাপ", "আঁচনি আৰু যোগ্যতা", "আৱাসী", "নয়নৰ বিষয়ে জানক"],
  ne: ["सिंहावलोकन", "सुविधा र आवेदनहरू", "कागजात र प्रमाणीकरण", "गुनासो दर्ता गर्नुहोस्", "मेरा गुनासाहरू", "प्रमाणीकरण कलहरू", "अद्यावधिक र सूचनाहरू", "अधिकार र हकहरू", "मेरो प्रोफाइल", "मद्दत र सहयोग", "निष्कर्षहरू", "गुनासाहरू", "कागजातहरू", "दर्ता नवीकरण", "संस्थाको प्रोफाइल", "साइन आउट", "ड्यासबोर्ड", "सेवाहरू", "जानकारी", "खाता", "आफ्नो राज्य छान्नुहोस्", "आफ्नो भाषा छान्नुहोस्", "आफ्नो संस्था छान्नुहोस्", "साइन इन", "जारी राख्नुहोस्", "पछाडि", "कारबाही आवश्यक", "आवेदनको स्थिति", "Setu मा स्वागत छ", "आपतकालीन हेल्पलाइन", "भाषा", "राज्य", "संस्था", "लाभार्थी", "संस्थाका कर्मचारी", "खोज्नुहोस्", "अनुपालन", "अभिलेख", "सहयोग", "सूचनाहरू", "गतिविधि", "योजना र योग्यता", "बासिन्दाहरू", "नयनबारे जान्नुहोस्"],
};
const UI_DICT = Object.fromEntries(Object.entries(UI_ROWS).map(([code, row]) => [code, Object.fromEntries(UI_KEYS.map((k, i) => [k, row[i]]))]));
/** "full" = every screen · "menus" = navigation + titles · "saved" = English for now */
const coverage = (code) => (code === "en" || code === "hi" ? "full" : UI_DICT[code] ? "menus" : "saved");

const LangContext = createContext(null);
const PREFS_KEY = "setu.prefs";
// Default: English with Hindi beneath every menu item and heading ("English + हिन्दी").
const DEFAULT_PREFS = { state: null, language: "hi", instituteId: null, instituteName: null, instituteManual: false, order: "en", onboarded: false };

/**
 * Language choices as people see them. Two come first:
 *   "bi" — English + हिन्दी: English leads, Hindi in small type beneath (default)
 *   "en" — English only
 * then every scheduled language ("hi" = Hindi first).
 */
const LANG_CHOICES_TOP = [
  { code: "bi", name: "English + Hindi", native: "English + हिन्दी", script: "latin", note: ["Default · Hindi shown beneath English", "डिफ़ॉल्ट · अंग्रेज़ी के नीचे हिंदी"] },
  { code: "en", name: "English only", native: "English only", script: "latin", note: ["No second language", "केवल अंग्रेज़ी"] },
];
const LANG_CHOICES = [...LANG_CHOICES_TOP, ...LANGUAGES.filter((l) => l.code !== "en")];
const choiceOf = (p) => (!p?.language ? "bi" : p.language === "hi" && p.order !== "local" ? "bi" : p.language);
function prefsForChoice(code, prevOrder) {
  if (code === "bi") return { language: "hi", order: "en" };
  if (code === "en") return { language: "en", order: "en" };
  if (code === "hi") return { language: "hi", order: "local" };
  return { language: code, order: prevOrder === "local" ? "local" : "en" };
}
const choiceLabel = (code) => (code === "bi" ? "English + हिन्दी" : code === "en" ? "English only" : `${langOf(code).native} · ${langOf(code).name}`);

function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    // Carry over the language chosen in earlier versions of Setu.
    const old = localStorage.getItem("setu.lang");
    if (!saved.language && old === "hi") return { ...DEFAULT_PREFS, ...saved, language: "hi", order: "local" };
    return { ...DEFAULT_PREFS, ...saved };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function loadScriptFont(code) {
  const L = langOf(code);
  const f = SCRIPT_FONT[L.script];
  if (!f || typeof document === "undefined") return null;
  const id = `st-font-${L.script}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${f[0]}:wght@400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
  return f[1];
}

function LangProvider({ children }) {
  const [prefs, setPrefsState] = useState(readPrefs);
  const setPrefs = useCallback((patch) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* private window: lasts for this tab */
      }
      return next;
    });
  }, []);

  // Sign-out clears the saved choices; start again from blank.
  useEffect(() => {
    const onReset = () => setPrefsState({ ...DEFAULT_PREFS });
    window.addEventListener("setu:reset", onReset);
    return () => window.removeEventListener("setu:reset", onReset);
  }, []);

  const ui = prefs.language || "en";
  const localFirst = prefs.order === "local" && ui !== "en";
  useEffect(() => {
    const family = loadScriptFont(ui);
    const root = document.documentElement;
    root.style.setProperty("--st-loc-font", family ? `'${family}'` : "inherit");
    root.lang = localFirst ? ui : "en";
  }, [ui, localFirst]);

  const value = useMemo(() => {
    const dict = UI_DICT[ui];
    const L = langOf(ui);
    // `lang` keeps the simple "en" | "hi" meaning used across the pages.
    const lang = ui === "hi" && localFirst ? "hi" : "en";
    const local = (en, hi) => (ui === "hi" ? hi : dict?.[en]) || null;
    const tx = (en, hi) => (localFirst ? local(en, hi) || en : en);
    /** Both lines for a label: { main, sub, mainLocal, subLocal } */
    const bi = (en, hi) => {
      const loc = ui === "en" ? null : local(en, hi);
      if (!loc) return { main: en, sub: null, mainLocal: false, subLocal: false };
      return localFirst ? { main: loc, sub: en, mainLocal: true, subLocal: false } : { main: en, sub: loc, mainLocal: false, subLocal: true };
    };
    return {
      lang,
      ui,
      uiMeta: L,
      localFirst,
      prefs,
      setPrefs,
      tx,
      bi,
      setLang: (code) => setPrefs(code === "en" ? { order: "en" } : { order: "local" }),
      setOrder: (order) => setPrefs({ order }),
      locClass: ui === "hi" ? "st-hi" : "st-loc",
      dir: L.rtl ? "rtl" : undefined,
    };
  }, [ui, localFirst, prefs, setPrefs]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
const useLang = () => useContext(LangContext);

/** A bilingual label: the leading language, and the other one beneath it. */
function Tx({ en, hi, inline = false, className = "", subClassName = "" }) {
  const { bi, locClass, dir } = useLang();
  const { main, sub, mainLocal, subLocal } = bi(en, hi);
  const cls = (isLocal) => (isLocal ? locClass : "");
  const d = (isLocal) => (isLocal ? dir : undefined);
  if (inline)
    return (
      <span className={className}>
        <span className={cls(mainLocal)} dir={d(mainLocal)}>{main}</span>
        {sub && (
          <span className={`st-sub ${cls(subLocal)} ${subClassName}`} dir={d(subLocal)}>
            {" · "}
            {sub}
          </span>
        )}
      </span>
    );
  return (
    <span className={`block ${className}`}>
      <span className={`block ${cls(mainLocal)}`} dir={d(mainLocal)}>{main}</span>
      {sub && (
        <span className={`st-sub block ${cls(subLocal)} ${subClassName}`} dir={d(subLocal)}>
          {sub}
        </span>
      )}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §2  GEOGRAPHY
   ══════════════════════════════════════════════════════════════════════════ */

/** Every State and Union Territory: [name, Hindi, suggested language, kind] */
const STATES = [
  ["Andhra Pradesh", "आंध्र प्रदेश", "te", "state"],
  ["Arunachal Pradesh", "अरुणाचल प्रदेश", "en", "state"],
  ["Assam", "असम", "as", "state"],
  ["Bihar", "बिहार", "hi", "state"],
  ["Chhattisgarh", "छत्तीसगढ़", "hi", "state"],
  ["Goa", "गोवा", "kok", "state"],
  ["Gujarat", "गुजरात", "gu", "state"],
  ["Haryana", "हरियाणा", "hi", "state"],
  ["Himachal Pradesh", "हिमाचल प्रदेश", "hi", "state"],
  ["Jharkhand", "झारखंड", "hi", "state"],
  ["Karnataka", "कर्नाटक", "kn", "state"],
  ["Kerala", "केरल", "ml", "state"],
  ["Madhya Pradesh", "मध्य प्रदेश", "hi", "state"],
  ["Maharashtra", "महाराष्ट्र", "mr", "state"],
  ["Manipur", "मणिपुर", "mni", "state"],
  ["Meghalaya", "मेघालय", "en", "state"],
  ["Mizoram", "मिज़ोरम", "en", "state"],
  ["Nagaland", "नागालैंड", "en", "state"],
  ["Odisha", "ओडिशा", "or", "state"],
  ["Punjab", "पंजाब", "pa", "state"],
  ["Rajasthan", "राजस्थान", "hi", "state"],
  ["Sikkim", "सिक्किम", "ne", "state"],
  ["Tamil Nadu", "तमिलनाडु", "ta", "state"],
  ["Telangana", "तेलंगाना", "te", "state"],
  ["Tripura", "त्रिपुरा", "bn", "state"],
  ["Uttar Pradesh", "उत्तर प्रदेश", "hi", "state"],
  ["Uttarakhand", "उत्तराखंड", "hi", "state"],
  ["West Bengal", "पश्चिम बंगाल", "bn", "state"],
  ["Andaman and Nicobar Islands", "अंडमान और निकोबार द्वीपसमूह", "hi", "ut"],
  ["Chandigarh", "चंडीगढ़", "hi", "ut"],
  ["Dadra and Nagar Haveli and Daman and Diu", "दादरा और नगर हवेली और दमन और दीव", "gu", "ut"],
  ["Delhi", "दिल्ली", "hi", "ut"],
  ["Jammu and Kashmir", "जम्मू और कश्मीर", "ur", "ut"],
  ["Ladakh", "लद्दाख", "hi", "ut"],
  ["Lakshadweep", "लक्षद्वीप", "ml", "ut"],
  ["Puducherry", "पुडुचेरी", "ta", "ut"],
].map(([name, hi, suggest, kind]) => ({ name, hi, suggest, kind }));
const stateOf = (name) => STATES.find((s) => s.name === name) || null;

/* ══════════════════════════════════════════════════════════════════════════
   §3  VOCABULARY
   ══════════════════════════════════════════════════════════════════════════ */

const ROLES = { ADMIN: "admin", OFFICIAL: "official", INSPECTOR: "inspector", STAFF: "institute_staff", BENEFICIARY: "beneficiary" };
const SETU_ROLES = [ROLES.STAFF, ROLES.BENEFICIARY];

const INSTITUTE_TYPE = {
  shelter: ["Shelter home", "आश्रय गृह"],
  hostel: ["Hostel", "छात्रावास"],
  school: ["School", "विद्यालय"],
  old_age_home: ["Old age home", "वृद्धाश्रम"],
  rehab_centre: ["Rehabilitation centre", "पुनर्वास केंद्र"],
};

const STATUS = {
  green: { en: "Compliant", hi: "अनुपालन में", tone: "good" },
  yellow: { en: "Needs attention", hi: "ध्यान आवश्यक", tone: "watch" },
  red: { en: "Flagged", hi: "चिह्नित", tone: "flag" },
};

const RENEWAL = {
  pending: { en: "Under review", hi: "समीक्षाधीन", tone: "watch", step: 2 },
  approved: { en: "Approved", hi: "स्वीकृत", tone: "good", step: 3 },
  rejected: { en: "Not approved", hi: "अस्वीकृत", tone: "flag", step: 3 },
  not_applied: { en: "Not applied", hi: "आवेदन नहीं", tone: "neutral", step: 0 },
};

const GRIEVANCE_STATUS = {
  open: { en: "Submitted", hi: "दर्ज", tone: "watch", step: 1 },
  in_review: { en: "Being looked into", hi: "जाँच जारी", tone: "info", step: 2 },
  resolved: { en: "Resolved", hi: "हल हो गई", tone: "good", step: 3 },
};

const FINDING_TYPE = {
  anomaly: ["Unusual pattern in records", "रिकॉर्ड में असामान्य पैटर्न"],
  cctv_tamper: ["Camera feed looked tampered", "कैमरा फ़ीड में छेड़छाड़"],
  camera_offline: ["Camera offline", "कैमरा बंद"],
  vc_miss: ["Missed verification call", "सत्यापन कॉल छूटी"],
  hash_mismatch: ["Evidence didn't verify", "साक्ष्य सत्यापित नहीं हुआ"],
  geofence_breach: ["Inspection location mismatch", "निरीक्षण स्थान में अंतर"],
  attendance_spike: ["Attendance didn't add up", "उपस्थिति में अंतर"],
};
const findingType = (t) => FINDING_TYPE[t] || [String(t || "Finding").replace(/_/g, " "), "निष्कर्ष"];

/** What a grievance can be about — picked by tapping, not typing. */
const COMPLAINT_CATEGORIES = [
  { key: "food", en: "Food & meals", hi: "भोजन", icon: "food" },
  { key: "water", en: "Water & hygiene", hi: "पानी व स्वच्छता", icon: "water" },
  { key: "safety", en: "Safety", hi: "सुरक्षा", icon: "shield" },
  { key: "health", en: "Health & medicine", hi: "स्वास्थ्य व दवा", icon: "health" },
  { key: "staff", en: "Staff behaviour", hi: "कर्मचारियों का व्यवहार", icon: "user" },
  { key: "education", en: "Education & scholarship", hi: "शिक्षा व छात्रवृत्ति", icon: "book" },
  { key: "facilities", en: "Rooms & facilities", hi: "कमरे व सुविधाएँ", icon: "building" },
  { key: "benefits", en: "Benefit or payment", hi: "लाभ या भुगतान", icon: "rupee" },
  { key: "other", en: "Something else", hi: "कुछ और", icon: "chat" },
];

/** Real national helplines. */
const HELPLINES = [
  { number: "112", en: "Emergency (Police · Fire · Ambulance)", hi: "आपातकाल (पुलिस · अग्निशमन · एम्बुलेंस)", tone: "flag" },
  { number: "1098", en: "Childline — for children in need", hi: "चाइल्डलाइन — बच्चों के लिए", tone: "watch" },
  { number: "181", en: "Women Helpline", hi: "महिला हेल्पलाइन", tone: "watch" },
  { number: "14567", en: "Elderline — for senior citizens", hi: "एल्डरलाइन — वरिष्ठ नागरिकों के लिए", tone: "info" },
];

function parseDate(v) {
  if (!v) return null;
  const s = String(v);
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatDate(v, lang = "en") {
  const d = parseDate(v);
  return d ? d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
function formatDateTime(v, lang = "en") {
  const d = parseDate(v);
  return d ? d.toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
}
function relTime(v, lang = "en") {
  const d = parseDate(v);
  if (!d) return "";
  const s = (Date.now() - d.getTime()) / 1000;
  const hi = lang === "hi";
  if (s < 0) return formatDate(v, lang);
  if (s < 60) return hi ? "अभी" : "just now";
  if (s < 3600) return hi ? `${Math.floor(s / 60)} मिनट पहले` : `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return hi ? `${Math.floor(s / 3600)} घंटे पहले` : `${Math.floor(s / 3600)} hrs ago`;
  if (s < 86400 * 30) return hi ? `${Math.floor(s / 86400)} दिन पहले` : `${Math.floor(s / 86400)} days ago`;
  return formatDate(v, lang);
}
const num = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};
const initials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

/**
 * Sensitive numbers are never shown in full — only the last four digits:
 *   Aadhaar  XXXX XXXX 1234 · bank account  •••• 1234 · phone  •••••• 3210
 * Whatever the server sends (full, spaced, already masked), the output is the same.
 */
const lastDigits = (v, n = 4) => String(v ?? "").replace(/\D/g, "").slice(-n);
const maskAadhaar = (v) => (lastDigits(v) ? `XXXX XXXX ${lastDigits(v)}` : null);
const maskAccount = (v) => (lastDigits(v) ? `•••• ${lastDigits(v)}` : null);
const maskPhone = (v) => (lastDigits(v) ? `•••••• ${lastDigits(v)}` : null);
/** 125 -> "2:05" (countdowns). */
const formatClock = (secs) => `${Math.floor(secs / 60)}:${String(Math.max(0, secs) % 60).padStart(2, "0")}`;

/* ══════════════════════════════════════════════════════════════════════════
   §4  API CONTRACT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The same backend Sentinel uses. Tags, as in Sentinel:
 *   CONFIRMED  pinned by a backend test (tests/test_auth_rbac.py,
 *              tests/test_setu_sentinel_endpoints.py)
 *   DERIVED    column names from the migrations; not pinned by a test
 *   ASSUMED    Setu would like this; every caller degrades gracefully on 404
 *   AGREED     the security contract (sessions, 2-step, password), being
 *              built on the backend now; the Security page says "available
 *              when connected to the server" until a route answers
 */
const API = {
  auth: {
    /** CONFIRMED — POST {email, password} -> TokenResponse:
     *  {access_token, expires_in, idle_timeout, session_id, role, name, user_id,
     *   institute_id?, mfa_enabled, last_login_at, last_login_ip}
     *  AGREED — or {mfa_required: true, mfa_token, expires_in} when 2-step is on.
     *  401 wrong email/password · 423 locked (Retry-After) · 429 rate limit · 403 disabled */
    login: () => "/auth/login",
    /** AGREED — POST {mfa_token, code} -> TokenResponse. code = 6-digit TOTP or
     *  a single-use recovery code (XXXX-XXXX). 401 "Invalid code." / timed out. */
    mfaVerify: () => "/auth/mfa/verify",
    /** AGREED — POST (no body) -> TokenResponse with a new access_token. */
    refresh: () => "/auth/refresh",
    /** AGREED — POST -> {ok}. Revokes this session (best effort on sign-out). */
    logout: () => "/auth/logout",
    /** AGREED — GET -> the account, plus mfa_enabled, last_login_at,
     *  last_login_ip, password_changed_at, session_expires_at */
    me: () => "/auth/me",
    /** AGREED — GET -> [{id, created_at, last_seen_at, expires_at, ip, device, current}] */
    sessions: () => "/auth/sessions",
    /** AGREED — DELETE -> {ok}: sign out that device. */
    session: (id) => `/auth/sessions/${encodeURIComponent(id)}`,
    /** AGREED — POST -> {revoked: n}: sign out every other device. */
    logoutOthers: () => "/auth/logout-others",
    /** AGREED — POST {current_password, new_password} -> {ok, revoked_other_sessions}.
     *  400 policy sentence · 401 "Current password is incorrect." */
    changePassword: () => "/auth/change-password",
    /** AGREED — POST {password} -> {secret, otpauth_uri}. 401 "Incorrect password." */
    mfaSetup: () => "/auth/mfa/setup",
    /** AGREED — POST {code} -> {enabled: true, recovery_codes: [10]}. 400 "Invalid code." */
    mfaEnable: () => "/auth/mfa/enable",
    /** AGREED — POST {password, code} -> {enabled: false} */
    mfaDisable: () => "/auth/mfa/disable",
  },
  institutes: {
    /** DERIVED — GET -> Institute (staff: only their own; 403 otherwise) */
    detail: (id) => `/institutes/${id}`,
    /** CONFIRMED — GET -> Alert[] for that institute; 403 if a staff user asks
     *  for an institute that isn't theirs. Setu calls these "findings". */
    alerts: (id) => `/institutes/${id}/alerts`,
    /** CONFIRMED — POST multipart {file, description?} -> 201 {..., description}
     *  ASSUMED   — GET -> Document[] (the list); Setu shows uploads from this
     *              session if the list route doesn't exist. */
    documents: (id) => `/institutes/${id}/documents`,
    /** ASSUMED — GET (staff) -> the institute's residents, one summary each:
     *  {user_id, beneficiary_id, name, age, gender, category, admitted_on, room,
     *   schemes: [{key, name, status, amount, period, action, disbursements}],
     *   documents: [{key, name, status}], grievances_open, last_call, next_checkup}
     *  Private grievances are only ever counted, never listed. */
    residents: (id) => `/institutes/${id}/residents`,
  },
  grievances: {
    /** CONFIRMED — GET -> Grievance[]; institute staff see only their own
     *  institute's. (Beneficiaries: ASSUMED to see the ones they raised.) */
    list: () => "/grievances",
    /** CONFIRMED — POST {institute_id, subject, description} -> 201; 403 for a
     *  different institute. Setu also sends category / urgency / confidential
     *  (ASSUMED extra fields — ignored by a server that doesn't know them). */
    create: () => "/grievances",
  },
  findings: {
    /** ASSUMED — POST {message} -> 201 Response. Until it exists, Setu files the
     *  response as a document with a description (CONFIRMED route). */
    respond: (alertId) => `/alerts/${alertId}/responses`,
  },
  calls: {
    /** ASSUMED — GET -> VcCall[] for the signed-in beneficiary (vc_calls table,
     *  initial migration): {id, scheduled_at, status, outcome, official_name} */
    mine: () => "/vc/calls/me",
    /** ASSUMED — POST {preferred_time, note} -> 201: ask the Department to call. */
    request: () => "/vc/calls/requests",
  },
  notices: {
    /** ASSUMED — GET -> Notice[] {id, title, body, audience, created_at} */
    list: () => "/notices",
  },
  directory: {
    /** ASSUMED — GET, no sign-in needed -> [{id, name, district, state, type}]
     *  The public list of registered institutes, used by the start flow so a
     *  beneficiary can pick theirs. Query: ?state=<State name>&q=<text>.
     *  If the route doesn't exist yet, the start flow lets them type the name. */
    institutes: () => "/public/institutes",
  },
  schemes: {
    /** ASSUMED — GET, no sign-in needed -> the scheme catalogue:
     *  [{key, name, hi, amount, period, audience: [tags], about, documents: [names]}] */
    catalog: () => "/schemes",
    /** ASSUMED — POST {scheme_key} -> 201 Application (status "pending").
     *  The beneficiary asks to be enrolled; the institute office completes it. */
    request: () => "/beneficiaries/me/scheme-requests",
  },
  assistant: {
    /** ASSUMED — GET -> {llm: bool, bhashini: bool}. Missing = Yukt answers
     *  with its local engines (always available). Same routes as Sentinel. */
    status: () => "/assistant/status",
    /** ASSUMED — POST {app: "setu", message, lang, history, page, role,
     *  doc_ids, context} -> {reply, items?, actions?, sources?}. The server
     *  holds the AI key and answers only from `context` + its knowledge base.
     *  actions: navigate{to} · raise_grievance{subject, description, category,
     *  urgency} · request_call{preferred_time} · request_scheme{scheme_key} ·
     *  set_language{code} · open_statement · open_feature{doc_id} — Setu
     *  always asks the person to confirm before any of them runs. */
    chat: () => "/assistant/chat",
    /** ASSUMED — Bhashini: POST {text, source, target} -> {text} */
    translate: () => "/assistant/translate",
    /** ASSUMED — Bhashini: POST {text, lang} -> {audio_base64, mime} */
    tts: () => "/assistant/tts",
    /** ASSUMED — Bhashini: POST {audio_base64, lang, sample_rate} -> {text} */
    asr: () => "/assistant/asr",
  },
  beneficiary: {
    /** ASSUMED — GET -> the signed-in beneficiary's own record:
     *  {beneficiary_id, name, institute_id, institute_name, admitted_on, room,
     *   guardian, category, schemes: [{name, status, amount, next_date}],
     *   health: {last_checkup, next_checkup, notes},
     *   documents: [{name, status}]}
     *  Until it exists, "My status" builds what it can from the institute,
     *  complaints and calls (all routes above). */
    me: () => "/beneficiaries/me",
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   §5  MOCK DATA
   ══════════════════════════════════════════════════════════════════════════ */

const MOCK_NOW = Date.now();
const DAY = 86400000;
const hoursAgo = (h) => new Date(MOCK_NOW - h * 3600_000).toISOString().replace("Z", "");
const daysAgo = (d) => hoursAgo(d * 24);
const isoAt = (ms) => new Date(ms).toISOString().replace("Z", "");

/** Small seeded generator, so the demo looks the same on every load. */
function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 7;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s % 100000) / 100000;
  };
}
const pickFrom = (r, arr) => arr[Math.floor(r() * arr.length)];
const hashStr = (str) => [...String(str)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17);

const SENTINEL_INSTITUTES = [
  { id: "3f6c1a20-8e41-4b17-9d02-5a7cbe91d411", name: "Ashray Balika Grih, Aishbagh", type: "shelter", district: "Lucknow", state: "Uttar Pradesh", compliance_score: "58.40", status: "red", renewal_status: "pending", latitude: 26.8385, longitude: 80.9006 },
  { id: "7b2d9e54-1c88-49a3-8f60-2ed4417ba903", name: "Nav Jeevan Balgruh, Gomti Nagar", type: "shelter", district: "Lucknow", state: "Uttar Pradesh", compliance_score: "71.20", status: "yellow", renewal_status: "pending", latitude: 26.8512, longitude: 81.0064 },
  { id: "c41a7f38-5b02-4d9e-a716-90f3c28e6d55", name: "Sarvodaya Vidyalaya Hostel, Kanpur", type: "hostel", district: "Kanpur Nagar", state: "Uttar Pradesh", compliance_score: "88.60", status: "green", renewal_status: "approved", latitude: 26.4499, longitude: 80.3319 },
  { id: "e8903b71-4a6f-4c25-b83d-1f7e50c9a264", name: "Matru Chhaya Vridhashram, Varanasi", type: "old_age_home", district: "Varanasi", state: "Uttar Pradesh", compliance_score: "93.10", status: "green", renewal_status: "approved", latitude: 25.3176, longitude: 82.9739 },
  { id: "a15d6c93-2e78-4f10-9b44-6c8a3de71f02", name: "Disha Punarvas Kendra, Prayagraj", type: "rehab_centre", district: "Prayagraj", state: "Uttar Pradesh", compliance_score: "64.90", status: "yellow", renewal_status: "rejected", latitude: 25.4358, longitude: 81.8463 },
  { id: "d72f4e18-9b35-4a6c-8e21-5470ac93b6df", name: "Shanti Niketan Balika Chhatravas, Agra", type: "hostel", district: "Agra", state: "Uttar Pradesh", compliance_score: "81.75", status: "green", renewal_status: "approved", latitude: 27.1767, longitude: 78.0081 },
  { id: "b6e0937a-c142-4d58-91af-3e85d206c7b4", name: "Samarth Divyang Chhatravas, Gorakhpur", type: "hostel", district: "Gorakhpur", state: "Uttar Pradesh", compliance_score: "76.30", status: "yellow", renewal_status: "approved", latitude: 26.7606, longitude: 83.3732 },
  { id: "f4c82d15-6039-4e7b-a2c8-71bd94e3f0aa", name: "Anand Ashram Vridhashram, Meerut", type: "old_age_home", district: "Meerut", state: "Uttar Pradesh", compliance_score: "90.20", status: "green", renewal_status: "approved", latitude: 28.9845, longitude: 77.7064 },
  { id: "8c1e2f30-4a55-4b6c-9d7e-1f2a3b4c5d61", name: "Snehalaya Balgruha, Hadapsar", type: "shelter", district: "Pune", state: "Maharashtra", compliance_score: "74.60", status: "yellow", renewal_status: "pending", latitude: 18.5089, longitude: 73.926 },
  { id: "9d2f3a41-5b66-4c7d-8e8f-2a3b4c5d6e72", name: "Aadhar Vriddhashram, Nagpur", type: "old_age_home", district: "Nagpur", state: "Maharashtra", compliance_score: "87.20", status: "green", renewal_status: "approved", latitude: 21.1458, longitude: 79.0882 },
  { id: "ae3a4b52-6c77-4d8e-9f90-3b4c5d6e7f83", name: "Asha Kiran Chhatravas, Patna", type: "hostel", district: "Patna", state: "Bihar", compliance_score: "61.30", status: "red", renewal_status: "pending", latitude: 25.5941, longitude: 85.1376 },
];

/**
 * Setu uses the same institutes as Sentinel (same ids), so a record raised in
 * one is the same record in the other. States without a Sentinel institute
 * get invented register entries so every State has something to pick.
 */
const MOCK_INSTITUTE_ID = SENTINEL_INSTITUTES[0].id;
const MOCK_INSTITUTE = {
  ...SENTINEL_INSTITUTES[0],
  address: "Aishbagh Road, Lucknow 226004",
  capacity: 80,
  residents: 64,
  registration_no: "UP/LKO/SH/2019/0142",
  registration_valid_until: "2026-12-31",
  last_inspection_at: daysAgo(2),
  score_history: [66.2, 64.8, 63.1, 61.0, 60.2, 58.4],
  superintendent: "Sunita Rao",
};

/* ---------------------------------------------------- the register ---- */
const DIRECTORY_DISTRICTS = {
  "Andhra Pradesh": ["Visakhapatnam", "Guntur"], "Arunachal Pradesh": ["Itanagar", "Pasighat"], Assam: ["Guwahati", "Dibrugarh"],
  Chhattisgarh: ["Raipur", "Bilaspur"], Goa: ["Panaji", "Margao"], Gujarat: ["Ahmedabad", "Vadodara"],
  Haryana: ["Rohtak", "Hisar"], "Himachal Pradesh": ["Shimla", "Mandi"], Jharkhand: ["Ranchi", "Dhanbad"], Karnataka: ["Bengaluru", "Mysuru"],
  Kerala: ["Thiruvananthapuram", "Kozhikode"], "Madhya Pradesh": ["Bhopal", "Indore"], Manipur: ["Imphal", "Churachandpur"],
  Meghalaya: ["Shillong", "Tura"], Mizoram: ["Aizawl", "Lunglei"], Nagaland: ["Kohima", "Dimapur"], Odisha: ["Bhubaneswar", "Cuttack"],
  Punjab: ["Ludhiana", "Amritsar"], Rajasthan: ["Jaipur", "Jodhpur"], Sikkim: ["Gangtok", "Namchi"], "Tamil Nadu": ["Chennai", "Madurai"],
  Telangana: ["Hyderabad", "Warangal"], Tripura: ["Agartala", "Udaipur"], Uttarakhand: ["Dehradun", "Haldwani"],
  "West Bengal": ["Kolkata", "Siliguri"], "Andaman and Nicobar Islands": ["Port Blair"], Chandigarh: ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Silvassa", "Daman"], Delhi: ["New Delhi", "North Delhi"], "Jammu and Kashmir": ["Srinagar", "Jammu"],
  Ladakh: ["Leh"], Lakshadweep: ["Kavaratti"], Puducherry: ["Puducherry", "Karaikal"],
};
const DIRECTORY_TEMPLATES = [
  ["shelter", (d) => `Government Children's Home (Girls), ${d}`],
  ["hostel", (d) => `Post-Matric Hostel for SC Students, ${d}`],
  ["old_age_home", (d) => `Government Senior Citizens' Home, ${d}`],
  ["rehab_centre", (d) => `Integrated Rehabilitation Centre for Addicts, ${d}`],
  ["shelter", (d) => `Government Children's Home (Boys), ${d}`],
];
const MOCK_DIRECTORY = (() => {
  const out = SENTINEL_INSTITUTES.map(({ id, name, district, state, type }) => ({ id, name, district, state, type, sentinel: true }));
  let n = 1;
  Object.entries(DIRECTORY_DISTRICTS).forEach(([state, districts]) => {
    districts.forEach((d, di) => {
      const picks = districts.length === 1 ? [0, 1, 2] : di === 0 ? [0, 1, 2] : [3, 4];
      picks.forEach((t) => {
        const [type, name] = DIRECTORY_TEMPLATES[t];
        out.push({ id: `dir-${String(n++).padStart(4, "0")}`, name: name(d), district: d, state, type });
      });
    });
  });
  return out;
})();
const directoryByName = (name) => MOCK_DIRECTORY.find((i) => i.name === name);

/** Full record for any register entry — invented, but stable per institute. */
function instituteDetail(entry) {
  if (entry.id === MOCK_INSTITUTE_ID) return { ...MOCK_INSTITUTE };
  const r = seeded(hashStr(entry.id));
  const known = SENTINEL_INSTITUTES.find((x) => x.id === entry.id);
  const score = known ? Number(known.compliance_score) : 55 + Math.round(r() * 400) / 10;
  const capacity = [40, 50, 60, 75, 100][Math.floor(r() * 5)];
  const history = Array.from({ length: 6 }, (_, i) => Math.round((score - 6 + i * 1.2 + r() * 3) * 10) / 10);
  history[5] = score;
  return {
    ...entry,
    address: `${entry.district}, ${entry.state}`,
    capacity,
    residents: Math.round(capacity * (0.6 + r() * 0.35)),
    registration_no: `${entry.state.slice(0, 2).toUpperCase()}/${entry.district.slice(0, 3).toUpperCase()}/${entry.type.slice(0, 2).toUpperCase()}/20${18 + Math.floor(r() * 6)}/${String(100 + Math.floor(r() * 800)).padStart(4, "0")}`,
    registration_valid_until: isoAt(MOCK_NOW + (120 + Math.floor(r() * 500)) * DAY).slice(0, 10),
    compliance_score: score.toFixed(2),
    status: known ? known.status : score >= 80 ? "green" : score >= 65 ? "yellow" : "red",
    renewal_status: known ? known.renewal_status : r() > 0.7 ? "pending" : "approved",
    last_inspection_at: daysAgo(3 + Math.floor(r() * 40)),
    score_history: history,
  };
}

/* ------------------------------------------------- schemes & documents -- */
/**
 * The schemes a resident of a welfare institute is commonly enrolled in.
 * `audience` tags are matched against a beneficiary's tags for eligibility.
 */
const SCHEME_CATALOG = [
  { key: "pms_sc", name: "Post-Matric Scholarship for SC Students", hi: "अनुसूचित जाति के छात्रों के लिए पोस्ट-मैट्रिक छात्रवृत्ति", office: (s) => `Directorate of Social Welfare, ${s}`, amount: 12000, period: "per year", instalments: 2, audience: ["student", "sc"], about: "Tuition fees and a maintenance allowance for Scheduled Caste students in Class 11 and above.", docs: ["aadhaar", "bank", "caste", "school", "income"] },
  { key: "pre_sc", name: "Pre-Matric Scholarship for SC Students", hi: "अनुसूचित जाति के छात्रों के लिए प्री-मैट्रिक छात्रवृत्ति", office: (s) => `Directorate of Social Welfare, ${s}`, amount: 3500, period: "per year", instalments: 1, audience: ["school", "sc"], about: "Support for Scheduled Caste students in Classes 9 and 10 so they stay in school.", docs: ["aadhaar", "bank", "caste", "school"] },
  { key: "yasasvi", name: "PM YASASVI Scholarship for OBC Students", hi: "ओबीसी छात्रों के लिए पीएम यशस्वी छात्रवृत्ति", office: (s) => `Backward Classes Welfare Department, ${s}`, amount: 5000, period: "per year", instalments: 1, audience: ["student", "obc"], about: "Scholarship for OBC, EBC and DNT students in Class 11 and above.", docs: ["aadhaar", "bank", "caste", "school", "income"] },
  { key: "vatsalya", name: "Sponsorship support — Mission Vatsalya", hi: "प्रायोजन सहायता — मिशन वात्सल्य", office: (s, d) => `District Child Protection Unit, ${d}`, amount: 4000, period: "per month", audience: ["child"], about: "Monthly support for children in need of care and protection, paid for their education, health and needs.", docs: ["aadhaar", "bank", "cwc_order"] },
  { key: "daksh", name: "Skill training — PM-DAKSH", hi: "कौशल प्रशिक्षण — पीएम-दक्ष", office: (s, d) => `PM-DAKSH training partner, ${d}`, amount: null, period: null, audience: ["youth"], about: "Free, certified skill training (tailoring, electrician, data entry and more) with placement support.", docs: ["aadhaar", "caste"] },
  { key: "shreshta", name: "SHRESHTA — residential education", hi: "श्रेष्ठा — आवासीय शिक्षा", office: () => "National Testing Agency / Ministry of Social Justice", amount: null, period: null, audience: ["school", "sc"], about: "Seats in reputed residential schools for meritorious Scheduled Caste students in Classes 9 and 11.", docs: ["aadhaar", "caste", "school"] },
  { key: "ignoaps", name: "Indira Gandhi National Old Age Pension", hi: "इंदिरा गांधी राष्ट्रीय वृद्धावस्था पेंशन", office: (s, d) => `District Social Welfare Office, ${d}`, amount: 1000, period: "per month", audience: ["senior"], about: "Monthly pension for senior citizens, with the Centre's and the State's share paid together.", docs: ["aadhaar", "bank", "age"] },
  { key: "vayoshri", name: "Rashtriya Vayoshri Yojana — assistive devices", hi: "राष्ट्रीय वयोश्री योजना — सहायक उपकरण", office: (s, d) => `ALIMCO camp, ${d}`, amount: null, period: null, audience: ["senior"], about: "Free walking sticks, hearing aids, spectacles, dentures and wheelchairs for senior citizens.", docs: ["aadhaar", "age", "income"] },
  { key: "nmba", name: "Nasha Mukt Bharat Abhiyaan — rehabilitation", hi: "नशा मुक्त भारत अभियान — पुनर्वास", office: (s, d) => `Integrated Rehabilitation Centre, ${d}`, amount: null, period: null, audience: ["rehab"], about: "Counselling, treatment and aftercare through an Integrated Rehabilitation Centre for Addicts.", docs: ["aadhaar"] },
  { key: "smile", name: "SMILE — livelihood stipend", hi: "स्माइल — आजीविका वजीफ़ा", office: (s, d) => `District Social Welfare Office, ${d}`, amount: 1500, period: "per month", audience: ["rehab"], about: "A monthly stipend during skill training for people rebuilding their livelihood.", docs: ["aadhaar", "bank"] },
];
const schemeByKey = (k) => SCHEME_CATALOG.find((s) => s.key === k);

const DOC_CATALOG = {
  aadhaar: ["Aadhaar", "आधार", "UIDAI e-KYC"],
  bank: ["Bank account (for DBT)", "बैंक खाता (DBT के लिए)", "PFMS"],
  caste: ["Category certificate", "श्रेणी प्रमाण पत्र", "Tehsil office"],
  school: ["School enrolment certificate", "स्कूल नामांकन प्रमाण पत्र", "School"],
  income: ["Income certificate", "आय प्रमाण पत्र", "Tehsil office"],
  cwc_order: ["Child Welfare Committee order", "बाल कल्याण समिति आदेश", "Child Welfare Committee"],
  age: ["Age proof / senior citizen card", "आयु प्रमाण / वरिष्ठ नागरिक कार्ड", "District Social Welfare Office"],
};

/* ---------------------------------------------------- demo beneficiaries - */
/**
 * Fifteen residents across seven States. Seven live at Ashray Balika Grih
 * (the demo staff account's institute), so the staff view has a real roster.
 * spec: [scheme, status, applied days ago, stages reached (for "pending"), blocking document]
 */
const BENEFICIARY_SEEDS = [
  { id: "701fd286-5399-44e7-bc12-627def15e701", email: "beneficiary@dosje.gov.in", name: "Kavya Iyer", gender: "F", age: 17, tags: ["child", "student", "sc"], inst: "Ashray Balika Grih, Aishbagh", schemes: [["vatsalya", "active", 480], ["pms_sc", "pending", 34, 1, "caste"], ["daksh", "active", 80]], docs: { caste: "pending" } },
  { email: "priya.kumari@demo.setu.gov.in", name: "Priya Kumari", gender: "F", age: 15, tags: ["child", "school", "sc"], inst: "Ashray Balika Grih, Aishbagh", schemes: [["pre_sc", "approved", 400], ["vatsalya", "active", 400]] },
  { email: "anjali.verma@demo.setu.gov.in", name: "Anjali Verma", gender: "F", age: 18, tags: ["child", "student", "obc", "youth"], inst: "Ashray Balika Grih, Aishbagh", schemes: [["yasasvi", "approved", 390], ["vatsalya", "active", 300], ["daksh", "pending", 21, 2]] },
  { email: "sana.parveen@demo.setu.gov.in", name: "Sana Parveen", gender: "F", age: 14, tags: ["child", "school"], inst: "Ashray Balika Grih, Aishbagh", schemes: [["vatsalya", "active", 330], ["daksh", "pending", 16, 1]], docs: { cwc_order: "pending" } },
  { email: "rekha.yadav@demo.setu.gov.in", name: "Rekha Yadav", gender: "F", age: 17, tags: ["child", "student", "obc"], inst: "Ashray Balika Grih, Aishbagh", schemes: [["vatsalya", "active", 520], ["yasasvi", "rejected", 95, null, "income"]], docs: { income: "rejected" } },
  { email: "pooja.nishad@demo.setu.gov.in", name: "Pooja Nishad", gender: "F", age: 14, tags: ["child", "school", "sc"], inst: "Ashray Balika Grih, Aishbagh", schemes: [["vatsalya", "active", 300], ["pre_sc", "pending", 40, 2]] },
  { email: "meera.pal@demo.setu.gov.in", name: "Meera Pal", gender: "F", age: 18, tags: ["child", "student", "obc", "youth"], inst: "Ashray Balika Grih, Aishbagh", schemes: [["yasasvi", "approved", 430], ["daksh", "active", 120]] },
  { email: "ramesh.tiwari@demo.setu.gov.in", name: "Ramesh Chandra Tiwari", gender: "M", age: 72, tags: ["senior"], inst: "Matru Chhaya Vridhashram, Varanasi", schemes: [["ignoaps", "active", 700], ["vayoshri", "approved", 75]] },
  { email: "arjun.paswan@demo.setu.gov.in", name: "Arjun Paswan", gender: "M", age: 19, tags: ["student", "sc", "youth"], inst: "Asha Kiran Chhatravas, Patna", schemes: [["pms_sc", "approved", 450], ["daksh", "pending", 18, 1]] },
  { email: "lakshmi.sharma@demo.setu.gov.in", name: "Lakshmi Sharma", gender: "F", age: 68, tags: ["senior"], inst: "Anand Ashram Vridhashram, Meerut", schemes: [["ignoaps", "active", 560], ["vayoshri", "pending", 30, 2]] },
  { email: "imran.sheikh@demo.setu.gov.in", name: "Imran Sheikh", gender: "M", age: 27, tags: ["rehab", "youth"], inst: "Disha Punarvas Kendra, Prayagraj", schemes: [["nmba", "active", 150], ["smile", "active", 330], ["daksh", "approved", 60]] },
  { email: "rohan.jadhav@demo.setu.gov.in", name: "Rohan Jadhav", gender: "M", age: 16, tags: ["child", "school"], inst: "Snehalaya Balgruha, Hadapsar", schemes: [["vatsalya", "active", 380]] },
  { email: "fatima.khatoon@demo.setu.gov.in", name: "Fatima Khatoon", gender: "F", age: 17, tags: ["child", "student", "youth"], inst: "Nav Jeevan Balgruh, Gomti Nagar", schemes: [["vatsalya", "active", 260], ["daksh", "pending", 12, 1]] },
  { email: "suresh.kumar@demo.setu.gov.in", name: "Suresh Kumar", gender: "M", age: 20, tags: ["student", "sc", "youth"], inst: "Sarvodaya Vidyalaya Hostel, Kanpur", schemes: [["pms_sc", "approved", 420], ["daksh", "pending", 70, 3]] },
  { email: "kamla.devi@demo.setu.gov.in", name: "Kamla Devi", gender: "F", age: 75, tags: ["senior"], inst: "Matru Chhaya Vridhashram, Varanasi", schemes: [["ignoaps", "active", 900, null, null, "delayed"]] },
  { email: "shanti.devi@demo.setu.gov.in", name: "Shanti Devi", gender: "F", age: 70, tags: ["senior"], inst: "Matru Chhaya Vridhashram, Varanasi", schemes: [["ignoaps", "active", 420], ["vayoshri", "pending", 22, 1]] },
  { email: "vikas.yadav@demo.setu.gov.in", name: "Vikas Yadav", gender: "M", age: 24, tags: ["rehab", "youth"], inst: "Disha Punarvas Kendra, Prayagraj", schemes: [["nmba", "active", 90], ["smile", "active", 210], ["daksh", "pending", 20, 2]] },
  { email: "aarav.shinde@demo.setu.gov.in", name: "Aarav Shinde", gender: "M", age: 13, tags: ["child", "school"], inst: "Snehalaya Balgruha, Hadapsar", schemes: [["vatsalya", "active", 250]] },
  { email: "gopal.rao@demo.setu.gov.in", name: "Gopal Rao", gender: "M", age: 80, tags: ["senior"], inst: "Aadhar Vriddhashram, Nagpur", schemes: [["ignoaps", "active", 800], ["vayoshri", "approved", 120]] },
  { email: "nisha.kumari@demo.setu.gov.in", name: "Nisha Kumari", gender: "F", age: 19, tags: ["student", "sc", "youth"], inst: "Shanti Niketan Balika Chhatravas, Agra", schemes: [["pms_sc", "approved", 380], ["shreshta", "rejected", 200, null, "school"]], docs: { school: "rejected" } },
  { email: "deepak.gupta@demo.setu.gov.in", name: "Deepak Gupta", gender: "M", age: 18, tags: ["student", "obc", "youth"], inst: "Samarth Divyang Chhatravas, Gorakhpur", schemes: [["yasasvi", "approved", 400], ["daksh", "active", 100]] },
];
const STATE_CODE = { "Uttar Pradesh": "UP", Bihar: "BR", Maharashtra: "MH" };
const CASE_WORKERS = ["Meena Srivastava", "Rajiv Ranjan", "S. Kalaivani", "Anil Deshmukh", "Pema Lhamu", "Soma Chatterjee", "Kiran Choudhary", "Nirmala Singh"];
const GRIEVANCE_TEMPLATES = {
  child: [
    ["food", "Food portions at dinner are too small", "For two weeks the evening meal has not been enough. Several of us are hungry at night."],
    ["facilities", "Winter bedding not provided yet", "Blankets were promised in October but have not been given to our dormitory."],
    ["health", "Medical check-ups not held this quarter", "The quarterly health camp did not happen. Two of us were told to come back for anaemia follow-up."],
  ],
  student: [
    ["education", "Scholarship instalment delayed", "The instalment due last month has not been credited. The college has asked for the fee."],
    ["education", "No study room after 9 pm", "The study room is locked at 9 pm, before exams we need it later."],
  ],
  senior: [
    ["benefits", "Pension not credited this month", "My pension for this month has not come to my account. Last month it was also late."],
    ["health", "Spectacles not yet received from the camp", "I was assessed at the Vayoshri camp but have not received the spectacles."],
  ],
  rehab: [
    ["health", "Counselling sessions are irregular", "The counsellor has missed sessions for two weeks."],
    ["benefits", "Stipend paid late", "The SMILE stipend came 20 days late this month."],
  ],
};
const HEALTH_NOTES = ["Routine check-up — all normal.", "Anaemia follow-up — iron supplements given.", "Vision test due — referred to eye camp.", "Blood pressure monitored monthly.", "Dental check-up recommended.", "Weight gain on track."];
const SCHOOLS = ["Govt. Girls Inter College", "Kendriya Vidyalaya", "Govt. Senior Secondary School", "Jawahar Navodaya Vidyalaya", "Govt. Polytechnic"];

function stageDates(appliedAgo, reach, r) {
  const t0 = MOCK_NOW - appliedAgo * DAY;
  const gaps = [0, 20 + r() * 25, 15 + r() * 25, 15 + r() * 30];
  const keys = ["applied", "verified", "sanctioned", "disbursed"];
  let t = t0;
  return keys.map((key, i) => {
    t += gaps[i] * DAY;
    const at = i < reach && t < MOCK_NOW ? isoAt(t) : null;
    return { key, at };
  });
}
function nextMonthDay(day) {
  const d = new Date(MOCK_NOW);
  const n = new Date(d.getFullYear(), d.getMonth() + (d.getDate() >= day ? 1 : 0), day, 10, 0);
  return isoAt(n.getTime());
}

function buildBeneficiary(seed, i) {
  const r = seeded(i + 11);
  const entry = directoryByName(seed.inst) || MOCK_DIRECTORY[0];
  const inst = entry;
  const [first] = seed.name.split(" ");
  const user_id = seed.id || `b${String(i).padStart(7, "0")}-5e70-4d00-8000-${String(100000000000 + i * 7919).slice(-12)}`;
  const isChild = seed.tags.includes("child") || seed.tags.includes("school");
  const isSenior = seed.tags.includes("senior");
  const isRehab = seed.tags.includes("rehab");
  const isStudent = seed.tags.includes("student") || seed.tags.includes("school");
  const code = `BEN-${STATE_CODE[inst.state] || "IN"}-${inst.district.slice(0, 3).toUpperCase()}-${String(417 + i * 53).padStart(5, "0")}`;

  // applications
  const schemes = seed.schemes.map(([key, status, appliedAgo, reachPending, blockDoc, flag]) => {
    const cat = schemeByKey(key);
    const reach = status === "pending" ? reachPending || 1 : status === "rejected" ? 2 : 4;
    const stages = stageDates(appliedAgo, reach, r);
    const startAt = stages[3].at ? parseDate(stages[3].at).getTime() : null;
    const disbursements = [];
    if (cat.amount && startAt && (status === "approved" || status === "active")) {
      if (cat.period === "per month") {
        const d0 = new Date(startAt);
        for (let m = 0; m < 72; m++) {
          const pay = new Date(d0.getFullYear(), d0.getMonth() + m, 7, 11, 0).getTime();
          if (pay > MOCK_NOW) break;
          if (flag === "delayed" && pay > MOCK_NOW - 35 * DAY) continue; // this month's pension is late
          disbursements.push({ at: isoAt(pay), amount: cat.amount, ref: `DBT/${new Date(pay).getFullYear()}/${STATE_CODE[inst.state] || "IN"}/${String(5000000 + ((i * 7919 + m * 104729) % 4999999))}` });
        }
      } else {
        const each = cat.amount / (cat.instalments || 1);
        for (let k = 0; k < 4; k++) {
          const pay = startAt + k * 182 * DAY;
          if (pay > MOCK_NOW) break;
          disbursements.push({ at: isoAt(pay), amount: each, ref: `NSP/${new Date(pay).getFullYear()}/${String(100000 + ((i * 131 + k * 977) % 899999))}` });
        }
      }
    }
    const recent = disbursements.slice(-12);
    let next_date = null;
    let next_amount = null;
    if (cat.amount && (status === "approved" || status === "active")) {
      if (cat.period === "per month") {
        next_date = nextMonthDay(7);
        next_amount = cat.amount;
      } else if (disbursements.length) {
        next_date = isoAt(parseDate(disbursements[disbursements.length - 1].at).getTime() + 182 * DAY);
        next_amount = cat.amount / (cat.instalments || 1);
      }
    } else if (!cat.amount && (status === "active" || status === "approved")) {
      next_date = isoAt(MOCK_NOW + (2 + Math.floor(r() * 6)) * DAY + 5 * 3600000);
    }
    const next_step =
      status === "rejected"
        ? `Not approved: ${DOC_CATALOG[blockDoc || "income"]?.[0] || "a document"} did not match your Aadhaar details. Give a corrected copy to your institute office to re-apply.`
        : status === "pending"
        ? blockDoc
          ? `Waiting for your ${DOC_CATALOG[blockDoc][0].toLowerCase()}. Give a copy to your institute office — they will upload it.`
          : ["Your application is waiting for verification.", "Verified — waiting for sanction by the approving office.", "Sanctioned — the first payment or start date will appear here soon."][Math.max(0, reach - 1)]
        : flag === "delayed"
        ? "This month's payment is delayed at the treasury. A grievance has been raised for you."
        : cat.amount
        ? cat.period === "per month"
          ? "Paid on the 7th of every month to your bank account."
          : "Next instalment will be credited to your bank account."
        : key === "daksh"
        ? "Classes on Monday, Wednesday and Friday at 3 pm."
        : key === "vayoshri"
        ? "Device distribution camp — bring your Aadhaar."
        : "Sessions continue as planned with your counsellor.";
    return {
      key,
      application_id: `${key.toUpperCase().replace("_", "")}/${STATE_CODE[inst.state] || "IN"}/${new Date(MOCK_NOW - appliedAgo * DAY).getFullYear()}/${String(10000 + ((i * 3571 + key.length * 911) % 89999))}`,
      name: cat.name,
      hi: cat.hi,
      office: cat.office(inst.state, inst.district),
      status: flag === "delayed" ? "active" : status,
      amount: cat.amount,
      period: cat.period,
      next_date,
      next_amount,
      next_step,
      action: blockDoc && status === "pending" ? `document:${blockDoc}` : null,
      delayed: flag === "delayed",
      stages,
      disbursements: recent,
    };
  });

  // documents: whatever the applications need, plus the basics
  const needed = new Set(["aadhaar"]);
  seed.schemes.forEach(([key]) => schemeByKey(key).docs.forEach((d) => needed.add(d)));
  if (isSenior) needed.add("age");
  const documents = [...needed].map((key) => {
    const [name, hi, by] = DOC_CATALOG[key];
    const status = (seed.docs && seed.docs[key]) || "verified";
    const verified_on = status === "verified" ? daysAgo(120 + Math.floor(r() * 500)) : null;
    const remark =
      status === "pending"
        ? `Needed for your application. Give a copy to your institute office — they will upload it.`
        : status === "rejected"
        ? "Name does not match your Aadhaar. Give a corrected copy to your institute office."
        : null;
    return { key, name, hi, status, required: true, verified_on, by: status === "verified" ? by : null, remark };
  });
  if (isChild) documents.push({ key: "income_g", name: "Guardian income certificate", hi: "अभिभावक आय प्रमाण पत्र", status: "not_required", required: false, remark: "Not needed — you are under the care of the Child Welfare Committee." });

  return {
    user_id,
    email: seed.email,
    beneficiary_id: code,
    name: seed.name,
    gender: seed.gender,
    age: seed.age,
    tags: seed.tags,
    institute_id: inst.id,
    institute_name: inst.name,
    admitted_on: daysAgo(seed.id ? 640 : 150 + Math.floor(r() * 1200)),
    date_of_birth: isoAt(MOCK_NOW - (seed.age * 365 + Math.floor(r() * 300)) * DAY).slice(0, 10),
    room: isSenior ? `Ward ${1 + Math.floor(r() * 4)} · Bed ${1 + Math.floor(r() * 30)}` : isRehab ? `Ward ${1 + Math.floor(r() * 3)}` : inst.type === "hostel" ? `Room ${101 + Math.floor(r() * 40)}` : `Dormitory ${"ABCD"[Math.floor(r() * 4)]} · Bed ${1 + Math.floor(r() * 30)}`,
    guardian: isChild ? `Child Welfare Committee, ${inst.district}` : isSenior ? "Self (family contact on record)" : "Parent / family",
    case_worker: `${pickFrom(r, CASE_WORKERS)}, ${isChild ? "District Child Protection Unit" : "District Social Welfare Office"}`,
    category: isSenior ? "Senior citizen (BPL)" : isRehab ? "Person in recovery" : isChild ? "Child in need of care and protection" : seed.tags.includes("sc") ? "Scheduled Caste student" : "Other Backward Class student",
    // Invented numbers (not real ones); every screen shows only the last four (§3).
    phone: `+91 9${String(100000000 + (((i + 1) * 7919 * 13) % 899999999)).slice(0, 9)}`,
    aadhaar: String(234500000000 + ((i + 1) * 73856093) % 99999999),
    bank_account: String(30100000000 + ((i + 1) * 19349663) % 999999999),
    schemes,
    documents,
    health: { last_checkup: daysAgo(30 + Math.floor(r() * 80)), next_checkup: daysAgo(-(4 + Math.floor(r() * 25))), notes: pickFrom(r, HEALTH_NOTES) },
    education: isStudent ? { school: `${pickFrom(r, SCHOOLS)}, ${inst.district}`, klass: seed.age >= 18 ? `Diploma, year ${seed.age - 17}` : `Class ${Math.min(12, seed.age - 5)}`, attendance: 72 + Math.floor(r() * 26) } : null,
  };
}

const MOCK_BENEFICIARIES = BENEFICIARY_SEEDS.map(buildBeneficiary);

/* grievances and calls for every beneficiary */
function buildGrievances() {
  const out = [
    { id: "gr-0001", institute_id: MOCK_INSTITUTE_ID, submitted_by_id: "6f9ec175-4288-43d6-ab01-516cde04d6f0", subject: "Water supply interrupted since Monday", description: "The borewell pump has been out since Monday morning. We are managing with tankers twice a day, but that is not enough for 64 residents. A repair estimate has been submitted and we await sanction.", category: "water", urgency: "high", status: "open", created_at: daysAgo(1), updates: [{ at: daysAgo(0.9), text: "Received by the Ministry and logged in Sentinel." }] },
  ];
  MOCK_BENEFICIARIES.forEach((b, i) => {
    const r = seeded(i + 101);
    const pool = [...(b.tags.includes("senior") ? GRIEVANCE_TEMPLATES.senior : []), ...(b.tags.includes("rehab") ? GRIEVANCE_TEMPLATES.rehab : []), ...(b.tags.includes("child") ? GRIEVANCE_TEMPLATES.child : []), ...(b.tags.includes("student") ? GRIEVANCE_TEMPLATES.student : [])];
    const n = i === 0 ? 2 : 1 + Math.floor(r() * 2);
    const used = new Set();
    for (let k = 0; k < n && pool.length; k++) {
      let t = pickFrom(r, pool);
      if (i === 0) t = k === 0 ? GRIEVANCE_TEMPLATES.child[2] : ["facilities", "Hot water not available in winter mornings", "The geyser on the first floor has not worked for two weeks."];
      if (used.has(t[1])) continue;
      used.add(t[1]);
      const status = i === 0 ? (k === 0 ? "in_review" : "resolved") : pickFrom(r, ["open", "in_review", "in_review", "resolved", "resolved"]);
      const created = i === 0 ? (k === 0 ? 27 : 40) : 3 + Math.floor(r() * 80);
      const updates = [];
      updates.push({ at: daysAgo(Math.max(0.2, created - 0.5)), text: "Received by the Ministry and logged in Sentinel." });
      if (status !== "open") updates.push({ at: daysAgo(created - 3), text: "Assigned to the District Social Welfare Officer." });
      if (status === "in_review" && created > 10) updates.push({ at: daysAgo(Math.max(1, created - 12)), text: "Escalated to the State Directorate for action." });
      if (status === "resolved") updates.push({ at: daysAgo(Math.max(1, created - 7)), text: "Resolved. Please tell us if the problem comes back." });
      out.push({ id: `gr-${String(7 + i * 10 + k).padStart(4, "0")}`, institute_id: b.institute_id, submitted_by_id: b.user_id, subject: t[1], description: t[2], category: t[0], urgency: r() > 0.8 ? "high" : "normal", status, confidential: r() > 0.4, created_at: daysAgo(created), updates });
    }
  });
  return out;
}
function buildCalls() {
  const out = {};
  MOCK_BENEFICIARIES.forEach((b, i) => {
    const r = seeded(i + 303);
    const office = `District Social Welfare Office, ${directoryOf(b).district}`;
    const list = [];
    list.push({ id: `vc-${i}-1`, scheduled_at: daysAgo(-(1 + Math.floor(r() * 9)) + 0.4), status: "scheduled", official_name: office, note: "A routine well-being call. Staff will not be on the call." });
    const past = 2 + Math.floor(r() * 2);
    for (let k = 0; k < past; k++) {
      const missed = r() > 0.75;
      list.push({ id: `vc-${i}-${k + 2}`, scheduled_at: daysAgo(8 + k * 30 + Math.floor(r() * 10)), status: missed ? "missed" : "completed", official_name: office, outcome: missed ? "Not answered — called again the next day." : `Spoke for ${3 + Math.floor(r() * 8)} minutes. ${pickFrom(r, ["No concerns raised.", "Food and safety concerns noted.", "Asked about scholarship status — explained.", "Requested a health check-up — arranged."])}` });
    }
    out[b.user_id] = list;
  });
  return out;
}
const directoryOf = (b) => MOCK_DIRECTORY.find((d) => d.id === b.institute_id) || MOCK_DIRECTORY[0];

/** Institute staff — one account per institute that uses the Institute portal. */
const STAFF_SEEDS = [
  { user_id: "6f9ec175-4288-43d6-ab01-516cde04d6f0", email: "staff@dosje.gov.in", name: "Sunita Rao", designation: "Superintendent", inst: SENTINEL_INSTITUTES[0].id },
  { user_id: "5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c01", email: "matruchhaya@demo.setu.gov.in", name: "Vinod Mishra", designation: "Home Manager", inst: SENTINEL_INSTITUTES[3].id },
  { user_id: "5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c02", email: "disha@demo.setu.gov.in", name: "Dr. Neha Srivastava", designation: "Centre In-charge", inst: SENTINEL_INSTITUTES[4].id },
  { user_id: "5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c03", email: "snehalaya@demo.setu.gov.in", name: "Prakash More", designation: "Superintendent", inst: SENTINEL_INSTITUTES[8].id },
  { user_id: "5a1c0b22-7d19-4e0a-9c55-0e1f2a3b4c04", email: "ashakiran@demo.setu.gov.in", name: "Ravi Ranjan", designation: "Warden", inst: SENTINEL_INSTITUTES[10].id },
];

const MOCK_USERS = {
  "official@dosje.gov.in": { user_id: "1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab", name: "Anita Deshmukh", role: "official" },
  "admin@dosje.gov.in": { user_id: "2b5a8d31-0e44-4f92-c7b6-1d38fa6092bc", name: "R. Venkatesan", role: "admin" },
  "inspector1@dosje.gov.in": { user_id: "3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd", name: "Farhan Qureshi", role: "inspector" },
  ...Object.fromEntries(STAFF_SEEDS.map((s) => [s.email, { user_id: s.user_id, name: s.name, role: "institute_staff", institute_id: s.inst, designation: s.designation }])),
  ...Object.fromEntries(MOCK_BENEFICIARIES.map((b) => [b.email, { user_id: b.user_id, name: b.name, role: "beneficiary", institute_id: b.institute_id }])),
};

/** For the sign-in page's demo pickers. */
const DEMO_ACCOUNTS = [
  ...MOCK_BENEFICIARIES.map((b) => ({ email: b.email, name: b.name, role: "beneficiary", place: `${directoryOf(b).district}, ${directoryOf(b).state}`, note: b.category, institute_id: b.institute_id, state: directoryOf(b).state })),
  ...STAFF_SEEDS.map((s) => {
    const i = SENTINEL_INSTITUTES.find((x) => x.id === s.inst);
    return { email: s.email, name: s.name, role: "institute_staff", place: `${i.district}, ${i.state}`, note: `${s.designation} · ${i.name}`, institute_id: i.id, state: i.state };
  }),
];

/* findings and documents for every staff institute */
const FINDING_TEMPLATES = [
  ["anomaly", "red", "Attendance {n}% above the usual level while CCTV uptime fell to {m}%. The Ministry's model flagged the combination."],
  ["cctv_tamper", "red", "The '{room}' camera showed the same picture for {k} frames in a row — the feed looked frozen or looped."],
  ["camera_offline", "yellow", "The '{room}' camera has not reported since yesterday evening."],
  ["attendance_spike", "red", "Third attendance mismatch in nine days."],
  ["vc_miss", "yellow", "A resident did not answer a verification call; the second attempt connected."],
  ["geofence_breach", "yellow", "The last inspection check-in was recorded 340 m from the registered address."],
  ["hash_mismatch", "red", "Photo evidence from the last inspection did not verify against its seal."],
];
const ROOMS = ["Dormitory B", "Kitchen", "Main gate", "Dining hall", "Ward 2", "Study room"];
function buildFindings(instId, seedN) {
  if (instId === MOCK_INSTITUTE_ID)
    return [
      { id: "al-0001", type: "anomaly", severity: "red", status: "open", created_at: hoursAgo(5), detail: "Attendance 41% above the usual level while CCTV uptime fell to 52%. The Ministry's model flagged the combination." },
      { id: "al-0002", type: "cctv_tamper", severity: "red", status: "open", created_at: hoursAgo(9), detail: "The 'Dormitory B' camera showed the same picture for 7 frames in a row — the feed looked frozen or looped." },
      { id: "al-0005", type: "camera_offline", severity: "yellow", status: "open", created_at: hoursAgo(20), detail: "The 'Kitchen' camera has not reported since yesterday evening." },
      { id: "al-0008", type: "attendance_spike", severity: "red", status: "escalated", created_at: daysAgo(4), detail: "Third attendance mismatch in nine days." },
      { id: "al-0011", type: "vc_miss", severity: "yellow", status: "reviewed", created_at: daysAgo(11), detail: "A resident did not answer a verification call; the second attempt connected." },
    ].map((f) => ({ ...f, responses: [] }));
  const r = seeded(seedN + 700);
  const n = 3 + Math.floor(r() * 2);
  return Array.from({ length: n }, (_, k) => {
    const [type, severity, text] = FINDING_TEMPLATES[(seedN + k * 3) % FINDING_TEMPLATES.length];
    const status = k === 0 || k === 1 ? "open" : pickFrom(r, ["open", "reviewed", "escalated"]);
    return {
      id: `al-${String(seedN * 100 + k + 20).padStart(4, "0")}`,
      type,
      severity,
      status,
      created_at: hoursAgo(4 + k * 30 + Math.floor(r() * 20)),
      detail: text.replace("{n}", 20 + Math.floor(r() * 30)).replace("{m}", 45 + Math.floor(r() * 30)).replace("{room}", pickFrom(r, ROOMS)).replace("{k}", 5 + Math.floor(r() * 6)),
      responses: [],
    };
  });
}
function buildDocuments(instId, staffName, seedN) {
  if (instId === MOCK_INSTITUTE_ID)
    return [
      { id: "doc-01", filename: "Fire-safety-certificate-2026.pdf", description: "Fire safety certificate (renewal)", size: 482000, uploaded_at: daysAgo(15), uploaded_by: staffName },
      { id: "doc-02", filename: "Kitchen-audit-August.pdf", description: "Food safety audit — August", size: 1210000, uploaded_at: daysAgo(30), uploaded_by: staffName },
    ];
  const r = seeded(seedN + 900);
  const pool = [
    ["Building-fitness-certificate.pdf", "Building fitness certificate (renewal)"],
    ["Staff-police-verification.pdf", "Staff police verification list"],
    ["Resident-register-Q2.pdf", "Resident register — latest quarter"],
    ["Food-safety-audit.pdf", "Food safety audit"],
    ["Fire-NOC.pdf", "Fire safety certificate"],
  ];
  return pool.slice(0, 2 + Math.floor(r() * 3)).map(([f, d], k) => ({ id: `doc-${seedN}-${k}`, filename: f, description: d, size: 200000 + Math.floor(r() * 1500000), uploaded_at: daysAgo(5 + k * 17 + Math.floor(r() * 10)), uploaded_by: staffName }));
}

const MOCK_NOTICES = [
  { id: "nt-01", audience: "all", title: "Monsoon safety checklist", body: "Please check drains, roof leaks and electrical points before the rains. Institutes should upload photos of fixes as documents.", created_at: daysAgo(3) },
  { id: "nt-02", audience: "institute_staff", title: "Renewal documents due by 31 October", body: "Institutes renewing this year must upload fire safety, building fitness and food safety certificates.", created_at: daysAgo(8) },
  { id: "nt-03", audience: "beneficiary", title: "You can raise a grievance without fear", body: "Grievances marked private are seen only by Ministry officials — not by institute staff.", created_at: daysAgo(12) },
  { id: "nt-04", audience: "beneficiary", title: "Post-Matric Scholarship: renewal window open", body: "Students already receiving the scholarship should confirm their enrolment for this year by 15 November through their institute office.", created_at: daysAgo(5) },
  { id: "nt-05", audience: "beneficiary", title: "Vayoshri assistive-device camps this month", body: "Camps for senior citizens will be held in every district. Bring your Aadhaar and age proof.", created_at: daysAgo(18) },
];

/* ══════════════════════════════════════════════════════════════════════════
   §6  MOCK TRANSPORT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The whole demo world. Built fresh at start — and again on every sign-out,
 * so each demo session starts clean (nothing typed in the last one remains).
 */
function freshMockState() {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const used = new Set([...MOCK_BENEFICIARIES.map((b) => b.institute_id), ...STAFF_SEEDS.map((s) => s.inst)]);
  const grievances = buildGrievances();
  STAFF_SEEDS.slice(1).forEach((st, k) => {
    grievances.push({ id: `gr-s${k}`, institute_id: st.inst, submitted_by_id: st.user_id, subject: ["Repair sanction pending for the roof", "Vacancy for a night warden", "Delay in maintenance grant", "Water purifier replacement"][k % 4], description: "Requested in the last quarterly report. Awaiting sanction from the district office.", category: "facilities", urgency: k % 2 ? "high" : "normal", status: k % 3 === 0 ? "in_review" : "open", created_at: daysAgo(3 + k * 6), updates: k % 3 === 0 ? [{ at: daysAgo(2 + k * 5), text: "Forwarded to the District Social Welfare Officer." }] : [] });
  });
  return {
    institutes: Object.fromEntries(MOCK_DIRECTORY.filter((d) => used.has(d.id)).map((d) => [d.id, instituteDetail(d)])),
    findings: Object.fromEntries(STAFF_SEEDS.map((st, k) => [st.inst, buildFindings(st.inst, k + 1)])),
    documents: Object.fromEntries(STAFF_SEEDS.map((st, k) => [st.inst, buildDocuments(st.inst, st.name, k + 1)])),
    grievances,
    calls: buildCalls(),
    notices: MOCK_NOTICES,
    profiles: Object.fromEntries(clone(MOCK_BENEFICIARIES).map((b) => [b.user_id, b])),
  };
}
let mockState = freshMockState();
/** Called on sign-out. */
function resetMockState() {
  mockState = freshMockState();
}

/**
 * The demo side of the security contract. 2-step verification is an account
 * setting, so — as on a real server — it survives signing out (until the page
 * is reloaded): turn it on from Security, sign out, and the next sign-in asks
 * for a code. The demo accepts DEMO_CODE in place of an authenticator code.
 */
const DEMO_CODE = "123456";
const DEMO_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const mockMfa = {}; // user_id -> { recovery: [codes not yet used] }
const demoRecoveryCodes = () => Array.from({ length: 10 }, () => [0, 1].map(() => Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X")).join("-"));
function mockTokenResponse(u) {
  return {
    access_token: `mock.${u.user_id}.token`,
    token_type: "bearer",
    expires_in: 900,
    idle_timeout: 1800,
    session_id: `demo-${u.user_id.slice(0, 8)}`,
    ...u,
    mfa_enabled: Boolean(mockMfa[u.user_id]),
    last_login_at: isoAt(Date.now() - 26.5 * 3600e3),
    last_login_ip: "10.0.0.2",
  };
}
/** This browser, as the session list would label it. */
function demoDeviceLabel() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "this device";
  return `${browser} on ${os}`;
}
function mockSessions(me) {
  if (!mockState.sessions) {
    const now = Date.now();
    mockState.sessions = [
      { id: "demo-current", created_at: isoAt(now - 4 * 60e3), last_seen_at: isoAt(now), expires_at: isoAt(now + 12 * 3600e3), ip: "10.0.0.2", device: demoDeviceLabel(), current: true },
      { id: "demo-phone", created_at: isoAt(now - 5 * 3600e3), last_seen_at: isoAt(now - 40 * 60e3), expires_at: isoAt(now + 7 * 3600e3), ip: "10.0.4.17", device: "Chrome on Android", current: false },
      ...(me.role === "institute_staff" ? [{ id: "demo-office", created_at: isoAt(now - 9 * 3600e3), last_seen_at: isoAt(now - 2.5 * 3600e3), expires_at: isoAt(now + 3 * 3600e3), ip: "10.0.1.30", device: "Edge on Windows", current: false }] : []),
    ];
  }
  return mockState.sessions;
}
/** Sign-in, 2-step and account-security routes of the demo. `me` is null before sign-in. */
function mockAuth(config, method, url, body, me) {
  if (method === "post" && url === "/auth/login") {
    const u = MOCK_USERS[String(body?.email || "").trim().toLowerCase()];
    if (!u) return mockFail(config, 401, "Incorrect email or password.");
    if (mockMfa[u.user_id]) return mockOk(config, { mfa_required: true, mfa_token: `mfa.${u.user_id}`, expires_in: 300 });
    return mockOk(config, mockTokenResponse(u));
  }
  if (method === "post" && url === "/auth/mfa/verify") {
    const u = Object.values(MOCK_USERS).find((x) => body?.mfa_token === `mfa.${x.user_id}`);
    if (!u) return mockFail(config, 401, "Verification timed out. Please sign in again.");
    const code = String(body?.code || "").trim().toUpperCase();
    const rec = mockMfa[u.user_id]?.recovery || [];
    if (code !== DEMO_CODE && !rec.includes(code)) return mockFail(config, 401, "Invalid code.");
    if (rec.includes(code)) mockMfa[u.user_id].recovery = rec.filter((c) => c !== code);
    return mockOk(config, mockTokenResponse(u));
  }
  if (!url.startsWith("/auth/") || !me) return null;
  const mfaOn = Boolean(mockMfa[me.user_id]);
  if (method === "post" && url === "/auth/refresh") return mockOk(config, mockTokenResponse(me));
  if (method === "post" && url === "/auth/logout") return mockOk(config, { ok: true });
  if (method === "get" && url === "/auth/me")
    return mockOk(config, { ...me, mfa_enabled: mfaOn, last_login_at: mockTokenResponse(me).last_login_at, last_login_ip: "10.0.0.2", password_changed_at: daysAgo(64), session_expires_at: isoAt(Date.now() + 12 * 3600e3) });
  if (method === "get" && url === "/auth/sessions") return mockOk(config, mockSessions(me));
  const one = url.match(/^\/auth\/sessions\/([^/]+)$/);
  if (method === "delete" && one) {
    mockState.sessions = mockSessions(me).filter((x) => x.id !== decodeURIComponent(one[1]) || x.current);
    return mockOk(config, { ok: true });
  }
  if (method === "post" && url === "/auth/logout-others") {
    const before = mockSessions(me).length;
    mockState.sessions = mockSessions(me).filter((x) => x.current);
    return mockOk(config, { revoked: before - 1 });
  }
  if (method === "post" && url === "/auth/change-password") {
    if (!body?.current_password) return mockFail(config, 401, "Current password is incorrect.");
    const failed = passwordChecks(body.new_password, { name: me.name, email: Object.keys(MOCK_USERS).find((e) => MOCK_USERS[e] === me), current: body.current_password }).find((c) => !c.ok);
    if (failed) return mockFail(config, 400, `The new password doesn't meet this rule: ${failed.en}.`);
    const before = mockSessions(me).length;
    mockState.sessions = mockSessions(me).filter((x) => x.current);
    return mockOk(config, { ok: true, revoked_other_sessions: before - 1 });
  }
  if (method === "post" && url === "/auth/mfa/setup") {
    if (!body?.password) return mockFail(config, 401, "Incorrect password.");
    const email = Object.keys(MOCK_USERS).find((e) => MOCK_USERS[e] === me) || "demo";
    return mockOk(config, { secret: DEMO_SECRET, otpauth_uri: `otpauth://totp/DoSJE%20Nigrani:${encodeURIComponent(email)}?secret=${DEMO_SECRET}&issuer=DoSJE%20Nigrani` });
  }
  if (method === "post" && url === "/auth/mfa/enable") {
    if (String(body?.code || "").trim() !== DEMO_CODE) return mockFail(config, 400, "Invalid code.");
    const recovery_codes = demoRecoveryCodes();
    mockMfa[me.user_id] = { recovery: recovery_codes };
    return mockOk(config, { enabled: true, recovery_codes });
  }
  if (method === "post" && url === "/auth/mfa/disable") {
    if (!body?.password) return mockFail(config, 401, "Incorrect password.");
    if (String(body?.code || "").trim().toUpperCase() !== DEMO_CODE && !(mockMfa[me.user_id]?.recovery || []).includes(String(body?.code || "").trim().toUpperCase())) return mockFail(config, 400, "Invalid code.");
    delete mockMfa[me.user_id];
    return mockOk(config, { enabled: false });
  }
  return null;
}

const mockOk = (config, data, status = 200) => ({ data, status, statusText: "OK", headers: {}, config });
function mockFail(config, status, detail) {
  const err = new Error(detail);
  err.config = config;
  err.response = { status, data: { detail }, headers: {}, config };
  return Promise.reject(err);
}
const nowIso = () => new Date().toISOString().replace("Z", "");

/** What staff see about each resident (ASSUMED /institutes/{id}/residents). */
function residentSummary(b) {
  const grievances = mockState.grievances.filter((g) => g.submitted_by_id === b.user_id);
  const calls = mockState.calls[b.user_id] || [];
  return {
    user_id: b.user_id,
    beneficiary_id: b.beneficiary_id,
    name: b.name,
    age: b.age,
    gender: b.gender,
    category: b.category,
    admitted_on: b.admitted_on,
    room: b.room,
    schemes: b.schemes.map((s) => ({ key: s.key, name: s.name, status: s.status, amount: s.amount, period: s.period, action: s.action, delayed: s.delayed, disbursements: s.disbursements })),
    documents: b.documents.filter((d) => d.required).map((d) => ({ key: d.key, name: d.name, status: d.status })),
    // Private grievances are counted, never shown.
    grievances_open: grievances.filter((g) => g.status !== "resolved").length,
    last_call: calls.filter((c) => c.status !== "scheduled").sort((a, c) => (a.scheduled_at < c.scheduled_at ? 1 : -1))[0] || null,
    next_checkup: b.health?.next_checkup,
  };
}

async function handleMock(config) {
  await new Promise((r) => setTimeout(r, 180 + Math.random() * 160));
  const method = (config.method || "get").toLowerCase();
  const url = String(config.url || "").split("?")[0];
  const auth = String(config.headers?.Authorization || "");
  const me = Object.values(MOCK_USERS).find((u) => auth.includes(u.user_id));
  let body = config.data;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const authAnswer = mockAuth(config, method, url, body, me);
  if (authAnswer) return authAnswer;
  if (method === "get" && url === "/public/institutes") {
    const p = config.params || {};
    const q = String(p.q || "").trim().toLowerCase();
    const rows = MOCK_DIRECTORY.filter((i) => (!p.state || i.state === p.state) && (!q || `${i.name} ${i.district}`.toLowerCase().includes(q)));
    return mockOk(config, rows.slice(0, 200));
  }
  if (method === "get" && url === "/schemes") return mockOk(config, SCHEME_CATALOG.map(({ office, ...s }) => ({ ...s, documents: s.docs.map((d) => DOC_CATALOG[d][0]) })));
  // Yukt's AI routes are server-side only; the demo answers with the local engines.
  if (url.startsWith("/assistant/")) return mockFail(config, 404, "Assistant backend not configured in demo mode");
  if (!me) return mockFail(config, 401, "Not authenticated");

  const instMatch = url.match(/^\/institutes\/([^/]+)(\/[a-z]+)?$/);
  if (instMatch) {
    const [, id, sub] = instMatch;
    const inst = mockState.institutes[id];
    if (!inst) return mockFail(config, 404, "Institute not found");
    if (me.institute_id !== id) return mockFail(config, 403, "Not your institute");
    if (!sub && method === "get") return mockOk(config, inst);
    if (me.role !== "institute_staff") return mockFail(config, 403, "Not permitted");
    if (sub === "/alerts" && method === "get") return mockOk(config, mockState.findings[id] || []);
    if (sub === "/residents" && method === "get") return mockOk(config, Object.values(mockState.profiles).filter((b) => b.institute_id === id).map((b) => residentSummary(b)));
    if (sub === "/documents") {
      if (method === "get") return mockOk(config, [...(mockState.documents[id] || [])].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1)));
      if (method === "post") {
        const fd = config.data;
        const file = fd?.get?.("file");
        const doc = { id: `doc-${Date.now()}`, filename: file?.name || "document", size: file?.size || 0, description: fd?.get?.("description") || "", uploaded_at: nowIso(), uploaded_by: me.name };
        (mockState.documents[id] = mockState.documents[id] || []).push(doc);
        return mockOk(config, doc, 201);
      }
    }
  }
  const respondMatch = url.match(/^\/alerts\/([^/]+)\/responses$/);
  if (method === "post" && respondMatch) {
    const f = (mockState.findings[me.institute_id] || []).find((x) => x.id === respondMatch[1]);
    if (!f || me.role !== "institute_staff") return mockFail(config, 404, "Finding not found");
    const r = { id: `rs-${Date.now()}`, message: body.message, by: me.name, at: nowIso(), attachments: body.attachments || [] };
    f.responses.push(r);
    return mockOk(config, r, 201);
  }
  if (method === "get" && url === "/grievances") {
    if (me.role === "institute_staff")
      return mockOk(
        config,
        mockState.grievances
          .filter((g) => g.institute_id === me.institute_id)
          // Private grievances never reach institute staff.
          .filter((g) => !g.confidential || g.submitted_by_id === me.user_id)
      );
    if (me.role === "beneficiary") return mockOk(config, mockState.grievances.filter((g) => g.submitted_by_id === me.user_id));
    return mockFail(config, 403, "Not permitted");
  }
  if (method === "post" && url === "/grievances") {
    if (body.institute_id !== me.institute_id) return mockFail(config, 403, "You can only raise grievances for your own institute");
    if (!String(body.subject || "").trim() || !String(body.description || "").trim()) return mockFail(config, 422, "Subject and description are required");
    const g = {
      id: `gr-${Date.now().toString(36)}`,
      institute_id: body.institute_id,
      submitted_by_id: me.user_id,
      subject: String(body.subject).slice(0, 200),
      description: String(body.description).slice(0, 4000),
      category: body.category || "other",
      urgency: body.urgency || "normal",
      confidential: Boolean(body.confidential),
      status: "open",
      created_at: nowIso(),
      updates: [{ at: nowIso(), text: "Received by the Ministry and logged in Sentinel. An officer will be assigned shortly." }],
    };
    mockState.grievances.unshift(g);
    return mockOk(config, g, 201);
  }
  if (method === "get" && url === "/vc/calls/me") {
    if (me.role !== "beneficiary") return mockFail(config, 403, "Not permitted");
    return mockOk(config, mockState.calls[me.user_id] || []);
  }
  if (method === "post" && url === "/vc/calls/requests") {
    const c = { id: `vc-${Date.now()}`, scheduled_at: null, status: "requested", official_name: "District Social Welfare Office", note: body.note || "", preferred_time: body.preferred_time, requested_at: nowIso() };
    (mockState.calls[me.user_id] = mockState.calls[me.user_id] || []).unshift(c);
    return mockOk(config, c, 201);
  }
  if (method === "get" && url === "/beneficiaries/me") {
    const p = mockState.profiles[me.user_id];
    if (me.role !== "beneficiary" || !p) return mockFail(config, 403, "Only beneficiaries have a beneficiary record");
    return mockOk(config, p);
  }
  if (method === "post" && url === "/beneficiaries/me/scheme-requests") {
    const p = mockState.profiles[me.user_id];
    const cat = schemeByKey(body.scheme_key);
    if (!p || !cat) return mockFail(config, 404, "Scheme not found");
    if (p.schemes.some((s) => s.key === cat.key && s.status !== "rejected")) return mockFail(config, 409, "You already have an application for this scheme");
    const inst = directoryOf(p);
    const app = {
      key: cat.key,
      application_id: `${cat.key.toUpperCase().replace("_", "")}/${STATE_CODE[inst.state] || "IN"}/${new Date().getFullYear()}/${String(Date.now()).slice(-5)}`,
      name: cat.name,
      hi: cat.hi,
      office: cat.office(inst.state, inst.district),
      status: "pending",
      amount: cat.amount,
      period: cat.period,
      next_date: null,
      next_amount: null,
      next_step: "Request received. Your institute office will complete the form with you and submit your documents.",
      action: null,
      stages: [{ key: "applied", at: nowIso() }, { key: "verified", at: null }, { key: "sanctioned", at: null }, { key: "disbursed", at: null }],
      disbursements: [],
      requested_by_beneficiary: true,
    };
    p.schemes = [...p.schemes.filter((s) => s.key !== cat.key), app];
    return mockOk(config, app, 201);
  }
  if (method === "get" && url === "/notices") {
    return mockOk(config, mockState.notices.filter((n) => n.audience === "all" || n.audience === me.role));
  }
  return mockFail(config, 404, `No mock handler for ${method.toUpperCase()} ${url}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   §7  HTTP + DATA + AUTH
   ══════════════════════════════════════════════════════════════════════════ */

const APP_VERSION = "1.0.0";
// X-Client names this app in the server's list of signed-in devices.
const api = axios.create({ baseURL: ENV.VITE_API_BASE_URL || "/api/v1", timeout: 12000, headers: { "X-Client": `setu-web/${APP_VERSION}` } });

/* ------------------------------------------------------------ session --- */
/**
 * The session lives in memory only — no token or profile in localStorage,
 * sessionStorage, IndexedDB or cookies. So reloading or reopening Setu always
 * opens the sign-in page, whatever address was opened. UI preferences
 * (language, text size, contrast, theme, tour) are not sensitive and stay in
 * localStorage.
 */
// Earlier versions kept the token and profile in storage: remove them on start.
try {
  ["setu_token", "setu_user"].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
} catch {
  /* storage blocked: nothing was kept there */
}

/** Timings from the security contract. */
const IDLE_WARN_MS = 13 * 60e3; // "you'll be signed out in 2:00"
const IDLE_LIMIT_MS = 15 * 60e3; // signed out
const REFRESH_BEFORE_MS = 3 * 60e3; // renew the token when less than this is left…
const ACTIVE_RECENTLY_MS = 5 * 60e3; // …and the person was active this recently

/**
 * The one place the session is kept: { token, user, expiresAt, lastLoginAt,
 * lastLoginIp, mfaEnabled } or null. `notice` says why the last session
 * ended ({ kind: "idle" | "ended" | "elsewhere", detail? }); the sign-in page
 * shows it until the next sign-in.
 */
const sessionStore = (() => {
  let current = null;
  let notice = null;
  const subs = new Set();
  return {
    get: () => current,
    set(next) {
      current = next;
      subs.forEach((f) => f());
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
    notice: () => notice,
    setNotice(n) {
      notice = n;
    },
  };
})();

/** A login / verify / refresh answer (TokenResponse) as the session keeps it. */
function sessionFrom(data, user, prev = null) {
  return {
    token: data.access_token,
    user,
    expiresAt: Date.now() + num(data.expires_in, 900) * 1000,
    lastLoginAt: data.last_login_at ?? prev?.lastLoginAt ?? null,
    lastLoginIp: data.last_login_ip ?? prev?.lastLoginIp ?? null,
    mfaEnabled: data.mfa_enabled ?? prev?.mfaEnabled ?? false,
  };
}

/** Best effort: ask the server to revoke a token. A demo token never leaves the browser. */
function revokeToken(token) {
  if (!token || String(token).startsWith("mock.")) return;
  api.post(API.auth.logout(), null, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

/** A fresh access token for the same session (the "Stay signed in" button, and silently). */
let refreshing = null;
function refreshSession() {
  const before = sessionStore.get();
  if (!before) return Promise.resolve();
  refreshing =
    refreshing ||
    api
      .post(API.auth.refresh())
      .then(({ data }) => {
        const now = sessionStore.get();
        // Apply only to the session that asked (not one started since).
        if (now && now.token === before.token && data?.access_token) sessionStore.set(sessionFrom(data, now.user, now));
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}

/** Other open Setu tabs sign out together with this one. */
const authChannel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("setu-auth");

/**
 * Every way out ends here — the Sign out button, Yukt's "sign out", idle
 * time, a 401 from the server, or a sign-out in another tab: the server is
 * told (best effort), everything this session showed or typed is wiped, and
 * the sign-in page opens with a calm note of why.
 */
function endSession({ notice = null, broadcast = true } = {}) {
  const s = sessionStore.get();
  if (!s) return; // already signed out — a late 401 must not loop
  revokeToken(s.token);
  sessionStore.setNotice(notice);
  clearAppData();
  sessionStore.set(null);
  if (broadcast) authChannel?.postMessage({ type: "signed-out" });
}
if (authChannel) authChannel.onmessage = (e) => e.data?.type === "signed-out" && endSession({ notice: { kind: "elsewhere" }, broadcast: false });

/**
 * Signing out starts everything afresh: the start choices (state, language,
 * institute) and display settings are cleared so the next person gets blank
 * fields, sessionStorage is emptied, the demo data is rebuilt so nothing
 * from this session remains, and the pages (with all their data, drafts and
 * Yukt's conversation) unmount with the portal. The tour's "don't show
 * again" and the sidebar's shape are kept.
 */
function clearAppData() {
  try {
    ["setu.prefs", "setu.lang", "setu.yuktLang", "setu.size", "setu.contrast", "setu.theme"].forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {
    /* private window */
  }
  document.documentElement.setAttribute("data-size", "md");
  document.documentElement.setAttribute("data-contrast", "0");
  resetMockState();
  demoMode = USE_MOCK;
  sampleShown = false;
  demoSubs.forEach((f) => f(demoMode));
  window.dispatchEvent(new CustomEvent("setu:reset"));
}

/**
 * Demo fallback, as in Sentinel: the first time the backend can't be reached
 * at all, Setu switches to the built-in demo data and says so in a banner.
 */
// Decided afresh on every page load and every sign-in — never read from storage.
let demoMode = USE_MOCK;
let sampleShown = false;
const demoSubs = new Set();
function enterDemo() {
  if (demoMode) return;
  demoMode = true;
  demoSubs.forEach((f) => f(true));
}
/** Some sections are showing sample data (the backend doesn't have their route yet). */
function markSample() {
  if (sampleShown || demoMode) return;
  sampleShown = true;
  demoSubs.forEach((f) => f(true));
}
/**
 * Sample data for a section whose route the connected backend doesn't have
 * yet (an ASSUMED route answering 404), so the screen shows what will appear
 * there instead of an empty box. It comes from the demo record of the same
 * role and switches on the "Demo data" chip.
 */
/** The demo person who matches the signed-in account (by id, email or name). */
function demoIdentity() {
  const u = sessionStore.get()?.user || null;
  const all = Object.entries(MOCK_USERS).map(([email, v]) => ({ email, ...v }));
  const match =
    all.find((m) => u?.user_id && m.user_id === u.user_id) ||
    all.find((m) => u?.email && m.email === String(u.email).toLowerCase()) ||
    all.find((m) => u?.name && m.name === u.name && m.role === u.role);
  return {
    who: match?.user_id || (u?.role === "institute_staff" ? STAFF_SEEDS[0].user_id : BENEFICIARY_SEEDS[0].id),
    instId: match?.institute_id || MOCK_INSTITUTE_ID,
  };
}
/** Answers one request from the demo record of the same person, keeping the real session. */
async function sampleResponse(config) {
  const { who, instId } = demoIdentity();
  const url = String(config.url || "").replace(/^\/institutes\/[^/?]+/, `/institutes/${instId}`);
  const res = await handleMock({ ...config, url, headers: { ...(config.headers || {}), Authorization: `Bearer mock.${who}.token` } });
  markSample();
  return res;
}
async function sampleFor(path) {
  const res = await sampleResponse({ method: "get", url: path, headers: {} });
  return res.data;
}
function useDemoMode() {
  const [d, setD] = useState(demoMode || sampleShown);
  useEffect(() => {
    demoSubs.add(setD);
    return () => demoSubs.delete(setD);
  }, []);
  return d;
}

/**
 * "Nobody is answering" — as opposed to "the server answered with an error".
 *   · no response at all (network error, CORS, timeout)
 *   · 502 / 503 / 504 from a gateway
 *   · 500 with an EMPTY body: that is what the Vite dev proxy sends when the
 *     backend isn't running (ECONNREFUSED). This was the "The server had a
 *     problem" seen on the sign-in page with no backend started.
 * A real server error (500 with a message) is shown to the user, who can then
 * choose to continue with demo data (tryDemo below).
 */
function backendUnreachable(err) {
  if (!err?.response) return true;
  const { status, data } = err.response;
  if (status === 502 || status === 503 || status === 504) return true;
  const empty = data === undefined || data === null || data === "" || (typeof data === "string" && !data.trim());
  return status === 500 && empty;
}
/** Switch to demo data on purpose (the "Continue with demo data" button). */
function tryDemo() {
  enterDemo();
}

const callReal = (config) => (axios.getAdapter ? axios.getAdapter(axios.defaults.adapter) : axios.defaults.adapter)(config);
api.defaults.adapter = async (config) => {
  if (demoMode) return handleMock(config);
  // Before anyone has signed in to a real server (sign-in, the institute
  // register), a backend that doesn't answer within 8 s counts as down.
  const signedInReal = Boolean(config.headers?.Authorization);
  try {
    if (signedInReal) return await callReal(config);
    let timer;
    const silent = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("No answer"), { config })), 8000);
    });
    try {
      return await Promise.race([callReal(config), silent]);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (backendUnreachable(err)) {
      // Signed in to a real server that has stopped answering: keep that
      // session and fill this request from the same person's demo record.
      // Account and session routes are never answered from the demo record.
      const auth = String(config.headers?.Authorization || "");
      if (auth && !auth.startsWith("Bearer mock.")) {
        if (String(config.url || "").startsWith("/auth/")) throw err;
        return sampleResponse(config);
      }
      enterDemo();
      return handleMock(config);
    }
    throw err;
  }
};

api.interceptors.request.use((config) => {
  const token = sessionStore.get()?.token;
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
/** Routes whose 401 means "wrong password or code" rather than "session over". */
const PASSWORD_CHECKED = ["/auth/login", "/auth/mfa/verify", "/auth/change-password", "/auth/mfa/setup", "/auth/mfa/disable"];
api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Any other 401 means the session is over (expired, idle, revoked or
    // signed out elsewhere). Only the live session can end: a late answer to
    // an older token, or a signed-out visitor, changes nothing.
    const s = sessionStore.get();
    const sent = String(err.config?.headers?.Authorization || "").replace(/^Bearer /, "");
    const detail = typeof err.response?.data?.detail === "string" ? err.response.data.detail : null;
    const wrongPassword = PASSWORD_CHECKED.some((u) => String(err.config?.url || "").startsWith(u)) && !/session|sign in again/i.test(detail || "");
    if (err.response?.status === 401 && s && sent === s.token && !wrongPassword) endSession({ notice: { kind: "ended", detail } });
    return Promise.reject(err);
  }
);

function errorMessage(err, fallback = "Something went wrong") {
  const d = err?.response?.data?.detail;
  if (typeof d === "string") return d;
  const s = err?.response?.status;
  if (s === 403) return "You don't have access to this";
  if (s === 404) return "This isn't available yet";
  if (s === 422) return "Please check what you entered";
  if (s >= 500) return "The Setu server reported an error.";
  if (!err?.response) return "Can't reach the server. Check your connection.";
  return fallback;
}
const isMissing = (err) => err?.response?.status === 404 || err?.response?.status === 405;

const SLOW_MS = 6000;
/**
 * Loads one GET route. `reload()` and the portal's auto-refresh (§16) load
 * quietly: no skeleton, and if that load fails what is on screen stays.
 * `sample: false` = never fill this section from the demo record (security
 * data must be the real account's or nothing).
 */
function useApi(path, { fallback = null, optional = false, skip = false, sample = true } = {}) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const load = useCallback(
    async (quiet = false) => {
      if (skip || !path) {
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      setError("");
      try {
        // A section never waits more than a few seconds: if the server is
        // silent, the sample record below fills it (labelled "Demo data").
        let timer;
        const slow = new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error("The server is taking too long"), { slow: true })), SLOW_MS);
        });
        const res = await Promise.race([api.get(path), slow]).finally(() => clearTimeout(timer));
        if (alive.current) {
          setData(res.data);
          setUnavailable(false);
        }
      } catch (err) {
        if (!alive.current) return;
        // A background refresh that fails leaves the page as it was.
        if (quiet) return;
        const signedOut = err?.response?.status === 401;
        if (sample && !demoMode && !signedOut) {
          try {
            const sample = await sampleFor(path);
            if (alive.current) {
              setData(sample);
              setUnavailable(false);
            }
            return;
          } catch {
            /* no sample for this section either */
          }
        }
        if (optional && isMissing(err)) {
          setUnavailable(true);
          setData(fallback);
        } else setError(errorMessage(err, "Couldn't load this"));
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [path, skip, optional, sample] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    load();
  }, [load]);
  // Something changed elsewhere (e.g. Yukt filed a grievance): refresh quietly.
  useEffect(() => {
    const on = () => load(true);
    window.addEventListener("setu:refresh", on);
    return () => window.removeEventListener("setu:refresh", on);
  }, [load]);
  return { data, loading, error, unavailable, reload: () => load(true), setData };
}

/** Signed in on the Beneficiary tab with a staff account, or the other way round. */
class PortalMismatchError extends Error {
  constructor(role) {
    super("wrong-portal");
    this.role = role;
  }
}
class WrongAppError extends Error {
  constructor(role) {
    super("wrong-app");
    this.role = role;
  }
}

const AuthContext = createContext(null);

/** Opens the session from a TokenResponse — if the account belongs in Setu, on this portal. */
function startSession(data, email, expectRole) {
  // Officials and inspectors authenticate fine — but belong elsewhere.
  const wrong = !SETU_ROLES.includes(data.role) ? new WrongAppError(data.role) : expectRole && data.role !== expectRole ? new PortalMismatchError(data.role) : null;
  if (wrong) {
    revokeToken(data.access_token);
    throw wrong;
  }
  const user = { user_id: data.user_id, name: data.name, role: data.role, institute_id: data.institute_id ?? null, designation: data.designation || null, email };
  sessionStore.setNotice(null);
  sessionStore.set(sessionFrom(data, user));
  return user;
}

function AuthProvider({ children }) {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const user = session?.user || null;
  /** -> { user } when signed in, or { mfa: { token, expiresAt } } when a 2-step code is needed. */
  const login = useCallback(async (email, password, expectRole) => {
    const { data } = await api.post(API.auth.login(), { email, password });
    if (data?.mfa_required) return { mfa: { token: data.mfa_token, expiresAt: Date.now() + num(data.expires_in, 300) * 1000 } };
    return { user: startSession(data, email, expectRole) };
  }, []);
  const verifyMfa = useCallback(async (mfaToken, code, email, expectRole) => {
    const { data } = await api.post(API.auth.mfaVerify(), { mfa_token: mfaToken, code });
    return startSession(data, email, expectRole);
  }, []);
  const logout = useCallback(() => endSession(), []);
  const value = useMemo(
    () => ({ user, session, login, verifyMfa, logout, role: user?.role, isStaff: user?.role === ROLES.STAFF, isBeneficiary: user?.role === ROLES.BENEFICIARY }),
    [user, session, login, verifyMfa, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
const useAuth = () => useContext(AuthContext);

/* ══════════════════════════════════════════════════════════════════════════
   §8  THEME
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Setu's visual language — a public-service portal, not an app:
 *   · deep "Setu teal" for structure, a restrained amber only where the
 *     beneficiary must act, green/amber/red/blue only for status
 *   · white surfaces on a quiet paper background, hairline borders, small radii
 *   · Noto Sans (every Indian script has a Noto face), Display cut for titles,
 *     Mono for reference numbers; body line-height 1.5, Devanagari 1.7
 *   · motion only where it explains something: page entry, progress filling,
 *     the application track, toasts. Everything respects reduced motion.
 * Its signature is the "track": a bridge-like line of stages that every
 * application, grievance and renewal is drawn on.
 */
const C = {
  pri: "var(--pri-7)", // text-safe shade of the portal colour (green / navy)
  pri7: "var(--pri-7)",
  pri8: "var(--pri-8)",
  pri50: "var(--pri-50)",
  acc: "var(--acc)",
  acc50: "var(--acc-50)",
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  muted: "var(--muted)",
  line: "var(--line)",
  bg: "var(--bg)",
  gov: "#0E211D",
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  info: "var(--info)",
  saffron: "#FF9933",
  green: "#138808",
  chakra: "#0B2A6F",
};

const SETU_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Display:wght@500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Sans+Mono:wght@500&display=swap');
:root {
  --bg: #F4F7F3; --surface: #fff; --subtle: #F7F8F6; --line: #DDE2DE; --line-2: #C6CEC9;
  --ink: #15231F; --ink-2: #35453F; --muted: #5C6B66;
  --pri: #16874F; --pri-7: #127043; --pri-8: #0D5533; --pri-50: #EAF6EE; --pri-100: #CDEBD8;
  --acc: #B3530A; --acc-50: #FDF2E6;
  --ok: #1B7A3E; --ok-50: #E8F4EC; --warn: #945A00; --warn-50: #FCF3E2; --bad: #B42318; --bad-50: #FCEDEB; --info: #1F5AA0; --info-50: #EAF1FA;
  --gov: #0E211D;
  --seg: #E8ECE9; --neutral-bg: #EEF1EF; --grid: #E4E9E6; --hover: #F2F5F3; --skel-a: #ECEFED; --skel-b: #F5F7F6;
  --info-line: #BFD3EE; --info-ink: #173F70; --acc-line: #F2D0AE; --acc-ink: #6E3306; --ok-line: #BEDFC9; --ok-ink: #14532D; --bad-line: #F3C7C2; --bad-ink: #7A1A12;
  --c-green: #16874F; --c-saffron: #D9731A; --c-blue: #2463B5; --c-purple: #6B4BC4; --c-teal: #0E8A8A; --c-rose: #C0395A;
  --r-sm: 6px; --r: 8px;
  --sh-1: 0 1px 2px rgba(16,32,28,.05); --sh-2: 0 10px 24px -14px rgba(16,32,28,.28);
  --ease: cubic-bezier(.2,.7,.2,1);
}
/* The Institute portal wears navy blue; the Beneficiary portal wears green. */
:root[data-portal="institute"] { --pri: #1F5FAE; --pri-7: #174E91; --pri-8: #123F78; --pri-50: #EBF2FB; --pri-100: #D3E3F6; --bg: #F3F6FA; }
:root[data-contrast="1"] { --ink: #000; --ink-2: #111; --muted: #2a2a2a; --line: #6b6b6b; --line-2: #333; --pri: #0A5A31; --pri-7: #0A5A31; --pri-50: #DDF0E3; --bg: #fff; --subtle: #fff; }
:root[data-contrast="1"] a { text-decoration: underline; }
:root[data-contrast="1"] .st-badge { outline: 1px solid currentColor; }
html { font-size: calc(var(--st-base, 15px) * var(--st-k, 1)); }
:root[data-size="sm"] { --st-k: .92; }
:root[data-size="lg"] { --st-k: 1.12; }
/* Inside the portal, text grows a little on larger screens so it stays comfortable. */
@media (min-width: 1440px) { :root[data-shell="1"] { --st-base: 15.5px; } }
@media (min-width: 1720px) { :root[data-shell="1"] { --st-base: 16px; } }
body { margin: 0; transition: background-color .4s ease; font-family: 'Noto Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; background: var(--bg); color: var(--ink); line-height: 1.5; -webkit-font-smoothing: antialiased; }
*, *::before, *::after { box-sizing: border-box; }
a { color: var(--pri-7); }
.st-display { font-family: 'Noto Sans Display', 'Noto Sans', system-ui, sans-serif; font-weight: 600; letter-spacing: -.012em; }
.st-hi { font-family: 'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif; line-height: 1.7; }
.st-loc { font-family: var(--st-loc-font), 'Noto Sans', system-ui, sans-serif; }
.st-sub { color: var(--muted); font-weight: 500; }
.st-mono { font-family: 'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .01em; }
.st-tnum { font-variant-numeric: tabular-nums; }
.st-muted { color: var(--muted); }
.st-skip { position: absolute; left: 12px; top: -48px; z-index: 300; background: var(--pri); color: #fff; padding: 8px 14px; border-radius: var(--r-sm); font-weight: 600; font-size: 0.9333rem; transition: top .15s; }
.st-skip:focus { top: 8px; }

/* motion */
@keyframes st-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes st-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes st-shimmer { from { background-position: -400px 0; } to { background-position: 400px 0; } }
@keyframes st-ring { 0% { box-shadow: 0 0 0 0 rgba(22,135,79,.35); } 70% { box-shadow: 0 0 0 7px rgba(22,135,79,0); } 100% { box-shadow: 0 0 0 0 rgba(22,135,79,0); } }
@keyframes st-slide { from { transform: translateX(-100%); } to { transform: none; } }
@keyframes st-toast { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes st-spin { to { transform: rotate(360deg); } }
.st-page { animation: st-in .26s var(--ease) both; }
.st-stagger > * { animation: st-in .32s var(--ease) both; }
.st-stagger > *:nth-child(2) { animation-delay: .03s; } .st-stagger > *:nth-child(3) { animation-delay: .06s; }
.st-stagger > *:nth-child(4) { animation-delay: .09s; } .st-stagger > *:nth-child(5) { animation-delay: .12s; }
.st-stagger > *:nth-child(6) { animation-delay: .15s; } .st-stagger > *:nth-child(n+7) { animation-delay: .18s; }

/* surfaces */
.st-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--sh-1); }
.st-card.is-hover { transition: border-color .18s var(--ease), box-shadow .18s var(--ease), transform .18s var(--ease); }
.st-card.is-hover:hover { border-color: var(--line-2); box-shadow: var(--sh-2); transform: translateY(-1px); }
.st-card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
.st-card-title { margin: 0; font-size: 0.9667rem; font-weight: 600; color: var(--ink); }
.st-card-body { padding: 14px 16px; }
.st-divider { height: 1px; background: var(--line); border: 0; margin: 0; }

/* buttons */
.st-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: var(--r-sm); border: 1px solid transparent; font-weight: 600; font-family: inherit; line-height: 1; cursor: pointer; white-space: nowrap; text-decoration: none; transition: background-color .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease), box-shadow .15s var(--ease); }
.st-btn:focus-visible, .st-field:focus-visible, .st-nav:focus-visible, .st-choice:focus-visible, .st-link:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(22,135,79,.3); }
.st-btn:disabled { opacity: .5; cursor: not-allowed; }
.st-btn-sm { height: 30px; padding: 0 11px; font-size: 0.8333rem; }
.st-btn-md { height: 36px; padding: 0 14px; font-size: 0.9rem; }
.st-btn-lg { height: 42px; padding: 0 20px; font-size: 0.9667rem; }
.st-btn-primary { background: var(--pri); color: #fff; }
.st-btn-primary:not(:disabled):hover { background: var(--pri-7); }
.st-btn-secondary { background: var(--surface); color: var(--ink); border-color: var(--line-2); }
.st-btn-secondary:not(:disabled):hover { border-color: var(--pri); color: var(--pri-7); background: var(--subtle); }
.st-btn-ghost { background: transparent; color: var(--pri-7); }
.st-btn-ghost:not(:disabled):hover { background: var(--pri-50); }
.st-btn-accent { background: var(--acc); color: #fff; }
.st-btn-accent:not(:disabled):hover { background: #97450A; }
.st-btn-danger { background: var(--bad); color: #fff; }
.st-btn-danger:not(:disabled):hover { background: #8F1C13; }
.st-btn svg { width: 16px; height: 16px; flex: none; }
.st-link { color: var(--pri-7); font-weight: 600; font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; border-radius: 4px; }
.st-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.st-link svg { width: 14px; height: 14px; transition: transform .15s var(--ease); }
.st-link:hover svg { transform: translateX(2px); }

/* forms */
.st-field { width: 100%; min-height: 38px; border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--surface); padding: 7px 11px; font-size: 0.9333rem; color: var(--ink); font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s; }
.st-field:focus { border-color: var(--pri); box-shadow: 0 0 0 3px rgba(22,135,79,.16); }
.st-field::placeholder { color: #8A9792; }
textarea.st-field { line-height: 1.5; resize: vertical; }
.st-label { display: block; margin-bottom: 6px; font-size: 0.9rem; font-weight: 600; color: var(--ink-2); }
.st-hint { margin: 6px 0 0; font-size: 0.8333rem; color: var(--muted); }
.st-search { position: relative; }
.st-search > svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 17px; height: 17px; color: var(--muted); pointer-events: none; }
.st-search > .st-field { padding-left: 38px; }
.st-choice { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--surface); padding: 10px 12px; cursor: pointer; font-family: inherit; color: var(--ink); transition: border-color .15s var(--ease), background-color .15s var(--ease), box-shadow .15s var(--ease); }
.st-choice:hover { border-color: var(--line-2); background: var(--subtle); }
.st-choice[aria-checked="true"], .st-choice[aria-selected="true"], .st-choice[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-50); box-shadow: inset 0 0 0 1px var(--pri); }
.st-seg { display: inline-flex; padding: 3px; border-radius: 8px; background: var(--seg); gap: 2px; }
.st-seg button { border: 0; background: transparent; padding: 6px 12px; border-radius: 6px; font: 600 13px/1.2 inherit; font-family: inherit; color: var(--ink-2); cursor: pointer; transition: background-color .15s, color .15s, box-shadow .15s; }
.st-seg button[aria-pressed="true"] { background: var(--surface); color: var(--pri-8); box-shadow: 0 1px 2px rgba(0,0,0,.08); }

/* status */
.st-badge { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; line-height: 1; white-space: nowrap; }
.st-badge.has-dot::before { content: ""; width: 6px; height: 6px; border-radius: 99px; background: currentColor; }
.st-tone-good { background: var(--ok-50); color: var(--ok); }
.st-tone-watch { background: var(--warn-50); color: var(--warn); }
.st-tone-flag { background: var(--bad-50); color: var(--bad); }
.st-tone-info { background: var(--info-50); color: var(--info); }
.st-tone-neutral { background: var(--neutral-bg); color: var(--ink-2); }
.st-tone-accent { background: var(--acc-50); color: var(--acc); }
.st-progress { height: 6px; border-radius: 99px; background: var(--grid); overflow: hidden; }
.st-progress > i { display: block; height: 100%; border-radius: inherit; background: var(--pri); transition: width .9s var(--ease); }
.st-skel { border-radius: var(--r-sm); background: linear-gradient(90deg, var(--skel-a) 0, var(--skel-b) 40%, var(--skel-a) 80%); background-size: 800px 100%; animation: st-shimmer 1.3s linear infinite; }
.st-spin { animation: st-spin .8s linear infinite; }

/* the track: stages of an application, grievance or renewal */
.st-track { display: flex; align-items: flex-start; }
.st-track-step { position: relative; flex: 1; min-width: 0; text-align: center; }
.st-track-step:first-child { text-align: left; } .st-track-step:last-child { text-align: right; }
.st-track-line { position: absolute; top: 10px; height: 2px; background: var(--grid); left: 50%; right: -50%; }
.st-track-step:first-child .st-track-line { left: 11px; }
.st-track-step:nth-last-child(2) .st-track-line { right: calc(-100% + 11px); }
.st-track-line > i { display: block; height: 100%; width: 0; background: var(--pri); transition: width .7s var(--ease); }
.st-track-node { position: relative; z-index: 1; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 99px; border: 2px solid #C6CEC9; background: var(--surface); color: #fff; transition: background-color .3s, border-color .3s; }
.st-track-node svg { width: 12px; height: 12px; }
.st-track-step.is-done .st-track-node { background: var(--pri); border-color: var(--pri); }
.st-track-step.is-current .st-track-node { border-color: var(--pri); animation: st-ring 2.2s ease-out infinite; }
.st-track-step.is-current .st-track-node::after { content: ""; width: 8px; height: 8px; border-radius: 99px; background: var(--pri); }
.st-track-step.is-blocked .st-track-node { border-color: var(--acc); }
.st-track-step.is-blocked .st-track-node::after { content: ""; width: 8px; height: 8px; border-radius: 99px; background: var(--acc); }
.st-track-label { margin-top: 6px; font-size: 0.8333rem; font-weight: 600; color: var(--ink-2); line-height: 1.3; }
.st-track-step.is-todo .st-track-label { color: var(--muted); font-weight: 500; }
.st-track-date { font-size: 0.7667rem; color: var(--muted); }

/* vertical timeline */
.st-tl { list-style: none; margin: 0; padding: 0; }
.st-tl > li { position: relative; padding: 0 0 16px 26px; }
.st-tl > li::before { content: ""; position: absolute; left: 7px; top: 18px; bottom: 0; width: 2px; background: var(--line); }
.st-tl > li:last-child::before { display: none; }
.st-tl-dot { position: absolute; left: 0; top: 3px; width: 16px; height: 16px; border-radius: 99px; border: 2px solid var(--line-2); background: var(--surface); }
.st-tl > li.is-done .st-tl-dot { border-color: var(--pri); background: var(--pri); }

/* tables */
.st-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.st-table th { text-align: left; font-size: 0.8333rem; font-weight: 600; color: var(--muted); background: var(--subtle); padding: 10px 16px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.st-table td { padding: 12px 16px; border-bottom: 1px solid var(--line); vertical-align: top; }
.st-table tr:last-child td { border-bottom: 0; }
.st-table tbody tr { transition: background-color .15s; }
.st-table tbody tr:hover { background: var(--subtle); }

/* key–value rows */
.st-kv { display: grid; grid-template-columns: minmax(0, 40%) minmax(0, 1fr); gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
.st-kv:last-child { border-bottom: 0; }
.st-kv dt { color: var(--muted); }
.st-kv dd { margin: 0; font-weight: 600; color: var(--ink); }

/* government bar + header */
.st-govbar { background: var(--gov); color: rgba(255,255,255,.82); font-size: 0.8333rem; }
.st-govbar button { color: inherit; }
.st-tricolour { height: 3px; background: linear-gradient(90deg, #FF9933 0 33.33%, #fff 33.33% 66.66%, #138808 66.66%); }
.st-utilbtn { height: 24px; min-width: 26px; padding: 0 7px; border-radius: 4px; border: 1px solid rgba(255,255,255,.22); background: transparent; font: 600 12px/1 inherit; font-family: inherit; cursor: pointer; transition: background-color .15s, color .15s, border-color .15s; }
.st-utilbtn:hover { background: rgba(255,255,255,.1); color: #fff; }
.st-utilbtn[aria-pressed="true"] { background: #fff; color: #0E211D; border-color: #fff; }
.st-header { background: var(--surface); border-bottom: 1px solid var(--line); }

/* sidebar */
.st-side { height: 100%; width: 272px; flex: none; flex-direction: column; background: var(--surface); border-right: 1px solid var(--line); }
.st-nav-group { margin: 10px 0 2px; padding: 0 12px; font-size: 0.7333rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #7A8883; }
.st-nav { position: relative; display: flex; align-items: center; gap: 10px; min-height: 34px; padding: 5px 10px; border-radius: var(--r-sm); color: var(--ink-2); font-size: 0.8667rem; font-weight: 500; text-decoration: none; transition: background-color .15s var(--ease), color .15s var(--ease); }
.st-nav > svg { width: 18px; height: 18px; flex: none; color: #7A8883; transition: color .15s var(--ease); }
.st-nav:hover { background: var(--subtle); color: var(--ink); }
.st-nav:hover > svg { color: var(--pri); }
.st-nav::before { content: ""; position: absolute; left: -12px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--pri); transform: scaleY(0); transition: transform .2s var(--ease); }
.st-nav.is-active { background: var(--pri-50); color: var(--pri-8); font-weight: 600; }
.st-nav.is-active > svg { color: var(--pri); }
.st-nav.is-active::before { transform: scaleY(1); }
.st-nav-sub { display: block; font-size: 0.7333rem; font-weight: 500; color: var(--muted); line-height: 1.35; }
.st-count { margin-left: auto; min-width: 22px; height: 20px; padding: 0 6px; display: grid; place-items: center; border-radius: 99px; font-size: 0.7667rem; font-weight: 700; background: var(--acc-50); color: var(--acc); }
.st-nav.is-active .st-count { background: var(--surface); }
.st-drawer-back { position: fixed; inset: 0; z-index: 90; background: rgba(14,33,29,.45); animation: st-fade .2s ease both; }
.st-drawer { position: fixed; top: 0; bottom: 0; left: 0; z-index: 91; width: min(86vw, 300px); background: var(--surface); box-shadow: 18px 0 40px -18px rgba(14,33,29,.4); animation: st-slide .26s var(--ease) both; display: flex; flex-direction: column; }

/* toast + modal */
.st-toast { animation: st-toast .22s var(--ease) both; }
.st-modal-back { position: fixed; inset: 0; background: rgba(14,33,29,.5); animation: st-fade .18s ease both; }
.st-modal { animation: st-in .22s var(--ease) both; }

/* file drop */
.st-drop { border: 1.5px dashed var(--line-2); border-radius: var(--r); background: var(--subtle); transition: border-color .15s, background-color .15s; }
.st-drop:hover, .st-drop.is-over { border-color: var(--pri); background: var(--pri-50); }

/* boxed form fields */
.st-flabel { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; font-size: 0.8333rem; font-weight: 600; color: var(--ink-2); }
.st-fstep { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 99px; background: var(--pri-50); color: var(--pri-7); font-size: 0.7667rem; font-weight: 700; }
.st-fieldbox { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 0 12px; border-radius: 7px; border: 1.5px solid var(--line-2); background: var(--surface); font-family: inherit; font-size: 0.9333rem; color: var(--ink); cursor: pointer; text-align: left; transition: border-color .15s, box-shadow .15s; }
.st-fieldbox:hover { border-color: #97A69F; }
.st-fieldbox.is-open, .st-fieldbox:focus-within, .st-fieldbox:focus-visible { border-color: var(--pri); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pri) 18%, transparent); outline: none; }
.st-fieldbox.is-input { cursor: text; }
.st-fieldbox input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-family: inherit; font-size: 0.9333rem; color: var(--ink); height: 37px; }
.st-fieldbox input::placeholder, .st-fplaceholder { color: #8A9792; }
.st-fchev { color: var(--muted); transition: transform .2s var(--ease); }
.st-fieldbox.is-open .st-fchev { transform: rotate(180deg); }
.st-fpanel.is-right { left: auto; right: 0; }
.st-fpanel { position: absolute; left: 0; min-width: 100%; width: max(100%, 300px); max-width: calc(100vw - 32px); top: calc(100% + 6px); z-index: 40; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px; box-shadow: 0 18px 40px -16px rgba(16,32,28,.35); animation: st-in .16s var(--ease) both; }
.st-fopt { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; border-radius: 6px; background: transparent; font-family: inherit; color: var(--ink); cursor: pointer; text-align: left; }
.st-fopt[data-active] { background: var(--hover); }
.st-fopt[data-selected] { background: var(--pri-50); }
.st-portaltab { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 9px; border: 1.5px solid var(--line); background: var(--surface); cursor: pointer; text-align: left; font-family: inherit; color: var(--ink); transition: border-color .2s, background-color .2s, box-shadow .2s; }
.st-portaltab:hover { border-color: var(--line-2); }
.st-portaltab[aria-pressed="true"] { border-color: var(--pri); background: var(--pri-50); box-shadow: inset 0 0 0 1px var(--pri); }
.st-portaltab-ico { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 8px; background: var(--neutral-bg); color: var(--muted); transition: background-color .2s, color .2s; }
.st-portaltab[aria-pressed="true"] .st-portaltab-ico { background: var(--pri); color: #fff; }

/* the bridge (Institute portal) */
.st-bridge-draw { stroke-dasharray: 720; stroke-dashoffset: 720; animation: st-draw 1.5s var(--ease) forwards; }
@keyframes st-draw { to { stroke-dashoffset: 0; } }
.st-bridge-rise { transform-box: fill-box; transform-origin: bottom; transform: scaleY(0); animation: st-grow .7s var(--ease) forwards; }
@keyframes st-grow { to { transform: scaleY(1); } }
.st-bridge-light { offset-path: path("M0 250 L640 250"); offset-rotate: 0deg; opacity: 0; animation: st-travel 4.8s linear infinite; }
@keyframes st-travel { 0% { offset-distance: 0%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; } }
.st-bridge-water { animation: st-water 6s ease-in-out infinite alternate; }
.st-bridge-water.is-2 { animation-duration: 8s; }
@keyframes st-water { from { transform: translateX(-14px); } to { transform: translateX(14px); } }

/* components set their own display; let Tailwind's responsive visibility win */
.st-btn.hidden { display: none; }
@media (min-width: 768px) { .st-btn.md\\:inline-flex { display: inline-flex; } }
@media (min-width: 1024px) { .st-btn.lg\\:hidden { display: none; } }
@media (min-width: 1280px) { .st-btn.xl\\:hidden { display: none; } }

/* grid children may shrink below their content (long text, selects) */
.grid > * { min-width: 0; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}

/* ── portal finish: tiles, hero, page titles, card icons ────────────────── */
.st-tile { position: relative; overflow: hidden; border-top: 3px solid var(--tile, var(--line)); }
.st-tile-ico { background: color-mix(in srgb, var(--tile) 13%, transparent); color: var(--tile); }
.st-card.is-hover:hover { box-shadow: var(--sh-2); border-color: var(--line-2); }
.st-card-ico { display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; border-radius: 8px; background: var(--pri-50); color: var(--pri-7); }
.st-pagehead-bar { width: 4px; align-self: stretch; min-height: 1.6em; border-radius: 4px; background: linear-gradient(180deg, #FF9933, var(--pri) 55%, #138808); flex: none; }
.st-hero { position: relative; overflow: hidden; border-radius: 12px; padding: 18px 22px 20px; color: #fff; background: linear-gradient(118deg, var(--pri-8) 0%, var(--pri-7) 55%, var(--pri) 100%); box-shadow: 0 16px 34px -22px rgba(0,0,0,.55); }
.st-hero::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: linear-gradient(90deg, #FF9933 0 33.3%, #fff 33.3% 66.6%, #138808 66.6%); opacity: .9; }
.st-hero-mark { position: absolute; right: -40px; top: 50%; transform: translateY(-50%); opacity: .10; pointer-events: none; animation: st-spin 90s linear infinite; }
@keyframes st-spin { to { transform: translateY(-50%) rotate(360deg); } }
.st-hero-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 99px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22); font-size: .8333rem; color: #fff; }
.st-btn-hero { background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.32); color: #fff; }
.st-btn-hero:hover { background: rgba(255,255,255,.24); }
.st-btn-herosolid { background: #fff; color: var(--pri-8); border-color: #fff; }
.st-btn-herosolid:hover { background: #F1F5F3; }
:root[data-theme="dark"] .st-hero { background: linear-gradient(118deg, #0B3A24 0%, var(--pri-8) 50%, #1A6B45 100%); }
:root[data-theme="dark"][data-portal="institute"] .st-hero { background: linear-gradient(118deg, #0D2744 0%, #123A68 55%, #1F5596 100%); }
:root[data-theme="dark"] .st-btn-herosolid { background: rgba(255,255,255,.92); color: #0C1310; }
@media (prefers-reduced-motion: reduce) { .st-hero-mark { animation: none; } }

/* ── sidebar: glassy hover, tricolour marker, collapsible rail ──────────── */
.st-side { position: relative; z-index: 50; transition: width .28s var(--ease); }
.st-side-body { display: flex; flex: 1; min-height: 0; flex-direction: column; overflow-y: auto; scrollbar-width: thin; }
.st-side-bottom { margin-top: auto; }
.st-side-bottom .st-notice { margin: 2px 12px 8px; }
.st-notice-one .st-notice-item { padding: 6px 11px 4px; }
.st-side-toggle { position: absolute; top: 66px; right: -12px; z-index: 60; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 99px; border: 1px solid var(--line-2); background: var(--surface); color: var(--muted); cursor: pointer; box-shadow: 0 2px 6px -2px rgba(0,0,0,.25); transition: color .15s, border-color .15s, transform .2s var(--ease); }
.st-side-toggle:hover { color: var(--pri-7); border-color: var(--pri); transform: scale(1.1); }
.st-side.is-collapsed { width: 78px; }
.st-sidenav { scrollbar-width: thin; }
.st-nav { transition: background-color .2s, color .2s, box-shadow .25s, translate .2s; }
.st-nav-ico { display: grid; place-items: center; width: 30px; height: 30px; flex: none; border-radius: 8px; color: #7A8883; transition: background-color .2s, color .2s, transform .25s var(--ease); }
.st-nav-ico svg { width: 18px; height: 18px; }
.st-nav:hover .st-nav-ico { color: var(--pri); transform: scale(1.08); }
.st-nav.is-active .st-nav-ico { background: var(--pri); color: #fff; box-shadow: 0 6px 14px -8px var(--pri); }
.st-nav::before { background: linear-gradient(180deg, #FF9933 0 33%, var(--pri) 33% 66%, #138808 66%) !important; width: 4px !important; }
.st-nav:hover {
  background-image: linear-gradient(115deg, transparent 25%, rgba(255,255,255,.55) 45%, transparent 62%), linear-gradient(180deg, rgba(255,255,255,.35) 0%, rgba(255,255,255,.1) 55%, rgba(255,255,255,.08) 100%);
  background-size: 260% 100%, 100% 100%; background-repeat: no-repeat; animation: st-sweep .85s ease-out 1;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.7), 0 0 0 3px rgba(255,153,51,.1), 0 8px 18px -14px rgba(0,0,0,.35); translate: 2px 0;
}
@keyframes st-sweep { from { background-position: 140% 0, 0 0; } to { background-position: -140% 0, 0 0; } }
.st-nav.is-active { animation: st-navin .35s var(--ease) both; }
@keyframes st-navin { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--pri) 35%, transparent); } to { box-shadow: 0 0 0 0 transparent; } }
.st-side.is-collapsed .st-nav { justify-content: center; padding: 5px 0; }
.st-side.is-collapsed .st-nav::before { left: -12px; }
.st-nav-rule { margin: 8px 10px; border: 0; border-top: 1px solid var(--line); }
.st-count.is-dot { position: absolute; top: 2px; right: 10px; min-width: 16px; height: 16px; padding: 0 4px; font-size: .6333rem; background: var(--acc); color: #fff; }
:root[data-theme="dark"] .st-nav:hover { background-image: linear-gradient(115deg, transparent 25%, rgba(255,255,255,.1) 45%, transparent 62%); box-shadow: 0 0 0 3px rgba(255,153,51,.1); }

/* ── notice board · सूचना पट्ट ─────────────────────────────────────────── */
.st-notice { margin: 6px 12px 10px; flex: none; overflow: hidden; border-radius: 12px; border: 1px solid var(--line); background: linear-gradient(180deg, var(--pri-50), var(--surface) 70%); box-shadow: var(--sh-1); }
.st-notice-head { display: flex; align-items: center; gap: 7px; padding: 7px 8px 7px 10px; background: linear-gradient(90deg, var(--pri-8), var(--pri-7)); color: #fff; font-size: .8rem; font-weight: 700; }
.st-notice-bell { transform-origin: 50% 0; animation: st-ring 4s ease-in-out infinite; }
@keyframes st-ring { 0%, 86%, 100% { transform: rotate(0); } 88% { transform: rotate(14deg); } 91% { transform: rotate(-12deg); } 94% { transform: rotate(8deg); } 97% { transform: rotate(-4deg); } }
.st-notice-btn { display: grid; place-items: center; width: 22px; height: 22px; border: 0; border-radius: 6px; background: rgba(255,255,255,.16); color: #fff; cursor: pointer; }
.st-notice-btn:hover { background: rgba(255,255,255,.3); }
.st-notice-new { display: inline-flex; align-items: center; height: 16px; padding: 0 5px; border-radius: 4px; background: #D93A2B; color: #fff; font-size: .6rem; font-weight: 800; letter-spacing: .06em; animation: st-newblink 1.3s ease-in-out infinite; }
@keyframes st-newblink { 50% { opacity: .45; } }
.st-notice-view { position: relative; height: 188px; overflow: hidden; -webkit-mask-image: linear-gradient(180deg, transparent, #000 10%, #000 88%, transparent); mask-image: linear-gradient(180deg, transparent, #000 10%, #000 88%, transparent); }
.st-notice-track { animation: st-vmarquee linear infinite; will-change: transform; }
.st-notice-track.is-paused { animation-play-state: paused; }
@keyframes st-vmarquee { from { transform: translateY(0); } to { transform: translateY(-50%); } }
.st-notice-item { display: block; padding: 8px 11px 9px; border-bottom: 1px dashed var(--line); text-decoration: none; font-family: inherit; cursor: pointer; transition: background-color .15s; }
.st-notice-item:hover { background-color: color-mix(in srgb, var(--pri-50) 70%, var(--surface)); }
.st-notice-item:hover .st-notice-text { color: var(--pri-7); text-decoration: underline; text-underline-offset: 2px; }
.st-notice-text { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-top: 3px; font-size: .8rem; line-height: 1.4; color: var(--ink-2); }
.st-notice-tag { display: inline-flex; align-items: center; height: 16px; padding: 0 6px; border-radius: 4px; font-size: .6rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: #fff; background: #6B7B75; }
.st-notice-tag.is-good { background: #1E9E5A; } .st-notice-tag.is-watch { background: #C27803; } .st-notice-tag.is-flag { background: #C8372D; } .st-notice-tag.is-info { background: #2F6FC2; } .st-notice-tag.is-accent { background: #D9731A; } .st-notice-tag.is-tip { background: #0E8A8A; }
.st-notice-one { display: flex; flex-direction: column; justify-content: space-between; }
.st-notice-one .st-notice-text { -webkit-line-clamp: 2; }
.st-notice-rise { animation: st-rise .45s var(--ease) both; }
@keyframes st-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.st-notice-dots { display: inline-flex; gap: 3px; }
.st-notice-dots i { width: 5px; height: 5px; border-radius: 99px; background: var(--line-2); transition: width .2s, background-color .2s; }
.st-notice-dots i.is-on { width: 12px; background: var(--pri); }
.st-notice-step { display: grid; place-items: center; width: 22px; height: 22px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink-2); cursor: pointer; }
.st-notice-step:hover { border-color: var(--pri); color: var(--pri-7); }
.st-notice-mini { position: relative; display: grid; place-items: center; width: 48px; height: 44px; margin: 6px auto 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--pri-50); color: var(--pri-7); cursor: pointer; }
.st-notice-mini .st-notice-new { position: absolute; top: -6px; right: -8px; }
.st-drawer .st-notice { margin-top: 4px; }
@media (prefers-reduced-motion: reduce) { .st-notice-track { animation: none; } .st-notice-view { overflow-y: auto; } .st-notice-bell, .st-notice-new { animation: none; } .st-nav:hover { animation: none; translate: none; } }
:root[data-theme="dark"] .st-notice-head { background: linear-gradient(90deg, #0A3321, #11573A); }
:root[data-theme="dark"][data-portal="institute"] .st-notice-head { background: linear-gradient(90deg, #0B2340, #133D6E); }
:root[data-contrast="1"] .st-notice-head { background: #000; }

/* ── dark mode (inside the portal) ─────────────────────────────────────── */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0C1310; --surface: #141D19; --subtle: #18221E; --line: #26332D; --line-2: #36453E;
  --ink: #E6EEEA; --ink-2: #C3CFC9; --muted: #93A29B;
  --pri: #1E8C55; --pri-7: #56C68C; --pri-8: #0E4F31; --pri-50: #16291F; --pri-100: #1D3A2B;
  --acc: #F0A157; --acc-50: #33230F;
  --ok: #56C68C; --ok-50: #142B1E; --warn: #E6B450; --warn-50: #2F240E; --bad: #F2857A; --bad-50: #361816; --info: #86B5F0; --info-50: #142338;
  --gov: #070D0B;
  --seg: #1C2722; --neutral-bg: #1D2823; --grid: #26332D; --hover: #1E2A25; --skel-a: #19231F; --skel-b: #212D28;
  --info-line: #274769; --info-ink: #B7D3F7; --acc-line: #5A3B16; --acc-ink: #F6C58F; --ok-line: #25543A; --ok-ink: #A9E3C2; --bad-line: #5C2622; --bad-ink: #F7B7B0;
  --c-green: #3DBB7A; --c-saffron: #F0A157; --c-blue: #6FA5EC; --c-purple: #A38BF0; --c-teal: #3CC2C2; --c-rose: #EE7D98;
  --sh-1: 0 1px 2px rgba(0,0,0,.4); --sh-2: 0 12px 28px -14px rgba(0,0,0,.7);
}
:root[data-theme="dark"][data-portal="institute"] { --pri: #2F6FC2; --pri-7: #7FB0EE; --pri-8: #123A68; --pri-50: #13233A; --pri-100: #1A3252; --bg: #0B1118; --surface: #131B25; --subtle: #17202B; --line: #243140; --line-2: #33445A; }
:root[data-theme="dark"] body { background: var(--bg); }
:root[data-theme="dark"] .bg-white { background-color: var(--surface) !important; }
:root[data-theme="dark"] [class*="hover:bg-[#F"]:hover, :root[data-theme="dark"] [class*="hover:bg-[#f"]:hover { background-color: var(--hover) !important; }
:root[data-theme="dark"] .st-btn-primary:hover { filter: brightness(1.12); }
:root[data-theme="dark"] .st-modal-back { background: rgba(0,0,0,.6); }
:root[data-theme="dark"] .st-nav.is-active { color: var(--pri-7); }
:root[data-theme="dark"] .st-seg button[aria-pressed="true"] { background: var(--line-2); color: #fff; }
:root[data-theme="dark"] .st-seg button { color: var(--ink-2); }
:root[data-theme="dark"] .st-header, :root[data-theme="dark"] .st-side { background: var(--surface); }
:root[data-theme="dark"] img, :root[data-theme="dark"] .st-keep-light { color-scheme: light; }
:root[data-theme="dark"][data-contrast="1"] { --bg: #000; --surface: #000; --subtle: #000; --ink: #fff; --ink-2: #f2f2f2; --muted: #d6d6d6; --line: #9a9a9a; --line-2: #cfcfcf; --pri-7: #7CE0A8; }

/* ── security: sign-in extras, idle warning, the Security page ─────────── */
.st-fieldbox input.st-otp { font-family: 'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.2rem; font-weight: 600; letter-spacing: .38em; }
.st-fieldbox input.st-otp::placeholder { letter-spacing: .38em; color: #B4BEB9; }
.st-caps { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; color: var(--warn); }
.st-meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.st-meter i { height: 6px; border-radius: 99px; background: var(--seg); transition: background-color .25s; }
.st-checklist { display: grid; gap: 4px 14px; margin: 0; padding: 0; list-style: none; font-size: 0.8333rem; }
@media (min-width: 640px) { .st-checklist { grid-template-columns: 1fr 1fr; } }
.st-checklist li { display: flex; align-items: flex-start; gap: 6px; color: var(--muted); }
.st-checklist li > span:first-child { display: grid; place-items: center; flex: none; width: 16px; height: 16px; margin-top: 1px; border-radius: 99px; border: 1.5px solid var(--line-2); }
.st-checklist li.is-ok { color: var(--ink-2); }
.st-checklist li.is-ok > span:first-child { border-color: var(--ok); background: var(--ok); color: #fff; }
.st-secret { display: flex; flex-wrap: wrap; gap: 6px 10px; padding: 10px 12px; border: 1px dashed var(--line-2); border-radius: 8px; background: var(--subtle); font-family: 'Noto Sans Mono', ui-monospace, monospace; font-size: 0.9667rem; font-weight: 600; letter-spacing: .06em; color: var(--ink); }
.st-codes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 12px; list-style: none; border: 1px solid var(--line); border-radius: 8px; background: var(--subtle); font-family: 'Noto Sans Mono', ui-monospace, monospace; font-size: 0.9333rem; font-weight: 600; color: var(--ink); text-align: center; }
.st-steps { display: flex; gap: 6px; margin: 0 0 14px; padding: 0; list-style: none; }
.st-steps li { flex: 1; height: 4px; border-radius: 99px; background: var(--seg); }
.st-steps li.is-on { background: var(--pri); }
.st-idle-clock { font-size: 2.6rem; line-height: 1; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink); letter-spacing: .02em; }
.st-idle-ring { display: grid; place-items: center; width: 64px; height: 64px; flex: none; border-radius: 99px; background: var(--warn-50); color: var(--warn); }
.st-updated { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--muted); white-space: nowrap; }
.st-updated button { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); cursor: pointer; transition: color .15s, border-color .15s; }
.st-updated button:hover { color: var(--pri); border-color: var(--pri); }
.st-updated button.is-spin svg { animation: st-spin .8s linear; }
.st-session { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.st-session:last-child { border-bottom: 0; }
.st-session-ico { display: grid; place-items: center; width: 38px; height: 38px; flex: none; border-radius: 10px; background: var(--pri-50); color: var(--pri); }
@media (prefers-reduced-motion: reduce) { .st-updated button.is-spin svg { animation: none; } }
`;

function SetuTheme() {
  return <style>{SETU_CSS}</style>;
}

/* ══════════════════════════════════════════════════════════════════════════
   §9  UI KIT
   ══════════════════════════════════════════════════════════════════════════ */

/* icons — 24px grid, 1.7 stroke, one visual family throughout */
const ICON_PATHS = {
  home: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  rupee: <path d="M7 4h10M7 8.5h10M7 4c5 0 7 1.5 7 4.5S12 13 7 13l8 7" />,
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  fileCheck: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 14l2 2 4-4" />,
  chat: <path d="M20 14a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h12a2 2 0 012 2z" />,
  chatPlus: <path d="M20 14a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h12a2 2 0 012 2zM12 6.5v6M9 9.5h6" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />,
  bell: <path d="M6 9a6 6 0 1112 0c0 5 2 6.5 2 6.5H4S6 14 6 9zM10 19a2 2 0 004 0" />,
  scale: <path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 006 0zM19 7l-3 6a3 3 0 006 0z" />,
  user: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" />,
  help: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.1-1.5 2.2M12 17h.01" />,
  alert: <path d="M12 3l9.5 16.5h-19zM12 10v4M12 17h.01" />,
  building: <path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11h1M15 11h1" />,
  refresh: <path d="M4 12a8 8 0 0113.7-5.7M20 12a8 8 0 01-13.7 5.7M17 3v3.5h-3.5M7 21v-3.5h3.5" />,
  upload: <path d="M12 15V4M7 9l5-5 5 5M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" />,
  search: <path d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  clock: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2" />,
  calendar: <path d="M4 6h16v15H4zM4 10h16M8 3v4M16 3v4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" />,
  globe: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />,
  pin: <path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />,
  lock: <path d="M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11" />,
  unlock: <path d="M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 016.8-1.2" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  info: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01" />,
  volume: <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />,
  stop: <path d="M7 7h10v10H7z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6z" />,
  shieldCheck: <path d="M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6zM9 12l2 2 4-4" />,
  health: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10zM8 12h2.5l1-2 1.5 4 1-2H16" />,
  book: <path d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 004 21.5zM4 5.5v16M8 7h8" />,
  food: <path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v3h3" />,
  water: <path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" />,
  mic: <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zM6 11a6 6 0 0012 0M12 17v4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  eye: <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z" />,
  eyeOff: <path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a17.7 17.7 0 01-3.2 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c2 0 3.8-.6 5.3-1.6M9.9 9.9a3 3 0 004.2 4.2" />,
  copy: <path d="M9 9h11v11H9zM5 15H4V4h11v1" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M4 19h16" />,
  key: <path d="M14.5 14a5 5 0 10-4.6-3L3 17.9V21h3.1v-2h2v-2h2l1.8-1.8a5 5 0 002.6-1.2zM16.5 7.5h.01" />,
  monitor: <path d="M3 4h18v12H3zM8 20h8M12 16v4" />,
  mobile: <path d="M7 3h10v18H7zM11 18h2" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  contrast: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 3v18" fill="none" />,
  bridge: <path d="M2 17h20M4 17v-4M20 17v-4M8 17v-6M16 17v-6M12 17V9M2 13c5-6 15-6 20 0" />,
  landmark: <path d="M3 21h18M4 10h16M12 3l9 5H3zM6 10v8M10 10v8M14 10v8M18 10v8" />,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />,
  target: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01" />,
  sun: <path d="M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
  moon: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
};
function Icon({ name, size, className = "", style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      {ICON_PATHS[name] || ICON_PATHS.info}
    </svg>
  );
}

/** The Setu mark: a bridge span over water, in a square. */
function SetuMark({ size = 36, light = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="8" fill={light ? "#fff" : C.pri} />
      <path d="M7 25 Q20 11 33 25" fill="none" stroke={light ? C.pri : "#fff"} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6 25.5h28" stroke={light ? C.pri : "#fff"} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12.5 25.5v-4.6M20 25.5v-7.8M27.5 25.5v-4.6" stroke={light ? C.pri : "#fff"} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8 30.5h24" stroke={C.saffron} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Ashoka Chakra, drawn — used small and quiet. */
function Chakra({ size = 24, color = C.chakra, className = "" }) {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    return <line key={i} x1={12 + 2.2 * Math.cos(a)} y1={12 + 2.2 * Math.sin(a)} x2={12 + 10.2 * Math.cos(a)} y2={12 + 10.2 * Math.sin(a)} />;
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" strokeWidth="1.2" />
      <g strokeWidth=".6">{spokes}</g>
      <circle cx="12" cy="12" r="2" fill={color} stroke="none" />
    </svg>
  );
}

function Card({ children, className = "", hover = false, as: As = "div", ...rest }) {
  return (
    <As className={`st-card ${hover ? "is-hover" : ""} ${className}`} {...rest}>
      {children}
    </As>
  );
}

/** A card with a titled header row, the main building block of every page. */
function Panel({ title, hi, icon, action, children, className = "", bodyClassName = "", id, ...rest }) {
  return (
    <section className={`st-card ${className}`} id={id} aria-label={typeof title === "string" ? title : undefined} {...rest}>
      {title && (
        <header className="st-card-head">
          <h2 className="st-card-title flex min-w-0 items-center gap-2">
            {icon && <span className="st-card-ico"><Icon name={icon} size={16} /></span>}
            <Tx en={title} hi={hi} inline subClassName="text-[0.8333rem] font-medium" />
          </h2>
          {action}
        </header>
      )}
      <div className={`st-card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function Button({ variant = "primary", size = "md", loading = false, disabled, className = "", icon, iconRight, children, ...rest }) {
  return (
    <button className={`st-btn st-btn-${variant} st-btn-${size} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner /> : icon ? <Icon name={icon} /> : null}
      {children}
      {iconRight && !loading && <Icon name={iconRight} />}
    </button>
  );
}
/** A react-router Link styled as a button. */
function ButtonLink({ to, variant = "primary", size = "md", icon, iconRight, className = "", children, ...rest }) {
  return (
    <Link to={to} className={`st-btn st-btn-${variant} st-btn-${size} ${className}`} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </Link>
  );
}
function TextLink({ to, children, className = "" }) {
  return (
    <Link to={to} className={`st-link ${className}`}>
      {children}
      <Icon name="arrowRight" />
    </Link>
  );
}
function Spinner({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="st-spin" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.2" />
      <path d="M8 1.5A6.5 6.5 0 0114.5 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function Badge({ tone = "neutral", dot = false, children, className = "" }) {
  return <span className={`st-badge st-tone-${tone} ${dot ? "has-dot" : ""} ${className}`}>{children}</span>;
}
function Skeleton({ className = "", style }) {
  return <div className={`st-skel ${className}`} style={style} aria-hidden="true" />;
}
function Progress({ value = 0, tone }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.max(0, Math.min(100, value))), 60);
    return () => clearTimeout(t);
  }, [value]);
  const bg = { good: "var(--ok)", watch: "var(--warn)", flag: "var(--bad)", accent: "var(--acc)" }[tone];
  return (
    <div className="st-progress" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${w}%`, background: bg }} />
    </div>
  );
}

/** Breadcrumb + title + one line of purpose + actions. */
function PageHead({ en, hi, lede, crumbs, children }) {
  const { tx } = useLang();
  return (
    <header className="mb-4">
      <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[0.8333rem]" style={{ color: C.muted }}>
        <Link to="/" className="hover:underline" style={{ color: C.muted }}>{tx("Home", "होम")}</Link>
        {(crumbs || []).map((c) => (
          <span key={c.to} className="flex items-center gap-1.5">
            <Icon name="chevronRight" size={13} />
            <Link to={c.to} className="hover:underline" style={{ color: C.muted }}>{c.label}</Link>
          </span>
        ))}
        {en && (
          <span className="flex items-center gap-1.5">
            <Icon name="chevronRight" size={13} />
            <span style={{ color: C.ink2 }}>{tx(en, hi)}</span>
          </span>
        )}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex gap-3">
            <span className="st-pagehead-bar" aria-hidden="true" />
            <h1 className="st-display m-0 text-[1.4667rem] leading-tight" style={{ color: C.ink }}>
              <Tx en={en} hi={hi} subClassName="mt-0.5 text-[0.9333rem] font-medium tracking-normal" />
            </h1>
          </div>
          {lede && <p className="m-0 mt-2 text-[0.9333rem] leading-relaxed" style={{ color: C.muted }}>{lede}</p>}
        </div>
        {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

/** The welcome banner at the top of each Overview. */
function HeroHeader({ eyebrow, title, meta = [], children }) {
  return (
    <section className="st-hero mb-4" aria-label={typeof title === "string" ? title : undefined}>
      <span className="st-hero-mark" aria-hidden="true"><AshokaChakra size={210} /></span>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="m-0 text-[0.8333rem]" style={{ color: "rgba(255,255,255,.78)" }}>{eyebrow}</p>}
          <h1 className="st-display m-0 mt-0.5 text-[1.5333rem] leading-tight text-white">{title}</h1>
          {meta.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {meta.filter(Boolean).map((m, k) => (
                <span key={k} className={`st-hero-chip ${m.mono ? "st-mono" : ""}`}>
                  {m.icon && <Icon name={m.icon} size={13} />} {m.text}
                </span>
              ))}
            </div>
          )}
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  );
}

function Empty({ icon = "info", title, body, action }) {
  return (
    <div className="rounded-lg border border-dashed px-6 py-10 text-center" style={{ borderColor: "var(--line-2)", background: "var(--subtle)" }}>
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full" style={{ background: "var(--surface)", border: "1px solid var(--line)", color: C.muted }}>
        <Icon name={icon} size={20} />
      </span>
      <p className="m-0 text-[0.9333rem] font-semibold" style={{ color: C.ink }}>{title}</p>
      {body && <p className="mx-auto m-0 mt-1 max-w-sm text-sm" style={{ color: C.muted }}>{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
function ErrorBox({ message, onRetry, children }) {
  const { tx } = useLang();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm" style={{ background: "var(--bad-50)", borderColor: "#F3C7C2", color: "#7A1A12" }} role="alert">
      <Icon name="alert" size={18} />
      <span className="min-w-0 flex-1">{message}</span>
      {children}
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} icon="refresh">
          {tx("Try again", "फिर कोशिश करें")}
        </Button>
      )}
    </div>
  );
}
/** For a section whose backend route doesn't exist yet. */
function NotYet({ what }) {
  const { tx } = useLang();
  return (
    <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--info-50)", color: "var(--info-ink)" }}>
      <Icon name="clock" size={17} className="mt-0.5 shrink-0" />
      <span>
        <strong>{what}</strong> — {tx("will appear here once it is connected. Everything else works.", "जुड़ने के बाद यहाँ दिखेगा। बाकी सब काम करता है।")}
      </span>
    </div>
  );
}
function Callout({ tone = "info", icon, title, children, action }) {
  const map = {
    info: ["var(--info-50)", "var(--info-line)", "var(--info-ink)"],
    accent: ["var(--acc-50)", "var(--acc-line)", "var(--acc-ink)"],
    good: ["var(--ok-50)", "var(--ok-line)", "var(--ok-ink)"],
    flag: ["var(--bad-50)", "var(--bad-line)", "var(--bad-ink)"],
  }[tone];
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3" style={{ background: map[0], borderColor: map[1], color: map[2] }}>
      {icon && <Icon name={icon} size={18} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="m-0 font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

function CountUp({ to, decimals = 0, ms = 900 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / ms);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{v.toFixed(decimals)}</>;
}

/** A score out of 100 as a thin ring. */
function ScoreRing({ value, size = 132, stroke = 9, tone = "good", label }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(Math.max(0, Math.min(100, num(value)))), 80);
    return () => clearTimeout(t);
  }, [value]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { good: "var(--ok)", watch: "var(--warn)", flag: "var(--bad)" }[tone] || "var(--pri)";
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label || "Score"}: ${num(value).toFixed(1)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} style={{ transition: "stroke-dashoffset 1.2s var(--ease)" }} />
      </svg>
      <div className="absolute text-center">
        <div className="st-display st-tnum text-[1.6667rem] leading-none" style={{ color: C.ink }}>
          <CountUp to={num(value)} decimals={1} />
        </div>
        <div className="mt-1 text-xs font-medium" style={{ color: C.muted }}>of 100</div>
      </div>
    </div>
  );
}
function Sparkline({ values = [], width = 160, height = 40 }) {
  if (values.length < 2) return null;
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - ((v - min) / (max - min)) * height]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={C.pri} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={C.pri} stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The track — Setu's signature. steps: [{label, date?}], `at` = how many are
 * complete. `blocked` marks the current step as waiting on the beneficiary.
 */
function Track({ steps, at = 0, blocked = false, compact = false }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(at), 80);
    return () => clearTimeout(t);
  }, [at]);
  return (
    <ol className="st-track m-0 p-0" style={{ listStyle: "none" }} aria-label={`${at} of ${steps.length} stages complete`}>
      {steps.map((s, i) => {
        const done = i < at;
        const current = i === at && at < steps.length;
        const cls = done ? "is-done" : current ? (blocked ? "is-blocked" : "is-current") : "is-todo";
        return (
          <li key={i} className={`st-track-step ${cls}`} aria-current={current ? "step" : undefined}>
            {i < steps.length - 1 && (
              <span className="st-track-line">
                <i style={{ width: i < shown ? "100%" : "0%", transitionDelay: `${i * 120}ms` }} />
              </span>
            )}
            <span className="st-track-node">{done && <Icon name="check" />}</span>
            {!compact && (
              <>
                <div className="st-track-label">{s.label}</div>
                {s.date && <div className="st-track-date">{s.date}</div>}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Rendered into <body> above the header, Yukt and the tour, so a page's
 * entrance animation (a transform) can't trap it inside the page area.
 */
function Modal({ open, onClose, title, children, footer, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.activeElement;
    setTimeout(() => ref.current?.querySelector("input, textarea, select, button")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[195] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div className="st-modal-back" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`st-modal relative flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:rounded-xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
          <h2 className="st-display m-0 text-[1.0333rem]" style={{ color: C.ink }}>{title}</h2>
          <button type="button" onClick={onClose} className="st-btn st-btn-ghost st-btn-sm !px-2" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--line)" }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

const ToastContext = createContext(null);
function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((kind, text) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ success: (t) => push("good", t), error: (t) => push("flag", t), info: (t) => push("info", t) }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[200] flex w-[min(92vw,24rem)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="st-toast pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg" style={{ borderColor: "var(--line)", borderLeft: `4px solid ${t.kind === "good" ? "var(--ok)" : t.kind === "flag" ? "var(--bad)" : "var(--info)"}` }}>
            <Icon name={t.kind === "good" ? "check" : t.kind === "flag" ? "alert" : "info"} size={17} style={{ color: t.kind === "good" ? "var(--ok)" : t.kind === "flag" ? "var(--bad)" : "var(--info)", marginTop: 1 }} />
            <span style={{ color: C.ink }}>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
const useToast = () => useContext(ToastContext);

function FileDrop({ onFile, accept = ".pdf,.jpg,.jpeg,.png", hint }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const { tx } = useLang();
  return (
    <div
      className={`st-drop cursor-pointer px-5 py-7 text-center ${over ? "is-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
      }}
      onClick={() => input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
    >
      <Icon name="upload" size={22} style={{ color: C.pri }} />
      <p className="m-0 mt-2 text-sm font-semibold" style={{ color: C.ink }}>{tx("Drag a file here, or choose one", "फ़ाइल यहाँ खींचें, या चुनें")}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: C.muted }}>{hint || tx("PDF, JPG or PNG · up to 10 MB", "PDF, JPG या PNG · 10 MB तक")}</p>
      <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}
const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

const TILE_COLOR = { green: "var(--c-green)", saffron: "var(--c-saffron)", blue: "var(--c-blue)", purple: "var(--c-purple)", teal: "var(--c-teal)", rose: "var(--c-rose)" };
function StatTile({ icon, en, hi, value, sub, tone = "neutral", to, color }) {
  const accent = TILE_COLOR[color];
  const body = (
    <Card hover={Boolean(to)} className="st-tile h-full px-4 py-3.5" style={accent ? { "--tile": accent } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-[0.8333rem] font-medium leading-snug" style={{ color: C.muted }}>
          <Tx en={en} hi={hi} subClassName="block text-[0.7333rem] font-normal" />
        </p>
        <span className={accent ? "st-tile-ico grid h-8 w-8 shrink-0 place-items-center rounded-lg" : `st-tone-${tone} grid h-8 w-8 shrink-0 place-items-center rounded-lg`}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <p className="st-display st-tnum m-0 mt-1 text-[1.3333rem] leading-tight" style={{ color: C.ink }}>{typeof value === "number" ? <CountUp to={value} /> : value}</p>
      {sub && <p className="m-0 mt-0.5 truncate text-[0.8rem]" style={{ color: C.muted }}>{sub}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

function SearchInput({ value, onChange, placeholder, label, className = "", inputRef, onKeyDown, id }) {
  return (
    <div className={`st-search ${className}`}>
      <Icon name="search" />
      <input ref={inputRef} id={id} className="st-field" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} onKeyDown={onKeyDown} />
    </div>
  );
}

/** Segmented filter with counts. options: [[key, en, hi, count?]] */
function Segmented({ value, onChange, options, label }) {
  const { tx } = useLang();
  return (
    <div className="st-seg max-w-full overflow-x-auto" role="group" aria-label={label}>
      {options.map(([k, en, hi, count]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          {tx(en, hi)}
          {count !== undefined && <span className="st-tnum ml-1.5 opacity-70">{count}</span>}
        </button>
      ))}
    </div>
  );
}
function ClearFilters({ show, onClear }) {
  const { tx } = useLang();
  if (!show) return null;
  return (
    <Button size="sm" variant="ghost" icon="x" onClick={onClear} style={{ color: "var(--bad)" }}>
      {tx("Clear all filters", "सभी फ़िल्टर हटाएँ")}
    </Button>
  );
}

/** Keeps one broken page from blanking the whole portal. */
class PageBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Setu page error", error, info); // eslint-disable-line no-console
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="st-card mx-auto my-10 max-w-lg p-6 text-center">
        <p className="st-display m-0 text-lg">This page couldn't be shown</p>
        <p className="m-0 mt-1 text-sm" style={{ color: C.muted }}>यह पेज दिखाया नहीं जा सका। Please reload — the rest of Setu is unaffected.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="st-btn st-btn-primary st-btn-md" onClick={() => location.reload()}>Reload</button>
          <a href="/" className="st-btn st-btn-secondary st-btn-md">Go to overview</a>
        </div>
      </div>
    );
  }
}

/* ----------------------------------------------------------- charts ---- */
/**
 * Charts follow one rule set: a single green for magnitude, status colours
 * only for status (always with a text label), thin marks with rounded data
 * ends, a recessive grid, a tooltip on hover/focus, and a table view.
 */
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};
const compactINR = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(v % 100000 ? 1 : 0)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `₹${v}`);

/** Vertical bars over time. data: [{key, label, value, note?}] */
function BarChart({ data, height = 190, format = (v) => v, axisFormat = format, title, emptyText = "No data yet" }) {
  const { tx } = useLang();
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, []);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const padL = 46;
  const padB = 24;
  const plotW = Math.max(0, w - padL - 4);
  const plotH = height - padB - 8;
  const slot = data.length ? plotW / data.length : 0;
  const bw = Math.max(4, Math.min(34, slot - 6));
  const y = (v) => 8 + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <button type="button" className="st-link !text-[0.8rem] border-0 bg-transparent p-0" style={{ fontFamily: "inherit", cursor: "pointer" }} onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? tx("Show chart", "चार्ट दिखाएँ") : tx("Show as table", "तालिका दिखाएँ")}
        </button>
      </div>
      {table ? (
        <div className="max-h-[260px] overflow-auto rounded-md border" style={{ borderColor: "var(--line)" }}>
          <table className="st-table">
            <thead>
              <tr><th>{tx("Period", "अवधि")}</th><th className="text-right">{title || tx("Value", "मान")}</th></tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}><td>{d.label}</td><td className="st-tnum text-right font-semibold">{format(d.value)}</td></tr>
              ))}
              <tr><td className="font-semibold">{tx("Total", "कुल")}</td><td className="st-tnum text-right font-semibold">{format(total)}</td></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
          {!data.length || total === 0 ? (
            <div className="grid h-full place-items-center text-sm" style={{ color: C.muted }}>{emptyText}</div>
          ) : w > 0 ? (
            <svg width={w} height={height} role="img" aria-label={title}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray={t === 0 ? "0" : "3 4"} />
                  <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#7A8883">{axisFormat(t)}</text>
                </g>
              ))}
              {data.map((d, i) => {
                const x = padL + i * slot + (slot - bw) / 2;
                const h = Math.max(0, y(0) - y(d.value));
                const r = Math.min(4, bw / 2, h);
                const top = y(0) - h;
                const path = h > 0 ? `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z` : "";
                const on = hover === i;
                return (
                  <g key={d.key}>
                    {h > 0 && (
                      <path d={path} fill={on ? "var(--pri-7)" : "var(--pri)"} opacity={hover === null || on ? 1 : 0.55} style={{ transformOrigin: `0 ${y(0)}px`, transform: grown ? "scaleY(1)" : "scaleY(0)", transition: `transform .7s var(--ease) ${i * 30}ms, opacity .15s, fill .15s` }} />
                    )}
                    <rect x={padL + i * slot} y={0} width={slot} height={height - padB + 4} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${d.label}: ${format(d.value)}`} />
                    {(data.length <= 12 || i % 2 === 0) && (
                      <text x={padL + i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize="11" fill={on ? C.ink : "#7A8883"} fontWeight={on ? 600 : 400}>{d.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          ) : null}
          {hover !== null && data[hover] && w > 0 && (
            <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border bg-white px-3 py-2 text-[0.8rem] shadow-lg" style={{ left: Math.min(Math.max(padL + hover * slot + slot / 2, 70), w - 70), top: Math.max(0, y(data[hover].value) - 58), borderColor: "var(--line)" }}>
              <p className="m-0 font-semibold" style={{ color: C.ink }}>{data[hover].label}</p>
              <p className="st-tnum m-0" style={{ color: C.ink2 }}>{format(data[hover].value)}</p>
              {data[hover].note && <p className="m-0" style={{ color: C.muted }}>{data[hover].note}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Parts of a whole by status: one stacked bar plus a labelled list. items: [{key, label, value, tone}] */
function StatusBreakdown({ items, unit = "" }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  const color = { good: "var(--ok)", watch: "#D08A12", flag: "var(--bad)", info: "var(--info)", neutral: "#9AA7A2", accent: "var(--acc)" };
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={items.map((i) => `${i.label}: ${i.value}`).join(", ")}>
        {items.filter((i) => i.value > 0).map((i) => (
          <span key={i.key} title={`${i.label}: ${i.value}${unit}`} style={{ width: grown ? `${(i.value / (total || 1)) * 100}%` : "0%", background: color[i.tone] || color.neutral, transition: "width .8s var(--ease)" }} />
        ))}
      </div>
      <ul className="m-0 mt-3 grid gap-1.5 p-0 text-[0.8667rem] sm:grid-cols-2" style={{ listStyle: "none" }}>
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color[i.tone] || color.neutral }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: C.ink2 }}>{i.label}</span>
            <span className="st-tnum font-semibold" style={{ color: C.ink }}>{i.value}{unit}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Last N calendar months as chart buckets: [{key: "2026-09", label: "Sep", start, end}] */
function lastMonths(n = 12) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short" }), year: d.getFullYear() };
  });
}
function paymentsByMonth(disbursements, n = 12) {
  const buckets = lastMonths(n).map((m) => ({ ...m, value: 0, count: 0 }));
  const idx = Object.fromEntries(buckets.map((b, i) => [b.key, i]));
  disbursements.forEach((d) => {
    const t = parseDate(d.at);
    if (!t) return;
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
    if (idx[k] !== undefined) {
      buckets[idx[k]].value += d.amount || 0;
      buckets[idx[k]].count += 1;
    }
  });
  return buckets.map((b) => ({ key: b.key, label: b.label, value: b.value, note: b.count ? `${b.count} payment${b.count > 1 ? "s" : ""} · ${b.label} ${b.year}` : `${b.label} ${b.year}` }));
}

/* ══════════════════════════════════════════════════════════════════════════
   §10  SHELL
   ══════════════════════════════════════════════════════════════════════════ */

const NAV = {
  beneficiary: [
    {
      group: "Dashboard",
      hi: "डैशबोर्ड",
      items: [
        { to: "/", en: "Overview", hi: "अवलोकन", icon: "grid", end: true },
        { to: "/activity", en: "Activity", hi: "गतिविधि", icon: "clock" },
      ],
    },
    {
      group: "Services",
      hi: "सेवाएँ",
      items: [
        { to: "/benefits", en: "Benefits & applications", hi: "लाभ व आवेदन", icon: "rupee", count: "actions" },
        { to: "/schemes", en: "Schemes & eligibility", hi: "योजनाएँ व पात्रता", icon: "landmark" },
        { to: "/my-documents", en: "Documents & verification", hi: "दस्तावेज़ व सत्यापन", icon: "fileCheck", count: "docs" },
        { to: "/grievances", en: "My grievances", hi: "मेरी शिकायतें", icon: "chat", count: "grievances" },
        { to: "/calls", en: "Verification calls", hi: "सत्यापन कॉल", icon: "phone" },
      ],
    },
    {
      group: "Information",
      hi: "जानकारी",
      items: [
        { to: "/notices", en: "Updates & notices", hi: "अपडेट व सूचनाएँ", icon: "bell", count: "notices" },
        { to: "/rights", en: "Rights & entitlements", hi: "अधिकार व पात्रताएँ", icon: "scale" },
        { to: "/ecosystem?to=nayan", en: "Know about Nayan", hi: "नयन के बारे में", icon: "eye" },
      ],
    },
    {
      group: "Account",
      hi: "खाता",
      items: [
        { to: "/profile", en: "My profile", hi: "मेरी प्रोफ़ाइल", icon: "user" },
        { to: "/help", en: "Help & support", hi: "सहायता", icon: "help" },
      ],
    },
  ],
  institute_staff: [
    {
      group: "Dashboard",
      hi: "डैशबोर्ड",
      items: [
        { to: "/", en: "Overview", hi: "अवलोकन", icon: "grid", end: true },
        { to: "/residents", en: "Residents", hi: "निवासी", icon: "user" },
      ],
    },
    {
      group: "Compliance",
      hi: "अनुपालन",
      items: [
        { to: "/findings", en: "Findings", hi: "निष्कर्ष", icon: "flag", count: "findings" },
        { to: "/renewal", en: "Registration renewal", hi: "पंजीकरण नवीनीकरण", icon: "refresh" },
        { to: "/institute", en: "Institute profile", hi: "संस्था प्रोफ़ाइल", icon: "building" },
      ],
    },
    { group: "Records", hi: "रिकॉर्ड", items: [{ to: "/documents", en: "Documents", hi: "दस्तावेज़", icon: "file" }] },
    {
      group: "Support",
      hi: "सहायता",
      items: [
        { to: "/grievances", en: "Grievances", hi: "शिकायतें", icon: "chat" },
        { to: "/notices", en: "Notices", hi: "सूचनाएँ", icon: "bell", count: "notices" },
        { to: "/help", en: "Help & support", hi: "सहायता", icon: "help" },
        { to: "/ecosystem?to=nayan", en: "Know about Nayan", hi: "नयन के बारे में", icon: "eye" },
      ],
    },
  ],
};

/* ---------------------------------------------- accessibility controls --- */
const TEXT_SIZES = [
  ["sm", "A−", "Smaller text"],
  ["md", "A", "Normal text"],
  ["lg", "A+", "Larger text"],
];
function readStore(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window */
  }
}
function useA11yPrefs({ portal = true } = {}) {
  const [size, setSize] = useState(() => readStore("setu.size", "md"));
  const [contrast, setContrast] = useState(() => readStore("setu.contrast", "0") === "1");
  const [theme, setTheme] = useState(() => readStore("setu.theme", "light"));
  // Dark mode is for the portal; the sign-in page stays light (the flag needs white).
  useEffect(() => {
    if (!portal) return;
    document.documentElement.setAttribute("data-theme", theme);
    writeStore("setu.theme", theme);
  }, [theme, portal]);
  useEffect(() => {
    document.documentElement.setAttribute("data-size", size);
    writeStore("setu.size", size);
  }, [size]);
  useEffect(() => {
    document.documentElement.setAttribute("data-contrast", contrast ? "1" : "0");
    writeStore("setu.contrast", contrast ? "1" : "0");
  }, [contrast]);
  // Yukt can change these ("bigger text", "high contrast").
  useEffect(() => {
    const on = (e) => {
      if (e.detail?.size) setSize(e.detail.size);
      if (typeof e.detail?.contrast === "boolean") setContrast(e.detail.contrast);
      if (e.detail?.theme) setTheme(e.detail.theme);
    };
    window.addEventListener("setu:a11y", on);
    return () => window.removeEventListener("setu:a11y", on);
  }, []);
  return { size, setSize, contrast, setContrast, theme, setTheme };
}

/** English ↔ the chosen language: which line leads. */
function LangOrderSwitch({ onDark = true }) {
  const { ui, uiMeta, localFirst, setOrder } = useLang();
  if (ui === "en") return null;
  const cls = onDark ? "st-utilbtn" : "st-btn st-btn-secondary st-btn-sm";
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Language order">
      <button type="button" className={cls} aria-pressed={!localFirst} onClick={() => setOrder("en")}>
        English
      </button>
      <button type="button" className={`${cls} ${ui === "hi" ? "st-hi" : "st-loc"}`} aria-pressed={localFirst} onClick={() => setOrder("local")} dir={uiMeta.rtl ? "rtl" : undefined}>
        {uiMeta.native}
      </button>
    </span>
  );
}

/** The Ashoka Chakra — 24 spokes — as the Government of India mark in the top bar. */
function AshokaChakra({ size = 18, color = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="24" r="21" fill="none" stroke={color} strokeWidth="3" />
      <circle cx="24" cy="24" r="4" fill={color} />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return <line key={i} x1={24 + Math.cos(a) * 5} y1={24 + Math.sin(a) * 5} x2={24 + Math.cos(a) * 20} y2={24 + Math.sin(a) * 20} stroke={color} strokeWidth="1.6" />;
      })}
    </svg>
  );
}

function GovIdentity({ full = false }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5">
      <AshokaChakra size={17} />
      <span className="st-hi font-medium text-white">सामाजिक न्याय और अधिकारिता विभाग</span>
      <span className={`opacity-40 ${full ? "" : "hidden md:inline"}`}>|</span>
      <span className={`font-medium text-white ${full ? "" : "hidden truncate md:inline"}`}>Department of Social Justice &amp; Empowerment</span>
    </div>
  );
}

function GovBar({ onPreferences, minimal = false }) {
  const { tx } = useLang();
  const { size, setSize, contrast, setContrast, theme, setTheme } = useA11yPrefs({ portal: !minimal });
  if (minimal)
    return (
      <div className="st-govbar">
        <div className="flex min-h-[36px] items-center px-4 py-1.5 text-[0.8333rem] sm:px-6">
          <GovIdentity full />
        </div>
      </div>
    );
  return (
    <div className="st-govbar">
      <div className="flex min-h-[34px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1 sm:px-6">
        <GovIdentity />
        <div className="flex items-center gap-3">
          <LangOrderSwitch />
          {onPreferences && (
            <button type="button" data-tour="prefs" className="st-utilbtn inline-flex items-center gap-1.5" onClick={onPreferences} title={tx("Language & state", "भाषा व राज्य")}>
              <Icon name="globe" size={13} />
              <span className="hidden sm:inline">{tx("Language & state", "भाषा व राज्य")}</span>
            </button>
          )}
          <span className="inline-flex items-center gap-1" role="group" aria-label="Text size">
            {TEXT_SIZES.map(([k, label, title]) => (
              <button key={k} type="button" className="st-utilbtn" aria-pressed={size === k} onClick={() => setSize(k)} title={title} aria-label={title}>
                {label}
              </button>
            ))}
          </span>
          <button type="button" data-tour="theme" className="st-utilbtn inline-flex items-center gap-1" aria-pressed={theme === "dark"} onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} title={theme === "dark" ? tx("Light mode", "लाइट मोड") : tx("Dark mode", "डार्क मोड")} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={13} />
            <span className="hidden xl:inline">{theme === "dark" ? tx("Light", "लाइट") : tx("Dark", "डार्क")}</span>
          </button>
          <button type="button" className="st-utilbtn inline-flex items-center" aria-pressed={contrast} onClick={() => setContrast((v) => !v)} title="High contrast" aria-label="High contrast">
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 1.7a6.3 6.3 0 010 12.6z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Counts for the sidebar and header. Shares requests with the pages. */
function useShellData() {
  const { user, isStaff, isBeneficiary } = useAuth();
  const findings = useApi(isStaff && user?.institute_id ? API.institutes.alerts(user.institute_id) : null, { fallback: [], skip: !isStaff });
  const notices = useApi(API.notices.list(), { fallback: [], optional: true });
  const profile = useApi(isBeneficiary ? API.beneficiary.me() : null, { fallback: null, optional: true, skip: !isBeneficiary });
  const grievances = useApi(isBeneficiary ? API.grievances.list() : null, { fallback: [], optional: true, skip: !isBeneficiary });
  const inst = useApi(user?.institute_id ? API.institutes.detail(user.institute_id) : null, { skip: !user?.institute_id, optional: true });
  const calls = useApi(isBeneficiary ? API.calls.mine() : null, { fallback: [], optional: true, skip: !isBeneficiary });
  const staffGrievances = useApi(isStaff ? API.grievances.list() : null, { fallback: [], optional: true, skip: !isStaff });
  const p = profile.data;
  const pendingDocs = (p?.documents || []).filter((d) => d.required && d.status !== "verified").length;
  return {
    counts: {
      findings: (findings.data || []).filter((f) => f.status === "open").length,
      notices: (notices.data || []).length,
      actions: (p?.schemes || []).filter((s) => s.action).length,
      docs: pendingDocs,
      grievances: (grievances.data || []).filter((g) => g.status !== "resolved").length,
    },
    institute: inst.data,
    profile: p,
    feed: { notices: notices.data || [], findings: findings.data || [], grievances: (isStaff ? staffGrievances.data : grievances.data) || [], calls: calls.data || [] },
  };
}

/* ------------------------------------------------- the notice board --- */
/**
 * Setu's own touch (Sentinel has a horizontal ticker; Setu has this): a
 * "Notice board · सूचना पट्ट" in the sidebar, in the manner of the "What's New"
 * box on Indian government sites. It scrolls upward on its own, all the time,
 * mixing the person's own updates (payments, documents, grievances, calls,
 * notices) with short tips that help them use the portal. Pointing at it
 * pauses it; every entry opens the page it is about. On short screens, and
 * in the slide-in menu, it shows one notice at a time and turns the page by
 * itself. With reduced motion it simply becomes a list you can scroll.
 */
function useNoticeUpdates(feed, profile, institute) {
  const { tx, lang } = useLang();
  const { isStaff } = useAuth();
  const items = [];
  const fmt = (v) => formatDate(v, lang);
  if (!isStaff) {
    const schemes = profile?.schemes || [];
    const next = schemes.filter((s) => s.next_amount && s.next_date).sort((a, b) => parseDate(a.next_date) - parseDate(b.next_date))[0];
    if (next) items.push({ tag: tx("Payment", "भुगतान"), tone: "good", text: tx(`Next payment ${rupees(next.next_amount)} · ${next.name} · ${fmt(next.next_date)}`, `अगला भुगतान ${rupees(next.next_amount)} · ${next.hi || next.name} · ${fmt(next.next_date)}`), to: "/benefits" });
    schemes.filter((s) => s.delayed).forEach((s) => items.push({ tag: tx("Delayed", "विलंबित"), tone: "watch", text: tx(`This month's ${s.name} payment is delayed — a grievance is already raised`, `इस माह का ${s.hi || s.name} भुगतान विलंबित — शिकायत दर्ज है`), to: "/benefits" }));
    (profile?.documents || []).filter((d) => d.required && d.status !== "verified" && d.status !== "not_required").forEach((d) => items.push({ tag: tx("Action", "कार्रवाई"), tone: "flag", text: d.status === "rejected" ? tx(`${d.name} was rejected — give a corrected copy to your institute office`, `${d.hi || d.name} अस्वीकृत — संस्था कार्यालय को सही प्रति दें`) : tx(`${d.name} is pending`, `${d.hi || d.name} लंबित है`), to: "/my-documents" }));
    schemes.filter((s) => s.status === "pending").forEach((s) => items.push({ tag: tx("Application", "आवेदन"), tone: "info", text: `${lang === "hi" && s.hi ? s.hi : s.name} — ${s.next_step}`, to: "/benefits" }));
    const nc = (feed.calls || []).filter((c) => c.status === "scheduled" && parseDate(c.scheduled_at) > new Date()).sort((a, b) => parseDate(a.scheduled_at) - parseDate(b.scheduled_at))[0];
    if (nc) items.push({ tag: tx("Call", "कॉल"), tone: "info", text: tx(`Verification call on ${formatDateTime(nc.scheduled_at, lang)} — staff won't be on the call`, `सत्यापन कॉल ${formatDateTime(nc.scheduled_at, lang)} — कर्मचारी कॉल पर नहीं होंगे`), to: "/calls" });
  } else {
    const st = STATUS[institute?.status];
    if (institute) items.push({ tag: tx("Compliance", "अनुपालन"), tone: st?.tone || "info", text: tx(`${institute.name}: compliance ${num(institute.compliance_score).toFixed(1)} / 100 — ${st?.en || ""}`, `${institute.name}: अनुपालन ${num(institute.compliance_score).toFixed(1)} / 100 — ${st?.hi || ""}`), to: "/" });
    (feed.findings || []).filter((f) => f.status === "open").slice(0, 4).forEach((f) => items.push({ tag: f.severity === "red" ? tx("Serious", "गंभीर") : tx("Finding", "निष्कर्ष"), tone: f.severity === "red" ? "flag" : "watch", text: tx(`${findingType(f.type)[0]} — respond with evidence`, `${findingType(f.type)[1]} — साक्ष्य के साथ जवाब दें`), to: "/findings" }));
    const rn = RENEWAL[institute?.renewal_status];
    if (rn) items.push({ tag: tx("Renewal", "नवीनीकरण"), tone: rn.tone, text: tx(`Registration renewal: ${rn.en}`, `पंजीकरण नवीनीकरण: ${rn.hi}`), to: "/renewal" });
  }
  (feed.grievances || []).filter((g) => g.status !== "resolved").slice(0, 3).forEach((g) => {
    const s = GRIEVANCE_STATUS[g.status] || GRIEVANCE_STATUS.open;
    const last = (g.updates || [])[g.updates?.length - 1];
    items.push({ tag: tx("Grievance", "शिकायत"), tone: "accent", text: `${g.subject} — ${tx(s.en, s.hi)}${last ? ` · ${last.text}` : ""}`, to: "/grievances" });
  });
  [...(feed.notices || [])].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at)).slice(0, 3).forEach((n) => items.push({ tag: tx("Notice", "सूचना"), tone: "info", text: n.title, to: "/notices" }));
  items.push({ tag: tx("Helpline", "हेल्पलाइन"), tone: "flag", text: tx("Emergency 112 · Childline 1098 · Women 181 · Elderline 14567 — free, any hour", "आपातकाल 112 · चाइल्डलाइन 1098 · महिला 181 · एल्डरलाइन 14567 — मुफ़्त, कभी भी"), href: "tel:112" });
  return items;
}


const NOTICE_TIPS = {
  beneficiary: [
    ["Ask Yukt “when is my next payment?” — the round button at the bottom right.", "युक्त से पूछें “मेरा अगला भुगतान कब है?” — नीचे दाईं ओर का गोल बटन।", null],
    ["Your grievances are private by default — institute staff can't see who raised them.", "आपकी शिकायतें स्वतः गोपनीय हैं — संस्था के कर्मचारी नहीं देख सकते कि किसने दर्ज की।", "/grievance/new"],
    ["Verification calls are between you and an official — staff are never on the call.", "सत्यापन कॉल केवल आपके और अधिकारी के बीच होती है — कर्मचारी कभी कॉल पर नहीं होते।", "/calls"],
    ["Keep your Aadhaar-linked bank account active so DBT payments reach you on time.", "आधार से जुड़ा बैंक खाता सक्रिय रखें ताकि DBT भुगतान समय पर पहुँचे।", "/benefits"],
    ["Check which schemes you may be eligible for — and request enrolment in one click.", "देखें आप किन योजनाओं के पात्र हैं — और एक क्लिक में नामांकन का अनुरोध करें।", "/schemes"],
  ],
  institute_staff: [
    ["Respond to each finding with evidence — it is the quickest way to lift your compliance score.", "हर निष्कर्ष का साक्ष्य सहित जवाब दें — अनुपालन स्कोर बढ़ाने का सबसे तेज़ तरीका।", "/findings"],
    ["Upload a resident's certificate from Documents → “Beneficiary document”.", "निवासी का प्रमाणपत्र दस्तावेज़ → “लाभार्थी दस्तावेज़” से अपलोड करें।", "/documents"],
    ["Keep fire-safety and food-safety certificates current before your renewal is decided.", "नवीनीकरण के निर्णय से पहले अग्नि व खाद्य सुरक्षा प्रमाणपत्र अद्यतन रखें।", "/renewal"],
    ["Ask Yukt “which residents need help?” — the round button at the bottom right.", "युक्त से पूछें “किन निवासियों को सहायता चाहिए?” — नीचे दाईं ओर का गोल बटन।", null],
  ],
};

function useNoticeItems(feed, profile, institute) {
  const { tx } = useLang();
  const { role } = useAuth();
  const updates = useNoticeUpdates(feed, profile, institute).map((u) => ({ ...u, kind: "update", isNew: u.tone === "flag" || u.tag === tx("Notice", "सूचना") || u.tone === "good" }));
  const tips = (NOTICE_TIPS[role] || []).map(([en, hi, to]) => ({ kind: "tip", tag: tx("Tip", "सुझाव"), tone: "tip", text: tx(en, hi), to, action: to ? null : "yukt" }));
  // Two updates, then a tip — so help keeps arriving between the news.
  const out = [];
  let t = 0;
  updates.forEach((u, i) => {
    out.push(u);
    if (i % 2 === 1 && t < tips.length) out.push(tips[t++]);
  });
  while (t < tips.length) out.push(tips[t++]);
  return out;
}

function NoticeEntry({ it, onDone }) {
  const inner = (
    <>
      <span className="flex items-center gap-1.5">
        <span className={`st-notice-tag is-${it.tone}`}>{it.tag}</span>
        {it.isNew && <span className="st-notice-new">NEW</span>}
      </span>
      <span className="st-notice-text">{it.text}</span>
    </>
  );
  if (it.href) return <a href={it.href} className="st-notice-item">{inner}</a>;
  if (it.action === "yukt")
    return (
      <button type="button" className="st-notice-item w-full border-0 bg-transparent text-left" onClick={() => { window.dispatchEvent(new CustomEvent("setu:yukt")); onDone?.(); }}>
        {inner}
      </button>
    );
  return <Link to={it.to || "/notices"} className="st-notice-item" onClick={onDone}>{inner}</Link>;
}

function NoticeBoard({ feed, profile, institute, compact: forceCompact = false, onNavigate }) {
  const { tx } = useLang();
  const items = useNoticeItems(feed, profile, institute);
  const compact = forceCompact;
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [idx, setIdx] = useState(0);
  const stop = paused || hover;
  useEffect(() => {
    if (!compact || stop || items.length < 2) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), 4500);
    return () => clearInterval(t);
  }, [compact, stop, items.length]);
  if (!items.length) return null;
  const cur = items[idx % items.length];
  const loop = [...items, ...items];
  const newCount = items.filter((i) => i.isNew).length;
  return (
    <section className="st-notice" data-tour="notices" aria-label={tx("Notice board", "सूचना पट्ट")} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <header className="st-notice-head">
        <Icon name="bell" size={14} className="st-notice-bell" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate">{tx("Notice board", "सूचना पट्ट")}</span>
          <span className="st-hi block truncate text-[0.6667rem] font-medium opacity-80">सूचना पट्ट · {tx("always on", "सदा सक्रिय")}</span>
        </span>
        {newCount > 0 && <span className="st-notice-new">{newCount} NEW</span>}
        <button type="button" className="st-notice-btn" onClick={() => setPaused((v) => !v)} aria-label={paused ? tx("Play notices", "सूचनाएँ चलाएँ") : tx("Pause notices", "सूचनाएँ रोकें")} title={paused ? tx("Play", "चलाएँ") : tx("Pause", "रोकें")}>
          {paused ? (
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2l7 4-7 4z" fill="currentColor" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor" /></svg>
          )}
        </button>
      </header>
      {compact ? (
        <div className="st-notice-one">
          <div key={idx} className="st-notice-rise">
            <NoticeEntry it={cur} onDone={onNavigate} />
          </div>
          <div className="flex items-center justify-between px-2.5 pb-1.5">
            <span className="st-notice-dots" aria-hidden="true">
              {items.slice(0, 8).map((_, k) => <i key={k} className={k === idx % Math.min(8, items.length) ? "is-on" : ""} />)}
            </span>
            <span className="flex gap-1">
              <button type="button" className="st-notice-step" aria-label={tx("Previous notice", "पिछली सूचना")} onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}><Icon name="chevronLeft" size={13} /></button>
              <button type="button" className="st-notice-step" aria-label={tx("Next notice", "अगली सूचना")} onClick={() => setIdx((i) => (i + 1) % items.length)}><Icon name="chevronRight" size={13} /></button>
            </span>
          </div>
        </div>
      ) : (
        <div className="st-notice-view">
          <div className={`st-notice-track ${stop ? "is-paused" : ""}`} style={{ animationDuration: `${Math.max(24, items.length * 4.2)}s` }}>
            {loop.map((it, i) => (
              <div key={i} aria-hidden={i >= items.length || undefined}>
                <NoticeEntry it={it} onDone={onNavigate} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function SideNav({ counts, onNavigate, collapsed = false }) {
  const { role } = useAuth();
  const { bi, locClass, dir } = useLang();
  const groups = NAV[role] || [];
  return (
    <nav aria-label="Main" className="st-sidenav px-3 pb-1">
      {groups.map((g) => {
        const gl = bi(g.group, g.hi);
        return (
          <div key={g.group}>
            {collapsed ? (
              <hr className="st-nav-rule" />
            ) : (
              <p className="st-nav-group">
                <span className={gl.mainLocal ? `${locClass} normal-case tracking-normal` : ""}>{gl.main}</span>
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const l = bi(it.en, it.hi);
                const n = it.count ? counts[it.count] : 0;
                return (
                  <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate} title={collapsed ? `${it.en} · ${it.hi}` : undefined} className={({ isActive }) => `st-nav ${isActive ? "is-active" : ""}`}>
                    <span className="st-nav-ico"><Icon name={it.icon} /></span>
                    {!collapsed && (
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className={`block truncate ${l.mainLocal ? locClass : ""}`} dir={l.mainLocal ? dir : undefined}>{l.main}</span>
                        {l.sub && <span className={`st-nav-sub truncate ${l.subLocal ? locClass : ""}`} dir={l.subLocal ? dir : undefined}>{l.sub}</span>}
                      </span>
                    )}
                    {n > 0 && <span className={`st-count st-tnum ${collapsed ? "is-dot" : ""}`}>{n}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SideBrand({ collapsed = false }) {
  const { isStaff } = useAuth();
  const { tx } = useLang();
  return (
    <Link to="/" className={`flex items-center gap-3 pb-3 pt-4 no-underline ${collapsed ? "justify-center px-2" : "px-5"}`} aria-label="Setu — overview">
      <SetuMark size={collapsed ? 34 : 38} />
      {!collapsed && (
        <div className="leading-tight">
          <p className="st-display m-0 text-[1.1333rem]" style={{ color: C.ink }}>
            Setu <span className="st-hi text-[0.9333rem] font-medium" style={{ color: C.acc }}>सेतु</span>
          </p>
          <p className="m-0 text-[0.8rem] font-medium" style={{ color: C.muted }}>
            {isStaff ? tx("Institute services portal", "संस्था सेवा पोर्टल") : tx("Beneficiary services portal", "लाभार्थी सेवा पोर्टल")}
          </p>
        </div>
      )}
    </Link>
  );
}

function Sidebar({ counts, feed, profile, institute }) {
  const { tx } = useLang();
  const [collapsed, setCollapsed] = useState(() => readStore("setu.navCollapsed", "0") === "1");
  useEffect(() => writeStore("setu.navCollapsed", collapsed ? "1" : "0"), [collapsed]);
  // The menu always shows in full; the notice board sits at the very bottom
  // and takes the full scrolling form only when there is room for it.
  const bodyRef = useRef(null);
  const navRef = useRef(null);
  const [roomy, setRoomy] = useState(false);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === "undefined") return undefined;
    const check = () => {
      const nav = body.querySelector(".st-sidenav");
      setRoomy(body.clientHeight - (nav ? nav.scrollHeight : 0) >= 250);
    };
    const ro = new ResizeObserver(check);
    ro.observe(body);
    check();
    return () => ro.disconnect();
  }, [collapsed]);
  return (
    <aside className={`st-side hidden lg:flex ${collapsed ? "is-collapsed" : ""}`} data-tour="nav">
      <button type="button" className="st-side-toggle" onClick={() => setCollapsed((v) => !v)} title={collapsed ? tx("Expand menu", "मेनू फैलाएँ") : tx("Collapse menu", "मेनू छोटा करें")} aria-label={collapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!collapsed}>
        <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={14} />
      </button>
      <SideBrand collapsed={collapsed} />
      <div ref={bodyRef} className="st-side-body">
        <SideNav counts={counts} collapsed={collapsed} />
        <div className="st-side-bottom">
          {collapsed ? (
            <button type="button" className="st-notice-mini" onClick={() => setCollapsed(false)} title="Notice board · सूचना पट्ट" aria-label="Open the notice board">
              <Icon name="bell" size={18} />
              <span className="st-notice-new">NEW</span>
            </button>
          ) : (
            <NoticeBoard feed={feed} profile={profile} institute={institute} compact={!roomy} />
          )}
        </div>
      </div>
    </aside>
  );
}

function Drawer({ open, onClose, counts, feed, profile, institute }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="st-drawer-back" onClick={onClose} aria-hidden="true" />
      <aside className="st-drawer">
        <div className="flex items-start justify-between">
          <SideBrand />
          <button type="button" onClick={onClose} className="st-btn st-btn-ghost st-btn-sm m-3 !px-2" aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>
        <SideNav counts={counts} onNavigate={onClose} />
        <NoticeBoard feed={feed} profile={profile} institute={institute} compact onNavigate={onClose} />
      </aside>
    </div>
  );
}

function UserMenu({ onPreferences }) {
  const { user, session, isStaff, logout } = useAuth();
  const { tx, lang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const item = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm no-underline transition-colors hover:bg-[#F3F5F4]";
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors hover:bg-[#F7F8F6]" style={{ borderColor: "var(--line)", background: "var(--surface)", fontFamily: "inherit", cursor: "pointer" }}>
        <span className="grid h-7 w-7 place-items-center rounded-full text-[0.8rem] font-bold text-white" style={{ background: C.pri }}>{initials(user?.name)}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:block" style={{ color: C.ink }}>{user?.name}</span>
        <Icon name="chevronDown" size={15} style={{ color: C.muted }} />
      </button>
      {open && (
        <div role="menu" className="st-modal absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-lg border bg-white p-1.5 shadow-xl" style={{ borderColor: "var(--line)" }}>
          <div className="px-3 py-2">
            <p className="m-0 truncate text-sm font-semibold" style={{ color: C.ink }}>{user?.name}</p>
            <p className="m-0 truncate text-xs" style={{ color: C.muted }}>{user?.email}</p>
            {session?.lastLoginAt && (
              <p className="m-0 mt-1 truncate text-xs" style={{ color: C.muted }}>
                {tx("Last signed in", "पिछला साइन इन")} {formatDateTime(session.lastLoginAt, lang)}
              </p>
            )}
          </div>
          <hr className="st-divider my-1" />
          {!isStaff && (
            <Link role="menuitem" to="/profile" className={item} style={{ color: C.ink }} onClick={() => setOpen(false)}>
              <Icon name="user" size={16} style={{ color: C.muted }} /> {tx("My profile", "मेरी प्रोफ़ाइल")}
            </Link>
          )}
          <button role="menuitem" type="button" className={`${item} border-0 bg-transparent`} style={{ color: C.ink, fontFamily: "inherit", cursor: "pointer" }} onClick={() => { setOpen(false); onPreferences(); }}>
            <Icon name="globe" size={16} style={{ color: C.muted }} /> {tx("Language & state", "भाषा व राज्य")}
          </button>
          <Link role="menuitem" to="/security" className={item} style={{ color: C.ink }} onClick={() => setOpen(false)}>
            <Icon name="shield" size={16} style={{ color: C.muted }} /> {tx("Security", "सुरक्षा")}
          </Link>
          <Link role="menuitem" to="/help" className={item} style={{ color: C.ink }} onClick={() => setOpen(false)}>
            <Icon name="help" size={16} style={{ color: C.muted }} /> {tx("Help & support", "सहायता")}
          </Link>
          <button role="menuitem" type="button" className={`${item} border-0 bg-transparent`} style={{ color: C.ink, fontFamily: "inherit", cursor: "pointer" }} onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("setu:tour")); }}>
            <Icon name="info" size={16} style={{ color: C.muted }} /> {tx("Guided tour", "मार्गदर्शित भ्रमण")}
          </button>
          <hr className="st-divider my-1" />
          <button role="menuitem" type="button" className={`${item} border-0 bg-transparent`} style={{ color: "var(--bad)", fontFamily: "inherit", cursor: "pointer" }} onClick={logout}>
            <Icon name="logout" size={16} /> {tx("Sign out", "साइन आउट")}
          </button>
        </div>
      )}
    </div>
  );
}

function TopHeader({ counts, onMenu, onPreferences, live }) {
  const { tx } = useLang();
  const { isStaff } = useAuth();
  const demo = useDemoMode();
  return (
    <header className="st-header sticky top-0 z-[185]">
      <div className="flex h-[56px] items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={onMenu} className="st-btn st-btn-secondary st-btn-sm !px-2 lg:hidden" aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <Link to="/" className="flex items-center gap-2 no-underline lg:hidden" aria-label="Setu — overview">
          <SetuMark size={30} />
          <span className="st-display text-[1.0333rem]" style={{ color: C.ink }}>Setu</span>
        </Link>
        <p className="m-0 hidden items-center gap-2 text-[0.8667rem] lg:flex" style={{ color: C.muted }}>
          <Icon name="calendar" size={15} />
          {formatLongDate()}
        </p>
        {demo && (
          <span className="hidden sm:inline-flex" title={tx("Sample data — no backend is connected.", "नमूना डेटा — बैकएंड जुड़ा नहीं है।")}>
            <Badge tone="accent" dot>{tx("Mock data", "मॉक डेटा")}</Badge>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <UpdatedAgo at={live.updatedAt} onRefresh={live.refresh} />
          {!isStaff && (
            <ButtonLink to="/grievance/new" variant="primary" size="sm" icon="chatPlus" className="hidden md:inline-flex" data-tour="grievance">
              {tx("Raise a grievance", "शिकायत दर्ज करें")}
            </ButtonLink>
          )}
          <Link to="/notices" className="st-btn st-btn-secondary st-btn-sm relative !px-2" aria-label={`${tx("Updates & notices", "अपडेट व सूचनाएँ")} (${counts.notices})`}>
            <Icon name="bell" />
            {counts.notices > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[0.7rem] font-bold text-white" style={{ background: C.acc }}>
                {counts.notices}
              </span>
            )}
          </Link>
          <UserMenu onPreferences={onPreferences} />
        </div>
      </div>
    </header>
  );
}

function formatLongDate() {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Shown in the footer as "Last updated" — set on each release. */
const SITE_UPDATED = "2026-09-27T00:00:00";

function PortalFooter() {
  const { tx, lang } = useLang();
  return (
    <footer className="mt-8 border-t" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="mx-auto max-w-[1520px] px-4 py-6 sm:px-6 2xl:px-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <SetuMark size={28} />
              <p className="st-display m-0 text-[1rem]" style={{ color: C.ink }}>Setu</p>
            </div>
            <p className="m-0 mt-2 text-[0.8333rem] leading-relaxed" style={{ color: C.muted }}>
              {tx("One of three platforms of the Ministry of Social Justice & Empowerment for welfare institutes.", "कल्याण संस्थाओं के लिए सामाजिक न्याय और अधिकारिता मंत्रालय के तीन प्लेटफ़ॉर्म में से एक।")}
            </p>
          </div>
          <ul className="m-0 grid gap-x-10 gap-y-1.5 p-0 text-[0.8333rem] sm:grid-cols-2" style={{ listStyle: "none" }}>
            <li><Link className="st-link !text-[0.8333rem] !font-medium" to="/help">{tx("Help & support", "सहायता")}</Link></li>
            <li><Link className="st-link !text-[0.8333rem] !font-medium" to="/ecosystem?to=nayan">{tx("Know about Nayan", "नयन के बारे में")}</Link></li>
            <li><Link className="st-link !text-[0.8333rem] !font-medium" to="/notices">{tx("Updates & notices", "अपडेट व सूचनाएँ")}</Link></li>
            <li>
              {SENTINEL_URL ? (
                <a className="st-link !text-[0.8333rem] !font-medium" href={SENTINEL_URL} target="_blank" rel="noreferrer">Sentinel ↗</a>
              ) : (
                <Link className="st-link !text-[0.8333rem] !font-medium" to="/ecosystem?to=sentinel">Sentinel</Link>
              )}
            </li>
          </ul>
        </div>
        <p className="m-0 mt-5 border-t pt-4 text-[0.8rem] leading-relaxed" style={{ borderColor: "var(--line)", color: C.muted }}>
          <strong style={{ color: C.pri }}>Sentinel</strong> —{" "}
          {tx(
            "the Ministry's monitoring console watches over every institute, so each grievance raised on Setu reaches an officer on a deadline and is never lost.",
            "मंत्रालय का निगरानी कंसोल हर संस्था पर नज़र रखता है, ताकि Setu पर दर्ज हर शिकायत समय-सीमा के साथ अधिकारी तक पहुँचे और कभी खोए नहीं।"
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t pt-3 text-[0.8rem]" style={{ borderColor: "var(--line)", color: C.muted }}>
          <p className="m-0">
            {tx("Prototype built for the Department of Social Justice & Empowerment. Not an official government website.", "सामाजिक न्याय और अधिकारिता विभाग के लिए बनाया गया प्रोटोटाइप। यह आधिकारिक सरकारी वेबसाइट नहीं है।")}
          </p>
          <p className="m-0 flex flex-wrap gap-x-4">
            <span>{tx("Last updated", "अंतिम अद्यतन")}: {formatDate(SITE_UPDATED, lang)}</span>
            <span>{tx("Best viewed in the latest Chrome, Edge, Firefox or Safari", "Chrome, Edge, Firefox या Safari के नवीनतम संस्करण में सर्वोत्तम")}</span>
          </p>
        </div>
        <p className="m-0 mt-1.5 text-[0.8rem]" style={{ color: C.muted }}>
          © {new Date().getFullYear()} Setu · {tx("built for the Department of Social Justice & Empowerment", "सामाजिक न्याय और अधिकारिता विभाग के लिए")}
        </p>
      </div>
    </footer>
  );
}

/** After sign-in the account decides the institute; keep the saved choice in step. */
function useInstituteSync(institute) {
  const { prefs, setPrefs, tx } = useLang();
  const toast = useToast();
  const done = useRef(false);
  useEffect(() => {
    if (!institute || done.current) return;
    done.current = true;
    const patch = {};
    if (prefs.instituteId && prefs.instituteId !== institute.id) {
      toast.info(tx(`Your account is registered at ${institute.name} — showing that institute.`, `आपका खाता ${institute.name} में पंजीकृत है — वही संस्था दिखाई जा रही है।`));
    }
    if (prefs.instituteId !== institute.id || prefs.instituteName !== institute.name) Object.assign(patch, { instituteId: institute.id, instituteName: institute.name, instituteManual: false });
    if (!prefs.state && institute.state) patch.state = institute.state;
    if (Object.keys(patch).length) setPrefs(patch);
  }, [institute]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Shell() {
  const { counts, institute, profile, feed } = useShellData();
  const location = useLocation();
  const live = useAutoRefresh(location.pathname);
  const [menu, setMenu] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const scroller = useRef(null);
  const { isStaff, user } = useAuth();
  usePortalTheme(isStaff ? "institute" : "beneficiary");
  // Marks the page as "inside the portal" (comfortable type on large screens).
  useEffect(() => {
    document.documentElement.setAttribute("data-shell", "1");
    return () => {
      document.documentElement.removeAttribute("data-shell");
      document.documentElement.removeAttribute("data-theme");
    };
  }, []);
  useInstituteSync(institute);
  useEffect(() => setMenu(false), [location.pathname]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [location.pathname]);
  useEffect(() => {
    const open = () => setPrefsOpen(true);
    window.addEventListener("setu:open-prefs", open);
    return () => window.removeEventListener("setu:open-prefs", open);
  }, []);
  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <a href="#main" className="st-skip">Skip to main content</a>
      <GovBar onPreferences={() => setPrefsOpen(true)} />
      <div className="st-tricolour" />
      <div className="flex min-h-0 flex-1">
        <Sidebar counts={counts} feed={feed} profile={profile} institute={institute} />
        <div ref={scroller} className="flex min-w-0 flex-1 flex-col overflow-y-auto" id="scroller">
          <TopHeader counts={counts} onMenu={() => setMenu(true)} onPreferences={() => setPrefsOpen(true)} live={live} />
          <main id="main" className="w-full flex-1">
            <div className="mx-auto w-full max-w-[1520px] px-4 py-5 sm:px-6 sm:py-6 2xl:px-10">
              <PageBoundary key={location.pathname}>
                <div className="st-page">
                  <Outlet />
                </div>
              </PageBoundary>
            </div>
          </main>
          <PortalFooter />
        </div>
      </div>
      <Drawer open={menu} onClose={() => setMenu(false)} counts={counts} feed={feed} institute={institute} profile={profile} />
      <PreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} institute={institute} />
      <Yukt key={user?.user_id || "yukt"} />
      <GuidedTour key={`tour-${user?.user_id || ""}`} />
      <SessionGuard />
    </div>
  );
}

/**
 * Signed out, every address leads to the sign-in page (the session is in
 * memory only, so this is also where a reload lands); after sign-in the
 * portal opens at its home page, not at the address first opened.
 */
function Protected({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

/* ══════════════════════════════════════════════════════════════════════════
   §11  START & SIGN IN — state → language → institute → sign in
   ══════════════════════════════════════════════════════════════════════════ */

/* --------------------------------------------------------- the pickers --- */
function StatePicker({ value, onPick, autoFocus = false }) {
  const { tx } = useLang();
  const [q, setQ] = useState("");
  const input = useRef(null);
  useEffect(() => {
    if (autoFocus) setTimeout(() => input.current?.focus(), 60);
  }, [autoFocus]);
  const match = (s) => !q || `${s.name} ${s.hi}`.toLowerCase().includes(q.trim().toLowerCase());
  const states = STATES.filter((s) => s.kind === "state" && match(s));
  const uts = STATES.filter((s) => s.kind === "ut" && match(s));
  const Group = ({ title, rows }) =>
    rows.length ? (
      <div className="mb-3">
        <p className="m-0 mb-1.5 text-[0.8rem] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>{title} · {rows.length}</p>
        <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup">
          {rows.map((s) => (
            <button key={s.name} type="button" role="radio" aria-checked={value === s.name} onClick={() => onPick(s.name)} className="st-choice !py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9rem] font-semibold">{s.name}</span>
                <span className="st-hi block truncate text-[0.8rem]" style={{ color: C.muted }}>{s.hi}</span>
              </span>
              {value === s.name && <Icon name="check" size={16} style={{ color: C.pri }} />}
            </button>
          ))}
        </div>
      </div>
    ) : null;
  return (
    <div>
      <SearchInput
        inputRef={input}
        value={q}
        onChange={setQ}
        placeholder={tx("Search states and union territories…", "राज्य या केंद्र शासित प्रदेश खोजें…")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const first = [...states, ...uts][0];
            if (first) onPick(first.name);
          }
        }}
      />
      <div className="mt-3 max-h-[46vh] overflow-y-auto pr-1 lg:max-h-[calc(100vh-440px)] lg:min-h-[200px]">
        <Group title={tx("States", "राज्य")} rows={states} />
        <Group title={tx("Union Territories", "केंद्र शासित प्रदेश")} rows={uts} />
        {!states.length && !uts.length && <p className="m-0 py-6 text-center text-sm" style={{ color: C.muted }}>{tx("No match. Try another spelling.", "कोई मेल नहीं। दूसरी वर्तनी आज़माएँ।")}</p>}
      </div>
    </div>
  );
}

const COVERAGE_LABEL = {
  full: ["Every screen", "हर स्क्रीन"],
  menus: ["Menus & page titles", "मेनू व शीर्षक"],
  saved: ["English interface for now", "अभी अंग्रेज़ी इंटरफ़ेस"],
};
function LanguagePicker({ value, onPick, suggested, autoFocus = false }) {
  const { tx } = useLang();
  const [q, setQ] = useState("");
  const input = useRef(null);
  useEffect(() => {
    LANGUAGES.forEach((l) => loadScriptFont(l.code));
    if (autoFocus) setTimeout(() => input.current?.focus(), 60);
  }, [autoFocus]);
  const rows = LANG_CHOICES.filter((l) => !q || `${l.name} ${l.native} ${l.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  const top = rows.filter((l) => l.code === "bi" || l.code === "en");
  const rest = rows.filter((l) => l.code !== "bi" && l.code !== "en");
  const ordered = suggested && !q ? [...top, ...rest.filter((l) => l.code === suggested), ...rest.filter((l) => l.code !== suggested)] : [...top, ...rest];
  return (
    <div>
      <SearchInput
        inputRef={input}
        value={q}
        onChange={setQ}
        placeholder={tx("Search 23 languages — e.g. Tamil, தமிழ்", "23 भाषाएँ खोजें — जैसे तमिल, தமிழ்")}
        onKeyDown={(e) => e.key === "Enter" && ordered[0] && onPick(ordered[0].code)}
      />
      <div className="mt-3 grid max-h-[46vh] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:max-h-[calc(100vh-440px)] lg:min-h-[200px]" role="radiogroup">
        {ordered.map((l) => {
          const cov = coverage(l.code === "bi" ? "hi" : l.code);
          const font = SCRIPT_FONT[l.script];
          return (
            <button key={l.code} type="button" role="radio" aria-checked={value === l.code} onClick={() => onPick(l.code)} className="st-choice !py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[1rem] font-semibold leading-snug" lang={l.code} dir={l.rtl ? "rtl" : undefined} style={{ fontFamily: font ? `'${font[1]}', 'Noto Sans', sans-serif` : undefined, textAlign: "left" }}>
                  {l.native}
                </span>
                <span className="block truncate text-[0.8rem]" style={{ color: C.muted }}>
                  {l.note ? tx(l.note[0], l.note[1]) : `${l.name} · ${tx(COVERAGE_LABEL[cov][0], COVERAGE_LABEL[cov][1])}`}
                </span>
              </span>
              {l.code === "bi" && l.code !== value && <Badge tone="good">{tx("Default", "डिफ़ॉल्ट")}</Badge>}
              {suggested === l.code && l.code !== value && <Badge tone="info">{tx("Suggested", "सुझाव")}</Badge>}
              {value === l.code && <Icon name="check" size={16} style={{ color: C.pri }} />}
            </button>
          );
        })}
        {!ordered.length && <p className="col-span-full m-0 py-6 text-center text-sm" style={{ color: C.muted }}>{tx("No match.", "कोई मेल नहीं।")}</p>}
      </div>
    </div>
  );
}

/** Change state / language after signing in. The institute comes from the account. */
function PreferencesModal({ open, onClose, institute }) {
  const { prefs, setPrefs, tx } = useLang();
  const toast = useToast();
  const [tab, setTab] = useState("language");
  const [lang, setLangDraft] = useState(choiceOf(prefs));
  const [state, setState] = useState(prefs.state);
  useEffect(() => {
    if (open) {
      setLangDraft(choiceOf(prefs));
      setState(prefs.state);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  function save() {
    setPrefs({ ...prefsForChoice(lang, prefs.order), state });
    toast.success(tx("Preferences saved", "पसंद सहेजी गई"));
    onClose();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={tx("Language & state", "भाषा व राज्य")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tx("Cancel", "रद्द करें")}</Button>
          <Button onClick={save} icon="check">{tx("Save", "सहेजें")}</Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} options={[["language", "Language", "भाषा"], ["state", "State", "राज्य"]]} label="Preferences" />
        <span className="text-[0.8333rem]" style={{ color: C.muted }}>
          {choiceLabel(lang)} · {state || tx("No state chosen", "राज्य नहीं चुना")}
        </span>
      </div>
      {tab === "language" ? <LanguagePicker value={lang} onPick={setLangDraft} suggested={stateOf(state)?.suggest} /> : <StatePicker value={state} onPick={setState} />}
      {institute && (
        <p className="m-0 mt-3 flex items-center gap-2 text-[0.8333rem]" style={{ color: C.muted }}>
          <Icon name="lock" size={14} /> {tx(`Institute: ${institute.name} — linked to your account.`, `संस्था: ${institute.name} — आपके खाते से जुड़ी है।`)}
        </p>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------- the flag, behind -- */
/**
 * The national flag as a quiet background mark — the Setu counterpart of the
 * slowly turning Ashoka Chakra behind Sentinel. Drawn on a canvas so the cloth
 * moves as one smooth surface: a long, slow wave, soft light and shade, and
 * the chakra turning once every 40 seconds. It quickens gently while the
 * pointer is over the panel. Still for reduced-motion users.
 */
function FlagWatermark({ width = 760, className = "", style, hoverRef }) {
  const ref = useRef(null);
  const H = Math.round((width * 2) / 3);
  const PAD = 30;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.getContext) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = width;
    cv.width = W * dpr;
    cv.height = (H + PAD * 2) * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return undefined;
    ctx.scale(dpr, dpr);
    const off = document.createElement("canvas");
    off.width = W * dpr;
    off.height = H * dpr;
    const o = off.getContext("2d");
    o.scale(dpr, dpr);
    const band = H / 3;
    const cx = W / 2;
    const cy = H / 2;
    const r = band * 0.44;
    const paint = (angle) => {
      o.clearRect(0, 0, W, H);
      o.fillStyle = "#FF9933";
      o.fillRect(0, 0, W, band);
      o.fillStyle = "#FFFFFF";
      o.fillRect(0, band, W, band);
      o.fillStyle = "#138808";
      o.fillRect(0, band * 2, W, band);
      o.strokeStyle = "#000080";
      o.fillStyle = "#000080";
      o.lineWidth = r * 0.09;
      o.beginPath();
      o.arc(cx, cy, r, 0, Math.PI * 2);
      o.stroke();
      o.lineWidth = Math.max(0.8, r * 0.04);
      for (let i = 0; i < 24; i++) {
        const a = angle + (i * Math.PI) / 12;
        o.beginPath();
        o.moveTo(cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18);
        o.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95);
        o.stroke();
      }
      o.beginPath();
      o.arc(cx, cy, r * 0.17, 0, Math.PI * 2);
      o.fill();
    };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let speed = 1;
    const STEP = 2;
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = hoverRef?.current ? 1.9 : 1;
      speed += (target - speed) * Math.min(1, dt * 2.5);
      clock += reduce ? 0 : dt * speed;
      paint((clock * Math.PI * 2) / 40);
      ctx.clearRect(0, 0, W, H + PAD * 2);
      for (let x = 0; x < W; x += STEP) {
        const k = x / W;
        const phase = x * 0.011 - clock * 1.25;
        const dy = Math.sin(phase) * (3 + 20 * k);
        ctx.drawImage(off, x * dpr, 0, STEP * dpr, H * dpr, x, PAD + dy, STEP + 0.6, H);
        const light = Math.cos(phase) * 0.16 * (0.3 + k);
        ctx.fillStyle = light > 0 ? `rgba(255,255,255,${light * 0.7})` : `rgba(0,0,0,${-light})`;
        ctx.fillRect(x, PAD + dy, STEP + 0.6, H);
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, H, hoverRef]);
  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} style={{ width, height: H + PAD * 2, ...style }} />;
}

/* ------------------------------------------------- boxed select fields -- */
/**
 * A form field that looks like a proper input box and opens a searchable
 * list beneath it. Which field is open is held by the parent, so any field can
 * be opened in any order and clicking the same box (or its arrow) closes it.
 * options: [{value, label, sub, badge, font, dir, search}]
 */
function FieldSelect({ id, align, step, label, selected, display, placeholder, icon, open, onToggle, onClose, options = [], onPick, remote, loading, searchPlaceholder, footer, emptyText = "No match" }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const input = useRef(null);
  const list = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    setQ("");
    remote?.("");
    setActive(0);
    const onDoc = (e) => !wrap.current?.contains(e.target) && onClose();
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = remote ? options : options.filter((o) => !q || (o.search || o.label).toLowerCase().includes(q.trim().toLowerCase()));
  useEffect(() => setActive(0), [q, options.length]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      onPick(rows[active].value, rows[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      wrap.current?.querySelector("button")?.focus();
    }
  };
  return (
    <div ref={wrap} className="relative">
      <label className="st-flabel" htmlFor={`${id}-box`}>
        {step && <span className="st-fstep">{step}</span>}
        {label}
      </label>
      <button id={`${id}-box`} type="button" className={`st-fieldbox ${open ? "is-open" : ""} ${selected ? "has-value" : ""}`} onClick={onToggle} aria-haspopup="listbox" aria-expanded={open}>
        {icon && <Icon name={icon} size={17} className="shrink-0" style={{ color: selected ? C.pri : "#8A9792" }} />}
        <span className={`min-w-0 flex-1 truncate text-left ${selected ? "" : "st-fplaceholder"}`}>{selected ? display || selected : placeholder}</span>
        <Icon name="chevronDown" size={17} className="st-fchev shrink-0" />
      </button>
      {open && (
        <div className={`st-fpanel ${align === "right" ? "is-right" : ""}`} role="dialog" aria-label={label}>
          <div className="st-search">
            <Icon name="search" />
            <input
              ref={input}
              autoFocus
              className="st-field !min-h-[40px]"
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                remote?.(e.target.value);
              }}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={`${id}-list`}
            />
          </div>
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="m-0 mt-2 max-h-[232px] overflow-y-auto p-0" style={{ listStyle: "none" }}>
            {loading && !rows.length
              ? [0, 1, 2].map((i) => <li key={i} className="p-1"><Skeleton className="h-9" /></li>)
              : rows.map((o, i) => {
                  const isSel = selected != null && o.value === selected;
                  return (
                    <li key={o.value} role="option" aria-selected={Boolean(isSel)} data-i={i}>
                      <button type="button" tabIndex={-1} onClick={() => onPick(o.value, o)} onMouseEnter={() => setActive(i)} className="st-fopt" data-active={i === active || undefined} data-selected={isSel || undefined}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.9rem] font-semibold" style={o.font ? { fontFamily: o.font } : undefined} dir={o.dir}>{o.label}</span>
                          {o.sub && <span className="block truncate text-[0.8rem]" style={{ color: C.muted }}>{o.sub}</span>}
                        </span>
                        {o.badge && <Badge tone="info">{o.badge}</Badge>}
                        {isSel && <Icon name="check" size={15} style={{ color: C.pri }} />}
                      </button>
                    </li>
                  );
                })}
            {!loading && !rows.length && <li className="px-3 py-4 text-center text-[0.8333rem]" style={{ color: C.muted }}>{emptyText}</li>}
          </ul>
          {footer && <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--line)" }}>{footer}</div>}
        </div>
      )}
    </div>
  );
}

/** A plain text field in the same boxed style (email, password, names). */
function FieldInput({ id, step, label, icon, type = "text", value, onChange, placeholder, autoComplete, trailing, hint, hideLabel = false, inputProps }) {
  return (
    <div>
      <label className={hideLabel ? "sr-only" : "st-flabel"} htmlFor={id}>
        {step && <span className="st-fstep">{step}</span>}
        {label}
      </label>
      <div className="st-fieldbox is-input">
        {icon && <Icon name={icon} size={17} className="shrink-0" style={{ color: value ? C.pri : "#8A9792" }} />}
        <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} {...inputProps} />
        {trailing}
      </div>
      {hint && <p className="st-hint">{hint}</p>}
    </div>
  );
}

/** Loads register entries for the institute field (server search). */
function useInstituteSearch(state, open) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(API.directory.institutes(), { params: { state: state || undefined, q: q.trim() || undefined } });
        if (alive) {
          setRows(Array.isArray(data) ? data : []);
          setUnavailable(false);
        }
      } catch (err) {
        if (alive) {
          setRows([]);
          setUnavailable(isMissing(err));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, state, open]);
  return { q, setQ, rows, loading, unavailable };
}

/* ------------------------------------------- the bridge, for institutes -- */
/**
 * The Institute portal's own mark: Setu's bridge drawn in line — arches and
 * pillars draw themselves in, then small lights travel across the deck, the
 * way records travel between an institute and the Ministry.
 */
function BridgeArt({ className = "", style }) {
  const arches = [
    "M20 250 Q120 120 220 250",
    "M220 250 Q320 120 420 250",
    "M420 250 Q520 120 620 250",
  ];
  return (
    <svg viewBox="0 0 640 330" className={`st-bridge ${className}`} style={style} aria-hidden="true">
      <defs>
        <linearGradient id="st-deck" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="640" y2="0">
          <stop offset="0" stopColor="var(--pri)" stopOpacity=".15" />
          <stop offset=".5" stopColor="var(--pri)" stopOpacity=".9" />
          <stop offset="1" stopColor="var(--pri)" stopOpacity=".15" />
        </linearGradient>
      </defs>
      <path d="M0 292 Q160 280 320 292 T640 292" fill="none" stroke="var(--pri)" strokeOpacity=".14" strokeWidth="2" className="st-bridge-water" />
      <path d="M0 306 Q160 296 320 306 T640 306" fill="none" stroke="var(--pri)" strokeOpacity=".09" strokeWidth="2" className="st-bridge-water is-2" />
      {arches.map((d, i) => (
        <path key={d} d={d} fill="none" stroke="var(--pri)" strokeWidth="3" strokeLinecap="round" className="st-bridge-draw" style={{ animationDelay: `${0.2 + i * 0.25}s` }} />
      ))}
      {[45, 70, 95, 120, 145, 170, 195, 245, 270, 295, 320, 345, 370, 395, 445, 470, 495, 520, 545, 570, 595].map((x, i) => {
        const t = ((x - 20) % 200) / 200;
        const top = 250 - 260 * t * (1 - t);
        return <line key={x} x1={x} y1={250} x2={x} y2={top + 2} stroke="var(--pri)" strokeOpacity=".4" strokeWidth="1.4" className="st-bridge-rise" style={{ animationDelay: `${0.9 + i * 0.03}s` }} />;
      })}
      {[20, 220, 420, 620].map((x, i) => (
        <rect key={x} x={x - 7} y={250} width="14" height="44" rx="2" fill="var(--pri)" fillOpacity=".75" className="st-bridge-rise" style={{ animationDelay: `${0.5 + i * 0.1}s` }} />
      ))}
      <line x1="0" y1="250" x2="640" y2="250" stroke="url(#st-deck)" strokeWidth="6" strokeLinecap="round" className="st-bridge-draw" style={{ animationDelay: "0s" }} />
      {[0, 1, 2].map((k) => (
        <circle key={k} r="4" fill={k === 1 ? "#FF9933" : "var(--pri)"} className="st-bridge-light" style={{ animationDelay: `${1.6 + k * 1.6}s` }} />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------- Nayan, briefly - */
function NayanStory() {
  const { tx } = useLang();
  const points = [
    ["pin", tx("Checks in at the institute with location proof", "स्थान प्रमाण के साथ संस्था पर चेक-इन")],
    ["eye", tx("Captures sealed photo and video evidence", "मुहरबंद फ़ोटो और वीडियो साक्ष्य")],
    ["target", tx("Visits are assigned by a random draw — never announced", "दौरे यादृच्छिक ड्रॉ से तय — पहले से घोषित नहीं")],
    ["file", tx("Files the inspection report from the site", "स्थल से ही निरीक्षण रिपोर्ट")],
  ];
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg" style={{ background: "var(--acc-50)", color: C.acc }}>
          <Icon name="eye" size={22} />
        </span>
        <div>
          <p className="st-display m-0 text-[1.0333rem]" style={{ color: C.ink }}>
            Nayan <span className="st-hi text-sm font-medium" style={{ color: C.acc }}>नयन</span>
          </p>
          <p className="m-0 text-[0.8333rem]" style={{ color: C.muted }}>{tx("The inspectors' mobile app (Android, Play Store)", "निरीक्षकों का मोबाइल ऐप (Android, Play Store)")}</p>
        </div>
      </div>
      <p className="m-0 mt-3 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>
        {tx(
          "Nayan (\"eye\") is what inspectors carry when they visit an institute. It makes every visit a surprise and every piece of evidence tamper-proof — so what they see is what the Ministry sees.",
          "नयन (\"आँख\") वह ऐप है जो निरीक्षक संस्था के दौरे पर साथ रखते हैं। इससे हर दौरा अचानक होता है और हर साक्ष्य छेड़छाड़-रहित — जो वे देखते हैं, वही मंत्रालय देखता है।"
        )}
      </p>
      <ul className="m-0 mt-3 grid gap-2 p-0 sm:grid-cols-2" style={{ listStyle: "none" }}>
        {points.map(([icon, text]) => (
          <li key={text} className="flex items-start gap-2.5 rounded-md border px-3 py-2 text-[0.8667rem]" style={{ borderColor: "var(--line)", color: C.ink2 }}>
            <Icon name={icon} size={16} className="mt-0.5 shrink-0" style={{ color: C.acc }} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-[0.8333rem]" style={{ color: C.muted }}>{tx("Inspectors use Nayan — Setu is for beneficiaries and institutes.", "निरीक्षक नयन का उपयोग करते हैं — Setu लाभार्थियों और संस्थाओं के लिए है।")}</p>
      {NAYAN_URL && (
        <a href={NAYAN_URL} target="_blank" rel="noreferrer" className="st-btn st-btn-secondary st-btn-md mt-3">
          {tx("Go to Nayan", "नयन पर जाएँ")} <Icon name="external" />
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ sign in ---- */
/**
 * Account creation is not decided yet. When it is, set SIGN_UP to the route
 * (for example "/register") and the sign-in card shows the entry point; the
 * state, language and institute chosen here are passed along in the URL.
 */
const SIGN_UP = null;

/** Sets which portal colours the page wears: green (beneficiary) or navy (institute). */
function usePortalTheme(portal) {
  useEffect(() => {
    document.documentElement.setAttribute("data-portal", portal);
  }, [portal]);
}

const PORTALS = {
  beneficiary: {
    role: "beneficiary",
    en: "Beneficiary",
    hi: "लाभार्थी",
    sub: ["Residents of welfare institutes", "कल्याण संस्थाओं के निवासी"],
    icon: "user",
    eyebrow: ["Citizen services", "नागरिक सेवाएँ"],
    title: ["A bridge between citizens and Government.", "नागरिक और सरकार के बीच एक सेतु।"],
    body: ["Track your applications and benefits, see which documents are verified, and raise grievances that are followed to resolution.", "अपने आवेदन और लाभ देखें, जानें कौन-से दस्तावेज़ सत्यापित हैं, और शिकायतें दर्ज करें जिनका समाधान तक पीछा होता है।"],
    chips: [["rupee", "Benefits & payments", "लाभ व भुगतान"], ["list", "Application status", "आवेदन की स्थिति"], ["fileCheck", "Document verification", "दस्तावेज़ सत्यापन"], ["shieldCheck", "Private grievances", "गोपनीय शिकायतें"]],
  },
  institute: {
    role: "institute_staff",
    en: "Institute",
    hi: "संस्था",
    sub: ["Staff & management", "कर्मचारी व प्रबंधन"],
    icon: "building",
    eyebrow: ["Institute services", "संस्था सेवाएँ"],
    title: ["Run your institute in step with the Ministry.", "मंत्रालय के साथ क़दम मिलाकर संस्था का संचालन।"],
    body: ["Respond to findings with evidence, keep documents and registration current, and see every resident's benefits and verification calls.", "साक्ष्य के साथ निष्कर्षों का जवाब दें, दस्तावेज़ व पंजीकरण अद्यतन रखें, और हर निवासी के लाभ व सत्यापन कॉल देखें।"],
    chips: [["shieldCheck", "Compliance score", "अनुपालन स्कोर"], ["flag", "Findings & evidence", "निष्कर्ष व साक्ष्य"], ["user", "Residents", "निवासी"], ["refresh", "Registration renewal", "पंजीकरण नवीनीकरण"]],
  },
};

function DemoAccountPicker({ role, onPick }) {
  const { tx } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const list = DEMO_ACCOUNTS.filter((a) => a.role === role);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => setOpen(false), [role]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-[0.8333rem] transition-colors" style={{ borderColor: "rgba(255,255,255,.35)", background: "rgba(255,255,255,.12)", color: "#fff", fontFamily: "inherit", cursor: "pointer" }}>
        <span className="flex items-center gap-2">
          <Icon name="user" size={15} />
          {tx(`Use a test account (${list.length})`, `परीक्षण खाता चुनें (${list.length})`)}
        </span>
        <Icon name="chevronDown" size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && (
        <ul className="st-modal absolute bottom-[calc(100%+6px)] left-0 right-0 z-50 m-0 max-h-[320px] overflow-y-auto rounded-lg border bg-white p-1 shadow-xl" style={{ listStyle: "none", borderColor: "var(--line)" }} role="listbox" aria-label="Test accounts">
          {list.map((a) => (
            <li key={a.email} role="option" aria-selected="false">
              <button type="button" onClick={() => { onPick(a); setOpen(false); }} className="st-fopt !py-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.7667rem] font-bold text-white" style={{ background: "var(--pri)" }}>{initials(a.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8667rem] font-semibold" style={{ color: C.ink }}>{a.name}</span>
                  <span className="block truncate text-[0.8rem]" style={{ color: C.muted }}>{a.note} · {a.place}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Whole seconds left until `until` (a timestamp), ticking down; 0 once it has passed. */
function useSecondsLeft(until) {
  const left = () => Math.max(0, Math.ceil(((until || 0) - Date.now()) / 1000));
  const [secs, setSecs] = useState(left);
  useEffect(() => {
    setSecs(left());
    if (!until || until <= Date.now()) return undefined;
    const t = setInterval(() => setSecs(left()), 1000);
    return () => clearInterval(t);
  }, [until]); // eslint-disable-line react-hooks/exhaustive-deps
  return secs;
}

/** Why a sign-in (or 2-step code) failed, in short plain words: { title, body?, lockSeconds?, serverDown? } */
function signInProblem(err, tx) {
  const status = err?.response?.status;
  const detail = typeof err?.response?.data?.detail === "string" ? err.response.data.detail : "";
  if (status === 401) {
    const left = detail.match(/(\d+)\s+(?:more\s+)?attempts?/i)?.[1];
    return {
      title: tx("That email and password don't match an account.", "यह ईमेल और पासवर्ड किसी खाते से मेल नहीं खाते।"),
      body: left ? tx(`${left} more tries before a short lock.`, `थोड़ी देर की रोक से पहले ${left} और प्रयास।`) : null,
    };
  }
  if (status === 423) {
    const header = Number(err.response.headers?.["retry-after"]);
    const minutes = Number(detail.match(/(\d+)\s*minute/i)?.[1]);
    const lockSeconds = header > 0 ? header : minutes > 0 ? minutes * 60 : 0;
    return { title: tx("Too many wrong tries. Sign-in is paused for a while.", "कई बार गलत प्रयास। साइन इन कुछ देर के लिए रुका है।"), body: lockSeconds ? null : detail || null, lockSeconds };
  }
  if (status === 429) return { title: tx("Too many attempts from this network. Please wait a minute and try again.", "इस नेटवर्क से बहुत अधिक प्रयास। एक मिनट रुककर फिर कोशिश करें।") };
  if (status === 403) return { title: tx("This account is disabled. Contact your administrator.", "यह खाता बंद है। अपने प्रशासक से संपर्क करें।"), body: detail && !/disabled/i.test(detail) ? detail : null };
  if (status >= 500 || !err?.response) return { title: errorMessage(err), serverDown: true };
  return { title: errorMessage(err, "Couldn't sign in") };
}

/** Why the last session ended — a calm note above the sign-in card. */
function SignedOutNote({ notice }) {
  const { tx } = useLang();
  const text = {
    idle: tx("You were signed out after 15 minutes of inactivity.", "15 मिनट तक कोई गतिविधि न होने पर आपको साइन आउट कर दिया गया।"),
    elsewhere: tx("You signed out in another tab.", "आपने दूसरे टैब में साइन आउट किया।"),
    ended: tx("Your session ended. Please sign in again.", "आपका सत्र समाप्त हो गया। कृपया फिर से साइन इन करें।"),
  }[notice.kind];
  const extra = notice.kind === "ended" && notice.detail && !/please sign in again\.?$/i.test(notice.detail) ? notice.detail : null;
  return (
    <div className="mt-3" role="status">
      <Callout tone="info" icon={notice.kind === "idle" ? "clock" : "lock"} title={text}>
        {extra}
      </Callout>
    </div>
  );
}

/**
 * The 2-step code: six digits from an authenticator app (typed or pasted —
 * it signs in by itself on the sixth digit), or a single-use recovery code.
 */
function MfaStep({ busy, error, note, onVerify, onBack }) {
  const { tx } = useLang();
  const demo = useDemoMode();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const input = useRef(null);
  useEffect(() => {
    setCode("");
    input.current?.focus();
  }, [recovery]);
  const ready = recovery ? /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code) : code.length === 6;
  // A code that didn't work is cleared, ready for the next one.
  const send = async (value) => {
    if (busy) return;
    await onVerify(value);
    setCode("");
    input.current?.focus();
  };
  const onDigits = (v) => {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && digits !== code) send(digits);
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) send(code); }} noValidate className="st-page mt-3.5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ background: "var(--pri-50)", color: C.pri }}>
          <Icon name="shieldCheck" size={20} />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[0.9667rem] font-semibold" style={{ color: C.ink }}>{tx("2-step verification", "दो-चरण सत्यापन")}</p>
          <p className="m-0 mt-0.5 text-[0.8333rem] leading-snug" style={{ color: C.muted }}>
            {recovery ? tx("Type one of your recovery codes.", "अपना कोई एक रिकवरी कोड लिखें।") : tx("Type the 6-digit code from your authenticator app.", "ऑथेंटिकेटर ऐप से 6 अंकों का कोड लिखें।")}
          </p>
        </div>
      </div>
      <div>
        <label className="sr-only" htmlFor="mfa-code">{recovery ? tx("Recovery code", "रिकवरी कोड") : tx("6-digit code", "6 अंकों का कोड")}</label>
        <div className="st-fieldbox is-input">
          <Icon name={recovery ? "key" : "lock"} size={17} className="shrink-0" style={{ color: code ? C.pri : "#8A9792" }} />
          {recovery ? (
            <input key="rec" id="mfa-code" ref={input} className="st-otp" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))} placeholder="XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
          ) : (
            <input key="otp" id="mfa-code" ref={input} className="st-otp" value={code} onChange={(e) => onDigits(e.target.value)} placeholder="000000" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" />
          )}
        </div>
        {demo && !recovery && <p className="st-hint">{tx(`Test account: the code is ${DEMO_CODE}.`, `परीक्षण खाता: कोड ${DEMO_CODE} है।`)}</p>}
      </div>
      {error && (
        <Callout tone="flag" icon="alert" title={error}>
          {note}
        </Callout>
      )}
      <Button type="submit" size="lg" loading={busy} disabled={!ready} className="w-full" iconRight="arrowRight">
        {busy ? tx("Checking…", "जाँच हो रही है…") : tx("Verify and sign in", "सत्यापित करें और साइन इन करें")}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="st-link !text-[0.8333rem] border-0 bg-transparent p-0" style={{ fontFamily: "inherit", cursor: "pointer" }}>
          <Icon name="chevronLeft" size={14} /> {tx("Back", "पीछे")}
        </button>
        <button type="button" onClick={() => setRecovery((v) => !v)} className="st-link !text-[0.8333rem] border-0 bg-transparent p-0" style={{ fontFamily: "inherit", cursor: "pointer" }}>
          {recovery ? tx("Use the app code instead", "इसके बजाय ऐप का कोड डालें") : tx("Use a recovery code instead", "इसके बजाय रिकवरी कोड डालें")}
        </button>
      </div>
    </form>
  );
}

function Login() {
  const { login, verifyMfa, user } = useAuth();
  const { prefs, setPrefs, tx } = useLang();
  const navigate = useNavigate();
  const hoverRef = useRef(false);
  // The flag (or bridge) grows with the panel, so large screens aren't left empty.
  const leftRef = useRef(null);
  const [art, setArt] = useState(560);
  useEffect(() => {
    const el = leftRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setArt(Math.round(Math.max(420, Math.min(width * 0.8, (height * 0.7 - 60) * 1.5, 1040))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [portal, setPortal] = useState("beneficiary");
  const P = PORTALS[portal];
  usePortalTheme(portal);

  const [openField, setOpenField] = useState(null);
  const toggle = (id) => setOpenField((cur) => (cur === id ? null : id));
  const close = () => setOpenField(null);

  const [state, setState] = useState(prefs.state);
  const [language, setLanguage] = useState(choiceOf(prefs));
  const [institute, setInstitute] = useState(prefs.instituteId || prefs.instituteName ? { id: prefs.instituteId, name: prefs.instituteName, manual: prefs.instituteManual } : null);
  const [manualName, setManualName] = useState("");
  const [manual, setManual] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [demoFilled, setDemoFilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // no double submit, even between renders
  const [error, setError] = useState("");
  const [errorNote, setErrorNote] = useState(null);
  const [lockUntil, setLockUntil] = useState(0);
  const lockLeft = useSecondsLeft(lockUntil);
  const [capsOn, setCapsOn] = useState(false);
  // While set, the card asks for the 2-step code: { token, expiresAt }.
  const [mfa, setMfa] = useState(null);
  // Why the last session ended (idle, 401, another tab) — shown until the next try.
  const [notice, setNotice] = useState(sessionStore.notice);
  const [serverDown, setServerDown] = useState(false);
  const [wrongApp, setWrongApp] = useState(null);
  const [mismatch, setMismatch] = useState(null);
  const [nayanOpen, setNayanOpen] = useState(false);

  // A sign-out elsewhere clears the saved choices: mirror that here.
  useEffect(() => {
    if (!prefs.state && !prefs.instituteId && !prefs.instituteName) {
      setState(null);
      setInstitute(null);
    }
  }, [prefs.state, prefs.instituteId, prefs.instituteName]);

  // A language chosen elsewhere (Yukt, "Hindi mein karo") shows in the box too.
  useEffect(() => {
    const c = choiceOf(prefs);
    if (c !== language) setLanguage(c);
  }, [prefs.language, prefs.order]); // eslint-disable-line react-hooks/exhaustive-deps

  const instSearch = useInstituteSearch(portal === "beneficiary" ? state : null, openField === "institute");

  // Yukt can switch the tab ("institute login").
  useEffect(() => {
    const on = (e) => (e.detail === "institute" || e.detail === "beneficiary") && switchPortal(e.detail);
    window.addEventListener("setu:portal", on);
    return () => window.removeEventListener("setu:portal", on);
  });

  if (user) return <Navigate to="/" replace />;

  const suggested = stateOf(state)?.suggest;
  function pickState(s) {
    setState(s);
    setPrefs({ state: s });
    if (institute?.state && institute.state !== s) setInstitute(null);
    close();
  }
  function pickLanguage(code) {
    setLanguage(code);
    setPrefs(prefsForChoice(code, prefs.order));
    close();
  }
  function pickInstitute(v) {
    setInstitute(v);
    setPrefs({ instituteId: v?.id || null, instituteName: v?.name || null, instituteManual: Boolean(v?.manual) });
    if (v?.state && !state) {
      setState(v.state);
      setPrefs({ state: v.state });
    }
    close();
  }
  function startOver() {
    setState(null);
    setLanguage("bi");
    setInstitute(null);
    setEmail("");
    setPassword("");
    clearProblems();
    setMfa(null);
    setDemoFilled(false);
    setPrefs({ state: null, language: "hi", instituteId: null, instituteName: null, instituteManual: false, order: "en" });
  }
  function switchPortal(p) {
    setPortal(p);
    clearProblems();
    setMfa(null);
    close();
  }
  function clearProblems() {
    setError("");
    setErrorNote(null);
    setWrongApp(null);
    setMismatch(null);
    setServerDown(false);
    setNotice(null);
  }
  function showProblem(err) {
    if (err instanceof WrongAppError) return setWrongApp(err.role);
    if (err instanceof PortalMismatchError) return setMismatch(err.role);
    const p = signInProblem(err, tx);
    setError(p.title);
    setErrorNote(p.body || null);
    setServerDown(Boolean(p.serverDown));
    setLockUntil(p.lockSeconds ? Date.now() + p.lockSeconds * 1000 : 0);
  }
  /** Runs one sign-in request at a time; the button shows it is working. */
  async function oneAtATime(work) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  // After sign-in the portal always opens at its home page.
  function signedIn() {
    setPrefs({ onboarded: true });
    navigate("/", { replace: true });
  }

  async function submit(e) {
    e?.preventDefault();
    if (busyRef.current || lockLeft > 0) return;
    close();
    clearProblems();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError(tx("Enter your email and password.", "अपना ईमेल और पासवर्ड दर्ज करें।"));
      return;
    }
    await oneAtATime(async () => {
      // An account picked from "Use a demo account" always opens the built-in
      // demo record — on localhost too, whether or not a backend is running.
      if (demoFilled && DEMO_ACCOUNTS.some((a) => a.email === cleanEmail)) tryDemo();
      try {
        const res = await login(cleanEmail, password, P.role);
        if (res.mfa) setMfa(res.mfa);
        else signedIn();
      } catch (err) {
        showProblem(err);
      }
    });
  }
  function verify(code) {
    clearProblems();
    return oneAtATime(async () => {
      try {
        await verifyMfa(mfa.token, code, email.trim().toLowerCase(), P.role);
        signedIn();
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 && /timed out|sign in again/i.test(String(err.response.data?.detail || ""))) {
          // The code step lasts a few minutes; after that, start again.
          setMfa(null);
          setError(tx("That took too long. Please sign in again.", "बहुत देर हो गई। कृपया फिर से साइन इन करें।"));
        } else if (status === 401) {
          setError(tx("That code didn't work. Please try again.", "यह कोड सही नहीं है। कृपया फिर से कोशिश करें।"));
        } else {
          if (status === 423 || err instanceof WrongAppError || err instanceof PortalMismatchError) setMfa(null);
          showProblem(err);
        }
      }
    });
  }
  async function continueWithDemo() {
    tryDemo();
    await submit();
  }
  function fillDemo(a) {
    setEmail(a.email);
    setPassword("Password123!");
    setDemoFilled(true);
    setError("");
    setMismatch(null);
    const entry = MOCK_DIRECTORY.find((d) => d.id === a.institute_id);
    if (entry) {
      setInstitute({ id: entry.id, name: entry.name, state: entry.state, district: entry.district });
      setPrefs({ instituteId: entry.id, instituteName: entry.name, instituteManual: false });
    }
    if (a.state && portal === "beneficiary") {
      setState(a.state);
      setPrefs({ state: a.state });
    }
    if (!language) pickLanguage("en");
  }

  const stateOptions = STATES.map((s) => ({ value: s.name, label: s.name, sub: s.kind === "ut" ? `${s.hi} · Union Territory` : s.hi, search: `${s.name} ${s.hi}` }));
  const rank = (c) => (c === "bi" ? 0 : c === "en" ? 1 : c === suggested ? 2 : 3);
  const langOptions = [...LANG_CHOICES]
    .sort((a, b) => rank(a.code) - rank(b.code))
    .map((l) => {
      const f = SCRIPT_FONT[l.script];
      return { value: l.code, label: l.native, sub: l.note ? tx(l.note[0], l.note[1]) : l.name, search: `${l.name} ${l.native} ${l.code} hindi english`, badge: l.code === "bi" ? tx("Default", "डिफ़ॉल्ट") : l.code === suggested ? tx("Suggested", "सुझाव") : null, font: f ? `'${f[1]}', 'Noto Sans', sans-serif` : undefined, dir: l.rtl ? "rtl" : undefined };
    });
  const instOptions = instSearch.rows.map((r) => ({ value: r.id, label: r.name, sub: `${(INSTITUTE_TYPE[r.type] || [r.type])[0]} · ${r.district}, ${r.state}${r.sentinel ? " · Registered" : ""}`, raw: r }));
  const langDisplay = language ? choiceLabel(language) : "";

  const instituteField = (step) => (
    <FieldSelect
      id="institute"
      step={step}
      label={portal === "beneficiary" ? tx("Institute", "संस्था") : tx("Your institute", "आपकी संस्था")}
      icon="building"
      selected={institute?.id || institute?.name || null}
      display={institute?.name}
      placeholder={portal === "beneficiary" ? (state ? tx(`Select your institute in ${state}`, `${state} में अपनी संस्था चुनें`) : tx("Select your institute", "अपनी संस्था चुनें")) : tx("Search by institute name", "संस्था के नाम से खोजें")}
      open={openField === "institute"}
      onToggle={() => toggle("institute")}
      onClose={close}
      options={manual ? [] : instOptions}
      remote={manual ? undefined : instSearch.setQ}
      loading={instSearch.loading}
      searchPlaceholder={tx("Search name or district", "नाम या ज़िला खोजें")}
      emptyText={instSearch.unavailable ? tx("The register isn't available — type the name below.", "रजिस्टर उपलब्ध नहीं — नीचे नाम लिखें।") : tx("No institute matches", "कोई संस्था मेल नहीं खाती")}
      onPick={(id, o) => pickInstitute({ id, name: o.raw.name, state: o.raw.state, district: o.raw.district, manual: false })}
      footer={
        manual ? (
          <div className="flex gap-2">
            <input className="st-field !min-h-[38px]" autoFocus value={manualName} onChange={(e) => setManualName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && manualName.trim().length >= 3 && pickInstitute({ id: null, name: manualName.trim(), manual: true })} placeholder={tx("Institute name as on your papers", "कागज़ों पर लिखा संस्था का नाम")} aria-label="Institute name" />
            <Button size="sm" disabled={manualName.trim().length < 3} onClick={() => pickInstitute({ id: null, name: manualName.trim(), manual: true })}>{tx("Use", "चुनें")}</Button>
          </div>
        ) : (
          <button type="button" className="st-link !text-[0.8rem] border-0 bg-transparent p-0" style={{ fontFamily: "inherit", cursor: "pointer" }} onClick={() => setManual(true)}>
            {tx("Not listed? Type your institute's name", "सूची में नहीं? संस्था का नाम लिखें")}
          </button>
        )
      }
    />
  );
  const languageField = (step, align) => (
    <FieldSelect id="language" align={align} step={step} label={tx("Language", "भाषा")} icon="globe" selected={language} display={langDisplay} placeholder={tx("Language", "भाषा")} open={openField === "language"} onToggle={() => toggle("language")} onClose={close} options={langOptions} onPick={pickLanguage} searchPlaceholder={tx("Search 23 languages", "23 भाषाएँ खोजें")} />
  );

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" style={{ background: "var(--bg)" }}>
      <GovBar minimal />
      <div className="st-tricolour" />
      <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* ------------------------------------------ about the portal ---- */}
        <section ref={leftRef} className="relative flex flex-col overflow-hidden bg-white px-6 py-6 sm:px-10 lg:py-6 xl:px-14" onMouseEnter={() => (hoverRef.current = true)} onMouseLeave={() => (hoverRef.current = false)}>
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(700px 420px at 0% 0%, color-mix(in srgb, var(--pri) 9%, transparent), transparent 70%)" }} aria-hidden="true" />
          {portal === "beneficiary" ? (
            <FlagWatermark
              key="flag"
              hoverRef={hoverRef}
              width={art}
              className="absolute st-page"
              style={{ right: -Math.round(art * 0.06), bottom: Math.round(art * 0.05), opacity: 0.96, transform: "rotate(-4deg)", filter: "drop-shadow(0 18px 22px rgba(15,40,25,.16)) drop-shadow(0 1px 1px rgba(15,40,25,.18))", WebkitMaskImage: "linear-gradient(105deg, transparent 0%, #000 24%)", maskImage: "linear-gradient(105deg, transparent 0%, #000 24%)" }}
            />
          ) : (
            <BridgeArt key="bridge" className="st-page absolute" style={{ right: -30, bottom: 10, width: Math.round(art * 1.12), maxWidth: "88%" }} />
          )}
          <div className="relative flex items-center gap-3">
            <SetuMark size={38} />
            <div className="leading-tight">
              <p className="st-display m-0 text-[1.2rem]" style={{ color: C.ink }}>
                Setu <span className="st-hi text-[1.0333rem] font-medium" style={{ color: C.acc }}>सेतु</span>
              </p>
              <p className="m-0 text-[0.8rem]" style={{ color: C.muted }}>{portal === "beneficiary" ? tx("Beneficiary services portal", "लाभार्थी सेवा पोर्टल") : tx("Institute services portal", "संस्था सेवा पोर्टल")}</p>
            </div>
          </div>
          <div key={portal} className="st-page relative mt-7 lg:mt-[6vh]" style={{ maxWidth: "min(40vw, 720px)" }}>
            <p className="m-0 font-semibold uppercase tracking-[.16em]" style={{ color: C.pri, fontSize: "clamp(12px, .85vw, 16px)" }}>{tx(P.eyebrow[0], P.eyebrow[1])}</p>
            <h1 className="st-display m-0 mt-2 leading-[1.12]" style={{ color: C.ink, fontSize: "clamp(26px, 2.35vw, 50px)" }}>{tx(P.title[0], P.title[1])}</h1>
            {!(prefs.language === "hi" && prefs.order === "local") && <p className="st-hi m-0 mt-1.5" style={{ color: C.muted, fontSize: "clamp(15px, 1.2vw, 24px)" }}>{P.title[1]}</p>}
            <p className="m-0 mt-3 leading-relaxed" style={{ color: C.ink2, fontSize: "clamp(14px, 1.02vw, 19px)", maxWidth: "min(34vw, 620px)" }}>{tx(P.body[0], P.body[1])}</p>
            <ul className="m-0 mt-5 hidden flex-wrap gap-2 p-0 [@media(min-height:780px)]:flex" style={{ listStyle: "none", fontSize: "clamp(12px, .8vw, 15px)", maxWidth: "min(38vw, 640px)" }}>
              {P.chips.map(([icon, en, hi]) => (
                <li key={en} className="flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1.5 backdrop-blur-sm" style={{ borderColor: "var(--pri-100)", color: C.pri8 }}>
                  <Icon name={icon} size={14} style={{ color: C.pri }} /> {tx(en, hi)}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-auto flex flex-wrap items-end justify-between gap-3 pt-4 text-[0.8rem]">
            <p className="m-0 max-w-sm rounded-md bg-white/85 px-2 py-1 leading-relaxed backdrop-blur-sm" style={{ color: C.muted }}>
              <strong style={{ color: C.ink }}>Sentinel</strong> — {tx("the Ministry's monitoring console behind Setu, so no grievance is lost.", "Setu के पीछे मंत्रालय का निगरानी कंसोल, ताकि कोई शिकायत न खोए।")}
            </p>
            <button type="button" onClick={() => setNayanOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border-0 bg-white/85 px-2 py-1 font-semibold hover:underline" style={{ fontFamily: "inherit", cursor: "pointer", color: C.pri }}>
              <Icon name="eye" size={15} /> {tx("Know about Nayan", "नयन के बारे में जानें")}
            </button>
          </div>
        </section>

        {/* ----------------------------------------------- sign-in side ---- */}
        <section className="relative flex px-4 py-6 sm:px-8 lg:min-h-0 lg:overflow-y-auto lg:py-4 lg:pr-[84px] 2xl:pr-8" style={{ background: "linear-gradient(165deg, var(--pri-8) 0%, var(--pri) 100%)", transition: "background .4s" }}>
          <div className="pointer-events-none absolute inset-0 opacity-[.07]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "18px 18px" }} aria-hidden="true" />
          <div className="relative m-auto w-full max-w-[420px]">
            <div className="rounded-xl bg-white p-4 shadow-2xl sm:p-5" style={{ boxShadow: "0 30px 60px -24px rgba(0,0,0,.45)" }}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="st-display m-0 text-[1.2rem]" style={{ color: C.ink }}>{tx("Sign in to Setu", "Setu में साइन इन करें")}</h2>
                <button type="button" onClick={startOver} className="st-link !text-[0.8rem] border-0 bg-transparent p-0" style={{ fontFamily: "inherit", cursor: "pointer" }} title={tx("Clear every field", "सभी फ़ील्ड साफ़ करें")}>
                  <Icon name="refresh" /> {tx("Start over", "फिर से शुरू")}
                </button>
              </div>

              {notice && !error && <SignedOutNote notice={notice} />}

              <div className="mt-3 flex gap-2" role="group" aria-label="Sign in as">
                {Object.entries(PORTALS).map(([k, v]) => (
                  <button key={k} type="button" className="st-portaltab" aria-pressed={portal === k} onClick={() => switchPortal(k)}>
                    <span className="st-portaltab-ico"><Icon name={v.icon} size={17} /></span>
                    <span className="min-w-0">
                      <span className="block text-[0.9rem] font-semibold">{tx(v.en, v.hi)}</span>
                      <span className="block truncate text-[0.7667rem]" style={{ color: C.muted }}>{tx(v.sub[0], v.sub[1])}</span>
                    </span>
                  </button>
                ))}
              </div>

              {mfa ? (
                <MfaStep key={`mfa-${portal}`} busy={busy} error={error} note={errorNote} onVerify={verify} onBack={() => { setMfa(null); clearProblems(); setPassword(""); }} />
              ) : (
              <form key={portal} onSubmit={submit} noValidate className="st-page mt-3.5 space-y-2.5">
                {portal === "beneficiary" ? (
                  <>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <FieldSelect id="state" step="1" label={tx("State", "राज्य")} icon="pin" selected={state} display={state} placeholder={tx("State / UT", "राज्य")} open={openField === "state"} onToggle={() => toggle("state")} onClose={close} options={stateOptions} onPick={pickState} searchPlaceholder={tx("Search state or UT", "राज्य खोजें")} />
                      {languageField("2", "right")}
                    </div>
                    {instituteField("3")}
                  </>
                ) : (
                  <>
                    {instituteField("1")}
                    {languageField("2")}
                  </>
                )}
                <div>
                  <p className="st-flabel">
                    <span className="st-fstep">{portal === "beneficiary" ? "4" : "3"}</span>
                    {portal === "beneficiary" ? tx("Sign in", "साइन इन") : tx("Staff sign in", "कर्मचारी साइन इन")}
                  </p>
                  <div className="space-y-2">
                    <FieldInput hideLabel id="email" icon="user" type="email" label={portal === "beneficiary" ? tx("Email", "ईमेल") : tx("Staff email", "कर्मचारी ईमेल")} value={email} onChange={(v) => { setEmail(v); setDemoFilled(false); }} placeholder={portal === "beneficiary" ? tx("Email address", "ईमेल पता") : tx("Staff email address", "कर्मचारी ईमेल पता")} autoComplete="username" />
                    <FieldInput
                      hideLabel
                      id="password"
                      icon="lock"
                      type={show && !demoFilled ? "text" : "password"}
                      label={tx("Password", "पासवर्ड")}
                      value={password}
                      onChange={(v) => { setPassword(v); setDemoFilled(false); }}
                      placeholder={tx("Password", "पासवर्ड")}
                      autoComplete="current-password"
                      inputProps={{
                        // Caps Lock is the commonest cause of a "wrong" password.
                        onKeyDown: (e) => setCapsOn(Boolean(e.getModifierState?.("CapsLock"))),
                        onKeyUp: (e) => setCapsOn(Boolean(e.getModifierState?.("CapsLock"))),
                        onBlur: () => setCapsOn(false),
                        "aria-describedby": capsOn ? "caps-hint" : undefined,
                      }}
                      hint={
                        capsOn ? (
                          <span id="caps-hint" className="st-caps" role="status">
                            <Icon name="alert" size={13} /> {tx("Caps Lock is on", "Caps Lock चालू है")}
                          </span>
                        ) : demoFilled ? (
                          tx("Test account selected — password filled in.", "परीक्षण खाता चुना गया — पासवर्ड भर दिया गया।")
                        ) : null
                      }
                      trailing={
                        <button type="button" onClick={() => setShow((v) => !v)} disabled={demoFilled} className="grid h-8 w-8 place-items-center rounded-md border-0 bg-transparent hover:bg-[#F1F3F2] disabled:opacity-40" style={{ color: C.muted, cursor: "pointer" }} aria-pressed={show && !demoFilled} aria-label={show ? tx("Hide password", "पासवर्ड छिपाएँ") : tx("Show password", "पासवर्ड दिखाएँ")} title={show ? tx("Hide password", "पासवर्ड छिपाएँ") : tx("Show password", "पासवर्ड दिखाएँ")}>
                          <Icon name={show && !demoFilled ? "eyeOff" : "eye"} size={17} />
                        </button>
                      }
                    />
                  </div>
                </div>

                {mismatch && (
                  <Callout tone="info" icon="info" title={mismatch === "institute_staff" ? tx("This is an institute staff account", "यह संस्था कर्मचारी खाता है") : tx("This is a beneficiary account", "यह लाभार्थी खाता है")} action={<Button type="button" size="sm" variant="secondary" onClick={() => switchPortal(mismatch === "institute_staff" ? "institute" : "beneficiary")}>{mismatch === "institute_staff" ? tx("Switch to Institute", "संस्था पर जाएँ") : tx("Switch to Beneficiary", "लाभार्थी पर जाएँ")}</Button>}>
                    {tx("Use the matching sign-in above.", "ऊपर सही साइन-इन चुनें।")}
                  </Callout>
                )}
                {wrongApp && (
                  <Callout tone="accent" icon="info" title={wrongApp === ROLES.INSPECTOR ? tx("Inspectors use Nayan", "निरीक्षक नयन का उपयोग करें") : tx("Officials use Sentinel", "अधिकारी Sentinel का उपयोग करें")}>
                    {wrongApp === ROLES.INSPECTOR ? tx("Your inspections are in the Nayan mobile app.", "आपके निरीक्षण नयन मोबाइल ऐप में हैं।") : tx("Please sign in to Sentinel, the officials' console.", "कृपया अधिकारियों के कंसोल Sentinel में साइन इन करें।")}
                    {wrongApp !== ROLES.INSPECTOR && SENTINEL_URL && <a href={SENTINEL_URL} className="st-link ml-1">Sentinel ↗</a>}
                  </Callout>
                )}
                {error && (
                  <div role="alert">
                    <Callout tone="flag" icon="alert" title={error}>
                      {serverDown && tx("The Setu server isn't responding properly.", "Setu सर्वर ठीक से जवाब नहीं दे रहा।")}
                      {errorNote}
                      {lockUntil > 0 && (lockLeft > 0 ? tx(`You can try again in ${formatClock(lockLeft)}.`, `${formatClock(lockLeft)} बाद फिर कोशिश कर सकते हैं।`) : tx("You can try again now.", "अब फिर कोशिश कर सकते हैं।"))}
                    </Callout>
                    {serverDown && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" icon="refresh" onClick={submit}>{tx("Try again", "फिर कोशिश करें")}</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={continueWithDemo}>{tx("Continue with mock data", "मॉक डेटा के साथ जारी रखें")}</Button>
                      </div>
                    )}
                  </div>
                )}
                <Button type="submit" size="lg" loading={busy} disabled={lockLeft > 0} className="w-full" iconRight="arrowRight">
                  {busy ? tx("Signing in…", "साइन इन हो रहा है…") : portal === "beneficiary" ? tx("Sign in", "साइन इन करें") : tx("Sign in to Institute portal", "संस्था पोर्टल में साइन इन करें")}
                </Button>
                {SIGN_UP && (
                  <Link to={`${SIGN_UP}?portal=${portal}&state=${encodeURIComponent(state || "")}&language=${language || ""}&institute=${encodeURIComponent(institute?.id || institute?.name || "")}`} className="st-link">
                    {tx("Create an account", "खाता बनाएँ")}
                  </Link>
                )}
              </form>
              )}
            </div>
            <div className="mt-2.5">
              <DemoAccountPicker role={P.role} onPick={fillDemo} />
            </div>
            <p className="m-0 mt-2.5 text-center text-[0.8rem] [@media(max-height:720px)]:hidden" style={{ color: "rgba(255,255,255,.8)" }}>
              {portal === "beneficiary" ? tx("Accounts are issued by your institute or the District Social Welfare Office.", "खाते आपकी संस्था या ज़िला समाज कल्याण कार्यालय द्वारा दिए जाते हैं।") : tx("Institute accounts are issued by the District Social Welfare Office.", "संस्था खाते ज़िला समाज कल्याण कार्यालय द्वारा दिए जाते हैं।")}
            </p>
          </div>
        </section>
      </div>
      <Modal open={nayanOpen} onClose={() => setNayanOpen(false)} title={tx("Know about Nayan", "नयन के बारे में")}>
        <NayanStory />
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §12  STAFF PAGES
   ══════════════════════════════════════════════════════════════════════════ */

function useInstitute() {
  const { user } = useAuth();
  return useApi(user?.institute_id ? API.institutes.detail(user.institute_id) : null, { skip: !user?.institute_id });
}

function NoticesPanel({ notices, limit = 3 }) {
  const { tx, lang } = useLang();
  return (
    <Panel title="Updates & notices" hi="अपडेट व सूचनाएँ" icon="bell" action={<TextLink to="/notices">{tx("All", "सभी")}</TextLink>}>
      {notices.unavailable ? (
        <NotYet what={tx("Notices", "सूचनाएँ")} />
      ) : notices.loading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : (notices.data || []).length === 0 ? (
        <p className="m-0 text-sm" style={{ color: C.muted }}>{tx("No new updates.", "कोई नया अपडेट नहीं।")}</p>
      ) : (
        <ul className="m-0 divide-y p-0" style={{ listStyle: "none", borderColor: "var(--line)" }}>
          {(notices.data || []).slice(0, limit).map((n) => (
            <li key={n.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <p className="m-0 text-[0.9rem] font-semibold" style={{ color: C.ink }}>{n.title}</p>
                <span className="shrink-0 text-[0.8rem]" style={{ color: C.muted }}>{relTime(n.created_at, lang)}</span>
              </div>
              <p className="m-0 mt-0.5 line-clamp-2 text-[0.8333rem]" style={{ color: C.muted }}>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function StaffHome() {
  const { user } = useAuth();
  const { tx, lang } = useLang();
  const inst = useInstitute();
  const findings = useApi(API.institutes.alerts(user.institute_id), { fallback: [] });
  const grievances = useApi(API.grievances.list(), { fallback: [], optional: true });
  const docs = useApi(API.institutes.documents(user.institute_id), { fallback: [], optional: true });
  const notices = useApi(API.notices.list(), { fallback: [], optional: true });

  const i = inst.data;
  const st = STATUS[i?.status] || STATUS.yellow;
  const open = (findings.data || []).filter((f) => f.status === "open");
  const unanswered = open.filter((f) => !(f.responses || []).length);
  const openGr = (grievances.data || []).filter((g) => g.status !== "resolved");
  const rn = RENEWAL[i?.renewal_status] || RENEWAL.not_applied;

  const todos = [
    ...unanswered.slice(0, 3).map((f) => ({ key: f.id, icon: "flag", text: tx(`Respond to: ${findingType(f.type)[0]}`, `जवाब दें: ${findingType(f.type)[1]}`), to: "/findings", tone: f.severity === "red" ? "flag" : "watch", tag: f.severity === "red" ? tx("Serious", "गंभीर") : tx("Attention", "ध्यान दें") })),
    ...(i?.renewal_status === "pending" ? [{ key: "renew", icon: "refresh", text: tx("Complete your renewal documents", "नवीनीकरण के दस्तावेज़ पूरे करें"), to: "/renewal", tone: "watch", tag: tx("Renewal", "नवीनीकरण") }] : []),
    ...openGr.slice(0, 2).map((g) => ({ key: g.id, icon: "chat", text: g.subject, to: "/grievances", tone: "info", tag: tx("Grievance", "शिकायत") })),
  ];

  return (
    <div>
      <HeroHeader
        eyebrow={tx(`Institute portal · ${user?.name || ""}`, `संस्था पोर्टल · ${user?.name || ""}`)}
        title={i?.name || tx("Institute overview", "संस्था अवलोकन")}
        meta={[
          i && { icon: "pin", text: `${i.district}, ${i.state}` },
          i && { icon: "building", text: (INSTITUTE_TYPE[i.type] || [i.type])[lang === "hi" ? 1 : 0] },
          i && { icon: "shieldCheck", text: `${tx("Compliance", "अनुपालन")} ${num(i.compliance_score).toFixed(1)} · ${lang === "hi" ? st.hi : st.en}` },
        ]}
      >
        <Button variant="hero" size="sm" icon="info" onClick={() => window.dispatchEvent(new CustomEvent("setu:tour"))}>{tx("Guided tour", "मार्गदर्शित भ्रमण")}</Button>
        <ButtonLink to="/findings" variant="herosolid" size="sm" icon="flag">{tx("Respond to findings", "निष्कर्षों का जवाब दें")}</ButtonLink>
      </HeroHeader>
      {inst.error && <ErrorBox message={inst.error} onRetry={inst.reload} />}
      <div className="st-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="kpis">
        <StatTile color="rose" icon="flag" en="Open findings" hi="खुले निष्कर्ष" value={open.length} tone={open.length ? "flag" : "good"} to="/findings" sub={tx(`${unanswered.length} awaiting your response`, `${unanswered.length} पर जवाब बाकी`)} />
        <StatTile color="purple" icon="chat" en="Open grievances" hi="खुली शिकायतें" value={openGr.length} tone={openGr.length ? "watch" : "good"} to="/grievances" />
        <StatTile color="blue" icon="file" en="Documents on record" hi="रिकॉर्ड में दस्तावेज़" value={(docs.data || []).length} tone="info" to="/documents" />
        <StatTile color="teal" icon="refresh" en="Renewal" hi="नवीनीकरण" value={lang === "hi" ? rn.hi : rn.en} tone={rn.tone} to="/renewal" />
      </div>
      <div data-tour="actions" className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel title="Compliance" hi="अनुपालन" icon="shieldCheck" action={<TextLink to="/institute">{tx("Institute profile", "संस्था प्रोफ़ाइल")}</TextLink>}>
          {inst.loading ? (
            <div className="flex gap-4"><Skeleton className="h-32 w-32 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /></div></div>
          ) : i ? (
            <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
              <ScoreRing value={i.compliance_score} tone={st.tone} label={tx("Compliance score", "अनुपालन स्कोर")} />
              <div className="min-w-0">
                <Badge tone={st.tone} dot>{lang === "hi" ? st.hi : st.en}</Badge>
                <p className="m-0 mt-2 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>
                  {tx("Your compliance score is how the Ministry sees your institute today — from inspections, camera uptime, verification calls with residents and records.", "आपका अनुपालन स्कोर बताता है कि मंत्रालय आज आपकी संस्था को कैसे देखता है — निरीक्षण, कैमरे, निवासियों से सत्यापन कॉल और रिकॉर्ड के आधार पर।")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Sparkline values={i.score_history || []} />
                  <span className="text-[0.8rem]" style={{ color: C.muted }}>
                    {tx("Last 6 inspections", "पिछले 6 निरीक्षण")} · {tx("last visit", "अंतिम दौरा")} {relTime(i.last_inspection_at, lang)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <NotYet what={tx("Institute details", "संस्था विवरण")} />
          )}
        </Panel>

        <Panel title="Action required" hi="कार्रवाई आवश्यक" icon="alert">
          {findings.loading ? (
            <div className="space-y-2"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>
          ) : todos.length === 0 ? (
            <div className="flex items-center gap-3 py-2">
              <span className="st-tone-good grid h-9 w-9 place-items-center rounded-full"><Icon name="check" size={18} /></span>
              <p className="m-0 text-sm font-semibold" style={{ color: C.ink }}>{tx("Nothing needs you right now.", "अभी आपसे कुछ अपेक्षित नहीं।")}</p>
            </div>
          ) : (
            <ul className="st-stagger m-0 space-y-1.5 p-0" style={{ listStyle: "none" }}>
              {todos.map((t) => (
                <li key={t.key}>
                  <Link to={t.to} className="group flex items-center gap-3 rounded-md border px-3 py-2.5 text-[0.9rem] no-underline transition-colors hover:bg-[#F7F8F6]" style={{ borderColor: "var(--line)", color: C.ink }}>
                    <span className={`st-tone-${t.tone} grid h-7 w-7 shrink-0 place-items-center rounded-md`}><Icon name={t.icon} size={15} /></span>
                    <span className="min-w-0 flex-1 truncate font-medium">{t.text}</span>
                    <Badge tone={t.tone}>{t.tag}</Badge>
                    <Icon name="chevronRight" size={16} className="transition-transform group-hover:translate-x-0.5" style={{ color: C.muted }} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>



      <ResidentsOverview />

    </div>
  );
}

/* ----------------------------------------------------------- findings ---- */
function Findings() {
  const { user } = useAuth();
  const { tx, lang } = useLang();
  const toast = useToast();
  const findings = useApi(API.institutes.alerts(user.institute_id), { fallback: [] });
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [responding, setResponding] = useState(null);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = (findings.data || []).filter((f) => {
    const answered = (f.responses || []).length > 0;
    if (filter === "open" && f.status !== "open") return false;
    if (filter === "answered" && !answered) return false;
    if (filter === "closed" && f.status === "open") return false;
    const text = `${f.type} ${findingType(f.type).join(" ")} ${f.detail}`.toLowerCase();
    return !q || text.includes(q.toLowerCase());
  });
  const count = (k) =>
    (findings.data || []).filter((f) => (k === "open" ? f.status === "open" : k === "answered" ? (f.responses || []).length : k === "closed" ? f.status !== "open" : true)).length;

  async function submit() {
    if (!message.trim()) return;
    setBusy(true);
    try {
      let attachment = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("description", `Response to finding ${responding.id}: ${message.trim().slice(0, 140)}`);
        const { data } = await api.post(API.institutes.documents(user.institute_id), fd);
        attachment = data;
      }
      try {
        await api.post(API.findings.respond(responding.id), { message: message.trim(), attachments: attachment ? [attachment.id] : [] });
      } catch (err) {
        // No response route yet: the response still reaches officials as a
        // document on the institute's record (CONFIRMED route).
        if (!isMissing(err)) throw err;
        if (!attachment) {
          const fd = new FormData();
          fd.append("file", new Blob([message.trim()], { type: "text/plain" }), `response-${responding.id}.txt`);
          fd.append("description", `Response to finding ${responding.id}`);
          await api.post(API.institutes.documents(user.institute_id), fd);
        }
      }
      toast.success(tx("Response sent to the Ministry", "जवाब मंत्रालय को भेज दिया गया"));
      setResponding(null);
      setMessage("");
      setFile(null);
      findings.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't send"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead en="Findings" hi="निष्कर्ष" lede={tx("What the Ministry's checks noticed about your institute. Respond with what you have done, and attach a photo or document as evidence.", "मंत्रालय की जाँच में आपकी संस्था के बारे में क्या मिला। आपने क्या किया, वह बताएँ और साक्ष्य के रूप में फ़ोटो या दस्तावेज़ जोड़ें।")} />
      {findings.error && <ErrorBox message={findings.error} onRetry={findings.reload} />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} label="Filter findings" options={[["open", "Open", "खुले", count("open")], ["answered", "Responded", "जवाब दिया", count("answered")], ["closed", "Closed", "बंद", count("closed")], ["all", "All", "सभी", count("all")]]} />
        <SearchInput className="ml-auto w-full sm:w-64" value={q} onChange={setQ} placeholder={tx("Search findings…", "निष्कर्ष खोजें…")} />
        <ClearFilters show={filter !== "open" || q} onClear={() => { setFilter("open"); setQ(""); }} />
      </div>

      {findings.loading ? (
        <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : rows.length === 0 ? (
        <Empty icon="check" title={tx("Nothing here", "यहाँ कुछ नहीं")} body={tx("No findings match these filters.", "इन फ़िल्टर से कोई निष्कर्ष नहीं मिला।")} />
      ) : (
        <ul className="st-stagger m-0 space-y-3 p-0" style={{ listStyle: "none" }}>
          {rows.map((f) => {
            const answered = (f.responses || []).length > 0;
            return (
              <li key={f.id}>
                <Card className="p-5" style={{ borderLeft: `3px solid ${f.severity === "red" ? "var(--bad)" : "var(--warn)"}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={f.severity === "red" ? "flag" : "watch"} dot>{f.severity === "red" ? tx("Serious", "गंभीर") : tx("Needs attention", "ध्यान दें")}</Badge>
                        <Badge tone={f.status === "open" ? "watch" : "neutral"}>{f.status === "open" ? tx("Open", "खुला") : f.status === "escalated" ? tx("With senior officers", "वरिष्ठ अधिकारियों के पास") : tx("Reviewed", "समीक्षित")}</Badge>
                        {answered && <Badge tone="good">{tx("You responded", "आपने जवाब दिया")}</Badge>}
                        <span className="st-mono text-[0.8rem]" style={{ color: C.muted }}>{f.id.toUpperCase()}</span>
                      </div>
                      <h3 className="m-0 mt-2 text-[1rem] font-semibold" style={{ color: C.ink }}>
                        <Tx en={findingType(f.type)[0]} hi={findingType(f.type)[1]} inline subClassName="text-[0.8333rem] font-medium" />
                      </h3>
                      <p className="m-0 mt-1 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>{f.detail}</p>
                      <p className="m-0 mt-2 flex items-center gap-1.5 text-[0.8rem]" style={{ color: C.muted }}><Icon name="clock" size={13} /> {formatDateTime(f.created_at, lang)}</p>
                    </div>
                    {f.status === "open" && (
                      <Button size="sm" variant={answered ? "secondary" : "primary"} icon={answered ? "plus" : "send"} onClick={() => setResponding(f)}>
                        {answered ? tx("Add more", "और जोड़ें") : tx("Respond", "जवाब दें")}
                      </Button>
                    )}
                  </div>
                  {answered && (
                    <ul className="st-tl m-0 mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                      {f.responses.map((r) => (
                        <li key={r.id} className="is-done">
                          <span className="st-tl-dot" />
                          <p className="m-0 text-[0.9rem]" style={{ color: C.ink }}>{r.message}</p>
                          <p className="m-0 mt-0.5 text-[0.8rem]" style={{ color: C.muted }}>{r.by} · {relTime(r.at, lang)}{r.attachments?.length ? ` · ${tx("evidence attached", "साक्ष्य संलग्न")}` : ""}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(responding)}
        onClose={() => setResponding(null)}
        title={tx("Respond to finding", "निष्कर्ष का जवाब")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResponding(null)}>{tx("Cancel", "रद्द करें")}</Button>
            <Button loading={busy} disabled={!message.trim()} onClick={submit} icon="send">{tx("Send response", "जवाब भेजें")}</Button>
          </>
        }
      >
        {responding && (
          <div className="space-y-4">
            <div className="rounded-md border px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)", background: "var(--subtle)" }}>
              <p className="m-0 font-semibold" style={{ color: C.ink }}>{findingType(responding.type)[lang === "hi" ? 1 : 0]}</p>
              <p className="m-0 mt-1 text-[0.8333rem]" style={{ color: C.muted }}>{responding.detail}</p>
            </div>
            <div>
              <label className="st-label" htmlFor="resp">{tx("What have you done about it?", "आपने इस पर क्या किया?")}</label>
              <textarea id="resp" className="st-field" rows={4} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 2000))} placeholder={tx("e.g. The camera cable was loose; it was fixed on 26 Sept and is recording again.", "जैसे: कैमरे का तार ढीला था; 26 सितंबर को ठीक किया गया, अब रिकॉर्ड हो रहा है।")} />
              <p className="st-hint text-right">{message.length}/2000</p>
            </div>
            {file ? (
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
                <span className="flex min-w-0 items-center gap-2"><Icon name="file" size={16} style={{ color: C.muted }} /><span className="truncate">{file.name} · {fmtSize(file.size)}</span></span>
                <Button size="sm" variant="ghost" onClick={() => setFile(null)}>{tx("Remove", "हटाएँ")}</Button>
              </div>
            ) : (
              <FileDrop onFile={setFile} hint={tx("Optional: a photo or document as evidence", "वैकल्पिक: साक्ष्य के रूप में फ़ोटो या दस्तावेज़")} />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------- documents ---- */
const DOC_KINDS = [
  { key: "renewal", en: "Renewal document", hi: "नवीनीकरण दस्तावेज़" },
  { key: "certificate", en: "Safety / fitness certificate", hi: "सुरक्षा / फ़िटनेस प्रमाणपत्र" },
  { key: "finding", en: "Evidence for a finding", hi: "निष्कर्ष का साक्ष्य" },
  { key: "register", en: "Resident register / records", hi: "निवासी रजिस्टर / रिकॉर्ड" },
  { key: "beneficiary", en: "Beneficiary document (for a resident)", hi: "लाभार्थी दस्तावेज़ (निवासी के लिए)" },
  { key: "other", en: "Other", hi: "अन्य" },
];

function useUpload() {
  const { user } = useAuth();
  const [progress, setProgress] = useState(null);
  const upload = useCallback(
    async (file, description) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("description", description);
      setProgress(0);
      try {
        const { data } = await api.post(API.institutes.documents(user.institute_id), fd, {
          onUploadProgress: (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)),
        });
        setProgress(100);
        return data;
      } finally {
        setTimeout(() => setProgress(null), 600);
      }
    },
    [user]
  );
  return { upload, progress };
}

function Documents() {
  const { user } = useAuth();
  const { tx, lang } = useLang();
  const toast = useToast();
  const docs = useApi(API.institutes.documents(user.institute_id), { fallback: [], optional: true });
  const [local, setLocal] = useState([]);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("certificate");
  const [desc, setDesc] = useState("");
  const [q, setQ] = useState("");
  const { upload, progress } = useUpload();

  const list = [...local, ...(docs.data || []).filter((d) => !local.some((l) => l.id === d.id))].filter(
    (d) => !q || `${d.filename} ${d.description}`.toLowerCase().includes(q.toLowerCase())
  );

  async function send() {
    if (!file) return;
    if (file.size > 10e6) {
      toast.error(tx("That file is over 10 MB", "फ़ाइल 10 MB से बड़ी है"));
      return;
    }
    const k = DOC_KINDS.find((x) => x.key === kind);
    try {
      const d = await upload(file, `${k.en}${desc.trim() ? ` — ${desc.trim()}` : ""}`);
      setLocal((l) => [{ ...d, filename: d.filename || file.name, size: d.size || file.size, uploaded_at: d.uploaded_at || new Date().toISOString() }, ...l]);
      toast.success(tx("Uploaded. Officials can see it now.", "अपलोड हो गया। अधिकारी अब इसे देख सकते हैं।"));
      setFile(null);
      setDesc("");
      docs.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Upload failed"));
    }
  }

  return (
    <div>
      <PageHead en="Documents" hi="दस्तावेज़" lede={tx("Certificates, renewal papers, beneficiary documents and evidence. Everything you upload goes straight to your institute's record.", "प्रमाणपत्र, नवीनीकरण के कागज़, लाभार्थी दस्तावेज़ और साक्ष्य। आप जो भी अपलोड करें, वह सीधे संस्था के रिकॉर्ड में जाता है।")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <Panel title="Upload a document" hi="दस्तावेज़ अपलोड करें" icon="upload" className="h-fit">
          <div className="space-y-4">
            <div>
              <label className="st-label" htmlFor="kind">{tx("Document type", "दस्तावेज़ का प्रकार")}</label>
              <select id="kind" className="st-field" value={kind} onChange={(e) => setKind(e.target.value)}>
                {DOC_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>{lang === "hi" ? k.hi : k.en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="st-label" htmlFor="desc">{tx("Short note (optional)", "छोटा नोट (वैकल्पिक)")}</label>
              <input id="desc" className="st-field" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={tx("e.g. Fire NOC valid till 2027", "जैसे: फ़ायर NOC 2027 तक मान्य")} />
            </div>
            {file ? (
              <div className="rounded-md border px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><Icon name="file" size={16} style={{ color: C.muted }} /><span className="truncate">{file.name} · {fmtSize(file.size)}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => setFile(null)}>{tx("Remove", "हटाएँ")}</Button>
                </div>
                {progress !== null && <div className="mt-2"><Progress value={progress} /></div>}
              </div>
            ) : (
              <FileDrop onFile={setFile} />
            )}
            <Button className="w-full" icon="upload" disabled={!file} loading={progress !== null && progress < 100} onClick={send}>
              {tx("Upload", "अपलोड करें")}
            </Button>
          </div>
        </Panel>

        <Panel
          title="On record"
          hi="रिकॉर्ड में"
          icon="file"
          bodyClassName="!p-0"
          action={
            <div className="flex items-center gap-2">
              <SearchInput className="w-44" value={q} onChange={setQ} placeholder={tx("Search…", "खोजें…")} label="Search documents" />
              <ClearFilters show={q} onClear={() => setQ("")} />
            </div>
          }
        >
          {docs.unavailable && local.length === 0 ? (
            <div className="p-5"><NotYet what={tx("The document list", "दस्तावेज़ सूची")} /></div>
          ) : docs.loading ? (
            <div className="space-y-2 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : list.length === 0 ? (
            <div className="p-5"><Empty icon="file" title={tx("No documents match", "कोई दस्तावेज़ मेल नहीं खाता")} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="st-table">
                <thead>
                  <tr>
                    <th>{tx("Document", "दस्तावेज़")}</th>
                    <th>{tx("Uploaded", "अपलोड")}</th>
                    <th>{tx("Status", "स्थिति")}</th>
                  </tr>
                </thead>
                <tbody className="st-stagger">
                  {list.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="flex items-start gap-2.5">
                          <Icon name="file" size={17} className="mt-0.5 shrink-0" style={{ color: C.muted }} />
                          <div className="min-w-0">
                            <p className="m-0 font-semibold" style={{ color: C.ink }}>{d.description || d.filename}</p>
                            <p className="m-0 truncate text-[0.8rem]" style={{ color: C.muted }}>{d.filename}{d.size ? ` · ${fmtSize(d.size)}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-[0.8333rem]" style={{ color: C.muted }}>{formatDate(d.uploaded_at, lang)}</td>
                      <td><Badge tone="good" dot>{tx("On record", "रिकॉर्ड में")}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ renewal ---- */
const RENEWAL_DOCS = [
  { key: "fire", en: "Fire safety certificate", hi: "अग्नि सुरक्षा प्रमाणपत्र", match: /fire/i },
  { key: "building", en: "Building fitness certificate", hi: "भवन फ़िटनेस प्रमाणपत्र", match: /building|structur/i },
  { key: "food", en: "Food safety certificate / audit", hi: "खाद्य सुरक्षा प्रमाणपत्र / ऑडिट", match: /food|kitchen/i },
  { key: "police", en: "Staff police verification", hi: "कर्मचारियों का पुलिस सत्यापन", match: /police|verification/i },
  { key: "register", en: "Resident register (latest)", hi: "निवासी रजिस्टर (नवीनतम)", match: /register|resident/i },
];

function Renewal() {
  const { user } = useAuth();
  const { tx, lang } = useLang();
  const toast = useToast();
  const inst = useInstitute();
  const docs = useApi(API.institutes.documents(user.institute_id), { fallback: [], optional: true });
  const [target, setTarget] = useState(null);
  const [file, setFile] = useState(null);
  const [extra, setExtra] = useState([]);
  const { upload, progress } = useUpload();

  const i = inst.data;
  const rn = RENEWAL[i?.renewal_status] || RENEWAL.not_applied;
  const all = [...extra, ...(docs.data || [])];
  const have = RENEWAL_DOCS.map((d) => ({ ...d, done: all.some((x) => d.match.test(`${x.description} ${x.filename}`)) }));
  const doneCount = have.filter((d) => d.done).length;
  const validUntil = parseDate(i?.registration_valid_until);
  const daysLeft = validUntil ? Math.ceil((validUntil - Date.now()) / 86400000) : null;
  const at = i?.renewal_status === "approved" || i?.renewal_status === "rejected" ? 4 : doneCount === have.length ? 3 : doneCount ? 2 : 1;

  async function send() {
    if (!file || !target) return;
    try {
      const d = await upload(file, `${target.en} (renewal)`);
      setExtra((l) => [{ ...d, description: `${target.en} (renewal)`, filename: d.filename || file.name }, ...l]);
      toast.success(tx("Added to your renewal", "आपके नवीनीकरण में जोड़ा गया"));
      setTarget(null);
      setFile(null);
      docs.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Upload failed"));
    }
  }

  return (
    <div>
      <PageHead en="Registration renewal" hi="पंजीकरण नवीनीकरण" lede={tx("Keep your registration current. Upload each required document; officials decide in Sentinel and the decision appears here.", "अपना पंजीकरण चालू रखें। हर ज़रूरी दस्तावेज़ अपलोड करें; अधिकारी Sentinel में निर्णय लेते हैं और वह यहाँ दिखता है।")} />
      {inst.error && <ErrorBox message={inst.error} onRetry={inst.reload} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="Application status" hi="आवेदन की स्थिति" icon="refresh" action={i?.registration_no ? <span className="st-mono text-[0.8rem]" style={{ color: C.muted }}>{i.registration_no}</span> : null}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="st-display m-0 text-[1.2667rem]" style={{ color: C.ink }}>{lang === "hi" ? rn.hi : rn.en}</p>
            <Badge tone={rn.tone} dot>{lang === "hi" ? rn.hi : rn.en}</Badge>
          </div>
          <div className="mt-6">
            <Track at={at} steps={[{ label: tx("Apply", "आवेदन") }, { label: tx("Documents", "दस्तावेज़") }, { label: tx("Review", "समीक्षा") }, { label: tx("Decision", "निर्णय") }]} />
          </div>
          {daysLeft !== null && (
            <div className="mt-6 flex items-center gap-4 rounded-md border px-4 py-3" style={{ borderColor: daysLeft < 90 ? "#F2D0AE" : "var(--line)", background: daysLeft < 90 ? "var(--acc-50)" : "var(--subtle)" }}>
              <span className="st-display st-tnum text-[1.5333rem]" style={{ color: daysLeft < 90 ? C.acc : C.pri }}>
                <CountUp to={Math.max(0, daysLeft)} />
              </span>
              <span className="text-[0.9rem]" style={{ color: C.ink2 }}>
                {tx("days until your registration expires", "दिन बचे हैं पंजीकरण समाप्त होने में")} · {formatDate(i.registration_valid_until, lang)}
              </span>
            </div>
          )}
        </Panel>

        <Panel title="Required documents" hi="ज़रूरी दस्तावेज़" icon="list" action={<span className="st-tnum text-[0.8333rem] font-semibold" style={{ color: C.pri }}>{doneCount}/{have.length}</span>}>
          <Progress value={(doneCount / have.length) * 100} />
          <ul className="m-0 mt-4 divide-y p-0" style={{ listStyle: "none" }}>
            {have.map((d) => (
              <li key={d.key} className="flex items-center gap-3 py-2.5" style={{ borderColor: "var(--line)" }}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${d.done ? "st-tone-good" : "st-tone-neutral"}`}>
                  <Icon name={d.done ? "check" : "clock"} size={13} />
                </span>
                <span className={`min-w-0 flex-1 text-[0.9rem] ${lang === "hi" ? "st-hi" : ""}`} style={{ color: C.ink }}>{lang === "hi" ? d.hi : d.en}</span>
                {d.done ? (
                  <Badge tone="good">{tx("Uploaded", "अपलोड")}</Badge>
                ) : (
                  <Button size="sm" variant="secondary" icon="upload" onClick={() => setTarget(d)}>{tx("Upload", "अपलोड")}</Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={target ? (lang === "hi" ? target.hi : target.en) : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>{tx("Cancel", "रद्द करें")}</Button>
            <Button disabled={!file} icon="upload" loading={progress !== null && progress < 100} onClick={send}>{tx("Upload", "अपलोड करें")}</Button>
          </>
        }
      >
        {file ? (
          <div className="rounded-md border px-3 py-2.5 text-sm" style={{ borderColor: "var(--line)" }}>
            <span className="flex items-center gap-2"><Icon name="file" size={16} style={{ color: C.muted }} /> {file.name} · {fmtSize(file.size)}</span>
            {progress !== null && <div className="mt-2"><Progress value={progress} /></div>}
          </div>
        ) : (
          <FileDrop onFile={setFile} />
        )}
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------- institute ---- */
function Institute() {
  const { tx, lang } = useLang();
  const inst = useInstitute();
  const i = inst.data;
  if (inst.loading) return <Skeleton className="h-72" />;
  if (!i) return inst.error ? <ErrorBox message={inst.error} onRetry={inst.reload} /> : <NotYet what={tx("Institute details", "संस्था विवरण")} />;
  const st = STATUS[i.status] || STATUS.yellow;
  const occ = i.capacity ? Math.round((i.residents / i.capacity) * 100) : null;
  const rows = [
    [tx("Registration no.", "पंजीकरण सं."), <span className="st-mono">{i.registration_no}</span>],
    [tx("Type", "प्रकार"), (INSTITUTE_TYPE[i.type] || [i.type])[lang === "hi" ? 1 : 0]],
    [tx("District", "ज़िला"), `${i.district}, ${i.state}`],
    [tx("Address", "पता"), i.address],
    [tx("Registration valid until", "पंजीकरण मान्य"), formatDate(i.registration_valid_until, lang)],
    [tx("Last inspection", "अंतिम निरीक्षण"), formatDate(i.last_inspection_at, lang)],
  ];
  return (
    <div>
      <PageHead en="Institute profile" hi="संस्था प्रोफ़ाइल" lede={tx("How your institute appears on the Ministry's record.", "मंत्रालय के रिकॉर्ड में आपकी संस्था कैसी दिखती है।")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title={i.name} icon="building" action={<Badge tone={st.tone} dot>{lang === "hi" ? st.hi : st.en}</Badge>}>
          <dl className="m-0">
            {rows.map(([k, v]) => (
              <div key={k} className="st-kv">
                <dt>{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <div className="space-y-4">
          <Panel title="Compliance score" hi="अनुपालन स्कोर" icon="shieldCheck">
            <div className="grid place-items-center py-2">
              <ScoreRing value={i.compliance_score} tone={st.tone} size={140} label={tx("Compliance score", "अनुपालन स्कोर")} />
            </div>
          </Panel>
          {occ !== null && (
            <Panel title="Occupancy" hi="क्षमता उपयोग" icon="user">
              <p className="st-display st-tnum m-0 text-[1.3333rem]" style={{ color: C.ink }}>{i.residents} <span className="text-[1rem] font-medium" style={{ color: C.muted }}>/ {i.capacity}</span></p>
              <div className="mt-2"><Progress value={occ} tone={occ > 95 ? "flag" : undefined} /></div>
              <p className="m-0 mt-1.5 text-[0.8rem]" style={{ color: C.muted }}>{occ}% {tx("of registered capacity", "पंजीकृत क्षमता का")}</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- residents ---- */
const APP_STATUS_LABEL = {
  approved: ["Approved", "स्वीकृत", "good"],
  active: ["Active", "सक्रिय", "good"],
  pending: ["In process", "प्रक्रिया में", "watch"],
  rejected: ["Not approved", "अस्वीकृत", "flag"],
};
function useResidents() {
  const { user } = useAuth();
  return useApi(user?.institute_id ? API.institutes.residents(user.institute_id) : null, { fallback: [], optional: true, skip: !user?.institute_id });
}
function residentFlags(r) {
  const docsPending = (r.documents || []).filter((d) => d.status !== "verified").length;
  const waiting = (r.schemes || []).filter((s) => s.action || s.status === "rejected").length;
  const inProcess = (r.schemes || []).filter((s) => s.status === "pending").length;
  return { docsPending, waiting, inProcess, needsAction: docsPending > 0 || waiting > 0 };
}

/** Staff overview: the institute's residents at a glance. */
function ResidentsOverview() {
  const { tx } = useLang();
  const residents = useResidents();
  const rows = residents.data || [];
  if (residents.unavailable) return null;
  const apps = rows.flatMap((r) => r.schemes || []);
  const count = (st) => apps.filter((a) => a.status === st).length;
  const payments = paymentsByMonth(rows.flatMap((r) => (r.schemes || []).flatMap((s) => s.disbursements || [])));
  const total12 = payments.reduce((a, p) => a + p.value, 0);
  const attention = rows.filter((r) => residentFlags(r).needsAction);
  return (
    <div data-tour="residents" className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Panel title="Payments to residents" hi="निवासियों को भुगतान" icon="rupee" action={<span className="text-[0.8333rem]" style={{ color: C.muted }}>{tx("Last 12 months", "पिछले 12 महीने")} · <strong className="st-tnum" style={{ color: C.ink }}>{rupees(total12)}</strong></span>}>
        {residents.loading ? <Skeleton className="h-[300px]" /> : <BarChart data={payments} height={300} format={rupees} axisFormat={compactINR} title={tx("Amount paid", "भुगतान राशि")} />}
      </Panel>
      <div className="space-y-4">
        <Panel title="Residents' applications" hi="निवासियों के आवेदन" icon="list" action={<TextLink to="/residents">{tx("Residents", "निवासी")}</TextLink>}>
          {residents.loading ? (
            <Skeleton className="h-20" />
          ) : (
            <StatusBreakdown
              items={[
                { key: "active", label: tx("Approved / active", "स्वीकृत / सक्रिय"), value: count("approved") + count("active"), tone: "good" },
                { key: "pending", label: tx("In process", "प्रक्रिया में"), value: count("pending"), tone: "watch" },
                { key: "rejected", label: tx("Not approved", "अस्वीकृत"), value: count("rejected"), tone: "flag" },
              ]}
            />
          )}
        </Panel>
        <Panel title="Residents needing help" hi="सहायता चाहने वाले निवासी" icon="alert">
          {residents.loading ? (
            <Skeleton className="h-16" />
          ) : attention.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: C.muted }}>{tx("No resident is waiting on a document or re-application.", "कोई निवासी दस्तावेज़ या पुनः आवेदन की प्रतीक्षा में नहीं।")}</p>
          ) : (
            <ul className="m-0 space-y-2 p-0" style={{ listStyle: "none" }}>
              {attention.slice(0, 4).map((r) => {
                const f = residentFlags(r);
                return (
                  <li key={r.user_id}>
                    <Link to={`/residents?open=${encodeURIComponent(r.user_id)}`} className="flex items-center gap-3 rounded-md border px-3 py-2 no-underline transition-colors hover:bg-[#F7F9F6]" style={{ borderColor: "var(--line)" }}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.7667rem] font-bold text-white" style={{ background: "var(--pri)" }}>{initials(r.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9rem] font-semibold" style={{ color: C.ink }}>{r.name}</span>
                        <span className="block truncate text-[0.8rem]" style={{ color: C.muted }}>
                          {f.docsPending ? tx(`${f.docsPending} document${f.docsPending > 1 ? "s" : ""} to submit`, `${f.docsPending} दस्तावेज़ जमा करने हैं`) : tx("Re-application needed", "पुनः आवेदन आवश्यक")}
                        </span>
                      </span>
                      <Icon name="chevronRight" size={16} style={{ color: C.muted }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Residents() {
  const { tx, lang } = useLang();
  const residents = useResidents();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const all = residents.data || [];
  const openId = params.get("open");
  const openRow = all.find((r) => r.user_id === openId);
  const rows = all.filter((r) => {
    const f = residentFlags(r);
    if (filter === "action" && !f.needsAction) return false;
    if (filter === "docs" && !f.docsPending) return false;
    if (filter === "process" && !f.inProcess) return false;
    return !q || `${r.name} ${r.beneficiary_id} ${r.room}`.toLowerCase().includes(q.toLowerCase());
  });
  const cnt = (k) => all.filter((r) => { const f = residentFlags(r); return k === "all" || (k === "action" && f.needsAction) || (k === "docs" && f.docsPending) || (k === "process" && f.inProcess); }).length;
  const activeBenefits = all.flatMap((r) => r.schemes || []).filter((s) => s.status === "approved" || s.status === "active").length;
  const docsPending = all.reduce((a, r) => a + residentFlags(r).docsPending, 0);
  const openGr = all.reduce((a, r) => a + (r.grievances_open || 0), 0);
  const close = () => setParams({});

  return (
    <div>
      <PageHead en="Residents" hi="निवासी" lede={tx("Every resident's benefits, documents and verification calls — so nothing waits on the institute office.", "हर निवासी के लाभ, दस्तावेज़ और सत्यापन कॉल — ताकि संस्था कार्यालय के कारण कुछ न रुके।")} />
      {residents.error && <ErrorBox message={residents.error} onRetry={residents.reload} />}
      {residents.unavailable ? (
        <NotYet what={tx("The resident list", "निवासी सूची")} />
      ) : (
        <>
          <div className="st-stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile color="teal" icon="user" en="Residents on Setu" hi="Setu पर निवासी" value={all.length} tone="info" />
            <StatTile color="green" icon="check" en="Active benefits" hi="सक्रिय लाभ" value={activeBenefits} tone="good" />
            <StatTile color="blue" icon="fileCheck" en="Documents to submit" hi="जमा करने वाले दस्तावेज़" value={docsPending} tone={docsPending ? "accent" : "good"} sub={tx("Upload them under Documents", "इन्हें दस्तावेज़ में अपलोड करें")} />
            <StatTile color="purple" icon="chat" en="Open grievances" hi="खुली शिकायतें" value={openGr} tone={openGr ? "watch" : "good"} sub={tx("Includes private ones (count only)", "गोपनीय भी (केवल संख्या)")} />
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented value={filter} onChange={setFilter} label="Filter residents" options={[["all", "All", "सभी", cnt("all")], ["action", "Needs action", "कार्रवाई आवश्यक", cnt("action")], ["docs", "Documents pending", "दस्तावेज़ लंबित", cnt("docs")], ["process", "Applications in process", "आवेदन प्रक्रिया में", cnt("process")]]} />
            <SearchInput className="ml-auto w-full sm:w-64" value={q} onChange={setQ} placeholder={tx("Search name, ID or room…", "नाम, आईडी या कमरा खोजें…")} />
            <ClearFilters show={filter !== "all" || q} onClear={() => { setFilter("all"); setQ(""); }} />
          </div>
          <Card className="overflow-hidden">
            {residents.loading ? (
              <div className="space-y-2 p-5"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : rows.length === 0 ? (
              <div className="p-5"><Empty icon="user" title={tx("No residents match", "कोई निवासी मेल नहीं खाता")} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>{tx("Resident", "निवासी")}</th>
                      <th>{tx("Benefits", "लाभ")}</th>
                      <th>{tx("Documents", "दस्तावेज़")}</th>
                      <th>{tx("Grievances", "शिकायतें")}</th>
                      <th>{tx("Last verification call", "पिछली सत्यापन कॉल")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="st-stagger">
                    {rows.map((r) => {
                      const docs = r.documents || [];
                      const ok = docs.filter((d) => d.status === "verified").length;
                      return (
                        <tr key={r.user_id} className="cursor-pointer" onClick={() => setParams({ open: r.user_id })}>
                          <td>
                            <div className="flex items-center gap-3">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.7667rem] font-bold text-white" style={{ background: "var(--pri)" }}>{initials(r.name)}</span>
                              <div className="min-w-0">
                                <p className="m-0 font-semibold" style={{ color: C.ink }}>{r.name}</p>
                                <p className="m-0 text-[0.8rem]" style={{ color: C.muted }}><span className="st-mono">{r.beneficiary_id}</span> · {r.age} {tx("yrs", "वर्ष")} · {r.room}</p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {(r.schemes || []).map((s) => {
                                const st = APP_STATUS_LABEL[s.status] || APP_STATUS_LABEL.pending;
                                return <Badge key={s.key} tone={s.action ? "accent" : st[2]} dot>{s.name.split(" — ")[0].replace(/ for .*$/, "").slice(0, 26)}</Badge>;
                              })}
                            </div>
                          </td>
                          <td>
                            <span className="st-tnum font-semibold" style={{ color: ok === docs.length ? C.ok : C.acc }}>{ok}/{docs.length}</span>
                            <span className="text-[0.8rem]" style={{ color: C.muted }}> {tx("verified", "सत्यापित")}</span>
                          </td>
                          <td className="st-tnum">{r.grievances_open ? <Badge tone="watch">{r.grievances_open} {tx("open", "खुली")}</Badge> : <span style={{ color: C.muted }}>—</span>}</td>
                          <td className="whitespace-nowrap text-[0.8333rem]" style={{ color: C.muted }}>
                            {r.last_call ? (
                              <>
                                {formatDate(r.last_call.scheduled_at, lang)} · <span style={{ color: r.last_call.status === "missed" ? C.bad : C.ok }}>{r.last_call.status === "missed" ? tx("Missed", "छूटी") : tx("Completed", "पूरी")}</span>
                              </>
                            ) : "—"}
                          </td>
                          <td><Icon name="chevronRight" size={16} style={{ color: C.muted }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="m-0 mt-3 flex items-center gap-1.5 text-[0.8rem]" style={{ color: C.muted }}><Icon name="lock" size={13} /> {tx("Private grievances are counted here but their content is visible only to Ministry officials.", "गोपनीय शिकायतें यहाँ गिनी जाती हैं, पर उनकी सामग्री केवल मंत्रालय के अधिकारी देखते हैं।")}</p>
        </>
      )}

      <Modal open={Boolean(openRow)} onClose={close} wide title={openRow ? openRow.name : ""} footer={<><ButtonLink to="/documents" variant="secondary" icon="upload">{tx("Upload a document for this resident", "इस निवासी का दस्तावेज़ अपलोड करें")}</ButtonLink><Button onClick={close}>{tx("Close", "बंद करें")}</Button></>}>
        {openRow && (
          <div className="space-y-4">
            <dl className="m-0 grid gap-x-6 sm:grid-cols-2">
              <div className="st-kv"><dt>{tx("Beneficiary ID", "लाभार्थी आईडी")}</dt><dd className="st-mono">{openRow.beneficiary_id}</dd></div>
              <div className="st-kv"><dt>{tx("Category", "श्रेणी")}</dt><dd>{openRow.category}</dd></div>
              <div className="st-kv"><dt>{tx("Living here since", "यहाँ कब से")}</dt><dd>{formatDate(openRow.admitted_on, lang)}</dd></div>
              <div className="st-kv"><dt>{tx("Next health check-up", "अगली स्वास्थ्य जाँच")}</dt><dd>{formatDate(openRow.next_checkup, lang)}</dd></div>
            </dl>
            <div>
              <p className="st-label">{tx("Applications", "आवेदन")}</p>
              <ul className="m-0 divide-y rounded-md border p-0" style={{ listStyle: "none", borderColor: "var(--line)" }}>
                {(openRow.schemes || []).map((s) => {
                  const st = APP_STATUS_LABEL[s.status] || APP_STATUS_LABEL.pending;
                  const paid = (s.disbursements || []).reduce((a, d) => a + d.amount, 0);
                  return (
                    <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
                      <span className="min-w-0">
                        <span className="block text-[0.9rem] font-semibold" style={{ color: C.ink }}>{s.name}</span>
                        <span className="block text-[0.8rem]" style={{ color: C.muted }}>{s.amount ? `${rupees(s.amount)} ${s.period === "per month" ? tx("per month", "प्रति माह") : tx("per year", "प्रति वर्ष")} · ${tx("paid", "भुगतान")} ${rupees(paid)} (12 ${tx("months", "महीने")})` : tx("Training / service", "प्रशिक्षण / सेवा")}</span>
                      </span>
                      <Badge tone={s.action ? "accent" : st[2]} dot>{s.action ? tx("Waiting for a document", "दस्तावेज़ की प्रतीक्षा") : tx(st[0], st[1])}</Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="st-label">{tx("Documents", "दस्तावेज़")}</p>
              <ul className="m-0 grid gap-1.5 p-0 sm:grid-cols-2" style={{ listStyle: "none" }}>
                {(openRow.documents || []).map((d) => (
                  <li key={d.key} className="flex items-center gap-2 text-[0.8667rem]">
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${d.status === "verified" ? "st-tone-good" : d.status === "rejected" ? "st-tone-flag" : "st-tone-watch"}`}><Icon name={d.status === "verified" ? "check" : d.status === "rejected" ? "alert" : "clock"} size={11} /></span>
                    <span style={{ color: C.ink2 }}>{d.name}</span>
                    <span className="text-[0.8rem]" style={{ color: C.muted }}>· {d.status === "verified" ? tx("verified", "सत्यापित") : d.status === "rejected" ? tx("rejected — resubmit", "अस्वीकृत — पुनः जमा करें") : tx("pending", "लंबित")}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §13  SHARED PAGES
   ══════════════════════════════════════════════════════════════════════════ */

const catOf = (key) => COMPLAINT_CATEGORIES.find((c) => c.key === key) || COMPLAINT_CATEGORIES[COMPLAINT_CATEGORIES.length - 1];
const refNo = (id) => `SETU-${String(id || "").replace(/^gr-/, "").slice(-6).toUpperCase()}`;
const openPreferences = () => window.dispatchEvent(new CustomEvent("setu:open-prefs"));

function grievanceSteps(tx) {
  return [{ label: tx("Submitted", "दर्ज") }, { label: tx("Being looked into", "जाँच जारी") }, { label: tx("Resolved", "हल") }];
}

/** One grievance — used by staff and beneficiaries. */
function GrievanceCard({ g, showPrivacy = false }) {
  const { tx, lang } = useLang();
  const [open, setOpen] = useState(false);
  const st = GRIEVANCE_STATUS[g.status] || GRIEVANCE_STATUS.open;
  const cat = catOf(g.category);
  const updates = g.updates || [];
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md" style={{ background: "var(--pri-50)", color: C.pri }}>
            <Icon name={cat.icon} size={19} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="st-mono text-[0.8rem] font-medium" style={{ color: C.muted }}>{refNo(g.id)}</span>
              <Badge tone={st.tone} dot>{lang === "hi" ? st.hi : st.en}</Badge>
              {g.urgency === "high" && <Badge tone="flag">{tx("Urgent", "अत्यावश्यक")}</Badge>}
              {showPrivacy && g.confidential && (
                <Badge tone="info">
                  <Icon name="lock" size={11} /> {tx("Private", "गोपनीय")}
                </Badge>
              )}
            </div>
            <h3 className="m-0 mt-1.5 text-[1rem] font-semibold leading-snug" style={{ color: C.ink }}>{g.subject}</h3>
            <p className="m-0 mt-0.5 text-[0.8333rem]" style={{ color: C.muted }}>
              {lang === "hi" ? cat.hi : cat.en} · {tx("filed", "दर्ज")} {formatDate(g.created_at, lang)}
            </p>
          </div>
        </div>
        <Button size="sm" variant="secondary" iconRight={open ? "chevronDown" : "chevronRight"} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? tx("Hide details", "विवरण छिपाएँ") : tx("View details", "विवरण देखें")}
        </Button>
      </div>
      <div className="mt-4 max-w-xl">
        <Track at={st.step} steps={grievanceSteps(tx)} />
      </div>
      {open && (
        <div className="st-page mt-4 grid gap-4 border-t pt-4 md:grid-cols-2" style={{ borderColor: "var(--line)" }}>
          <div>
            <p className="st-label">{tx("What was reported", "क्या बताया गया")}</p>
            <p className="m-0 whitespace-pre-wrap text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>{g.description}</p>
          </div>
          <div>
            <p className="st-label">{tx("Updates", "अपडेट")}</p>
            <ol className="st-tl">
              <li className="is-done">
                <span className="st-tl-dot" />
                <p className="m-0 text-[0.9rem]" style={{ color: C.ink }}>{tx("Grievance received", "शिकायत प्राप्त हुई")}</p>
                <p className="m-0 text-[0.8rem]" style={{ color: C.muted }}>{formatDateTime(g.created_at, lang)}</p>
              </li>
              {updates.map((u, i) => (
                <li key={i} className="is-done">
                  <span className="st-tl-dot" />
                  <p className="m-0 text-[0.9rem]" style={{ color: C.ink }}>{u.text}</p>
                  <p className="m-0 text-[0.8rem]" style={{ color: C.muted }}>{formatDateTime(u.at, lang)}</p>
                </li>
              ))}
              {g.status !== "resolved" && (
                <li>
                  <span className="st-tl-dot" />
                  <p className="m-0 text-[0.9rem]" style={{ color: C.muted }}>{tx("An officer is assigned and works to a deadline. Each step will appear here.", "एक अधिकारी नियुक्त है और समय-सीमा पर काम करता है। हर कदम यहाँ दिखेगा।")}</p>
                </li>
              )}
            </ol>
          </div>
        </div>
      )}
    </Card>
  );
}

function CategoryGrid({ value, onPick, compact = false }) {
  const { tx } = useLang();
  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`} role="radiogroup">
      {COMPLAINT_CATEGORIES.map((c) => (
        <button key={c.key} type="button" role="radio" aria-checked={value === c.key} onClick={() => onPick(c.key)} className="st-choice">
          <Icon name={c.icon} size={18} style={{ color: C.pri, flex: "none" }} />
          <span className="min-w-0 flex-1 text-[0.9rem] font-semibold">{tx(c.en, c.hi)}</span>
          {value === c.key && <Icon name="check" size={15} style={{ color: C.pri }} />}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------- grievances (staff) - */
function Grievances() {
  const { user } = useAuth();
  const { tx, lang } = useLang();
  const toast = useToast();
  const list = useApi(API.grievances.list(), { fallback: [] });
  const [status, setStatus] = useState("all");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "facilities", description: "", urgency: "normal" });
  const [busy, setBusy] = useState(false);

  const all = list.data || [];
  const rows = all.filter((g) => {
    if (status !== "all" && g.status !== status) return false;
    if (cat !== "all" && g.category !== cat) return false;
    return !q || `${g.subject} ${g.description}`.toLowerCase().includes(q.toLowerCase());
  });
  const cnt = (s) => all.filter((g) => s === "all" || g.status === s).length;

  async function submit() {
    if (!form.subject.trim() || !form.description.trim()) return;
    setBusy(true);
    try {
      await api.post(API.grievances.create(), { institute_id: user.institute_id, ...form, subject: form.subject.trim(), description: form.description.trim(), details: form.description.trim() });
      toast.success(tx("Grievance filed with the Ministry", "शिकायत मंत्रालय को भेज दी गई"));
      setCreating(false);
      setForm({ subject: "", category: "facilities", description: "", urgency: "normal" });
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't file grievance"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead en="Grievances" hi="शिकायतें" lede={tx("Problems your institute needs the Ministry's help with — a broken borewell, a pending sanction. Every grievance is tracked against a deadline.", "जिन समस्याओं में संस्था को मंत्रालय की मदद चाहिए — खराब बोरवेल, लंबित स्वीकृति। हर शिकायत समय-सीमा पर ट्रैक होती है।")}>
        <Button icon="plus" onClick={() => setCreating(true)}>{tx("File a grievance", "शिकायत दर्ज करें")}</Button>
      </PageHead>
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={setStatus} label="Status" options={[["all", "All", "सभी", cnt("all")], ["open", "Submitted", "दर्ज", cnt("open")], ["in_review", "Being looked into", "जाँच जारी", cnt("in_review")], ["resolved", "Resolved", "हल", cnt("resolved")]]} />
        <select className="st-field !w-auto !min-h-[36px] !py-1.5 text-[0.9rem]" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="all">{tx("All categories", "सभी श्रेणियाँ")}</option>
          {COMPLAINT_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{lang === "hi" ? c.hi : c.en}</option>
          ))}
        </select>
        <SearchInput className="ml-auto w-full sm:w-60" value={q} onChange={setQ} placeholder={tx("Search grievances…", "शिकायतें खोजें…")} />
        <ClearFilters show={status !== "all" || cat !== "all" || q} onClear={() => { setStatus("all"); setCat("all"); setQ(""); }} />
      </div>

      <div className="mb-4">
        <Callout tone="info" icon="lock">{tx("Grievances that residents mark private go straight to the Ministry and are not shown here.", "निवासियों द्वारा गोपनीय चिह्नित शिकायतें सीधे मंत्रालय को जाती हैं और यहाँ नहीं दिखतीं।")}</Callout>
      </div>

      {list.loading ? (
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : rows.length === 0 ? (
        <Empty icon="chat" title={tx("No grievances match", "कोई शिकायत मेल नहीं खाती")} body={tx("Try another filter, or file a new one.", "दूसरा फ़िल्टर आज़माएँ, या नई शिकायत दर्ज करें।")} />
      ) : (
        <ul className="st-stagger m-0 space-y-3 p-0" style={{ listStyle: "none" }}>
          {rows.map((g) => (
            <li key={g.id}><GrievanceCard g={g} /></li>
          ))}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        wide
        title={tx("File a grievance", "शिकायत दर्ज करें")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>{tx("Cancel", "रद्द करें")}</Button>
            <Button loading={busy} icon="send" disabled={!form.subject.trim() || !form.description.trim()} onClick={submit}>{tx("Submit", "जमा करें")}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="st-label" htmlFor="gr-subject">{tx("Subject", "विषय")}</label>
            <input id="gr-subject" className="st-field" maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={tx("e.g. Borewell pump not working", "जैसे बोरवेल पंप खराब है")} />
          </div>
          <div>
            <span className="st-label">{tx("Category", "श्रेणी")}</span>
            <CategoryGrid value={form.category} onPick={(k) => setForm({ ...form, category: k })} compact />
          </div>
          <div>
            <label className="st-label" htmlFor="gr-desc">{tx("Details", "विवरण")}</label>
            <textarea id="gr-desc" rows={4} className="st-field" maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <span className="st-label">{tx("Urgency", "अत्यावश्यकता")}</span>
            <Segmented value={form.urgency} onChange={(u) => setForm({ ...form, urgency: u })} label="Urgency" options={[["normal", "Normal", "सामान्य"], ["high", "Urgent", "अत्यावश्यक"]]} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------- notices --- */
function Notices() {
  const { tx, lang } = useLang();
  const { isStaff } = useAuth();
  const list = useApi(API.notices.list(), { fallback: [], optional: true });
  const [q, setQ] = useState("");
  const rows = (list.data || []).filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase()));
  const title = isStaff ? ["Notices", "सूचनाएँ"] : ["Updates & notices", "अपडेट व सूचनाएँ"];
  const aud = { all: [tx("Everyone", "सभी"), "neutral"], institute_staff: [tx("Institutes", "संस्थाएँ"), "info"], beneficiary: [tx("Beneficiaries", "लाभार्थी"), "good"] };
  return (
    <div>
      <PageHead en={title[0]} hi={title[1]} lede={tx("Announcements from the Ministry and the State department.", "मंत्रालय और राज्य विभाग की घोषणाएँ।")} />
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.unavailable ? (
        <NotYet what={tx("Notices", "सूचनाएँ")} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SearchInput className="w-full sm:w-80" value={q} onChange={setQ} placeholder={tx("Search updates…", "अपडेट खोजें…")} />
            <ClearFilters show={q} onClear={() => setQ("")} />
          </div>
          {list.loading ? (
            <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
          ) : rows.length === 0 ? (
            <Empty icon="bell" title={tx("No updates", "कोई अपडेट नहीं")} />
          ) : (
            <Card className="overflow-hidden">
              <ul className="st-stagger m-0 divide-y p-0" style={{ listStyle: "none" }}>
                {rows.map((n) => (
                  <li key={n.id} className="flex gap-4 px-5 py-4" style={{ borderColor: "var(--line)" }}>
                    <div className="w-24 shrink-0 text-[0.8rem]" style={{ color: C.muted }}>
                      <p className="m-0 font-semibold" style={{ color: C.ink2 }}>{formatDate(n.created_at, lang)}</p>
                      <p className="m-0">{relTime(n.created_at, lang)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="m-0 text-[0.9333rem] font-semibold" style={{ color: C.ink }}>{n.title}</h3>
                        {aud[n.audience] && <Badge tone={aud[n.audience][1]}>{aud[n.audience][0]}</Badge>}
                      </div>
                      <p className="m-0 mt-1 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>{n.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- help --- */
function HelplineList() {
  const { tx } = useLang();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {HELPLINES.map((h) => (
        <a key={h.number} href={`tel:${h.number}`} className="group flex items-center gap-4 rounded-md border bg-white px-4 py-3 no-underline transition-colors hover:border-[var(--pri)]" style={{ borderColor: "var(--line)" }}>
          <span className="st-display st-tnum w-16 shrink-0 text-[1.2667rem]" style={{ color: h.tone === "flag" ? C.bad : C.pri }}>{h.number}</span>
          <span className="min-w-0 flex-1 text-[0.9rem] font-medium" style={{ color: C.ink }}>{tx(h.en, h.hi)}</span>
          <Icon name="phone" size={17} className="transition-transform group-hover:scale-110" style={{ color: C.pri }} />
        </a>
      ))}
    </div>
  );
}

const FAQ = {
  institute_staff: [
    ["What is my compliance score?", "मेरा अनुपालन स्कोर क्या है?", "A number out of 100 built from inspections, documents, camera uptime and verification calls. Responding to findings and keeping documents current raises it.", "निरीक्षण, दस्तावेज़, कैमरा और सत्यापन कॉल से बना 100 में से अंक। निष्कर्षों का जवाब देने और दस्तावेज़ अद्यतन रखने से यह बढ़ता है।"],
    ["How do I respond to a finding?", "निष्कर्ष का जवाब कैसे दूँ?", "Open Findings, choose Respond, describe what you fixed and attach a photo or document. It reaches the officer handling your institute.", "निष्कर्ष खोलें, 'जवाब दें' चुनें, बताएँ क्या ठीक किया और फ़ोटो या दस्तावेज़ जोड़ें। यह आपकी संस्था देखने वाले अधिकारी तक पहुँचता है।"],
    ["A resident gave me a document. How do I submit it?", "किसी निवासी ने दस्तावेज़ दिया है। कैसे जमा करूँ?", "Go to Documents, choose the type 'Beneficiary document', add the resident's name in the note, and upload.", "दस्तावेज़ में जाएँ, प्रकार 'लाभार्थी दस्तावेज़' चुनें, नोट में निवासी का नाम लिखें और अपलोड करें।"],
    ["Why can't I see some residents' grievances?", "कुछ निवासियों की शिकायतें क्यों नहीं दिखतीं?", "Residents may mark a grievance private. Those go only to the Ministry, so residents can speak without fear.", "निवासी शिकायत को गोपनीय चिह्नित कर सकते हैं। वे केवल मंत्रालय को जाती हैं, ताकि निवासी बेझिझक बोल सकें।"],
  ],
  beneficiary: [
    ["Where can I see my application's status?", "मेरे आवेदन की स्थिति कहाँ दिखेगी?", "Open Benefits & applications. Each application shows its stages — applied, verified, sanctioned, disbursed — with dates and the next step.", "लाभ व आवेदन खोलें। हर आवेदन के चरण — आवेदन, सत्यापन, स्वीकृति, वितरण — तारीख और अगले कदम के साथ दिखते हैं।"],
    ["A document is pending. What do I do?", "कोई दस्तावेज़ लंबित है। क्या करूँ?", "Give a copy to your institute office. They upload it for you, and its status changes here once it is verified.", "उसकी एक प्रति अपनी संस्था के कार्यालय को दें। वे इसे अपलोड करेंगे, और सत्यापन के बाद यहाँ स्थिति बदल जाएगी।"],
    ["Will staff know I raised a grievance?", "क्या कर्मचारियों को पता चलेगा?", "Not if you keep 'Keep it private' on (it is on by default). Private grievances are seen only by Ministry officials.", "नहीं, अगर 'गोपनीय रखें' चालू है (यह पहले से चालू है)। गोपनीय शिकायतें केवल मंत्रालय के अधिकारी देखते हैं।"],
    ["What are verification calls?", "सत्यापन कॉल क्या हैं?", "Officials call residents directly to check on their well-being. Staff are not on the call. You can also request a call.", "अधिकारी सीधे निवासियों को हालचाल जानने के लिए कॉल करते हैं। कर्मचारी कॉल पर नहीं होते। आप कॉल का अनुरोध भी कर सकते हैं।"],
    ["I'm in danger right now.", "मैं अभी खतरे में हूँ।", "Call 112 immediately. Children can call 1098, women 181. These work from any phone, free.", "तुरंत 112 पर कॉल करें। बच्चे 1098, महिलाएँ 181 पर। ये किसी भी फ़ोन से मुफ़्त हैं।"],
  ],
};

function Help() {
  const { role } = useAuth();
  const { tx } = useLang();
  const [open, setOpen] = useState(0);
  const faqs = FAQ[role] || FAQ.beneficiary;
  const how = [
    ["send", tx("You raise it", "आप दर्ज करते हैं"), tx("A grievance, a response or a document — in a few steps.", "शिकायत, जवाब या दस्तावेज़ — कुछ कदमों में।")],
    ["landmark", tx("Sentinel receives it", "Sentinel पाता है"), tx("It reaches an officer's desk with a deadline.", "यह समय-सीमा के साथ अधिकारी तक पहुँचता है।")],
    ["eye", tx("Nayan verifies", "नयन सत्यापित करता है"), tx("Inspectors check on the ground with sealed evidence.", "निरीक्षक मुहरबंद साक्ष्य के साथ ज़मीन पर जाँचते हैं।")],
    ["check", tx("You see the outcome", "आप परिणाम देखते हैं"), tx("Every step appears here in Setu.", "हर कदम यहीं Setu में दिखता है।")],
  ];
  return (
    <div>
      <PageHead en="Help & support" hi="सहायता" lede={tx("Helplines work from any phone, free, 24×7.", "हेल्पलाइन किसी भी फ़ोन से मुफ़्त, 24×7 काम करती हैं।")} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Emergency helplines" hi="आपातकालीन हेल्पलाइन" icon="phone">
            <HelplineList />
          </Panel>
          <Panel title="Common questions" hi="सामान्य प्रश्न" icon="help" bodyClassName="!p-0">
            <ul className="m-0 divide-y p-0" style={{ listStyle: "none" }}>
              {faqs.map(([qen, qhi, aen, ahi], i) => (
                <li key={qen} style={{ borderColor: "var(--line)" }}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 border-0 bg-transparent px-5 py-3.5 text-left transition-colors hover:bg-[#FAFBFA]" style={{ fontFamily: "inherit", cursor: "pointer" }} onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                    <span className="text-[0.9rem] font-semibold" style={{ color: C.ink }}>{tx(qen, qhi)}</span>
                    <Icon name="chevronDown" size={17} style={{ color: C.muted, transform: open === i ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease)" }} />
                  </button>
                  {open === i && <p className="st-page m-0 px-5 pb-4 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>{tx(aen, ahi)}</p>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <Panel title="How Setu works" hi="Setu कैसे काम करता है" icon="bridge" className="h-fit">
          <ol className="st-tl">
            {how.map(([icon, t, b]) => (
              <li key={t} className="is-done">
                <span className="st-tl-dot" />
                <p className="m-0 flex items-center gap-2 text-[0.9rem] font-semibold" style={{ color: C.ink }}><Icon name={icon} size={15} style={{ color: C.pri }} /> {t}</p>
                <p className="m-0 mt-0.5 text-[0.8667rem]" style={{ color: C.muted }}>{b}</p>
              </li>
            ))}
          </ol>
          <hr className="st-divider my-4" />
          <p className="m-0 text-[0.8667rem]" style={{ color: C.muted }}>{tx("Need to change your language or state?", "भाषा या राज्य बदलना है?")}</p>
          <Button size="sm" variant="secondary" icon="globe" className="mt-2" onClick={openPreferences}>{tx("Language & state", "भाषा व राज्य")}</Button>
        </Panel>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- ecosystem --- */
function Ecosystem() {
  const { tx } = useLang();
  const [params] = useSearchParams();
  const to = params.get("to");
  useEffect(() => {
    if (to) setTimeout(() => document.getElementById(to)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [to]);
  const apps = [
    { id: "setu", name: "Setu", hi: "सेतु", icon: "bridge", who: tx("Web portal · beneficiaries & institutes", "वेब पोर्टल · लाभार्थी व संस्थाएँ"), body: tx("Applications, benefits, documents and grievances — for the people inside institutes.", "आवेदन, लाभ, दस्तावेज़ और शिकायतें — संस्थाओं के लोगों के लिए।") },
    { id: "nayan", name: "Nayan", hi: "नयन", icon: "eye", who: tx("Mobile app · inspectors", "मोबाइल ऐप · निरीक्षक"), body: tx("Surprise visits, sealed evidence and on-site reports (Play Store).", "अचानक दौरे, मुहरबंद साक्ष्य और स्थल पर रिपोर्ट (Play Store)।") },
    { id: "sentinel", name: "Sentinel", hi: "प्रहरी", icon: "landmark", who: tx("Web dashboard · officials", "वेब डैशबोर्ड · अधिकारी"), body: tx("The Ministry's console that monitors every institute and every deadline.", "मंत्रालय का कंसोल जो हर संस्था और हर समय-सीमा पर नज़र रखता है।") },
  ];
  return (
    <div>
      <PageHead en="One ecosystem, three platforms" hi="एक तंत्र, तीन प्लेटफ़ॉर्म" lede={tx("Setu, Nayan and Sentinel share one backend — so what you raise here is seen, checked and acted on.", "Setu, नयन और Sentinel एक ही बैकएंड साझा करते हैं — जो आप यहाँ दर्ज करते हैं, वह देखा, जाँचा और सुलझाया जाता है।")} />
      <div className="st-stagger mb-5 grid gap-4 md:grid-cols-3">
        {apps.map((a) => (
          <Card key={a.id} className="p-5" style={a.id === "setu" ? { borderColor: C.pri, boxShadow: `inset 0 0 0 1px ${C.pri}` } : undefined}>
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-md" style={{ background: "var(--pri-50)", color: C.pri }}><Icon name={a.icon} size={20} /></span>
              {a.id === "setu" && <Badge tone="good">{tx("You are here", "आप यहाँ हैं")}</Badge>}
            </div>
            <p className="st-display m-0 mt-3 text-[1.0667rem]" style={{ color: C.ink }}>
              {a.name} <span className="st-hi text-[0.9rem] font-medium" style={{ color: C.muted }}>{a.hi}</span>
            </p>
            <p className="m-0 text-[0.8rem] font-semibold" style={{ color: C.acc }}>{a.who}</p>
            <p className="m-0 mt-2 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>{a.body}</p>
          </Card>
        ))}
      </div>
      <Card className="mb-5 p-6" id="nayan" style={{ scrollMarginTop: 80 }}>
        <NayanStory />
      </Card>
      <Card className="p-6" id="sentinel" style={{ scrollMarginTop: 80 }}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-lg" style={{ background: "var(--info-50)", color: C.info }}><Icon name="landmark" size={22} /></span>
          <div>
            <p className="st-display m-0 text-[1.0333rem]" style={{ color: C.ink }}>Sentinel</p>
            <p className="m-0 text-[0.8333rem]" style={{ color: C.muted }}>{tx("The officials' monitoring console", "अधिकारियों का निगरानी कंसोल")}</p>
          </div>
        </div>
        <p className="m-0 mt-3 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>
          {tx(
            "Sentinel is where officials see every institute's score, every finding and every grievance against a deadline. When you raise something in Setu, it appears in Sentinel with a timer — and escalates automatically if it isn't handled.",
            "Sentinel में अधिकारी हर संस्था का स्कोर, हर निष्कर्ष और हर शिकायत समय-सीमा के साथ देखते हैं। Setu में दर्ज हर बात Sentinel में टाइमर के साथ दिखती है — और न सुलझने पर अपने-आप ऊपर जाती है।"
          )}
        </p>
        <ul className="m-0 mt-3 grid gap-2 p-0 sm:grid-cols-3" style={{ listStyle: "none" }}>
          {[
            ["clock", tx("Grievance deadlines with escalation", "समय-सीमा व एस्केलेशन")],
            ["pin", tx("District heatmap & rankings", "ज़िला हीटमैप व रैंकिंग")],
            ["shieldCheck", tx("Tamper-proof audit trail", "छेड़छाड़-रहित ऑडिट")],
          ].map(([i, t]) => (
            <li key={t} className="flex items-center gap-2 rounded-md border px-3 py-2 text-[0.8667rem]" style={{ borderColor: "var(--line)", color: C.ink2 }}>
              <Icon name={i} size={15} style={{ color: C.info }} />
              {t}
            </li>
          ))}
        </ul>
        <p className="m-0 mt-3 text-[0.8333rem]" style={{ color: C.muted }}>{tx("Officials sign in to Sentinel — Setu is for beneficiaries and institutes.", "अधिकारी Sentinel में साइन इन करते हैं — Setu लाभार्थियों और संस्थाओं के लिए है।")}</p>
        {SENTINEL_URL && (
          <a href={SENTINEL_URL} target="_blank" rel="noreferrer" className="st-btn st-btn-secondary st-btn-md mt-3">
            {tx("Go to Sentinel", "Sentinel पर जाएँ")} <Icon name="external" />
          </a>
        )}
      </Card>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §14  BENEFICIARY PAGES
   ══════════════════════════════════════════════════════════════════════════ */

const SCHEME_STATUS = {
  approved: { en: "Approved", hi: "स्वीकृत", tone: "good" },
  active: { en: "Active", hi: "सक्रिय", tone: "good" },
  pending: { en: "In process", hi: "प्रक्रिया में", tone: "watch" },
  rejected: { en: "Not approved", hi: "अस्वीकृत", tone: "flag" },
};
const DOC_STATUS = {
  verified: { en: "Verified", hi: "सत्यापित", tone: "good", icon: "check" },
  pending: { en: "Pending", hi: "लंबित", tone: "watch", icon: "clock" },
  missing: { en: "Missing", hi: "नहीं है", tone: "flag", icon: "alert" },
  not_required: { en: "Not required", hi: "आवश्यक नहीं", tone: "neutral", icon: "x" },
  rejected: { en: "Rejected — resubmit", hi: "अस्वीकृत — दोबारा जमा करें", tone: "flag", icon: "alert" },
};
const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function schemeSteps(sc, tx, lang) {
  const labels = {
    applied: tx("Applied", "आवेदन"),
    verified: tx("Verified", "सत्यापित"),
    sanctioned: tx("Sanctioned", "स्वीकृत"),
    disbursed: sc.amount ? tx("Disbursed", "वितरित") : tx("Benefit started", "लाभ शुरू"),
  };
  const stages = sc.stages || [];
  return {
    steps: stages.map((s) => ({ label: labels[s.key] || s.key, date: s.at ? formatDate(s.at, lang) : null })),
    at: stages.filter((s) => s.at).length,
  };
}
function docName(d, lang) {
  return lang === "hi" && d.hi ? d.hi : d.name;
}

/** The signed-in beneficiary's record, plus what can be derived without it. */
function useBeneficiary() {
  const { user } = useAuth();
  const profile = useApi(API.beneficiary.me(), { fallback: null, optional: true });
  const inst = useApi(user?.institute_id ? API.institutes.detail(user.institute_id) : null, { skip: !user?.institute_id, optional: true });
  const grievances = useApi(API.grievances.list(), { fallback: [], optional: true });
  const calls = useApi(API.calls.mine(), { fallback: [], optional: true });
  const notices = useApi(API.notices.list(), { fallback: [], optional: true });
  return { profile, inst, grievances, calls, notices };
}

function nextCall(calls) {
  return (calls || [])
    .filter((c) => c.status === "scheduled" && parseDate(c.scheduled_at) && parseDate(c.scheduled_at).getTime() > Date.now())
    .sort((a, b) => parseDate(a.scheduled_at) - parseDate(b.scheduled_at))[0];
}
function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const d = parseDate(target);
  if (!d) return null;
  const s = Math.max(0, (d.getTime() - now) / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), mins: Math.floor((s % 3600) / 60) };
}

/** What needs the beneficiary, and what is coming up. */
function useAgenda(p, calls) {
  const { tx, lang } = useLang();
  const actions = [];
  const upcoming = [];
  (p?.documents || []).filter((d) => d.required && d.status !== "verified").forEach((d) => {
    const forScheme = (p?.schemes || []).find((s) => s.action === `document:${d.key}`);
    actions.push({
      key: `doc-${d.key}`,
      icon: d.status === "rejected" ? "alert" : "fileCheck",
      title: d.status === "rejected" ? tx(`${d.name} was rejected — resubmit`, `${d.hi || d.name} अस्वीकृत — दोबारा जमा करें`) : tx(`${d.name} is pending`, `${d.hi || d.name} लंबित है`),
      body: forScheme ? tx(`Needed for ${forScheme.name}. Give a copy to your institute office — they will upload it.`, `${forScheme.hi || forScheme.name} के लिए ज़रूरी। एक प्रति संस्था कार्यालय को दें — वे अपलोड करेंगे।`) : d.remark,
      to: "/my-documents",
    });
  });
  (p?.schemes || []).filter((s) => s.status === "rejected").forEach((s) => actions.push({ key: `rej-${s.key}`, icon: "alert", title: tx(`${s.name} was not approved`, `${s.hi || s.name} स्वीकृत नहीं हुआ`), body: s.next_step, to: "/benefits" }));
  const nc = nextCall(calls);
  if (nc) upcoming.push({ key: "call", icon: "phone", title: tx("Verification call", "सत्यापन कॉल"), date: nc.scheduled_at, to: "/calls" });
  if (p?.health?.next_checkup) upcoming.push({ key: "health", icon: "health", title: tx("Health check-up", "स्वास्थ्य जाँच"), date: p.health.next_checkup, to: "/profile" });
  (p?.schemes || []).filter((s) => s.next_date).forEach((s) => upcoming.push({ key: `sc-${s.key}`, icon: s.amount ? "rupee" : "calendar", title: lang === "hi" && s.hi ? s.hi : s.name, sub: s.next_amount ? `${rupees(s.next_amount)} · ${formatDate(s.next_date, lang)}` : formatDateTime(s.next_date, lang), date: s.next_date, to: "/benefits" }));
  upcoming.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  return { actions, upcoming };
}

/** Everything that has happened on the beneficiary's record, newest first. */
function buildActivity(p, grievances, calls, tx, lang) {
  const out = [];
  const stageLabel = { applied: tx("Applied", "आवेदन किया"), verified: tx("Verified", "सत्यापित"), sanctioned: tx("Sanctioned", "स्वीकृत"), disbursed: tx("Benefit started", "लाभ शुरू") };
  (p?.schemes || []).forEach((s) => {
    const nm = lang === "hi" && s.hi ? s.hi : s.name;
    (s.stages || []).forEach((st) => st.at && out.push({ id: `${s.key}-${st.key}`, at: st.at, type: "application", icon: st.key === "applied" ? "send" : "check", title: `${stageLabel[st.key]} — ${nm}`, sub: s.application_id, to: "/benefits" }));
    (s.disbursements || []).forEach((d) => out.push({ id: d.ref, at: d.at, type: "payment", icon: "rupee", title: tx(`${rupees(d.amount)} credited — ${s.name}`, `${rupees(d.amount)} जमा — ${nm}`), sub: d.ref, to: "/benefits", good: true }));
  });
  (p?.documents || []).forEach((d) => d.verified_on && out.push({ id: `doc-${d.key}`, at: d.verified_on, type: "document", icon: "fileCheck", title: tx(`${d.name} verified`, `${d.hi || d.name} सत्यापित`), sub: d.by, to: "/my-documents" }));
  (grievances || []).forEach((g) => {
    out.push({ id: `${g.id}-new`, at: g.created_at, type: "grievance", icon: "chat", title: tx(`Grievance filed: ${g.subject}`, `शिकायत दर्ज: ${g.subject}`), sub: refNo(g.id), to: "/grievances" });
    (g.updates || []).forEach((u, i) => out.push({ id: `${g.id}-u${i}`, at: u.at, type: "grievance", icon: "chat", title: u.text, sub: `${refNo(g.id)} · ${g.subject}`, to: "/grievances" }));
  });
  (calls || []).filter((c) => c.status === "completed" || c.status === "missed").forEach((c) => out.push({ id: c.id, at: c.scheduled_at, type: "call", icon: "phone", title: c.status === "missed" ? tx("Verification call missed", "सत्यापन कॉल छूटी") : tx("Verification call completed", "सत्यापन कॉल पूरी हुई"), sub: c.outcome, to: "/calls" }));
  return out.filter((e) => parseDate(e.at) && parseDate(e.at).getTime() <= Date.now()).sort((a, b) => parseDate(b.at) - parseDate(a.at));
}
const ACTIVITY_TYPES = [
  ["all", "All", "सभी"],
  ["application", "Applications", "आवेदन"],
  ["payment", "Payments", "भुगतान"],
  ["document", "Documents", "दस्तावेज़"],
  ["grievance", "Grievances", "शिकायतें"],
  ["call", "Calls", "कॉल"],
];
function ActivityList({ items, compact = false }) {
  const { lang } = useLang();
  return (
    <ol className="st-tl">
      {items.map((e) => (
        <li key={e.id} className="is-done">
          <span className="st-tl-dot" style={e.type === "payment" ? { background: "var(--ok)", borderColor: "var(--ok)" } : e.type === "grievance" ? { background: "var(--acc)", borderColor: "var(--acc)" } : e.type === "call" ? { background: "var(--info)", borderColor: "var(--info)" } : undefined} />
          <Link to={e.to} className="group block no-underline">
            <p className="m-0 flex items-start justify-between gap-3 text-[0.9rem]" style={{ color: C.ink }}>
              <span className="min-w-0 font-medium group-hover:underline">{e.title}</span>
              <span className="shrink-0 text-[0.8rem]" style={{ color: C.muted }}>{compact ? relTime(e.at, lang) : formatDate(e.at, lang)}</span>
            </p>
            {e.sub && <p className={`m-0 text-[0.8rem] ${compact ? "truncate" : ""}`} style={{ color: C.muted }}>{e.sub}</p>}
          </Link>
        </li>
      ))}
    </ol>
  );
}

function BeneficiaryHome() {
  const { user } = useAuth();
  const { tx, lang, prefs } = useLang();
  const { profile, inst, grievances, calls, notices } = useBeneficiary();
  const p = profile.data;
  const i = inst.data;
  const { actions, upcoming } = useAgenda(p, calls.data);
  const openGr = (grievances.data || []).filter((g) => g.status !== "resolved");
  const docs = (p?.documents || []).filter((d) => d.required);
  const verified = docs.filter((d) => d.status === "verified").length;
  const allPay = (p?.schemes || []).flatMap((s) => s.disbursements || []);
  const payments = paymentsByMonth(allPay);
  const received = payments.reduce((a, b) => a + b.value, 0);
  const active = (p?.schemes || []).filter((s) => s.status === "approved" || s.status === "active");
  const nextCredit = (p?.schemes || []).filter((s) => s.next_amount && s.next_date).sort((a, b) => parseDate(a.next_date) - parseDate(b.next_date))[0];
  const activity = buildActivity(p, grievances.data, calls.data, tx, lang).slice(0, 6);
  const first = (user?.name || "").split(" ")[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? tx("Good morning", "सुप्रभात") : hour < 17 ? tx("Good afternoon", "नमस्कार") : tx("Good evening", "शुभ संध्या");
  const startTour = () => window.dispatchEvent(new CustomEvent("setu:tour"));

  return (
    <div>
      <HeroHeader
        eyebrow={greet}
        title={tx(`Welcome, ${user?.name || first}`, `स्वागत है, ${user?.name || first}`)}
        meta={[
          p?.beneficiary_id && { icon: "user", text: p.beneficiary_id, mono: true },
          { icon: "building", text: i?.name || p?.institute_name || prefs.instituteName },
          (i?.state || prefs.state) && { icon: "pin", text: i ? `${i.district}, ${i.state}` : prefs.state },
        ]}
      >
        <Button variant="hero" size="sm" icon="info" onClick={startTour}>{tx("Guided tour", "मार्गदर्शित भ्रमण")}</Button>
        <ButtonLink to="/schemes" variant="herosolid" size="sm" icon="landmark">{tx("Find schemes", "योजनाएँ खोजें")}</ButtonLink>
      </HeroHeader>

      {profile.error && <ErrorBox message={profile.error} onRetry={profile.reload} />}
      <div className="st-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="kpis">
        <StatTile color="green" icon="check" en="Active benefits" hi="सक्रिय लाभ" value={profile.loading ? "…" : active.length} tone="good" to="/benefits" sub={p ? tx(`${(p.schemes || []).length} applications in all`, `कुल ${(p.schemes || []).length} आवेदन`) : undefined} />
        <StatTile color="saffron" icon="rupee" en="Received · 12 months" hi="प्राप्त · 12 महीने" value={profile.loading ? "…" : rupees(received)} tone="good" to="/benefits" sub={nextCredit ? tx(`Next: ${rupees(nextCredit.next_amount)} on ${formatDate(nextCredit.next_date, lang)}`, `अगला: ${rupees(nextCredit.next_amount)} · ${formatDate(nextCredit.next_date, lang)}`) : undefined} />
        <StatTile color="blue" icon="fileCheck" en="Documents verified" hi="सत्यापित दस्तावेज़" value={docs.length ? `${verified}/${docs.length}` : "—"} tone={docs.length && verified === docs.length ? "good" : "accent"} to="/my-documents" />
        <StatTile color="purple" icon="chat" en="Open grievances" hi="खुली शिकायतें" value={grievances.loading ? "…" : openGr.length} tone={openGr.length ? "watch" : "good"} to="/grievances" />
      </div>

      <div data-tour="actions" className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel title="Action required" hi="कार्रवाई आवश्यक" icon="alert" action={actions.length ? <Badge tone="accent">{actions.length}</Badge> : null}>
          {profile.loading ? (
            <Skeleton className="h-16" />
          ) : actions.length === 0 ? (
            <div className="flex items-center gap-3">
              <span className="st-tone-good grid h-9 w-9 shrink-0 place-items-center rounded-full"><Icon name="check" size={18} /></span>
              <div>
                <p className="m-0 text-[0.9rem] font-semibold" style={{ color: C.ink }}>{tx("Nothing is needed from you right now.", "अभी आपसे कुछ अपेक्षित नहीं।")}</p>
                <p className="m-0 text-[0.8333rem]" style={{ color: C.muted }}>{tx("We'll show it here the moment something is.", "जैसे ही कुछ होगा, यहाँ दिखेगा।")}</p>
              </div>
            </div>
          ) : (
            <ul className="st-stagger m-0 space-y-2 p-0" style={{ listStyle: "none" }}>
              {actions.map((a) => (
                <li key={a.key}>
                  <Link to={a.to} className="group flex items-start gap-3 rounded-md border px-3.5 py-3 no-underline transition-colors hover:bg-[#FFFAF4]" style={{ borderColor: "var(--acc-line)", borderLeft: `3px solid ${C.acc}` }}>
                    <Icon name={a.icon} size={18} className="mt-0.5 shrink-0" style={{ color: C.acc }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9rem] font-semibold" style={{ color: C.ink }}>{a.title}</span>
                      {a.body && <span className="block text-[0.8333rem]" style={{ color: C.muted }}>{a.body}</span>}
                    </span>
                    <Icon name="chevronRight" size={17} className="mt-0.5 transition-transform group-hover:translate-x-0.5" style={{ color: C.muted }} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Coming up" hi="आगामी" icon="calendar">
          {upcoming.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: C.muted }}>{profile.loading ? "…" : tx("Nothing scheduled.", "कुछ निर्धारित नहीं।")}</p>
          ) : (
            <ul className="m-0 divide-y p-0" style={{ listStyle: "none" }}>
              {upcoming.slice(0, 4).map((u) => {
                const d = parseDate(u.date);
                return (
                  <li key={u.key} style={{ borderColor: "var(--line)" }}>
                    <Link to={u.to} className="flex items-center gap-3 py-2.5 no-underline">
                      <span className="w-12 shrink-0 rounded-md border text-center leading-tight" style={{ borderColor: "var(--line)" }}>
                        <span className="block pt-1 text-[0.7rem] font-semibold uppercase" style={{ color: C.acc }}>{d?.toLocaleDateString("en-IN", { month: "short" })}</span>
                        <span className="st-display st-tnum block pb-1 text-[1.0333rem]" style={{ color: C.ink }}>{d?.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9rem] font-semibold" style={{ color: C.ink }}>{u.title}</span>
                        <span className="block text-[0.8rem]" style={{ color: C.muted }}>{u.sub || formatDateTime(u.date, lang)}</span>
                      </span>
                      <Icon name={u.icon} size={16} style={{ color: C.muted }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>



      <Panel data-tour="apps" className="mt-4" title="Application status" hi="आवेदन की स्थिति" icon="list" action={<TextLink to="/benefits">{tx("All applications", "सभी आवेदन")}</TextLink>} bodyClassName="!p-0">
        {profile.loading ? (
          <div className="space-y-3 p-5"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        ) : profile.unavailable || !p ? (
          <div className="p-5"><NotYet what={tx("Application status", "आवेदन की स्थिति")} /></div>
        ) : (
          <ul className="st-stagger m-0 divide-y p-0" style={{ listStyle: "none" }}>
            {(p.schemes || []).map((sc) => {
              const st = SCHEME_STATUS[sc.status] || SCHEME_STATUS.pending;
              const { steps, at } = schemeSteps(sc, tx, lang);
              return (
                <li key={sc.key} className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center" style={{ borderColor: "var(--line)" }}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={sc.action ? "accent" : sc.delayed ? "watch" : st.tone} dot>{sc.action ? tx("Waiting on you", "आपकी ओर से लंबित") : sc.delayed ? tx("Payment delayed", "भुगतान में देरी") : lang === "hi" ? st.hi : st.en}</Badge>
                      <span className="st-mono text-[0.8rem]" style={{ color: C.muted }}>{sc.application_id}</span>
                    </div>
                    <p className="m-0 mt-1 text-[0.9333rem] font-semibold" style={{ color: C.ink }}>{lang === "hi" && sc.hi ? sc.hi : sc.name}</p>
                    <p className="m-0 mt-0.5 text-[0.8333rem]" style={{ color: C.muted }}>{sc.next_step}</p>
                  </div>
                  <Track steps={steps} at={at} blocked={Boolean(sc.action) || sc.status === "rejected"} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel data-tour="payments" title="Payments received" hi="प्राप्त भुगतान" icon="rupee" action={<span className="text-[0.8333rem]" style={{ color: C.muted }}>{tx("Last 12 months", "पिछले 12 महीने")} · <strong className="st-tnum" style={{ color: C.ink }}>{rupees(received)}</strong></span>}>
          {profile.loading ? <Skeleton className="h-[190px]" /> : <BarChart data={payments} format={rupees} axisFormat={compactINR} title={tx("Amount received", "प्राप्त राशि")} emptyText={tx("No payments in the last 12 months", "पिछले 12 महीनों में कोई भुगतान नहीं")} />}
          <p className="m-0 mt-2 text-[0.8rem]" style={{ color: C.muted }}>{tx("Paid by Direct Benefit Transfer to your verified bank account.", "आपके सत्यापित बैंक खाते में डायरेक्ट बेनिफिट ट्रांसफ़र से।")}</p>
        </Panel>
        <Panel title="Documents & verification" hi="दस्तावेज़ व सत्यापन" icon="fileCheck" action={<TextLink to="/my-documents">{tx("View", "देखें")}</TextLink>}>
          {docs.length ? (
            <>
              <div className="flex items-baseline justify-between">
                <p className="st-display st-tnum m-0 text-[1.4667rem]" style={{ color: C.ink }}>{verified}<span className="text-[1rem] font-medium" style={{ color: C.muted }}> / {docs.length}</span></p>
                <span className="text-[0.8333rem]" style={{ color: C.muted }}>{tx("verified", "सत्यापित")}</span>
              </div>
              <div className="mt-2"><Progress value={(verified / docs.length) * 100} tone={verified === docs.length ? "good" : undefined} /></div>
              <ul className="m-0 mt-3 space-y-1.5 p-0 text-[0.8667rem]" style={{ listStyle: "none" }}>
                {docs.map((d) => {
                  const s = DOC_STATUS[d.status] || DOC_STATUS.pending;
                  return (
                    <li key={d.key} className="flex items-center gap-2">
                      <span className={`st-tone-${s.tone} grid h-5 w-5 shrink-0 place-items-center rounded-full`}><Icon name={s.icon} size={11} /></span>
                      <span className="min-w-0 flex-1 truncate" style={{ color: C.ink2 }}>{docName(d, lang)}</span>
                      {d.status !== "verified" && <span className="text-[0.8rem]" style={{ color: s.tone === "flag" ? C.bad : C.acc }}>{tx(s.en, s.hi)}</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <NotYet what={tx("Document status", "दस्तावेज़ की स्थिति")} />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel title="Recent activity" hi="हाल की गतिविधि" icon="clock" action={<TextLink to="/activity">{tx("Full history", "पूरा इतिहास")}</TextLink>}>
          {profile.loading ? <Skeleton className="h-40" /> : activity.length ? <ActivityList items={activity} compact /> : <p className="m-0 text-sm" style={{ color: C.muted }}>{tx("Nothing yet.", "अभी कुछ नहीं।")}</p>}
        </Panel>
        <div className="space-y-4">
          <Panel title="My grievances" hi="मेरी शिकायतें" icon="chat" action={<TextLink to="/grievances">{tx("All", "सभी")}</TextLink>}>
            {grievances.loading ? (
              <Skeleton className="h-20" />
            ) : openGr.length === 0 ? (
              <div>
                <p className="m-0 text-[0.9rem]" style={{ color: C.ink2 }}>{tx("You have no open grievances.", "आपकी कोई खुली शिकायत नहीं है।")}</p>
                <TextLink to="/grievance/new" className="mt-2">{tx("Raise a grievance", "शिकायत दर्ज करें")}</TextLink>
              </div>
            ) : (
              <ul className="m-0 space-y-4 p-0" style={{ listStyle: "none" }}>
                {openGr.slice(0, 2).map((g) => {
                  const st = GRIEVANCE_STATUS[g.status] || GRIEVANCE_STATUS.open;
                  return (
                    <li key={g.id}>
                      <p className="m-0 truncate text-[0.9rem] font-semibold" style={{ color: C.ink }}>{g.subject}</p>
                      <p className="st-mono m-0 mb-2 text-[0.8rem]" style={{ color: C.muted }}>{refNo(g.id)}</p>
                      <Track at={st.step} steps={grievanceSteps(tx)} compact />
                      <p className="m-0 mt-1 text-[0.8rem] font-medium" style={{ color: C.pri }}>{lang === "hi" ? st.hi : st.en}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

    </div>
  );
}

/* ------------------------------------------------------------ activity -- */
function Activity() {
  const { tx, lang } = useLang();
  const { profile, grievances, calls } = useBeneficiary();
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const all = buildActivity(profile.data, grievances.data, calls.data, tx, lang);
  const rows = all.filter((e) => (type === "all" || e.type === type) && (!q || `${e.title} ${e.sub || ""}`.toLowerCase().includes(q.toLowerCase())));
  const groups = [];
  rows.forEach((e) => {
    const d = parseDate(e.at);
    const key = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(e);
    else groups.push({ key, items: [e] });
  });
  const cnt = (t) => all.filter((e) => t === "all" || e.type === t).length;
  return (
    <div>
      <PageHead en="Activity" hi="गतिविधि" lede={tx("Everything that has happened on your record — applications, payments, documents, grievances and calls.", "आपके रिकॉर्ड पर हुई हर बात — आवेदन, भुगतान, दस्तावेज़, शिकायतें और कॉल।")} />
      {profile.error && <ErrorBox message={profile.error} onRetry={profile.reload} />}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={type} onChange={setType} label="Activity type" options={ACTIVITY_TYPES.map(([k, en, hi]) => [k, en, hi, cnt(k)])} />
        <SearchInput className="ml-auto w-full sm:w-60" value={q} onChange={setQ} placeholder={tx("Search activity…", "गतिविधि खोजें…")} />
        <ClearFilters show={type !== "all" || q} onClear={() => { setType("all"); setQ(""); }} />
      </div>
      {profile.loading ? (
        <Skeleton className="h-64" />
      ) : groups.length === 0 ? (
        <Empty icon="clock" title={tx("No activity matches", "कोई गतिविधि मेल नहीं खाती")} />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Panel key={g.key} title={g.key} icon="calendar" action={<span className="text-[0.8rem]" style={{ color: C.muted }}>{g.items.length}</span>}>
              <ActivityList items={g.items} />
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------- schemes & eligibility */
const AUDIENCE_LABEL = {
  student: ["students in Class 11 and above", "कक्षा 11 व ऊपर के छात्र"],
  school: ["students in Classes 9–10", "कक्षा 9–10 के छात्र"],
  sc: ["Scheduled Castes", "अनुसूचित जाति"],
  obc: ["OBC / EBC / DNT", "ओबीसी / ईबीसी / डीएनटी"],
  child: ["children in care", "देखभाल में बच्चे"],
  youth: ["youth aged 16 and above", "16 वर्ष व ऊपर के युवा"],
  senior: ["senior citizens (60+)", "वरिष्ठ नागरिक (60+)"],
  rehab: ["people in rehabilitation", "पुनर्वास में लोग"],
};

function Schemes() {
  const { tx, lang } = useLang();
  const toast = useToast();
  const catalog = useApi(API.schemes.catalog(), { fallback: [], optional: true });
  const profile = useApi(API.beneficiary.me(), { fallback: null, optional: true });
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const p = profile.data;
  const tags = new Set(p?.tags || []);
  const mine = Object.fromEntries((p?.schemes || []).map((s) => [s.key, s]));
  const rowsAll = (catalog.data || []).map((s) => {
    const app = mine[s.key];
    const eligible = (s.audience || []).every((t) => tags.has(t));
    const state = app && app.status !== "rejected" ? "enrolled" : eligible ? "eligible" : "other";
    return { ...s, app, eligible, state };
  });
  const rows = rowsAll.filter((s) => (filter === "all" || s.state === filter) && (!q || `${s.name} ${s.about}`.toLowerCase().includes(q.toLowerCase())));
  const cnt = (k) => rowsAll.filter((s) => k === "all" || s.state === k).length;

  async function request() {
    setBusy(true);
    try {
      await api.post(API.schemes.request(), { scheme_key: asking.key });
      toast.success(tx("Request sent. Your institute office will complete the application with you.", "अनुरोध भेजा गया। संस्था कार्यालय आपके साथ आवेदन पूरा करेगा।"));
      setAsking(null);
      profile.reload();
    } catch (err) {
      toast.error(isMissing(err) ? tx("Enrolment requests aren't connected yet — please ask your institute office.", "नामांकन अनुरोध अभी जुड़े नहीं — कृपया संस्था कार्यालय से पूछें।") : errorMessage(err, "Couldn't send"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead en="Schemes & eligibility" hi="योजनाएँ व पात्रता" lede={tx("Schemes for residents of welfare institutes, and which ones you may be eligible for based on your record.", "कल्याण संस्थाओं के निवासियों के लिए योजनाएँ, और आपके रिकॉर्ड के आधार पर आप किनके पात्र हो सकते हैं।")} />
      {catalog.error && <ErrorBox message={catalog.error} onRetry={catalog.reload} />}
      {catalog.unavailable ? (
        <NotYet what={tx("The scheme catalogue", "योजना सूची")} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented value={filter} onChange={setFilter} label="Filter schemes" options={[["all", "All schemes", "सभी योजनाएँ", cnt("all")], ["enrolled", "My schemes", "मेरी योजनाएँ", cnt("enrolled")], ["eligible", "May be eligible", "संभावित पात्र", cnt("eligible")], ["other", "Other", "अन्य", cnt("other")]]} />
            <SearchInput className="ml-auto w-full sm:w-60" value={q} onChange={setQ} placeholder={tx("Search schemes…", "योजनाएँ खोजें…")} />
            <ClearFilters show={filter !== "all" || q} onClear={() => { setFilter("all"); setQ(""); }} />
          </div>
          {catalog.loading || profile.loading ? (
            <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
          ) : rows.length === 0 ? (
            <Empty icon="landmark" title={tx("No schemes match", "कोई योजना मेल नहीं खाती")} />
          ) : (
            <div className="st-stagger grid gap-4 md:grid-cols-2">
              {rows.map((s) => {
                const st = s.app ? SCHEME_STATUS[s.app.status] || SCHEME_STATUS.pending : null;
                return (
                  <Card key={s.key} className="flex flex-col p-5" style={s.state === "eligible" ? { borderColor: "#BFE3CC" } : undefined}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="m-0 text-[0.9667rem] font-semibold leading-snug" style={{ color: C.ink }}>{lang === "hi" && s.hi ? s.hi : s.name}</p>
                      {s.state === "enrolled" ? <Badge tone={st.tone} dot>{tx(st.en, st.hi)}</Badge> : s.state === "eligible" ? <Badge tone="good">{tx("You may be eligible", "आप पात्र हो सकते हैं")}</Badge> : <Badge tone="neutral">{tx("Not for your category", "आपकी श्रेणी के लिए नहीं")}</Badge>}
                    </div>
                    <p className="m-0 mt-1.5 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>{s.about}</p>
                    <dl className="m-0 mt-3 text-[0.8333rem]">
                      <div className="st-kv !py-1.5"><dt>{tx("Benefit", "लाभ")}</dt><dd>{s.amount ? `${rupees(s.amount)} ${s.period === "per month" ? tx("per month", "प्रति माह") : tx("per year", "प्रति वर्ष")}` : tx("Service / training", "सेवा / प्रशिक्षण")}</dd></div>
                      <div className="st-kv !py-1.5"><dt>{tx("For", "किसके लिए")}</dt><dd className="!font-medium">{(s.audience || []).map((t) => tx(...(AUDIENCE_LABEL[t] || [t, t]))).join(" · ")}</dd></div>
                      <div className="st-kv !py-1.5"><dt>{tx("Documents", "दस्तावेज़")}</dt><dd className="!font-medium">{(s.documents || []).join(", ")}</dd></div>
                    </dl>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                      {s.state === "enrolled" ? (
                        <>
                          <span className="st-mono text-[0.8rem]" style={{ color: C.muted }}>{s.app.application_id}</span>
                          <TextLink to="/benefits">{tx("See status", "स्थिति देखें")}</TextLink>
                        </>
                      ) : s.state === "eligible" ? (
                        <>
                          <span className="text-[0.8rem]" style={{ color: C.muted }}>{s.app?.status === "rejected" ? tx("Previous application not approved", "पिछला आवेदन अस्वीकृत") : tx("Based on your record", "आपके रिकॉर्ड के आधार पर")}</span>
                          <Button size="sm" icon="send" onClick={() => setAsking(s)}>{tx("Request enrolment", "नामांकन का अनुरोध")}</Button>
                        </>
                      ) : (
                        <span className="text-[0.8rem]" style={{ color: C.muted }}>{tx("Think this is wrong? Ask your institute office.", "यह गलत लगता है? संस्था कार्यालय से पूछें।")}</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      <Modal
        open={Boolean(asking)}
        onClose={() => setAsking(null)}
        title={tx("Request enrolment", "नामांकन का अनुरोध")}
        footer={<><Button variant="secondary" onClick={() => setAsking(null)}>{tx("Cancel", "रद्द करें")}</Button><Button loading={busy} icon="send" onClick={request}>{tx("Send request", "अनुरोध भेजें")}</Button></>}
      >
        {asking && (
          <div className="space-y-3 text-[0.9rem]" style={{ color: C.ink2 }}>
            <p className="m-0 text-[0.9333rem] font-semibold" style={{ color: C.ink }}>{asking.name}</p>
            <p className="m-0">{tx("Your institute office will receive this request, fill in the application with you and submit your documents. You can follow it under Benefits & applications.", "संस्था कार्यालय को यह अनुरोध मिलेगा, वे आपके साथ आवेदन भरेंगे और दस्तावेज़ जमा करेंगे। आप इसे लाभ व आवेदन में देख सकते हैं।")}</p>
            <Callout tone="info" icon="fileCheck" title={tx("Documents needed", "आवश्यक दस्तावेज़")}>{(asking.documents || []).join(", ")}</Callout>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** A printable statement of every payment (opens the print dialog). */
function printStatement(p, inst) {
  const rows = (p.schemes || []).flatMap((s) => (s.disbursements || []).map((d) => ({ ...d, scheme: s.name, app: s.application_id }))).sort((a, b) => (a.at < b.at ? 1 : -1));
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Benefit statement — ${esc(p.name)}</title>
<style>body{font-family:'Noto Sans',system-ui,sans-serif;color:#15231F;margin:32px;font-size:13px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{text-align:left;padding:8px;border-bottom:1px solid #DDE2DE}th{background:#F4F7F3;font-size:12px}.t{text-align:right}.mono{font-family:ui-monospace,monospace}.muted{color:#5C6B66}.bar{height:4px;background:linear-gradient(90deg,#FF9933 33%,#fff 33% 66%,#138808 66%);margin:10px 0 18px}</style></head><body>
<p class="muted">Department of Social Justice &amp; Empowerment · Setu</p><h1>Benefit statement</h1><div class="bar"></div>
<p><strong>${esc(p.name)}</strong> · <span class="mono">${esc(p.beneficiary_id)}</span><br>${esc(inst?.name || p.institute_name)}${inst ? `, ${esc(inst.district)}, ${esc(inst.state)}` : ""}<br><span class="muted">Generated on ${new Date().toLocaleString("en-IN")}</span></p>
<table><thead><tr><th>Date</th><th>Scheme</th><th>Application no.</th><th>Transaction reference</th><th class="t">Amount</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${esc(formatDate(r.at))}</td><td>${esc(r.scheme)}</td><td class="mono">${esc(r.app)}</td><td class="mono">${esc(r.ref)}</td><td class="t">${esc(rupees(r.amount))}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No payments on record.</td></tr>`}
<tr><td colspan="4"><strong>Total</strong></td><td class="t"><strong>${esc(rupees(total))}</strong></td></tr></tbody></table>
<p class="muted" style="margin-top:24px">This statement lists Direct Benefit Transfers recorded on Setu. For any discrepancy, raise a grievance on Setu with the transaction reference.</p>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  // Printed from here rather than by a script inside the popup, so the
  // page's strict Content-Security-Policy (no inline scripts) still allows it.
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* popup closed before it could print */
    }
  }, 300);
  return true;
}

/* ------------------------------------------------- benefits & apps ------ */
function Benefits() {
  const { tx, lang } = useLang();
  const { profile, inst } = useBeneficiary();
  const p = profile.data;
  const schemes = p?.schemes || [];
  const received = schemes.flatMap((s) => s.disbursements || []).reduce((a, d) => a + (d.amount || 0), 0);
  const nextCredit = schemes.filter((s) => s.next_amount && s.next_date).sort((a, b) => parseDate(a.next_date) - parseDate(b.next_date))[0];
  const toast = useToast();
  return (
    <div>
      <PageHead en="Benefits & applications" hi="लाभ व आवेदन" lede={tx("Every scheme you have applied for, the stage it has reached, and what you have received.", "हर योजना जिसके लिए आपने आवेदन किया, वह किस चरण में है, और आपको क्या मिला।")}>
        {p && (
          <>
            <ButtonLink to="/schemes" variant="secondary" icon="landmark">{tx("Find more schemes", "और योजनाएँ खोजें")}</ButtonLink>
            <Button variant="secondary" icon="file" onClick={() => !printStatement(p, inst.data) && toast.error(tx("Allow pop-ups to open the statement.", "विवरण खोलने के लिए पॉप-अप की अनुमति दें।"))}>{tx("Benefit statement", "लाभ विवरण")}</Button>
          </>
        )}
      </PageHead>
      {profile.error && <ErrorBox message={profile.error} onRetry={profile.reload} />}
      {profile.loading ? (
        <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-56" /></div>
      ) : profile.unavailable || !p ? (
        <NotYet what={tx("Benefits & applications", "लाभ व आवेदन")} />
      ) : (
        <>
          <div className="st-stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile color="blue" icon="list" en="Applications" hi="आवेदन" value={schemes.length} tone="info" />
            <StatTile color="green" icon="check" en="Approved or active" hi="स्वीकृत या सक्रिय" value={schemes.filter((s) => s.status !== "pending" && s.status !== "rejected").length} tone="good" />
            <StatTile color="saffron" icon="rupee" en="Received · 12 months" hi="प्राप्त · 12 महीने" value={rupees(received)} tone="good" />
            <StatTile color="teal" icon="calendar" en="Next credit" hi="अगला भुगतान" value={nextCredit ? formatDate(nextCredit.next_date, lang) : "—"} tone="accent" sub={nextCredit ? `${rupees(nextCredit.next_amount)} · ${lang === "hi" && nextCredit.hi ? nextCredit.hi : nextCredit.name}` : undefined} />
          </div>
          <div className="space-y-4">
            {schemes.map((sc) => {
              const st = SCHEME_STATUS[sc.status] || SCHEME_STATUS.pending;
              const { steps, at } = schemeSteps(sc, tx, lang);
              return (
                <Card key={sc.key} className="overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
                    <div className="min-w-0">
                      <p className="m-0 text-[1rem] font-semibold" style={{ color: C.ink }}>{lang === "hi" && sc.hi ? sc.hi : sc.name}</p>
                      <p className="m-0 mt-0.5 text-[0.8333rem]" style={{ color: C.muted }}>{sc.office}</p>
                    </div>
                    <Badge tone={sc.action ? "accent" : sc.delayed ? "watch" : st.tone} dot>{sc.action ? tx("Waiting on you", "आपकी ओर से लंबित") : sc.delayed ? tx("Payment delayed", "भुगतान में देरी") : lang === "hi" ? st.hi : st.en}</Badge>
                  </div>
                  <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                    <dl className="m-0">
                      <div className="st-kv"><dt>{tx("Application no.", "आवेदन सं.")}</dt><dd className="st-mono">{sc.application_id}</dd></div>
                      <div className="st-kv"><dt>{tx("Benefit", "लाभ")}</dt><dd>{sc.amount ? `${rupees(sc.amount)} ${sc.period === "per month" ? tx("per month", "प्रति माह") : tx("per year", "प्रति वर्ष")}` : tx("Training / service", "प्रशिक्षण / सेवा")}</dd></div>
                      <div className="st-kv"><dt>{tx("Applied on", "आवेदन तिथि")}</dt><dd>{formatDate(sc.stages?.[0]?.at, lang)}</dd></div>
                      {sc.next_date && <div className="st-kv"><dt>{tx("Next date", "अगली तिथि")}</dt><dd>{formatDate(sc.next_date, lang)}</dd></div>}
                    </dl>
                    <div className="min-w-0">
                      <p className="st-label">{tx("Progress", "प्रगति")}</p>
                      <Track steps={steps} at={at} blocked={Boolean(sc.action) || sc.status === "rejected"} />
                      <div className="mt-4">
                        <Callout tone={sc.status === "rejected" ? "flag" : sc.action || sc.delayed ? "accent" : "info"} icon={sc.action || sc.status === "rejected" || sc.delayed ? "alert" : "info"} title={tx("Next step", "अगला कदम")} action={sc.action ? <ButtonLink to="/my-documents" size="sm" variant="secondary">{tx("See document", "दस्तावेज़ देखें")}</ButtonLink> : null}>
                          {sc.next_step}
                        </Callout>
                      </div>
                    </div>
                  </div>
                  {(sc.disbursements || []).length > 0 && (
                    <div className="border-t" style={{ borderColor: "var(--line)" }}>
                      <div className="overflow-x-auto">
                        <table className="st-table">
                          <thead>
                            <tr>
                              <th>{tx("Payment date", "भुगतान तिथि")}</th>
                              <th>{tx("Amount", "राशि")}</th>
                              <th>{tx("Transaction reference", "लेन-देन संदर्भ")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sc.disbursements.map((d) => (
                              <tr key={d.ref}>
                                <td>{formatDate(d.at, lang)}</td>
                                <td className="st-tnum font-semibold">{rupees(d.amount)}</td>
                                <td className="st-mono text-[0.8333rem]" style={{ color: C.muted }}>{d.ref}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <p className="m-0 mt-4 text-[0.8667rem]" style={{ color: C.muted }}>
            {tx("Something wrong with a benefit or payment?", "किसी लाभ या भुगतान में गड़बड़ी?")}{" "}
            <Link className="st-link" to="/grievance/new?category=benefits">{tx("Raise a grievance", "शिकायत दर्ज करें")}</Link>
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------- documents & verification --- */
function MyDocuments() {
  const { tx, lang } = useLang();
  const { profile } = useBeneficiary();
  const p = profile.data;
  const docs = p?.documents || [];
  const req = docs.filter((d) => d.required);
  const pending = req.filter((d) => d.status !== "verified");
  return (
    <div>
      <PageHead en="Documents & verification" hi="दस्तावेज़ व सत्यापन" lede={tx("Which of your documents are verified, and which are still needed.", "आपके कौन-से दस्तावेज़ सत्यापित हैं, और कौन-से अभी चाहिए।")} />
      {profile.error && <ErrorBox message={profile.error} onRetry={profile.reload} />}
      {profile.loading ? (
        <Skeleton className="h-64" />
      ) : profile.unavailable || !p ? (
        <NotYet what={tx("Document status", "दस्तावेज़ की स्थिति")} />
      ) : (
        <>
          <div className="mb-5">
            {pending.length ? (
              <Callout tone="accent" icon="alert" title={tx(`${pending.length} required document${pending.length > 1 ? "s" : ""} pending`, `${pending.length} ज़रूरी दस्तावेज़ लंबित`)}>
                {tx("Give a copy to your institute office. They upload it on your behalf, and the status here changes once it is verified.", "एक प्रति संस्था कार्यालय को दें। वे आपकी ओर से अपलोड करेंगे, और सत्यापन के बाद यहाँ स्थिति बदल जाएगी।")}
              </Callout>
            ) : (
              <Callout tone="good" icon="check" title={tx("All required documents are verified", "सभी ज़रूरी दस्तावेज़ सत्यापित हैं")} />
            )}
          </div>
          <Panel title="My documents" hi="मेरे दस्तावेज़" icon="fileCheck" bodyClassName="!p-0" action={<span className="st-tnum text-[0.8333rem] font-semibold" style={{ color: C.pri }}>{req.length - pending.length}/{req.length} {tx("verified", "सत्यापित")}</span>}>
            <div className="overflow-x-auto">
              <table className="st-table">
                <thead>
                  <tr>
                    <th>{tx("Document", "दस्तावेज़")}</th>
                    <th>{tx("Status", "स्थिति")}</th>
                    <th>{tx("Verified", "सत्यापन")}</th>
                    <th>{tx("Remarks", "टिप्पणी")}</th>
                  </tr>
                </thead>
                <tbody className="st-stagger">
                  {docs.map((d) => {
                    const s = DOC_STATUS[d.status] || DOC_STATUS.pending;
                    return (
                      <tr key={d.key}>
                        <td>
                          <p className={`m-0 font-semibold ${lang === "hi" && d.hi ? "st-hi" : ""}`} style={{ color: C.ink }}>{docName(d, lang)}</p>
                          <p className="m-0 text-[0.8rem]" style={{ color: C.muted }}>{d.required ? tx("Required", "आवश्यक") : tx("Optional", "वैकल्पिक")}</p>
                        </td>
                        <td><Badge tone={s.tone} dot>{tx(s.en, s.hi)}</Badge></td>
                        <td className="whitespace-nowrap text-[0.8333rem]" style={{ color: C.muted }}>{d.verified_on ? `${formatDate(d.verified_on, lang)}${d.by ? ` · ${d.by}` : ""}` : "—"}</td>
                        <td className="text-[0.8333rem]" style={{ color: C.ink2 }}>{d.remark || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- profile -- */
function Profile() {
  const { user } = useAuth();
  const { tx, lang, prefs, uiMeta } = useLang();
  const { profile, inst } = useBeneficiary();
  const p = profile.data;
  const i = inst.data;
  const Row = ({ k, v, mono }) => (
    <div className="st-kv">
      <dt>{k}</dt>
      <dd className={mono ? "st-mono" : ""}>{v || "—"}</dd>
    </div>
  );
  return (
    <div>
      <PageHead en="My profile" hi="मेरी प्रोफ़ाइल" lede={tx("Your details as recorded by the Ministry. If something is wrong, raise a grievance.", "मंत्रालय के रिकॉर्ड में आपका विवरण। कुछ गलत हो तो शिकायत दर्ज करें।")} />
      {profile.error && <ErrorBox message={profile.error} onRetry={profile.reload} />}
      {profile.loading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Personal details" hi="व्यक्तिगत विवरण" icon="user">
            <dl className="m-0">
              <Row k={tx("Name", "नाम")} v={p?.name || user?.name} />
              <Row k={tx("Beneficiary ID", "लाभार्थी आईडी")} v={p?.beneficiary_id} mono />
              <Row k={tx("Date of birth", "जन्म तिथि")} v={p?.date_of_birth ? formatDate(p.date_of_birth, lang) : null} />
              <Row k={tx("Category", "श्रेणी")} v={p?.category} />
              <Row k={tx("Living here since", "यहाँ कब से")} v={p?.admitted_on ? formatDate(p.admitted_on, lang) : null} />
              <Row k={tx("Room", "कमरा")} v={p?.room} />
              {/* Only the last four digits are ever shown (§3). */}
              {p?.phone && <Row k={tx("Mobile", "मोबाइल")} v={maskPhone(p.phone)} mono />}
              {(p?.aadhaar || p?.aadhaar_number) && <Row k={tx("Aadhaar", "आधार")} v={maskAadhaar(p.aadhaar || p.aadhaar_number)} mono />}
              {(p?.bank_account || p?.account_number) && <Row k={tx("Bank account (DBT)", "बैंक खाता (DBT)")} v={maskAccount(p.bank_account || p.account_number)} mono />}
            </dl>
          </Panel>
          <Panel title="Institute" hi="संस्था" icon="building">
            <dl className="m-0">
              <Row k={tx("Institute", "संस्था")} v={i?.name || p?.institute_name} />
              <Row k={tx("Place", "स्थान")} v={i ? `${i.district}, ${i.state}` : prefs.state} />
              <Row k={tx("Registration no.", "पंजीकरण सं.")} v={i?.registration_no} mono />
              <Row k={tx("Guardian / authority", "अभिभावक / प्राधिकरण")} v={p?.guardian} />
              <Row k={tx("Case worker", "केस वर्कर")} v={p?.case_worker} />
            </dl>
          </Panel>
          <Panel title="Health & education" hi="स्वास्थ्य व शिक्षा" icon="health">
            {p?.health || p?.education ? (
              <>
                <dl className="m-0">
                  <Row k={tx("Last health check-up", "पिछली स्वास्थ्य जाँच")} v={formatDate(p?.health?.last_checkup, lang)} />
                  <Row k={tx("Next health check-up", "अगली स्वास्थ्य जाँच")} v={formatDate(p?.health?.next_checkup, lang)} />
                  <Row k={tx("School", "विद्यालय")} v={p?.education?.school} />
                  <Row k={tx("Class", "कक्षा")} v={p?.education?.klass} />
                </dl>
                {p?.health?.notes && <p className="m-0 mt-3 text-[0.8333rem]" style={{ color: C.ink2 }}><Icon name="info" size={13} style={{ color: C.muted, display: "inline", verticalAlign: "-2px" }} /> {p.health.notes}</p>}
                {p?.education?.attendance != null && (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[0.8333rem]" style={{ color: C.muted }}>
                      <span>{tx("School attendance", "विद्यालय उपस्थिति")}</span>
                      <span className="st-tnum font-semibold" style={{ color: C.ink }}>{p.education.attendance}%</span>
                    </div>
                    <Progress value={p.education.attendance} tone={p.education.attendance >= 75 ? "good" : "watch"} />
                  </div>
                )}
              </>
            ) : (
              <NotYet what={tx("Health & education record", "स्वास्थ्य व शिक्षा रिकॉर्ड")} />
            )}
          </Panel>
          <Panel title="Account & preferences" hi="खाता व पसंद" icon="globe" action={<Button size="sm" variant="secondary" onClick={openPreferences}>{tx("Change", "बदलें")}</Button>}>
            <dl className="m-0">
              <Row k={tx("Email", "ईमेल")} v={user?.email} />
              <Row k={tx("Account type", "खाते का प्रकार")} v={tx("Beneficiary", "लाभार्थी")} />
              <Row k={tx("Language", "भाषा")} v={`${uiMeta.native}${uiMeta.code !== "en" ? ` · ${uiMeta.name}` : ""}`} />
              <Row k={tx("State", "राज्य")} v={prefs.state} />
            </dl>
            <ButtonLink to="/security" variant="secondary" size="sm" icon="shield" className="mt-3">{tx("Security: password & sign-in", "सुरक्षा: पासवर्ड व साइन इन")}</ButtonLink>
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------- raise grievance --- */
function RaiseGrievance() {
  const { user } = useAuth();
  const { tx, lang } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ category: params.get("category") || "", subject: "", description: "", danger: null, confidential: true });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const cat = form.category ? catOf(form.category) : null;

  function voice() {
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = lang === "hi" ? "hi-IN" : "en-IN";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setForm((f) => ({ ...f, description: f.description ? `${f.description} ${text}` : text }));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function submit() {
    setBusy(true);
    try {
      const { data } = await api.post(API.grievances.create(), {
        institute_id: user.institute_id,
        subject: form.subject.trim(),
        description: form.description.trim(),
        details: form.description.trim(),
        category: form.category,
        urgency: form.danger ? "high" : "normal",
        confidential: form.confidential,
      });
      setDone(data);
      toast.success(tx("Grievance submitted", "शिकायत जमा हो गई"));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't submit"));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="mx-auto max-w-xl">
        <Card className="st-page p-8 text-center">
          <span className="st-tone-good mx-auto grid h-14 w-14 place-items-center rounded-full"><Icon name="check" size={28} /></span>
          <h1 className="st-display m-0 mt-4 text-[1.2667rem]" style={{ color: C.ink }}>{tx("Your grievance has been submitted", "आपकी शिकायत जमा हो गई है")}</h1>
          <p className="m-0 mt-2 text-[0.9rem]" style={{ color: C.muted }}>{tx("Reference number — keep it for your records:", "संदर्भ संख्या — इसे संभाल कर रखें:")}</p>
          <p className="st-mono m-0 mt-1 text-[1.2667rem] font-medium tracking-wider" style={{ color: C.pri }} data-testid="ref-no">{refNo(done.id)}</p>
          <div className="mx-auto mt-4 max-w-sm text-left">
            <Track at={1} steps={grievanceSteps(tx)} />
          </div>
          {done.confidential && <p className="m-0 mt-4 flex items-center justify-center gap-1.5 text-[0.8333rem]" style={{ color: C.muted }}><Icon name="lock" size={13} /> {tx("Private — institute staff cannot see it.", "गोपनीय — संस्था के कर्मचारी इसे नहीं देख सकते।")}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate("/grievances")} iconRight="arrowRight">{tx("Track it", "ट्रैक करें")}</Button>
            <Button variant="secondary" onClick={() => { setDone(null); setStep(0); setForm({ category: "", subject: "", description: "", danger: null, confidential: true }); }}>{tx("Raise another", "एक और दर्ज करें")}</Button>
          </div>
        </Card>
      </div>
    );

  const canNext = step === 0 ? Boolean(form.category) : step === 1 ? form.subject.trim() && form.description.trim() && form.danger !== null : true;
  const steps = [{ label: tx("Category", "श्रेणी") }, { label: tx("Details", "विवरण") }, { label: tx("Privacy & submit", "गोपनीयता व जमा") }];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHead en="Raise a grievance" hi="शिकायत दर्ज करें" crumbs={[{ to: "/grievances", label: tx("My grievances", "मेरी शिकायतें") }]} lede={tx("Three short steps. It is private by default — institute staff won't see it.", "तीन छोटे कदम। यह पहले से गोपनीय है — संस्था के कर्मचारी इसे नहीं देखेंगे।")} />
      <Card className="mb-5 px-5 py-4">
        <Track at={step} steps={steps} />
      </Card>

      <Card key={step} className="st-page p-5 sm:p-6">
        {step === 0 && (
          <>
            <h2 className="st-display m-0 mb-4 text-[1.0667rem]" style={{ color: C.ink }}>{tx("What is it about?", "यह किस बारे में है?")}</h2>
            <CategoryGrid value={form.category} onPick={(k) => setForm({ ...form, category: k })} />
          </>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone="info"><Icon name={cat?.icon} size={12} /> {tx(cat?.en, cat?.hi)}</Badge>
              <button type="button" className="st-link !text-[0.8333rem] border-0 bg-transparent p-0" style={{ fontFamily: "inherit", cursor: "pointer" }} onClick={() => setStep(0)}>{tx("Change", "बदलें")}</button>
            </div>
            <div>
              <label className="st-label" htmlFor="c-subject">{tx("In one line, what happened?", "एक पंक्ति में, क्या हुआ?")}</label>
              <input id="c-subject" className="st-field" maxLength={200} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder={tx("e.g. Scholarship instalment not received", "जैसे छात्रवृत्ति की किस्त नहीं मिली")} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="st-label !mb-0" htmlFor="c-desc">{tx("Details", "विवरण")}</label>
                {SR && (
                  <Button type="button" size="sm" variant={listening ? "danger" : "secondary"} icon="mic" onClick={voice} aria-pressed={listening}>
                    {listening ? tx("Listening… stop", "सुन रहे हैं… रोकें") : tx("Speak instead", "बोलकर बताएँ")}
                  </Button>
                )}
              </div>
              <textarea id="c-desc" rows={5} className="st-field" maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={tx("When did it start? Who is affected? Anything else the Ministry should know.", "कब शुरू हुआ? किस पर असर है? और कुछ जो मंत्रालय को जानना चाहिए।")} />
              <p className="st-hint text-right">{form.description.length}/4000</p>
            </div>
            <div>
              <span className="st-label">{tx("Is anyone in danger right now?", "क्या अभी कोई खतरे में है?")}</span>
              <Segmented value={form.danger === null ? "" : form.danger ? "yes" : "no"} onChange={(v) => setForm({ ...form, danger: v === "yes" })} label="Danger" options={[["yes", "Yes", "हाँ"], ["no", "No", "नहीं"]]} />
              {form.danger && (
                <div className="st-page mt-3">
                  <Callout tone="flag" icon="alert" title={tx("Please call now — help is free and immediate.", "कृपया अभी कॉल करें — सहायता मुफ़्त और तुरंत है।")}>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {HELPLINES.slice(0, 3).map((h) => (
                        <a key={h.number} href={`tel:${h.number}`} className="st-btn st-btn-danger st-btn-sm no-underline"><Icon name="phone" /> {h.number}</a>
                      ))}
                    </div>
                    <p className="m-0 mt-2 text-[0.8rem]">{tx("Your grievance will also be marked urgent.", "आपकी शिकायत अत्यावश्यक भी चिह्नित होगी।")}</p>
                  </Callout>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button
              type="button"
              role="switch"
              aria-checked={form.confidential}
              onClick={() => setForm({ ...form, confidential: !form.confidential })}
              className="st-choice !items-start !p-4"
              aria-label="Keep it private"
            >
              <Icon name={form.confidential ? "lock" : "unlock"} size={20} style={{ color: form.confidential ? C.pri : C.muted, flex: "none", marginTop: 2 }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9333rem] font-semibold">{tx("Keep it private", "गोपनीय रखें")}</span>
                <span className="block text-[0.8333rem]" style={{ color: C.muted }}>
                  {form.confidential ? tx("Only Ministry officials will see this. Institute staff won't.", "केवल मंत्रालय के अधिकारी देखेंगे। संस्था के कर्मचारी नहीं।") : tx("Institute staff will also see this grievance.", "संस्था के कर्मचारी भी यह शिकायत देखेंगे।")}
                </span>
              </span>
              <span className="relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: form.confidential ? C.pri : "#C6CEC9" }}>
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: form.confidential ? 22 : 2 }} />
              </span>
            </button>
            <div className="rounded-md border p-4" style={{ borderColor: "var(--line)", background: "var(--subtle)" }}>
              <p className="st-label">{tx("Review", "समीक्षा")}</p>
              <p className="m-0 text-[0.8333rem]" style={{ color: C.muted }}>{tx(cat?.en, cat?.hi)}{form.danger && <> · <strong style={{ color: C.bad }}>{tx("Urgent", "अत्यावश्यक")}</strong></>}</p>
              <p className="m-0 mt-1 text-[0.9333rem] font-semibold" style={{ color: C.ink }}>{form.subject}</p>
              <p className="m-0 mt-1 whitespace-pre-wrap text-[0.9rem]" style={{ color: C.ink2 }}>{form.description}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          {step > 0 ? <Button variant="secondary" icon="chevronLeft" onClick={() => setStep(step - 1)}>{tx("Back", "पीछे")}</Button> : <span />}
          {step < 2 ? (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)} iconRight="arrowRight">{tx("Continue", "आगे बढ़ें")}</Button>
          ) : (
            <Button size="lg" loading={busy} onClick={submit} icon="send">{tx("Submit grievance", "शिकायत जमा करें")}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------- my grievances -- */
function MyGrievances() {
  const { tx } = useLang();
  const list = useApi(API.grievances.list(), { fallback: [], optional: true });
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const all = list.data || [];
  const rows = all.filter((g) => (status === "all" || g.status === status) && (!q || `${g.subject} ${g.description} ${refNo(g.id)}`.toLowerCase().includes(q.toLowerCase())));
  const cnt = (s) => all.filter((g) => s === "all" || g.status === s).length;
  return (
    <div>
      <PageHead en="My grievances" hi="मेरी शिकायतें" lede={tx("Every grievance you have raised and the stage it has reached.", "आपकी हर शिकायत और वह किस चरण में है।")}>
        <ButtonLink to="/grievance/new" icon="plus">{tx("Raise a grievance", "शिकायत दर्ज करें")}</ButtonLink>
      </PageHead>
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.unavailable ? (
        <NotYet what={tx("Grievance tracking", "शिकायत ट्रैकिंग")} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented value={status} onChange={setStatus} label="Status" options={[["all", "All", "सभी", cnt("all")], ["open", "Submitted", "दर्ज", cnt("open")], ["in_review", "Being looked into", "जाँच जारी", cnt("in_review")], ["resolved", "Resolved", "हल", cnt("resolved")]]} />
            <SearchInput className="ml-auto w-full sm:w-64" value={q} onChange={setQ} placeholder={tx("Search or enter reference…", "खोजें या संदर्भ संख्या…")} />
            <ClearFilters show={status !== "all" || q} onClear={() => { setStatus("all"); setQ(""); }} />
          </div>
          {list.loading ? (
            <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
          ) : rows.length === 0 ? (
            <Empty
              icon="chat"
              title={all.length ? tx("No grievances match", "कोई शिकायत मेल नहीं खाती") : tx("You haven't raised any grievances", "आपने कोई शिकायत दर्ज नहीं की")}
              action={!all.length && <ButtonLink to="/grievance/new">{tx("Raise a grievance", "शिकायत दर्ज करें")}</ButtonLink>}
            />
          ) : (
            <ul className="st-stagger m-0 space-y-3 p-0" style={{ listStyle: "none" }}>
              {rows.map((g) => (
                <li key={g.id}><GrievanceCard g={g} showPrivacy /></li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------- verification calls - */
const CALL_STATUS = {
  scheduled: { en: "Scheduled", hi: "निर्धारित", tone: "info" },
  completed: { en: "Completed", hi: "पूरी हुई", tone: "good" },
  missed: { en: "Missed", hi: "छूटी", tone: "flag" },
  requested: { en: "Requested", hi: "अनुरोध किया", tone: "watch" },
};

function Calls() {
  const { tx, lang } = useLang();
  const toast = useToast();
  const calls = useApi(API.calls.mine(), { fallback: [], optional: true });
  const [slot, setSlot] = useState("evening");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const nc = nextCall(calls.data);
  const cd = useCountdown(nc?.scheduled_at);
  const history = (calls.data || []).filter((c) => c !== nc && (filter === "all" || c.status === filter));

  async function request() {
    setBusy(true);
    try {
      await api.post(API.calls.request(), { preferred_time: slot, note: note.trim() });
      toast.success(tx("Request sent. An official will call you.", "अनुरोध भेजा गया। एक अधिकारी आपको कॉल करेंगे।"));
      setNote("");
      calls.reload();
    } catch (err) {
      toast.error(isMissing(err) ? tx("Call requests aren't available yet — please call 1098 / 181 or raise a grievance.", "कॉल अनुरोध अभी उपलब्ध नहीं — कृपया 1098 / 181 पर कॉल करें या शिकायत दर्ज करें।") : errorMessage(err, "Couldn't send"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead en="Verification calls" hi="सत्यापन कॉल" lede={tx("Officials call residents directly to check that you are safe and well. Institute staff are never on these calls.", "अधिकारी सीधे निवासियों को कॉल करके आपकी सुरक्षा और हालचाल जानते हैं। संस्था के कर्मचारी इन कॉल पर कभी नहीं होते।")} />
      {calls.error && <ErrorBox message={calls.error} onRetry={calls.reload} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Next call" hi="अगली कॉल" icon="phone">
            {calls.unavailable ? (
              <NotYet what={tx("Call schedule", "कॉल समय-सारणी")} />
            ) : calls.loading ? (
              <Skeleton className="h-24" />
            ) : nc && cd ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="st-display m-0 text-[1.2667rem]" style={{ color: C.ink }}>{formatDateTime(nc.scheduled_at, lang)}</p>
                  <p className="m-0 mt-0.5 text-[0.8667rem]" style={{ color: C.muted }}>{nc.official_name}</p>
                  {nc.note && <p className="m-0 mt-2 text-[0.8667rem]" style={{ color: C.ink2 }}>{nc.note}</p>}
                </div>
                <div className="flex gap-2" aria-label="Time remaining">
                  {[[cd.days, tx("days", "दिन")], [cd.hours, tx("hours", "घंटे")], [cd.mins, tx("min", "मिनट")]].map(([v, l]) => (
                    <div key={l} className="min-w-[64px] rounded-md border px-3 py-2 text-center" style={{ borderColor: "var(--line)" }}>
                      <div className="st-display st-tnum text-[1.2667rem] leading-none" style={{ color: C.pri }}>{v}</div>
                      <div className="mt-1 text-[0.7667rem]" style={{ color: C.muted }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="m-0 text-[0.9rem]" style={{ color: C.muted }}>{tx("No call is scheduled right now. You can request one.", "अभी कोई कॉल निर्धारित नहीं है। आप अनुरोध कर सकते हैं।")}</p>
            )}
          </Panel>

          {!calls.unavailable && (
            <Panel
              title="Call history"
              hi="कॉल इतिहास"
              icon="clock"
              bodyClassName="!p-0"
              action={
                <div className="flex min-w-0 max-w-full items-center gap-1">
                  <Segmented value={filter} onChange={setFilter} label="Filter calls" options={[["all", "All", "सभी"], ["completed", "Completed", "पूरी"], ["missed", "Missed", "छूटी"], ["requested", "Requested", "अनुरोध"]]} />
                  <ClearFilters show={filter !== "all"} onClear={() => setFilter("all")} />
                </div>
              }
            >
              {history.length === 0 ? (
                <p className="m-0 p-5 text-sm" style={{ color: C.muted }}>{tx("Nothing here yet.", "अभी यहाँ कुछ नहीं।")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>{tx("When", "कब")}</th>
                        <th>{tx("Status", "स्थिति")}</th>
                        <th>{tx("Outcome", "परिणाम")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((c) => {
                        const s = CALL_STATUS[c.status] || CALL_STATUS.scheduled;
                        return (
                          <tr key={c.id}>
                            <td className="whitespace-nowrap">{c.scheduled_at ? formatDateTime(c.scheduled_at, lang) : c.preferred_time ? tx(`Preferred: ${c.preferred_time}`, `पसंदीदा: ${c.preferred_time}`) : "—"}</td>
                            <td><Badge tone={s.tone} dot>{tx(s.en, s.hi)}</Badge></td>
                            <td className="text-[0.8667rem]" style={{ color: C.ink2 }}>{c.outcome || c.note || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>

        <Panel title="Request a call" hi="कॉल का अनुरोध" icon="send" className="h-fit">
          <p className="m-0 text-[0.9rem]" style={{ color: C.muted }}>{tx("Want to speak to an official privately? Choose a time.", "किसी अधिकारी से निजी रूप से बात करनी है? समय चुनें।")}</p>
          <span className="st-label mt-4">{tx("Best time", "सही समय")}</span>
          <Segmented value={slot} onChange={setSlot} label="Best time" options={[["morning", "Morning", "सुबह"], ["afternoon", "Afternoon", "दोपहर"], ["evening", "Evening", "शाम"]]} />
          <label className="st-label mt-4" htmlFor="call-note">{tx("Anything we should know (optional)", "कुछ बताना चाहें (वैकल्पिक)")}</label>
          <textarea id="call-note" rows={3} className="st-field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <Button className="mt-4 w-full" loading={busy} onClick={request} icon="phone">{tx("Request a call", "कॉल का अनुरोध करें")}</Button>
        </Panel>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- rights -- */
const RIGHTS = [
  ["food", "Nutritious food", "पौष्टिक भोजन", "Three meals and a snack every day, as per the approved menu, with clean drinking water.", "स्वीकृत मेन्यू के अनुसार हर दिन तीन भोजन और नाश्ता, साफ़ पीने का पानी।"],
  ["shield", "Safety & dignity", "सुरक्षा व सम्मान", "No physical punishment, abuse or humiliation — ever. CCTV in common areas, never in private spaces.", "कभी कोई शारीरिक दंड, दुर्व्यवहार या अपमान नहीं। सामान्य जगहों में CCTV, निजी जगहों में कभी नहीं।"],
  ["health", "Health care", "स्वास्थ्य सेवा", "Regular health check-ups, medicines when needed, and a doctor on call.", "नियमित स्वास्थ्य जाँच, ज़रूरत पर दवा, और डॉक्टर उपलब्ध।"],
  ["book", "Education", "शिक्षा", "Schooling or skills training, and the scholarships you are entitled to — on time.", "स्कूली शिक्षा या कौशल प्रशिक्षण, और आपकी छात्रवृत्ति — समय पर।"],
  ["rupee", "Your benefits, directly", "आपके लाभ, सीधे", "Scholarships and stipends are paid by Direct Benefit Transfer into your own bank account.", "छात्रवृत्ति और वजीफ़ा डायरेक्ट बेनिफिट ट्रांसफ़र से सीधे आपके बैंक खाते में।"],
  ["chat", "To be heard", "सुने जाने का अधिकार", "To raise a grievance without fear, privately, and to know what happened to it.", "बिना डर के, गोपनीय रूप से शिकायत करना और जानना कि उसका क्या हुआ।"],
  ["user", "Family contact", "परिवार से संपर्क", "To stay in touch with family and guardians, as allowed by your care plan.", "अपनी देखभाल योजना के अनुसार परिवार और अभिभावकों से संपर्क।"],
];

function Rights() {
  const { tx } = useLang();
  return (
    <div>
      <PageHead en="Rights & entitlements" hi="अधिकार व पात्रताएँ" lede={tx("Every resident of a welfare institute is entitled to these. If any is missing, raise a grievance.", "कल्याण संस्था के हर निवासी को ये अधिकार हैं। अगर कोई कमी है, तो शिकायत दर्ज करें।")} />
      <div className="st-stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RIGHTS.map(([icon, en, hi, ben, bhi]) => (
          <Card key={en} hover className="p-5">
            <span className="grid h-10 w-10 place-items-center rounded-md" style={{ background: "var(--pri-50)", color: C.pri }}><Icon name={icon} size={20} /></span>
            <h3 className="m-0 mt-3 text-[1rem] font-semibold" style={{ color: C.ink }}>
              <Tx en={en} hi={hi} subClassName="text-[0.8333rem] font-medium" />
            </h3>
            <p className="m-0 mt-1.5 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>{tx(ben, bhi)}</p>
          </Card>
        ))}
      </div>
      <div className="mt-6">
        <Callout tone="info" icon="scale" title={tx("Is one of these missing?", "क्या इनमें से कुछ नहीं मिल रहा?")} action={<ButtonLink to="/grievance/new" size="sm">{tx("Raise a grievance", "शिकायत दर्ज करें")}</ButtonLink>}>
          {tx("Raise a grievance — privately. It goes straight to the Ministry.", "गोपनीय रूप से शिकायत दर्ज करें। यह सीधे मंत्रालय को जाती है।")}
        </Callout>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §15  YUKT — the assistant (युक्त)
   ══════════════════════════════════════════════════════════════════════════ */
/**
 * Yukt is the same assistant as in Sentinel, fitted to Setu. It:
 *   · answers from the signed-in person's OWN record — applications, payments,
 *     documents, grievances, calls, schemes; for institute staff: compliance,
 *     findings, residents, renewal, documents;
 *   · knows every Setu feature and where it lives (and points to Sentinel and
 *     Nayan), explains the page you are on, takes you there;
 *   · DOES things — raise a grievance, request a verification call, ask to be
 *     enrolled in a scheme, open the benefit statement, change the language,
 *     sign out — but only after the person presses Confirm. The call goes to
 *     the same endpoint the button on the page uses;
 *   · works before sign-in too, as help for the sign-in page.
 *
 * How it answers, in order:
 *   1. an action ("shikayat darj karo: khana thanda milta hai") → a proposal
 *   2. the AI backend — POST /assistant/chat with app: "setu" — when
 *      /assistant/status says one is configured. The key stays on the server.
 *   3. the local engines — personal data, then the knowledge base. They always
 *      work, offline too, and never invent a figure.
 * Languages: Hindi, English and Hinglish natively; the other 20 scheduled
 * languages through Bhashini (/assistant/translate, /tts, /asr) when the
 * server has it. To the person it is only ever "Yukt".
 */

const YUKT_CSS = `
.yk-orb { position: relative; display: inline-grid; place-items: center; flex: none; border-radius: 9999px; }
.yk-orb-ring { position: absolute; inset: 0; border-radius: 9999px; background: conic-gradient(from 0deg, #FF9933, #ffffff, #138808, #000080, #FF9933); animation: yk-spin 6s linear infinite; }
.yk-orb-core { position: absolute; inset: 2.5px; border-radius: 9999px; display: grid; place-items: center; background: radial-gradient(circle at 35% 30%, #ffffff, var(--pri-50) 78%); box-shadow: inset 0 -3px 8px rgba(0,0,0,.08); }
@keyframes yk-spin { to { transform: rotate(360deg); } }
.yk-fab {
  position: fixed; right: 22px; bottom: 22px; z-index: 180; display: flex; align-items: center; gap: 0; padding: 5px;
  border: 0; border-radius: 9999px; cursor: pointer; font-family: inherit; color: #fff;
  background: linear-gradient(135deg, var(--pri-8), var(--pri));
  box-shadow: 0 14px 34px -10px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.18) inset;
  animation: yk-bob 3.2s ease-in-out infinite; transition: gap .3s ease, padding .3s ease, box-shadow .3s ease;
}
.yk-fab-label { max-width: 0; overflow: hidden; white-space: nowrap; text-align: left; opacity: 0; transition: max-width .35s ease, opacity .25s ease; }
.yk-fab:hover, .yk-fab:focus-visible { gap: 10px; padding-right: 18px; animation-play-state: paused; box-shadow: 0 18px 40px -10px rgba(0,0,0,.5), 0 0 0 4px rgba(255,153,51,.3); outline: none; }
.yk-fab:hover .yk-fab-label, .yk-fab:focus-visible .yk-fab-label { max-width: 160px; opacity: 1; }
.yk-fab:hover .yk-orb-ring { animation-duration: 1.6s; }
.yk-fab.is-open { animation: none; }
.yk-pulse { position: absolute; left: 5px; top: 5px; width: 48px; height: 48px; border-radius: 9999px; pointer-events: none; }
.yk-pulse::before, .yk-pulse::after { content: ""; position: absolute; inset: 0; border-radius: 9999px; border: 2px solid rgba(255,153,51,.7); animation: yk-ring 2.6s ease-out infinite; }
.yk-pulse::after { animation-delay: 1.3s; border-color: rgba(19,136,8,.6); }
.yk-fab.is-open .yk-pulse { display: none; }
@keyframes yk-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@keyframes yk-ring { from { transform: scale(1); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }
.yk-teaser {
  position: fixed; right: 88px; bottom: 32px; z-index: 180; max-width: 270px; padding: 10px 14px;
  border-radius: 14px 14px 4px 14px; font: inherit; font-size: 13px; line-height: 1.45; color: var(--ink); text-align: left; cursor: pointer;
  background: #fff; border: 1px solid rgba(255,153,51,.45); box-shadow: 0 16px 34px -14px rgba(0,0,0,.35);
  animation: yk-pop .35s cubic-bezier(.2,1.4,.4,1);
}
@keyframes yk-pop { from { opacity: 0; transform: translateY(8px) scale(.92); } to { opacity: 1; transform: none; } }
.yk-panel {
  position: fixed; right: 22px; bottom: 90px; z-index: 180; width: min(400px, calc(100vw - 24px)); height: min(620px, calc(100vh - 170px));
  display: flex; flex-direction: column; overflow: hidden; border-radius: 18px; background: #F6F8F7;
  border: 1px solid var(--line); box-shadow: 0 30px 70px -24px rgba(0,0,0,.45);
  animation: yk-in .28s cubic-bezier(.2,1.2,.4,1); transform-origin: bottom right;
}
@keyframes yk-in { from { opacity: 0; transform: translateY(14px) scale(.96); } to { opacity: 1; transform: none; } }
.yk-head { display: flex; align-items: center; gap: 10px; padding: 12px 10px 12px 14px; background: linear-gradient(135deg, var(--pri-8), var(--pri-7) 60%, var(--pri)); }
.yk-iconbtn { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 9px; background: transparent; cursor: pointer; color: rgba(255,255,255,.82); flex: none; }
.yk-iconbtn:hover { color: #fff; background: rgba(255,255,255,.14); }
.yk-iconbtn.is-dark { color: var(--muted); }
.yk-iconbtn.is-dark:hover { color: var(--pri-7); background: var(--pri-50); }
.yk-iconbtn.is-live { color: #D92D20; animation: yk-blink 1s ease-in-out infinite; }
@keyframes yk-blink { 50% { opacity: .35; } }
.yk-lang { max-width: 7.2rem; height: 30px; border-radius: 8px; padding: 0 6px; font: inherit; font-size: 11.5px; color: #fff; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.28); outline: 0; cursor: pointer; }
.yk-lang option { color: #111; background: #fff; }
.yk-context { display: flex; align-items: center; gap: 6px; padding: 7px 14px; font-size: 11.5px; color: var(--muted); background: #fff; border-bottom: 1px solid var(--line); }
.yk-list { flex: 1; overflow-y: auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.yk-msg { display: flex; gap: 8px; align-items: flex-start; animation: yk-drop .22s ease-out; }
@keyframes yk-drop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.yk-msg.is-user { justify-content: flex-end; }
.yk-bubble { padding: 9px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.is-bot .yk-bubble { background: #fff; color: var(--ink); border: 1px solid var(--line); border-top-left-radius: 4px; box-shadow: 0 4px 14px -12px rgba(0,0,0,.4); }
.is-user .yk-bubble { background: linear-gradient(135deg, var(--pri-7), var(--pri)); color: #fff; border-top-right-radius: 4px; }
.yk-meta { margin-top: 4px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-left: 4px; font-size: 10.5px; color: var(--muted); }
.yk-meta button { border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.yk-meta button:hover { color: var(--pri-7); text-decoration: underline; }
.yk-card { display: flex; gap: 9px; align-items: flex-start; width: 100%; padding: 8px 10px; border-radius: 10px; background: #fff; border: 1px solid var(--line); text-decoration: none; color: inherit; transition: border-color .2s, transform .2s; }
a.yk-card:hover { border-color: rgba(255,153,51,.6); transform: translateX(2px); }
.yk-dot { width: 8px; height: 8px; border-radius: 9999px; margin-top: 5px; flex: none; }
.yk-how { margin: 6px 0 0; padding: 8px 12px 8px 28px; border-radius: 10px; background: var(--pri-50); font-size: 12px; line-height: 1.5; color: var(--ink-2); }
.yk-confirm { padding: 10px 12px; border-radius: 12px; background: #fff; border: 1px solid rgba(255,153,51,.55); box-shadow: 0 6px 16px -12px rgba(0,0,0,.4); }
.yk-ok { padding: 6px 13px; border: 0; border-radius: 9999px; font: inherit; font-size: 12px; font-weight: 700; color: #fff; cursor: pointer; background: linear-gradient(135deg, #FF9933, #E67E00); }
.yk-ok:disabled { opacity: .6; cursor: default; }
.yk-chip { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 9999px; font: inherit; font-size: 12px; line-height: 1.3; cursor: pointer; color: var(--pri-8); background: #fff; border: 1px solid #CFD9D4; text-decoration: none; text-align: left; }
.yk-chip:hover { border-color: var(--pri); background: var(--pri-50); }
.yk-chip.is-go { font-weight: 600; background: rgba(255,153,51,.1); border-color: rgba(255,153,51,.5); }
.yk-typing { display: inline-flex; gap: 4px; padding: 12px 14px; }
.yk-typing i { width: 6px; height: 6px; border-radius: 9999px; background: #9AA7A1; animation: yk-dot 1.1s ease-in-out infinite; }
.yk-typing i:nth-child(2) { animation-delay: .15s; }
.yk-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes yk-dot { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }
.yk-input { display: flex; align-items: center; gap: 4px; margin: 0 10px; padding: 5px 5px 5px 12px; border-radius: 14px; background: #fff; border: 1px solid var(--line); }
.yk-input:focus-within { border-color: var(--pri); box-shadow: 0 0 0 3px rgba(255,153,51,.2); }
.yk-input input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); }
.yk-send { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 10px; color: #fff; cursor: pointer; background: linear-gradient(135deg, #FF9933, #E67E00); flex: none; }
.yk-send:disabled { background: #CDD5D1; cursor: default; }
.yk-foot { padding: 6px 12px 10px; font-size: 10.5px; line-height: 1.4; color: var(--muted); text-align: center; }
.yk-ac { position: absolute; left: 10px; right: 10px; bottom: calc(100% + 6px); z-index: 5; max-height: 19rem; overflow-y: auto; border-radius: 14px; background: #fff; border: 1px solid var(--line); box-shadow: 0 -12px 34px -16px rgba(0,0,0,.35); animation: yk-drop .14s ease-out; }
.yk-ac-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 12px; text-align: left; border: 0; background: transparent; font: inherit; cursor: pointer; color: var(--ink); }
.yk-ac-item.is-on, .yk-ac-item:hover { background: var(--pri-50); }
.yk-app { flex: none; border-radius: 9999px; padding: 2px 7px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.yk-app.setu { background: var(--pri-50); color: var(--pri-7); }
.yk-app.sentinel { background: #E8ECF7; color: #0B2A6F; }
.yk-app.nayan { background: #FFF1E0; color: #B35F00; }
.yk-mark { border-radius: 2px; background: rgba(255,153,51,.28); padding: 0 1px; color: inherit; }
@media (max-width: 640px) {
  .yk-fab { right: 12px; bottom: 14px; }
  .yk-panel { right: 8px; left: 8px; width: auto; bottom: 80px; height: calc(100vh - 100px); }
  .yk-teaser { right: 76px; bottom: 22px; max-width: calc(100vw - 96px); }
}
@media (prefers-reduced-motion: reduce) { .yk-fab, .yk-orb-ring, .yk-pulse::before, .yk-pulse::after { animation: none !important; } }
:root[data-contrast="1"] .yk-bubble, :root[data-contrast="1"] .yk-card { border-color: #000; }
@media print { .yk-fab, .yk-panel, .yk-teaser { display: none !important; } }
:root[data-theme="dark"] .yk-panel { background: var(--bg); border-color: var(--line); }
:root[data-theme="dark"] .yk-teaser, :root[data-theme="dark"] .yk-context, :root[data-theme="dark"] .is-bot .yk-bubble, :root[data-theme="dark"] .yk-card,
:root[data-theme="dark"] .yk-confirm, :root[data-theme="dark"] .yk-input, :root[data-theme="dark"] .yk-ac, :root[data-theme="dark"] .yk-chip { background: var(--surface); color: var(--ink); border-color: var(--line-2); }
:root[data-theme="dark"] .yk-chip { color: var(--pri-7); }
:root[data-theme="dark"] .yk-chip.is-go { background: rgba(240,161,87,.12); }
:root[data-theme="dark"] .yk-how { background: var(--pri-50); color: var(--ink-2); }
:root[data-theme="dark"] .yk-orb-core { background: radial-gradient(circle at 35% 30%, #fff, #CFE3D8 78%); }
`;

/* ------------------------------------------------------------ languages -- */
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
const YK_NATIVE = new Set(["auto", "hi", "en"]);
const YK_RTL = new Set(["ur", "sd", "ks"]);
/** Setu's language code → Yukt's (Bhashini) code. */
const ykFromPortalLang = (code) => (!code || code === "en" || code === "hi" ? "auto" : code === "kok" ? "gom" : YUKT_LANGS.some((l) => l.code === code) ? code : "auto");

const YK_HINGLISH = ["kaha", "kahan", "milega", "milegi", "karni", "karna", "karu", "karo", "kar do", "baat", "mujhe", "muje", "mera", "meri", "mere", "chahta", "chahti", "sakte", "banao", "bhejo", "chahiye", "kya", "hai", "hain", "kitne", "kitna", "kaun", "kaunse", "batao", "bataiye", "dikhao", "kholo", "mein", "aaj", "sabse", "kaise", "haal", "wala", "wale", "kab", "aayega", "milta", "nahi", "nahin", "hua", "kyu", "kyon", "abhi", "paisa", "paise", "shikayat", "darj"];
function ykLang(raw) {
  if (/[ऀ-ॿ]/.test(raw)) return "hi";
  const t = ` ${String(raw).toLowerCase()} `;
  return YK_HINGLISH.filter((w) => t.includes(` ${w} `)).length >= 2 ? "hi" : "en";
}
const ykTr = (lang, en, hi) => (lang === "hi" ? hi : en);
const ykAny = (text, words) => words.some((w) => text.includes(w));
const ykSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------ knowledge base --- */
/**
 * One entry per feature: the app it lives in (setu / sentinel / nayan), the
 * page (route), who sees it (for: roles; "guest" = the sign-in page), other
 * names people use (aliases — these drive autocomplete), keywords in
 * English, Hinglish and Hindi, a plain summary, and steps where useful.
 * To teach Yukt a feature, add an entry here (and to the server's copy).
 */
const B_ = ["beneficiary"];
const S_ = ["institute_staff"];
const G_ = ["guest"];
const YUKT_KB = [
  { id: "setu-about", app: "setu", route: "/", title: "About Setu", hi: "Setu क्या है", category: "about", summary: "Setu (सेतु, \"bridge\") is the Ministry of Social Justice & Empowerment's portal for the people in welfare institutes. Beneficiaries see their applications, payments, documents and grievances in one place; institute staff keep their institute compliant — findings, documents, renewal and residents. Sentinel, the Ministry's monitoring console, watches over every record, so nothing raised on Setu is lost.", aliases: ["Setu", "What is Setu", "Portal purpose"], keywords: ["about", "purpose", "what is setu", "setu kya hai", "portal", "website", "introduction", "सेतु", "उद्देश्य"] },
  { id: "overview-b", app: "setu", route: "/", for: B_, title: "Overview", hi: "अवलोकन", category: "dashboard", summary: "Your dashboard: what needs your action, what's coming up, your key figures, where each application stands, a 12-month payments chart, document status, recent activity and your grievances.", aliases: ["Dashboard", "Home", "My overview"], keywords: ["overview", "dashboard", "home", "main page", "summary", "avlokan", "अवलोकन", "डैशबोर्ड"] },
  { id: "activity", app: "setu", route: "/activity", for: B_, title: "Activity", hi: "गतिविधि", category: "dashboard", summary: "The full history of your record — applications, payments, documents, grievances and calls — grouped by month and filterable.", aliases: ["History", "Timeline", "Recent activity"], keywords: ["activity", "history", "timeline", "recent", "log", "gatividhi", "itihas", "गतिविधि", "इतिहास"] },
  { id: "benefits", app: "setu", route: "/benefits", for: B_, title: "Benefits & applications", hi: "लाभ व आवेदन", category: "services", summary: "Every scheme you are in or have applied for: application number, office, amount, the stages with dates (applied → verified → sanctioned → disbursed), the next step, and payment history with DBT references.", aliases: ["Application status", "My benefits", "Payments", "Payment history", "Pension"], keywords: ["benefit", "benefits", "application", "status", "payment", "payments", "pension", "scholarship", "dbt", "labh", "aavedan", "लाभ", "आवेदन", "भुगतान"], how: ["Open Benefits & applications from the menu.", "Each scheme shows its stage track and the next step.", "Open 'Payment history' under a scheme for every credit with its DBT reference."] },
  { id: "statement", app: "setu", route: "/benefits", for: B_, title: "Benefit statement", hi: "लाभ विवरण", category: "services", summary: "A printable statement of every payment you have received — scheme, date, amount and reference — that you can print or save as PDF for a bank or office.", aliases: ["Statement", "Passbook", "Payment statement", "Download statement"], keywords: ["statement", "passbook", "print", "pdf", "download", "proof of payment", "vivaran", "विवरण", "स्टेटमेंट"], how: ["Open Benefits & applications.", "Press 'Benefit statement' at the top.", "Print it, or choose 'Save as PDF' in the print window."] },
  { id: "schemes", app: "setu", route: "/schemes", for: B_, title: "Schemes & eligibility", hi: "योजनाएँ व पात्रता", category: "services", summary: "The scheme catalogue. Each scheme shows whether it is yours, whether you may be eligible based on your record, or that it is not for your category. 'Request enrolment' sends a request your institute office completes with you.", aliases: ["Eligibility", "Schemes", "Yojana", "Request enrolment", "Apply for a scheme"], keywords: ["scheme", "schemes", "yojana", "yojna", "eligible", "eligibility", "entitled", "enrol", "enroll", "apply", "patrata", "योजना", "पात्र", "नामांकन"], how: ["Open Schemes & eligibility.", "Filter 'May be eligible'.", "Open a scheme and press 'Request enrolment'. Your institute office completes the application with you."] },
  { id: "documents-b", app: "setu", route: "/my-documents", for: B_, title: "Documents & verification", hi: "दस्तावेज़ व सत्यापन", category: "services", summary: "Your required and optional documents — which are verified (with date and by whom), which are pending or rejected, and exactly what to do about each.", aliases: ["My documents", "Verification", "Aadhaar", "Certificates"], keywords: ["document", "documents", "verification", "verified", "pending", "certificate", "aadhaar", "income certificate", "caste certificate", "dastavez", "kagaz", "दस्तावेज़", "प्रमाणपत्र", "सत्यापन"], how: ["Open Documents & verification.", "Pending or rejected items say what's needed.", "Give a copy to your institute office — they upload it for you, and you'll see it verified here."] },
  { id: "raise-grievance", app: "setu", route: "/grievance/new", for: ["beneficiary", "institute_staff"], title: "Raise a grievance", hi: "शिकायत दर्ज करें", category: "support", summary: "Tell the Ministry about a problem in three steps — category, details (voice input works) and privacy. It is private by default: staff at your institute can't see who raised it. You get a reference number, and Sentinel tracks it until it is resolved.", aliases: ["Complaint", "File a complaint", "New grievance", "Shikayat"], keywords: ["grievance", "complaint", "raise", "file", "report problem", "shikayat", "shikayat darj", "problem", "शिकायत", "समस्या"], how: ["Press 'Raise a grievance' (top right) or ask me to raise one.", "Pick what it's about and describe it — say if anyone is in danger.", "Choose privacy (private by default) and submit. Keep the reference number."] },
  { id: "grievances-b", app: "setu", route: "/grievances", for: B_, title: "My grievances", hi: "मेरी शिकायतें", category: "support", summary: "Every grievance you have raised, with its status (submitted → being looked into → resolved), who it is with, and each update on a timeline.", aliases: ["Track grievance", "Complaint status", "Grievance status"], keywords: ["my grievances", "track", "grievance status", "complaint status", "update", "shikayat ki sthiti", "शिकायत की स्थिति"] },
  { id: "calls", app: "setu", route: "/calls", for: B_, title: "Verification calls", hi: "सत्यापन कॉल", category: "support", summary: "Officials call residents directly to check they are safe and receiving their benefits — staff are not on the call. See your next call with a countdown, past calls and their outcome, and ask for a call yourself.", aliases: ["Video call", "Request a call", "Next call", "Well-being call"], keywords: ["call", "calls", "video call", "phone", "verification call", "request call", "callback", "baat", "कॉल", "फ़ोन"], how: ["Open Verification calls.", "Your next call is at the top with a countdown.", "To ask for one, choose a time under 'Request a call' — or ask me."] },
  { id: "rights", app: "setu", route: "/rights", for: B_, title: "Rights & entitlements", hi: "अधिकार व पात्रताएँ", category: "info", summary: "What every resident is entitled to — safety and dignity, food, health care, education, privacy, being heard without fear, and help at any hour — in plain language, with who to contact if a right is denied.", aliases: ["My rights", "Entitlements", "Adhikar"], keywords: ["rights", "entitlement", "entitled", "adhikar", "haq", "dignity", "अधिकार", "हक़"] },
  { id: "notices", app: "setu", route: "/notices", title: "Updates & notices", hi: "अपडेट व सूचनाएँ", category: "info", summary: "Announcements from the Ministry and the State — new schemes, deadlines, camps and changes that affect you.", aliases: ["Notices", "Announcements", "News"], keywords: ["notice", "notices", "update", "updates", "announcement", "news", "suchna", "सूचना", "अपडेट"] },
  { id: "profile", app: "setu", route: "/profile", for: B_, title: "My profile", hi: "मेरी प्रोफ़ाइल", category: "account", summary: "Your beneficiary ID, institute, room, admission date, guardian and category. To correct anything, ask your institute office — changes are verified before they appear.", aliases: ["Profile", "My details", "Beneficiary ID"], keywords: ["profile", "my details", "beneficiary id", "room", "guardian", "personal", "jaankari", "प्रोफ़ाइल", "जानकारी"] },
  { id: "help", app: "setu", route: "/help", title: "Help & support", hi: "सहायता", category: "support", summary: "Helplines that work from any phone, free: 112 emergency, 1098 Childline, 181 Women Helpline, 14567 Elderline. Plus answers to common questions and how to reach the District Social Welfare Office.", aliases: ["Helpline", "Emergency numbers", "Support", "FAQ"], keywords: ["help", "helpline", "support", "emergency", "number", "1098", "181", "112", "14567", "madad", "sahayata", "मदद", "सहायता", "हेल्पलाइन"] },
  { id: "language", app: "setu", title: "Language & state", hi: "भाषा व राज्य", category: "account", summary: "Setu works in the 22 scheduled languages plus English. Change the language or your state any time from 'Language & state' in the top bar or the account menu — or ask me (\"Hindi mein karo\", \"switch to Tamil\").", aliases: ["Change language", "Bhasha", "Hindi"], keywords: ["language", "bhasha", "hindi", "english", "tamil", "bengali", "translate", "state", "भाषा", "हिंदी"] },
  { id: "accessibility", app: "setu", title: "Text size & contrast", hi: "अक्षर आकार व कंट्रास्ट", category: "account", summary: "Make text larger or smaller with A− / A / A+ in the top bar, and switch on high contrast. Yukt can read any answer aloud — press 'listen'.", aliases: ["Bigger text", "High contrast", "Accessibility", "Read aloud"], keywords: ["text size", "font", "bigger", "larger", "zoom", "contrast", "accessibility", "read aloud", "bada", "akshar", "अक्षर", "बड़ा"] },
  { id: "security", app: "setu", route: "/security", for: ["beneficiary", "institute_staff"], title: "Security", hi: "सुरक्षा", category: "account", summary: "Keep your account safe: turn on 2-step verification (a 6-digit code from an authenticator app after your password), change your password, see where you are signed in and sign out other devices, and check your last sign-in. Setu signs you out after 15 minutes without activity, with a warning 2 minutes before.", aliases: ["Change password", "2-step verification", "Two-factor", "Sign out other devices", "Last sign-in"], keywords: ["security", "password", "change password", "2-step", "two-step", "two factor", "2fa", "otp", "authenticator", "devices", "sessions", "sign out everywhere", "suraksha", "surakshit", "सुरक्षा", "पासवर्ड"] },
  { id: "privacy", app: "setu", title: "Privacy & safety", hi: "गोपनीयता व सुरक्षा", category: "account", summary: "Grievances are private by default — institute staff see only that one was raised, never by whom. Verification calls are between you and an official. Signing out clears Setu's data from this device.", aliases: ["Is it private", "Confidential", "Who can see"], keywords: ["private", "privacy", "confidential", "secret", "who can see", "anonymous", "safe", "gopniya", "गोपनीय", "सुरक्षित"] },
  // institute staff
  { id: "overview-s", app: "setu", route: "/", for: S_, title: "Institute overview", hi: "संस्था अवलोकन", category: "dashboard", summary: "Your institute at a glance: compliance score, what needs action, open findings, renewal, payments to residents, residents' applications and residents needing help.", aliases: ["Dashboard", "Compliance score", "Home"], keywords: ["overview", "dashboard", "home", "compliance", "score", "summary", "अवलोकन", "अनुपालन"] },
  { id: "residents", app: "setu", route: "/residents", for: S_, title: "Residents", hi: "निवासी", category: "dashboard", summary: "Every resident's benefits, documents, grievances (private ones are only counted) and last verification call, with filters and a detail view — so you can see who is waiting on a document or a re-application.", aliases: ["Beneficiaries", "Resident list", "Needing help"], keywords: ["resident", "residents", "beneficiaries", "children", "students", "niwasi", "needing help", "निवासी"] },
  { id: "findings", app: "setu", route: "/findings", for: S_, title: "Findings", hi: "निष्कर्ष", category: "compliance", summary: "What Sentinel flagged about your institute — camera, attendance, records, missed calls. Respond to each with an explanation and evidence; open findings lower your compliance score until they are addressed.", aliases: ["Alerts", "Respond to findings", "Flags"], keywords: ["finding", "findings", "alert", "alerts", "flag", "respond", "evidence", "nishkarsh", "निष्कर्ष", "जवाब"], how: ["Open Findings.", "Pick an open finding and press 'Respond'.", "Explain what happened and attach evidence (photos, registers, certificates), then send."] },
  { id: "renewal", app: "setu", route: "/renewal", for: S_, title: "Registration renewal", hi: "पंजीकरण नवीनीकरण", category: "compliance", summary: "Where your registration renewal stands (applied → under review → decided), what the office asked for, and the documents to keep current.", aliases: ["Renewal", "Registration", "License renewal"], keywords: ["renewal", "renew", "registration", "license", "licence", "navinikaran", "नवीनीकरण", "पंजीकरण"] },
  { id: "institute", app: "setu", route: "/institute", for: S_, title: "Institute profile", hi: "संस्था प्रोफ़ाइल", category: "compliance", summary: "Your institute's registered details — type, capacity, address and contacts — as the Ministry holds them.", aliases: ["Institute details", "Our institute"], keywords: ["institute profile", "institute details", "address", "capacity", "sanstha", "संस्था"] },
  { id: "documents-s", app: "setu", route: "/documents", for: S_, title: "Documents", hi: "दस्तावेज़", category: "records", summary: "Upload certificates, audits and registers — and documents on behalf of a beneficiary, which then appear on their record for verification.", aliases: ["Upload documents", "Upload for a resident", "Certificates"], keywords: ["document", "documents", "upload", "certificate", "audit", "file", "on behalf", "beneficiary document", "दस्तावेज़", "अपलोड"], how: ["Open Documents and press 'Upload'.", "Pick the type — choose 'Beneficiary document' to file one for a resident.", "Add a short description and upload."] },
  { id: "grievances-s", app: "setu", route: "/grievances", for: S_, title: "Grievances", hi: "शिकायतें", category: "support", summary: "Grievances about your institute and the ones you raise to the Ministry. Private grievances show that one exists, never who raised it.", aliases: ["Complaints", "Institute grievances"], keywords: ["grievances", "complaints", "shikayat", "शिकायतें"] },
  // before sign-in
  { id: "signin", app: "setu", route: "/login", for: G_, title: "How to sign in", hi: "साइन इन कैसे करें", category: "account", summary: "Choose Beneficiary or Institute at the top of the sign-in card. Beneficiaries pick their State, language and institute, then sign in with email and password. Institute staff pick their institute and language, then use their staff email.", aliases: ["Sign in", "Login", "Log in"], keywords: ["sign in", "signin", "login", "log in", "password", "email", "kaise login", "लॉगिन", "साइन इन"], how: ["Pick Beneficiary or Institute at the top.", "Fill the numbered boxes — any order works.", "Enter your email and password and press Sign in."] },
  { id: "which-portal", app: "setu", route: "/login", for: G_, title: "Beneficiary or Institute?", hi: "लाभार्थी या संस्था?", category: "account", summary: "Beneficiary is for residents of welfare institutes and their benefits. Institute is for the staff and management of an institute. If you sign in on the wrong one, Setu tells you and switches with one click.", aliases: ["Which portal", "Institute login", "Beneficiary login"], keywords: ["which portal", "beneficiary", "institute", "staff", "which one", "kaunsa", "लाभार्थी", "संस्था"] },
  { id: "no-account", app: "setu", route: "/login", for: G_, title: "Getting an account", hi: "खाता कैसे मिलेगा", category: "account", summary: "Beneficiary accounts are issued by your institute or the District Social Welfare Office; institute accounts by the District Social Welfare Office. Forgot your password? Ask the same office to reset it.", aliases: ["No account", "Create account", "Forgot password", "Register"], keywords: ["account", "create account", "register", "sign up", "signup", "forgot password", "reset password", "khata", "खाता", "पासवर्ड"] },
  { id: "demo", app: "setu", route: "/login", for: G_, title: "Test accounts", hi: "परीक्षण खाते", category: "account", summary: "Open 'Use a test account' under the sign-in card: 21 beneficiaries across States and 5 institute staff accounts. The password is filled in for you.", aliases: ["Try demo", "Test account"], keywords: ["demo", "test", "sample", "try", "trial", "डेमो"] },
  // the other two platforms
  { id: "sentinel-about", app: "sentinel", title: "About Sentinel", hi: "Sentinel क्या है", category: "ecosystem", summary: "Sentinel is the Ministry's monitoring console for officials. It watches every institute — alerts, camera health, compliance, grievances and renewals — so every grievance raised on Setu reaches an officer on a deadline and is escalated if it isn't resolved.", aliases: ["Sentinel", "Officials' dashboard"], keywords: ["sentinel", "official", "officials", "monitoring", "ministry dashboard", "सेंटिनल"] },
  { id: "nayan-about", app: "nayan", route: "/ecosystem?to=nayan", title: "About Nayan", hi: "नयन क्या है", category: "ecosystem", summary: "Nayan (\"eye\") is the inspectors' Android app. Inspectors check in at the institute with location proof, capture sealed photo and video evidence and file the report on site. Visits are assigned by a random draw, so they are never announced.", aliases: ["Nayan", "Inspection app", "Inspectors"], keywords: ["nayan", "inspector", "inspection", "inspectors", "visit", "surprise visit", "nirikshak", "नयन", "निरीक्षक", "निरीक्षण"] },
];

/* -------------------------------------------------- retrieval engine ---- */
const YK_CONCEPTS = {
  payment: ["payment", "payments", "paid", "pay", "paisa", "paise", "pension", "amount", "money", "dbt", "credit", "instalment", "installment", "kist", "भुगतान", "पैसा", "पैसे", "पेंशन", "किस्त"],
  scheme: ["scheme", "schemes", "yojana", "yojna", "eligible", "eligibility", "enrol", "enroll", "scholarship", "योजना", "पात्र", "छात्रवृत्ति"],
  document: ["document", "documents", "dastavez", "dastavej", "kagaz", "certificate", "aadhaar", "aadhar", "praman", "दस्तावेज़", "प्रमाणपत्र", "आधार"],
  complaint: ["complaint", "complaints", "grievance", "grievances", "shikayat", "problem", "issue", "शिकायत", "समस्या"],
  call: ["call", "calls", "phone", "video", "callback", "कॉल", "फ़ोन"],
  status: ["status", "application", "aavedan", "avedan", "stage", "track", "स्थिति", "आवेदन"],
  history: ["activity", "history", "timeline", "recent", "gatividhi", "इतिहास", "गतिविधि"],
  rights: ["rights", "right", "adhikar", "haq", "entitlement", "अधिकार"],
  help: ["help", "helpline", "madad", "sahayata", "emergency", "support", "मदद", "सहायता"],
  language: ["language", "bhasha", "hindi", "english", "translate", "भाषा", "हिंदी"],
  finding: ["finding", "findings", "alert", "alerts", "flag", "nishkarsh", "निष्कर्ष"],
  renewal: ["renewal", "renew", "registration", "license", "licence", "नवीनीकरण"],
  resident: ["resident", "residents", "niwasi", "nivasi", "beneficiaries", "निवासी"],
  login: ["login", "signin", "sign", "password", "account", "लॉगिन", "खाता"],
  inspector: ["inspector", "inspectors", "inspection", "nayan", "nirikshak", "निरीक्षक"],
  notice: ["notice", "notices", "update", "updates", "announcement", "news", "सूचना"],
};
const YK_CONCEPT_OF = (() => {
  const m = new Map();
  Object.entries(YK_CONCEPTS).forEach(([c, forms]) => forms.forEach((f) => m.set(f, c)));
  return m;
})();
const YK_STOP = new Set(
  ("a an the is are am to of in on for and or me my i you it this that these those do does can could should would how what where which who when why kya hai hain ho " +
    "mujhe muje hume mera meri mere hamara karna karni karne karu karun kare karo kar ka ki ke ko se mein me par pe tak bhi hi ye yeh woh wo is us " +
    "kaha kahan kidhar milega milegi milta milti dikhao dikha show open kholo khol please pls batao bataiye chahiye jaana jana hota hoti kaise kis kaun " +
    "kab aayega wala wale sab saare explain samjhao tell about next last latest new get see " +
    "है हैं को का की के में से मुझे कहाँ कहां क्या कैसे खोलो दिखाओ करना करनी बताओ मेरा मेरी").split(/\s+/)
);
function ykTokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
function ykLev(a, b) {
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
const ykTypoOk = (t, w) => t.length >= 4 && w.length >= 4 && ykLev(t, w) <= (t.length >= 7 ? 2 : 1);
function ykTrigramSim(a, b) {
  if (a === b) return 1;
  const tg = (w) => {
    const s = `  ${w} `;
    const out = new Set();
    for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
    return out;
  };
  const A = tg(a);
  const B = tg(b);
  let inter = 0;
  A.forEach((x) => B.has(x) && inter++);
  return inter / (A.size + B.size - inter);
}
const YK_INDEX = YUKT_KB.map((d) => {
  const titleWords = ykTokens(`${d.title} ${d.hi} ${d.aliases.join(" ")}`);
  const keyWords = ykTokens(d.keywords.join(" "));
  const all = [...titleWords, ...keyWords];
  return {
    d,
    titleWords: new Set(titleWords),
    keyWords: new Set(keyWords),
    bodyWords: new Set(ykTokens(d.summary)),
    vocab: [...new Set(all)],
    concepts: new Set(all.map((w) => YK_CONCEPT_OF.get(w)).filter(Boolean)),
    labels: [d.title, ...d.aliases],
    phrases: d.keywords.filter((k) => k.includes(" ")).map((k) => k.toLowerCase()),
  };
});
/** Who may see an entry: signed-in people see their portal's pages plus shared ones. */
const ykVisible = (d, role) => !d.for || d.for.includes(role) || (role === "guest" && d.app === "setu" && d.category !== "dashboard");
function ykScore(entry, qTokens, qText) {
  let s = 0;
  qTokens
    .filter((t) => !YK_STOP.has(t) && t.length > 1)
    .forEach((t) => {
      const concept = YK_CONCEPT_OF.get(t);
      if (entry.titleWords.has(t)) s += 6;
      else if (entry.keyWords.has(t)) s += 4;
      else if (concept && entry.concepts.has(concept)) s += 4.5;
      else {
        let best = 0;
        entry.vocab.forEach((w) => {
          if (w.length > 2 && t.length > 1 && w.startsWith(t)) best = Math.max(best, 2.5);
          else if (ykTypoOk(t, w)) best = Math.max(best, 3.5);
          else if (t.length > 3 && w.length > 3) {
            const sim = ykTrigramSim(t, w);
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
function ykRetrieve(q, role, limit = 5) {
  const qt = ykTokens(q);
  const text = ` ${String(q).toLowerCase()} `;
  return YK_INDEX.filter((e) => ykVisible(e.d, role))
    .map((e) => ({ doc: e.d, score: ykScore(e, qt, text) }))
    .filter((r) => r.score > 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
/** Autocomplete: features by the start of a name or alias, by meaning, by near-spelling. */
function ykSuggest(input, role, limit = 6) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return [];
  const toks = ykTokens(raw);
  const last = toks[toks.length - 1] || raw;
  const head = toks.slice(0, -1);
  const text = ` ${raw} `;
  const out = [];
  YK_INDEX.filter((e) => ykVisible(e.d, role)).forEach((e) => {
    let s = head.length ? ykScore(e, head, text) * 0.6 : 0;
    let label = e.d.title;
    let prefix = 0;
    e.labels.forEach((l, i) => {
      const lw = l.toLowerCase();
      let p = 0;
      if (lw.startsWith(raw)) p = 12 - Math.min(4, lw.length / 6) + (i === 0 ? 0.6 : 0);
      else if (ykTokens(lw).some((w) => w.startsWith(last))) p = 8 - Math.min(3, lw.length / 8) + (i === 0 ? 0.4 : 0);
      if (p > prefix) {
        prefix = p;
        label = l;
      }
    });
    s += prefix;
    if (!prefix && last.length >= 2) {
      if ([...e.keyWords].some((w) => w.startsWith(last))) s += 4;
      const c = YK_CONCEPT_OF.get(last);
      if (c && e.concepts.has(c)) s += 5;
      if (last.length >= 4) {
        let best = 0;
        e.vocab.forEach((w) => (best = Math.max(best, ykTypoOk(last, w) ? 1 : w.length > 3 ? ykTrigramSim(last, w) : 0)));
        if (best >= 0.4) s += best * 5;
      }
    }
    if (s > 2) out.push({ doc: e.d, label, score: s });
  });
  return out.sort((a, b) => b.score - a.score || a.label.length - b.label.length).slice(0, limit);
}

/* ----------------------------------------------------------- intents ---- */
const YK_I = {
  locate: /(\bkaha\b|kahan|kidhar|\bwhere\b|\bfind\b|milega|milegi|\bgo to\b|le chalo|take me|कहाँ|कहां|मिलेगा)/,
  open: /(\bopen\b|kholo|khol do|dikhao|show me|jana hai|खोलो|दिखाओ)/,
  explain: /(kya hai|kya karta|what is|what does|what's|purpose|explain|samjha|matlab|meaning|kis liye|about|क्या है|समझा|उद्देश्य|मतलब)/,
  how: /(kaise|how (do|can|to|should|does)|steps|tarika|process|कैसे|तरीका)/,
  page: /(this page|is page|ye page|yeh page|this screen|is screen|yahan|this section|is section|यह पेज|इस पेज)/,
};
const YD = {
  danger: /(danger|in danger|unsafe|not safe|abuse|abused|beat me|beating|hit me|hurt me|harass|threat|khatra|khatre|maar|marte|marta|peet|chot|surakshit nahi|खतर|मार|पीट|हिंसा|असुरक्षित|डर लग)/,
  summary: /(summary|overview|what should i do|what do i need|anything pending|what's pending|needs my attention|attention|kya karna|kya baaki|kya pending|pending kya|mera haal|haal batao|haal|to ?do|सारांश|क्या करना|बाकी|हाल)/,
  payment: /(payment|paid|\bpay\b|paisa|paise|pension|amount|kab aayeg|kab ayeg|kab milega|credited|credit|instal|kist|\bdbt\b|money|₹|भुगतान|पैसा|पैसे|पेंशन|किस्त|राशि)/,
  status: /(status|application|aavedan|avedan|applied|approv|sanction|stage|kahan tak|kaha tak|pending kyu|why.*pending|स्थिति|आवेदन)/,
  documents: /(document|dastavez|dastavej|certificate|praman|aadhaar|aadhar|kagaz|kaagaz|दस्तावेज|प्रमाण|आधार|कागज)/,
  grievance: /(grievance|complaint|shikayat|shikayet|शिकायत)/,
  calls: /(\bcall|phone|video|कॉल|फ़ोन|फोन)/,
  schemes: /(scheme|yojana|yojna|eligib|patra|entitle|योजना|पात्र)/,
  notices: /(notice|announcement|news|\bupdates?\b|suchna|सूचना|अपडेट)/,
  profile: /(my details|my profile|who am i|meri jaankari|meri jankari|mera naam|beneficiary id|my id|my room|guardian|प्रोफ़ाइल|मेरी जानकारी)/,
  helpline: /(helpline|emergency|number|1098|\b181\b|\b112\b|14567|हेल्पलाइन|आपात)/,
  rights: /(right|adhikar|haq|entitle|अधिकार|हक)/,
  compliance: /(compliance|score|anupalan|rating|अनुपालन|स्कोर)/,
  findings: /(finding|alert|nishkarsh|\bflag|निष्कर्ष)/,
  renewal: /(renewal|registration|renew|navinikaran|licen|नवीनीकरण|पंजीकरण)/,
  residents: /(resident|niwasi|nivasi|निवासी|beneficiar|need.{0,6}help|needing)/,
  uploads: /(upload|uploaded|documents? (count|list)|अपलोड)/,
  thanks: /(thank|thanks|shukriya|dhanyavad|धन्यवाद|शुक्रिया)/,
  greet: /^(hi|hii|hello|hey|namaste|namaskar|नमस्ते|नमस्कार|pranam|good (morning|evening|afternoon))\b/,
};
const YA = {
  raise: /(raise|file|lodge|register|submit|new|report|darj|karni hai|karna hai|karo|kar do|bhejo|likh|दर्ज|करनी है|करना है|करो|कर दो|लिखो)/,
  call: /(call me|call chahiye|call karwa|call karo|call back|callback|request (a )?call|call request|mujhe call|phone karo|baat karni|baat karwa|कॉल चाहिए|कॉल करो|कॉल करवा|बात करनी|बात करवा)/,
  statement: /(statement|passbook|print (my )?payment|payment (proof|history (pdf|print|download))|विवरण|स्टेटमेंट|पासबुक)/,
  enrol: /(enrol|enroll|join|namankan|apply for|apply in|avedan karna|aavedan karna|apply karna|नामांकन|आवेदन करना)/,
  language: /(language|bhasha|bhaasha|भाषा|switch to|change to|badlo|badal do|बदलो|बदल दो|mein karo|me karo|में करो|mein dikhao|में दिखाओ|in (hindi|english|tamil|telugu|bengali|marathi|gujarati|kannada|malayalam|punjabi|odia|urdu|assamese))/,
  bigger: /(bigger text|larger text|large text|increase (the )?(text|font)|text bada|font bada|akshar bade|bade akshar|बड़े अक्षर|अक्षर बड़े|zoom in)/,
  smaller: /(smaller text|small text|decrease (the )?(text|font)|text chhota|font chhota|छोटे अक्षर)/,
  normalText: /(normal text|reset text|default text)/,
  contrastOn: /(high contrast|contrast on|contrast mode|हाई कंट्रास्ट)/,
  contrastOff: /(contrast off|normal colou?rs|turn off contrast)/,
  logout: /(log ?out|sign ?out|logout|signout|लॉग आउट|साइन आउट)/,
  switchPortal: /(institute (portal|login|tab|sign)|staff (login|portal|sign)|beneficiary (portal|login|tab|sign)|switch to (institute|beneficiary))/,
  cancel: /^(cancel|no|nahi|nahin|rehne do|chhodo|रहने दो|नहीं|mat karo)\b/,
};

/** What a grievance is about, from its words. */
const YK_CATEGORY_WORDS = [
  ["food", ["food", "meal", "meals", "khana", "khaana", "breakfast", "lunch", "dinner", "roti", "dal", "thanda", "stale", "भोजन", "खाना", "नाश्ता"]],
  ["water", ["water", "pani", "paani", "drinking", "toilet", "bathroom", "washroom", "hygiene", "dirty", "ganda", "saaf", "पानी", "शौचालय", "गंदा", "सफ़ाई"]],
  ["safety", ["safety", "safe", "unsafe", "danger", "abuse", "beat", "hit", "harass", "threat", "maar", "khatra", "सुरक्षा", "खतरा", "मार"]],
  ["health", ["health", "medicine", "doctor", "sick", "ill", "fever", "hospital", "dawai", "dawa", "bimar", "बीमार", "दवा", "डॉक्टर", "स्वास्थ्य"]],
  ["staff", ["staff", "warden", "behaviour", "behavior", "rude", "shout", "daant", "misbehave", "कर्मचारी", "वार्डन", "डांट"]],
  ["education", ["school", "study", "studies", "class", "teacher", "books", "scholarship", "exam", "padhai", "fees", "पढ़ाई", "स्कूल", "छात्रवृत्ति"]],
  ["benefits", ["payment", "pension", "paisa", "paise", "money", "amount", "dbt", "benefit", "पैसा", "पेंशन", "भुगतान"]],
  ["facilities", ["room", "bed", "fan", "light", "electricity", "bijli", "geyser", "blanket", "mattress", "building", "roof", "कमरा", "बिस्तर", "बिजली", "पंखा"]],
];
function ykCategory(text) {
  const t = String(text).toLowerCase();
  let best = ["other", 0];
  YK_CATEGORY_WORDS.forEach(([key, words]) => {
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits > best[1]) best = [key, hits];
  });
  return best[0];
}
/** The complaint itself, without "raise a grievance" / "shikayat darj karo". */
function ykGrievanceDetail(raw) {
  let s = String(raw).trim();
  const colon = s.search(/[:：–—]\s*\S/);
  if (colon >= 0 && colon < 60) return s.slice(colon + 1).trim();
  const patterns = [
    /^(please\s+|pls\s+)?(i\s+(want|need|would like|wish)\s+to\s+|help me\s+|can you\s+)?(raise|file|lodge|register|submit|make|report)\s+(a\s+|an\s+|new\s+|my\s+)?(grievance|complaint)(\s+(about|regarding|that|on|for|against))?\s*/i,
    /^(meri\s+|ek\s+)?(shikayat|complaint|grievance)\s*(darj|file|register|likho|bhejo)?\s*(karo|kar do|karni hai|karna hai|karni|karna|kijiye)?\s*(ki|ke baare mein|ke bare me|ke bare mein)?\s*/i,
    /\s*(ke baare mein|ke bare me|ke bare mein|ki|ke liye|about)?\s*(ek\s+)?(shikayat|complaint|grievance)\s*(darj|file|register|likho|bhejo)?\s*(karni hai|karna hai|karo|kar do|karni|karna|chahiye|hai|kijiye)?\s*[.!।]?$/i,
    /^(एक\s+)?शिकायत\s*(दर्ज)?\s*(करो|करें|कर दो|करनी है|करना है)?\s*/,
    /\s*(के बारे में|की)?\s*(एक\s+)?शिकायत\s*(दर्ज)?\s*(करनी है|करना है|करो|कर दो|करें)?\s*[।.!]?$/,
  ];
  patterns.forEach((re) => {
    s = s.replace(re, " ").trim();
  });
  return s.replace(/^(that|ki|कि)\s+/i, "").trim();
}
function ykSubject(detail) {
  const first = String(detail).split(/(?<=[.!?।])\s+/)[0].trim();
  const cut = first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}
/** A language the message names, if any. */
function ykLanguageIn(text) {
  const t = String(text).toLowerCase();
  const hit = LANGUAGES.find((l) => t.includes(l.name.toLowerCase()) || text.includes(l.native));
  if (hit) return hit.code;
  if (/\bhindi\b|हिंदी|हिन्दी/.test(t)) return "hi";
  if (/angrezi|अंग्रेज़ी|अंग्रेजी/.test(t)) return "en";
  return null;
}
const ykCatLabel = (key, lang) => {
  const c = COMPLAINT_CATEGORIES.find((x) => x.key === key) || COMPLAINT_CATEGORIES[COMPLAINT_CATEGORIES.length - 1];
  return lang === "hi" ? c.hi : c.en;
};
const ykPeriod = (p, lang) => (lang !== "hi" ? p : { "per month": "प्रति माह", "per year": "प्रति वर्ष", "one time": "एकमुश्त", "per course": "प्रति पाठ्यक्रम" }[p] || p);
const toneColor = (t) => ({ good: "#16874F", watch: "#C27803", flag: "#C8372D", info: "#1F5FAE" }[t] || "#8A9792");

/* ---------------------------------------------------- local: actions ---- */
function ykGrievanceProposal(detail, lang, { urgent = false } = {}) {
  const category = urgent ? "safety" : ykCategory(detail);
  const subject = ykSubject(detail);
  return {
    type: "grievance",
    id: `g${Date.now()}`,
    title: ykTr(lang, urgent ? "Raise an URGENT grievance" : "Raise a grievance", urgent ? "तत्काल शिकायत दर्ज करें" : "शिकायत दर्ज करें"),
    sub: `${ykCatLabel(category, lang)} · ${subject}`,
    note: ykTr(lang, "Private — your institute's staff won't see who raised it.", "गोपनीय — संस्था के कर्मचारी नहीं देखेंगे कि किसने दर्ज की।"),
    payload: { subject, description: detail, category, urgency: urgent ? "high" : "normal", confidential: true },
  };
}

function ykLocalAction(raw, ctx, lang) {
  const text = String(raw).toLowerCase().trim();
  const { role } = ctx;
  const signedIn = role !== "guest";

  // Display: instantly reversible, so no confirmation (as in Sentinel).
  if (YA.bigger.test(text)) return { text: ykTr(lang, "Done — text is larger now. Say \"normal text\" to go back.", "हो गया — अक्षर बड़े कर दिए। वापस के लिए \"normal text\" कहें।"), a11y: { size: "lg" } };
  if (YA.smaller.test(text)) return { text: ykTr(lang, "Done — text is smaller now.", "हो गया — अक्षर छोटे कर दिए।"), a11y: { size: "sm" } };
  if (YA.normalText.test(text)) return { text: ykTr(lang, "Text size is back to normal.", "अक्षर सामान्य आकार में।"), a11y: { size: "md" } };
  if (/(dark mode|dark theme|dark kar|night mode|डार्क)/.test(text)) return { text: ykTr(lang, "Dark mode is on. Say \"light mode\" to switch back.", "डार्क मोड चालू। वापस के लिए \"light mode\" कहें।"), a11y: { theme: "dark" } };
  if (/(light mode|light theme|light kar|day mode|लाइट मोड)/.test(text)) return { text: ykTr(lang, "Light mode is on.", "लाइट मोड चालू।"), a11y: { theme: "light" } };
  if (YA.contrastOff.test(text)) return { text: ykTr(lang, "High contrast is off.", "हाई कंट्रास्ट बंद।"), a11y: { contrast: false } };
  if (YA.contrastOn.test(text)) return { text: ykTr(lang, "High contrast is on.", "हाई कंट्रास्ट चालू।"), a11y: { contrast: true } };

  // Emergencies first — numbers straight away, then an urgent grievance.
  if (YD.danger.test(text)) {
    const detail = ykGrievanceDetail(raw);
    return {
      text: ykTr(lang, "If you are in danger right now, call 112. Children can call 1098, women 181, senior citizens 14567 — free from any phone, any hour.", "अगर आप अभी खतरे में हैं तो 112 पर कॉल करें। बच्चे 1098, महिलाएँ 181, वरिष्ठ नागरिक 14567 — किसी भी फ़ोन से, कभी भी, मुफ़्त।"),
      items: HELPLINES.map((h) => ({ title: `${h.number} — ${lang === "hi" ? h.hi : h.en}`, tone: h.tone, href: `tel:${h.number}` })),
      proposals: signedIn ? [ykGrievanceProposal(detail.length >= 8 ? detail : raw, lang, { urgent: true })] : undefined,
      after: signedIn ? ykTr(lang, "I can also raise an urgent, private grievance for you — it goes straight to the District officer:", "मैं आपके लिए तत्काल, गोपनीय शिकायत भी दर्ज कर सकता हूँ — सीधे ज़िला अधिकारी तक:") : undefined,
    };
  }

  if (!signedIn) {
    if (YA.switchPortal.test(text)) {
      const to = /institute|staff/.test(text) ? "institute" : "beneficiary";
      return { text: ykTr(lang, `Switched to the ${to === "institute" ? "Institute" : "Beneficiary"} sign-in.`, `${to === "institute" ? "संस्था" : "लाभार्थी"} साइन-इन पर बदल दिया।`), portal: to };
    }
    const code = ykLanguageIn(raw);
    if (code && YA.language.test(text)) {
      return { text: ykTr(lang, "Please confirm:", "कृपया पुष्टि करें:"), proposals: [{ type: "language", id: `l${code}`, title: ykTr(lang, `Use Setu in ${langOf(code).name}`, `Setu को ${langOf(code).native} में करें`), sub: langOf(code).native, payload: { code } }] };
    }
    return null;
  }

  if (/(guided tour|\btour\b|show me around|walk ?through|guide me|demo dikhao|ghuma|भ्रमण|घुमाओ)/.test(text)) {
    return { text: ykTr(lang, "Starting the guided tour of the Overview.", "अवलोकन का मार्गदर्शित भ्रमण शुरू कर रहा हूँ।"), tour: true };
  }
  if (YA.logout.test(text)) {
    return { text: ykTr(lang, "Please confirm:", "कृपया पुष्टि करें:"), proposals: [{ type: "logout", id: "logout", title: ykTr(lang, "Sign out of Setu", "Setu से साइन आउट करें"), sub: ykTr(lang, "Your data is cleared from this device.", "इस डिवाइस से आपका डेटा हटा दिया जाएगा।") }] };
  }

  const code = ykLanguageIn(raw);
  if (YA.language.test(text)) {
    if (!code) return { text: ykTr(lang, "Which language? Setu has the 22 scheduled languages plus English — say, for example, \"switch to Tamil\". Or open the full list:", "कौन-सी भाषा? Setu में 22 अनुसूचित भाषाएँ और अंग्रेज़ी हैं — जैसे कहें \"Tamil mein karo\"। या पूरी सूची खोलें:"), openPrefs: true };
    return { text: ykTr(lang, "Please confirm:", "कृपया पुष्टि करें:"), proposals: [{ type: "language", id: `l${code}`, title: ykTr(lang, `Change the portal language to ${langOf(code).name}`, `पोर्टल की भाषा ${langOf(code).native} करें`), sub: `${langOf(code).native} · ${ykTr(lang, "change back any time from Language & state", "Language & state से कभी भी बदलें")}`, payload: { code } }] };
  }

  // Raise a grievance — the details come in this message or the next one.
  if (YD.grievance.test(text) && YA.raise.test(text)) {
    const detail = ykGrievanceDetail(raw);
    if (detail.length < 8) {
      return {
        text: ykTr(lang, "Tell me in a line or two what the problem is — for example \"the food is served cold every night\". I'll prepare the grievance for you to confirm.", "एक-दो पंक्तियों में समस्या बताइए — जैसे \"रात का खाना रोज़ ठंडा मिलता है\"। मैं शिकायत तैयार कर दूँगा, आप पुष्टि करें।"),
        awaiting: "grievance",
        actions: [{ label: ykTr(lang, "Or use the full form", "या पूरा फ़ॉर्म भरें"), to: role === "beneficiary" ? "/grievance/new" : "/grievances" }],
      };
    }
    return { text: ykTr(lang, "Here's the grievance I'll file. Please check and confirm:", "यह शिकायत दर्ज होगी। जाँचकर पुष्टि करें:"), proposals: [ykGrievanceProposal(detail, lang)] };
  }

  if (role === "beneficiary") {
    if (YA.call.test(text)) {
      const slot = /(morning|subah|सुबह)/.test(text) ? "Morning (9 am – 12 pm)" : /(afternoon|dopahar|दोपहर)/.test(text) ? "Afternoon (12 – 4 pm)" : /(evening|shaam|sham|शाम)/.test(text) ? "Evening (4 – 7 pm)" : "Any time";
      return {
        text: ykTr(lang, "An official from the District Social Welfare Office will call you — staff are not on the call. Please confirm:", "ज़िला समाज कल्याण कार्यालय के अधिकारी आपको कॉल करेंगे — कर्मचारी कॉल पर नहीं होंगे। पुष्टि करें:"),
        proposals: [{ type: "call", id: `c${Date.now()}`, title: ykTr(lang, "Request a verification call", "सत्यापन कॉल का अनुरोध"), sub: ykTr(lang, `Preferred time: ${slot}`, `पसंदीदा समय: ${slot}`), payload: { preferred_time: slot, note: "Requested through Yukt" } }],
      };
    }
    if (YA.statement.test(text)) {
      return { text: ykTr(lang, "Your benefit statement lists every payment with its date and reference. It opens in a print window — choose \"Save as PDF\" to keep a copy.", "आपके लाभ विवरण में हर भुगतान तारीख़ और संदर्भ के साथ है। यह प्रिंट विंडो में खुलेगा — कॉपी के लिए \"Save as PDF\" चुनें।"), proposals: [{ type: "statement", id: "statement", title: ykTr(lang, "Open my benefit statement", "मेरा लाभ विवरण खोलें"), sub: ykTr(lang, "Print or save as PDF", "प्रिंट करें या PDF सहेजें") }] };
    }
    if (YA.enrol.test(text) || (YD.schemes.test(text) && /(apply|request)/.test(text))) {
      const mine = new Set((ctx.p?.schemes || []).filter((s) => s.status !== "rejected").map((s) => s.key));
      const hit = (ctx.catalog || []).find((s) => {
        const words = ykTokens(`${s.name} ${s.key.replace(/_/g, " ")}`).filter((w) => w.length > 3 && !["scheme", "yojana", "national", "pradhan", "mantri", "post", "matric"].includes(w));
        return words.some((w) => text.includes(w)) || (s.hi && raw.includes(s.hi));
      });
      if (hit && mine.has(hit.key)) return { text: ykTr(lang, `You're already in ${hit.name}. Its status is on Benefits & applications.`, `आप पहले से ${hit.hi || hit.name} में हैं। स्थिति लाभ व आवेदन पेज पर है।`), actions: [{ label: ykTr(lang, "Benefits & applications", "लाभ व आवेदन"), to: "/benefits" }] };
      if (hit) {
        const tags = new Set(ctx.p?.tags || []);
        const eligible = (hit.audience || []).every((t) => tags.has(t));
        return {
          text: eligible ? ykTr(lang, "You may be eligible for this scheme. Your institute office completes the application with you. Please confirm:", "आप इस योजना के पात्र हो सकते हैं। संस्था कार्यालय आपके साथ आवेदन पूरा करेगा। पुष्टि करें:") : ykTr(lang, "Your record doesn't show you're in this scheme's category, but you can still ask — the office will check. Please confirm:", "आपके रिकॉर्ड में आप इस योजना की श्रेणी में नहीं दिखते, फिर भी अनुरोध कर सकते हैं — कार्यालय जाँच करेगा। पुष्टि करें:"),
          proposals: [{ type: "scheme", id: `s${hit.key}`, title: ykTr(lang, `Request enrolment: ${hit.name}`, `नामांकन अनुरोध: ${hit.hi || hit.name}`), sub: hit.amount ? `${rupees(hit.amount)} ${hit.period || ""}`.trim() : hit.about?.slice(0, 90) || "", payload: { scheme_key: hit.key } }],
        };
      }
      return null; // no scheme named → the data engine lists eligible ones
    }
  }
  return null;
}

/* ------------------------------------------------ local: personal data -- */
function ykAgenda(ctx, lang) {
  const p = ctx.p;
  const out = [];
  (p?.documents || []).filter((d) => d.required && d.status !== "verified" && d.status !== "not_required").forEach((d) => {
    out.push({ title: d.status === "rejected" ? ykTr(lang, `${d.name} was rejected — resubmit`, `${d.hi || d.name} अस्वीकृत — दोबारा जमा करें`) : ykTr(lang, `${d.name} is ${d.status === "missing" ? "missing" : "pending"}`, `${d.hi || d.name} ${d.status === "missing" ? "नहीं है" : "लंबित है"}`), sub: ykTr(lang, "Give a copy to your institute office", "संस्था कार्यालय को प्रति दें"), tone: "flag", to: "/my-documents" });
  });
  (p?.schemes || []).filter((s) => s.status === "rejected").forEach((s) => out.push({ title: ykTr(lang, `${s.name} was not approved`, `${s.hi || s.name} स्वीकृत नहीं हुई`), sub: s.next_step, tone: "flag", to: "/benefits" }));
  return out;
}
function ykNextCall(calls) {
  return (calls || [])
    .filter((c) => c.status === "scheduled" && parseDate(c.scheduled_at) && parseDate(c.scheduled_at).getTime() > Date.now())
    .sort((a, b) => parseDate(a.scheduled_at) - parseDate(b.scheduled_at))[0];
}
const ykFirst = (name) => String(name || "").split(" ")[0];

function ykData(raw, ctx, lang) {
  const text = String(raw).toLowerCase().trim();
  const { role, p, inst } = ctx;
  const fmt = (v) => formatDate(v, lang);
  const fmtT = (v) => formatDateTime(v, lang);
  const scheme = (s) => (lang === "hi" && s.hi ? s.hi : s.name);
  const stLabel = (s) => ykTr(lang, (SCHEME_STATUS[s.status] || SCHEME_STATUS.pending).en, (SCHEME_STATUS[s.status] || SCHEME_STATUS.pending).hi);

  if (YD.thanks.test(text) && text.length < 40) return { text: ykTr(lang, "You're welcome! Ask me anything, any time.", "आपका स्वागत है! कभी भी कुछ भी पूछिए।") };
  if (YD.helpline.test(text) && !YD.calls.test(text.replace(/helpline|number/g, ""))) {
    return { text: ykTr(lang, "Free from any phone, any hour:", "किसी भी फ़ोन से, कभी भी, मुफ़्त:"), items: HELPLINES.map((h) => ({ title: `${h.number} — ${lang === "hi" ? h.hi : h.en}`, tone: h.tone, href: `tel:${h.number}` })), actions: [{ label: ykTr(lang, "Help & support", "सहायता"), to: "/help" }] };
  }

  if (role === "beneficiary") {
    if (!p) return null;
    const schemes = p.schemes || [];
    const paying = schemes.filter((s) => s.amount && (s.status === "active" || s.status === "approved"));

    if (YD.summary.test(text) || YD.greet.test(text)) {
      const agenda = ykAgenda(ctx, lang);
      const nc = ykNextCall(ctx.calls);
      const nextPay = paying.filter((s) => s.next_date).sort((a, b) => parseDate(a.next_date) - parseDate(b.next_date))[0];
      const openG = (ctx.grievances || []).filter((g) => g.status !== "resolved").length;
      const delayed = schemes.filter((s) => s.delayed);
      const lines = [
        agenda.length ? ykTr(lang, `${agenda.length} thing${agenda.length > 1 ? "s need" : " needs"} your attention.`, `${agenda.length} बातों पर आपका ध्यान चाहिए।`) : ykTr(lang, "Nothing needs your action right now.", "अभी आपसे कुछ करना बाकी नहीं।"),
        nextPay ? ykTr(lang, `Next payment: ${rupees(nextPay.next_amount || nextPay.amount)} (${nextPay.name}) on ${fmt(nextPay.next_date)}.`, `अगला भुगतान: ${rupees(nextPay.next_amount || nextPay.amount)} (${scheme(nextPay)}) — ${fmt(nextPay.next_date)}।`) : null,
        nc ? ykTr(lang, `Next verification call: ${fmtT(nc.scheduled_at)}.`, `अगली सत्यापन कॉल: ${fmtT(nc.scheduled_at)}।`) : null,
        openG ? ykTr(lang, `${openG} grievance${openG > 1 ? "s are" : " is"} being worked on.`, `${openG} शिकायत पर काम चल रहा है।`) : null,
        ...delayed.map((s) => ykTr(lang, `Note: this month's ${s.name} payment is delayed at the treasury — a grievance is already raised for you.`, `ध्यान दें: इस माह का ${scheme(s)} भुगतान कोषागार में विलंबित है — आपके लिए शिकायत पहले से दर्ज है।`)),
      ].filter(Boolean);
      return { text: `${YD.greet.test(text) ? ykTr(lang, `Namaste ${ykFirst(p.name)}! `, `नमस्ते ${ykFirst(p.name)}! `) : ""}${lines.join("\n")}`, items: agenda.slice(0, 5), actions: [{ label: ykTr(lang, "Overview", "अवलोकन"), to: "/" }] };
    }
    if (YD.payment.test(text) && !YD.grievance.test(text)) {
      if (!paying.length) {
        const nonCash = schemes.filter((s) => !s.amount && (s.status === "active" || s.status === "approved"));
        return { text: ykTr(lang, `None of your current benefits is paid in cash${nonCash.length ? ` — ${nonCash.map((s) => s.name).join(", ")} ${nonCash.length > 1 ? "are" : "is a"} service${nonCash.length > 1 ? "s" : ""}` : ""}. Check Schemes & eligibility for ones you may qualify for.`, `आपके मौजूदा लाभों में नकद भुगतान नहीं है${nonCash.length ? ` — ${nonCash.map(scheme).join(", ")} सेवा है` : ""}। पात्र योजनाओं के लिए योजनाएँ व पात्रता देखें।`), actions: [{ label: ykTr(lang, "Schemes & eligibility", "योजनाएँ व पात्रता"), to: "/schemes" }] };
      }
      const items = paying.map((s) => {
        const last = (s.disbursements || [])[s.disbursements.length - 1];
        return {
          title: `${scheme(s)} — ${rupees(s.next_amount || s.amount)}${s.period ? ` ${ykPeriod(s.period, lang)}` : ""}`,
          sub: s.delayed ? ykTr(lang, "This month's payment is delayed — a grievance has been raised for you", "इस माह का भुगतान विलंबित — आपके लिए शिकायत दर्ज है") : `${ykTr(lang, "Next", "अगला")}: ${fmt(s.next_date)}${last ? ` · ${ykTr(lang, "Last", "पिछला")}: ${rupees(last.amount)} ${ykTr(lang, "on", "")} ${fmt(last.at)}` : ""}`,
          tone: s.delayed ? "watch" : "good",
          to: "/benefits",
        };
      });
      const next = paying.filter((s) => s.next_date).sort((a, b) => parseDate(a.next_date) - parseDate(b.next_date))[0];
      // Same window and sum as the Overview page, so the two always agree.
      const total = paymentsByMonth(schemes.flatMap((s) => s.disbursements || [])).reduce((a, m) => a + m.value, 0);
      return {
        text: next ? ykTr(lang, `Your next payment is ${rupees(next.next_amount || next.amount)} for ${next.name}, due on ${fmt(next.next_date)}. It is credited to your bank account by DBT.`, `आपका अगला भुगतान ${rupees(next.next_amount || next.amount)} (${scheme(next)}) — ${fmt(next.next_date)} को, DBT से सीधे बैंक खाते में।`) : ykTr(lang, "Here are your payments:", "आपके भुगतान:"),
        items,
        after: total ? ykTr(lang, `Received in the last 12 months: ${rupees(total)}.`, `पिछले 12 महीनों में मिले: ${rupees(total)}।`) : undefined,
        chips: [ykTr(lang, "Download my benefit statement", "मेरा लाभ विवरण दिखाओ")],
        actions: [{ label: ykTr(lang, "Payment history", "भुगतान इतिहास"), to: "/benefits" }],
      };
    }
    if (YD.documents.test(text) && !YA.raise.test(text)) {
      const docs = p.documents || [];
      const todo = docs.filter((d) => d.status !== "verified" && d.status !== "not_required");
      if (!todo.length) return { text: ykTr(lang, `All ${docs.length} of your documents are verified.`, `आपके सभी ${docs.length} दस्तावेज़ सत्यापित हैं।`), actions: [{ label: ykTr(lang, "Documents & verification", "दस्तावेज़ व सत्यापन"), to: "/my-documents" }] };
      return {
        text: ykTr(lang, `${todo.length} document${todo.length > 1 ? "s need" : " needs"} attention. Give a copy to your institute office — they upload it and you'll see it verified here.`, `${todo.length} दस्तावेज़ पर ध्यान चाहिए। एक प्रति संस्था कार्यालय को दें — वे अपलोड करेंगे और आप यहीं सत्यापित देखेंगे।`),
        items: todo.map((d) => ({ title: `${docName(d, lang)} — ${ykTr(lang, (DOC_STATUS[d.status] || DOC_STATUS.pending).en, (DOC_STATUS[d.status] || DOC_STATUS.pending).hi)}`, sub: d.remark || (d.required ? ykTr(lang, "Required", "आवश्यक") : ykTr(lang, "Optional", "वैकल्पिक")), tone: d.status === "pending" ? "watch" : "flag", to: "/my-documents" })),
        after: ykTr(lang, `${docs.length - todo.length} of ${docs.length} are verified.`, `${docs.length} में से ${docs.length - todo.length} सत्यापित हैं।`),
      };
    }
    if (YD.grievance.test(text)) {
      const list = [...(ctx.grievances || [])].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
      if (!list.length) return { text: ykTr(lang, "You haven't raised any grievance. Want me to raise one? Just describe the problem.", "आपने कोई शिकायत दर्ज नहीं की है। बताइए, मैं दर्ज कर दूँ?"), chips: [ykTr(lang, "Raise a grievance", "शिकायत दर्ज करनी है")] };
      const open = list.filter((g) => g.status !== "resolved");
      return {
        text: open.length ? ykTr(lang, `${open.length} of your ${list.length} grievances ${open.length > 1 ? "are" : "is"} open. Sentinel keeps each on a deadline with an officer.`, `आपकी ${list.length} में से ${open.length} शिकायतें खुली हैं। Sentinel हर एक को समय-सीमा के साथ अधिकारी के पास रखता है।`) : ykTr(lang, `All ${list.length} of your grievances are resolved.`, `आपकी सभी ${list.length} शिकायतें हल हो चुकी हैं।`),
        items: list.slice(0, 5).map((g) => {
          const st = GRIEVANCE_STATUS[g.status] || GRIEVANCE_STATUS.open;
          const lastU = (g.updates || [])[g.updates?.length - 1];
          return { title: g.subject, sub: `${ykTr(lang, st.en, st.hi)} · ${g.id} · ${lastU ? lastU.text : relTime(g.created_at, lang)}`, tone: st.tone, to: "/grievances" };
        }),
      };
    }
    if (YD.calls.test(text)) {
      const nc = ykNextCall(ctx.calls);
      const past = (ctx.calls || []).filter((c) => c.status !== "scheduled").sort((a, b) => parseDate(b.scheduled_at) - parseDate(a.scheduled_at));
      return {
        text: nc ? ykTr(lang, `Your next verification call is on ${fmtT(nc.scheduled_at)}, from the ${nc.official_name}. Staff won't be on the call — you can speak freely.`, `आपकी अगली सत्यापन कॉल ${fmtT(nc.scheduled_at)} को है (${nc.official_name})। कर्मचारी कॉल पर नहीं होंगे — खुलकर बात करें।`) : ykTr(lang, "No call is scheduled right now. I can request one for you.", "अभी कोई कॉल तय नहीं है। मैं आपके लिए अनुरोध कर सकता हूँ।"),
        items: past.slice(0, 3).map((c) => ({ title: `${fmt(c.scheduled_at)} — ${c.status === "missed" ? ykTr(lang, "Missed", "छूटी") : ykTr(lang, "Completed", "पूरी हुई")}`, sub: c.outcome, tone: c.status === "missed" ? "watch" : "good", to: "/calls" })),
        chips: [ykTr(lang, "Request a call", "मुझे कॉल चाहिए")],
      };
    }
    if (YD.schemes.test(text) || YA.enrol.test(text)) {
      const tags = new Set(p.tags || []);
      const mine = new Set(schemes.filter((s) => s.status !== "rejected").map((s) => s.key));
      const eligible = (ctx.catalog || []).filter((s) => !mine.has(s.key) && (s.audience || []).every((t) => tags.has(t)));
      return {
        text: eligible.length ? ykTr(lang, `Based on your record, you may be eligible for ${eligible.length} more scheme${eligible.length > 1 ? "s" : ""}. Ask me to enrol you, or open one to request enrolment.`, `आपके रिकॉर्ड के आधार पर आप ${eligible.length} और योजनाओं के पात्र हो सकते हैं। नामांकन के लिए कहें या योजना खोलें।`) : ykTr(lang, `You're already in every scheme your record matches (${mine.size}).`, `आप अपने रिकॉर्ड से मेल खाने वाली सभी योजनाओं में हैं (${mine.size})।`),
        items: eligible.slice(0, 5).map((s) => ({ title: lang === "hi" && s.hi ? s.hi : s.name, sub: s.amount ? `${rupees(s.amount)} ${ykPeriod(s.period || "", lang)}` : s.about, tone: "good", to: "/schemes" })),
        chips: eligible.slice(0, 2).map((s) => ykTr(lang, `Enrol me in ${s.name}`, `${s.name} में नामांकन करो`)),
        actions: [{ label: ykTr(lang, "Schemes & eligibility", "योजनाएँ व पात्रता"), to: "/schemes" }],
      };
    }
    if (YD.status.test(text) || /benefit|labh|लाभ/.test(text)) {
      const named = schemes.find((s) => ykTokens(s.name).some((w) => w.length > 4 && text.includes(w)));
      const list = named ? [named] : schemes;
      if (!list.length) return { text: ykTr(lang, "You have no applications yet.", "आपका अभी कोई आवेदन नहीं है।"), actions: [{ label: ykTr(lang, "Schemes & eligibility", "योजनाएँ व पात्रता"), to: "/schemes" }] };
      const lead = named
        ? `${scheme(named)}: ${stLabel(named)}. ${named.next_step}`
        : ykTr(lang, `You have ${schemes.length} application${schemes.length > 1 ? "s" : ""}: ${schemes.filter((s) => s.status === "active" || s.status === "approved").length} approved or active, ${schemes.filter((s) => s.status === "pending").length} in process, ${schemes.filter((s) => s.status === "rejected").length} not approved.`, `आपके ${schemes.length} आवेदन हैं: ${schemes.filter((s) => s.status === "active" || s.status === "approved").length} स्वीकृत/सक्रिय, ${schemes.filter((s) => s.status === "pending").length} प्रक्रिया में, ${schemes.filter((s) => s.status === "rejected").length} अस्वीकृत।`);
      return {
        text: lead,
        items: list.map((s) => ({ title: `${scheme(s)} — ${stLabel(s)}`, sub: `${s.application_id} · ${s.next_step}`, tone: (SCHEME_STATUS[s.status] || SCHEME_STATUS.pending).tone, to: "/benefits" })),
      };
    }
    if (YD.profile.test(text)) {
      return {
        text: ykTr(lang, `${p.name} · ${p.beneficiary_id || "—"}\n${p.institute_name || inst?.name || ""}${p.room ? ` · Room ${p.room}` : ""}${p.admitted_on ? `\nAdmitted on ${fmt(p.admitted_on)}` : ""}`, `${p.name} · ${p.beneficiary_id || "—"}\n${p.institute_name || inst?.name || ""}${p.room ? ` · कमरा ${p.room}` : ""}${p.admitted_on ? `\nप्रवेश: ${fmt(p.admitted_on)}` : ""}`),
        after: ykTr(lang, "To correct anything, ask your institute office.", "कुछ सुधारना हो तो संस्था कार्यालय से कहें।"),
        actions: [{ label: ykTr(lang, "My profile", "मेरी प्रोफ़ाइल"), to: "/profile" }],
      };
    }
    if (YD.notices.test(text)) {
      const list = [...(ctx.notices || [])].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at)).slice(0, 3);
      if (list.length) return { text: ykTr(lang, "The latest updates:", "ताज़ा अपडेट:"), items: list.map((n) => ({ title: n.title, sub: `${relTime(n.created_at, lang)} · ${String(n.body || "").slice(0, 90)}`, tone: "info", to: "/notices" })) };
    }
    return null;
  }

  if (role === "institute_staff") {
    const openF = (ctx.findings || []).filter((f) => f.status === "open");
    const residents = ctx.residents || [];
    const needing = residents.filter((r) => residentFlags(r).needsAction);
    const status = STATUS[inst?.status];
    const ren = RENEWAL[inst?.renewal_status] || RENEWAL.not_applied;
    const findingItems = openF.slice(0, 5).map((f) => ({ title: ykTr(lang, findingType(f.type)[0], findingType(f.type)[1]), sub: `${relTime(f.created_at, lang)} · ${String(f.detail || "").slice(0, 90)}`, tone: f.severity === "red" ? "flag" : "watch", to: "/findings" }));
    if (YD.summary.test(text) || YD.greet.test(text)) {
      const openG = (ctx.grievances || []).filter((g) => g.status !== "resolved").length;
      return {
        text: [
          YD.greet.test(text) ? ykTr(lang, `Namaste ${ykFirst(ctx.user?.name)}!`, `नमस्ते ${ykFirst(ctx.user?.name)}!`) : null,
          inst ? ykTr(lang, `${inst.name}: compliance ${num(inst.compliance_score).toFixed(1)} — ${status?.en || "—"}.`, `${inst.name}: अनुपालन ${num(inst.compliance_score).toFixed(1)} — ${status?.hi || "—"}।`) : null,
          ykTr(lang, `${openF.length} open finding${openF.length === 1 ? "" : "s"} · renewal ${ren.en.toLowerCase()} · ${needing.length} resident${needing.length === 1 ? "" : "s"} needing help · ${openG} open grievance${openG === 1 ? "" : "s"}.`, `${openF.length} खुले निष्कर्ष · नवीनीकरण ${ren.hi} · ${needing.length} निवासियों को सहायता चाहिए · ${openG} खुली शिकायतें।`),
        ].filter(Boolean).join("\n"),
        items: findingItems.slice(0, 3),
        chips: [ykTr(lang, "Residents needing help", "सहायता चाहने वाले निवासी"), ykTr(lang, "How do I respond to a finding?", "निष्कर्ष का जवाब कैसे दूँ?")],
      };
    }
    if (YD.compliance.test(text) && inst) {
      return {
        text: ykTr(lang, `Your compliance score is ${num(inst.compliance_score).toFixed(1)} out of 100 — ${status?.en || "—"}. ${openF.length ? `Responding to the ${openF.length} open finding${openF.length > 1 ? "s" : ""} with evidence is the quickest way to raise it.` : "No open findings — keep documents and renewal current to stay there."}`, `आपका अनुपालन स्कोर 100 में से ${num(inst.compliance_score).toFixed(1)} है — ${status?.hi || "—"}। ${openF.length ? `${openF.length} खुले निष्कर्षों का साक्ष्य सहित जवाब देना इसे बढ़ाने का सबसे तेज़ तरीका है।` : "कोई खुला निष्कर्ष नहीं — दस्तावेज़ और नवीनीकरण अद्यतन रखें।"}`),
        items: findingItems.slice(0, 3),
        actions: [{ label: ykTr(lang, "Findings", "निष्कर्ष"), to: "/findings" }],
      };
    }
    if (YD.findings.test(text)) {
      return {
        text: openF.length ? ykTr(lang, `${openF.length} finding${openF.length > 1 ? "s are" : " is"} open. Respond to each with an explanation and evidence:`, `${openF.length} निष्कर्ष खुले हैं। हर एक का स्पष्टीकरण और साक्ष्य के साथ जवाब दें:`) : ykTr(lang, "No open findings.", "कोई खुला निष्कर्ष नहीं।"),
        items: findingItems,
        how: YUKT_KB.find((d) => d.id === "findings").how,
      };
    }
    if (YD.payment.test(text) && !YD.grievance.test(text)) {
      const year = paymentsByMonth(residents.flatMap((r) => (r.schemes || []).flatMap((s) => s.disbursements || []))).reduce((a, m) => a + m.value, 0);
      const delayed = residents.filter((r) => (r.schemes || []).some((s) => s.delayed));
      return {
        text: ykTr(lang, `Benefits are paid by DBT straight to residents' bank accounts — the institute doesn't handle the money. In the last 12 months your residents received ${rupees(year)}.${delayed.length ? ` ${delayed.length} resident${delayed.length > 1 ? "s have" : " has"} a delayed payment.` : ""}`, `लाभ DBT से सीधे निवासियों के बैंक खाते में जाते हैं — संस्था पैसे नहीं संभालती। पिछले 12 महीनों में आपके निवासियों को ${rupees(year)} मिले।${delayed.length ? ` ${delayed.length} निवासियों का भुगतान विलंबित है।` : ""}`),
        items: delayed.slice(0, 4).map((r) => ({ title: r.name, sub: ykTr(lang, "Payment delayed", "भुगतान विलंबित"), tone: "watch", to: `/residents?open=${encodeURIComponent(r.user_id)}` })),
        actions: [{ label: ykTr(lang, "Overview chart", "अवलोकन चार्ट"), to: "/" }],
      };
    }
    if (YD.renewal.test(text)) {
      return { text: ykTr(lang, `Registration renewal: ${ren.en}.${inst?.renewal_status === "pending" ? " The office is reviewing it — keep the fire safety and food safety certificates current." : inst?.renewal_status === "rejected" ? " Open Registration renewal to see what was asked for and re-apply." : ""}`, `पंजीकरण नवीनीकरण: ${ren.hi}।${inst?.renewal_status === "pending" ? " कार्यालय समीक्षा कर रहा है — अग्नि सुरक्षा और खाद्य सुरक्षा प्रमाणपत्र अद्यतन रखें।" : inst?.renewal_status === "rejected" ? " क्या माँगा गया है देखने और पुनः आवेदन के लिए पंजीकरण नवीनीकरण खोलें।" : ""}`), actions: [{ label: ykTr(lang, "Registration renewal", "पंजीकरण नवीनीकरण"), to: "/renewal" }] };
    }
    if (YD.residents.test(text)) {
      return {
        text: ykTr(lang, `${residents.length} residents. ${needing.length ? `${needing.length} need help — waiting on a document or a re-application:` : "No resident is waiting on a document or re-application."}`, `${residents.length} निवासी। ${needing.length ? `${needing.length} को सहायता चाहिए — दस्तावेज़ या पुनः आवेदन बाकी:` : "कोई निवासी दस्तावेज़ या पुनः आवेदन की प्रतीक्षा में नहीं।"}`),
        items: needing.slice(0, 6).map((r) => {
          const f = residentFlags(r);
          return { title: r.name, sub: f.docsPending ? ykTr(lang, `${f.docsPending} document${f.docsPending > 1 ? "s" : ""} to submit`, `${f.docsPending} दस्तावेज़ जमा करने हैं`) : ykTr(lang, "Re-application needed", "पुनः आवेदन आवश्यक"), tone: "watch", to: `/residents?open=${encodeURIComponent(r.user_id)}` };
        }),
        actions: [{ label: ykTr(lang, "Residents", "निवासी"), to: "/residents" }],
      };
    }
    if (YD.grievance.test(text)) {
      const list = [...(ctx.grievances || [])].sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
      const open = list.filter((g) => g.status !== "resolved");
      return {
        text: ykTr(lang, `${open.length} open grievance${open.length === 1 ? "" : "s"} about your institute (${list.length} in all). Private ones never show who raised them.`, `आपकी संस्था की ${open.length} खुली शिकायतें (कुल ${list.length})। गोपनीय शिकायतों में दर्ज करने वाले का नाम कभी नहीं दिखता।`),
        items: open.slice(0, 5).map((g) => ({ title: g.subject, sub: `${ykTr(lang, (GRIEVANCE_STATUS[g.status] || GRIEVANCE_STATUS.open).en, (GRIEVANCE_STATUS[g.status] || GRIEVANCE_STATUS.open).hi)} · ${relTime(g.created_at, lang)}`, tone: (GRIEVANCE_STATUS[g.status] || GRIEVANCE_STATUS.open).tone, to: "/grievances" })),
      };
    }
    if (YD.uploads.test(text) || (YD.documents.test(text) && !/how|kaise|कैसे/.test(text))) {
      const docs = [...(ctx.documents || [])].sort((a, b) => parseDate(b.uploaded_at) - parseDate(a.uploaded_at));
      return { text: ykTr(lang, `${docs.length} document${docs.length === 1 ? "" : "s"} uploaded${docs[0] ? ` — latest: ${docs[0].description || docs[0].filename}, ${relTime(docs[0].uploaded_at, lang)}` : ""}.`, `${docs.length} दस्तावेज़ अपलोड${docs[0] ? ` — नवीनतम: ${docs[0].description || docs[0].filename}, ${relTime(docs[0].uploaded_at, lang)}` : ""}।`), items: docs.slice(0, 4).map((d) => ({ title: d.description || d.filename, sub: `${d.filename} · ${fmt(d.uploaded_at)}`, tone: "good", to: "/documents" })), actions: [{ label: ykTr(lang, "Documents", "दस्तावेज़"), to: "/documents" }] };
    }
    return null;
  }
  return null;
}

/* ------------------------------------------------ local: knowledge ------ */
function ykKnowledge(raw, ctx, lang) {
  const q = String(raw).toLowerCase();
  const it = Object.fromEntries(Object.entries(YK_I).map(([k, re]) => [k, re.test(q)]));
  const results = ykRetrieve(raw, ctx.role, 5);
  const top = results[0];
  const featureIntent = it.locate || it.open || it.explain || it.how || it.page;
  const pageOf = (path) => {
    const pool = YUKT_KB.filter((d) => d.app === "setu" && d.route && ykVisible(d, ctx.role) && (!d.for || d.for.includes(ctx.role)));
    return pool.find((d) => d.route === path && d.route !== "/") || pool.filter((d) => d.route !== "/").find((d) => path?.startsWith(d.route)) || pool.find((d) => d.route === "/" && d.for) || YUKT_KB[0];
  };

  if (it.page && (it.explain || !top || top.score < 6)) {
    const here = pageOf(ctx.page);
    return { text: ykTr(lang, `You're on ${here.title}. ${here.summary}`, `आप ${here.hi} पेज पर हैं। ${here.summary}`), how: here.how, kb: [here] };
  }
  if (/\b(sentinel|nayan|setu)\b|सेंटिनल|नयन|सेतु/.test(q) && (it.explain || !top || top.score < 7)) {
    const d = /nayan|नयन/.test(q) ? YUKT_KB.find((x) => x.id === "nayan-about") : /sentinel|सेंटिनल/.test(q) ? YUKT_KB.find((x) => x.id === "sentinel-about") : YUKT_KB[0];
    return { text: d.summary, kb: [d] };
  }
  if (!top) return null;
  if (!featureIntent && top.score < 6) return null;
  const d = top.doc;
  const others = results.slice(1).filter((r) => r.score >= top.score * 0.6).map((r) => r.doc);
  const canGo = d.app === "setu" && d.route && d.route !== "/login" && ctx.role !== "guest" && (!d.for || d.for.includes(ctx.role));
  const lead = d.app === "setu" ? "" : ykTr(lang, `${d.app === "nayan" ? "Nayan" : "Sentinel"} is a separate platform — `, `${d.app === "nayan" ? "नयन" : "Sentinel"} एक अलग प्लेटफ़ॉर्म है — `);
  return {
    text: `${lead}${it.how && d.how ? ykTr(lang, `${d.title}:`, `${d.hi}:`) : d.summary}`,
    how: it.how || d.how ? d.how : undefined,
    kb: [d, ...others.slice(0, 2)],
    nav: canGo && it.open && !it.explain && !it.how && top.score >= 6 ? d.route : undefined,
  };
}

/* ---------------------------------------- the AI backend's actions ------ */
function ykNormaliseAi(actions = [], ctx, lang) {
  const out = { proposals: [], nav: null, kb: [] };
  (actions || []).forEach((a) => {
    if (a.type === "navigate" && typeof a.to === "string" && a.to.startsWith("/")) out.nav = a.to;
    else if (a.type === "open_feature" && a.doc_id) {
      const d = YUKT_KB.find((x) => x.id === a.doc_id);
      if (d) out.kb.push(d);
    } else if (a.type === "raise_grievance" && ctx.role !== "guest") {
      const p = ykGrievanceProposal(a.description || a.subject || "", lang, { urgent: a.urgency === "high" });
      if (a.subject) p.payload.subject = ykSubject(a.subject);
      if (a.category && COMPLAINT_CATEGORIES.some((c) => c.key === a.category)) p.payload.category = a.category;
      p.sub = `${ykCatLabel(p.payload.category, lang)} · ${p.payload.subject}`;
      out.proposals.push(p);
    } else if (a.type === "request_call" && ctx.role === "beneficiary") {
      out.proposals.push({ type: "call", id: `c${Date.now()}`, title: ykTr(lang, "Request a verification call", "सत्यापन कॉल का अनुरोध"), sub: a.preferred_time || "Any time", payload: { preferred_time: a.preferred_time || "Any time", note: a.note || "Requested through Yukt" } });
    } else if (a.type === "request_scheme" && a.scheme_key && ctx.role === "beneficiary") {
      const s = (ctx.catalog || []).find((x) => x.key === a.scheme_key);
      if (s) out.proposals.push({ type: "scheme", id: `s${s.key}`, title: ykTr(lang, `Request enrolment: ${s.name}`, `नामांकन अनुरोध: ${s.hi || s.name}`), sub: s.amount ? `${rupees(s.amount)} ${s.period || ""}` : "", payload: { scheme_key: s.key } });
    } else if (a.type === "set_language" && LANGUAGES.some((l) => l.code === a.code)) {
      out.proposals.push({ type: "language", id: `l${a.code}`, title: ykTr(lang, `Change the portal language to ${langOf(a.code).name}`, `पोर्टल की भाषा ${langOf(a.code).native} करें`), sub: langOf(a.code).native, payload: { code: a.code } });
    } else if (a.type === "open_statement" && ctx.role === "beneficiary") {
      out.proposals.push({ type: "statement", id: "statement", title: ykTr(lang, "Open my benefit statement", "मेरा लाभ विवरण खोलें"), sub: ykTr(lang, "Print or save as PDF", "प्रिंट करें या PDF सहेजें") });
    }
  });
  return out;
}

/**
 * What the AI backend reasons over: the signed-in person's own record,
 * trimmed. It answers ONLY from this plus the retrieved knowledge entries —
 * the server's instructions forbid inventing figures.
 */
function ykSnapshot(ctx) {
  const base = { app: "setu", role: ctx.role, page: ctx.page, generated_at: new Date().toISOString() };
  if (ctx.role === "beneficiary" && ctx.p) {
    const p = ctx.p;
    return {
      ...base,
      beneficiary: { name: p.name, beneficiary_id: p.beneficiary_id, institute: p.institute_name || ctx.inst?.name, tags: p.tags },
      schemes: (p.schemes || []).map((s) => ({ key: s.key, name: s.name, status: s.status, amount: s.amount, period: s.period, next_date: s.next_date, next_amount: s.next_amount, next_step: s.next_step, delayed: s.delayed, last_payment: (s.disbursements || []).slice(-1)[0] || null })),
      documents: (p.documents || []).map((d) => ({ name: d.name, status: d.status, required: d.required })),
      grievances: (ctx.grievances || []).slice(0, 20).map((g) => ({ id: g.id, subject: g.subject, status: g.status, created_at: g.created_at })),
      next_call: ykNextCall(ctx.calls) || null,
      eligible_schemes: (ctx.catalog || []).filter((s) => (s.audience || []).every((t) => (p.tags || []).includes(t))).map((s) => ({ key: s.key, name: s.name })),
    };
  }
  if (ctx.role === "institute_staff") {
    return {
      ...base,
      institute: ctx.inst ? { id: ctx.inst.id, name: ctx.inst.name, compliance_score: ctx.inst.compliance_score, status: ctx.inst.status, renewal_status: ctx.inst.renewal_status } : null,
      open_findings: (ctx.findings || []).filter((f) => f.status === "open").map((f) => ({ id: f.id, type: f.type, severity: f.severity, created_at: f.created_at, detail: String(f.detail || "").slice(0, 200) })),
      residents: { total: (ctx.residents || []).length, needing_help: (ctx.residents || []).filter((r) => residentFlags(r).needsAction).map((r) => ({ name: r.name })) },
      open_grievances: (ctx.grievances || []).filter((g) => g.status !== "resolved").length,
    };
  }
  return base;
}

/* ------------------------------------------------------------ the brain -- */
async function askYuktSetu(raw, ctx, { chosenLang, history, status }) {
  const foreign = !YK_NATIVE.has(chosenLang);
  const canTranslate = foreign && status?.bhashini;
  let q = raw;
  let note = null;
  if (canTranslate) {
    try {
      const { data } = await api.post(API.assistant.translate(), { text: raw, source: chosenLang, target: "en" });
      q = data?.text || raw;
    } catch {
      note = "Translation failed — answering in English.";
    }
  } else if (foreign) {
    note = "Replies in this language need the server's translation service, which isn't connected yet — answering in English. (Hindi and English always work.)";
  }
  const lang = foreign ? "en" : chosenLang === "auto" ? ykLang(q) : chosenLang;

  let reply = null;
  let source = "local";
  // A grievance being described in answer to "what's the problem?"
  if (ctx.awaiting === "grievance") {
    if (YA.cancel.test(q.toLowerCase())) reply = { text: ykTr(lang, "Okay, I won't file anything.", "ठीक है, कुछ दर्ज नहीं करूँगा।") };
    else if (q.trim().length >= 6) reply = { text: ykTr(lang, "Here's the grievance I'll file. Please check and confirm:", "यह शिकायत दर्ज होगी। जाँचकर पुष्टि करें:"), proposals: [ykGrievanceProposal(ykGrievanceDetail(q) || q, lang, { urgent: YD.danger.test(q.toLowerCase()) })] };
  }
  if (!reply) reply = ykLocalAction(q, ctx, lang);
  const retrieved = ykRetrieve(q, ctx.role, 6);

  if (!reply && status?.llm) {
    try {
      const { data } = await api.post(API.assistant.chat(), {
        app: "setu",
        message: q,
        lang,
        history: history.slice(-8),
        page: ctx.page,
        role: ctx.role,
        doc_ids: retrieved.map((r) => r.doc.id),
        context: ykSnapshot(ctx),
      });
      const acts = ykNormaliseAi(data?.actions, ctx, lang);
      const srcDocs = (data?.sources || []).map((id) => YUKT_KB.find((d) => d.id === id)).filter(Boolean);
      if (data?.reply) {
        reply = { text: data.reply, items: data.items, proposals: acts.proposals.length ? acts.proposals : undefined, nav: acts.nav, kb: acts.kb.length ? acts.kb : srcDocs.slice(0, 3) };
        source = "ai";
      }
    } catch {
      reply = null;
    }
  }
  if (!reply) {
    const lower = q.toLowerCase();
    // "How do I…", "this page", "where is the X feature" → knowledge; "where is MY X" → the record.
    const personal = /\b(my|mera|meri|mere|mujhe|am i|i am)\b|मेरा|मेरी|मेरे|मुझे/.test(lower);
    const featureQ = YK_I.how.test(lower) || YK_I.page.test(lower) || ((YK_I.locate.test(lower) || YK_I.explain.test(lower)) && !personal);
    reply = (featureQ ? ykKnowledge(q, ctx, lang) : null) || ykData(q, ctx, lang) || ykKnowledge(q, ctx, lang);
    // "Open my documents" → answer AND take them there.
    if (reply && !reply.nav && /\b(open|go to|take me|kholo|khol do|le chalo)\b|खोलो|ले चलो/.test(lower)) {
      const k = ykKnowledge(q.replace(/\b(my|mera|meri|mere)\b|मेरा|मेरी|मेरे/gi, " "), ctx, lang);
      if (k?.nav) reply = { ...reply, nav: k.nav };
    }
  }
  if (!reply) {
    reply = retrieved.length && retrieved[0].score >= 4
      ? { text: ykTr(lang, "Here's what I found that matches:", "मिलती-जुलती जानकारी:"), kb: retrieved.slice(0, 3).map((r) => r.doc) }
      : { text: ykTr(lang, "I didn't catch that. You can ask about your payments, applications, documents, grievances or calls — or ask me to raise a grievance or request a call.", "मैं समझ नहीं पाया। आप भुगतान, आवेदन, दस्तावेज़, शिकायत या कॉल के बारे में पूछ सकते हैं — या शिकायत दर्ज करने / कॉल के लिए कह सकते हैं।"), suggest: true };
  }
  if (canTranslate && reply.text) {
    try {
      const { data } = await api.post(API.assistant.translate(), { text: reply.text, source: "en", target: chosenLang });
      if (data?.text) reply = { ...reply, text: data.text, original: reply.text };
    } catch {
      note = "The reply couldn't be translated, so it's in English.";
    }
  }
  return { ...reply, source, note, lang: canTranslate ? chosenLang : undefined, replyLang: lang };
}

/* -------------------------------------------------------- suggestions --- */
const YK_SUGGEST = {
  beneficiary: {
    "/": [["What needs my attention?", "मुझे क्या करना है?"], ["When is my next payment?", "अगला भुगतान कब आएगा?"], ["Where is my application?", "मेरा आवेदन कहाँ तक पहुँचा?"], ["Am I eligible for any scheme?", "मैं किन योजनाओं का पात्र हूँ?"], ["Show me around", "पोर्टल घुमाओ"]],
    "/benefits": [["When is my next payment?", "अगला भुगतान कब आएगा?"], ["Download my benefit statement", "मेरा लाभ विवरण दिखाओ"], ["Why is my application pending?", "मेरा आवेदन क्यों रुका है?"]],
    "/schemes": [["Which schemes am I eligible for?", "मैं किन योजनाओं का पात्र हूँ?"], ["Explain this page", "इस पेज को समझाओ"], ["How do I request enrolment?", "नामांकन कैसे करूँ?"]],
    "/my-documents": [["Which documents are pending?", "कौन-से दस्तावेज़ बाकी हैं?"], ["How do I submit a document?", "दस्तावेज़ कैसे जमा करूँ?"]],
    "/grievances": [["Status of my grievances", "मेरी शिकायतों की स्थिति"], ["Raise a grievance", "शिकायत दर्ज करनी है"], ["Who can see my grievance?", "मेरी शिकायत कौन देख सकता है?"]],
    "/grievance/new": [["Who can see my grievance?", "मेरी शिकायत कौन देख सकता है?"], ["Helpline numbers", "हेल्पलाइन नंबर"]],
    "/calls": [["When is my next call?", "अगली कॉल कब है?"], ["Request a call", "मुझे कॉल चाहिए"]],
    "/rights": [["What are my rights?", "मेरे अधिकार क्या हैं?"], ["Helpline numbers", "हेल्पलाइन नंबर"]],
    "/activity": [["What needs my attention?", "मुझे क्या करना है?"], ["Explain this page", "इस पेज को समझाओ"]],
    "*": [["What needs my attention?", "मुझे क्या करना है?"], ["When is my next payment?", "अगला भुगतान कब आएगा?"], ["Raise a grievance", "शिकायत दर्ज करनी है"], ["Helpline numbers", "हेल्पलाइन नंबर"], ["What is Nayan?", "नयन क्या है?"]],
  },
  institute_staff: {
    "/": [["Today's summary", "आज का सारांश"], ["Open findings", "खुले निष्कर्ष"], ["Residents needing help", "सहायता चाहने वाले निवासी"], ["Renewal status", "नवीनीकरण की स्थिति"]],
    "/findings": [["Open findings", "खुले निष्कर्ष"], ["How do I respond to a finding?", "निष्कर्ष का जवाब कैसे दूँ?"], ["What is my compliance score?", "मेरा अनुपालन स्कोर क्या है?"]],
    "/residents": [["Residents needing help", "सहायता चाहने वाले निवासी"], ["Explain this page", "इस पेज को समझाओ"]],
    "/renewal": [["Renewal status", "नवीनीकरण की स्थिति"], ["Explain this page", "इस पेज को समझाओ"]],
    "/documents": [["How do I upload for a resident?", "निवासी का दस्तावेज़ कैसे अपलोड करूँ?"], ["Documents uploaded", "अपलोड किए दस्तावेज़"]],
    "*": [["Today's summary", "आज का सारांश"], ["What is my compliance score?", "मेरा अनुपालन स्कोर क्या है?"], ["Raise a grievance", "शिकायत दर्ज करनी है"], ["What is Sentinel?", "Sentinel क्या है?"]],
  },
  guest: {
    "*": [["How do I sign in?", "साइन इन कैसे करें?"], ["Beneficiary or Institute — which one?", "लाभार्थी या संस्था — कौन-सा चुनूँ?"], ["I don't have an account", "मेरा खाता नहीं है"], ["Show test accounts", "परीक्षण खाते दिखाओ"], ["Helpline numbers", "हेल्पलाइन नंबर"]],
  },
};
function ykSuggestionsFor(role, path, lang) {
  const set = YK_SUGGEST[role] || YK_SUGGEST.guest;
  const list = set[path] || Object.entries(set).find(([k]) => k !== "/" && k !== "*" && path?.startsWith(k))?.[1] || set["*"] || set["/"];
  return list.map(([en, hi]) => (lang === "hi" ? hi : en));
}

/* ------------------------------------------------------------ voice ----- */
function ykEncodeWav(samples, rate) {
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
function ykBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** Records from the mic and hands back 16 kHz mono WAV — what Bhashini ASR takes. */
async function ykRecordWav() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((resolve, reject) => {
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      try {
        const rawBuf = await new Blob(chunks).arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ac = new Ctx();
        const decoded = await ac.decodeAudioData(rawBuf);
        const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
        const src = off.createBufferSource();
        src.buffer = decoded;
        src.connect(off.destination);
        src.start();
        const rendered = await off.startRendering();
        ac.close();
        resolve(ykEncodeWav(rendered.getChannelData(0), 16000));
      } catch (err) {
        reject(err);
      }
    };
  });
  rec.start();
  return { stop: () => rec.state !== "inactive" && rec.stop(), done };
}

/* --------------------------------------------------------------- UI ----- */
function YuktOrb({ size = 44 }) {
  return (
    <span className="yk-orb" style={{ width: size, height: size }} aria-hidden="true">
      <span className="yk-orb-ring" />
      <span className="yk-orb-core">
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <path d="M12 2.8l1.9 5.3 5.3 1.9-5.3 1.9L12 17.2l-1.9-5.3L4.8 10l5.3-1.9z" fill="url(#yk-g)" />
          <circle cx="18.6" cy="17.6" r="1.7" fill="#138808" />
          <circle cx="5.6" cy="18.8" r="1.1" fill="#FF9933" />
          <defs>
            <linearGradient id="yk-g" x1="4" y1="3" x2="20" y2="17">
              <stop offset="0" stopColor="#FF9933" />
              <stop offset="1" stopColor="var(--pri-8)" />
            </linearGradient>
          </defs>
        </svg>
      </span>
    </span>
  );
}

function YkHighlight({ text, q }) {
  const needle = String(q || "").trim().split(/\s+/).pop()?.toLowerCase();
  if (!needle) return text;
  const i = text.toLowerCase().indexOf(needle);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="yk-mark">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

function YuktFeatureCard({ doc, role, onOpen, lang }) {
  const canGo = doc.app === "setu" && doc.route && doc.route !== "/login" && role !== "guest" && (!doc.for || doc.for.includes(role));
  return (
    <div className="yk-card flex-col !gap-1">
      <div className="flex w-full items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 truncate text-[0.8rem] font-semibold" style={{ color: C.ink }}>{lang === "hi" ? doc.hi : doc.title}</p>
          <p className="st-hi m-0 truncate text-[0.7rem]" style={{ color: C.muted }}>{lang === "hi" ? doc.title : doc.hi}</p>
        </div>
        <span className={`yk-app ${doc.app}`}>{doc.app === "setu" ? "Setu" : doc.app === "nayan" ? "Nayan" : "Sentinel"}</span>
      </div>
      <p className="m-0 text-[0.7667rem] leading-snug" style={{ color: C.muted, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{doc.summary}</p>
      {canGo && (
        <button type="button" onClick={() => onOpen(doc.route)} className="yk-chip is-go mt-1 self-start !py-1 !text-[0.7667rem]">
          {ykTr(lang, `Open ${doc.title}`, `${doc.hi} खोलें`)} →
        </button>
      )}
      {doc.app === "nayan" && doc.route && role !== "guest" && (
        <button type="button" onClick={() => onOpen(doc.route)} className="yk-chip mt-1 self-start !py-1 !text-[0.7667rem]">
          {ykTr(lang, "Know about Nayan", "नयन के बारे में")} →
        </button>
      )}
    </div>
  );
}

/**
 * Yukt, for Setu. Rendered by the Shell (signed in) and by the sign-in page
 * (guest). Its conversation lives only in memory: signing out unmounts it,
 * so the next person starts fresh.
 */
function Yukt() {
  const { user, logout } = useAuth();
  const { prefs, setPrefs } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role || "guest";
  const isB = role === ROLES.BENEFICIARY;
  const isS = role === ROLES.STAFF;
  const instId = user?.institute_id;

  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [chosenLang, setChosenLang] = useState(() => {
    try {
      return localStorage.getItem("setu.yuktLang") || ykFromPortalLang(prefs.language);
    } catch {
      return ykFromPortalLang(prefs.language);
    }
  });
  const [detected, setDetected] = useState(prefs.language === "hi" && prefs.order === "local" ? "hi" : "en");
  const [status, setStatus] = useState(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(null);
  const [busyProposal, setBusyProposal] = useState(null);
  const [awaiting, setAwaiting] = useState(null);
  const [sel, setSel] = useState(-1);
  const [acOff, setAcOff] = useState(false);
  const uiLang = chosenLang === "auto" ? detected : YK_NATIVE.has(chosenLang) ? chosenLang : "en";
  const langMeta = YUKT_LANGS.find((l) => l.code === chosenLang) || YUKT_LANGS[0];
  const first = ykFirst(user?.name);

  const greeting = useCallback(
    (lang) =>
      role === "guest"
        ? ykTr(lang, "Namaste! I'm Yukt, Setu's assistant. I can help you sign in, pick the right portal, or find a helpline. Ask in Hindi, English or Hinglish — or pick one of 22 Indian languages above.", "नमस्ते! मैं युक्त हूँ, Setu का सहायक। साइन इन, सही पोर्टल चुनने या हेल्पलाइन ढूँढने में मदद कर सकता हूँ। हिंदी, English या Hinglish में पूछें — या ऊपर 22 भारतीय भाषाओं में से चुनें।")
        : isS
        ? ykTr(lang, `Namaste ${first}! I'm Yukt. Ask me about your compliance, findings, residents, renewal or documents — or ask me to raise a grievance. I always ask before doing anything.`, `नमस्ते ${first}! मैं युक्त हूँ। अनुपालन, निष्कर्ष, निवासी, नवीनीकरण या दस्तावेज़ के बारे में पूछें — या शिकायत दर्ज करवाएँ। कुछ भी करने से पहले मैं आपसे पूछता हूँ।`)
        : ykTr(lang, `Namaste ${first}! I'm Yukt, your Setu assistant. Ask about your payments, applications, documents, grievances or calls — or ask me to raise a grievance or request a call. I always ask before doing anything.`, `नमस्ते ${first}! मैं युक्त हूँ, आपका Setu सहायक। भुगतान, आवेदन, दस्तावेज़, शिकायत या कॉल के बारे में पूछें — या शिकायत दर्ज / कॉल का अनुरोध करवाएँ। कुछ भी करने से पहले मैं आपसे पूछता हूँ।`),
    [role, isS, first]
  );
  const [messages, setMessages] = useState(() => [{ role: "bot", text: greeting(prefs.language === "hi" && prefs.order === "local" ? "hi" : "en"), suggest: true }]);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const recRef = useRef(null);
  const audioRef = useRef(null);

  // The person's own data — fetched only once Yukt is opened.
  const need = open && role !== "guest";
  const profile = useApi(isB ? API.beneficiary.me() : null, { optional: true, skip: !(need && isB) });
  const inst = useApi(instId ? API.institutes.detail(instId) : null, { optional: true, skip: !(need && instId) });
  const grievances = useApi(API.grievances.list(), { fallback: [], optional: true, skip: !need });
  const calls = useApi(isB ? API.calls.mine() : null, { fallback: [], optional: true, skip: !(need && isB) });
  const notices = useApi(API.notices.list(), { fallback: [], optional: true, skip: !need });
  const catalog = useApi(isB ? API.schemes.catalog() : null, { fallback: [], optional: true, skip: !(need && isB) });
  const findings = useApi(isS && instId ? API.institutes.alerts(instId) : null, { fallback: [], optional: true, skip: !(need && isS) });
  const residents = useApi(isS && instId ? API.institutes.residents(instId) : null, { fallback: [], optional: true, skip: !(need && isS) });
  const docs = useApi(isS && instId ? API.institutes.documents(instId) : null, { fallback: [], optional: true, skip: !(need && isS) });
  const sources = [profile, inst, grievances, calls, notices, catalog, findings, residents, docs];
  const loadingRef = useRef(false);
  loadingRef.current = sources.some((s) => s.loading);

  const ctx = {
    role,
    user,
    p: profile.data,
    inst: inst.data,
    grievances: grievances.data || [],
    calls: calls.data || [],
    notices: notices.data || [],
    catalog: catalog.data || [],
    findings: findings.data || [],
    residents: residents.data || [],
    documents: docs.data || [],
    page: location.pathname,
    awaiting,
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const sugs = useMemo(() => {
    const v = input.trim();
    if (!v || acOff || listening || v.split(/\s+/).length > 4) return [];
    return ykSuggest(v, role, 6);
  }, [input, acOff, listening, role]);
  useEffect(() => setAcOff(false), [input]);

  useEffect(() => {
    try {
      localStorage.setItem("setu.yuktLang", chosenLang);
    } catch {
      /* private window */
    }
  }, [chosenLang]);

  // What the server offers. No route (or no backend) = the local engines.
  useEffect(() => {
    if (!open || status) return;
    api
      .get(API.assistant.status())
      .then(({ data }) => setStatus({ llm: Boolean(data?.llm), bhashini: Boolean(data?.bhashini) }))
      .catch(() => setStatus({ llm: false, bhashini: false, local: true }));
  }, [open, status]);

  // Anything can open Yukt with this event (the Help page, a shortcut…).
  useEffect(() => {
    const on = (e) => {
      setOpen(true);
      if (e?.detail?.ask) setTimeout(() => send(e.detail.ask), 250);
    };
    window.addEventListener("setu:yukt", on);
    return () => window.removeEventListener("setu:yukt", on);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // A greeting bubble once per session, so the button explains itself.
  useEffect(() => {
    let greeted = false;
    try {
      greeted = sessionStorage.getItem("setu.yuktGreeted") === "1";
    } catch {
      /* private window */
    }
    if (greeted) return undefined;
    const show = setTimeout(() => {
      if (document.querySelector(".st-tour-card")) return; // the tour is speaking; greet another time
      setTeaser(true);
      try {
        sessionStorage.setItem("setu.yuktGreeted", "1");
      } catch {
        /* private window */
      }
    }, 2200);
    const hide = setTimeout(() => setTeaser(false), 12000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTeaser(false);
      setTimeout(() => inputRef.current?.focus(), 120);
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

  const push = (m) => setMessages((list) => [...list, m]);

  function applyReply(reply) {
    if (reply.a11y) window.dispatchEvent(new CustomEvent("setu:a11y", { detail: reply.a11y }));
    if (reply.portal) window.dispatchEvent(new CustomEvent("setu:portal", { detail: reply.portal }));
    if (reply.nav) setTimeout(() => navigate(reply.nav), 450);
    if (reply.tour) {
      setTimeout(() => {
        setOpen(false);
        window.dispatchEvent(new CustomEvent("setu:tour"));
      }, 700);
    }
    setAwaiting(reply.awaiting || null);
  }

  async function send(text) {
    const q = String(text ?? input).trim();
    if (!q || typing) return;
    setInput("");
    setSel(-1);
    if (chosenLang === "auto") setDetected(ykLang(q));
    const history = messages.filter((m) => m.text).map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.original || m.text }));
    push({ role: "user", text: q });
    setTyping(true);
    // Let the person's data finish loading (first question after opening).
    for (let i = 0; i < 40 && loadingRef.current; i++) await ykSleep(100);
    let reply;
    try {
      reply = await askYuktSetu(q, ctxRef.current, { chosenLang, history, status });
    } catch {
      reply = { text: ykTr(uiLang, "Something went wrong on my side — please try again.", "मेरी तरफ़ कुछ गड़बड़ हुई — कृपया फिर से पूछें।") };
    }
    await ykSleep(300 + Math.min(500, (reply.text?.length || 0) * 2.5));
    setTyping(false);
    setMessages((list) => {
      const lastNote = [...list].reverse().find((x) => x.role === "bot" && x.note)?.note;
      return [...list, { role: "bot", ...reply, note: reply.note && reply.note === lastNote ? null : reply.note }];
    });
    applyReply(reply);
  }

  function pickSuggestion(s) {
    setSel(-1);
    setInput("");
    const lng = uiLang === "hi" ? "hi" : "en";
    push({ role: "user", text: s.label });
    push({ role: "bot", text: s.doc.summary, kb: [s.doc], how: s.doc.how, replyLang: lng });
  }

  const markDone = (i, p, state) => setMessages((m) => m.map((x, k) => (k === i ? { ...x, done: { ...(x.done || {}), [p.id]: state } } : x)));

  async function confirmProposal(i, p) {
    const lang = messages[i]?.replyLang || uiLang;
    const c = ctxRef.current;
    // No await before these two: printing and signing out must stay in the click.
    if (p.type === "statement") {
      if (!c.p) {
        push({ role: "bot", text: ykTr(lang, "Your record is still loading — try again in a moment.", "आपका रिकॉर्ड लोड हो रहा है — थोड़ी देर में फिर कोशिश करें।") });
        return;
      }
      printStatement(c.p, c.inst);
      markDone(i, p, "ok");
      push({ role: "bot", text: ykTr(lang, "Your statement is open in a new window. Choose \"Save as PDF\" there to keep a copy.", "आपका विवरण नई विंडो में खुला है। कॉपी रखने के लिए वहाँ \"Save as PDF\" चुनें।") });
      return;
    }
    if (p.type === "logout") {
      markDone(i, p, "ok");
      logout();
      navigate("/login", { replace: true });
      return;
    }
    if (p.type === "language") {
      const code = p.payload.code;
      setPrefs({ language: code, order: code === "en" ? "en" : "local" });
      if (code === "hi" || code === "en") setChosenLang("auto");
      else setChosenLang(ykFromPortalLang(code));
      setDetected(code === "hi" ? "hi" : "en");
      markDone(i, p, "ok");
      push({ role: "bot", text: ykTr(code === "hi" ? "hi" : "en", `Done — Setu is now in ${langOf(code).name}.`, `हो गया — Setu अब ${langOf(code).native} में है।`) });
      return;
    }
    setBusyProposal(`${i}-${p.id}`);
    try {
      let follow;
      if (p.type === "grievance") {
        const { data } = await api.post(API.grievances.create(), { institute_id: user?.institute_id, ...p.payload, details: p.payload.description });
        follow = {
          text: ykTr(lang, `Done — your grievance is filed.${data?.id ? ` Reference: ${data.id}.` : ""} It goes to the District Social Welfare Officer, and Sentinel keeps it on a deadline until it's resolved.${p.payload.urgency === "high" ? " Because it's urgent, it is escalated straight away." : ""}`, `हो गया — आपकी शिकायत दर्ज है।${data?.id ? ` संदर्भ: ${data.id}।` : ""} यह ज़िला समाज कल्याण अधिकारी के पास जाती है, और Sentinel इसे हल होने तक समय-सीमा पर रखता है।${p.payload.urgency === "high" ? " तत्काल होने के कारण इसे तुरंत आगे भेजा गया है।" : ""}`),
          actions: [{ label: ykTr(lang, "Track it", "ट्रैक करें"), to: "/grievances" }],
        };
      } else if (p.type === "call") {
        await api.post(API.calls.request(), p.payload);
        follow = { text: ykTr(lang, "Request sent. An official will call you — usually within 2 working days.", "अनुरोध भेजा गया। एक अधिकारी आपको कॉल करेंगे — आमतौर पर 2 कार्यदिवसों में।"), actions: [{ label: ykTr(lang, "Verification calls", "सत्यापन कॉल"), to: "/calls" }] };
      } else if (p.type === "scheme") {
        await api.post(API.schemes.request(), p.payload);
        follow = { text: ykTr(lang, "Request sent. Your institute office will complete the application with you — it now shows under Benefits & applications.", "अनुरोध भेजा गया। संस्था कार्यालय आपके साथ आवेदन पूरा करेगा — यह अब लाभ व आवेदन में दिखेगा।"), actions: [{ label: ykTr(lang, "Benefits & applications", "लाभ व आवेदन"), to: "/benefits" }] };
      }
      markDone(i, p, "ok");
      if (follow) push({ role: "bot", ...follow });
      toast.success(p.title);
      window.dispatchEvent(new CustomEvent("setu:refresh"));
    } catch (err) {
      const msg = isMissing(err) ? ykTr(lang, "this isn't connected on the server yet", "यह सर्वर पर अभी जुड़ा नहीं है") : errorMessage(err, "That didn't go through");
      push({ role: "bot", text: ykTr(lang, `Couldn't do that: ${msg}.`, `यह नहीं हो पाया: ${msg}।`) });
    } finally {
      setBusyProposal(null);
    }
  }

  /* voice in */
  const SpeechRec = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const canBhashiniAsr = status?.bhashini && typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia;
  const useBrowserAsr = SpeechRec && (YK_NATIVE.has(chosenLang) || !canBhashiniAsr);
  const micAvailable = Boolean(useBrowserAsr || canBhashiniAsr);
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
    try {
      const session = await ykRecordWav();
      recRef.current = session;
      setListening(true);
      const auto = setTimeout(() => session.stop(), 8000);
      const wav = await session.done;
      clearTimeout(auto);
      setListening(false);
      const { data } = await api.post(API.assistant.asr(), { audio_base64: ykBase64(wav), lang: chosenLang, sample_rate: 16000 });
      if (data?.text) send(data.text);
    } catch {
      setListening(false);
      toast.error("Couldn't use the microphone");
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
    const code = m.lang || (chosenLang === "auto" ? m.replyLang || detected : chosenLang);
    setSpeaking(i);
    if (status?.bhashini && !YK_NATIVE.has(code)) {
      try {
        const { data } = await api.post(API.assistant.tts(), { text: m.text, lang: code });
        const audio = new Audio(`data:${data.mime || "audio/wav"};base64,${data.audio_base64}`);
        audioRef.current = audio;
        audio.onended = () => setSpeaking(null);
        await audio.play();
        return;
      } catch {
        /* the browser's voice instead */
      }
    }
    if (!window.speechSynthesis) {
      setSpeaking(null);
      return;
    }
    const u = new SpeechSynthesisUtterance(m.text);
    u.lang = (YUKT_LANGS.find((l) => l.code === code) || YUKT_LANGS[1]).speech;
    u.rate = 0.96;
    u.onend = () => setSpeaking(null);
    u.onerror = () => setSpeaking(null);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function clearChat() {
    setAwaiting(null);
    setMessages([{ role: "bot", text: ykTr(uiLang, "Fresh start. What would you like to know?", "नई शुरुआत। क्या जानना चाहेंगे?"), suggest: true }]);
  }

  const modeLabel = !status ? ykTr(uiLang, "connecting…", "जुड़ रहा है…") : status.llm ? `Assistant · online${status.bhashini ? " · 22 languages" : ""}` : ykTr(uiLang, role === "guest" ? "Help mode" : "From your record", role === "guest" ? "सहायता मोड" : "आपके रिकॉर्ड से");
  const contextLine = role === "guest" ? ykTr(uiLang, "Sign-in help", "साइन-इन सहायता") : isS ? `${ykTr(uiLang, "Institute portal", "संस्था पोर्टल")}${inst.data?.name ? ` · ${inst.data.name}` : ""}` : `${ykTr(uiLang, "Beneficiary portal", "लाभार्थी पोर्टल")}${user?.name ? ` · ${user.name}` : ""}`;
  const chips = ykSuggestionsFor(role, location.pathname, uiLang);
  const teaserText =
    role === "guest"
      ? ykTr(uiLang, "Namaste! Need help signing in? Ask Yukt", "नमस्ते! साइन इन में मदद चाहिए? युक्त से पूछें")
      : isS
      ? ykTr(uiLang, `Namaste ${first}! Ask me about findings, residents or renewal`, `नमस्ते ${first}! निष्कर्ष, निवासी या नवीनीकरण के बारे में पूछें`)
      : ykTr(uiLang, `Namaste ${first}! Ask me "when is my next payment?"`, `नमस्ते ${first}! पूछिए — "मेरा अगला भुगतान कब है?"`);

  return (
    <>
      <style>{YUKT_CSS}</style>
      {open && (
        <section className="yk-panel" role="dialog" aria-label="Yukt assistant">
          <header className="yk-head">
            <YuktOrb size={38} />
            <div className="min-w-0 flex-1">
              <p className="m-0 flex items-baseline gap-2 text-[0.9333rem] font-semibold leading-tight text-white">
                Yukt <span className="st-hi text-[0.8333rem] font-medium" style={{ color: "#FFD7A8" }}>युक्त</span>
              </p>
              <p className="m-0 flex items-center gap-1.5 text-[0.7333rem]" style={{ color: "rgba(255,255,255,.72)" }}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: status?.llm ? "#4ADE80" : "#FFB35C" }} aria-hidden="true" />
                <span className="truncate">{modeLabel}</span>
              </p>
            </div>
            <label className="sr-only" htmlFor="yk-lang">Reply language</label>
            <select id="yk-lang" value={chosenLang} onChange={(e) => setChosenLang(e.target.value)} className="yk-lang" title="Language · भाषा">
              {YUKT_LANGS.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            <button type="button" onClick={clearChat} className="yk-iconbtn" title={ykTr(uiLang, "New chat", "नई बातचीत")} aria-label="New chat">
              <Icon name="refresh" size={16} />
            </button>
            <button type="button" onClick={() => setOpen(false)} className="yk-iconbtn" aria-label="Close Yukt">
              <Icon name="x" size={16} />
            </button>
          </header>
          <div className="st-tricolour" style={{ height: 3 }} />
          <div className="yk-context">
            <Icon name={role === "guest" ? "lock" : isS ? "building" : "user"} size={13} />
            <span className="truncate">{contextLine}</span>
          </div>

          <div ref={listRef} className="yk-list" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`yk-msg ${m.role === "user" ? "is-user" : "is-bot"}`}>
                {m.role === "bot" && <YuktOrb size={26} />}
                <div className="min-w-0 max-w-[86%]">
                  <div className="yk-bubble" dir={m.lang && YK_RTL.has(m.lang) ? "rtl" : undefined}>{m.text}</div>
                  {m.role === "bot" && m.text && (
                    <div className="yk-meta">
                      {m.source === "ai" && <span className="inline-flex items-center gap-1"><Icon name="info" size={11} /> {ykTr(uiLang, "Answer, from your record", "उत्तर, आपके रिकॉर्ड से")}</span>}
                      {m.note && <span>{m.note}</span>}
                      <button type="button" onClick={() => speak(i, m)} aria-label={speaking === i ? "Stop reading" : "Read aloud"}>
                        <span className="inline-flex items-center gap-1"><Icon name={speaking === i ? "stop" : "volume"} size={12} /> {speaking === i ? ykTr(uiLang, "Stop", "रोकें") : ykTr(uiLang, "Listen", "सुनें")}</span>
                      </button>
                    </div>
                  )}
                  {m.items?.length > 0 && (
                    <ul className="m-0 mt-1.5 space-y-1 p-0" style={{ listStyle: "none" }}>
                      {m.items.map((it, j) => {
                        const inner = (
                          <>
                            <span className="yk-dot" style={{ background: toneColor(it.tone) }} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[0.8rem] font-semibold leading-snug" style={{ color: C.ink }}>{it.title}</span>
                              {it.sub && <span className="block text-[0.7667rem] leading-snug" style={{ color: C.muted }}>{it.sub}</span>}
                            </span>
                          </>
                        );
                        return (
                          <li key={j}>
                            {it.href ? <a href={it.href} className="yk-card">{inner}</a> : it.to ? <Link to={it.to} className="yk-card">{inner}</Link> : <div className="yk-card">{inner}</div>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {m.after && <p className="m-0 mt-1.5 pl-1 text-[0.8rem] leading-snug" style={{ color: C.ink2 }}>{m.after}</p>}
                  {m.how?.length > 0 && (
                    <ol className="yk-how">
                      {m.how.map((s) => <li key={s}>{s}</li>)}
                    </ol>
                  )}
                  {m.kb?.length > 0 && (
                    <div className="mt-1.5 space-y-1.5">
                      {m.kb.map((d) => <YuktFeatureCard key={d.id} doc={d} role={role} lang={m.replyLang === "hi" ? "hi" : "en"} onOpen={(to) => navigate(to)} />)}
                    </div>
                  )}
                  {m.proposals?.length > 0 && (
                    <ul className="m-0 mt-1.5 space-y-1.5 p-0" style={{ listStyle: "none" }}>
                      {m.proposals.map((p) => {
                        const state = m.done?.[p.id];
                        const busy = busyProposal === `${i}-${p.id}`;
                        return (
                          <li key={p.id} className="yk-confirm">
                            <p className="m-0 text-[0.8333rem] font-semibold" style={{ color: C.ink }}>{p.title}</p>
                            {p.sub && <p className="m-0 mt-0.5 text-[0.8rem] leading-snug" style={{ color: C.ink2 }}>{p.sub}</p>}
                            {p.note && <p className="m-0 mt-1 flex items-center gap-1 text-[0.7333rem]" style={{ color: C.muted }}><Icon name="lock" size={11} /> {p.note}</p>}
                            {state === "ok" ? (
                              <p className="m-0 mt-2 flex items-center gap-1 text-[0.8rem] font-semibold" style={{ color: "#16874F" }}><Icon name="check" size={13} /> {ykTr(m.replyLang, "Done", "हो गया")}</p>
                            ) : state === "cancelled" ? (
                              <p className="m-0 mt-2 text-[0.8rem]" style={{ color: C.muted }}>{ykTr(m.replyLang, "Cancelled", "रद्द")}</p>
                            ) : (
                              <div className="mt-2 flex gap-1.5">
                                <button type="button" className="yk-ok" disabled={busy} onClick={() => confirmProposal(i, p)}>
                                  {busy ? "…" : "Confirm · पुष्टि"}
                                </button>
                                <button type="button" className="yk-chip" onClick={() => markDone(i, p, "cancelled")}>
                                  {ykTr(m.replyLang, "Cancel", "रद्द करें")}
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {m.openPrefs && (
                    <div className="mt-1.5">
                      <button type="button" className="yk-chip is-go" onClick={() => window.dispatchEvent(new CustomEvent("setu:open-prefs"))}>
                        <Icon name="globe" size={13} /> {ykTr(m.replyLang, "Language & state", "भाषा व राज्य")}
                      </button>
                    </div>
                  )}
                  {(m.actions?.length > 0 || m.chips?.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(m.actions || []).map((a) => (
                        <Link key={a.to + a.label} to={a.to} className="yk-chip is-go">{a.label} →</Link>
                      ))}
                      {(m.chips || []).map((s) => (
                        <button key={s} type="button" className="yk-chip" onClick={() => send(s)}>{s}</button>
                      ))}
                    </div>
                  )}
                  {m.suggest && i === messages.length - 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {chips.map((s) => (
                        <button key={s} type="button" className={`yk-chip ${uiLang === "hi" ? "st-hi" : ""}`} onClick={() => send(s)}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="yk-msg is-bot">
                <YuktOrb size={26} />
                <div className="yk-bubble yk-typing" aria-label="Yukt is typing"><i /><i /><i /></div>
              </div>
            )}
          </div>

          <div className="relative pt-2">
            {sugs.length > 0 && (
              <ul role="listbox" id="yk-suggest" aria-label="Suggestions" className="yk-ac m-0 p-0" style={{ listStyle: "none" }}>
                <li className="px-3 pb-1 pt-2 text-[0.6333rem] font-semibold uppercase tracking-[0.14em]" style={{ color: C.muted }}>{ykTr(uiLang, "Suggestions", "सुझाव")}</li>
                {sugs.map((s, i) => (
                  <li key={s.doc.id} role="option" aria-selected={i === sel}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSuggestion(s)} className={`yk-ac-item ${i === sel ? "is-on" : ""}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8rem] font-medium"><YkHighlight text={s.label} q={input} /></span>
                        <span className="block truncate text-[0.7rem]" style={{ color: C.muted }}>
                          {s.label !== s.doc.title ? `${s.doc.title} · ` : ""}
                          <span className="st-hi">{s.doc.hi}</span>
                        </span>
                      </span>
                      <span className={`yk-app ${s.doc.app}`}>{s.doc.app === "setu" ? "Setu" : s.doc.app === "nayan" ? "Nayan" : "Sentinel"}</span>
                    </button>
                  </li>
                ))}
                <li className="px-3 pb-2 pt-1 text-[0.6333rem]" style={{ color: C.muted }}>↑↓ · Enter · Esc</li>
              </ul>
            )}
            <form
              className="yk-input"
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
                    e.nativeEvent?.stopImmediatePropagation?.();
                    setAcOff(true);
                  }
                }}
                placeholder={listening ? "Listening… · सुन रहा हूँ…" : awaiting === "grievance" ? ykTr(uiLang, "Describe the problem…", "समस्या बताइए…") : ykTr(uiLang, "Ask Yukt…", "युक्त से पूछें…")}
                aria-label="Ask Yukt"
                aria-autocomplete="list"
                aria-controls="yk-suggest"
                aria-expanded={sugs.length > 0}
                className="st-hi"
                dir={YK_RTL.has(chosenLang) ? "rtl" : undefined}
              />
              {micAvailable && (
                <button type="button" onClick={toggleMic} className={`yk-iconbtn is-dark ${listening ? "is-live" : ""}`} aria-label={listening ? "Stop listening" : "Speak"} title={`${ykTr(uiLang, "Speak", "बोलें")} (${langMeta.name})`}>
                  <Icon name="mic" size={17} />
                </button>
              )}
              <button type="submit" className="yk-send" disabled={!input.trim() || typing} aria-label="Send">
                <Icon name="send" size={16} />
              </button>
            </form>
          </div>
          <p className="yk-foot">
            {role === "guest"
              ? ykTr(uiLang, "Yukt knows Setu, Sentinel and Nayan. It never asks for your password.", "युक्त Setu, Sentinel और Nayan को जानता है। यह कभी आपका पासवर्ड नहीं माँगता।")
              : ykTr(uiLang, "Yukt answers from your own record. It always asks before doing anything.", "युक्त आपके अपने रिकॉर्ड से उत्तर देता है। कुछ भी करने से पहले हमेशा पूछता है।")}
          </p>
        </section>
      )}

      {teaser && !open && (
        <button type="button" className="yk-teaser st-hi" onClick={() => setOpen(true)}>
          {teaserText}
        </button>
      )}

      <button type="button" data-tour="yukt" onClick={() => setOpen((v) => !v)} className={`yk-fab ${open ? "is-open" : ""}`} aria-label={open ? "Close Yukt" : "Ask Yukt"} aria-expanded={open}>
        <span className="yk-pulse" aria-hidden="true" />
        <YuktOrb size={48} />
        <span className="yk-fab-label">
          <span className="block text-[0.8333rem] font-semibold leading-tight">Yukt</span>
          <span className="st-hi block text-[0.7rem] leading-tight opacity-85">युक्त से पूछें</span>
        </span>
      </button>
    </>
  );
}

/* ---------------------------------------------------------- guided tour -- */
/**
 * A short walk through the Overview: each step spotlights one part of the
 * page and explains it in plain language. It opens by itself once per
 * sign-in (unless switched off on this device), and again from "Guided tour"
 * on the Overview, the account menu, or by asking Yukt ("show me around").
 * The first step says plainly when the portal is showing sample data.
 */
const TOUR_CSS = `
.st-tour-block { position: fixed; inset: 0; z-index: 190; }
.st-tour-spot { position: fixed; z-index: 191; border-radius: 12px; pointer-events: none; box-shadow: 0 0 0 9999px rgba(8,22,16,.58); outline: 2px solid #fff; outline-offset: 0; transition: top .3s var(--ease), left .3s var(--ease), width .3s var(--ease), height .3s var(--ease); }
.st-tour-dim { position: fixed; inset: 0; z-index: 191; background: rgba(8,22,16,.58); pointer-events: none; }
.st-tour-card { position: fixed; z-index: 192; width: min(340px, calc(100vw - 24px)); background: var(--surface); border-radius: 12px; border: 1px solid var(--line); box-shadow: 0 24px 60px -18px rgba(0,0,0,.5); padding: 14px 16px 12px; animation: st-in .2s var(--ease) both; }
.st-tour-dots { display: flex; gap: 4px; }
.st-tour-dots i { width: 6px; height: 6px; border-radius: 9999px; background: #D5DDD9; }
.st-tour-dots i.is-on { background: var(--pri); width: 16px; }
`;

function tourSteps(isStaff, demo) {
  const demoLine = demo
    ? ["You are viewing a sample record (mock data created for this demo, not a live record). Every name, payment and grievance here is illustrative, so you can explore freely — nothing affects real records.", "आप एक नमूना रिकॉर्ड (इस डेमो के लिए बनाया गया मॉक डेटा, कोई वास्तविक रिकॉर्ड नहीं) देख रहे हैं। यहाँ हर नाम, भुगतान और शिकायत उदाहरण है, इसलिए निःसंकोच देखें — किसी वास्तविक रिकॉर्ड पर असर नहीं होगा।"]
    : ["This is your own record, kept by the Ministry.", "यह मंत्रालय द्वारा रखा गया आपका अपना रिकॉर्ड है।"];
  const shared = [
    { target: "notices", title: ["Notice board · सूचना पट्ट", "सूचना पट्ट"], body: ["It never stops working for you: what's new on your record — payments, documents, grievances, calls, notices — with short tips in between. Click any notice to open it; point at the board or press pause to stop it.", "यह लगातार आपके लिए काम करता है: आपके रिकॉर्ड में नया क्या है — भुगतान, दस्तावेज़, शिकायतें, कॉल, सूचनाएँ — बीच-बीच में उपयोगी सुझाव। किसी भी सूचना पर क्लिक करें; रोकने के लिए माउस रखें या पॉज़ दबाएँ।"] },
    { target: "prefs", title: ["Language, text size, dark mode", "भाषा, अक्षर आकार, डार्क मोड"], body: ["Switch between English + हिन्दी, English only or 22 Indian languages, change your State, enlarge the text with A−, A, A+, and turn on dark mode or high contrast.", "English + हिन्दी, केवल English या 22 भारतीय भाषाओं में बदलें, राज्य बदलें, A−, A, A+ से अक्षर बड़े करें, और डार्क मोड या हाई कंट्रास्ट चालू करें।"] },
    { target: "yukt", title: ["Yukt — your assistant", "युक्त — आपका सहायक"], body: [isStaff ? "Ask in Hindi, English or your language — for example \"Which residents need help?\". Yukt answers from your institute's record and asks before doing anything." : "Ask in Hindi, English or your language — for example \"When is my next payment?\". Yukt can also raise a grievance or request a call, always after you confirm.", isStaff ? "हिंदी, English या अपनी भाषा में पूछें — जैसे \"किन निवासियों को सहायता चाहिए?\"। युक्त आपकी संस्था के रिकॉर्ड से उत्तर देता है और कुछ भी करने से पहले पूछता है।" : "हिंदी, English या अपनी भाषा में पूछें — जैसे \"मेरा अगला भुगतान कब है?\"। युक्त शिकायत दर्ज या कॉल का अनुरोध भी कर सकता है — हमेशा आपकी पुष्टि के बाद।"] },
  ];
  if (isStaff)
    return [
      { title: ["Welcome to the Institute portal", "संस्था पोर्टल में आपका स्वागत है"], body: ["This one-minute tour shows where everything is. " + demoLine[0], "यह एक मिनट का भ्रमण बताता है कि क्या कहाँ है। " + demoLine[1]] },
      { target: "nav", title: ["Main menu", "मुख्य मेनू"], body: ["Overview and Residents, then Compliance — findings, renewal, institute profile — then Documents, Grievances and Notices. The small arrow on the menu's edge collapses it for more room.", "अवलोकन और निवासी, फिर अनुपालन — निष्कर्ष, नवीनीकरण, संस्था प्रोफ़ाइल — फिर दस्तावेज़, शिकायतें और सूचनाएँ। मेनू के किनारे का छोटा तीर इसे छोटा करता है।"] },
      { target: "kpis", title: ["Key figures", "मुख्य आँकड़े"], body: ["Open findings, open grievances, documents on record and renewal status. Click any figure to open its page.", "खुले निष्कर्ष, खुली शिकायतें, रिकॉर्ड में दस्तावेज़ और नवीनीकरण की स्थिति। पेज खोलने के लिए किसी भी आँकड़े पर क्लिक करें।"] },
      { target: "actions", title: ["Compliance and action required", "अनुपालन और आवश्यक कार्रवाई"], body: ["Your compliance score as the Ministry sees it today, and the tasks that raise it — respond to findings with evidence and keep renewal documents current.", "मंत्रालय की दृष्टि में आज का अनुपालन स्कोर, और उसे बढ़ाने वाले कार्य — निष्कर्षों का साक्ष्य सहित जवाब दें और नवीनीकरण दस्तावेज़ अद्यतन रखें।"] },
      { target: "residents", title: ["Your residents", "आपके निवासी"], body: ["Payments received by residents over 12 months, their applications by status, and residents waiting on a document or re-application.", "12 महीनों में निवासियों को मिले भुगतान, स्थिति अनुसार उनके आवेदन, और दस्तावेज़ या पुनः आवेदन की प्रतीक्षा वाले निवासी।"] },
      ...shared,
    ];
  return [
    { title: ["Welcome to Setu", "Setu में आपका स्वागत है"], body: ["This one-minute tour shows where everything is. " + demoLine[0], "यह एक मिनट का भ्रमण बताता है कि क्या कहाँ है। " + demoLine[1]] },
    { target: "nav", title: ["Main menu", "मुख्य मेनू"], body: ["Every service, grouped: your dashboard, services — benefits, schemes, documents, grievances, calls — information and your account. The small arrow on the menu's edge collapses it for more room.", "हर सेवा, समूहों में: डैशबोर्ड, सेवाएँ — लाभ, योजनाएँ, दस्तावेज़, शिकायतें, कॉल — जानकारी और आपका खाता। मेनू के किनारे का छोटा तीर इसे छोटा करता है।"] },
    { target: "kpis", title: ["Key figures", "मुख्य आँकड़े"], body: ["Active benefits, money received in the last 12 months, documents verified and open grievances. Click any figure to open its page.", "सक्रिय लाभ, पिछले 12 महीनों में मिली राशि, सत्यापित दस्तावेज़ और खुली शिकायतें। पेज खोलने के लिए किसी भी आँकड़े पर क्लिक करें।"] },
    { target: "actions", title: ["Action required and coming up", "आवश्यक कार्रवाई और आगामी"], body: ["Anything that needs you — such as a pending document — is on the left. Payments, calls and appointments due soon are on the right.", "आपसे अपेक्षित कार्य — जैसे लंबित दस्तावेज़ — बाईं ओर हैं। जल्द आने वाले भुगतान, कॉल और अपॉइंटमेंट दाईं ओर।"] },
    { target: "apps", title: ["Application status", "आवेदन की स्थिति"], body: ["Each application moves through four stages — applied, verified, sanctioned, disbursed. The next step is written under each one.", "हर आवेदन चार चरणों से गुज़रता है — आवेदन, सत्यापन, स्वीकृति, वितरण। अगला कदम हर आवेदन के नीचे लिखा है।"] },
    { target: "payments", title: ["Payments received", "प्राप्त भुगतान"], body: ["Month-by-month payments by Direct Benefit Transfer to your bank account. Hover over a bar for details, or switch to the table view.", "बैंक खाते में डायरेक्ट बेनिफिट ट्रांसफ़र से माहवार भुगतान। विवरण के लिए बार पर माउस रखें या तालिका देखें।"] },
    { target: "grievance", title: ["Raise a grievance", "शिकायत दर्ज करें"], body: ["Report a problem in three steps. It is private by default, gets a reference number and is tracked by the Ministry until it is resolved.", "तीन चरणों में समस्या बताएँ। यह स्वतः गोपनीय रहती है, संदर्भ संख्या मिलती है और हल होने तक मंत्रालय निगरानी करता है।"] },
    ...shared,
  ];
}

function tourTarget(name) {
  if (!name) return null;
  const el = document.querySelector(`[data-tour="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

function GuidedTour() {
  const { user } = useAuth();
  const { tx } = useLang();
  const demo = useDemoMode();
  const navigate = useNavigate();
  const location = useLocation();
  const isStaff = user?.role === ROLES.STAFF;
  const [steps, setSteps] = useState([]);
  const [i, setI] = useState(-1);
  const [rect, setRect] = useState(null);
  const [cardH, setCardH] = useState(200);
  const [dontShow, setDontShow] = useState(false);
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const start = useCallback(() => {
    const go = () => {
      const all = tourSteps(isStaff, demo);
      setSteps(all.filter((s) => !s.target || tourTarget(s.target)));
      setI(0);
    };
    if (pathRef.current !== "/") {
      navigate("/");
      setTimeout(go, 900);
    } else go();
  }, [isStaff, demo, navigate]);

  // Opens by itself once per sign-in, after the Overview has loaded.
  useEffect(() => {
    let off = false;
    try {
      off = localStorage.getItem("setu.tourOff") === "1" || sessionStorage.getItem("setu.tourShown") === "1";
    } catch {
      /* private window */
    }
    if (off || location.pathname !== "/") return undefined;
    const t = setTimeout(start, 1400);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = () => start();
    window.addEventListener("setu:tour", on);
    return () => window.removeEventListener("setu:tour", on);
  }, [start]);

  const step = i >= 0 ? steps[i] : null;

  // Bring the step into view and follow it while the page moves.
  useEffect(() => {
    if (!step) return undefined;
    const el = tourTarget(step.target);
    if (el && el.closest("#scroller")) el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
    const measure = () => {
      const e = tourTarget(step.target);
      setRect(e ? e.getBoundingClientRect() : null);
      if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    };
    measure();
    const t = setInterval(measure, 120);
    setTimeout(() => nextRef.current?.focus(), 60);
    return () => clearInterval(t);
  }, [step]);

  const finish = useCallback(() => {
    setI(-1);
    setRect(null);
    try {
      sessionStorage.setItem("setu.tourShown", "1");
      if (dontShow) localStorage.setItem("setu.tourOff", "1");
    } catch {
      /* private window */
    }
  }, [dontShow]);

  useEffect(() => {
    if (!step) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setI((v) => (v < steps.length - 1 ? v + 1 : v));
      else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, steps.length, finish]);

  if (!step) return null;

  const pad = 6;
  const W = Math.min(340, window.innerWidth - 24);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let pos;
  if (!rect) pos = { top: Math.max(12, (vh - cardH) / 2), left: (vw - W) / 2 };
  else {
    const below = rect.bottom + pad + 10;
    const above = rect.top - pad - 10 - cardH;
    const cx = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12);
    if (below + cardH < vh - 8) pos = { top: below, left: cx };
    else if (above > 8) pos = { top: above, left: cx };
    else {
      const side = rect.right + pad + 12 + W < vw ? rect.right + pad + 12 : Math.max(12, rect.left - pad - 12 - W);
      pos = { top: Math.min(Math.max(12, rect.top + 20), vh - cardH - 12), left: side };
    }
  }
  const last = i === steps.length - 1;

  return (
    <>
      <style>{TOUR_CSS}</style>
      <div className="st-tour-block" onClick={(e) => e.stopPropagation()} aria-hidden="true" />
      {rect ? <div className="st-tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="st-tour-dim" />}
      <div ref={cardRef} className="st-tour-card" style={{ top: pos.top, left: pos.left }} role="dialog" aria-modal="true" aria-labelledby="st-tour-title">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[0.7333rem] font-semibold uppercase tracking-[.12em]" style={{ color: C.pri }}>
            {tx("Guided tour", "मार्गदर्शित भ्रमण")} · {i + 1} / {steps.length}
          </p>
          <button type="button" onClick={finish} className="grid h-7 w-7 place-items-center rounded-md border-0 bg-transparent hover:bg-[#F1F3F2]" style={{ color: C.muted, cursor: "pointer" }} aria-label={tx("Close tour", "भ्रमण बंद करें")}>
            <Icon name="x" size={15} />
          </button>
        </div>
        <h2 id="st-tour-title" className="st-display m-0 mt-1 text-[1.0667rem]" style={{ color: C.ink }}>{tx(step.title[0], step.title[1])}</h2>
        <p className="m-0 mt-1.5 text-[0.8667rem] leading-relaxed" style={{ color: C.ink2 }}>{tx(step.body[0], step.body[1])}</p>
        {i === 0 && demo && (
          <p className="m-0 mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.8rem] font-semibold" style={{ background: "var(--acc-50)", color: "#8A4B0F" }}>
            <Icon name="info" size={13} /> {tx("Mock data", "मॉक डेटा")}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="st-tour-dots" aria-hidden="true">
            {steps.map((_, k) => <i key={k} className={k === i ? "is-on" : ""} />)}
          </span>
          <div className="flex gap-1.5">
            {i > 0 && <Button size="sm" variant="secondary" onClick={() => setI(i - 1)}>{tx("Back", "पीछे")}</Button>}
            <button ref={nextRef} type="button" className="st-btn st-btn-primary st-btn-sm" onClick={() => (last ? finish() : setI(i + 1))}>
              {last ? tx("Finish", "समाप्त") : i === 0 ? tx("Start tour", "भ्रमण शुरू करें") : tx("Next", "आगे")}
            </button>
          </div>
        </div>
        {i === 0 && (
          <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[0.8rem]" style={{ color: C.muted }}>
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            {tx("Don't open this automatically on this device", "इस डिवाइस पर इसे अपने-आप न खोलें")}
          </label>
        )}
      </div>
    </>
  );
}
/* ══════════════════════════════════════════════════════════════════════════
   §16  SECURITY — idle sign-out, silent refresh, live data, the Security page
   ══════════════════════════════════════════════════════════════════════════ */

/* ---------------------------------------------------- staying signed in -- */
/**
 * Signs out after `limitMs` without activity (pointer, keys, scroll, touch —
 * noted at most every few seconds) and raises the warning from `warnMs`.
 * Judged from timestamps, so a hidden or sleeping tab is right the moment it
 * wakes. While the warning shows, only its buttons count as activity.
 */
function useIdleTimer({ warnMs, limitMs, onTimeout }) {
  const lastActive = useRef(Date.now());
  const [warning, setWarning] = useState(false);
  const warningRef = useRef(false);
  const timeout = useRef(onTimeout);
  timeout.current = onTimeout;
  useEffect(() => {
    let noted = 0;
    const note = () => {
      const now = Date.now();
      if (warningRef.current || now - noted < 5000) return;
      noted = now;
      lastActive.current = now;
    };
    const check = () => {
      const idle = Date.now() - lastActive.current;
      if (idle >= limitMs) return timeout.current();
      if (idle >= warnMs !== warningRef.current) {
        warningRef.current = idle >= warnMs;
        setWarning(warningRef.current);
      }
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, note, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", check);
    const t = setInterval(check, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, note, { capture: true }));
      document.removeEventListener("visibilitychange", check);
      clearInterval(t);
    };
  }, [warnMs, limitMs]);
  const stay = useCallback(() => {
    lastActive.current = Date.now();
    warningRef.current = false;
    setWarning(false);
  }, []);
  return { warning, deadline: lastActive.current + limitMs, stay, lastActive };
}

/** Renews the access token when it is about to expire — only for someone who is actually using Setu. */
function useSilentRefresh(lastActive) {
  useEffect(() => {
    let tried = 0;
    const check = () => {
      const s = sessionStore.get();
      const now = Date.now();
      if (!s || now - tried < 60e3 || s.expiresAt - now > REFRESH_BEFORE_MS || now - lastActive.current > ACTIVE_RECENTLY_MS) return;
      tried = now;
      refreshSession().catch(() => {}); // a 401 signs out (the interceptor); anything else retries in a minute
    };
    const t = setInterval(check, 15e3);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [lastActive]);
}

/** The idle warning, with a live countdown; and silent refresh. Lives inside the portal shell. */
function SessionGuard() {
  const { tx } = useLang();
  const idle = useIdleTimer({ warnMs: IDLE_WARN_MS, limitMs: IDLE_LIMIT_MS, onTimeout: () => endSession({ notice: { kind: "idle" } }) });
  useSilentRefresh(idle.lastActive);
  const left = useSecondsLeft(idle.warning ? idle.deadline : 0);
  const [busy, setBusy] = useState(false);
  const stay = async () => {
    idle.stay();
    setBusy(true);
    try {
      await refreshSession();
    } catch {
      /* a 401 has signed out already; otherwise the session simply carries on */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={idle.warning}
      onClose={stay}
      title={tx("Are you still there?", "क्या आप अभी भी यहाँ हैं?")}
      footer={
        <>
          <Button variant="secondary" icon="logout" onClick={() => endSession()}>{tx("Sign out now", "अभी साइन आउट करें")}</Button>
          <Button icon="check" loading={busy} onClick={stay}>{tx("Stay signed in", "साइन इन रहें")}</Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <span className="st-idle-ring" aria-hidden="true"><Icon name="clock" size={30} /></span>
        <div className="min-w-0">
          <p className="m-0 text-[0.9333rem] leading-snug" style={{ color: C.ink2 }}>{tx("For your security you'll be signed out in", "आपकी सुरक्षा के लिए आप इतनी देर में साइन आउट हो जाएँगे")}</p>
          <p className="st-idle-clock m-0 mt-1.5">{formatClock(left)}</p>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ live data -- */
/**
 * While the tab is visible, the page's data is fetched again every minute —
 * and at once when the tab comes back into view. It rides on the
 * "setu:refresh" event that every useApi already answers quietly (§7), so
 * scroll position, filters, open dialogs and typed text stay as they are.
 * `pageKey` (the route) marks a newly opened page as just updated.
 */
function useAutoRefresh(pageKey, everyMs = 60e3) {
  const last = useRef(Date.now());
  const [updatedAt, setUpdatedAt] = useState(last.current);
  const refresh = useCallback(() => {
    last.current = Date.now();
    setUpdatedAt(last.current);
    window.dispatchEvent(new CustomEvent("setu:refresh"));
  }, []);
  useEffect(() => {
    last.current = Date.now();
    setUpdatedAt(last.current);
  }, [pageKey]);
  useEffect(() => {
    const visible = () => document.visibilityState === "visible";
    const onShow = () => visible() && Date.now() - last.current > 10e3 && refresh();
    const t = setInterval(() => visible() && refresh(), everyMs);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [everyMs, refresh]);
  return { updatedAt, refresh };
}

/** "Updated 2 min ago" with a refresh button, in the page header. */
function UpdatedAgo({ at, onRefresh }) {
  const { tx } = useLang();
  const [, rerender] = useState(0);
  const [spin, setSpin] = useState(false);
  useEffect(() => {
    const t = setInterval(() => rerender((n) => n + 1), 30e3);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((Date.now() - at) / 60e3);
  const label = mins < 1 ? tx("Updated just now", "अभी अपडेट हुआ") : tx(`Updated ${mins} min ago`, `${mins} मिनट पहले अपडेट हुआ`);
  const click = () => {
    onRefresh();
    setSpin(true);
    setTimeout(() => setSpin(false), 800);
  };
  return (
    <span className="st-updated">
      <span className="hidden xl:inline">{label}</span>
      <button type="button" className={spin ? "is-spin" : ""} onClick={click} title={`${label} · ${tx("Refresh now", "अभी ताज़ा करें")}`} aria-label={`${label}. ${tx("Refresh now", "अभी ताज़ा करें")}`}>
        <Icon name="refresh" size={14} />
      </button>
    </span>
  );
}

/* ------------------------------------------------------ password policy -- */
const COMMON_PASSWORDS = ["password", "passw0rd", "123456", "qwerty", "iloveyou", "welcome", "letmein", "changeme", "admin", "india", "abc123", "111111", "setu", "nigrani", "sentinel"];

/** The server's password rules as a live checklist: [{ key, ok, en, hi }]. */
function passwordChecks(pw = "", { name = "", email = "", current = "" } = {}) {
  const lower = String(pw).toLowerCase();
  const personal = [...String(name).split(/\s+/), String(email).split("@")[0]].map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, "")).filter((x) => x.length >= 3);
  const bare = lower.replace(/[^a-z0-9]/g, "");
  const filled = pw.length > 0;
  return [
    { key: "length", ok: pw.length >= 12, en: "At least 12 characters", hi: "कम से कम 12 अक्षर" },
    { key: "upper", ok: /[A-Z]/.test(pw), en: "A capital letter (A–Z)", hi: "एक बड़ा अक्षर (A–Z)" },
    { key: "lower", ok: /[a-z]/.test(pw), en: "A small letter (a–z)", hi: "एक छोटा अक्षर (a–z)" },
    { key: "number", ok: /\d/.test(pw), en: "A number (0–9)", hi: "एक अंक (0–9)" },
    { key: "symbol", ok: /[^A-Za-z0-9\s]/.test(pw), en: "A symbol, like @ # !", hi: "एक चिह्न, जैसे @ # !" },
    { key: "personal", ok: filled && !personal.some((x) => lower.includes(x)), en: "Not your name or email", hi: "आपका नाम या ईमेल नहीं" },
    { key: "common", ok: filled && !COMMON_PASSWORDS.some((c) => bare.includes(c)), en: "Not a common password", hi: "आम पासवर्ड नहीं" },
    { key: "different", ok: filled && pw !== current, en: "Different from the current one", hi: "मौजूदा पासवर्ड से अलग" },
  ];
}
/** 0 empty · 1 weak · 2 fair · 3 good · 4 strong */
function passwordStrength(pw, checks) {
  if (!pw) return 0;
  const passed = checks.filter((c) => c.ok).length;
  // Too short is weak, whatever else it has.
  if (passed <= 5 || !checks.find((c) => c.key === "length")?.ok) return 1;
  if (passed < checks.length) return 2;
  return pw.length >= 16 ? 4 : 3;
}
const STRENGTH = [null, ["Weak", "कमज़ोर", "var(--bad)"], ["Fair", "ठीक-ठाक", "var(--warn)"], ["Good", "अच्छा", "var(--ok)"], ["Strong", "मज़बूत", "var(--ok)"]];

function PasswordRules({ pw, checks }) {
  const { tx } = useLang();
  const level = passwordStrength(pw, checks);
  const st = STRENGTH[level];
  return (
    <div className="mt-2 space-y-2.5">
      <div>
        <div className="st-meter" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => <i key={n} style={level >= n ? { background: st[2] } : undefined} />)}
        </div>
        <p className="m-0 mt-1 text-[0.8rem]" style={{ color: st ? st[2] : C.muted }} aria-live="polite">
          {st ? `${tx("Strength", "मज़बूती")}: ${tx(st[0], st[1])}` : tx("Type a new password to see how strong it is.", "नया पासवर्ड लिखें — उसकी मज़बूती यहाँ दिखेगी।")}
        </p>
      </div>
      <ul className="st-checklist">
        {checks.map((c) => (
          <li key={c.key} className={c.ok ? "is-ok" : ""}>
            <span aria-hidden="true">{c.ok && <Icon name="check" size={11} />}</span>
            <span>
              {tx(c.en, c.hi)}
              <span className="sr-only">{c.ok ? " — done" : " — not yet"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- helpers -- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** A labelled password box in the page style, with show/hide. */
function SecretField({ id, label, value, onChange, autoComplete = "current-password", autoFocus = false }) {
  const { tx } = useLang();
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="st-label" htmlFor={id}>{label}</label>
      <div className="st-fieldbox is-input">
        <Icon name="lock" size={17} className="shrink-0" style={{ color: value ? C.pri : "#8A9792" }} />
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} />
        <button type="button" onClick={() => setShow((v) => !v)} className="grid h-8 w-8 place-items-center rounded-md border-0 bg-transparent hover:bg-[#F1F3F2]" style={{ color: C.muted, cursor: "pointer" }} aria-pressed={show} aria-label={show ? tx("Hide password", "पासवर्ड छिपाएँ") : tx("Show password", "पासवर्ड दिखाएँ")}>
          <Icon name={show ? "eyeOff" : "eye"} size={17} />
        </button>
      </div>
    </div>
  );
}
/** A 6-digit (or recovery) code box in the page style. */
function CodeField({ id, label, value, onChange, allowRecovery = false }) {
  return (
    <div>
      <label className="st-label" htmlFor={id}>{label}</label>
      <div className="st-fieldbox is-input">
        <Icon name="key" size={17} className="shrink-0" style={{ color: value ? C.pri : "#8A9792" }} />
        <input
          id={id}
          className="st-otp"
          value={value}
          onChange={(e) => onChange(allowRecovery ? e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9) : e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          inputMode={allowRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
const codeReady = (v, allowRecovery = false) => /^\d{6}$/.test(v) || (allowRecovery && /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(v));

/* --------------------------------------------------------- the page ------ */
/**
 * Security · सुरक्षा — reached from the account menu (and My profile):
 * last sign-in, 2-step verification, password, and the devices signed in.
 * In the demo it all works against the demo account; on a server that
 * doesn't have these routes yet, each part says it will come.
 */
function Security() {
  const { tx } = useLang();
  const demo = useDemoMode();
  const me = useApi(API.auth.me(), { optional: true, sample: false });
  return (
    <div>
      <PageHead en="Security" hi="सुरक्षा" lede={tx("Keep your account safe: how you sign in, your password, and where you are signed in.", "अपना खाता सुरक्षित रखें: साइन इन का तरीका, पासवर्ड, और आप कहाँ-कहाँ साइन इन हैं।")} />
      {demo && (
        <div className="mb-4">
          <Callout tone="accent" icon="info" title={tx("Test account", "परीक्षण खाता")}>
            {tx(`Nothing here changes a real account. Wherever a code is asked, use ${DEMO_CODE}; any password works.`, `यहाँ से किसी असली खाते में बदलाव नहीं होता। जहाँ कोड माँगा जाए, ${DEMO_CODE} डालें; कोई भी पासवर्ड चलेगा।`)}
          </Callout>
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <TwoStepPanel me={me} />
          <ChangePassword />
        </div>
        <div className="grid gap-4">
          <SignInActivity me={me} />
          <ActiveSessions />
        </div>
      </div>
    </div>
  );
}

/** When a part's route isn't on the server yet. */
function NotConnected() {
  const { tx } = useLang();
  return (
    <div className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--info-50)", color: "var(--info-ink)" }}>
      <Icon name="clock" size={17} className="mt-0.5 shrink-0" />
      <span>{tx("Available when connected to the server.", "सर्वर से जुड़ने पर उपलब्ध होगा।")}</span>
    </div>
  );
}

function SignInActivity({ me }) {
  const { tx, lang } = useLang();
  const { session, user } = useAuth();
  const m = me.data || {};
  const lastAt = m.last_login_at ?? session?.lastLoginAt;
  const lastIp = m.last_login_ip ?? session?.lastLoginIp;
  const Row = ({ k, v, mono }) => (
    <div className="st-kv">
      <dt>{k}</dt>
      <dd className={mono ? "st-mono" : ""} style={{ overflowWrap: "anywhere" }}>{v || "—"}</dd>
    </div>
  );
  return (
    <Panel title="Sign-in activity" hi="साइन-इन गतिविधि" icon="clock">
      {me.loading ? (
        <Skeleton className="h-28" />
      ) : (
        <dl className="m-0">
          <Row k={tx("Signed in as", "इस नाम से साइन इन")} v={m.email || user?.email} />
          <Row k={tx("Last sign-in before this one", "इससे पहले का साइन इन")} v={lastAt ? formatDateTime(lastAt, lang) : tx("This is your first sign-in", "यह आपका पहला साइन इन है")} />
          <Row k={tx("From network address", "नेटवर्क पता")} v={lastIp} mono />
          {m.password_changed_at && <Row k={tx("Password last changed", "पासवर्ड पिछली बार बदला")} v={formatDate(m.password_changed_at, lang)} />}
        </dl>
      )}
      <p className="m-0 mt-3 text-[0.8333rem]" style={{ color: C.muted }}>
        {tx("Not you? Change your password below and sign out other devices.", "यह आप नहीं थे? नीचे पासवर्ड बदलें और दूसरे डिवाइस से साइन आउट करें।")}
      </p>
    </Panel>
  );
}

function TwoStepPanel({ me }) {
  const { tx } = useLang();
  const { session } = useAuth();
  const [on, setOn] = useState(null);
  const [flow, setFlow] = useState(null); // "enable" | "disable"
  const enabled = on ?? me.data?.mfa_enabled ?? session?.mfaEnabled ?? false;
  const done = (value) => {
    setOn(value);
    const s = sessionStore.get();
    if (s) sessionStore.set({ ...s, mfaEnabled: value });
  };
  return (
    <Panel title="2-step verification" hi="दो-चरण सत्यापन" icon="shieldCheck" action={<Badge tone={enabled ? "good" : "neutral"} dot>{enabled ? tx("On", "चालू") : tx("Off", "बंद")}</Badge>}>
      {me.unavailable ? (
        <NotConnected />
      ) : (
        <>
          <p className="m-0 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>
            {enabled
              ? tx("Signing in asks for your password and a code from your authenticator app. Keep your recovery codes somewhere safe.", "साइन इन के समय पासवर्ड और ऑथेंटिकेटर ऐप का कोड माँगा जाता है। अपने रिकवरी कोड सुरक्षित जगह रखें।")
              : tx("Add a second step: after your password, a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, Authy).", "दूसरा चरण जोड़ें: पासवर्ड के बाद, फ़ोन के ऐप (Google Authenticator, Microsoft Authenticator, Authy) से 6 अंकों का कोड।")}
          </p>
          <div className="mt-4">
            {enabled ? (
              <Button variant="secondary" icon="unlock" onClick={() => setFlow("disable")}>{tx("Turn off", "बंद करें")}</Button>
            ) : (
              <Button icon="shieldCheck" onClick={() => setFlow("enable")}>{tx("Turn on 2-step verification", "दो-चरण सत्यापन चालू करें")}</Button>
            )}
          </div>
        </>
      )}
      <TwoStepEnable open={flow === "enable"} onClose={() => setFlow(null)} onEnabled={() => done(true)} />
      <TwoStepDisable open={flow === "disable"} onClose={() => setFlow(null)} onDisabled={() => done(false)} />
    </Panel>
  );
}

/** Password → scan / type the key → confirm a code → save the recovery codes (shown once). */
function TwoStepEnable({ open, onClose, onEnabled }) {
  const { tx } = useLang();
  const toast = useToast();
  const [step, setStep] = useState("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState(null);
  const [codes, setCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Each opening starts clean; nothing secret stays in memory after closing.
  useEffect(() => {
    if (!open) {
      setStep("password");
      setPassword("");
      setCode("");
      setSetup(null);
      setCodes([]);
      setSaved(false);
      setError("");
    }
  }, [open]);
  const run = async (work) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err, tx("That didn't work. Please try again.", "यह नहीं हुआ। कृपया फिर कोशिश करें।")));
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    run(async () => {
      const { data } = await api.post(API.auth.mfaSetup(), { password });
      setSetup(data);
      setPassword("");
      setStep("scan");
    });
  const confirm = () =>
    run(async () => {
      const { data } = await api.post(API.auth.mfaEnable(), { code });
      setCodes(data.recovery_codes || []);
      setStep("codes");
      onEnabled();
    });
  const codesText = `DoSJE Nigrani — Setu recovery codes\nEach code works once, if you can't use your authenticator app.\n\n${codes.join("\n")}\n`;
  const steps = ["password", "scan", "codes"];
  const footer =
    step === "password" ? (
      <>
        <Button variant="secondary" onClick={onClose}>{tx("Cancel", "रद्द करें")}</Button>
        <Button loading={busy} disabled={!password} onClick={start} iconRight="arrowRight">{tx("Continue", "आगे बढ़ें")}</Button>
      </>
    ) : step === "scan" ? (
      <>
        <Button variant="secondary" onClick={onClose}>{tx("Cancel", "रद्द करें")}</Button>
        <Button loading={busy} disabled={!codeReady(code)} onClick={confirm} icon="check">{tx("Turn on", "चालू करें")}</Button>
      </>
    ) : (
      <Button disabled={!saved} onClick={onClose} icon="check">{tx("Done", "हो गया")}</Button>
    );
  return (
    <Modal open={open} onClose={step === "codes" && !saved ? () => {} : onClose} title={tx("Turn on 2-step verification", "दो-चरण सत्यापन चालू करें")} footer={footer}>
      <ol className="st-steps" aria-hidden="true">
        {steps.map((k, i) => <li key={k} className={steps.indexOf(step) >= i ? "is-on" : ""} />)}
      </ol>
      {step === "password" && (
        <form onSubmit={(e) => { e.preventDefault(); if (password) start(); }} className="space-y-3">
          <p className="m-0 text-[0.9rem]" style={{ color: C.ink2 }}>{tx("First, confirm it's you.", "पहले पुष्टि करें कि यह आप ही हैं।")}</p>
          <SecretField id="mfa-pw" label={tx("Your password", "आपका पासवर्ड")} value={password} onChange={setPassword} autoFocus />
        </form>
      )}
      {step === "scan" && setup && (
        <form onSubmit={(e) => { e.preventDefault(); if (codeReady(code)) confirm(); }} className="space-y-3.5">
          <p className="m-0 text-[0.9rem] leading-relaxed" style={{ color: C.ink2 }}>
            {tx("Open your authenticator app, choose “add account”, and type this key (or open the link on this phone):", "अपना ऑथेंटिकेटर ऐप खोलें, “खाता जोड़ें” चुनें, और यह कुंजी लिखें (या इस फ़ोन पर लिंक खोलें):")}
          </p>
          <div className="st-secret" aria-label={tx("Secret key", "गुप्त कुंजी")}>
            {(setup.secret.match(/.{1,4}/g) || []).map((g, i) => <span key={i}>{g}</span>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon="copy" type="button" onClick={async () => ((await copyText(setup.secret)) ? toast.success(tx("Key copied", "कुंजी कॉपी हुई")) : toast.error(tx("Couldn't copy — please write it down", "कॉपी नहीं हुआ — कृपया लिख लें")))}>
              {tx("Copy key", "कुंजी कॉपी करें")}
            </Button>
            {setup.otpauth_uri && (
              <a className="st-btn st-btn-secondary st-btn-sm no-underline" href={setup.otpauth_uri}>
                <Icon name="external" /> {tx("Open in authenticator app", "ऑथेंटिकेटर ऐप में खोलें")}
              </a>
            )}
          </div>
          <CodeField id="mfa-enable-code" label={tx("Then type the 6-digit code the app shows", "फिर ऐप में दिखा 6 अंकों का कोड लिखें")} value={code} onChange={setCode} />
        </form>
      )}
      {step === "codes" && (
        <div className="space-y-3">
          <Callout tone="good" icon="check" title={tx("2-step verification is on", "दो-चरण सत्यापन चालू है")}>
            {tx("Save these recovery codes now — they are shown only once. Each works one time if your phone is lost.", "ये रिकवरी कोड अभी सहेज लें — ये केवल एक बार दिखेंगे। फ़ोन खोने पर हर कोड एक बार काम करता है।")}
          </Callout>
          <ul className="st-codes">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon="copy" onClick={async () => ((await copyText(codes.join("\n"))) ? toast.success(tx("Codes copied", "कोड कॉपी हुए")) : toast.error(tx("Couldn't copy — please download them", "कॉपी नहीं हुआ — कृपया डाउनलोड करें")))}>
              {tx("Copy", "कॉपी करें")}
            </Button>
            <Button size="sm" variant="secondary" icon="download" onClick={() => downloadText("setu-recovery-codes.txt", codesText)}>
              {tx("Download (.txt)", "डाउनलोड (.txt)")}
            </Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[0.9rem]" style={{ color: C.ink2 }}>
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--pri)" }} />
            {tx("I have saved my recovery codes", "मैंने अपने रिकवरी कोड सहेज लिए हैं")}
          </label>
        </div>
      )}
      {error && <div className="mt-3"><Callout tone="flag" icon="alert" title={error} /></div>}
    </Modal>
  );
}

function TwoStepDisable({ open, onClose, onDisabled }) {
  const { tx } = useLang();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) {
      setPassword("");
      setCode("");
      setError("");
    }
  }, [open]);
  const ready = Boolean(password) && codeReady(code, true);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(API.auth.mfaDisable(), { password, code });
      onDisabled();
      toast.success(tx("2-step verification is off", "दो-चरण सत्यापन बंद हो गया"));
      onClose();
    } catch (err) {
      setError(errorMessage(err, tx("That didn't work. Please try again.", "यह नहीं हुआ। कृपया फिर कोशिश करें।")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tx("Turn off 2-step verification", "दो-चरण सत्यापन बंद करें")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tx("Cancel", "रद्द करें")}</Button>
          <Button variant="danger" loading={busy} disabled={!ready} onClick={submit}>{tx("Turn off", "बंद करें")}</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }} className="space-y-3">
        <p className="m-0 text-[0.9rem]" style={{ color: C.ink2 }}>{tx("Your account will be protected by your password only.", "तब आपका खाता केवल पासवर्ड से सुरक्षित रहेगा।")}</p>
        <SecretField id="mfa-off-pw" label={tx("Your password", "आपका पासवर्ड")} value={password} onChange={setPassword} autoFocus />
        <CodeField id="mfa-off-code" label={tx("Code from your app (or a recovery code)", "ऐप का कोड (या रिकवरी कोड)")} value={code} onChange={setCode} allowRecovery />
        {error && <Callout tone="flag" icon="alert" title={error} />}
      </form>
    </Modal>
  );
}

function ChangePassword() {
  const { tx } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const checks = passwordChecks(next, { name: user?.name, email: user?.email, current });
  const matches = again.length > 0 && again === next;
  const ready = current && checks.every((c) => c.ok) && matches;
  const submit = async (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(API.auth.changePassword(), { current_password: current, new_password: next });
      const n = num(data?.revoked_other_sessions);
      toast.success(n ? tx(`Password changed. ${n} other device${n > 1 ? "s were" : " was"} signed out.`, `पासवर्ड बदल गया। ${n} दूसरे डिवाइस से साइन आउट किया गया।`) : tx("Password changed.", "पासवर्ड बदल गया।"));
      setCurrent("");
      setNext("");
      setAgain("");
      window.dispatchEvent(new CustomEvent("setu:refresh"));
    } catch (err) {
      if (isMissing(err)) setMissing(true);
      else setError(errorMessage(err, tx("Couldn't change the password.", "पासवर्ड नहीं बदल सका।")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Change password" hi="पासवर्ड बदलें" icon="key">
      {missing ? (
        <NotConnected />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-3">
          <SecretField id="pw-current" label={tx("Current password", "मौजूदा पासवर्ड")} value={current} onChange={setCurrent} />
          <div>
            <SecretField id="pw-new" label={tx("New password", "नया पासवर्ड")} value={next} onChange={setNext} autoComplete="new-password" />
            <PasswordRules pw={next} checks={checks} />
          </div>
          <div>
            <SecretField id="pw-again" label={tx("New password again", "नया पासवर्ड दोबारा")} value={again} onChange={setAgain} autoComplete="new-password" />
            {again && !matches && <p className="st-hint" style={{ color: "var(--bad)" }}>{tx("The two new passwords are not the same.", "दोनों नए पासवर्ड एक जैसे नहीं हैं।")}</p>}
          </div>
          {error && <Callout tone="flag" icon="alert" title={error} />}
          <Button type="submit" loading={busy} disabled={!ready} icon="check">{tx("Change password", "पासवर्ड बदलें")}</Button>
          <p className="m-0 text-[0.8rem]" style={{ color: C.muted }}>{tx("Other devices will be signed out.", "दूसरे डिवाइस से साइन आउट हो जाएगा।")}</p>
        </form>
      )}
    </Panel>
  );
}

function ActiveSessions() {
  const { tx, lang } = useLang();
  const toast = useToast();
  const list = useApi(API.auth.sessions(), { fallback: [], optional: true, sample: false });
  const [busy, setBusy] = useState(null);
  const rows = [...(list.data || [])].sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || parseDate(b.last_seen_at) - parseDate(a.last_seen_at));
  const others = rows.filter((r) => !r.current);
  const act = async (key, work, done) => {
    setBusy(key);
    try {
      const res = await work();
      done(res?.data);
      list.reload();
    } catch (err) {
      toast.error(errorMessage(err, tx("That didn't work. Please try again.", "यह नहीं हुआ। कृपया फिर कोशिश करें।")));
    } finally {
      setBusy(null);
    }
  };
  const signOutOne = (r) => act(r.id, () => api.delete(API.auth.session(r.id)), () => toast.success(tx(`Signed out: ${r.device}`, `साइन आउट किया: ${r.device}`)));
  const signOutOthers = () =>
    act("others", () => api.post(API.auth.logoutOthers()), (d) => {
      const n = num(d?.revoked, others.length);
      toast.success(tx(`Signed out of ${n} other device${n === 1 ? "" : "s"}.`, `${n} दूसरे डिवाइस से साइन आउट किया।`));
    });
  return (
    <Panel
      title="Where you're signed in"
      hi="आप कहाँ साइन इन हैं"
      icon="monitor"
      bodyClassName="!p-0"
      action={others.length > 0 && <Button size="sm" variant="secondary" icon="logout" loading={busy === "others"} onClick={signOutOthers}>{tx("Sign out all others", "बाकी सबसे साइन आउट")}</Button>}
    >
      {list.loading ? (
        <div className="p-4"><Skeleton className="h-24" /></div>
      ) : list.unavailable ? (
        <div className="p-4"><NotConnected /></div>
      ) : list.error ? (
        <div className="p-4"><ErrorBox message={list.error} onRetry={list.reload} /></div>
      ) : (
        <ul className="m-0 p-0" style={{ listStyle: "none" }}>
          {rows.map((r) => (
            <li key={r.id} className="st-session">
              <span className="st-session-ico" aria-hidden="true"><Icon name={/android|ios|iphone|app/i.test(r.device || "") ? "mobile" : "monitor"} size={19} /></span>
              <div className="min-w-0 flex-1">
                <p className="m-0 flex flex-wrap items-center gap-2 text-[0.9333rem] font-semibold" style={{ color: C.ink }}>
                  {r.device || tx("Unknown device", "अज्ञात डिवाइस")}
                  {r.current && <Badge tone="good" dot>{tx("This device", "यह डिवाइस")}</Badge>}
                </p>
                <p className="m-0 mt-0.5 text-[0.8333rem]" style={{ color: C.muted }}>
                  {r.current ? tx("Active now", "अभी सक्रिय") : `${tx("Last active", "पिछली गतिविधि")} ${relTime(r.last_seen_at, lang)}`}
                  {r.ip && <> · <span className="st-mono">{r.ip}</span></>}
                  {r.created_at && <> · {tx("signed in", "साइन इन")} {formatDateTime(r.created_at, lang)}</>}
                </p>
              </div>
              {!r.current && (
                <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => signOutOne(r)}>{tx("Sign out", "साइन आउट")}</Button>
              )}
            </li>
          ))}
          {!others.length && (
            <li className="px-4 pb-4 pt-1 text-[0.8333rem]" style={{ color: C.muted }}>{tx("You're not signed in anywhere else.", "आप कहीं और साइन इन नहीं हैं।")}</li>
          )}
        </ul>
      )}
    </Panel>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   §17  ROUTES
   ══════════════════════════════════════════════════════════════════════════ */

function HomeByRole() {
  const { isStaff } = useAuth();
  return isStaff ? <StaffHome /> : <BeneficiaryHome />;
}
function GrievancesByRole() {
  const { isStaff } = useAuth();
  return isStaff ? <Grievances /> : <MyGrievances />;
}
function NotFound() {
  const { tx } = useLang();
  return <Empty icon="search" title={tx("This page doesn't exist", "यह पेज मौजूद नहीं है")} action={<ButtonLink to="/">{tx("Go to overview", "अवलोकन पर जाएँ")}</ButtonLink>} />;
}

function SetuRoutes() {
  const S = ROLES.STAFF;
  const B = ROLES.BENEFICIARY;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Shell /></Protected>}>
        <Route index element={<HomeByRole />} />
        <Route path="findings" element={<Protected role={S}><Findings /></Protected>} />
        <Route path="documents" element={<Protected role={S}><Documents /></Protected>} />
        <Route path="renewal" element={<Protected role={S}><Renewal /></Protected>} />
        <Route path="institute" element={<Protected role={S}><Institute /></Protected>} />
        <Route path="residents" element={<Protected role={S}><Residents /></Protected>} />
        <Route path="grievances" element={<GrievancesByRole />} />
        <Route path="benefits" element={<Protected role={B}><Benefits /></Protected>} />
        <Route path="schemes" element={<Protected role={B}><Schemes /></Protected>} />
        <Route path="activity" element={<Protected role={B}><Activity /></Protected>} />
        <Route path="my-documents" element={<Protected role={B}><MyDocuments /></Protected>} />
        <Route path="profile" element={<Protected role={B}><Profile /></Protected>} />
        <Route path="grievance/new" element={<Protected role={B}><RaiseGrievance /></Protected>} />
        <Route path="calls" element={<Protected role={B}><Calls /></Protected>} />
        <Route path="rights" element={<Protected role={B}><Rights /></Protected>} />
        <Route path="notices" element={<Notices />} />
        <Route path="help" element={<Help />} />
        <Route path="security" element={<Security />} />
        <Route path="ecosystem" element={<Ecosystem />} />
        {/* Earlier Setu addresses keep working. */}
        <Route path="complaint/new" element={<Navigate to="/grievance/new" replace />} />
        <Route path="complaints" element={<Navigate to="/grievances" replace />} />
        <Route path="status" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter basename={ROUTER_BASE}>
      <SetuTheme />
      <LangProvider>
        <AuthProvider>
          <ToastProvider>
            <PageBoundary>
              <SetuRoutes />
            </PageBoundary>
          </ToastProvider>
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  );
}

export default App;
