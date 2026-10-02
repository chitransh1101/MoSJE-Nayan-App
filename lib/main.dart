// ============================================================================
//  Nayan · नयन — Field inspection app for DoSJE inspectors
//  Part of DOSJE NIGRANI (Sentinel = officials, Setu = institutes, Nayan = field)
//
//  One file, organised in sections:
//   §1  Config & SIGN_UP hook        §7  Common widgets
//   §2  Language (English + हिन्दी)   §8  Splash & Login
//   §3  Models                       §9  Home, Assignments, Detail
//   §4  Backend (real FastAPI)        §10 Inspection (GPS, camera, SHA-256)
//   §5  Demo backend                 §11 Upload status, Submissions, Profile
//   §6  App state & theme            §12 Yukt assistant
//   §13–§20 Monitoring, CCTV, VC, draw, insights, profile, header/drawer
//   §21 Security — app lock, session guard, 2-step, password, devices
//
//  Security notes:
//   • No API keys live in this app. Yukt's AI (if any) runs on the server.
//   • Every Yukt action asks the inspector to confirm before it happens.
//   • The SHA-256 of each photo/video is computed on the phone before upload;
//     the server recomputes it and rejects the file if they differ.
//   • The session (access token) lives in memory only — a cold start always
//     opens the sign-in screen. Idle / background time locks the app instead
//     of signing out, so unsent evidence is never lost to a timeout.
//   • The server address must be https:// unless it is a local/private host.
// ============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:audioplayers/audioplayers.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart' as ll;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

part 'portal.dart';

// ============================================================================
// §1  CONFIG
// ============================================================================

/// Backend base URL can be baked in at build time:
///   flutter build apk --dart-define=API_BASE=https://api.example.gov.in/api/v1
/// It can also be changed later from the login screen (⚙). When it is empty
/// the app runs in demo mode with sample data.
const String kApiBaseFromBuild = String.fromEnvironment('API_BASE');
const String kAppVersion = '1.0.0';

/// Distance (metres) beyond which the app warns that the inspector seems to be
/// away from the institute. Hard geofencing comes in a later version.
const double kNearbyMetres = 500;

typedef SignUpHook = Future<void> Function(BuildContext context);

/// SIGN_UP hook — kept on purpose, not used yet. Inspector accounts are
/// created by the department from Sentinel. If self sign-up is ever allowed,
/// assign a function here and the login screen shows a "Create account" link.
const SignUpHook? kSignUpHook = null;

// Brand palette: sage green + beige, with a thin tricolour for identity.
const Color kSage = Color(0xFF6E8B6F); // primary sage
const Color kSageLight = Color(0xFFA9BFA3);
const Color kForest = Color(0xFF3F5A45); // deep sage for text, bars, headers
const Color kForestDeep = Color(0xFF26382B);
const Color kBeige = Color(0xFFF3ECDD);
const Color kBeigeDeep = Color(0xFFE6DAC2);
const Color kIvory = Color(0xFFFBF8F1);
const Color kSand = Color(0xFFB8894A); // warm accent (sand / gold)
const Color kGreen = Color(0xFF4F8A55);
const Color kRed = Color(0xFFB4473F);
const Color kAmber = Color(0xFFB07A22);
const Color kBlue = Color(0xFF4A6FA5);

/// Only set by the screenshot test so Hindi text renders there.
List<String>? debugFontFallback;

// ============================================================================
// §2  LANGUAGE — default "English + हिन्दी" (English with small Hindi below)
// ============================================================================

enum LangMode { bi, en, hi }

/// A pair of strings; the language setting decides which is shown.
class Msg {
  const Msg(this.en, this.hi);
  final String en;
  final String hi;
  String of(LangMode m) => m == LangMode.hi ? hi : en;
}

/// For plain strings (snackbars, hints, dialogs). In "English + हिन्दी" mode
/// this returns English; use [Bi] where the small Hindi line should show.
String tx(BuildContext context, String en, String hi) =>
    AppScope.read(context).lang == LangMode.hi ? hi : en;

/// Text with small Hindi underneath in bilingual mode.
class Bi extends StatelessWidget {
  const Bi(this.en, this.hi,
      {super.key, this.style, this.hiStyle, this.center = false, this.maxLines});
  final String en;
  final String hi;
  final TextStyle? style;
  final TextStyle? hiStyle;
  final bool center;
  final int? maxLines;

  @override
  Widget build(BuildContext context) {
    final mode = AppScope.of(context).lang;
    final base = DefaultTextStyle.of(context).style.merge(style);
    final align = center ? TextAlign.center : TextAlign.start;
    final overflow = maxLines == null ? null : TextOverflow.ellipsis;
    if (mode == LangMode.en) {
      return Text(en, style: base, textAlign: align, maxLines: maxLines, overflow: overflow);
    }
    if (mode == LangMode.hi) {
      return Text(hi, style: base, textAlign: align, maxLines: maxLines, overflow: overflow);
    }
    final baseColor = base.color ?? Theme.of(context).colorScheme.onSurface;
    final small = base
        .copyWith(
          fontSize: (base.fontSize ?? 14) * 0.78,
          fontWeight: FontWeight.w400,
          color: baseColor.withValues(alpha: 0.72),
          height: 1.25,
        )
        .merge(hiStyle);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: center ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      children: [
        Text(en, style: base, textAlign: align, maxLines: maxLines, overflow: overflow),
        Text(hi, style: small, textAlign: align, maxLines: maxLines, overflow: overflow),
      ],
    );
  }
}

const List<String> _monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const List<String> _monthsHi = ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुला', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'];

String two(int n) => n.toString().padLeft(2, '0');

/// Wraps raw 16-bit PCM samples (as the mic stream delivers them) in a
/// minimal 44-byte WAV header so the server's speech-to-text endpoint, which
/// expects a WAV file, can read them directly — no temp files, no platform
/// file APIs, works the same on phone, desktop and web.
Uint8List pcm16ToWav(Uint8List pcm, {int sampleRate = 16000, int channels = 1}) {
  final byteRate = sampleRate * channels * 2;
  final blockAlign = channels * 2;
  final header = ByteData(44);
  void s(int o, String v) {
    for (var i = 0; i < v.length; i++) header.setUint8(o + i, v.codeUnitAt(i));
  }

  s(0, 'RIFF');
  header.setUint32(4, 36 + pcm.length, Endian.little);
  s(8, 'WAVE');
  s(12, 'fmt ');
  header.setUint32(16, 16, Endian.little);
  header.setUint16(20, 1, Endian.little); // PCM
  header.setUint16(22, channels, Endian.little);
  header.setUint32(24, sampleRate, Endian.little);
  header.setUint32(28, byteRate, Endian.little);
  header.setUint16(32, blockAlign, Endian.little);
  header.setUint16(34, 16, Endian.little); // bits per sample
  s(36, 'data');
  header.setUint32(40, pcm.length, Endian.little);
  return Uint8List.fromList([...header.buffer.asUint8List(), ...pcm]);
}

String fmtTime(DateTime d) {
  final l = d.toLocal();
  final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
  return '$h:${two(l.minute)} ${l.hour < 12 ? 'AM' : 'PM'}';
}

String fmtDate(DateTime d, LangMode m) {
  final l = d.toLocal();
  final mon = m == LangMode.hi ? _monthsHi[l.month - 1] : _monthsEn[l.month - 1];
  return '${l.day} $mon ${l.year}';
}

String fmtDateTime(DateTime d, LangMode m) => '${fmtDate(d, m)}, ${fmtTime(d)}';

/// "Today, 5:00 PM" / "Tomorrow, 12:00 PM" / "14 Oct 2026, 11:00 AM".
Msg fmtDue(DateTime d) {
  final now = DateTime.now();
  final l = d.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(l.year, l.month, l.day);
  final diff = day.difference(today).inDays;
  if (diff == 0) return Msg('Today, ${fmtTime(l)}', 'आज, ${fmtTime(l)}');
  if (diff == 1) return Msg('Tomorrow, ${fmtTime(l)}', 'कल, ${fmtTime(l)}');
  if (diff == -1) return Msg('Yesterday, ${fmtTime(l)}', 'बीता कल, ${fmtTime(l)}');
  return Msg(fmtDateTime(l, LangMode.en), fmtDateTime(l, LangMode.hi));
}

String fmtCoord(double? v) => v == null ? '—' : v.toStringAsFixed(6);

String fmtDistance(double metres) =>
    metres < 1000 ? '${metres.round()} m' : '${(metres / 1000).toStringAsFixed(metres < 10000 ? 1 : 0)} km';

String shortHash(String h) => h.length <= 16 ? h : '${h.substring(0, 8)}…${h.substring(h.length - 8)}';

// ============================================================================
// §3  MODELS
// ============================================================================

double? _toDouble(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse('$v');
}

DateTime? _toDate(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse('$v');
}

String _str(dynamic v, [String fallback = '']) => v == null ? fallback : '$v';

class AppUser {
  AppUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.token,
    this.designation = '',
    this.employeeId = '',
    this.district = '',
    this.state = '',
    this.expiresAt,
    this.sessionId = '',
    this.mfaEnabled = false,
    this.lastLoginAt,
    this.lastLoginIp = '',
    this.instituteId = '',
  });

  final String id;
  final String name;
  final String email;
  final String role;

  /// Access token — memory only. Replaced in place by a silent refresh or an
  /// unlock, so the same [AppUser] object stays the "current session".
  String token;

  /// When the access token stops working (null for demo accounts).
  DateTime? expiresAt;
  final String sessionId;
  bool mfaEnabled;

  /// The PREVIOUS successful sign-in (null on the first one).
  final DateTime? lastLoginAt;
  final String lastLoginIp;
  final String designation;
  final String employeeId;
  final String district;
  final String state;

  bool get isDemo => token.startsWith('demo.');
  bool get isOfficial => Roles.isOfficial(role);
  bool get isInstitute => Roles.isInstitute(role);
  bool get isBeneficiary => Roles.isBeneficiary(role);

  /// Institute and beneficiary accounts use the portal side of Nayan
  /// (documents, findings, grievances, schemes) instead of field work.
  bool get isPortal => isInstitute || isBeneficiary;

  /// The institute this account belongs to (staff and residents only).
  final String instituteId;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'role': role,
        'token': token,
        'designation': designation,
        'employeeId': employeeId,
        'district': district,
        'state': state,
        'instituteId': instituteId,
      };

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: _str(j['id']),
        name: _str(j['name']),
        email: _str(j['email']),
        role: _str(j['role']),
        token: _str(j['token']),
        designation: _str(j['designation']),
        employeeId: _str(j['employeeId']),
        district: _str(j['district']),
        state: _str(j['state']),
        instituteId: _str(j['instituteId']),
      );
}

class Institute {
  Institute({
    required this.id,
    required this.name,
    this.type = '',
    this.lat,
    this.lng,
    this.district = '',
    this.state = '',
    this.status = '',
    this.complianceScore,
  });

  final String id;
  final String name;
  final String type;
  final double? lat;
  final double? lng;
  final String district;
  final String state;
  final String status; // red | yellow | green
  final double? complianceScore;

  factory Institute.fromJson(Map<String, dynamic> j) => Institute(
        id: _str(j['id']),
        name: _str(j['name'], 'Institute'),
        type: _str(j['type']),
        lat: _toDouble(j['latitude'] ?? j['lat']),
        lng: _toDouble(j['longitude'] ?? j['lng']),
        district: _str(j['district']),
        state: _str(j['state']),
        status: _str(j['status']),
        complianceScore: _toDouble(j['compliance_score']),
      );

  Msg get typeLabel {
    switch (type) {
      case 'shelter':
        return const Msg('Shelter home', 'आश्रय गृह');
      case 'hostel':
        return const Msg('Hostel', 'छात्रावास');
      case 'old_age_home':
        return const Msg('Old-age home', 'वृद्धाश्रम');
      case 'rehab_centre':
        return const Msg('Rehabilitation centre', 'पुनर्वास केंद्र');
      default:
        return Msg(type.isEmpty ? 'Institute' : type, type.isEmpty ? 'संस्थान' : type);
    }
  }
}

/// Assignment status as the inspector sees it.
class AStatus {
  static const assigned = 'assigned';
  static const inProgress = 'in_progress';
  static const submitted = 'submitted';
  static const verified = 'verified';
  static const rejected = 'rejected';

  static bool isDone(String s) => s == submitted || s == verified;

  static Msg label(String s) {
    switch (s) {
      case inProgress:
        return const Msg('In progress', 'जारी है');
      case submitted:
        return const Msg('Submitted', 'जमा किया');
      case verified:
        return const Msg('Verified', 'सत्यापित');
      case rejected:
        return const Msg('Needs redo', 'दोबारा करें');
      default:
        return const Msg('To visit', 'दौरा बाकी');
    }
  }

  static Color color(String s) {
    switch (s) {
      case inProgress:
        return kSand;
      case submitted:
        return kBlue;
      case verified:
        return kGreen;
      case rejected:
        return kRed;
      default:
        return kForest;
    }
  }

  static IconData icon(String s) {
    switch (s) {
      case inProgress:
        return Icons.timelapse_rounded;
      case submitted:
        return Icons.cloud_done_outlined;
      case verified:
        return Icons.verified_rounded;
      case rejected:
        return Icons.replay_rounded;
      default:
        return Icons.place_outlined;
    }
  }
}

class Assignment {
  Assignment({
    required this.id,
    required this.instituteId,
    required this.institute,
    required this.createdAt,
    this.inspectorId = '',
    this.dueAt,
    this.status = AStatus.assigned,
    this.urgent = false,
    this.notes = const [],
    this.surprise = false,
    this.drawRef = '',
  });

  final String id;
  final String instituteId;
  final String inspectorId;
  final bool surprise; // institute is not told before the dispatch time
  final String drawRef; // commitment hash of the random draw that created it
  final Institute institute;
  final DateTime createdAt;
  final DateTime? dueAt;
  String status;
  final bool urgent;
  final List<Msg> notes; // instructions from the official

  bool get isDemo => id.startsWith('demo-');

  bool get overdue => dueAt != null && !AStatus.isDone(status) && dueAt!.isBefore(DateTime.now());

  bool get dueToday {
    if (dueAt == null) return false;
    final n = DateTime.now();
    final d = dueAt!.toLocal();
    return d.year == n.year && d.month == n.month && d.day == n.day;
  }
}

enum EvKind { photo, video }

enum EvStatus { pending, uploading, ok, rejected, failed }

/// A captured photo/video, kept in memory until it is uploaded.
class Evidence {
  Evidence({
    required this.localId,
    required this.kind,
    required this.bytes,
    required this.fileName,
    required this.capturedAt,
    required this.sha256,
    required this.lat,
    required this.lng,
    required this.accuracy,
    required this.deviceId,
    this.gpsFallback = false,
  });

  final String localId;
  final EvKind kind;
  final Uint8List bytes;
  final String fileName;
  final DateTime capturedAt;
  final String sha256;
  final double? lat;
  final double? lng;
  final double? accuracy;
  final String deviceId;
  final bool gpsFallback; // true when the fresh fix failed and the visit fix was used
  EvStatus status = EvStatus.pending;
  String? reason;
  String? serverId;

  EvidenceRecord toRecord() => EvidenceRecord(
        kind: kind,
        fileName: fileName,
        sha256: sha256,
        capturedAt: capturedAt,
        lat: lat,
        lng: lng,
        accuracy: accuracy,
        sizeBytes: bytes.length,
        status: status,
        reason: reason,
      );
}

/// What is kept on the phone after upload (no file bytes).
class EvidenceRecord {
  EvidenceRecord({
    required this.kind,
    required this.fileName,
    required this.sha256,
    required this.capturedAt,
    required this.lat,
    required this.lng,
    required this.accuracy,
    required this.sizeBytes,
    required this.status,
    this.reason,
  });

  final EvKind kind;
  final String fileName;
  final String sha256;
  final DateTime capturedAt;
  final double? lat;
  final double? lng;
  final double? accuracy;
  final int sizeBytes;
  final EvStatus status;
  final String? reason;

  Map<String, dynamic> toJson() => {
        'kind': kind.name,
        'fileName': fileName,
        'sha256': sha256,
        'capturedAt': capturedAt.toUtc().toIso8601String(),
        'lat': lat,
        'lng': lng,
        'accuracy': accuracy,
        'sizeBytes': sizeBytes,
        'status': status.name,
        'reason': reason,
      };

  factory EvidenceRecord.fromJson(Map<String, dynamic> j) => EvidenceRecord(
        kind: EvKind.values.firstWhere((k) => k.name == j['kind'], orElse: () => EvKind.photo),
        fileName: _str(j['fileName']),
        sha256: _str(j['sha256']),
        capturedAt: _toDate(j['capturedAt']) ?? DateTime.now(),
        lat: _toDouble(j['lat']),
        lng: _toDouble(j['lng']),
        accuracy: _toDouble(j['accuracy']),
        sizeBytes: (j['sizeBytes'] is num) ? (j['sizeBytes'] as num).toInt() : 0,
        status: EvStatus.values.firstWhere((s) => s.name == j['status'], orElse: () => EvStatus.ok),
        reason: j['reason'] == null ? null : '${j['reason']}',
      );
}

class ChecklistItem {
  const ChecklistItem(this.key, this.en, this.hi);
  final String key;
  final String en;
  final String hi;
}

const List<ChecklistItem> kChecklist = [
  ChecklistItem('register', 'Residents\' register is up to date', 'निवासी रजिस्टर अद्यतन है'),
  ChecklistItem('cctv', 'CCTV cameras are working', 'सीसीटीवी कैमरे चालू हैं'),
  ChecklistItem('food', 'Food served as per the menu', 'भोजन मेन्यू के अनुसार दिया जा रहा है'),
  ChecklistItem('water', 'Clean drinking water available', 'स्वच्छ पेयजल उपलब्ध है'),
  ChecklistItem('toilets', 'Toilets clean and separate', 'शौचालय साफ़ और अलग हैं'),
  ChecklistItem('fire', 'Fire-safety equipment in place', 'अग्नि सुरक्षा उपकरण मौजूद हैं'),
  ChecklistItem('grievance', 'Grievance box displayed', 'शिकायत पेटी लगी हुई है'),
  ChecklistItem('staff', 'Staff present as per roster', 'रोस्टर के अनुसार स्टाफ़ उपस्थित है'),
];

const Map<String, Msg> kAnswers = {
  'yes': Msg('Yes', 'हाँ'),
  'no': Msg('No', 'नहीं'),
  'na': Msg('N/A', 'लागू नहीं'),
};

/// Work in progress for one assignment (kept in memory while the app is open).
class InspectionDraft {
  InspectionDraft() : startedAt = DateTime.now();
  final DateTime startedAt;
  double? lat;
  double? lng;
  double? accuracy;
  DateTime? locatedAt;
  final List<Evidence> evidence = [];
  final Map<String, String> answers = {};
  String remarks = '';
}

class Submission {
  Submission({
    required this.id,
    required this.assignmentId,
    required this.instituteId,
    required this.instituteName,
    required this.submittedAt,
    required this.remarks,
    required this.answers,
    required this.evidence,
    required this.status,
    required this.serverRecord,
    required this.lat,
    required this.lng,
    required this.demo,
  });

  final String id;
  final String assignmentId;
  final String instituteId;
  final String instituteName;
  final DateTime submittedAt;
  final String remarks;
  final Map<String, String> answers;
  final List<EvidenceRecord> evidence;
  final String status; // verified | partial | rejected
  final bool serverRecord; // inspection record stored on the server
  final double? lat;
  final double? lng;
  final bool demo;

  int get okCount => evidence.where((e) => e.status == EvStatus.ok).length;

  Map<String, dynamic> toJson() => {
        'id': id,
        'assignmentId': assignmentId,
        'instituteId': instituteId,
        'instituteName': instituteName,
        'submittedAt': submittedAt.toUtc().toIso8601String(),
        'remarks': remarks,
        'answers': answers,
        'evidence': evidence.map((e) => e.toJson()).toList(),
        'status': status,
        'serverRecord': serverRecord,
        'lat': lat,
        'lng': lng,
        'demo': demo,
      };

  factory Submission.fromJson(Map<String, dynamic> j) => Submission(
        id: _str(j['id']),
        assignmentId: _str(j['assignmentId']),
        instituteId: _str(j['instituteId']),
        instituteName: _str(j['instituteName']),
        submittedAt: _toDate(j['submittedAt']) ?? DateTime.now(),
        remarks: _str(j['remarks']),
        answers: (j['answers'] is Map)
            ? (j['answers'] as Map).map((k, v) => MapEntry('$k', '$v'))
            : <String, String>{},
        evidence: (j['evidence'] is List)
            ? (j['evidence'] as List)
                .whereType<Map>()
                .map((e) => EvidenceRecord.fromJson(Map<String, dynamic>.from(e)))
                .toList()
            : <EvidenceRecord>[],
        status: _str(j['status'], 'verified'),
        serverRecord: j['serverRecord'] == true,
        lat: _toDouble(j['lat']),
        lng: _toDouble(j['lng']),
        demo: j['demo'] == true,
      );
}

class UploadResult {
  UploadResult({required this.ok, this.reason, this.serverId});
  final bool ok;
  final String? reason;
  final String? serverId;
}

class YuktAction {
  YuktAction({required this.type, required this.label, this.id});
  final String type; // open_assignment | open_submissions | start_inspection
  final Msg label;
  final String? id;
}

class YuktMsg {
  YuktMsg({required this.fromUser, required this.text, this.actions = const []});
  final bool fromUser;
  final Msg text;
  final List<YuktAction> actions;
}

// ============================================================================
// §4  BACKEND — the same FastAPI contract Sentinel uses (/api/v1)
//
//   POST /auth/login          {email, password} -> TokenResponse
//                             | {mfa_required, mfa_token}   (then /auth/mfa/verify)
//   POST /auth/mfa/verify     {mfa_token, code} -> TokenResponse
//   POST /auth/refresh        -> TokenResponse (new access_token, expires_in)
//   POST /auth/logout         -> {ok}            (best effort on sign-out)
//   GET  /auth/sessions       -> [{id, created_at, last_seen_at, expires_at, ip, device, current}]
//   DELETE /auth/sessions/{id}, POST /auth/logout-others -> {revoked}
//   POST /auth/change-password {current_password, new_password}
//   POST /auth/mfa/setup {password} · /auth/mfa/enable {code} · /auth/mfa/disable {password, code}
//   GET  /assignments         -> Assignment[]   (filtered to this inspector)
//   GET  /institutes          -> Institute[]    (optional; used for names/GPS)
//   POST /evidence/upload     multipart {file, assignment_id, client_hash,
//                             gps_lat, gps_lng, device_id, captured_at, kind}
//                             -> {status: "OK"|"REJECTED", reason?, evidence?}
//   POST /inspections         (optional) {assignment_id, remarks, checklist, ...}
//   POST /assistant/chat      (optional) Yukt on the server
// ============================================================================

class ApiException implements Exception {
  ApiException(this.message, {this.status, this.network = false, this.retryAfter});
  final String message;
  final int? status;
  final bool network;

  /// Seconds from the `Retry-After` header (423 account locked).
  final int? retryAfter;

  @override
  String toString() => message;
}

/// What /auth/login and /auth/mfa/verify answer: a session, or a request for
/// the 6-digit 2-step code.
class AuthReply {
  AuthReply.session(AppUser this.user) : mfaToken = null;
  AuthReply.challenge(String this.mfaToken) : user = null;
  final AppUser? user;
  final String? mfaToken;
}

/// A fresh access token from /auth/refresh.
class TokenGrant {
  TokenGrant(this.token, this.expiresIn);
  final String token;
  final int expiresIn; // seconds
}

/// One signed-in device from /auth/sessions.
class DeviceSession {
  DeviceSession({
    required this.id,
    required this.device,
    required this.ip,
    required this.current,
    this.createdAt,
    this.lastSeenAt,
    this.expiresAt,
  });
  final String id;
  final String device;
  final String ip;
  final bool current;
  final DateTime? createdAt;
  final DateTime? lastSeenAt;
  final DateTime? expiresAt;

  factory DeviceSession.fromJson(Map<String, dynamic> j) => DeviceSession(
        id: _str(j['id']),
        device: _str(j['device'], 'Unknown device'),
        ip: _str(j['ip']),
        current: j['current'] == true,
        createdAt: _toDate(j['created_at']),
        lastSeenAt: _toDate(j['last_seen_at']),
        expiresAt: _toDate(j['expires_at']),
      );
}

/// The authenticator secret from /auth/mfa/setup.
class MfaSetup {
  MfaSetup(this.secret, this.otpauthUri);
  final String secret;
  final String otpauthUri;
}

/// Short platform name for the `X-Client` header (the server's device label).
String _clientPlatform() {
  if (kIsWeb) return 'web';
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      return 'android';
    case TargetPlatform.iOS:
      return 'ios';
    default:
      return defaultTargetPlatform.name.toLowerCase();
  }
}

Map<String, String> get _clientHeader => {'X-Client': 'nayan-${_clientPlatform()}/$kAppVersion'};

abstract class Backend {
  bool get isDemo;

  // ---- session & account security (§21) ----
  Future<TokenGrant> refresh(AppUser user);

  /// Best effort: never throws.
  Future<void> logout(AppUser user);
  Future<List<DeviceSession>> sessions(AppUser user);
  Future<void> revokeSession(AppUser user, String id);

  /// Returns how many other devices were signed out.
  Future<int> logoutOthers(AppUser user);

  /// Returns how many other sessions the server signed out.
  Future<int> changePassword(AppUser user, String current, String next);
  Future<MfaSetup> mfaSetup(AppUser user, String password);

  /// Returns the one-time recovery codes.
  Future<List<String>> mfaEnable(AppUser user, String code);
  Future<void> mfaDisable(AppUser user, String password, String code);

  // ---- field work ----
  Future<List<Assignment>> assignments(AppUser user);
  Future<UploadResult> uploadEvidence(AppUser user, String assignmentId, Evidence e, String deviceId);

  /// Returns true when the server stored the inspection record.
  Future<bool> submitInspection(AppUser user, Map<String, dynamic> payload);

  /// Returns null when the server has no assistant (Yukt then answers locally).
  Future<YuktMsg?> assistant(AppUser user, String message, String lang, List<Map<String, String>> history,
      Map<String, dynamic> context);

  /// Speech-to-text via the server's Bhashini pipeline. Returns null when
  /// unavailable (no server connection, or Bhashini isn't configured) — the
  /// caller then tells the person to type instead.
  Future<String?> speechToText(AppUser user, Uint8List wavBytes, String bhashiniLang);

  /// Text-to-speech via the server's Bhashini pipeline. Returns the raw audio
  /// bytes (WAV) or null when unavailable.
  Future<Uint8List?> textToSpeech(AppUser user, String text, String bhashiniLang);
}

List<dynamic> _asList(dynamic body) {
  if (body is List) return body;
  if (body is Map) {
    for (final k in const ['items', 'data', 'results']) {
      if (body[k] is List) return body[k] as List;
    }
  }
  return const [];
}

class RealBackend implements Backend {
  RealBackend(this.base, this.token);
  final String base;
  final String token;

  @override
  bool get isDemo => false;

  Map<String, String> get _auth =>
      {'Authorization': 'Bearer $token', 'Accept': 'application/json', ..._clientHeader};

  static Uri _u(String base, String path) => Uri.parse('${base.trim().replaceAll(RegExp(r'/+$'), '')}$path');

  static dynamic _decode(http.Response r) {
    dynamic body;
    try {
      body = r.body.isEmpty ? null : jsonDecode(r.body);
    } catch (_) {
      body = null;
    }
    if (r.statusCode >= 200 && r.statusCode < 300) return body;
    var message = 'Server error (${r.statusCode})';
    if (body is Map && body['detail'] != null) {
      final d = body['detail'];
      message = d is String ? d : jsonEncode(d);
    }
    throw ApiException(message, status: r.statusCode, retryAfter: int.tryParse(r.headers['retry-after'] ?? ''));
  }

  static Future<T> _guard<T>(Future<T> Function() run) async {
    try {
      return await run();
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw ApiException('The server did not answer in time.', network: true);
    } catch (_) {
      throw ApiException('Could not reach the server.', network: true);
    }
  }

  /// POST without a session (sign-in steps).
  static Future<dynamic> _postOpen(String base, String path, Map<String, dynamic> body) => _guard(() async {
        final r = await http
            .post(
              _u(base, path),
              headers: {'Content-Type': 'application/json', 'Accept': 'application/json', ..._clientHeader},
              body: jsonEncode(body),
            )
            .timeout(const Duration(seconds: 12));
        return _decode(r);
      });

  /// Turns a login / verify answer into a session or a 2-step challenge.
  static AuthReply _reply(dynamic b, String email) {
    if (b is! Map) throw ApiException('Unexpected reply from the server.');
    if (b['mfa_required'] == true) {
      final t = _str(b['mfa_token']);
      if (t.isEmpty) throw ApiException('The server did not return a verification token.');
      return AuthReply.challenge(t);
    }
    final token = _str(b['access_token']);
    if (token.isEmpty) throw ApiException('The server did not return a session token.');
    final expiresIn = _toDouble(b['expires_in']);
    return AuthReply.session(AppUser(
      id: _str(b['user_id']),
      name: _str(b['name'], email),
      email: email,
      role: _str(b['role']),
      token: token,
      designation: _str(b['designation']),
      employeeId: _str(b['employee_id']),
      district: _str(b['district']),
      state: _str(b['state']),
      expiresAt: expiresIn == null ? null : DateTime.now().add(Duration(seconds: expiresIn.round())),
      sessionId: _str(b['session_id']),
      mfaEnabled: b['mfa_enabled'] == true,
      lastLoginAt: _toDate(b['last_login_at']),
      lastLoginIp: _str(b['last_login_ip']),
      instituteId: _str(b['institute_id']),
    ));
  }

  static Future<AuthReply> login(String base, String email, String password) async =>
      _reply(await _postOpen(base, '/auth/login', {'email': email, 'password': password}), email);

  /// Second sign-in step: a 6-digit authenticator code or a recovery code.
  static Future<AuthReply> verifyMfa(String base, String mfaToken, String code, String email) async =>
      _reply(await _postOpen(base, '/auth/mfa/verify', {'mfa_token': mfaToken, 'code': code}), email);

  /// Authenticated JSON call for the security endpoints.
  Future<dynamic> _call(String method, String path, [Map<String, dynamic>? body]) => _guard(() async {
        final req = http.Request(method, _u(base, path));
        req.headers.addAll({..._auth, 'Content-Type': 'application/json'});
        if (body != null) req.body = jsonEncode(body);
        final streamed = await req.send().timeout(const Duration(seconds: 15));
        return _decode(await http.Response.fromStream(streamed));
      });

  @override
  Future<TokenGrant> refresh(AppUser user) async {
    final b = await _call('POST', '/auth/refresh');
    if (b is! Map || _str(b['access_token']).isEmpty) {
      throw ApiException('The server did not return a session token.');
    }
    return TokenGrant(_str(b['access_token']), (_toDouble(b['expires_in']) ?? 900).round());
  }

  @override
  Future<void> logout(AppUser user) async {
    try {
      await _call('POST', '/auth/logout');
    } catch (_) {
      // Best effort: the local sign-out happens anyway.
    }
  }

  @override
  Future<List<DeviceSession>> sessions(AppUser user) async => _asList(await _call('GET', '/auth/sessions'))
      .whereType<Map>()
      .map((m) => DeviceSession.fromJson(Map<String, dynamic>.from(m)))
      .toList();

  @override
  Future<void> revokeSession(AppUser user, String id) async {
    await _call('DELETE', '/auth/sessions/${Uri.encodeComponent(id)}');
  }

  @override
  Future<int> logoutOthers(AppUser user) async {
    final b = await _call('POST', '/auth/logout-others');
    return b is Map ? (_toDouble(b['revoked']) ?? 0).round() : 0;
  }

  @override
  Future<int> changePassword(AppUser user, String current, String next) async {
    final b = await _call('POST', '/auth/change-password', {'current_password': current, 'new_password': next});
    return b is Map ? (_toDouble(b['revoked_other_sessions']) ?? 0).round() : 0;
  }

  @override
  Future<MfaSetup> mfaSetup(AppUser user, String password) async {
    final b = await _call('POST', '/auth/mfa/setup', {'password': password});
    if (b is! Map || _str(b['secret']).isEmpty) throw ApiException('Unexpected reply from the server.');
    return MfaSetup(_str(b['secret']), _str(b['otpauth_uri']));
  }

  @override
  Future<List<String>> mfaEnable(AppUser user, String code) async {
    final b = await _call('POST', '/auth/mfa/enable', {'code': code});
    if (b is! Map || b['recovery_codes'] is! List) return const [];
    return (b['recovery_codes'] as List).map((x) => '$x').toList();
  }

  @override
  Future<void> mfaDisable(AppUser user, String password, String code) async {
    await _call('POST', '/auth/mfa/disable', {'password': password, 'code': code});
  }

  @override
  Future<List<Assignment>> assignments(AppUser user) => _guard(() async {
        final r = await http.get(_u(base, '/assignments'), headers: _auth).timeout(const Duration(seconds: 12));
        final rows = _asList(_decode(r)).whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();

        // Institute names and GPS. Optional: if the inspector may not list
        // institutes, fall back to the ones embedded in the assignment or the
        // shared sample directory (same ids as Sentinel's demo data).
        final byId = <String, Institute>{};
        try {
          final ri = await http.get(_u(base, '/institutes'), headers: _auth).timeout(const Duration(seconds: 12));
          for (final m in _asList(_decode(ri)).whereType<Map>()) {
            final inst = Institute.fromJson(Map<String, dynamic>.from(m));
            byId[inst.id] = inst;
          }
        } catch (_) {}

        final out = <Assignment>[];
        for (final m in rows) {
          final inspector = _str(m['inspector_id']);
          if (inspector.isNotEmpty && user.id.isNotEmpty && inspector != user.id) continue;
          final instId = _str(m['institute_id']);
          Institute? inst;
          if (m['institute'] is Map) inst = Institute.fromJson(Map<String, dynamic>.from(m['institute'] as Map));
          inst ??= byId[instId] ?? DemoBackend.instituteById(instId);
          inst ??= Institute(id: instId, name: 'Institute ${instId.length > 8 ? instId.substring(0, 8) : instId}');
          final rawStatus = _str(m['status']).toLowerCase();
          out.add(Assignment(
            id: _str(m['id']),
            instituteId: instId,
            inspectorId: inspector,
            institute: inst,
            createdAt: _toDate(m['created_at']) ?? DateTime.now(),
            dueAt: _toDate(m['due_at'] ?? m['dispatch_time']),
            status: const [AStatus.inProgress, AStatus.submitted, AStatus.verified, AStatus.rejected].contains(rawStatus)
                ? rawStatus
                : AStatus.assigned,
            urgent: m['priority'] == 'urgent' || m['urgent'] == true,
            notes: [
              // The backend sends a list of instructions; older builds sent one string.
              if (m['instructions'] is List)
                for (final t in (m['instructions'] as List).map((x) => _str(x)).where((x) => x.isNotEmpty)) Msg(t, t)
              else if (_str(m['instructions']).isNotEmpty)
                Msg(_str(m['instructions']), _str(m['instructions'])),
            ],
          ));
        }
        return out;
      });

  @override
  Future<UploadResult> uploadEvidence(AppUser user, String assignmentId, Evidence e, String deviceId) =>
      _guard(() async {
        final req = http.MultipartRequest('POST', _u(base, '/evidence/upload'));
        req.headers.addAll(_auth);
        req.fields.addAll({
          'assignment_id': assignmentId,
          'client_hash': e.sha256,
          'gps_lat': e.lat?.toString() ?? '',
          'gps_lng': e.lng?.toString() ?? '',
          'device_id': deviceId,
          'captured_at': e.capturedAt.toUtc().toIso8601String(),
          'kind': e.kind.name,
        });
        req.files.add(http.MultipartFile.fromBytes('file', e.bytes, filename: e.fileName));
        final streamed = await req.send().timeout(const Duration(seconds: 120));
        final r = await http.Response.fromStream(streamed);
        final b = _decode(r);
        if (b is! Map) return UploadResult(ok: true);
        final status = _str(b['status'], 'OK').toUpperCase();
        final ev = b['evidence'];
        return UploadResult(
          ok: status == 'OK',
          reason: b['reason'] == null ? null : '${b['reason']}',
          serverId: ev is Map ? _str(ev['id']) : null,
        );
      });

  @override
  Future<bool> submitInspection(AppUser user, Map<String, dynamic> payload) async {
    try {
      final r = await http
          .post(_u(base, '/inspections'),
              headers: {..._auth, 'Content-Type': 'application/json'}, body: jsonEncode(payload))
          .timeout(const Duration(seconds: 20));
      return r.statusCode >= 200 && r.statusCode < 300;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<YuktMsg?> assistant(AppUser user, String message, String lang, List<Map<String, String>> history,
      Map<String, dynamic> context) async {
    try {
      final r = await http
          .post(_u(base, '/assistant/chat'),
              headers: {..._auth, 'Content-Type': 'application/json'},
              body: jsonEncode({'message': message, 'lang': lang, 'history': history, 'context': context, 'app': 'nayan'}))
          .timeout(const Duration(seconds: 25));
      if (r.statusCode < 200 || r.statusCode >= 300) return null;
      final b = jsonDecode(r.body);
      if (b is! Map || b['reply'] == null) return null;
      final reply = '${b['reply']}';
      final actions = <YuktAction>[];
      if (b['actions'] is List) {
        for (final a in (b['actions'] as List).whereType<Map>()) {
          final type = _str(a['type']);
          if (type == 'open_assignment' && a['id'] != null) {
            final label = _str(a['label'], 'Open assignment');
            actions.add(YuktAction(type: type, id: '${a['id']}', label: Msg(label, label)));
          }
        }
      }
      return YuktMsg(fromUser: false, text: Msg(reply, reply), actions: actions);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<String?> speechToText(AppUser user, Uint8List wavBytes, String bhashiniLang) async {
    try {
      final r = await http
          .post(_u(base, '/assistant/asr'),
              headers: {..._auth, 'Content-Type': 'application/json'},
              body: jsonEncode({'audio_base64': base64Encode(wavBytes), 'lang': bhashiniLang, 'sample_rate': 16000}))
          .timeout(const Duration(seconds: 25));
      if (r.statusCode < 200 || r.statusCode >= 300) return null;
      final b = jsonDecode(r.body);
      if (b is! Map || b['text'] == null) return null;
      final text = '${b['text']}'.trim();
      return text.isEmpty ? null : text;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<Uint8List?> textToSpeech(AppUser user, String text, String bhashiniLang) async {
    try {
      final r = await http
          .post(_u(base, '/assistant/tts'),
              headers: {..._auth, 'Content-Type': 'application/json'},
              body: jsonEncode({'text': text, 'lang': bhashiniLang}))
          .timeout(const Duration(seconds: 25));
      if (r.statusCode < 200 || r.statusCode >= 300) return null;
      final b = jsonDecode(r.body);
      if (b is! Map || b['audio_base64'] == null) return null;
      try {
        return base64Decode('${b['audio_base64']}');
      } catch (_) {
        return null;
      }
    } catch (_) {
      return null;
    }
  }
}

// ============================================================================
// §5  DEMO BACKEND — same people and institutes as Sentinel's demo data, so a
//     demo inspection looks right on both sides. Hashes are really checked.
// ============================================================================

class _DemoPerson {
  const _DemoPerson(this.id, this.name, this.role,
      {this.designation = '', this.employeeId = '', this.district = '', this.state = '', this.sites = const []});
  final String id;
  final String name;
  final String role;
  final String designation;
  final String employeeId;
  final String district;
  final String state;
  final List<int> sites;
}

class DemoBackend implements Backend {
  DemoBackend._();
  static final DemoBackend instance = DemoBackend._();

  static const String demoPassword = 'Password123!';

  static const Map<String, _DemoPerson> people = {
    'inspector1@dosje.gov.in': _DemoPerson('3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd', 'Farhan Qureshi', 'inspector',
        designation: 'District Inspector', employeeId: 'UP-INS-0142', district: 'Lucknow', state: 'Uttar Pradesh', sites: [0, 2, 1]),
    'inspector2@dosje.gov.in': _DemoPerson('4d7caf53-2066-41b4-e9d8-3f5abc82b4de', 'Meera Nair', 'inspector',
        designation: 'Senior Inspector', employeeId: 'UP-INS-0087', district: 'Kanpur Nagar', state: 'Uttar Pradesh', sites: [5, 4, 7]),
    'official@dosje.gov.in': _DemoPerson('1a4f7c20-9d33-4e81-b6a5-0c27ef5981ab', 'Anita Deshmukh', 'official',
        designation: 'Deputy Secretary, DoSJE Division', employeeId: 'DOSJE-DS-0021'),
    'district@dosje.gov.in': _DemoPerson('8b3d0e61-7c22-4a91-b5f4-2e6a9c1d7f30', 'Rakesh Srivastava', 'district_authority',
        designation: 'District Social Welfare Officer', employeeId: 'UP-DSWO-LKO', district: 'Lucknow', state: 'Uttar Pradesh'),
    'admin@dosje.gov.in': _DemoPerson('2b5a8d31-0e44-4f92-c7b6-1d38fa6092bc', 'R. Venkatesan', 'admin',
        designation: 'PMU Administrator', employeeId: 'DOSJE-PMU-0003'),
    'staff@dosje.gov.in': _DemoPerson('6f9ec175-4288-43d6-ab01-516cde04d6f0', 'Sunita Rao', 'institute_staff',
        designation: 'Superintendent, Ashray Balika Grih', district: 'Lucknow', state: 'Uttar Pradesh', sites: [0]),
    'beneficiary@dosje.gov.in': _DemoPerson('701fd286-5399-44e7-bc12-627def15e701', 'Kavya Iyer', 'beneficiary',
        designation: 'Resident, Ashray Balika Grih', district: 'Lucknow', state: 'Uttar Pradesh', sites: [0]),
  };

  static final List<Institute> institutes = [
    Institute(id: '3f6c1a20-8e41-4b17-9d02-5a7cbe91d411', name: 'Ashray Balika Grih, Aishbagh', type: 'shelter', lat: 26.8385, lng: 80.9006, district: 'Lucknow', state: 'Uttar Pradesh', status: 'red', complianceScore: 58.4),
    Institute(id: '7b2d9e54-1c88-49a3-8f60-2ed4417ba903', name: 'Nav Jeevan Balgruh, Gomti Nagar', type: 'shelter', lat: 26.8512, lng: 81.0064, district: 'Lucknow', state: 'Uttar Pradesh', status: 'yellow', complianceScore: 71.2),
    Institute(id: 'c41a7f38-5b02-4d9e-a716-90f3c28e6d55', name: 'Sarvodaya Vidyalaya Hostel, Kanpur', type: 'hostel', lat: 26.4499, lng: 80.3319, district: 'Kanpur Nagar', state: 'Uttar Pradesh', status: 'green', complianceScore: 86.0),
    Institute(id: 'e8903b71-4a6f-4c25-b83d-1f7e50c9a264', name: 'Matru Chhaya Vridhashram, Varanasi', type: 'old_age_home', lat: 25.3176, lng: 82.9739, district: 'Varanasi', state: 'Uttar Pradesh', status: 'green', complianceScore: 88.5),
    Institute(id: 'a15d6c93-2e78-4f10-9b44-6c8a3de71f02', name: 'Disha Punarvas Kendra, Prayagraj', type: 'rehab_centre', lat: 25.4358, lng: 81.8463, district: 'Prayagraj', state: 'Uttar Pradesh', status: 'yellow', complianceScore: 69.8),
    Institute(id: 'd72f4e18-9b35-4a6c-8e21-5470ac93b6df', name: 'Shanti Niketan Balika Chhatravas, Agra', type: 'hostel', lat: 27.1767, lng: 78.0081, district: 'Agra', state: 'Uttar Pradesh', status: 'green', complianceScore: 90.1),
    Institute(id: 'b6e0937a-c142-4d58-91af-3e85d206c7b4', name: 'Samarth Divyang Chhatravas, Gorakhpur', type: 'hostel', lat: 26.7606, lng: 83.3732, district: 'Gorakhpur', state: 'Uttar Pradesh', status: 'yellow', complianceScore: 73.4),
    Institute(id: 'f4c82d15-6039-4e7b-a2c8-71bd94e3f0aa', name: 'Anand Ashram Vridhashram, Meerut', type: 'old_age_home', lat: 28.9845, lng: 77.7064, district: 'Meerut', state: 'Uttar Pradesh', status: 'green', complianceScore: 84.7),
    Institute(id: '8c1e2f30-4a55-4b6c-9d7e-1f2a3b4c5d61', name: 'Snehalaya Balgruha, Hadapsar', type: 'shelter', lat: 18.5089, lng: 73.926, district: 'Pune', state: 'Maharashtra', status: 'yellow', complianceScore: 74.6),
    Institute(id: '9d2f3a41-5b66-4c7d-8e8f-2a3b4c5d6e72', name: 'Aadhar Vriddhashram, Nagpur', type: 'old_age_home', lat: 21.1458, lng: 79.0882, district: 'Nagpur', state: 'Maharashtra', status: 'green', complianceScore: 87.2),
    Institute(id: 'ae3a4b52-6c77-4d8e-9f90-3b4c5d6e7f83', name: 'Asha Kiran Chhatravas, Patna', type: 'hostel', lat: 25.5941, lng: 85.1376, district: 'Patna', state: 'Bihar', status: 'red', complianceScore: 61.3),
  ];

  static Institute? instituteById(String id) {
    for (final i in institutes) {
      if (i.id == id) return i;
    }
    return null;
  }

  static bool isDemoEmail(String email) => people.containsKey(email.trim().toLowerCase());

  /// Any non-empty password works for demo accounts (the hint shows Password123!).
  static AppUser? login(String email, String password) {
    final p = people[email.trim().toLowerCase()];
    if (p == null || password.isEmpty) return null;
    return AppUser(
      id: p.id,
      name: p.name,
      email: email.trim().toLowerCase(),
      role: p.role,
      token: 'demo.${p.id}',
      designation: p.designation,
      employeeId: p.employeeId,
      district: p.district,
      state: p.state,
      instituteId: (Roles.isInstitute(p.role) || Roles.isBeneficiary(p.role)) && p.sites.isNotEmpty ? institutes[p.sites.first].id : '',
    );
  }

  static List<int> _sitesFor(String userId) {
    for (final p in people.values) {
      if (p.id == userId && p.sites.length >= 3) return p.sites;
    }
    return const [3, 6, 1];
  }

  static DateTime _at(int dayOffset, int hour, [int minute = 0]) {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day + dayOffset, hour, minute);
  }

  /// The third demo assignment is already done — this is its history entry.
  static Submission seededSubmission(AppUser user) {
    final sites = _sitesFor(user.id);
    final inst = institutes[sites[2]];
    final when = _at(-3, 15, 40);
    EvidenceRecord rec(int i, EvKind k, int minute, String hash) => EvidenceRecord(
          kind: k,
          fileName: k == EvKind.photo ? 'IMG_${1000 + i}.jpg' : 'VID_${1000 + i}.mp4',
          sha256: hash,
          capturedAt: when.subtract(Duration(minutes: minute)),
          lat: (inst.lat ?? 26.8) + 0.00021 * i,
          lng: (inst.lng ?? 80.9) - 0.00017 * i,
          accuracy: 6.0 + i,
          sizeBytes: k == EvKind.photo ? 1843200 + i * 51200 : 14680064,
          status: EvStatus.ok,
        );
    return Submission(
      id: 'demo-sub-${user.id.substring(0, 6)}',
      assignmentId: 'demo-asg-${user.id.substring(0, 6)}-3',
      instituteId: inst.id,
      instituteName: inst.name,
      submittedAt: when,
      remarks:
          'Visited with the superintendent. Registers updated till date; kitchen clean and menu followed. One fire extinguisher past its refill date — asked the institute to refill within 7 days.',
      answers: const {
        'register': 'yes',
        'cctv': 'yes',
        'food': 'yes',
        'water': 'yes',
        'toilets': 'yes',
        'fire': 'no',
        'grievance': 'yes',
        'staff': 'yes',
      },
      evidence: [
        rec(1, EvKind.photo, 34, '9f2c4a1be07d53e8a61c0f47d2b9e3a5c18f6d70b2e94a3c5d81f07e6a2b4c9d'),
        rec(2, EvKind.photo, 27, '4b8e1d7f20c9a63e5f14b7d0a9c2e86f31d5a7b04e9c2f68d1a3b5e7c09f2d46'),
        rec(3, EvKind.video, 18, 'c07a3e9d15b2f84a6e0c1d97b3f5a28e4d6c09b1a7f3e25d8b4c6a0e19f7d352'),
        rec(4, EvKind.photo, 9, '71e5b3c9a0d4f28e6b1c7a95d3e0f4b82c6a1d9e7f05b3a4c8d2e6f19a0b7c35'),
      ],
      status: 'verified',
      serverRecord: true,
      lat: inst.lat,
      lng: inst.lng,
      demo: true,
    );
  }

  @override
  bool get isDemo => true;

  // ---- security: harmless demo answers (the Security screen explains that
  //      these settings need the server; nothing here ever changes a password).
  static ApiException get _needsServer => ApiException('Available when connected to the server.');

  @override
  Future<TokenGrant> refresh(AppUser user) async => TokenGrant(user.token, 900);

  @override
  Future<void> logout(AppUser user) async {}

  @override
  Future<List<DeviceSession>> sessions(AppUser user) async {
    await Future<void>.delayed(const Duration(milliseconds: 300));
    final now = DateTime.now();
    return [
      DeviceSession(
        id: 'demo-session',
        device: 'Nayan app on ${platformLabel()}',
        ip: '—',
        current: true,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now.add(const Duration(hours: 12)),
      ),
    ];
  }

  @override
  Future<void> revokeSession(AppUser user, String id) async {}

  @override
  Future<int> logoutOthers(AppUser user) async => 0;

  @override
  Future<int> changePassword(AppUser user, String current, String next) async => throw _needsServer;

  @override
  Future<MfaSetup> mfaSetup(AppUser user, String password) async => throw _needsServer;

  @override
  Future<List<String>> mfaEnable(AppUser user, String code) async => throw _needsServer;

  @override
  Future<void> mfaDisable(AppUser user, String password, String code) async => throw _needsServer;

  @override
  Future<List<Assignment>> assignments(AppUser user) async {
    await Future<void>.delayed(const Duration(milliseconds: 650));
    final sites = _sitesFor(user.id);
    final short = user.id.length >= 6 ? user.id.substring(0, 6) : user.id;
    return [
      Assignment(
        id: 'demo-asg-$short-1',
        instituteId: institutes[sites[0]].id,
        inspectorId: user.id,
        institute: institutes[sites[0]],
        createdAt: _at(-1, 10, 12),
        dueAt: _at(0, 17),
        urgent: true,
        notes: const [
          Msg('Verify the Dormitory B camera — the feed has been frozen and the institute has not explained it.',
              'डॉरमिटरी B का कैमरा जाँचें — फ़ीड रुकी हुई है और संस्थान ने कारण नहीं बताया।'),
          Msg('Photograph the DVR screen and the network switch.', 'डीवीआर स्क्रीन और नेटवर्क स्विच की फ़ोटो लें।'),
        ],
      ),
      Assignment(
        id: 'demo-asg-$short-2',
        instituteId: institutes[sites[1]].id,
        inspectorId: user.id,
        institute: institutes[sites[1]],
        createdAt: _at(-1, 16, 5),
        dueAt: _at(1, 12),
        notes: const [
          Msg('Routine quarterly inspection. Cross-check the meals complaint with at least five residents.',
              'नियमित त्रैमासिक निरीक्षण। भोजन की शिकायत कम से कम पाँच निवासियों से मिलान करें।'),
        ],
      ),
      Assignment(
        id: 'demo-asg-$short-3',
        instituteId: institutes[sites[2]].id,
        inspectorId: user.id,
        institute: institutes[sites[2]],
        createdAt: _at(-5, 9, 30),
        dueAt: _at(-3, 17),
        status: AStatus.verified,
        notes: const [
          Msg('Renewal inspection before the licence decision.', 'लाइसेंस निर्णय से पहले नवीनीकरण निरीक्षण।'),
        ],
      ),
      ...DemoMonitor.instance.drawnFor(user.id),
    ];
  }

  @override
  Future<UploadResult> uploadEvidence(AppUser user, String assignmentId, Evidence e, String deviceId) async {
    final int ms = 700 + math.min<int>(2500, e.bytes.length ~/ 8000);
    await Future<void>.delayed(Duration(milliseconds: ms));
    if (e.lat == null || e.lng == null) {
      return UploadResult(ok: false, reason: 'GPS location missing');
    }
    // The "server" recomputes the hash of what it received.
    final serverHash = sha256.convert(e.bytes).toString();
    if (serverHash != e.sha256) {
      return UploadResult(ok: false, reason: 'Hash mismatch — file changed after capture');
    }
    return UploadResult(ok: true, serverId: 'demo-ev-${e.localId}');
  }

  @override
  Future<bool> submitInspection(AppUser user, Map<String, dynamic> payload) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    return true;
  }

  @override
  Future<YuktMsg?> assistant(AppUser user, String message, String lang, List<Map<String, String>> history,
      Map<String, dynamic> context) async =>
      null;

  // Voice needs a real server (Bhashini runs there); the mock backend has
  // none, so Yukt's mic/speaker fall back to text in demo mode.
  @override
  Future<String?> speechToText(AppUser user, Uint8List wavBytes, String bhashiniLang) async => null;

  @override
  Future<Uint8List?> textToSpeech(AppUser user, String text, String bhashiniLang) async => null;
}

// ============================================================================
// §5b MONITORING — CCTV, alerts, VC, attendance analytics, random draw
//
//   GET   /institutes                 Institute[]
//   GET   /cameras                    [{id, institute_id, name, status, last_ping_at, snapshot_url?, stream_url?}]
//   GET   /alerts                     [{id, institute_id, type, severity, status, detail, created_at}]
//   PATCH /alerts/{id}/action         {action: reviewed|escalated}
//   GET   /inspectors                 [{id, name, designation, district, state, status, assigned_institute_ids}]
//   GET   /vc/directory?institute_id  (optional) [{id, name, role, phone_masked}]
//   GET   /vc/calls  ·  POST /vc/calls (optional)
//   GET   /analytics/attendance?institute_id=  (optional) [{date, present, enrolled, staff_present, staff_total, camera_uptime}]
//   POST  /assignments/generate       -> Assignment (server-side CSPRNG draw)
//
// Anything the server does not have yet falls back to the demo data below and
// is marked "Demo" in the app.
// ============================================================================

class Roles {
  static const Set<String> inspector = {'inspector', 'pmu', 'inspection_team'};
  static const Set<String> official = {'official', 'admin', 'division', 'state_authority', 'district_authority'};

  static const Set<String> institute = {'institute_staff', 'institute', 'institute_admin'};
  static const Set<String> beneficiary = {'beneficiary'};

  static bool isInspector(String r) => inspector.contains(r.toLowerCase());
  static bool isOfficial(String r) => official.contains(r.toLowerCase());
  static bool isInstitute(String r) => institute.contains(r.toLowerCase());
  static bool isBeneficiary(String r) => beneficiary.contains(r.toLowerCase());
  static bool isKnown(String r) => isInspector(r) || isOfficial(r) || isInstitute(r) || isBeneficiary(r);

  static Msg label(String r) {
    switch (r.toLowerCase()) {
      case 'inspector':
      case 'inspection_team':
        return const Msg('Inspector · PMU team', 'निरीक्षक · पीएमयू दल');
      case 'pmu':
        return const Msg('PMU team', 'पीएमयू दल');
      case 'admin':
        return const Msg('PMU administrator', 'पीएमयू प्रशासक');
      case 'district_authority':
        return const Msg('District authority', 'ज़िला प्राधिकारी');
      case 'state_authority':
        return const Msg('State authority', 'राज्य प्राधिकारी');
      case 'institute_staff':
      case 'institute':
      case 'institute_admin':
        return const Msg('Institute staff', 'संस्थान कर्मचारी');
      case 'beneficiary':
        return const Msg('Beneficiary', 'लाभार्थी');
      default:
        return const Msg('DoSJE division official', 'डीओएसजेई प्रभाग अधिकारी');
    }
  }
}

class CameraFeed {
  CameraFeed({
    required this.id,
    required this.instituteId,
    required this.name,
    required this.status,
    this.lastPing,
    this.snapshotUrl,
    this.streamUrl,
  });

  final String id;
  final String instituteId;
  final String name;
  String status; // online | stale | offline
  final DateTime? lastPing;
  final String? snapshotUrl;
  final String? streamUrl;

  bool get online => status == 'online';

  factory CameraFeed.fromJson(Map<String, dynamic> j) => CameraFeed(
        id: _str(j['id']),
        instituteId: _str(j['institute_id']),
        name: _str(j['name'], 'Camera'),
        status: _str(j['status'], 'online').toLowerCase(),
        lastPing: _toDate(j['last_ping_at']),
        snapshotUrl: j['snapshot_url'] == null ? null : '${j['snapshot_url']}',
        streamUrl: j['stream_url'] == null ? null : '${j['stream_url']}',
      );

  static Msg statusLabel(String s) {
    switch (s) {
      case 'online':
        return const Msg('Live', 'लाइव');
      case 'stale':
        return const Msg('Frozen', 'रुकी हुई');
      default:
        return const Msg('Offline', 'बंद');
    }
  }

  static Color statusColor(String s) => s == 'online' ? kGreen : (s == 'stale' ? kAmber : kRed);
}

class AlertItem {
  AlertItem({
    required this.id,
    required this.instituteId,
    required this.type,
    required this.severity,
    required this.status,
    required this.detail,
    required this.createdAt,
  });

  final String id;
  final String instituteId;
  final String type;
  final String severity; // red | yellow
  String status; // open | reviewed | escalated
  final String detail;
  final DateTime createdAt;

  factory AlertItem.fromJson(Map<String, dynamic> j) => AlertItem(
        id: _str(j['id']),
        instituteId: _str(j['institute_id']),
        type: _str(j['type'], 'anomaly'),
        severity: _str(j['severity'], 'yellow'),
        status: _str(j['status'], 'open'),
        detail: _str(j['detail']),
        createdAt: _toDate(j['created_at']) ?? DateTime.now(),
      );

  Msg get typeLabel {
    switch (type) {
      case 'attendance_spike':
        return const Msg('Attendance spike', 'उपस्थिति में उछाल');
      case 'anomaly':
        return const Msg('Pattern alert', 'विसंगति चेतावनी');
      case 'vc_miss':
        return const Msg('Missed verification call', 'सत्यापन कॉल छूटी');
      case 'hash_mismatch':
        return const Msg('Evidence hash mismatch', 'साक्ष्य हैश मेल नहीं');
      case 'geofence_breach':
        return const Msg('Geofence breach', 'जियोफ़ेंस उल्लंघन');
      case 'camera_offline':
        return const Msg('Camera offline', 'कैमरा बंद');
      case 'cctv_tamper':
        return const Msg('CCTV tamper', 'सीसीटीवी से छेड़छाड़');
      default:
        final t = type.replaceAll('_', ' ');
        return Msg(t, t);
    }
  }

  IconData get icon {
    switch (type) {
      case 'attendance_spike':
        return Icons.groups_rounded;
      case 'vc_miss':
        return Icons.phone_missed_rounded;
      case 'hash_mismatch':
        return Icons.gpp_bad_rounded;
      case 'geofence_breach':
        return Icons.wrong_location_outlined;
      case 'camera_offline':
        return Icons.videocam_off_rounded;
      case 'cctv_tamper':
        return Icons.no_photography_outlined;
      default:
        return Icons.insights_rounded;
    }
  }
}

class VcParticipant {
  VcParticipant({required this.id, required this.instituteId, required this.name, required this.role, this.phoneMasked = ''});
  final String id;
  final String instituteId;
  final String name;
  final String role; // incharge | staff | beneficiary
  final String phoneMasked;

  factory VcParticipant.fromJson(Map<String, dynamic> j, String instituteId) => VcParticipant(
        id: _str(j['id']),
        instituteId: _str(j['institute_id'], instituteId),
        name: _str(j['name'], 'Participant'),
        role: _str(j['role'], 'staff'),
        phoneMasked: _str(j['phone_masked']),
      );

  static Msg roleLabel(String r) {
    switch (r) {
      case 'incharge':
        return const Msg('Project in-charge', 'परियोजना प्रभारी');
      case 'beneficiary':
        return const Msg('Beneficiary', 'लाभार्थी');
      default:
        return const Msg('Staff', 'कर्मचारी');
    }
  }
}

class VcCall {
  VcCall({
    required this.id,
    required this.instituteId,
    required this.instituteName,
    required this.participantName,
    required this.participantRole,
    required this.startedAt,
    required this.outcome,
    required this.room,
    required this.byName,
    this.identityOk,
    this.premisesShown,
    this.headcount,
    this.notes = '',
    this.random = true,
  });

  final String id;
  final String instituteId;
  final String instituteName;
  final String participantName;
  final String participantRole;
  final DateTime startedAt;
  String outcome; // pending | connected | no_answer | wrong_person
  final String room;
  final String byName;
  bool? identityOk;
  bool? premisesShown;
  int? headcount;
  String notes;
  final bool random;

  Map<String, dynamic> toJson() => {
        'id': id,
        'institute_id': instituteId,
        'institute_name': instituteName,
        'participant_name': participantName,
        'participant_role': participantRole,
        'started_at': startedAt.toUtc().toIso8601String(),
        'outcome': outcome,
        'room': room,
        'by_name': byName,
        'identity_ok': identityOk,
        'premises_shown': premisesShown,
        'headcount': headcount,
        'notes': notes,
        'random': random,
      };

  factory VcCall.fromJson(Map<String, dynamic> j) => VcCall(
        id: _str(j['id']),
        instituteId: _str(j['institute_id']),
        instituteName: _str(j['institute_name'], 'Institute'),
        participantName: _str(j['participant_name'], '—'),
        participantRole: _str(j['participant_role'], 'staff'),
        startedAt: _toDate(j['started_at']) ?? DateTime.now(),
        outcome: _str(j['outcome'], 'pending'),
        room: _str(j['room']),
        byName: _str(j['by_name']),
        identityOk: j['identity_ok'] is bool ? j['identity_ok'] as bool : null,
        premisesShown: j['premises_shown'] is bool ? j['premises_shown'] as bool : null,
        headcount: j['headcount'] is num ? (j['headcount'] as num).toInt() : null,
        notes: _str(j['notes']),
        random: j['random'] != false,
      );

  static Msg outcomeLabel(String o) {
    switch (o) {
      case 'connected':
        return const Msg('Connected', 'जुड़ गया');
      case 'no_answer':
        return const Msg('Not answered', 'उत्तर नहीं');
      case 'wrong_person':
        return const Msg('Wrong person', 'ग़लत व्यक्ति');
      default:
        return const Msg('Outcome pending', 'परिणाम बाकी');
    }
  }

  static Color outcomeColor(String o) =>
      o == 'connected' ? kGreen : (o == 'pending' ? kBlue : (o == 'no_answer' ? kAmber : kRed));
}

class AttendanceDay {
  AttendanceDay({
    required this.day,
    required this.present,
    required this.enrolled,
    required this.staffPresent,
    required this.staffTotal,
    required this.cameraUptime,
  });

  final DateTime day;
  final int present;
  final int enrolled;
  final int staffPresent;
  final int staffTotal;
  final double cameraUptime; // 0..1

  factory AttendanceDay.fromJson(Map<String, dynamic> j) => AttendanceDay(
        day: _toDate(j['date']) ?? DateTime.now(),
        present: (j['present'] is num) ? (j['present'] as num).toInt() : 0,
        enrolled: (j['enrolled'] is num) ? (j['enrolled'] as num).toInt() : 0,
        staffPresent: (j['staff_present'] is num) ? (j['staff_present'] as num).toInt() : 0,
        staffTotal: (j['staff_total'] is num) ? (j['staff_total'] as num).toInt() : 0,
        cameraUptime: _toDouble(j['camera_uptime']) ?? 1,
      );
}

class Anomaly {
  Anomaly({
    required this.instituteId,
    required this.kind,
    required this.severity,
    required this.title,
    required this.detail,
    required this.score,
    this.day,
  });

  final String instituteId;
  final String kind; // spike | above_enrolment | flatline | cctv_down | staff_flat
  final String severity; // red | yellow
  final Msg title;
  final Msg detail;
  final double score;
  final DateTime? day;
}

class InspectorInfo {
  InspectorInfo({
    required this.id,
    required this.name,
    this.designation = '',
    this.district = '',
    this.state = '',
    this.status = 'available',
    this.lastInstituteIds = const [],
    this.load = 0,
  });

  final String id;
  final String name;
  final String designation;
  final String district;
  final String state;
  final String status; // available | on_site | offline
  final List<String> lastInstituteIds;
  int load;

  factory InspectorInfo.fromJson(Map<String, dynamic> j) => InspectorInfo(
        id: _str(j['id']),
        name: _str(j['name'], 'Inspector'),
        designation: _str(j['designation']),
        district: _str(j['district']),
        state: _str(j['state']),
        status: _str(j['status'], 'available'),
        lastInstituteIds: (j['assigned_institute_ids'] is List)
            ? (j['assigned_institute_ids'] as List).map((e) => '$e').toList()
            : const <String>[],
      );
}

class RiskRow {
  RiskRow({
    required this.inst,
    required this.compliance,
    required this.alerts,
    required this.recency,
    required this.anomaly,
    required this.openAlerts,
    required this.daysSince,
    required this.anomalies,
  });

  final Institute inst;
  final double compliance; // 0..1 (higher = worse)
  final double alerts; // 0..1
  final double recency; // 0..1
  final double anomaly; // 0..1
  final int openAlerts;
  final int daysSince;
  final int anomalies;

  double get score => 0.35 * compliance + 0.25 * alerts + 0.20 * recency + 0.20 * anomaly;
}

class DrawPick {
  DrawPick({
    required this.inst,
    required this.inspector,
    required this.weight,
    required this.probability,
    required this.dispatchAt,
    this.assignmentId = '',
  });

  final Institute inst;
  final InspectorInfo inspector;
  final double weight;
  final double probability;
  final DateTime dispatchAt;
  String assignmentId;
}

class DrawResult {
  DrawResult({
    required this.seed,
    required this.commitment,
    required this.strategy,
    required this.picks,
    required this.at,
    required this.byName,
  });

  final String seed;
  final String commitment;
  final String strategy; // risk | uniform
  final List<DrawPick> picks;
  final DateTime at;
  final String byName;
}

class LiveEvent {
  LiveEvent({required this.at, required this.kind, required this.text, this.instituteId});
  final DateTime at;
  final String kind; // alert | camera | attendance | inspection | vc | evidence
  final Msg text;
  final String? instituteId;

  IconData get icon {
    switch (kind) {
      case 'alert':
        return Icons.warning_amber_rounded;
      case 'camera':
        return Icons.videocam_rounded;
      case 'attendance':
        return Icons.how_to_reg_rounded;
      case 'inspection':
        return Icons.fact_check_rounded;
      case 'vc':
        return Icons.video_call_rounded;
      default:
        return Icons.verified_rounded;
    }
  }
}

// ---------------------------------------------------------------------------
// Deterministic, verifiable randomness. The seed comes from Random.secure();
// its SHA-256 (the commitment) is shown before the result, and every random
// number is SHA-256(seed:counter) — anyone holding the seed can re-run the draw.
// ---------------------------------------------------------------------------
class SeededRandom {
  SeededRandom(this.seed);
  final String seed;
  int _counter = 0;

  double next() {
    final d = sha256.convert(utf8.encode('$seed:${_counter++}')).bytes;
    final v = (d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3];
    return v / 4294967296.0;
  }

  static String newSeed() => _randomHex(64);
  static String commitmentOf(String seed) => sha256.convert(utf8.encode(seed)).toString();
}

int _pickWeighted(SeededRandom rng, List<double> weights) {
  final total = weights.fold<double>(0, (a, b) => a + b);
  if (total <= 0) return math.min(weights.length - 1, (rng.next() * weights.length).floor());
  var x = rng.next() * total;
  for (var i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/// The draw engine used for demo draws and to explain/verify server draws.
DrawResult runDraw({
  required List<RiskRow> rows,
  required List<InspectorInfo> inspectors,
  required bool riskWeighted,
  required int count,
  required String byName,
  String? seed,
}) {
  final s = seed ?? SeededRandom.newSeed();
  final rng = SeededRandom(s);
  final pool = [...rows];
  final picks = <DrawPick>[];
  final load = {for (final i in inspectors) i.id: i.load};
  for (var k = 0; k < count && pool.isNotEmpty; k++) {
    final weights = [for (final r in pool) riskWeighted ? 0.4 + 2.6 * r.score : 1.0];
    final total = weights.fold<double>(0, (a, b) => a + b);
    final idx = _pickWeighted(rng, weights);
    final row = pool.removeAt(idx);
    final inst = row.inst;

    // Inspector: same state, not the last one to inspect this institute, not
    // posted in the same district (conflict of interest), lighter load first.
    var eligible = inspectors.where((i) => i.state.isEmpty || inst.state.isEmpty || i.state == inst.state).toList();
    if (eligible.isEmpty) eligible = [...inspectors];
    final notLast = eligible.where((i) => !i.lastInstituteIds.contains(inst.id)).toList();
    if (notLast.isNotEmpty) eligible = notLast;
    InspectorInfo chosen;
    if (eligible.isEmpty) {
      chosen = InspectorInfo(id: '', name: 'Unassigned');
    } else {
      final iw = [
        for (final i in eligible)
          (1 / (1 + (load[i.id] ?? 0))) *
              (i.district.isNotEmpty && i.district == inst.district ? 0.25 : 1.0) *
              (i.status == 'offline' ? 0.3 : 1.0),
      ];
      chosen = eligible[_pickWeighted(rng, iw)];
      load[chosen.id] = (load[chosen.id] ?? 0) + 1;
    }
    final hours = 1 + (rng.next() * 35).floor();
    final quarter = (rng.next() * 4).floor() * 15;
    final now = DateTime.now();
    final dispatch = DateTime(now.year, now.month, now.day, now.hour).add(Duration(hours: hours, minutes: quarter));
    picks.add(DrawPick(
      inst: inst,
      inspector: chosen,
      weight: weights[idx],
      probability: total == 0 ? 0 : weights[idx] / total,
      dispatchAt: dispatch,
    ));
  }
  return DrawResult(
    seed: s,
    commitment: SeededRandom.commitmentOf(s),
    strategy: riskWeighted ? 'risk' : 'uniform',
    picks: picks,
    at: DateTime.now(),
    byName: byName,
  );
}

// ---------------------------------------------------------------------------
// On-device anomaly checks (the server runs an Isolation Forest; these are the
// transparent rules the app can explain line by line).
// ---------------------------------------------------------------------------
List<Anomaly> detectAnomalies(Institute inst, List<AttendanceDay> days) {
  final out = <Anomaly>[];
  if (days.length < 6) return out;
  String d(DateTime x) => fmtDate(x, LangMode.en);
  String dh(DateTime x) => fmtDate(x, LangMode.hi);

  // 1. Spikes against the institute's own recent baseline.
  for (var i = 7; i < days.length; i++) {
    final window = days.sublist(math.max(0, i - 14), i).map((e) => e.present.toDouble()).toList();
    final mean = window.reduce((a, b) => a + b) / window.length;
    final variance = window.map((v) => (v - mean) * (v - mean)).reduce((a, b) => a + b) / window.length;
    final sd = math.max(1.5, math.sqrt(variance));
    final z = (days[i].present - mean) / sd;
    if (z >= 2.5) {
      final pct = ((days[i].present - mean) / math.max(1, mean) * 100).round();
      out.add(Anomaly(
        instituteId: inst.id,
        kind: 'spike',
        severity: z >= 4 ? 'red' : 'yellow',
        day: days[i].day,
        score: z,
        title: Msg('Attendance spike on ${d(days[i].day)}', '${dh(days[i].day)} को उपस्थिति में उछाल'),
        detail: Msg('${days[i].present} marked present — $pct% above the 14-day baseline of ${mean.round()} (z = ${z.toStringAsFixed(1)}).',
            '${days[i].present} उपस्थित दर्ज — 14 दिन के औसत ${mean.round()} से $pct% अधिक (z = ${z.toStringAsFixed(1)})।'),
      ));
    }
  }

  // 2. More present than enrolled.
  final over = days.where((e) => e.enrolled > 0 && e.present > e.enrolled).toList();
  if (over.isNotEmpty) {
    final last = over.last;
    out.add(Anomaly(
      instituteId: inst.id,
      kind: 'above_enrolment',
      severity: 'red',
      day: last.day,
      score: 5,
      title: Msg('Attendance above enrolment on ${over.length} day(s)', '${over.length} दिन नामांकन से अधिक उपस्थिति'),
      detail: Msg('Latest: ${last.present} present against ${last.enrolled} enrolled — physically impossible without fake entries.',
          'नवीनतम: ${last.enrolled} नामांकित पर ${last.present} उपस्थित — फ़र्ज़ी प्रविष्टि के बिना असंभव।'),
    ));
  }

  // 3. Identical numbers day after day — typical of proxy marking.
  var run = 1;
  var bestRun = 1;
  DateTime? runEnd;
  for (var i = 1; i < days.length; i++) {
    run = days[i].present == days[i - 1].present ? run + 1 : 1;
    if (run > bestRun) {
      bestRun = run;
      runEnd = days[i].day;
    }
  }
  if (bestRun >= 6 && runEnd != null) {
    out.add(Anomaly(
      instituteId: inst.id,
      kind: 'flatline',
      severity: 'red',
      day: runEnd,
      score: bestRun.toDouble(),
      title: Msg('Same attendance for $bestRun days in a row', 'लगातार $bestRun दिन एक जैसी उपस्थिति'),
      detail: const Msg('Real attendance always varies a little. A flat line usually means the register is being filled without a roll call (proxy functioning).',
          'असली उपस्थिति हर दिन थोड़ी बदलती है। सपाट रेखा का अर्थ अक्सर बिना हाज़िरी लिए रजिस्टर भरना (प्रॉक्सी) है।'),
    ));
  }

  // 4. Attendance marked while the cameras were down.
  final blind = days.where((e) => e.cameraUptime < 0.25 && e.enrolled > 0 && e.present > e.enrolled * 0.5).toList();
  if (blind.isNotEmpty) {
    final b = blind.last;
    out.add(Anomaly(
      instituteId: inst.id,
      kind: 'cctv_down',
      severity: 'yellow',
      day: b.day,
      score: 3,
      title: Msg('Attendance marked while CCTV was down (${d(b.day)})', 'सीसीटीवी बंद रहते उपस्थिति दर्ज (${dh(b.day)})'),
      detail: Msg('Camera uptime was ${(b.cameraUptime * 100).round()}% but ${b.present} residents were marked present. Verify with a surprise visit or VC.',
          'कैमरा अपटाइम ${(b.cameraUptime * 100).round()}% था पर ${b.present} निवासी उपस्थित दर्ज। अचानक दौरे या वीसी से जाँचें।'),
    ));
  }

  // 5. Staff at 100% every single day.
  var staffRun = 0;
  for (final e in days.reversed) {
    if (e.staffTotal > 0 && e.staffPresent == e.staffTotal) {
      staffRun++;
    } else {
      break;
    }
  }
  if (staffRun >= 10) {
    out.add(Anomaly(
      instituteId: inst.id,
      kind: 'staff_flat',
      severity: 'yellow',
      day: days.last.day,
      score: staffRun / 3,
      title: Msg('All staff present for $staffRun straight days', 'लगातार $staffRun दिन सभी कर्मचारी उपस्थित'),
      detail: const Msg('No leave, no late arrival for two weeks is unusual. Check biometric logs for the same device marking several people.',
          'दो सप्ताह तक कोई छुट्टी या देरी न होना असामान्य है। बायोमेट्रिक लॉग में एक ही डिवाइस से कई लोगों की हाज़िरी जाँचें।'),
    ));
  }

  out.sort((a, b) {
    final s = (b.severity == 'red' ? 1 : 0).compareTo(a.severity == 'red' ? 1 : 0);
    if (s != 0) return s;
    return (b.day ?? DateTime(2000)).compareTo(a.day ?? DateTime(2000));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Monitoring API: real server first, demo data when a route is missing.
// ---------------------------------------------------------------------------
abstract class MonitorApi {
  Future<List<Institute>> institutes();
  Future<List<CameraFeed>> cameras();
  Future<List<AlertItem>> alerts();
  Future<void> alertAction(String id, String action);
  Future<List<InspectorInfo>> inspectors();
  Future<List<VcParticipant>> vcDirectory(String instituteId);
  Future<List<VcCall>> vcCalls();
  Future<void> logVcCall(VcCall c);
  Future<List<AttendanceDay>> attendance(String instituteId);
  Future<List<Assignment>> createAssignments(DrawResult r);
}

class RealMonitor implements MonitorApi {
  RealMonitor(this.base, this.token);
  final String base;
  final String token;

  Map<String, String> get _h => {'Authorization': 'Bearer $token', 'Accept': 'application/json', ..._clientHeader};
  Uri _u(String path) => Uri.parse('${base.trim().replaceAll(RegExp(r'/+$'), '')}$path');

  Future<List<Map<String, dynamic>>> _list(String path) => RealBackend._guard(() async {
        final r = await http.get(_u(path), headers: _h).timeout(const Duration(seconds: 12));
        return _asList(RealBackend._decode(r)).whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
      });

  Future<dynamic> _send(String method, String path, Map<String, dynamic>? body) => RealBackend._guard(() async {
        final req = http.Request(method, _u(path));
        req.headers.addAll({..._h, 'Content-Type': 'application/json'});
        if (body != null) req.body = jsonEncode(body);
        final streamed = await req.send().timeout(const Duration(seconds: 15));
        return RealBackend._decode(await http.Response.fromStream(streamed));
      });

  @override
  Future<List<Institute>> institutes() async => (await _list('/institutes')).map(Institute.fromJson).toList();

  @override
  Future<List<CameraFeed>> cameras() async => (await _list('/cameras')).map(CameraFeed.fromJson).toList();

  @override
  Future<List<AlertItem>> alerts() async => (await _list('/alerts')).map(AlertItem.fromJson).toList();

  @override
  Future<void> alertAction(String id, String action) async {
    await _send('PATCH', '/alerts/$id/action', {'action': action});
  }

  @override
  Future<List<InspectorInfo>> inspectors() async => (await _list('/inspectors')).map(InspectorInfo.fromJson).toList();

  @override
  Future<List<VcParticipant>> vcDirectory(String instituteId) async =>
      (await _list('/vc/directory?institute_id=$instituteId')).map((m) => VcParticipant.fromJson(m, instituteId)).toList();

  @override
  Future<List<VcCall>> vcCalls() async => (await _list('/vc/calls')).map(VcCall.fromJson).toList();

  @override
  Future<void> logVcCall(VcCall c) async {
    await _send('POST', '/vc/calls', c.toJson());
  }

  @override
  Future<List<AttendanceDay>> attendance(String instituteId) async =>
      (await _list('/analytics/attendance?institute_id=$instituteId')).map(AttendanceDay.fromJson).toList();

  @override
  Future<List<Assignment>> createAssignments(DrawResult r) async {
    final out = <Assignment>[];
    for (final p in r.picks) {
      final b = await _send('POST', '/assignments/generate', {
        'institute_id': p.inst.id,
        'inspector_id': p.inspector.id,
        'dispatch_time': p.dispatchAt.toUtc().toIso8601String(),
        'strategy': r.strategy,
        'seed_commitment': r.commitment,
      });
      if (b is Map) {
        final m = Map<String, dynamic>.from(b);
        p.assignmentId = _str(m['id']);
        out.add(Assignment(
          id: p.assignmentId,
          instituteId: _str(m['institute_id'], p.inst.id),
          inspectorId: _str(m['inspector_id'], p.inspector.id),
          institute: p.inst,
          createdAt: _toDate(m['created_at']) ?? DateTime.now(),
          dueAt: _toDate(m['dispatch_time']) ?? p.dispatchAt,
          surprise: true,
          drawRef: r.commitment,
        ));
      }
    }
    return out;
  }
}

class _DemoCamPlan {
  const _DemoCamPlan(this.site, this.names, this.statuses);
  final int site;
  final List<String> names;
  final List<String> statuses;
}

class DemoMonitor implements MonitorApi {
  DemoMonitor._();
  static final DemoMonitor instance = DemoMonitor._();

  SharedPreferences? prefs;
  final List<Assignment> _drawn = [];
  List<VcCall>? _calls;
  List<AlertItem>? _alerts;
  bool _loaded = false;

  static const List<_DemoCamPlan> _camPlan = [
    _DemoCamPlan(0, ['Main Gate', 'Dormitory A', 'Dormitory B', 'Kitchen'], ['online', 'online', 'stale', 'online']),
    _DemoCamPlan(1, ['Main Gate', 'Common Hall', 'Dormitory'], ['online', 'online', 'online']),
    _DemoCamPlan(2, ['Main Gate', 'Study Hall', 'Mess'], ['online', 'online', 'online']),
    _DemoCamPlan(3, ['Reception', 'Ward A'], ['online', 'online']),
    _DemoCamPlan(4, ['Main Gate', 'Counselling Room'], ['stale', 'online']),
    _DemoCamPlan(5, ['Main Gate', 'Dormitory'], ['online', 'online']),
    _DemoCamPlan(6, ['Main Gate', 'Corridor'], ['offline', 'online']),
    _DemoCamPlan(7, ['Reception', 'Garden'], ['online', 'online']),
    _DemoCamPlan(8, ['Main Gate', 'Dormitory'], ['offline', 'online']),
    _DemoCamPlan(9, ['Reception'], ['online']),
    _DemoCamPlan(10, ['Main Gate', 'Mess'], ['online', 'stale']),
  ];

  static const List<String> _incharges = [
    'Smt. Kamla Verma', 'Shri Anil Tiwari', 'Dr. Seema Mishra', 'Shri Harish Pandey', 'Smt. Neelam Gupta',
    'Shri Vikas Chauhan', 'Smt. Pushpa Yadav', 'Shri Manoj Saxena', 'Smt. Sunanda Patil', 'Shri Prakash Deshpande', 'Smt. Rekha Sinha',
  ];
  static const List<String> _staffNames = ['Ramesh (Warden)', 'Sunita (Cook)', 'Mohd. Arif (Guard)', 'Geeta (Caretaker)', 'Rajesh (Clerk)', 'Asha (Nurse)'];
  static const List<String> _beneficiaries = ['R. K. · Room 4', 'S. P. · Room 7', 'A. M. · Room 11', 'N. D. · Room 2', 'P. S. · Room 9', 'K. L. · Room 5', 'M. B. · Room 12'];

  List<InspectorInfo> get _inspectors => [
        InspectorInfo(id: '3c6b9e42-1f55-40a3-d8c7-2e49ab71a3cd', name: 'Farhan Qureshi', designation: 'District Inspector', district: 'Lucknow', state: 'Uttar Pradesh', status: 'on_site', lastInstituteIds: [DemoBackend.institutes[2].id]),
        InspectorInfo(id: '4d7caf53-2066-41b4-e9d8-3f5abc82b4de', name: 'Meera Nair', designation: 'Senior Inspector', district: 'Kanpur Nagar', state: 'Uttar Pradesh', status: 'available', lastInstituteIds: [DemoBackend.institutes[7].id]),
        InspectorInfo(id: '5e8db064-3177-42c5-fae9-405bcd93c5ef', name: 'Rajesh Yadav', designation: 'District Inspector', district: 'Gorakhpur', state: 'Uttar Pradesh', status: 'offline', lastInstituteIds: [DemoBackend.institutes[6].id]),
        InspectorInfo(id: '6f9fc175-4288-43d6-ab01-516cde04d7a1', name: 'Sunil Patil', designation: 'District Inspector', district: 'Pune', state: 'Maharashtra', status: 'available', lastInstituteIds: [DemoBackend.institutes[8].id]),
        InspectorInfo(id: '7a0ad286-5399-44e7-bc12-627def15e8b2', name: 'Anjali Kumari', designation: 'District Inspector', district: 'Patna', state: 'Bihar', status: 'on_site', lastInstituteIds: const []),
      ];

  static DateTime _hoursAgo(double h) => DateTime.now().subtract(Duration(minutes: (h * 60).round()));

  void _ensure() {
    if (_loaded) return;
    _loaded = true;
    final inst = DemoBackend.institutes;
    _alerts = [
      AlertItem(id: 'al-0001', instituteId: inst[0].id, type: 'anomaly', severity: 'red', status: 'open', createdAt: _hoursAgo(5),
          detail: 'Anomaly score -0.0847 against 60 days of history. Attendance 41% above baseline while CCTV uptime fell to 52%.'),
      AlertItem(id: 'al-0002', instituteId: inst[0].id, type: 'cctv_tamper', severity: 'red', status: 'open', createdAt: _hoursAgo(9),
          detail: "Perceptual hash identical across 7 consecutive frames on feed 'Dormitory B' — feed is frozen or looping."),
      AlertItem(id: 'al-0003', instituteId: inst[1].id, type: 'vc_miss', severity: 'yellow', status: 'open', createdAt: _hoursAgo(26),
          detail: 'Verification call to a registered beneficiary went unanswered across a 20-minute pickup window.'),
      AlertItem(id: 'al-0004', instituteId: inst[4].id, type: 'hash_mismatch', severity: 'red', status: 'open', createdAt: _hoursAgo(31),
          detail: 'Evidence upload rejected: client hash 0e3b…a91f, server-computed 7c42…08dd.'),
      AlertItem(id: 'al-0005', instituteId: inst[1].id, type: 'attendance_spike', severity: 'yellow', status: 'open', createdAt: _hoursAgo(48),
          detail: "Recorded attendance 34% above this institute's 30-day mean, with no intake records."),
      AlertItem(id: 'al-0006', instituteId: inst[6].id, type: 'camera_offline', severity: 'yellow', status: 'open', createdAt: _hoursAgo(14),
          detail: "Feed 'Main Gate' stopped reporting 14 hours ago."),
      AlertItem(id: 'al-0007', instituteId: inst[4].id, type: 'geofence_breach', severity: 'yellow', status: 'reviewed', createdAt: _hoursAgo(72),
          detail: 'Evidence captured 1.2 km from the registered location, outside the 500 m geofence.'),
      AlertItem(id: 'al-0013', instituteId: inst[8].id, type: 'camera_offline', severity: 'yellow', status: 'open', createdAt: _hoursAgo(11),
          detail: "Feed 'Main Gate' offline since last night."),
      AlertItem(id: 'al-0014', instituteId: inst[10].id, type: 'anomaly', severity: 'red', status: 'open', createdAt: _hoursAgo(7),
          detail: 'Anomaly score -0.0712: meal counts 30% above enrolment for 9 straight days.'),
    ];
    _calls = [
      VcCall(id: 'vc-0003', instituteId: inst[2].id, instituteName: inst[2].name, participantName: _beneficiaries[1], participantRole: 'beneficiary',
          startedAt: _hoursAgo(20), outcome: 'connected', room: 'DoSJE-Nayan-demo3', byName: 'Anita Deshmukh', identityOk: true, premisesShown: true, headcount: 38,
          notes: 'Beneficiary confirmed meals and medical check-up. Showed the study hall.'),
      VcCall(id: 'vc-0002', instituteId: inst[1].id, instituteName: inst[1].name, participantName: _beneficiaries[3], participantRole: 'beneficiary',
          startedAt: _hoursAgo(26), outcome: 'no_answer', room: 'DoSJE-Nayan-demo2', byName: 'Anita Deshmukh', notes: 'No pickup in 20 minutes — flagged.'),
      VcCall(id: 'vc-0001', instituteId: inst[0].id, instituteName: inst[0].name, participantName: _incharges[0], participantRole: 'incharge',
          startedAt: _hoursAgo(50), outcome: 'connected', room: 'DoSJE-Nayan-demo1', byName: 'Farhan Qureshi', identityOk: true, premisesShown: false, headcount: 51,
          notes: 'In-charge declined to show Dormitory B on camera citing a power issue.'),
    ];
    final p = prefs;
    if (p != null) {
      try {
        final raw = p.getString('nayan.demo.vc');
        if (raw != null) {
          final saved = (jsonDecode(raw) as List).whereType<Map>().map((m) => VcCall.fromJson(Map<String, dynamic>.from(m))).toList();
          _calls = [...saved, ..._calls!];
        }
        final rawD = p.getString('nayan.demo.drawn');
        if (rawD != null) {
          for (final m in (jsonDecode(rawD) as List).whereType<Map>()) {
            final inst2 = DemoBackend.instituteById(_str(m['institute_id']));
            if (inst2 == null) continue;
            _drawn.add(Assignment(
              id: _str(m['id']),
              instituteId: inst2.id,
              inspectorId: _str(m['inspector_id']),
              institute: inst2,
              createdAt: _toDate(m['created_at']) ?? DateTime.now(),
              dueAt: _toDate(m['due_at']),
              surprise: true,
              drawRef: _str(m['draw_ref']),
              notes: const [
                Msg('Surprise inspection selected by the random draw. The institute is not informed in advance.',
                    'रैंडम ड्रॉ से चुना गया अचानक निरीक्षण। संस्थान को पहले से सूचना नहीं दी गई है।'),
              ],
            ));
          }
        }
      } catch (_) {}
    }
  }

  List<Assignment> drawnFor(String inspectorId) {
    _ensure();
    return _drawn.where((a) => a.inspectorId == inspectorId).map((a) {
      return Assignment(
        id: a.id,
        instituteId: a.instituteId,
        inspectorId: a.inspectorId,
        institute: a.institute,
        createdAt: a.createdAt,
        dueAt: a.dueAt,
        surprise: true,
        drawRef: a.drawRef,
        urgent: true,
        notes: a.notes,
      );
    }).toList();
  }

  void _saveDrawn() {
    prefs?.setString(
        'nayan.demo.drawn',
        jsonEncode([
          for (final a in _drawn.take(40))
            {
              'id': a.id,
              'institute_id': a.instituteId,
              'inspector_id': a.inspectorId,
              'created_at': a.createdAt.toUtc().toIso8601String(),
              'due_at': a.dueAt?.toUtc().toIso8601String(),
              'draw_ref': a.drawRef,
            }
        ]));
  }

  static Future<void> _lag([int ms = 350]) => Future<void>.delayed(Duration(milliseconds: ms));

  @override
  Future<List<Institute>> institutes() async {
    await _lag();
    return [...DemoBackend.institutes];
  }

  @override
  Future<List<CameraFeed>> cameras() async {
    await _lag();
    final inst = DemoBackend.institutes;
    final out = <CameraFeed>[];
    for (var g = 0; g < _camPlan.length; g++) {
      final plan = _camPlan[g];
      for (var i = 0; i < plan.names.length; i++) {
        final st = plan.statuses[i];
        out.add(CameraFeed(
          id: 'cam-$g-$i',
          instituteId: inst[plan.site].id,
          name: plan.names[i],
          status: st,
          lastPing: st == 'online' ? _hoursAgo(0.02) : (st == 'stale' ? _hoursAgo(7) : _hoursAgo(14.0 + i * 3)),
        ));
      }
    }
    return out;
  }

  @override
  Future<List<AlertItem>> alerts() async {
    await _lag();
    _ensure();
    return [..._alerts!];
  }

  @override
  Future<void> alertAction(String id, String action) async {
    await _lag(250);
    _ensure();
    for (final a in _alerts!) {
      if (a.id == id) a.status = action;
    }
  }

  @override
  Future<List<InspectorInfo>> inspectors() async {
    await _lag(200);
    return _inspectors;
  }

  @override
  Future<List<VcParticipant>> vcDirectory(String instituteId) async {
    await _lag(200);
    final idx = math.max(0, DemoBackend.institutes.indexWhere((i) => i.id == instituteId));
    String mask(int n) => '+91 ••••• ••${(100 + (idx * 37 + n * 13) % 900)}';
    return [
      VcParticipant(id: '$instituteId-inc', instituteId: instituteId, name: _incharges[idx % _incharges.length], role: 'incharge', phoneMasked: mask(1)),
      for (var k = 0; k < 2; k++)
        VcParticipant(id: '$instituteId-st$k', instituteId: instituteId, name: _staffNames[(idx + k * 2) % _staffNames.length], role: 'staff', phoneMasked: mask(2 + k)),
      for (var k = 0; k < 3; k++)
        VcParticipant(id: '$instituteId-bn$k', instituteId: instituteId, name: _beneficiaries[(idx + k * 3) % _beneficiaries.length], role: 'beneficiary', phoneMasked: mask(5 + k)),
    ];
  }

  @override
  Future<List<VcCall>> vcCalls() async {
    await _lag(250);
    _ensure();
    return [..._calls!];
  }

  @override
  Future<void> logVcCall(VcCall c) async {
    await _lag(250);
    _ensure();
    _calls!.removeWhere((x) => x.id == c.id);
    _calls!.insert(0, c);
    final mine = _calls!.where((x) => !x.id.startsWith('vc-000')).take(30).map((x) => x.toJson()).toList();
    prefs?.setString('nayan.demo.vc', jsonEncode(mine));
  }

  @override
  Future<List<AttendanceDay>> attendance(String instituteId) async {
    await _lag(300);
    return attendanceFor(instituteId);
  }

  static List<AttendanceDay> attendanceFor(String instituteId) {
    final idx = math.max(0, DemoBackend.institutes.indexWhere((i) => i.id == instituteId));
    final seed = instituteId.codeUnits.fold<int>(7, (a, b) => (a * 31 + b) & 0x7fffffff);
    final r = math.Random(seed);
    const enrolments = [64, 48, 120, 40, 36, 90, 55, 42, 50, 38, 70];
    final enrolled = enrolments[idx % enrolments.length];
    final staffTotal = (enrolled / 8).round() + 3;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final out = <AttendanceDay>[];
    for (var i = 29; i >= 0; i--) {
      final day = today.subtract(Duration(days: i));
      final weekend = day.weekday >= 6;
      var base = enrolled * (weekend ? 0.84 : 0.91) + (r.nextDouble() * 6 - 3);
      var uptime = 0.9 + r.nextDouble() * 0.1;
      var staff = (staffTotal * (0.78 + r.nextDouble() * 0.2)).round();
      if (idx == 0 && (i == 5 || i == 4)) {
        base = enrolled * 0.91 * 1.41;
        uptime = 0.52;
      }
      if (idx == 0 && i == 13) base = enrolled * 1.28;
      if (idx == 1 && i == 2) base = enrolled * 0.9 * 1.34;
      if (idx == 6 && i == 1) uptime = 0.05;
      if (idx == 4 && i <= 13) staff = staffTotal;
      var present = base.round();
      if (idx == 10 && i <= 8) present = (enrolled * 1.3).round();
      out.add(AttendanceDay(
        day: day,
        present: math.max(0, present),
        enrolled: enrolled,
        staffPresent: math.min(staffTotal, math.max(0, staff)),
        staffTotal: staffTotal,
        cameraUptime: uptime,
      ));
    }
    return out;
  }

  @override
  Future<List<Assignment>> createAssignments(DrawResult r) async {
    await _lag(500);
    _ensure();
    final out = <Assignment>[];
    for (var k = 0; k < r.picks.length; k++) {
      final p = r.picks[k];
      final id = 'demo-draw-${r.commitment.substring(0, 8)}-$k';
      p.assignmentId = id;
      final a = Assignment(
        id: id,
        instituteId: p.inst.id,
        inspectorId: p.inspector.id,
        institute: p.inst,
        createdAt: DateTime.now(),
        dueAt: p.dispatchAt,
        surprise: true,
        drawRef: r.commitment,
        urgent: true,
        notes: const [
          Msg('Surprise inspection selected by the random draw. The institute is not informed in advance.',
              'रैंडम ड्रॉ से चुना गया अचानक निरीक्षण। संस्थान को पहले से सूचना नहीं दी गई है।'),
        ],
      );
      _drawn.insert(0, a);
      out.add(a);
    }
    _saveDrawn();
    return out;
  }

  /// A plausible live event for the monitoring ticker (demo only).
  LiveEvent randomEvent(math.Random r, List<CameraFeed> cams) {
    final inst = DemoBackend.institutes[r.nextInt(DemoBackend.institutes.length)];
    switch (r.nextInt(5)) {
      case 0:
        final present = 30 + r.nextInt(60);
        return LiveEvent(at: DateTime.now(), kind: 'attendance', instituteId: inst.id,
            text: Msg('Attendance marked at ${inst.name}: $present present', '${inst.name} में उपस्थिति दर्ज: $present उपस्थित'));
      case 1:
        return LiveEvent(at: DateTime.now(), kind: 'evidence', instituteId: inst.id,
            text: Msg('Evidence from ${inst.name} verified (SHA-256 match)', '${inst.name} का साक्ष्य सत्यापित (SHA-256 मेल)'));
      case 2:
        return LiveEvent(at: DateTime.now(), kind: 'vc', instituteId: inst.id,
            text: Msg('Random VC with a beneficiary at ${inst.name} connected', '${inst.name} के लाभार्थी से रैंडम वीसी जुड़ी'));
      case 3:
        return LiveEvent(at: DateTime.now(), kind: 'inspection', instituteId: inst.id,
            text: Msg('Inspector checked in at ${inst.name} — GPS within 120 m', 'निरीक्षक ने ${inst.name} में चेक-इन किया — GPS 120 मी. के भीतर'));
      default:
        final cam = cams.isEmpty ? 'Main Gate' : cams[r.nextInt(cams.length)].name;
        return LiveEvent(at: DateTime.now(), kind: 'camera', instituteId: inst.id,
            text: Msg("Camera '$cam' at ${inst.name} reported in", "${inst.name} का कैमरा '$cam' सक्रिय"));
    }
  }
}

// ============================================================================
// §6  APP STATE & THEME
// ============================================================================

String _sha256Of(Uint8List bytes) => sha256.convert(bytes).toString();

/// SHA-256 off the UI thread on phones (web runs it inline).
Future<String> hashBytes(Uint8List bytes) => compute(_sha256Of, bytes);

String _randomHex(int n) {
  final r = math.Random.secure();
  const chars = '0123456789abcdef';
  return List.generate(n, (_) => chars[r.nextInt(16)]).join();
}

String platformLabel() {
  if (kIsWeb) return 'Web';
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      return 'Android';
    case TargetPlatform.iOS:
      return 'iPhone';
    default:
      return defaultTargetPlatform.name;
  }
}

class AppState extends ChangeNotifier {
  AppState(this.prefs);
  final SharedPreferences prefs;

  LangMode lang = LangMode.bi;
  ThemeMode themeMode = ThemeMode.light;
  bool highContrast = false;
  String serverUrl = '';
  String deviceId = '';

  AppUser? user;
  Backend? backend;

  List<Assignment> assignments = [];
  bool loadingAssignments = false;
  bool assignmentsLoadedOnce = false;
  String? assignmentsError;
  bool sessionExpired = false;

  /// A real account whose server could not be reached: sample data is shown.
  bool usingSampleData = false;

  List<Submission> submissions = [];
  Map<String, String> localStatus = {};
  final Map<String, InspectionDraft> drafts = {};
  final List<YuktMsg> yukt = [];

  // ------------------------------------------------------ session security --
  /// Last user interaction, for the idle lock and the silent token refresh.
  DateTime lastActivity = DateTime.now();

  /// App lock: the session and all local work stay; the lock screen asks for
  /// the password (and 2-step code) of the same account again.
  bool locked = false;
  Msg? lockReason;

  /// 2-step sign-in in progress (memory only).
  String? _mfaToken;
  String _mfaEmail = '';

  /// Drafts with unsent evidence, kept per inspector across a sign-out so the
  /// same inspector can submit them after signing in again (memory only).
  final Map<String, Map<String, InspectionDraft>> _parkedDrafts = {};
  bool _refreshing = false;
  DateTime _nextRefreshTry = DateTime.fromMillisecondsSinceEpoch(0);

  bool get isDemo => (user?.isDemo ?? false) || usingSampleData;

  String _k(String name) => 'nayan.$name.${user?.id ?? 'anon'}';

  Future<void> init() async {
    DemoMonitor.instance.prefs = prefs;
    lang = LangMode.values.firstWhere((m) => m.name == prefs.getString('nayan.lang'), orElse: () => LangMode.bi);
    themeMode =
        ThemeMode.values.firstWhere((m) => m.name == prefs.getString('nayan.theme'), orElse: () => ThemeMode.light);
    highContrast = prefs.getBool('nayan.contrast') ?? false;
    serverUrl = prefs.getString('nayan.server') ?? kApiBaseFromBuild;
    deviceId = prefs.getString('nayan.device') ?? '';
    if (deviceId.isEmpty) {
      deviceId = 'NYN-${platformLabel().toUpperCase()}-${_randomHex(12)}';
      await prefs.setString('nayan.device', deviceId);
    }
    // The session is memory-only: drop what older versions saved, so a cold
    // start always opens the sign-in screen.
    await prefs.remove('nayan.session');
  }

  void _attachBackend() {
    final u = user;
    if (u == null) {
      backend = null;
    } else if (u.isDemo) {
      backend = DemoBackend.instance;
    } else {
      backend = RealBackend(serverUrl, u.token);
    }
  }

  /// Demo assignments always go to the demo backend, even for a real account
  /// that is seeing sample data because its server was unreachable.
  Backend backendFor(Assignment a) => a.isDemo ? DemoBackend.instance : (backend ?? DemoBackend.instance);

  void _loadUserData() {
    submissions = [];
    localStatus = {};
    try {
      final s = prefs.getString(_k('subs'));
      if (s != null) {
        submissions = (jsonDecode(s) as List)
            .whereType<Map>()
            .map((m) => Submission.fromJson(Map<String, dynamic>.from(m)))
            .toList();
      }
      final st = prefs.getString(_k('status'));
      if (st != null) {
        localStatus = (jsonDecode(st) as Map).map((k, v) => MapEntry('$k', '$v'));
      }
    } catch (_) {}
    final u = user;
    if (u != null && u.isDemo && !u.isPortal && !(prefs.getBool(_k('seeded')) ?? false)) {
      submissions.insert(0, DemoBackend.seededSubmission(u));
      prefs.setBool(_k('seeded'), true);
      _saveSubmissions();
    }
  }

  void _saveSubmissions() {
    final list = submissions.take(60).map((s) => s.toJson()).toList();
    prefs.setString(_k('subs'), jsonEncode(list));
  }

  /// Sign in (or unlock, when [locked]) with email + password. The result
  /// says whether the session started, a 2-step code is needed, or why not.
  Future<LoginResult> login(String email, String password) async {
    final e = email.trim().toLowerCase();
    if (e.isEmpty || password.isEmpty) {
      return const LoginResult.fail(Msg('Enter your email and password.', 'अपना ईमेल और पासवर्ड दर्ज करें।'));
    }
    _mfaToken = null;
    if (serverUrl.trim().isEmpty) {
      final d = DemoBackend.login(e, password);
      if (d == null) {
        return const LoginResult.fail(Msg(
            'No server is set, so only test accounts work. Tap "Use a test account" or set the server (⚙).',
            'सर्वर सेट नहीं है, इसलिए केवल परीक्षण खाते चलेंगे। "परीक्षण खाता" चुनें या सर्वर (⚙) सेट करें।'));
      }
      return _applyAuth(d, sample: false);
    }
    final bad = serverUrlProblem(serverUrl);
    if (bad != null) return LoginResult.fail(bad);
    try {
      return _onReply(await RealBackend.login(serverUrl, e, password), e);
    } on ApiException catch (x) {
      // Server unreachable: demo accounts still open with sample data (not
      // while unlocking a real session — that needs the server).
      if (x.network && DemoBackend.isDemoEmail(e) && (!locked || (user?.isDemo ?? false))) {
        return _applyAuth(DemoBackend.login(e, password)!, sample: true);
      }
      return LoginResult.fail(authErrorMsg(x), retryAfter: x.status == 423 ? x.retryAfter : null);
    }
  }

  /// Second sign-in step (authenticator code or recovery code).
  Future<LoginResult> verifyCode(String code) async {
    final token = _mfaToken;
    if (token == null) return const LoginResult.fail(_kCodeTimedOut, backToPassword: true);
    final c = code.trim().toUpperCase();
    if (c.isEmpty) {
      return const LoginResult.fail(Msg('Enter the code from your authenticator app.', 'ऑथेंटिकेटर ऐप का कोड दर्ज करें।'),
          needsCode: true);
    }
    try {
      return _onReply(await RealBackend.verifyMfa(serverUrl, token, c, _mfaEmail), _mfaEmail);
    } on ApiException catch (x) {
      if (x.status == 401 && x.message.toLowerCase().contains('timed out')) {
        _mfaToken = null;
        return LoginResult.fail(Msg(x.message, _kCodeTimedOut.hi), backToPassword: true);
      }
      if (x.status == 401) {
        return LoginResult.fail(Msg(x.message, 'कोड ग़लत है।'), needsCode: true);
      }
      final lockedOut = x.status == 423; // account locked: back to the password step
      return LoginResult.fail(authErrorMsg(x),
          needsCode: !lockedOut, backToPassword: lockedOut, retryAfter: lockedOut ? x.retryAfter : null);
    }
  }

  /// Leaves the 2-step step (the "Back" button).
  void cancelCode() => _mfaToken = null;

  LoginResult _onReply(AuthReply r, String email) {
    final u = r.user;
    if (u == null) {
      _mfaToken = r.mfaToken;
      _mfaEmail = email;
      return const LoginResult.code();
    }
    _mfaToken = null;
    return _applyAuth(u, sample: false);
  }

  LoginResult _applyAuth(AppUser u, {required bool sample}) {
    final role = u.role.toLowerCase();
    if (!Roles.isKnown(role)) {
      return const LoginResult.fail(Msg(
          'This account type is not set up for Nayan. Please contact the Department.',
          'यह खाता प्रकार नयन के लिए सेट नहीं है। कृपया विभाग से संपर्क करें।'));
    }
    final current = user;
    if (locked && current != null && current.id == u.id) {
      _resumeSession(current, u);
    } else {
      _startSession(u, sample);
    }
    return const LoginResult.ok();
  }

  /// Unlock: same account, new token; everything on screen and on the phone stays.
  void _resumeSession(AppUser current, AppUser fresh) {
    current.token = fresh.token;
    current.expiresAt = fresh.expiresAt;
    current.mfaEnabled = fresh.mfaEnabled;
    locked = false;
    lockReason = null;
    sessionExpired = false;
    lastActivity = DateTime.now();
    _nextRefreshTry = DateTime.fromMillisecondsSinceEpoch(0);
    _attachBackend();
    notifyListeners();
    if (current.isPortal) return;
    if (!current.isOfficial) unawaited(refreshAssignments());
    unawaited(loadMonitor(quiet: true));
  }

  void _startSession(AppUser u, bool sample) {
    final previous = user;
    if (previous != null) _parkDrafts(previous);
    user = u;
    usingSampleData = sample;
    sessionExpired = false;
    locked = false;
    lockReason = null;
    lastActivity = DateTime.now();
    _nextRefreshTry = DateTime.fromMillisecondsSinceEpoch(0);
    _attachBackend();
    _loadUserData();
    drafts
      ..clear()
      ..addAll(_parkedDrafts.remove(u.id) ?? const {});
    assignments = [];
    assignmentsLoadedOnce = false;
    _session++;
    monitorLoading = false;
    monitorLoaded = false;
    institutes = [];
    cameras = [];
    alerts = [];
    vcCalls = [];
    attendanceCache.clear();
    liveEvents.clear();
    notifyListeners();
    if (u.isPortal) return; // the portal screens load their own data
    if (!u.isOfficial) unawaited(refreshAssignments());
    unawaited(loadMonitor());
  }

  /// Evidence captured but not yet accepted or rejected by the server.
  static bool _unsent(Evidence e) => e.status != EvStatus.ok && e.status != EvStatus.rejected;

  /// How many photos/videos are waiting to be uploaded on this phone.
  int get pendingEvidenceCount =>
      drafts.values.fold<int>(0, (n, d) => n + d.evidence.where(_unsent).length);

  /// Keeps drafts that hold unsent evidence for [u]'s next sign-in.
  void _parkDrafts(AppUser u) {
    final keep = {
      for (final e in drafts.entries)
        if (e.value.evidence.any(_unsent)) e.key: e.value,
    };
    if (keep.isNotEmpty) _parkedDrafts[u.id] = keep;
  }

  /// Removes this user's cached lists from the phone, except inspection
  /// records the server has not stored yet (so no field work is lost).
  void _clearUserCache() {
    final unsynced = submissions.where((s) => !s.serverRecord && !s.demo).toList();
    if (unsynced.isEmpty) {
      prefs.remove(_k('subs'));
    } else {
      prefs.setString(_k('subs'), jsonEncode(unsynced.map((s) => s.toJson()).toList()));
    }
    prefs.remove(_k('status'));
    prefs.remove(_k('seeded'));
  }

  /// Signs out: tells the server (best effort), wipes the in-memory session
  /// and cached lists, keeps unsent evidence for the same inspector and keeps
  /// preferences (language, theme, server, device id, tour flags).
  Future<void> logout() async {
    final u = user;
    final be = backend;
    if (u != null && be != null && !u.isDemo) unawaited(be.logout(u));
    if (u != null) {
      _parkDrafts(u);
      _clearUserCache();
    }
    _gen++;
    _session++;
    stopLive();
    institutes = [];
    cameras = [];
    alerts = [];
    inspectorsList = [];
    vcCalls = [];
    attendanceCache.clear();
    sampleSections.clear();
    liveEvents.clear();
    draws.clear();
    monitorLoaded = false;
    monitorLoading = false;
    loadingAssignments = false;
    user = null;
    backend = null;
    assignments = [];
    assignmentsLoadedOnce = false;
    assignmentsError = null;
    submissions = [];
    localStatus = {};
    drafts.clear();
    yukt.clear();
    usingSampleData = false;
    sessionExpired = false;
    locked = false;
    lockReason = null;
    _mfaToken = null;
    await prefs.remove('nayan.session');
    notifyListeners();
  }

  /// Any interaction keeps the session alive (called by [SessionGuard]).
  void noteActivity() => lastActivity = DateTime.now();

  /// Shows the lock screen (idempotent). Nothing is cleared.
  void lock(Msg reason) {
    if (user == null || locked) return;
    locked = true;
    lockReason = reason;
    notifyListeners();
  }

  /// Checks the idle / background / token-expiry rules and locks if one hit.
  void checkLock({DateTime? backgroundAt}) {
    final u = user;
    if (u == null || locked) return;
    final cause = LockPolicy.cause(
        now: DateTime.now(), lastActivity: lastActivity, backgroundAt: backgroundAt, expiresAt: u.expiresAt);
    if (cause != null) lock(LockPolicy.reason(cause));
  }

  /// A 401 from any protected call means the server ended the session.
  void handleApiError(ApiException x) {
    if (x.status != 401 || user == null) return;
    sessionExpired = true;
    lock(Msg(x.message, 'आपका सत्र समाप्त हो गया। कृपया दोबारा साइन इन करें।'));
  }

  /// Silent refresh: < 3 min left on the token and the user was active in
  /// the last 5 min. A 401 locks; a network error retries in 30 s.
  Future<void> maybeRefresh() async {
    final u = user;
    final be = backend;
    final now = DateTime.now();
    if (u == null || be == null || u.isDemo || locked || _refreshing || now.isBefore(_nextRefreshTry)) return;
    if (!LockPolicy.shouldRefresh(now: now, lastActivity: lastActivity, expiresAt: u.expiresAt)) return;
    _refreshing = true;
    try {
      final g = await be.refresh(u);
      if (user == u && !locked) {
        u.token = g.token;
        u.expiresAt = DateTime.now().add(Duration(seconds: g.expiresIn));
        _attachBackend();
      }
    } on ApiException catch (x) {
      if (user == u) {
        if (x.status == 401) {
          handleApiError(x);
        } else {
          _nextRefreshTry = now.add(const Duration(seconds: 30));
        }
      }
    } finally {
      _refreshing = false;
    }
  }

  /// After 2-step verification was turned on or off on the Security screen.
  void setMfaEnabled(bool v) {
    final u = user;
    if (u == null) return;
    u.mfaEnabled = v;
    notifyListeners();
  }

  int _gen = 0;

  Future<void> refreshAssignments() async {
    final u = user;
    final be = backend;
    if (u == null || be == null || loadingAssignments) return;
    final gen = ++_gen;
    loadingAssignments = true;
    assignmentsError = null;
    notifyListeners();
    try {
      assignments = await be.assignments(u);
    } on ApiException catch (x) {
      if (x.status == 401) {
        assignmentsError = x.message;
        handleApiError(x); // locks: the inspector signs in again, nothing is lost
      } else if (x.network || x.status == 404) {
        // Server unreachable (or listing not built yet): show sample data,
        // clearly marked, instead of an empty screen.
        assignments = await DemoBackend.instance.assignments(u);
        usingSampleData = true;
      } else {
        assignmentsError = x.message;
      }
    } catch (x) {
      assignmentsError = '$x';
    }
    if (gen != _gen || user != u) return; // signed out (or restarted) meanwhile
    for (final a in assignments) {
      final local = localStatus[a.id];
      if (local != null && a.status != AStatus.verified && a.status != AStatus.rejected) a.status = local;
    }
    assignments.sort(_order);
    loadingAssignments = false;
    assignmentsLoadedOnce = true;
    notifyListeners();
  }

  static int _rank(Assignment a) {
    if (a.status == AStatus.inProgress) return 0;
    if (a.status == AStatus.rejected) return 1;
    if (a.status == AStatus.assigned) return a.urgent ? 2 : 3;
    return 5;
  }

  static int _order(Assignment a, Assignment b) {
    final r = _rank(a).compareTo(_rank(b));
    if (r != 0) return r;
    final ad = a.dueAt ?? a.createdAt;
    final bd = b.dueAt ?? b.createdAt;
    return AStatus.isDone(a.status) ? bd.compareTo(ad) : ad.compareTo(bd);
  }

  Assignment? assignmentById(String id) {
    for (final a in assignments) {
      if (a.id == id) return a;
    }
    return null;
  }

  Submission? submissionFor(String assignmentId) {
    for (final s in submissions) {
      if (s.assignmentId == assignmentId) return s;
    }
    return null;
  }

  void setStatus(Assignment a, String status) {
    a.status = status;
    localStatus[a.id] = status;
    prefs.setString(_k('status'), jsonEncode(localStatus));
    assignments.sort(_order);
    notifyListeners();
  }

  InspectionDraft draftFor(Assignment a) => drafts.putIfAbsent(a.id, () => InspectionDraft());

  void saveSubmission(Assignment a, Submission s) {
    submissions.removeWhere((x) => x.assignmentId == a.id);
    submissions.insert(0, s);
    _saveSubmissions();
    drafts.remove(a.id);
    setStatus(a, s.status == 'rejected' ? AStatus.rejected : (s.status == 'verified' ? AStatus.verified : AStatus.submitted));
  }


  // ------------------------------------------------------------ monitoring --
  List<Institute> institutes = [];
  List<CameraFeed> cameras = [];
  List<AlertItem> alerts = [];
  List<InspectorInfo> inspectorsList = [];
  List<VcCall> vcCalls = [];
  final Map<String, List<AttendanceDay>> attendanceCache = {};
  final Set<String> sampleSections = {};
  final List<LiveEvent> liveEvents = [];
  final List<DrawResult> draws = [];
  bool monitorLoading = false;
  bool monitorLoaded = false;
  String? monitorError;
  DateTime? lastSync;
  Timer? _live;
  int _tick = 0;
  int _session = 0;
  final math.Random _liveRng = math.Random();

  bool get _canUseReal {
    final u = user;
    return u != null && !u.isDemo && !usingSampleData && serverUrl.trim().isNotEmpty;
  }

  MonitorApi get _real => RealMonitor(serverUrl, user?.token ?? '');

  bool isSample(String section) => isDemo || sampleSections.contains(section);

  Future<T> _withFallback<T>(String section, Future<T> Function(MonitorApi m) run) async {
    if (_canUseReal) {
      try {
        final v = await run(_real);
        sampleSections.remove(section);
        return v;
      } on ApiException catch (e) {
        handleApiError(e); // 401 → lock screen
      }
    }
    sampleSections.add(section);
    return run(DemoMonitor.instance);
  }

  Future<void> loadMonitor({bool quiet = false}) async {
    if (user == null || monitorLoading) return;
    final session = _session;
    monitorLoading = true;
    if (!quiet) notifyListeners();
    try {
      final r = await Future.wait<Object>([
        _withFallback('institutes', (m) => m.institutes()),
        _withFallback('cameras', (m) => m.cameras()),
        _withFallback('alerts', (m) => m.alerts()),
        _withFallback('inspectors', (m) => m.inspectors()),
        _withFallback('vc', (m) => m.vcCalls()),
      ]);
      if (session != _session) return;
      institutes = r[0] as List<Institute>;
      cameras = r[1] as List<CameraFeed>;
      alerts = (r[2] as List<AlertItem>)..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      inspectorsList = r[3] as List<InspectorInfo>;
      vcCalls = (r[4] as List<VcCall>)..sort((a, b) => b.startedAt.compareTo(a.startedAt));
      monitorError = null;
    } catch (e) {
      monitorError = '$e';
      debugPrint('loadMonitor failed: $e');
    }
    if (session != _session) return;
    monitorLoading = false;
    monitorLoaded = true;
    lastSync = DateTime.now();
    if (liveEvents.isEmpty) _seedEvents();
    notifyListeners();
    unawaited(preloadAttendance());
  }

  void _seedEvents() {
    for (final a in scopedAlerts.take(5)) {
      final inst = instituteById(a.instituteId);
      liveEvents.add(LiveEvent(
        at: a.createdAt,
        kind: 'alert',
        instituteId: a.instituteId,
        text: Msg('${a.typeLabel.en} · ${inst?.name ?? ''}', '${a.typeLabel.hi} · ${inst?.name ?? ''}'),
      ));
    }
    for (final c in vcCalls.take(2)) {
      liveEvents.add(LiveEvent(
        at: c.startedAt,
        kind: 'vc',
        instituteId: c.instituteId,
        text: Msg('VC with ${c.participantName} (${c.instituteName}): ${VcCall.outcomeLabel(c.outcome).en}',
            '${c.instituteName} में ${c.participantName} से वीसी: ${VcCall.outcomeLabel(c.outcome).hi}'),
      ));
    }
    liveEvents.sort((a, b) => b.at.compareTo(a.at));
  }

  void startLive() {
    _live ??= Timer.periodic(const Duration(seconds: 12), (_) => _onTick());
  }

  void stopLive() {
    _live?.cancel();
    _live = null;
  }

  void _onTick() {
    if (user == null || locked) return;
    _tick++;
    if (isSample('cameras')) {
      liveEvents.insert(0, DemoMonitor.instance.randomEvent(_liveRng, cameras));
      if (liveEvents.length > 40) liveEvents.removeRange(40, liveEvents.length);
      lastSync = DateTime.now();
      notifyListeners();
    }
    if (_tick % 5 == 0) unawaited(loadMonitor(quiet: true));
  }

  Institute? instituteById(String id) {
    for (final i in institutes) {
      if (i.id == id) return i;
    }
    return DemoBackend.instituteById(id);
  }

  List<Institute> get scopedInstitutes {
    final u = user;
    if (u == null) return const [];
    final all = institutes.isEmpty ? DemoBackend.institutes : institutes;
    if (u.isPortal) return all.where((i) => i.id == u.instituteId).toList();
    if (u.isOfficial) {
      return all
          .where((i) => (u.state.isEmpty || i.state == u.state) && (u.district.isEmpty || i.district == u.district))
          .toList();
    }
    final ids = assignments.map((a) => a.instituteId).toSet();
    final mine = all.where((i) => ids.contains(i.id)).toList();
    if (mine.isNotEmpty) return mine;
    return all.where((i) => u.state.isEmpty || i.state == u.state).toList();
  }

  Set<String> get scopeIds => scopedInstitutes.map((i) => i.id).toSet();

  List<CameraFeed> get scopedCameras {
    final ids = scopeIds;
    return cameras.where((c) => ids.contains(c.instituteId)).toList();
  }

  List<AlertItem> get scopedAlerts {
    final ids = scopeIds;
    return alerts.where((a) => ids.contains(a.instituteId)).toList();
  }

  Future<Msg?> actOnAlert(AlertItem a, String action) async {
    try {
      if (isSample('alerts') || !_canUseReal) {
        await DemoMonitor.instance.alertAction(a.id, action);
      } else {
        await _real.alertAction(a.id, action);
      }
    } on ApiException catch (e) {
      handleApiError(e);
      return Msg(e.message, e.message);
    }
    a.status = action;
    final inst = instituteById(a.instituteId);
    liveEvents.insert(
        0,
        LiveEvent(
          at: DateTime.now(),
          kind: 'alert',
          instituteId: a.instituteId,
          text: action == 'escalated'
              ? Msg('Alert escalated by ${user?.name ?? ''}: ${inst?.name ?? ''}', '${user?.name ?? ''} ने अलर्ट आगे बढ़ाया: ${inst?.name ?? ''}')
              : Msg('Alert reviewed by ${user?.name ?? ''}: ${inst?.name ?? ''}', '${user?.name ?? ''} ने अलर्ट देखा: ${inst?.name ?? ''}'),
        ));
    notifyListeners();
    return null;
  }

  Future<List<AttendanceDay>> attendanceFor(String instituteId) async {
    final cached = attendanceCache[instituteId];
    if (cached != null) return cached;
    final v = await _withFallback('attendance', (m) => m.attendance(instituteId));
    attendanceCache[instituteId] = v;
    return v;
  }

  Future<void> preloadAttendance() async {
    final session = _session;
    for (final i in scopedInstitutes) {
      try {
        await attendanceFor(i.id);
      } catch (_) {}
      if (session != _session) return;
    }
    notifyListeners();
  }

  List<Anomaly> anomaliesFor(Institute i) => detectAnomalies(i, attendanceCache[i.id] ?? const []);

  List<Anomaly> get allAnomalies {
    final out = <Anomaly>[];
    for (final i in scopedInstitutes) {
      out.addAll(anomaliesFor(i));
    }
    out.sort((a, b) {
      final s = (b.severity == 'red' ? 1 : 0).compareTo(a.severity == 'red' ? 1 : 0);
      if (s != 0) return s;
      return (b.day ?? DateTime(2000)).compareTo(a.day ?? DateTime(2000));
    });
    return out;
  }

  int daysSinceInspection(Institute i) {
    for (final s in submissions) {
      if (s.instituteId == i.id) return DateTime.now().difference(s.submittedAt).inDays;
    }
    final h = i.id.codeUnits.fold<int>(0, (a, b) => (a * 17 + b) % 1000);
    return 12 + h % 110;
  }

  static double _unit(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);

  List<RiskRow> riskRows() {
    final rows = <RiskRow>[];
    for (final i in scopedInstitutes) {
      final open = alerts.where((a) => a.instituteId == i.id && a.status != 'reviewed').length;
      final recent = anomaliesFor(i).where((x) => x.day == null || DateTime.now().difference(x.day!).inDays <= 14).length;
      final days = daysSinceInspection(i);
      rows.add(RiskRow(
        inst: i,
        compliance: i.complianceScore == null ? 0.5 : _unit((100 - i.complianceScore!) / 100),
        alerts: _unit(open / 3),
        recency: _unit(days / 90),
        anomaly: _unit(recent / 3),
        openAlerts: open,
        daysSince: days,
        anomalies: recent,
      ));
    }
    rows.sort((a, b) => b.score.compareTo(a.score));
    return rows;
  }

  List<InspectorInfo> get drawInspectors {
    if (inspectorsList.isNotEmpty) return inspectorsList;
    return const [];
  }

  DrawResult proposeDraw({required bool riskWeighted, required int count, List<String>? onlyInstituteIds}) {
    var rows = riskRows();
    if (onlyInstituteIds != null && onlyInstituteIds.isNotEmpty) {
      rows = rows.where((r) => onlyInstituteIds.contains(r.inst.id)).toList();
    }
    final insp = drawInspectors.map((i) {
      final load = assignments.where((a) => a.inspectorId == i.id && !AStatus.isDone(a.status)).length;
      return InspectorInfo(
        id: i.id,
        name: i.name,
        designation: i.designation,
        district: i.district,
        state: i.state,
        status: i.status,
        lastInstituteIds: i.lastInstituteIds,
        load: load,
      );
    }).toList();
    return runDraw(rows: rows, inspectors: insp, riskWeighted: riskWeighted, count: count, byName: user?.name ?? '');
  }

  Future<Msg?> confirmDraw(DrawResult r) async {
    try {
      final created = _canUseReal ? await _real.createAssignments(r) : await DemoMonitor.instance.createAssignments(r);
      draws.insert(0, r);
      for (final a in created) {
        liveEvents.insert(
            0,
            LiveEvent(
              at: DateTime.now(),
              kind: 'inspection',
              instituteId: a.instituteId,
              text: Msg('Surprise inspection drawn: ${a.institute.name}', 'अचानक निरीक्षण चुना गया: ${a.institute.name}'),
            ));
      }
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      handleApiError(e);
      return Msg(e.message, e.message);
    }
  }

  Future<List<VcParticipant>> vcDirectory(String instituteId) =>
      _withFallback('vcdir', (m) => m.vcDirectory(instituteId));

  Future<void> saveVcCall(VcCall c) async {
    try {
      await _withFallback('vc', (m) => m.logVcCall(c));
    } catch (_) {}
    vcCalls.removeWhere((x) => x.id == c.id);
    vcCalls.insert(0, c);
    if (c.outcome != 'pending') {
      liveEvents.insert(
          0,
          LiveEvent(
            at: DateTime.now(),
            kind: 'vc',
            instituteId: c.instituteId,
            text: Msg('VC with ${c.participantName} (${c.instituteName}): ${VcCall.outcomeLabel(c.outcome).en}',
                '${c.instituteName} में ${c.participantName} से वीसी: ${VcCall.outcomeLabel(c.outcome).hi}'),
          ));
    }
    notifyListeners();
  }

  void raiseLocalAlert({required String instituteId, required String type, required String detail}) {
    final a = AlertItem(
      id: 'al-local-${DateTime.now().millisecondsSinceEpoch}',
      instituteId: instituteId,
      type: type,
      severity: type == 'cctv_tamper' ? 'red' : 'yellow',
      status: 'open',
      detail: detail,
      createdAt: DateTime.now(),
    );
    alerts.insert(0, a);
    final inst = instituteById(instituteId);
    liveEvents.insert(0, LiveEvent(at: DateTime.now(), kind: 'alert', instituteId: instituteId, text: Msg('${a.typeLabel.en} · ${inst?.name ?? ''}', '${a.typeLabel.hi} · ${inst?.name ?? ''}')));
    notifyListeners();
  }

  bool tourSeen(String role) => prefs.getBool('nayan.tour.$role') ?? false;
  void markTourSeen(String role) => prefs.setBool('nayan.tour.$role', true);

  String vcBase() => prefs.getString('nayan.vcbase') ?? 'https://meet.jit.si/';
  void setVcBase(String v) {
    prefs.setString('nayan.vcbase', v.trim().isEmpty ? 'https://meet.jit.si/' : v.trim());
    notifyListeners();
  }

  void setLang(LangMode m) {
    lang = m;
    prefs.setString('nayan.lang', m.name);
    notifyListeners();
  }

  void setTheme(ThemeMode m) {
    themeMode = m;
    prefs.setString('nayan.theme', m.name);
    notifyListeners();
  }

  void setContrast(bool v) {
    highContrast = v;
    prefs.setBool('nayan.contrast', v);
    notifyListeners();
  }

  void setServer(String url) {
    serverUrl = url.trim();
    prefs.setString('nayan.server', serverUrl);
    notifyListeners();
  }

  void addYukt(YuktMsg m) {
    yukt.add(m);
    notifyListeners();
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState app, required super.child}) : super(notifier: app);

  /// Rebuilds the caller when the state changes (use in build methods).
  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;

  /// Reads without subscribing (use in callbacks).
  static AppState read(BuildContext context) => context.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}

ThemeData buildTheme(Brightness brightness, bool highContrast) {
  final dark = brightness == Brightness.dark;
  var scheme = ColorScheme.fromSeed(seedColor: kSage, brightness: brightness).copyWith(
    primary: dark ? const Color(0xFFA9C5A6) : kForest,
    onPrimary: dark ? const Color(0xFF14201A) : Colors.white,
    secondary: dark ? const Color(0xFFE0C58F) : kSand,
    onSecondary: dark ? const Color(0xFF2A1E08) : Colors.white,
    tertiary: dark ? const Color(0xFF8FCB93) : kGreen,
    error: dark ? const Color(0xFFFF9A8F) : kRed,
    surface: dark ? const Color(0xFF1A221C) : kIvory,
    onSurface: dark ? const Color(0xFFE9EDE6) : const Color(0xFF1F2A22),
    onSurfaceVariant: dark ? const Color(0xFFB9C3B6) : const Color(0xFF55604F),
    outlineVariant: dark ? const Color(0xFF3A463C) : const Color(0xFFD9CFBB),
  );
  if (highContrast) {
    scheme = scheme.copyWith(
      primary: dark ? const Color(0xFFFFD54F) : const Color(0xFF1B3A22),
      onPrimary: dark ? Colors.black : Colors.white,
      surface: dark ? Colors.black : Colors.white,
      onSurface: dark ? Colors.white : Colors.black,
      onSurfaceVariant: dark ? Colors.white : Colors.black,
      outline: dark ? Colors.white : Colors.black,
      outlineVariant: dark ? Colors.white70 : Colors.black87,
    );
  }
  const transitions = _GlassPageTransitions();
  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: Colors.transparent,
    visualDensity: VisualDensity.standard,
    fontFamilyFallback: debugFontFallback,
    pageTransitionsTheme: PageTransitionsTheme(
      builders: {for (final p in TargetPlatform.values) p: transitions},
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        backgroundBuilder: highContrast ? null : _glassSolid,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        side: BorderSide(color: scheme.primary.withValues(alpha: 0.40)),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        backgroundBuilder: highContrast ? null : (dark ? _glassClearDark : _glassClear),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    ),
  );
}


/// Glass shine laid over a filled button's colour: a bright top half, a soft
/// darker base and a thin light rim.
Widget _glassSolid(BuildContext context, Set<WidgetState> states, Widget? child) {
  final off = states.contains(WidgetState.disabled);
  final pressed = states.contains(WidgetState.pressed);
  return DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(16),
      border: off ? null : Border.all(color: Colors.white.withValues(alpha: 0.30)),
      gradient: off
          ? null
          : LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              stops: const [0, 0.48, 0.52, 1],
              colors: [
                Colors.white.withValues(alpha: pressed ? 0.14 : 0.30),
                Colors.white.withValues(alpha: pressed ? 0.04 : 0.10),
                Colors.transparent,
                Colors.black.withValues(alpha: 0.10),
              ],
            ),
    ),
    child: child,
  );
}

/// Frosted, see-through fill for outlined buttons.
Widget _glassClear(BuildContext context, Set<WidgetState> states, Widget? child) {
  final pressed = states.contains(WidgetState.pressed);
  return DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(16),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Colors.white.withValues(alpha: pressed ? 0.55 : 0.78),
          Colors.white.withValues(alpha: pressed ? 0.30 : 0.42),
        ],
      ),
    ),
    child: child,
  );
}

Widget _glassClearDark(BuildContext context, Set<WidgetState> states, Widget? child) {
  final pressed = states.contains(WidgetState.pressed);
  return DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(16),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Colors.white.withValues(alpha: pressed ? 0.16 : 0.10),
          Colors.white.withValues(alpha: pressed ? 0.08 : 0.03),
        ],
      ),
    ),
    child: child,
  );
}

/// Every page slides/fades in over its own sage-and-beige backdrop.
class _GlassPageTransitions extends PageTransitionsBuilder {
  const _GlassPageTransitions();

  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> animation,
      Animation<double> secondaryAnimation, Widget child) {
    final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0.035, 0), end: Offset.zero).animate(curved),
        child: NayanBackground(child: child),
      ),
    );
  }
}

/// Soft beige gradient with blurred sage and sand light — the canvas the glass
/// panels sit on.
class NayanBackground extends StatelessWidget {
  const NayanBackground({super.key, required this.child});
  final Widget child;

  static Widget _blob(Alignment a, double size, Color c) => Align(
        alignment: a,
        child: IgnorePointer(
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [c, c.withValues(alpha: 0)]),
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    if (s.highContrast) {
      return ColoredBox(color: dark ? Colors.black : Colors.white, child: child);
    }
    return Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: dark
                    ? const [Color(0xFF172019), Color(0xFF0E1410)]
                    : const [Color(0xFFF8F3E8), Color(0xFFECE2CD)],
              ),
            ),
          ),
        ),
        _blob(const Alignment(-1.25, -0.95), 360, kSage.withValues(alpha: dark ? 0.20 : 0.30)),
        _blob(const Alignment(1.35, -0.25), 300, kSand.withValues(alpha: dark ? 0.14 : 0.22)),
        _blob(const Alignment(-0.5, 1.25), 340, kSageLight.withValues(alpha: dark ? 0.12 : 0.30)),
        Positioned.fill(child: child),
      ],
    );
  }
}

/// Sage government-style app bar (set per screen, not through the theme).
PreferredSizeWidget govAppBar(BuildContext context, {required Widget title, List<Widget>? actions, bool back = true}) {
  final s = AppScope.of(context);
  final dark = Theme.of(context).brightness == Brightness.dark;
  final colors = s.highContrast
      ? [dark ? Colors.black : const Color(0xFF1B2A1F), dark ? Colors.black : const Color(0xFF1B2A1F)]
      : (dark ? [const Color(0xFF223127), const Color(0xFF17221B)] : [kForest, kSage]);
  return AppBar(
    backgroundColor: Colors.transparent,
    foregroundColor: Colors.white,
    surfaceTintColor: Colors.transparent,
    elevation: 0,
    scrolledUnderElevation: 0,
    automaticallyImplyLeading: back,
    titleSpacing: back ? 0 : 16,
    flexibleSpace: Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: colors, begin: Alignment.centerLeft, end: Alignment.centerRight),
      ),
    ),
    title: DefaultTextStyle.merge(
      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600),
      child: title,
    ),
    actions: actions,
    bottom: const PreferredSize(preferredSize: Size.fromHeight(3), child: TricolourBar(height: 3)),
  );
}

// ============================================================================
// §7  COMMON WIDGETS
// ============================================================================

class TricolourBar extends StatelessWidget {
  const TricolourBar({super.key, this.height = 4});
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(child: Container(color: const Color(0xFFFF9933))),
          Expanded(child: Container(color: Colors.white)),
          Expanded(child: Container(color: const Color(0xFF138808))),
        ],
      ),
    );
  }
}

/// The Nayan mark: an eye with a saffron upper lid, green lower lid and a navy
/// iris carrying a 24-spoke wheel.
class NayanLogo extends StatelessWidget {
  const NayanLogo({super.key, this.width = 96, this.spin = 0, this.onDark = false});
  final double width;
  final double spin; // 0..1, rotates the wheel slightly
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      height: width * 0.62,
      child: CustomPaint(painter: _EyePainter(spin: spin, onDark: onDark)),
    );
  }
}

class _EyePainter extends CustomPainter {
  _EyePainter({required this.spin, required this.onDark});
  final double spin;
  final bool onDark;

  Path _almond(double cx, double cy, double width, double h, double k) {
    final l = cx - width / 2;
    final r = cx + width / 2;
    return Path()
      ..moveTo(l, cy)
      ..quadraticBezierTo(cx, cy - h * k, r, cy)
      ..quadraticBezierTo(cx, cy + h * k, l, cy)
      ..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width * 0.96;
    final h = w * 0.62;
    final cx = size.width / 2;
    final cy = size.height / 2;

    // Lids: saffron above, green below (an outer almond split at the middle).
    final outer = _almond(cx, cy, w, h, 1.02);
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, 0, size.width, cy));
    canvas.drawPath(outer, Paint()..color = const Color(0xFFFF9933));
    canvas.restore();
    canvas.save();
    canvas.clipRect(Rect.fromLTRB(0, cy, size.width, size.height));
    canvas.drawPath(outer, Paint()..color = const Color(0xFF138808));
    canvas.restore();

    // White of the eye and the iris with a 24-spoke wheel.
    final inner = _almond(cx, cy, w * 0.86, h, 0.86);
    canvas.drawPath(inner, Paint()..color = Colors.white);
    canvas.save();
    canvas.clipPath(inner);
    final irisColor = onDark ? const Color(0xFF274C8C) : const Color(0xFF1F3A68);
    final r = h * 0.30;
    canvas.drawCircle(Offset(cx, cy), r, Paint()..color = irisColor);
    final spoke = Paint()
      ..color = Colors.white
      ..strokeWidth = math.max(0.8, w * 0.009)
      ..style = PaintingStyle.stroke;
    canvas.drawCircle(Offset(cx, cy), r * 0.74, spoke);
    for (var i = 0; i < 24; i++) {
      final a = (i / 24 + spin / 24) * 2 * math.pi;
      canvas.drawLine(
        Offset(cx + math.cos(a) * r * 0.2, cy + math.sin(a) * r * 0.2),
        Offset(cx + math.cos(a) * r * 0.74, cy + math.sin(a) * r * 0.74),
        spoke,
      );
    }
    canvas.drawCircle(Offset(cx, cy), r * 0.2, Paint()..color = Colors.white);
    canvas.drawCircle(Offset(cx, cy), r * 0.1, Paint()..color = irisColor);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _EyePainter old) => old.spin != spin || old.onDark != onDark;
}

/// Glass card used across the app (frosted, translucent, soft shadow).
class Panel extends StatelessWidget {
  const Panel(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(18),
      this.onTap,
      this.accent,
      this.margin,
      this.blur = true,
      this.tint});
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? accent; // optional coloured left edge
  final bool blur;
  final Color? tint; // optional colour wash

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final cs = t.colorScheme;
    final hc = AppScope.of(context).highContrast;
    final dark = t.brightness == Brightness.dark;
    final radius = BorderRadius.circular(18);
    Widget inner = Padding(padding: padding, child: child);
    if (accent != null) {
      inner = IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 4, color: accent),
            Expanded(child: inner),
          ],
        ),
      );
    }
    final List<Color> glass = dark
        ? [Colors.white.withValues(alpha: 0.10), Colors.white.withValues(alpha: 0.035)]
        : [Colors.white.withValues(alpha: 0.80), Colors.white.withValues(alpha: 0.48)];
    final List<Color> colors = tint == null
        ? glass
        : [Color.alphaBlend(tint!.withValues(alpha: dark ? 0.22 : 0.16), glass[0]), Color.alphaBlend(tint!.withValues(alpha: dark ? 0.12 : 0.08), glass[1])];
    Widget body = Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        color: hc ? cs.surface : null,
        gradient: hc ? null : LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
        border: Border.all(
          color: hc ? cs.outline : (dark ? Colors.white.withValues(alpha: 0.10) : Colors.white.withValues(alpha: 0.9)),
          width: hc ? 1.6 : 1,
        ),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: radius,
          onTap: onTap,
          splashColor: kSage.withValues(alpha: 0.14),
          highlightColor: kSage.withValues(alpha: 0.06),
          child: inner,
        ),
      ),
    );
    body = ClipRRect(
      borderRadius: radius,
      child: (!hc && blur) ? BackdropFilter(filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14), child: body) : body,
    );
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: hc
            ? null
            : [
                BoxShadow(
                  color: (dark ? Colors.black : kForest).withValues(alpha: dark ? 0.26 : 0.06),
                  blurRadius: 20,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: body,
    );
  }
}

/// Primary action with the glassy shine used on Sentinel/Setu buttons.
class ShineButton extends StatelessWidget {
  const ShineButton({super.key, required this.label, this.icon, this.onPressed, this.height = 52, this.color});
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final double height;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final hc = AppScope.of(context).highContrast;
    final base = color ?? cs.primary;
    final enabled = onPressed != null;
    final fg = color == null ? cs.onPrimary : Colors.white;
    final radius = BorderRadius.circular(16);
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Container(
        height: height,
        decoration: BoxDecoration(
          borderRadius: radius,
          gradient: hc
              ? null
              : LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color.lerp(base, Colors.white, 0.12)!, base, Color.lerp(base, Colors.black, 0.12)!],
                ),
          color: hc ? base : null,
          boxShadow: hc ? null : [BoxShadow(color: base.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6))],
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: Stack(
            children: [
              if (!hc)
                Positioned(
                  left: 0,
                  right: 0,
                  top: 0,
                  height: height * 0.5,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.white.withValues(alpha: 0.28), Colors.white.withValues(alpha: 0.0)],
                      ),
                    ),
                  ),
                ),
              Material(
                type: MaterialType.transparency,
                child: InkWell(
                  onTap: onPressed,
                  splashColor: Colors.white.withValues(alpha: 0.2),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (icon != null) ...[Icon(icon, color: fg, size: 20), const SizedBox(width: 8)],
                          Flexible(
                            child: Text(label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(color: fg, fontSize: 16, fontWeight: FontWeight.w700)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class Pill extends StatelessWidget {
  const Pill({super.key, required this.label, required this.color, this.icon});
  final Msg label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? Color.lerp(color, Colors.white, 0.45)! : color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: dark ? 0.22 : 0.10),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: s.highContrast ? 0.9 : 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: fg), const SizedBox(width: 4)],
          Text(
            s.lang == LangMode.bi ? '${label.en} · ${label.hi}' : label.of(s.lang),
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg),
          ),
        ],
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) =>
      Pill(label: AStatus.label(status), color: AStatus.color(status), icon: AStatus.icon(status));
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.en, this.hi, {super.key, this.number, this.done = false, this.trailing, this.icon});
  final String en;
  final String hi;
  final int? number;
  final bool done;
  final Widget? trailing;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    Widget? lead;
    if (number != null) {
      lead = Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: done ? cs.tertiary : cs.primary, shape: BoxShape.circle),
        child: done
            ? Icon(Icons.check_rounded, size: 18, color: cs.onPrimary)
            : Text('$number', style: TextStyle(color: cs.onPrimary, fontWeight: FontWeight.w700)),
      );
    } else if (icon != null) {
      lead = Icon(icon, color: cs.primary, size: 22);
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          if (lead != null) ...[lead, const SizedBox(width: 10)],
          Expanded(child: Bi(en, hi, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700))),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.icon, required this.en, required this.hi, required this.value, this.selectable = false});
  final IconData icon;
  final String en;
  final String hi;
  final String value;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: cs.onSurfaceVariant),
          const SizedBox(width: 10),
          SizedBox(
            width: 116,
            child: Bi(en, hi, style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: selectable
                ? SelectableText(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500))
                : Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.body, this.action});
  final IconData icon;
  final Msg title;
  final Msg? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: cs.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
            child: Icon(icon, size: 34, color: cs.primary),
          ),
          const SizedBox(height: 16),
          Bi(title.en, title.hi, center: true, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          if (body != null) ...[
            const SizedBox(height: 8),
            Bi(body!.en, body!.hi, center: true, style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
          ],
          if (action != null) ...[const SizedBox(height: 18), action!],
        ],
      ),
    );
  }
}

/// Marks screens that show demo / sample data.
class DemoBadge extends StatelessWidget {
  const DemoBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    if (!s.isDemo) return const SizedBox.shrink();
    return Tooltip(
      message: s.usingSampleData
          ? tx(context, 'Server not reachable — showing mock data for this demo', 'सर्वर उपलब्ध नहीं — इस डेमो के लिए मॉक डेटा दिखाया जा रहा है')
          : tx(context, 'Test account — mock data created for this demo, not a production database', 'परीक्षण खाता — इस डेमो के लिए बनाया गया मॉक डेटा, उत्पादन डेटाबेस नहीं'),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 6),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: kSand, borderRadius: BorderRadius.circular(99)),
        child: Text(
          s.lang == LangMode.hi ? 'मॉक' : 'Mock',
          style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

void snack(BuildContext context, String en, String hi, {bool error = false}) {
  final s = AppScope.read(context);
  final text = s.lang == LangMode.hi ? hi : (s.lang == LangMode.bi ? '$en\n$hi' : en);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(text),
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? kRed : null,
    ));
}

Future<bool> confirmDialog(BuildContext context,
    {required Msg title, required Msg body, required Msg confirm, bool danger = false}) async {
  final res = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Bi(title.en, title.hi, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
      content: Bi(body.en, body.hi, style: const TextStyle(fontSize: 15)),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(c).pop(false),
          child: Text(tx(c, 'Cancel', 'रद्द करें')),
        ),
        FilledButton(
          style: danger ? FilledButton.styleFrom(backgroundColor: kRed, foregroundColor: Colors.white) : null,
          onPressed: () => Navigator.of(c).pop(true),
          child: Text(tx(c, confirm.en, confirm.hi)),
        ),
      ],
    ),
  );
  return res ?? false;
}

InputDecoration fieldDecoration(BuildContext context,
    {required String label, String? hint, IconData? icon, Widget? suffix, String? helper}) {
  final cs = Theme.of(context).colorScheme;
  final hc = AppScope.of(context).highContrast;
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: hc ? cs.outline : cs.outlineVariant, width: hc ? 1.6 : 1),
  );
  return InputDecoration(
    labelText: label,
    hintText: hint,
    helperText: helper,
    helperMaxLines: 3,
    prefixIcon: icon == null ? null : Icon(icon),
    suffixIcon: suffix,
    filled: true,
    fillColor: cs.surface,
    border: border,
    enabledBorder: border,
    focusedBorder: border.copyWith(borderSide: BorderSide(color: cs.primary, width: 2)),
  );
}

// ============================================================================
// §8  SPLASH & LOGIN
// ============================================================================

class NayanApp extends StatelessWidget {
  const NayanApp({super.key, required this.app});
  final AppState app;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      app: app,
      child: Builder(builder: (context) {
        final s = AppScope.of(context);
        return MaterialApp(
          title: 'Nayan · नयन',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(Brightness.light, s.highContrast),
          darkTheme: buildTheme(Brightness.dark, s.highContrast),
          themeMode: s.themeMode,
          navigatorKey: nayanNavigatorKey,
          // Idle / background lock, silent token refresh (§21).
          builder: (context, child) => SessionGuard(child: child ?? const SizedBox.shrink()),
          home: const SplashScreen(),
        );
      }),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))
    ..forward();
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(milliseconds: 1900), _next);
  }

  void _next() {
    if (!mounted) return;
    final s = AppScope.read(context);
    Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
      builder: (_) => s.user == null ? const LoginScreen() : const HomeScreen(),
    ));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [kSage, kForest, kForestDeep],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              const TricolourBar(height: 4),
              Expanded(
                child: Center(
                  child: AnimatedBuilder(
                    animation: _c,
                    builder: (context, _) {
                      final t = Curves.easeOutCubic.transform(_c.value);
                      return Opacity(
                        opacity: t,
                        child: Transform.scale(
                          scale: 0.86 + 0.14 * t,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              NayanLogo(width: 150, spin: t, onDark: true),
                              const SizedBox(height: 26),
                              const Text('नयन',
                                  style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w700)),
                              const Text('NAYAN',
                                  style: TextStyle(
                                      color: Colors.white, fontSize: 18, letterSpacing: 6, fontWeight: FontWeight.w600)),
                              const SizedBox(height: 16),
                              Text('Monitoring & Inspection · निगरानी एवं निरीक्षण',
                                  style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 14)),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 22),
                child: Column(
                  children: [
                    Text('सामाजिक न्याय एवं अधिकारिता विभाग',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                    const SizedBox(height: 2),
                    Text('Department of Social Justice & Empowerment',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LangMenuButton extends StatelessWidget {
  const LangMenuButton({super.key, this.color});
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    const labels = {LangMode.bi: 'English + हिन्दी', LangMode.en: 'English', LangMode.hi: 'हिन्दी'};
    return PopupMenuButton<LangMode>(
      tooltip: tx(context, 'Language', 'भाषा'),
      initialValue: s.lang,
      onSelected: s.setLang,
      itemBuilder: (_) => [
        for (final m in LangMode.values)
          PopupMenuItem(
            value: m,
            child: Row(children: [
              Icon(m == s.lang ? Icons.radio_button_checked : Icons.radio_button_off, size: 18),
              const SizedBox(width: 10),
              Text(labels[m]!),
            ]),
          ),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.translate_rounded, size: 18, color: color),
          const SizedBox(width: 6),
          Text(labels[s.lang]!, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
          Icon(Icons.arrow_drop_down, color: color),
        ]),
      ),
    );
  }
}

Future<void> showServerDialog(BuildContext context) async {
  final s = AppScope.read(context);
  final ctrl = TextEditingController(text: s.serverUrl);
  final saved = await showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      title: Bi('Server', 'सर्वर', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: ctrl,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: fieldDecoration(c,
                label: tx(c, 'Backend address', 'बैकएंड पता'),
                hint: 'https://api.example.gov.in/api/v1',
                icon: Icons.dns_outlined,
                helper: tx(c, 'Leave empty to use mock/test mode. Must be https:// for phones and the web app.',
                    'मॉक/परीक्षण मोड के लिए ख़ाली छोड़ें। फ़ोन और वेब ऐप के लिए https:// ज़रूरी है।')),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(c).pop(''), child: Text(tx(c, 'Use mock mode', 'मॉक मोड चलाएँ'))),
        FilledButton(onPressed: () => Navigator.of(c).pop(ctrl.text.trim()), child: Text(tx(c, 'Save', 'सहेजें'))),
      ],
    ),
  );
  ctrl.dispose();
  if (saved == null) return;
  final bad = serverUrlProblem(saved);
  if (bad != null) {
    if (context.mounted) snack(context, bad.en, bad.hi, error: true);
    return;
  }
  s.setServer(saved);
  if (context.mounted) {
    snack(
      context,
      saved.isEmpty ? 'Mock mode — no server set.' : 'Server saved. Sign in again to use it.',
      saved.isEmpty ? 'मॉक मोड — कोई सर्वर सेट नहीं।' : 'सर्वर सहेजा गया। इसे उपयोग करने के लिए दोबारा साइन इन करें।',
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with _SignInFlow<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _hide = true;
  bool _showDemo = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    disposeFlow();
    super.dispose();
  }

  Future<void> _submit() async {
    final ok = await runStep(
        (s) => codeStep ? s.verifyCode(codeCtrl.text) : s.login(_email.text, _password.text));
    if (!ok || !mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => const HomeScreen()),
      (_) => false,
    );
  }

  void _fillDemo(String email) {
    setState(() {
      _email.text = email;
      _password.text = DemoBackend.demoPassword;
      error = null;
      _showDemo = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const TricolourBar(height: 4),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 6, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Bi('Dept. of Social Justice & Empowerment', 'सामाजिक न्याय और अधिकारिता विभाग',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: cs.onSurfaceVariant)),
                  ),
                  const LangMenuButton(),
                  IconButton(
                    tooltip: tx(context, 'Server settings', 'सर्वर सेटिंग'),
                    onPressed: () => showServerDialog(context),
                    icon: const Icon(Icons.settings_outlined),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 440),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Center(child: NayanLogo(width: 104)),
                        const SizedBox(height: 14),
                        Text('नयन · Nayan',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: cs.primary)),
                        const SizedBox(height: 4),
                        Bi('Real-time monitoring & inspection · DoSJE', 'रियल-टाइम निगरानी एवं निरीक्षण · डीओएसजेई',
                            center: true, style: TextStyle(fontSize: 15, color: cs.onSurfaceVariant)),
                        const SizedBox(height: 22),
                        Panel(
                          padding: const EdgeInsets.all(20),
                          child: AutofillGroup(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Bi('Sign in', 'साइन इन करें',
                                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                                const SizedBox(height: 16),
                                if (codeStep)
                                  _CodeStepFields(
                                    controller: codeCtrl,
                                    recovery: recovery,
                                    onToggleRecovery: toggleRecovery,
                                    onBack: backToPassword,
                                    onSubmit: _submit,
                                  )
                                else ...[
                                  TextField(
                                    controller: _email,
                                    keyboardType: TextInputType.emailAddress,
                                    autocorrect: false,
                                    textInputAction: TextInputAction.next,
                                    autofillHints: const [AutofillHints.email, AutofillHints.username],
                                    decoration: fieldDecoration(context,
                                        label: tx(context, 'Official email', 'आधिकारिक ईमेल'),
                                        hint: 'name@dosje.gov.in',
                                        icon: Icons.alternate_email_rounded),
                                  ),
                                  const SizedBox(height: 14),
                                  TextField(
                                    controller: _password,
                                    obscureText: _hide,
                                    textInputAction: TextInputAction.done,
                                    autofillHints: const [AutofillHints.password],
                                    onSubmitted: (_) => _submit(),
                                    decoration: fieldDecoration(context,
                                        label: tx(context, 'Password', 'पासवर्ड'),
                                        icon: Icons.lock_outline_rounded,
                                        suffix: IconButton(
                                          tooltip: _hide
                                              ? tx(context, 'Show password', 'पासवर्ड दिखाएँ')
                                              : tx(context, 'Hide password', 'पासवर्ड छिपाएँ'),
                                          onPressed: () => setState(() => _hide = !_hide),
                                          icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                        )),
                                  ),
                                ],
                                if (error != null) ...[
                                  const SizedBox(height: 14),
                                  _ErrorBox(error!),
                                ],
                                const SizedBox(height: 18),
                                SizedBox(
                                  height: 52,
                                  child: FilledButton(
                                    onPressed: busy || waiting ? null : _submit,
                                    child: busy
                                        ? const SizedBox(
                                            width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))
                                        : Text(
                                            buttonLabel(s.lang,
                                                codeStep ? const Msg('Verify', 'सत्यापित करें') : const Msg('Sign in', 'साइन इन')),
                                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Panel(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              InkWell(
                                onTap: () => setState(() => _showDemo = !_showDemo),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                  child: Row(children: [
                                    Icon(Icons.play_circle_outline_rounded, color: cs.secondary),
                                    const SizedBox(width: 10),
                                    Expanded(
                                        child: Bi('Use a test account', 'परीक्षण खाता इस्तेमाल करें',
                                            style: const TextStyle(fontWeight: FontWeight.w600))),
                                    Icon(_showDemo ? Icons.expand_less : Icons.expand_more),
                                  ]),
                                ),
                              ),
                              if (_showDemo) ...[
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Bi(
                                    'Test accounts we created for this demo, since sign-in here is department-managed and no production database is connected yet.',
                                    'यह डेमो दिखाने के लिए हमने बनाए गए परीक्षण खाते — यहाँ साइन-इन विभाग द्वारा प्रबंधित है और अभी कोई उत्पादन डेटाबेस जुड़ा नहीं है।',
                                    style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                                  ),
                                ),
                                for (final e in const ['inspector1@dosje.gov.in', 'inspector2@dosje.gov.in', 'official@dosje.gov.in', 'district@dosje.gov.in', 'staff@dosje.gov.in', 'beneficiary@dosje.gov.in'])
                                  ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: CircleAvatar(
                                      backgroundColor: cs.primary.withValues(alpha: 0.12),
                                      child: Icon(Icons.badge_outlined, color: cs.primary),
                                    ),
                                    title: Text(DemoBackend.people[e]!.name,
                                        style: const TextStyle(fontWeight: FontWeight.w600)),
                                    subtitle: Text([DemoBackend.people[e]!.designation, DemoBackend.people[e]!.district].where((x) => x.isNotEmpty).join(' · ')),
                                    trailing: const Icon(Icons.north_west_rounded, size: 18),
                                    onTap: () => _fillDemo(e),
                                  ),
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 10),
                                  child: Bi('Password for test accounts: ${DemoBackend.demoPassword}',
                                      'परीक्षण खातों का पासवर्ड: ${DemoBackend.demoPassword}',
                                      style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(s.serverUrl.isEmpty ? Icons.science_outlined : Icons.cloud_done_outlined,
                                size: 16, color: cs.onSurfaceVariant),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                s.serverUrl.isEmpty
                                    ? tx(context, 'Mock mode · no server set', 'मॉक मोड · सर्वर सेट नहीं')
                                    : s.serverUrl,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Bi('Accounts are created by your department.', 'खाते आपके विभाग द्वारा बनाए जाते हैं।',
                            center: true, style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                        if (kSignUpHook != null)
                          TextButton(
                            onPressed: () => kSignUpHook!(context),
                            child: Text(tx(context, 'Create account', 'खाता बनाएँ')),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// §9  HOME, ASSIGNMENTS, ASSIGNMENT DETAIL
// ============================================================================

class _NavItem {
  const _NavItem(this.en, this.hi, this.icon, this.selected, this.titleEn, this.titleHi);
  final String en;
  final String hi;
  final IconData icon;
  final IconData selected;
  final String titleEn;
  final String titleHi;
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  AppState? _app;

  static const _inspectorNav = [
    _NavItem('Visits', 'दौरे', Icons.map_outlined, Icons.map_rounded, 'My visits', 'मेरे दौरे'),
    _NavItem('CCTV', 'सीसीटीवी', Icons.videocam_outlined, Icons.videocam_rounded, 'Live CCTV', 'लाइव सीसीटीवी'),
    _NavItem('VC', 'वीसी', Icons.video_call_outlined, Icons.video_call_rounded, 'Random VC', 'रैंडम वीसी'),
    _NavItem('Reports', 'रिपोर्ट', Icons.fact_check_outlined, Icons.fact_check_rounded, 'My reports', 'मेरी रिपोर्ट'),
    _NavItem('Profile', 'प्रोफ़ाइल', Icons.person_outline_rounded, Icons.person_rounded, 'Profile & settings', 'प्रोफ़ाइल और सेटिंग'),
  ];

  static const _officialNav = [
    _NavItem('Monitor', 'निगरानी', Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, 'Live monitoring', 'लाइव निगरानी'),
    _NavItem('CCTV', 'सीसीटीवी', Icons.videocam_outlined, Icons.videocam_rounded, 'Live CCTV', 'लाइव सीसीटीवी'),
    _NavItem('VC', 'वीसी', Icons.video_call_outlined, Icons.video_call_rounded, 'Random VC', 'रैंडम वीसी'),
    _NavItem('Assign', 'आवंटन', Icons.casino_outlined, Icons.casino_rounded, 'Random assignment', 'रैंडम आवंटन'),
    _NavItem('Insights', 'विश्लेषण', Icons.insights_outlined, Icons.insights_rounded, 'Smart insights', 'स्मार्ट विश्लेषण'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final s = AppScope.read(context);
      _app = s;
      final u = s.user;
      if (u == null || u.isPortal) return;
      if (!u.isOfficial && !s.assignmentsLoadedOnce && !s.loadingAssignments) s.refreshAssignments();
      if (!s.monitorLoaded && !s.monitorLoading) s.loadMonitor();
      s.startLive();
      final role = u.isOfficial ? 'official' : 'inspector';
      if (!s.tourSeen(role)) {
        s.markTourSeen(role);
        showTour(context);
      }
    });
  }

  @override
  void dispose() {
    _app?.stopLive();
    super.dispose();
  }

  void goTab(int i) => setState(() => _tab = i);

  String _navLabel(LangMode m, String en, String hi) => m == LangMode.hi ? hi : (m == LangMode.bi ? '$en\n$hi' : en);

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user;
    if (u == null) return const LoginScreen();
    if (u.isPortal) return const PortalHome();
    final official = u.isOfficial;
    final nav = official ? _officialNav : _inspectorNav;
    if (_tab >= nav.length) _tab = 0;
    final pages = official
        ? [
            MonitorTab(onGo: goTab),
            const CctvTab(),
            const VcTab(),
            const AssignTab(),
            const InsightsTab(),
          ]
        : [
            AssignmentsTab(onGo: goTab),
            const CctvTab(),
            const VcTab(),
            const SubmissionsTab(),
            const ProfileTab(),
          ];
    final dark = Theme.of(context).brightness == Brightness.dark;
    final showFab = !(official ? false : _tab == 4);
    return Scaffold(
      appBar: _tab == 0 ? null : NayanTopBar(title: Msg(nav[_tab].titleEn, nav[_tab].titleHi), onGo: goTab),
      drawer: NayanDrawer(nav: nav, current: _tab, onGo: goTab),
      body: SafeArea(bottom: false, child: IndexedStack(index: _tab, children: pages)),
      floatingActionButton: showFab
          ? FloatingActionButton.extended(
              heroTag: 'yukt',
              backgroundColor: kSand,
              foregroundColor: Colors.white,
              onPressed: () => openYukt(context, onGo: goTab),
              icon: const Icon(Icons.support_agent_rounded),
              label: Text(s.lang == LangMode.hi ? 'युक्त' : 'Yukt'),
            )
          : null,
      bottomNavigationBar: ClipRect(
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: NavigationBarTheme(
            data: NavigationBarThemeData(
              labelTextStyle: WidgetStatePropertyAll(
                TextStyle(fontSize: s.lang == LangMode.bi ? 10.5 : 12, fontWeight: FontWeight.w600, height: 1.15),
              ),
            ),
            child: NavigationBar(
              height: s.lang == LangMode.bi ? 74 : 66,
              backgroundColor: s.highContrast
                  ? Theme.of(context).colorScheme.surface
                  : (dark ? const Color(0xFF1A221C).withValues(alpha: 0.78) : kIvory.withValues(alpha: 0.78)),
              indicatorColor: kSage.withValues(alpha: dark ? 0.35 : 0.28),
              surfaceTintColor: Colors.transparent,
              elevation: 0,
              selectedIndex: _tab,
              onDestinationSelected: goTab,
              destinations: [
                for (final n in nav)
                  NavigationDestination(
                    icon: Icon(n.icon),
                    selectedIcon: Icon(n.selected),
                    label: _navLabel(s.lang, n.en, n.hi),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AssignmentsTab extends StatefulWidget {
  const AssignmentsTab({super.key, this.onGo});
  final void Function(int tab)? onGo;

  @override
  State<AssignmentsTab> createState() => _AssignmentsTabState();
}

class _AssignmentsTabState extends State<AssignmentsTab> {
  int _filter = 1; // 0 all, 1 to do, 2 done

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user;
    if (u == null) return const SizedBox.shrink();
    final all = s.assignments;
    final todo = all.where((a) => !AStatus.isDone(a.status)).toList();
    final done = all.where((a) => AStatus.isDone(a.status)).toList();
    final shown = _filter == 0 ? all : (_filter == 1 ? todo : done);

    Widget body;
    if (s.loadingAssignments && !s.assignmentsLoadedOnce) {
      body = Column(children: List.generate(3, (_) => const _SkeletonCard()));
    } else if (s.sessionExpired) {
      body = EmptyState(
        icon: Icons.lock_outline_rounded,
        title: const Msg('Your session has expired', 'आपका सत्र समाप्त हो गया है'),
        body: const Msg('Please sign in again.', 'कृपया दोबारा साइन इन करें।'),
        action: FilledButton(
          onPressed: () async {
            await s.logout();
            if (!context.mounted) return;
            Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute<void>(builder: (_) => const LoginScreen()), (_) => false);
          },
          child: Text(tx(context, 'Sign in again', 'दोबारा साइन इन करें')),
        ),
      );
    } else if (s.assignmentsError != null) {
      body = EmptyState(
        icon: Icons.cloud_off_rounded,
        title: const Msg('Could not load your visits', 'आपके दौरे लोड नहीं हो सके'),
        body: Msg(s.assignmentsError!, s.assignmentsError!),
        action: FilledButton.icon(
          onPressed: s.refreshAssignments,
          icon: const Icon(Icons.refresh_rounded),
          label: Text(tx(context, 'Try again', 'फिर से प्रयास करें')),
        ),
      );
    } else if (shown.isEmpty) {
      body = EmptyState(
        icon: _filter == 2 ? Icons.inventory_2_outlined : Icons.celebration_outlined,
        title: _filter == 2
            ? const Msg('Nothing submitted yet', 'अभी तक कुछ जमा नहीं किया')
            : const Msg('No pending visits', 'कोई दौरा बाकी नहीं'),
        body: const Msg('New assignments from your official appear here. Tap refresh to check again.',
            'अधिकारी द्वारा सौंपे गए नए कार्य यहाँ दिखेंगे। दोबारा देखने के लिए रीफ़्रेश दबाएँ।'),
      );
    } else {
      body = Column(children: [for (final a in shown) AssignmentCard(a)]);
    }

    return _Plain(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 120),
        children: [
          HomeHeader(onGo: widget.onGo),
          const SizedBox(height: 14),
          _InspectorQuickRow(onGo: widget.onGo),
          const SizedBox(height: 20),
          SectionTitle('Assignments', 'निरीक्षण कार्य',
              icon: Icons.assignment_outlined,
              trailing: IconButton(
                tooltip: tx(context, 'Refresh', 'रीफ़्रेश'),
                onPressed: s.loadingAssignments ? null : s.refreshAssignments,
                icon: s.loadingAssignments
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.refresh_rounded),
              )),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              for (final f in const [
                (1, Msg('To do', 'करना है')),
                (2, Msg('Done', 'पूरे')),
                (0, Msg('All', 'सभी')),
              ])
                ChoiceChip(
                  selected: _filter == f.$1,
                  onSelected: (_) => setState(() => _filter = f.$1),
                  label: Text(
                    '${s.lang == LangMode.bi ? '${f.$2.en} · ${f.$2.hi}' : f.$2.of(s.lang)}  '
                    '(${f.$1 == 0 ? all.length : (f.$1 == 1 ? todo.length : done.length)})',
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (s.usingSampleData)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Panel(
                accent: kSand,
                padding: const EdgeInsets.all(12),
                child: Bi('The server could not be reached, so mock visits are shown. Uploads from these go to the mock/test server.',
                    'सर्वर से संपर्क नहीं हो सका, इसलिए मॉक दौरे दिखाए जा रहे हैं। इनके अपलोड मॉक/परीक्षण सर्वर पर जाते हैं।',
                    style: const TextStyle(fontSize: 13)),
              ),
            ),
          body,
        ],
      ),
    );
  }
}


class _InspectorQuickRow extends StatelessWidget {
  const _InspectorQuickRow({this.onGo});
  final void Function(int tab)? onGo;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final openAlerts = s.scopedAlerts.where((a) => a.status == 'open').length;
    final anomalies = s.allAnomalies.length;
    final camIssues = s.scopedCameras.where((c) => !c.online).length;
    return Row(
      children: [
        Expanded(
          child: QuickTile(
            icon: Icons.notifications_active_outlined,
            color: kRed,
            value: '$openAlerts',
            label: const Msg('Open alerts', 'खुले अलर्ट'),
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AlertsScreen())),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: QuickTile(
            icon: Icons.insights_rounded,
            color: kSand,
            value: '$anomalies',
            label: const Msg('Anomaly flags', 'विसंगति संकेत'),
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const InsightsScreen())),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: QuickTile(
            icon: Icons.videocam_off_outlined,
            color: kAmber,
            value: '$camIssues',
            label: const Msg('Camera issues', 'कैमरा समस्या'),
            onTap: onGo == null ? null : () => onGo!(1),
          ),
        ),
      ],
    );
  }
}

/// Small glass tile with a coloured icon, a value and a label.
class QuickTile extends StatelessWidget {
  const QuickTile({super.key, required this.icon, required this.color, required this.value, required this.label, this.onTap, this.sub});
  final IconData icon;
  final Color color;
  final String value;
  final Msg label;
  final Msg? sub;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? Color.lerp(color, Colors.white, 0.55)! : color;
    return Panel(
      tint: color,
      padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(9)),
                child: Icon(icon, size: 17, color: fg),
              ),
              const Spacer(),
              if (onTap != null) Icon(Icons.chevron_right_rounded, size: 18, color: fg.withValues(alpha: 0.7)),
            ],
          ),
          const SizedBox(height: 8),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: fg)),
          Bi(label.en, label.hi, maxLines: 1, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(sub!.of(AppScope.of(context).lang),
                maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ],
      ),
    );
  }
}

class _GreetingCard extends StatelessWidget {
  const _GreetingCard({required this.user});
  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final first = user.name.split(' ').first;
    final hour = DateTime.now().hour;
    final greet = hour < 12
        ? const Msg('Good morning', 'सुप्रभात')
        : (hour < 17 ? const Msg('Good afternoon', 'नमस्कार') : const Msg('Good evening', 'शुभ संध्या'));
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: s.highContrast
              ? [Colors.black, Colors.black]
              : (dark ? [const Color(0xFF2A3D30), const Color(0xFF1B2820)] : [kForest, kSage, const Color(0xFF8FA98B)]),
        ),
        border: s.highContrast ? Border.all(color: Colors.white, width: 1.6) : null,
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: Colors.white.withValues(alpha: 0.15),
            child: Text(user.initials,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 18)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: DefaultTextStyle.merge(
              style: const TextStyle(color: Colors.white),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Bi('${greet.en}, $first', '${greet.hi}, $first',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white)),
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (user.designation.isNotEmpty) user.designation,
                      if (user.district.isNotEmpty) user.district,
                      if (user.employeeId.isNotEmpty) user.employeeId,
                    ].join(' · '),
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13),
                  ),
                  const SizedBox(height: 2),
                  Text(fmtDate(DateTime.now(), s.lang),
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.color, required this.icon});
  final int value;
  final Msg label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? Color.lerp(color, Colors.white, 0.4)! : color;
    return Panel(
      padding: const EdgeInsets.fromLTRB(10, 12, 8, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: fg),
          const SizedBox(height: 6),
          Text('$value', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: fg)),
          Bi(label.en, label.hi, maxLines: 1, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.07);
    Widget bar(double w, double h) =>
        Container(width: w, height: h, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(6)));
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [bar(220, 16), const SizedBox(height: 10), bar(150, 12), const SizedBox(height: 14), bar(110, 22)],
        ),
      ),
    );
  }
}

class DueText extends StatelessWidget {
  const DueText(this.a, {super.key});
  final Assignment a;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final due = a.dueAt;
    if (due == null) return const SizedBox.shrink();
    final m = fmtDue(due);
    final cs = Theme.of(context).colorScheme;
    final color = a.overdue ? cs.error : cs.onSurfaceVariant;
    final prefix = AStatus.isDone(a.status) ? const Msg('Was due', 'नियत था') : const Msg('Due', 'नियत');
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.schedule_rounded, size: 15, color: color),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            s.lang == LangMode.hi ? '${prefix.hi}: ${m.hi}' : '${prefix.en}: ${m.en}',
            style: TextStyle(fontSize: 13, color: color, fontWeight: a.overdue ? FontWeight.w700 : FontWeight.w500),
          ),
        ),
      ],
    );
  }
}

class AssignmentCard extends StatelessWidget {
  const AssignmentCard(this.a, {super.key});
  final Assignment a;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final inst = a.institute;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Panel(
        accent: AStatus.color(a.status),
        padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => AssignmentDetailScreen(assignmentId: a.id)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(inst.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                ),
                Icon(Icons.chevron_right_rounded, color: cs.onSurfaceVariant),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              [
                if (inst.district.isNotEmpty) inst.district,
                inst.typeLabel.of(s.lang),
              ].join(' · '),
              style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                StatusPill(a.status),
                if (a.surprise) const Pill(label: Msg('Surprise', 'अचानक'), color: kSand, icon: Icons.casino_rounded),
                if (a.urgent && !AStatus.isDone(a.status))
                  const Pill(label: Msg('Urgent', 'अति आवश्यक'), color: kRed, icon: Icons.priority_high_rounded),
                if (a.overdue) const Pill(label: Msg('Overdue', 'समय बीत गया'), color: kRed, icon: Icons.warning_amber_rounded),
              ],
            ),
            if (a.dueAt != null) ...[const SizedBox(height: 8), DueText(a)],
          ],
        ),
      ),
    );
  }
}

Pill compliancePill(Institute inst) {
  final score = inst.complianceScore == null ? '' : ' (${inst.complianceScore!.toStringAsFixed(1)})';
  switch (inst.status) {
    case 'red':
      return Pill(label: Msg('Compliance: Red$score', 'अनुपालन: लाल$score'), color: kRed, icon: Icons.shield_outlined);
    case 'yellow':
      return Pill(label: Msg('Compliance: Amber$score', 'अनुपालन: पीला$score'), color: kAmber, icon: Icons.shield_outlined);
    case 'green':
      return Pill(label: Msg('Compliance: Green$score', 'अनुपालन: हरा$score'), color: kGreen, icon: Icons.shield_outlined);
    default:
      return Pill(label: Msg('Compliance: not rated$score', 'अनुपालन: आकलन नहीं$score'), color: Colors.blueGrey, icon: Icons.shield_outlined);
  }
}

Future<void> openDirections(BuildContext context, Institute inst) async {
  if (inst.lat == null || inst.lng == null) return;
  final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${inst.lat},${inst.lng}');
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    ok = false;
  }
  if (!ok && context.mounted) {
    snack(context, 'Could not open maps.', 'मैप नहीं खुल सका।', error: true);
  }
}

class AssignmentDetailScreen extends StatelessWidget {
  const AssignmentDetailScreen({super.key, required this.assignmentId});
  final String assignmentId;

  Future<void> _start(BuildContext context, Assignment a) async {
    final s = AppScope.read(context);
    if (a.status == AStatus.assigned || a.status == AStatus.rejected) {
      if (a.status == AStatus.rejected) s.drafts.remove(a.id);
      s.setStatus(a, AStatus.inProgress);
    }
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => InspectionScreen(assignmentId: a.id)));
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final a = s.assignmentById(assignmentId);
    if (a == null) {
      return Scaffold(
        appBar: govAppBar(context, title: Bi('Assignment', 'निरीक्षण कार्य')),
        body: const Center(
          child: EmptyState(icon: Icons.search_off_rounded, title: Msg('Assignment not found', 'कार्य नहीं मिला')),
        ),
      );
    }
    final inst = a.institute;
    final cs = Theme.of(context).colorScheme;
    final sub = s.submissionFor(a.id);

    Widget action;
    if (AStatus.isDone(a.status)) {
      action = sub != null
          ? FilledButton.tonalIcon(
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute<void>(builder: (_) => SubmissionDetailScreen(submission: sub))),
              icon: const Icon(Icons.receipt_long_outlined),
              label: Text(s.lang == LangMode.bi ? 'View submission · जमा देखें' : tx(context, 'View submission', 'जमा देखें')),
            )
          : OutlinedButton.icon(
              onPressed: null,
              icon: const Icon(Icons.cloud_done_outlined),
              label: Text(tx(context, 'Submitted from another device', 'दूसरे डिवाइस से जमा किया गया')),
            );
    } else {
      final Msg label = a.status == AStatus.inProgress
          ? const Msg('Continue inspection', 'निरीक्षण जारी रखें')
          : (a.status == AStatus.rejected ? const Msg('Inspect again', 'दोबारा निरीक्षण करें') : const Msg('Start inspection', 'निरीक्षण शुरू करें'));
      action = FilledButton.icon(
        onPressed: () => _start(context, a),
        icon: const Icon(Icons.play_arrow_rounded),
        label: Text(s.lang == LangMode.bi ? '${label.en} · ${label.hi}' : label.of(s.lang),
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      );
    }

    return Scaffold(
      appBar: govAppBar(context, title: Bi('Assignment', 'निरीक्षण कार्य'), actions: const [DemoBadge()]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        children: [
          Panel(
            accent: AStatus.color(a.status),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(inst.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(
                  [
                    inst.typeLabel.of(s.lang),
                    [inst.district, inst.state].where((x) => x.isNotEmpty).join(', '),
                  ].where((x) => x.isNotEmpty).join(' · '),
                  style: TextStyle(color: cs.onSurfaceVariant),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    StatusPill(a.status),
                    if (a.urgent && !AStatus.isDone(a.status))
                      const Pill(label: Msg('Urgent', 'अति आवश्यक'), color: kRed, icon: Icons.priority_high_rounded),
                    compliancePill(inst),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                const SectionTitle('Visit details', 'दौरे का विवरण', icon: Icons.event_note_outlined),
                if (a.dueAt != null)
                  InfoRow(
                    icon: Icons.schedule_rounded,
                    en: 'Due',
                    hi: 'नियत समय',
                    value: fmtDue(a.dueAt!).of(s.lang),
                  ),
                InfoRow(
                  icon: Icons.send_outlined,
                  en: 'Assigned on',
                  hi: 'सौंपा गया',
                  value: fmtDateTime(a.createdAt, s.lang),
                ),
                InfoRow(icon: Icons.tag_rounded, en: 'Assignment ID', hi: 'कार्य आईडी', value: a.id, selectable: true),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Location', 'स्थान', icon: Icons.place_outlined),
                InfoRow(icon: Icons.north_rounded, en: 'Latitude', hi: 'अक्षांश', value: fmtCoord(inst.lat)),
                InfoRow(icon: Icons.east_rounded, en: 'Longitude', hi: 'देशांतर', value: fmtCoord(inst.lng)),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: inst.lat == null ? null : () => openDirections(context, inst),
                  icon: const Icon(Icons.directions_rounded),
                  label: Text(s.lang == LangMode.bi ? 'Get directions · रास्ता देखें' : tx(context, 'Get directions', 'रास्ता देखें')),
                ),
              ],
            ),
          ),
          if (a.notes.isNotEmpty) ...[
            const SizedBox(height: 16),
            Panel(
              accent: kSand,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionTitle('Instructions from the official', 'अधिकारी के निर्देश', icon: Icons.campaign_outlined),
                  for (final n in a.notes)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Icon(Icons.circle, size: 7, color: cs.secondary),
                          ),
                          const SizedBox(width: 10),
                          Expanded(child: Bi(n.en, n.hi, style: const TextStyle(fontSize: 14))),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle('What you will check', 'क्या जाँचना है', icon: Icons.checklist_rounded),
                for (final item in kChecklist)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.check_box_outline_blank_rounded, size: 18, color: cs.onSurfaceVariant),
                        const SizedBox(width: 10),
                        Expanded(child: Bi(item.en, item.hi, style: const TextStyle(fontSize: 14))),
                      ],
                    ),
                  ),
                const SizedBox(height: 4),
                Bi('You will also take photos/videos. Each one gets GPS, time and a SHA-256 seal automatically.',
                    'आप फ़ोटो/वीडियो भी लेंगे। हर एक पर GPS, समय और SHA-256 मुहर अपने आप लगेगी।',
                    style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: SizedBox(height: 52, child: action),
        ),
      ),
    );
  }
}

// ============================================================================
// §10 INSPECTION — GPS, camera, timestamp, SHA-256, checklist, remarks
// ============================================================================

String _videoExt(String name) {
  final n = name.toLowerCase();
  for (final e in const ['mov', 'webm', '3gp', 'mkv', 'm4v']) {
    if (n.endsWith('.$e')) return e;
  }
  return 'mp4';
}

class InspectionScreen extends StatefulWidget {
  const InspectionScreen({super.key, required this.assignmentId});
  final String assignmentId;

  @override
  State<InspectionScreen> createState() => _InspectionScreenState();
}

class _InspectionScreenState extends State<InspectionScreen> {
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _remarks = TextEditingController();
  bool _remarksLoaded = false;
  bool _locating = false;
  Msg? _busy;

  @override
  void dispose() {
    _remarks.dispose();
    super.dispose();
  }

  Assignment? get _assignment => AppScope.read(context).assignmentById(widget.assignmentId);

  /// One GPS fix. Shows a message and returns null if it cannot be had.
  Future<Position?> _fix({bool quiet = false}) async {
    try {
      if (!kIsWeb) {
        final on = await Geolocator.isLocationServiceEnabled();
        if (!on) {
          if (!quiet && mounted) {
            snack(context, 'Turn on location (GPS) and try again.', 'लोकेशन (GPS) चालू करें और दोबारा प्रयास करें।',
                error: true);
          }
          return null;
        }
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        if (!quiet && mounted) {
          if (perm == LocationPermission.deniedForever) {
            snack(context, 'Location permission is blocked. Allow it for Nayan in your phone settings.',
                'लोकेशन अनुमति बंद है। फ़ोन की सेटिंग में नयन के लिए इसे चालू करें।',
                error: true);
          } else {
            snack(context, 'Location permission is needed to record where the evidence was taken.',
                'साक्ष्य कहाँ लिया गया, यह दर्ज करने के लिए लोकेशन अनुमति ज़रूरी है।',
                error: true);
          }
        }
        return null;
      }
      return await Geolocator.getCurrentPosition(
        locationSettings: LocationSettings(accuracy: LocationAccuracy.high, timeLimit: const Duration(seconds: 25)),
      );
    } on TimeoutException {
      if (!quiet && mounted) {
        snack(context, 'Could not get a GPS fix. Move to an open area and try again.',
            'GPS नहीं मिल सका। खुली जगह पर जाकर दोबारा प्रयास करें।',
            error: true);
      }
    } catch (e) {
      if (!quiet && mounted) {
        snack(context, 'Location is not available on this device right now.', 'इस डिवाइस पर अभी लोकेशन उपलब्ध नहीं है।',
            error: true);
      }
    }
    return null;
  }

  Future<void> _locate() async {
    final a = _assignment;
    if (a == null || _locating) return;
    final d = AppScope.read(context).draftFor(a);
    setState(() => _locating = true);
    final pos = await _fix();
    if (!mounted) return;
    setState(() {
      _locating = false;
      if (pos != null) {
        d.lat = pos.latitude;
        d.lng = pos.longitude;
        d.accuracy = pos.accuracy;
        d.locatedAt = DateTime.now();
      }
    });
  }

  Future<void> _capture(EvKind kind) async {
    final a = _assignment;
    if (a == null || _busy != null) return;
    final s = AppScope.read(context);
    final d = s.draftFor(a);
    if (d.evidence.length >= 20) {
      snack(context, 'Up to 20 files per inspection.', 'एक निरीक्षण में अधिकतम 20 फ़ाइलें।', error: true);
      return;
    }
    XFile? file;
    try {
      file = kind == EvKind.photo
          ? await _picker.pickImage(
              source: ImageSource.camera,
              imageQuality: 85,
              maxWidth: 2560,
              preferredCameraDevice: CameraDevice.rear,
            )
          : await _picker.pickVideo(
              source: ImageSource.camera,
              maxDuration: const Duration(seconds: 60),
              preferredCameraDevice: CameraDevice.rear,
            );
    } on PlatformException catch (e) {
      if (!mounted) return;
      final denied = e.code.contains('denied') || e.code.contains('access');
      snack(
        context,
        denied ? 'Camera permission is needed. Allow it for Nayan in your phone settings.' : 'Could not open the camera.',
        denied ? 'कैमरा अनुमति ज़रूरी है। फ़ोन की सेटिंग में नयन के लिए इसे चालू करें।' : 'कैमरा नहीं खुल सका।',
        error: true,
      );
      return;
    } catch (_) {
      if (mounted) snack(context, 'Could not open the camera.', 'कैमरा नहीं खुल सका।', error: true);
      return;
    }
    if (file == null || !mounted) return;

    final capturedAt = DateTime.now();
    setState(() => _busy = const Msg('Securing evidence: GPS, time and SHA-256…', 'साक्ष्य सुरक्षित हो रहा है: GPS, समय और SHA-256…'));
    try {
      final bytes = await file.readAsBytes();
      if (kind == EvKind.video && bytes.length > 80 * 1024 * 1024) {
        if (mounted) {
          snack(context, 'Video is too large (max 80 MB). Record a shorter clip.', 'वीडियो बहुत बड़ा है (अधिकतम 80 MB)। छोटा वीडियो लें।',
              error: true);
        }
        return;
      }
      final pos = await _fix(quiet: d.lat != null);
      if (pos != null && d.lat == null) {
        d.lat = pos.latitude;
        d.lng = pos.longitude;
        d.accuracy = pos.accuracy;
        d.locatedAt = DateTime.now();
      }
      final hash = await hashBytes(bytes);
      final c = capturedAt;
      final stamp = '${c.year}${two(c.month)}${two(c.day)}_${two(c.hour)}${two(c.minute)}${two(c.second)}';
      final ext = kind == EvKind.photo ? 'jpg' : _videoExt(file.name);
      final ev = Evidence(
        localId: '${c.microsecondsSinceEpoch}',
        kind: kind,
        bytes: bytes,
        fileName: '${kind == EvKind.photo ? 'IMG' : 'VID'}_${stamp}_${d.evidence.length + 1}.$ext',
        capturedAt: capturedAt,
        sha256: hash,
        lat: pos?.latitude ?? d.lat,
        lng: pos?.longitude ?? d.lng,
        accuracy: pos?.accuracy ?? d.accuracy,
        deviceId: s.deviceId,
        gpsFallback: pos == null && d.lat != null,
      );
      d.evidence.add(ev);
      if (ev.lat == null && mounted) {
        snack(context, 'Saved without GPS — the server will reject it. Get your location and take it again.',
            'GPS के बिना सहेजा गया — सर्वर इसे अस्वीकार करेगा। लोकेशन लेकर दोबारा लें।',
            error: true);
      }
    } catch (_) {
      if (mounted) snack(context, 'Could not save this file. Please try again.', 'यह फ़ाइल सहेजी नहीं जा सकी। दोबारा प्रयास करें।', error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _delete(InspectionDraft d, Evidence e) async {
    final ok = await confirmDialog(
      context,
      title: const Msg('Remove this file?', 'यह फ़ाइल हटाएँ?'),
      body: const Msg('It has not been uploaded yet. You can take it again.', 'यह अभी अपलोड नहीं हुई है। आप इसे दोबारा ले सकते हैं।'),
      confirm: const Msg('Remove', 'हटाएँ'),
      danger: true,
    );
    if (!ok || !mounted) return;
    setState(() => d.evidence.remove(e));
  }

  Future<void> _submit() async {
    final a = _assignment;
    if (a == null) return;
    final d = AppScope.read(context).draftFor(a);
    final missing = <Msg>[];
    if (d.lat == null) missing.add(const Msg('Your GPS location', 'आपकी GPS लोकेशन'));
    if (!d.evidence.any((e) => e.kind == EvKind.photo)) {
      missing.add(const Msg('At least one photo', 'कम से कम एक फ़ोटो'));
    }
    final unanswered = kChecklist.where((c) => !d.answers.containsKey(c.key)).length;
    if (unanswered > 0) missing.add(Msg('$unanswered checklist item(s)', '$unanswered जाँच बिंदु'));
    if (d.remarks.trim().length < 10) {
      missing.add(const Msg('Remarks (at least 10 characters)', 'टिप्पणी (कम से कम 10 अक्षर)'));
    }
    if (missing.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Bi('Before you submit', 'जमा करने से पहले', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Bi('Please complete:', 'कृपया पूरा करें:'),
              const SizedBox(height: 10),
              for (final m in missing)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.radio_button_unchecked, size: 18, color: kSand),
                      const SizedBox(width: 8),
                      Expanded(child: Bi(m.en, m.hi)),
                    ],
                  ),
                ),
            ],
          ),
          actions: [FilledButton(onPressed: () => Navigator.of(c).pop(), child: Text(tx(c, 'OK', 'ठीक है')))],
        ),
      );
      return;
    }
    final photos = d.evidence.where((e) => e.kind == EvKind.photo).length;
    final videos = d.evidence.length - photos;
    final ok = await confirmDialog(
      context,
      title: const Msg('Submit inspection?', 'निरीक्षण जमा करें?'),
      body: Msg(
        '$photos photo(s) and $videos video(s) will be uploaded with GPS, time and SHA-256, along with your checklist and remarks. You cannot edit after submitting.',
        '$photos फ़ोटो और $videos वीडियो GPS, समय और SHA-256 के साथ, आपकी जाँच सूची और टिप्पणी सहित अपलोड होंगे। जमा करने के बाद बदलाव नहीं हो सकेगा।',
      ),
      confirm: const Msg('Submit', 'जमा करें'),
    );
    if (!ok || !mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => SubmissionStatusScreen(assignmentId: a.id)),
    );
  }

  String _both(LangMode m, String en, String hi) => m == LangMode.bi ? '$en · $hi' : (m == LangMode.hi ? hi : en);

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final a = s.assignmentById(widget.assignmentId);
    if (a == null) {
      return Scaffold(
        appBar: govAppBar(context, title: Bi('Inspection', 'निरीक्षण')),
        body: const Center(child: EmptyState(icon: Icons.search_off_rounded, title: Msg('Assignment not found', 'कार्य नहीं मिला'))),
      );
    }
    final d = s.draftFor(a);
    if (!_remarksLoaded) {
      _remarks.text = d.remarks;
      _remarksLoaded = true;
    }
    final inst = a.institute;
    final cs = Theme.of(context).colorScheme;
    double? distance;
    if (d.lat != null && d.lng != null && inst.lat != null && inst.lng != null) {
      distance = Geolocator.distanceBetween(d.lat!, d.lng!, inst.lat!, inst.lng!);
    }
    final locDone = d.lat != null;
    final evDone = d.evidence.any((e) => e.kind == EvKind.photo);
    final checkDone = kChecklist.every((c) => d.answers.containsKey(c.key));
    final remarksDone = d.remarks.trim().length >= 10;
    final doneCount = [locDone, evDone, checkDone, remarksDone].where((x) => x).length;

    return Scaffold(
      appBar: govAppBar(context, title: Bi('Inspection', 'निरीक्षण'), actions: const [DemoBadge()]),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            children: [
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(inst.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      s.lang == LangMode.hi
                          ? 'शुरू: ${fmtTime(d.startedAt)} · $doneCount/4 चरण पूरे'
                          : 'Started ${fmtTime(d.startedAt)} · $doneCount of 4 steps done',
                      style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value: doneCount / 4,
                        minHeight: 7,
                        color: doneCount == 4 ? cs.tertiary : cs.secondary,
                        backgroundColor: cs.onSurface.withValues(alpha: 0.08),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // 1 — Location
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionTitle('Your location', 'आपकी लोकेशन', number: 1, done: locDone),
                    if (!locDone) ...[
                      Bi('Record where you are. It is attached to the visit and to every photo and video.',
                          'आप कहाँ हैं, यह दर्ज करें। यह दौरे और हर फ़ोटो-वीडियो के साथ जुड़ता है।',
                          style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
                      const SizedBox(height: 16),
                      SizedBox(
                        height: 48,
                        child: FilledButton.tonalIcon(
                          onPressed: _locating ? null : _locate,
                          icon: _locating
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2))
                              : const Icon(Icons.my_location_rounded),
                          label: Text(_both(s.lang, 'Get my location', 'मेरी लोकेशन लें')),
                        ),
                      ),
                      if (kIsWeb) ...[
                        const SizedBox(height: 8),
                        Bi('Your browser will ask for permission. Choose "Allow".', 'ब्राउज़र अनुमति माँगेगा। "Allow" चुनें।',
                            style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                      ],
                    ] else ...[
                      InfoRow(icon: Icons.north_rounded, en: 'Latitude', hi: 'अक्षांश', value: fmtCoord(d.lat)),
                      InfoRow(icon: Icons.east_rounded, en: 'Longitude', hi: 'देशांतर', value: fmtCoord(d.lng)),
                      InfoRow(
                        icon: Icons.gps_fixed_rounded,
                        en: 'Accuracy',
                        hi: 'सटीकता',
                        value: d.accuracy == null ? '—' : '± ${d.accuracy!.round()} m',
                      ),
                      if (d.locatedAt != null)
                        InfoRow(icon: Icons.access_time_rounded, en: 'Recorded', hi: 'दर्ज समय', value: fmtTime(d.locatedAt!)),
                      if (distance != null) ...[
                        const SizedBox(height: 8),
                        _DistanceNote(metres: distance),
                      ],
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: _locating ? null : _locate,
                          icon: const Icon(Icons.refresh_rounded, size: 18),
                          label: Text(tx(context, 'Update', 'अपडेट करें')),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // 2 — Evidence
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionTitle('Photos & videos', 'फ़ोटो और वीडियो', number: 2, done: evDone),
                    Row(
                      children: [
                        Expanded(
                          child: SizedBox(
                            height: 50,
                            child: FilledButton.icon(
                              onPressed: _busy == null ? () => _capture(EvKind.photo) : null,
                              icon: const Icon(Icons.photo_camera_rounded),
                              label: Text(_both(s.lang, 'Photo', 'फ़ोटो')),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: SizedBox(
                            height: 50,
                            child: OutlinedButton.icon(
                              onPressed: _busy == null ? () => _capture(EvKind.video) : null,
                              icon: const Icon(Icons.videocam_rounded),
                              label: Text(_both(s.lang, 'Video', 'वीडियो')),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (d.evidence.isEmpty)
                      Bi('Take clear photos of the rooms, registers, kitchen and anything the official asked about. Videos up to 60 seconds.',
                          'कमरों, रजिस्टर, रसोई और अधिकारी ने जो कहा उसकी साफ़ फ़ोटो लें। वीडियो 60 सेकंड तक।',
                          style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant))
                    else
                      for (var i = 0; i < d.evidence.length; i++)
                        EvidenceTile(
                          evidence: d.evidence[i],
                          index: i + 1,
                          institute: inst,
                          onDelete: () => _delete(d, d.evidence[i]),
                        ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // 3 — Checklist
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionTitle('Checklist', 'जाँच सूची', number: 3, done: checkDone,
                        trailing: Text('${d.answers.length}/${kChecklist.length}',
                            style: TextStyle(color: cs.onSurfaceVariant, fontWeight: FontWeight.w600))),
                    for (var i = 0; i < kChecklist.length; i++) ...[
                      if (i > 0) const Divider(height: 20),
                      Bi(kChecklist[i].en, kChecklist[i].hi, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        children: [
                          for (final k in const ['yes', 'no', 'na'])
                            ChoiceChip(
                              label: Text(_both(s.lang, kAnswers[k]!.en, kAnswers[k]!.hi)),
                              selected: d.answers[kChecklist[i].key] == k,
                              selectedColor: (k == 'yes' ? kGreen : (k == 'no' ? kRed : Colors.blueGrey)).withValues(alpha: 0.22),
                              onSelected: (_) => setState(() => d.answers[kChecklist[i].key] = k),
                            ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // 4 — Remarks
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SectionTitle('Remarks', 'टिप्पणी', number: 4, done: remarksDone),
                    TextField(
                      controller: _remarks,
                      minLines: 4,
                      maxLines: 8,
                      maxLength: 1000,
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (v) => setState(() => d.remarks = v),
                      decoration: fieldDecoration(
                        context,
                        label: tx(context, 'What did you observe?', 'आपने क्या देखा?'),
                        hint: tx(context, 'Mention problems found and the action you asked the institute to take.',
                            'पाई गई समस्याएँ और संस्थान को दिए गए निर्देश लिखें।'),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (_busy != null)
            Positioned.fill(
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.45),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Panel(
                      padding: const EdgeInsets.all(22),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const CircularProgressIndicator(),
                          const SizedBox(height: 16),
                          Bi(_busy!.en, _busy!.hi, center: true, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: SizedBox(
            height: 52,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: doneCount == 4 ? kGreen : null, foregroundColor: doneCount == 4 ? Colors.white : null),
              onPressed: _busy == null ? _submit : null,
              icon: const Icon(Icons.cloud_upload_rounded),
              label: Text(_both(s.lang, 'Submit inspection', 'निरीक्षण जमा करें'),
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ),
        ),
      ),
    );
  }
}

class _DistanceNote extends StatelessWidget {
  const _DistanceNote({required this.metres});
  final double metres;

  @override
  Widget build(BuildContext context) {
    final near = metres <= kNearbyMetres;
    final color = near ? kGreen : kAmber;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? Color.lerp(color, Colors.white, 0.4)! : color;
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(near ? Icons.where_to_vote_rounded : Icons.wrong_location_outlined, color: fg, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Bi(
              near
                  ? '${fmtDistance(metres)} from the institute — you are on site.'
                  : '${fmtDistance(metres)} from the institute. Evidence taken far away will be flagged for the official.',
              near
                  ? 'संस्थान से ${fmtDistance(metres)} — आप स्थल पर हैं।'
                  : 'संस्थान से ${fmtDistance(metres)}। दूर से लिए गए साक्ष्य अधिकारी के लिए चिह्नित होंगे।',
              style: TextStyle(fontSize: 13, color: fg, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class EvidenceTile extends StatelessWidget {
  const EvidenceTile({super.key, required this.evidence, required this.index, this.institute, this.onDelete});
  final Evidence evidence;
  final int index;
  final Institute? institute;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final e = evidence;
    final isPhoto = e.kind == EvKind.photo;
    final kindLabel = isPhoto ? const Msg('Photo', 'फ़ोटो') : const Msg('Video', 'वीडियो');
    return Container(
      margin: const EdgeInsets.only(top: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: cs.onSurface.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.6)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => showEvidenceViewer(context, e),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 78,
                height: 78,
                child: isPhoto
                    ? Image.memory(e.bytes, fit: BoxFit.cover, cacheWidth: 240, gaplessPlayback: true)
                    : Container(
                        color: kForest,
                        child: const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 32),
                            SizedBox(height: 2),
                            Text('VIDEO', style: TextStyle(color: Colors.white, fontSize: 10, letterSpacing: 1.5)),
                          ],
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${kindLabel.of(s.lang)} $index · ${fmtTime(e.capturedAt)}',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 3),
                Text(
                  e.lat == null
                      ? tx(context, 'No GPS', 'GPS नहीं')
                      : '${fmtCoord(e.lat)}, ${fmtCoord(e.lng)}${e.accuracy == null ? '' : '  ±${e.accuracy!.round()} m'}',
                  style: TextStyle(fontSize: 12, color: e.lat == null ? cs.error : cs.onSurfaceVariant),
                ),
                const SizedBox(height: 3),
                Text('SHA-256  ${shortHash(e.sha256)}',
                    style: TextStyle(fontSize: 12, fontFamily: 'monospace', color: cs.onSurfaceVariant)),
                if (e.gpsFallback)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(tx(context, 'Used the visit location (fresh GPS failed)', 'दौरे की लोकेशन ली गई (नया GPS नहीं मिला)'),
                        style: const TextStyle(fontSize: 11, color: kAmber)),
                  ),
                if (e.status != EvStatus.pending) ...[
                  const SizedBox(height: 6),
                  EvidenceStatusLine(e.status, reason: e.reason),
                ],
              ],
            ),
          ),
          if (onDelete != null && e.status == EvStatus.pending)
            IconButton(
              tooltip: tx(context, 'Remove', 'हटाएँ'),
              onPressed: onDelete,
              icon: Icon(Icons.delete_outline_rounded, color: cs.error),
            ),
        ],
      ),
    );
  }
}

class EvidenceStatusLine extends StatelessWidget {
  const EvidenceStatusLine(this.status, {super.key, this.reason});
  final EvStatus status;
  final String? reason;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    late final Msg label;
    late final Color color;
    Widget icon;
    switch (status) {
      case EvStatus.uploading:
        label = const Msg('Uploading…', 'अपलोड हो रहा है…');
        color = kSand;
        icon = const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2));
      case EvStatus.ok:
        label = const Msg('Verified by server', 'सर्वर द्वारा सत्यापित');
        color = kGreen;
        icon = const Icon(Icons.verified_rounded, size: 16, color: kGreen);
      case EvStatus.rejected:
        label = const Msg('Rejected by server', 'सर्वर ने अस्वीकार किया');
        color = kRed;
        icon = const Icon(Icons.gpp_bad_rounded, size: 16, color: kRed);
      case EvStatus.failed:
        label = const Msg('Not uploaded', 'अपलोड नहीं हुआ');
        color = kAmber;
        icon = const Icon(Icons.cloud_off_rounded, size: 16, color: kAmber);
      case EvStatus.pending:
        label = const Msg('Waiting', 'प्रतीक्षा में');
        color = Colors.blueGrey;
        icon = const Icon(Icons.schedule_rounded, size: 16, color: Colors.blueGrey);
    }
    final text = label.of(s.lang) + (reason == null || reason!.isEmpty ? '' : ' — $reason');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(padding: const EdgeInsets.only(top: 1), child: icon),
        const SizedBox(width: 6),
        Expanded(child: Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color))),
      ],
    );
  }
}

/// Full-screen view with the capture stamp (time, GPS, device, SHA-256).
void showEvidenceViewer(BuildContext context, Evidence e) {
  final s = AppScope.read(context);
  showDialog<void>(
    context: context,
    barrierColor: Colors.black87,
    builder: (c) => Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: Stack(
        children: [
          Positioned.fill(
            child: e.kind == EvKind.photo
                ? InteractiveViewer(maxScale: 5, child: Center(child: Image.memory(e.bytes, fit: BoxFit.contain)))
                : const Center(child: Icon(Icons.movie_creation_outlined, color: Colors.white54, size: 96)),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(16, 28, 16, 24),
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black87],
                ),
              ),
              child: DefaultTextStyle(
                style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.5),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(fmtDateTime(e.capturedAt, s.lang), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    Text(e.lat == null ? 'GPS —' : 'GPS ${fmtCoord(e.lat)}, ${fmtCoord(e.lng)}  ±${e.accuracy?.round() ?? '?'} m'),
                    Text('${e.deviceId} · ${e.fileName}'),
                    SelectableText('SHA-256 ${e.sha256}',
                        style: const TextStyle(color: Colors.white, fontFamily: 'monospace', fontSize: 12)),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            top: 8,
            right: 8,
            child: SafeArea(
              child: IconButton(
                onPressed: () => Navigator.of(c).pop(),
                icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

// ============================================================================
// §11 UPLOAD STATUS, SUBMISSIONS, PROFILE
// ============================================================================

enum _Phase { uploading, saving, done }

class SubmissionStatusScreen extends StatefulWidget {
  const SubmissionStatusScreen({super.key, required this.assignmentId});
  final String assignmentId;

  @override
  State<SubmissionStatusScreen> createState() => _SubmissionStatusScreenState();
}

class _SubmissionStatusScreenState extends State<SubmissionStatusScreen> {
  _Phase _phase = _Phase.uploading;
  Assignment? _a;
  InspectionDraft? _d;
  Submission? _result;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  Future<void> _run() async {
    if (!mounted) return;
    final s = AppScope.read(context);
    final a = s.assignmentById(widget.assignmentId);
    final u = s.user;
    if (a == null || u == null) {
      setState(() => _phase = _Phase.done);
      return;
    }
    final d = s.draftFor(a);
    setState(() {
      _a = a;
      _d = d;
      _phase = _Phase.uploading;
    });
    final be = s.backendFor(a);
    for (final e in d.evidence) {
      if (e.status == EvStatus.ok || e.status == EvStatus.rejected) continue;
      setState(() {
        e.status = EvStatus.uploading;
        e.reason = null;
      });
      try {
        final r = await be.uploadEvidence(u, a.id, e, s.deviceId);
        e.status = r.ok ? EvStatus.ok : EvStatus.rejected;
        e.reason = r.reason;
        e.serverId = r.serverId;
      } on ApiException catch (x) {
        e.status = EvStatus.failed;
        e.reason = x.message;
        s.handleApiError(x); // 401 → lock screen; the file stays queued
      } catch (_) {
        e.status = EvStatus.failed;
        e.reason = 'Upload failed';
      }
      if (!mounted) return;
      setState(() {});
    }

    final failed = d.evidence.where((e) => e.status == EvStatus.failed).length;
    if (failed > 0) {
      setState(() => _phase = _Phase.done);
      return;
    }

    setState(() => _phase = _Phase.saving);
    final okCount = d.evidence.where((e) => e.status == EvStatus.ok).length;
    final payload = <String, dynamic>{
      'assignment_id': a.id,
      'institute_id': a.instituteId,
      'remarks': d.remarks.trim(),
      'checklist': d.answers,
      'evidence_ids': [for (final e in d.evidence) if (e.serverId != null) e.serverId],
      'client_hashes': [for (final e in d.evidence) e.sha256],
      'gps_lat': d.lat,
      'gps_lng': d.lng,
      'started_at': d.startedAt.toUtc().toIso8601String(),
      'submitted_at': DateTime.now().toUtc().toIso8601String(),
      'device_id': s.deviceId,
    };
    final stored = await be.submitInspection(u, payload);
    if (!mounted) return;
    final status = okCount == d.evidence.length ? 'verified' : (okCount == 0 ? 'rejected' : 'partial');
    final sub = Submission(
      id: 'sub-${DateTime.now().millisecondsSinceEpoch}',
      assignmentId: a.id,
      instituteId: a.instituteId,
      instituteName: a.institute.name,
      submittedAt: DateTime.now(),
      remarks: d.remarks.trim(),
      answers: Map<String, String>.from(d.answers),
      evidence: [for (final e in d.evidence) e.toRecord()],
      status: status,
      serverRecord: stored,
      lat: d.lat,
      lng: d.lng,
      demo: a.isDemo,
    );
    s.saveSubmission(a, sub);
    setState(() {
      _result = sub;
      _phase = _Phase.done;
    });
  }

  void _home() => Navigator.of(context).popUntil((r) => r.isFirst);

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final d = _d;
    final ev = d?.evidence ?? const <Evidence>[];
    final total = ev.length;
    final ok = ev.where((e) => e.status == EvStatus.ok).length;
    final rejected = ev.where((e) => e.status == EvStatus.rejected).length;
    final failed = ev.where((e) => e.status == EvStatus.failed).length;
    final doneFiles = ok + rejected + failed;

    late final IconData icon;
    late final Color color;
    late final Msg title;
    late final Msg sub;
    if (_phase == _Phase.uploading) {
      icon = Icons.cloud_upload_rounded;
      color = cs.primary;
      title = Msg('Uploading evidence $doneFiles of $total', 'साक्ष्य अपलोड: $doneFiles / $total');
      sub = const Msg('Keep the app open. Each file is checked by the server against its SHA-256.',
          'ऐप खुला रखें। हर फ़ाइल को सर्वर उसके SHA-256 से मिलाकर जाँचता है।');
    } else if (_phase == _Phase.saving) {
      icon = Icons.save_rounded;
      color = cs.primary;
      title = const Msg('Saving your inspection…', 'आपका निरीक्षण सहेजा जा रहा है…');
      sub = const Msg('Checklist and remarks are being filed.', 'जाँच सूची और टिप्पणी दर्ज की जा रही है।');
    } else if (failed > 0) {
      icon = Icons.cloud_off_rounded;
      color = kAmber;
      title = Msg('$failed file(s) could not be uploaded', '$failed फ़ाइल अपलोड नहीं हो सकीं');
      sub = const Msg('Check your internet and retry. Nothing is lost — your inspection stays on this phone until it goes through.',
          'इंटरनेट जाँचकर दोबारा प्रयास करें। कुछ भी खोया नहीं है — अपलोड होने तक निरीक्षण इसी फ़ोन पर रहेगा।');
    } else if (_result == null) {
      icon = Icons.error_outline_rounded;
      color = cs.error;
      title = const Msg('Nothing to submit', 'जमा करने के लिए कुछ नहीं');
      sub = const Msg('This assignment is no longer available.', 'यह कार्य अब उपलब्ध नहीं है।');
    } else if (rejected == 0) {
      icon = Icons.verified_rounded;
      color = kGreen;
      title = const Msg('Inspection submitted', 'निरीक्षण जमा हो गया');
      sub = Msg('All $total file(s) verified by the server. The official can now see this inspection in Sentinel.',
          'सभी $total फ़ाइलें सर्वर द्वारा सत्यापित। अधिकारी अब इसे सेंटिनल में देख सकते हैं।');
    } else {
      icon = Icons.gpp_maybe_rounded;
      color = kRed;
      title = Msg('$rejected file(s) rejected', '$rejected फ़ाइल अस्वीकार');
      sub = const Msg('The inspection is filed, but rejected files are flagged for the official. See the reasons below.',
          'निरीक्षण दर्ज है, पर अस्वीकार फ़ाइलें अधिकारी के लिए चिह्नित हैं। कारण नीचे देखें।');
    }

    final busy = _phase != _Phase.done;
    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: govAppBar(context, back: !busy, title: Bi('Submission', 'जमा स्थिति'), actions: const [DemoBadge()]),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
          children: [
            Center(
              child: SizedBox(
                width: 96,
                height: 96,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    if (busy)
                      SizedBox(
                        width: 96,
                        height: 96,
                        child: CircularProgressIndicator(
                          strokeWidth: 5,
                          value: _phase == _Phase.uploading && total > 0 ? doneFiles / total : null,
                        ),
                      ),
                    Container(
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), shape: BoxShape.circle),
                      child: Icon(icon, size: 40, color: color),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Bi(title.en, title.hi, center: true, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Bi(sub.en, sub.hi, center: true, style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
            const SizedBox(height: 20),
            if (_a != null)
              Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(_a!.institute.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(
                      s.lang == LangMode.hi
                          ? '$ok सत्यापित · $rejected अस्वीकार · $failed बाकी'
                          : '$ok verified · $rejected rejected · $failed not uploaded',
                      style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
                    ),
                    for (var i = 0; i < ev.length; i++) EvidenceTile(evidence: ev[i], index: i + 1),
                  ],
                ),
              ),
            if (_result != null) ...[
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () => shareReportPdf(context, _result!, photos: ev),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: Text(both(s.lang, 'Geo-tagged report (PDF)', 'जियो-टैग रिपोर्ट (पीडीएफ़)')),
              ),
            ],
            if (_result != null && !_result!.serverRecord) ...[
              const SizedBox(height: 16),
              Panel(
                accent: kSand,
                padding: const EdgeInsets.all(12),
                child: Bi(
                    'Files are on the server. The inspection record (checklist and remarks) is saved on this phone because the server does not accept it yet.',
                    'फ़ाइलें सर्वर पर हैं। निरीक्षण रिकॉर्ड (जाँच सूची और टिप्पणी) इस फ़ोन पर सहेजा गया है, क्योंकि सर्वर अभी इसे स्वीकार नहीं करता।',
                    style: const TextStyle(fontSize: 13)),
              ),
            ],
          ],
        ),
        bottomNavigationBar: busy
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: Row(
                    children: [
                      if (failed > 0) ...[
                        Expanded(
                          child: SizedBox(
                            height: 52,
                            child: FilledButton.icon(
                              onPressed: _run,
                              icon: const Icon(Icons.refresh_rounded),
                              label: Text(tx(context, 'Retry upload', 'दोबारा अपलोड करें')),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                      ],
                      Expanded(
                        child: SizedBox(
                          height: 52,
                          child: failed > 0
                              ? OutlinedButton(onPressed: _home, child: Text(tx(context, 'Later', 'बाद में')))
                              : FilledButton.icon(
                                  onPressed: _home,
                                  icon: const Icon(Icons.home_rounded),
                                  label: Text(s.lang == LangMode.bi
                                      ? 'Back to visits · दौरों पर लौटें'
                                      : tx(context, 'Back to visits', 'दौरों पर लौटें')),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class SubmissionsTab extends StatelessWidget {
  const SubmissionsTab({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final list = s.submissions;
    if (list.isEmpty) {
      return ListView(
        children: const [
          EmptyState(
            icon: Icons.fact_check_outlined,
            title: Msg('No submissions yet', 'अभी कोई निरीक्षण जमा नहीं'),
            body: Msg('Inspections you submit appear here with the server\'s verification.',
                'आपके जमा किए गए निरीक्षण सर्वर के सत्यापन के साथ यहाँ दिखेंगे।'),
          ),
        ],
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
      itemCount: list.length,
      itemBuilder: (context, i) {
        final sub = list[i];
        final color = _subColor(sub.status);
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Panel(
            accent: color,
            padding: const EdgeInsets.fromLTRB(14, 14, 10, 14),
            onTap: () => Navigator.of(context)
                .push(MaterialPageRoute<void>(builder: (_) => SubmissionDetailScreen(submission: sub))),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(sub.instituteName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 4),
                      Text(fmtDateTime(sub.submittedAt, s.lang), style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          Pill(label: _subLabel(sub.status), color: color, icon: _subIcon(sub.status)),
                          Pill(
                            label: Msg('${sub.okCount}/${sub.evidence.length} files', '${sub.okCount}/${sub.evidence.length} फ़ाइलें'),
                            color: Colors.blueGrey,
                            icon: Icons.attach_file_rounded,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: cs.onSurfaceVariant),
              ],
            ),
          ),
        );
      },
    );
  }
}

Color _subColor(String status) => status == 'verified' ? kGreen : (status == 'partial' ? kAmber : kRed);

IconData _subIcon(String status) =>
    status == 'verified' ? Icons.verified_rounded : (status == 'partial' ? Icons.gpp_maybe_rounded : Icons.gpp_bad_rounded);

Msg _subLabel(String status) => status == 'verified'
    ? const Msg('Verified', 'सत्यापित')
    : (status == 'partial' ? const Msg('Partly verified', 'आंशिक सत्यापित') : const Msg('Rejected', 'अस्वीकार'));

class SubmissionDetailScreen extends StatelessWidget {
  const SubmissionDetailScreen({super.key, required this.submission});
  final Submission submission;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final sub = submission;
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Submitted inspection', 'जमा निरीक्षण'), actions: [
        IconButton(
          tooltip: tx(context, 'Report PDF', 'रिपोर्ट पीडीएफ़'),
          onPressed: () => shareReportPdf(context, sub),
          icon: const Icon(Icons.picture_as_pdf_outlined),
        ),
      ]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        children: [
          Panel(
            accent: _subColor(sub.status),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sub.instituteName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Wrap(spacing: 6, runSpacing: 6, children: [
                  Pill(label: _subLabel(sub.status), color: _subColor(sub.status), icon: _subIcon(sub.status)),
                  if (sub.demo) const Pill(label: Msg('Mock', 'मॉक'), color: kSand),
                ]),
                const SizedBox(height: 8),
                InfoRow(icon: Icons.event_available_rounded, en: 'Submitted', hi: 'जमा किया', value: fmtDateTime(sub.submittedAt, s.lang)),
                InfoRow(
                  icon: Icons.place_outlined,
                  en: 'Location',
                  hi: 'लोकेशन',
                  value: sub.lat == null ? '—' : '${fmtCoord(sub.lat)}, ${fmtCoord(sub.lng)}',
                ),
                InfoRow(
                  icon: sub.serverRecord ? Icons.cloud_done_outlined : Icons.phone_android_rounded,
                  en: 'Record',
                  hi: 'रिकॉर्ड',
                  value: sub.serverRecord
                      ? tx(context, 'Saved on the server', 'सर्वर पर सहेजा गया')
                      : tx(context, 'Files on server; record on this phone', 'फ़ाइलें सर्वर पर; रिकॉर्ड इस फ़ोन पर'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Checklist', 'जाँच सूची', icon: Icons.checklist_rounded),
                for (final item in kChecklist)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          sub.answers[item.key] == 'yes'
                              ? Icons.check_circle_rounded
                              : (sub.answers[item.key] == 'no' ? Icons.cancel_rounded : Icons.remove_circle_outline_rounded),
                          size: 20,
                          color: sub.answers[item.key] == 'yes'
                              ? kGreen
                              : (sub.answers[item.key] == 'no' ? kRed : Colors.blueGrey),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Bi(item.en, item.hi, style: const TextStyle(fontSize: 14))),
                        const SizedBox(width: 8),
                        Text((kAnswers[sub.answers[item.key]] ?? const Msg('—', '—')).of(s.lang),
                            style: const TextStyle(fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Remarks', 'टिप्पणी', icon: Icons.notes_rounded),
                SelectableText(sub.remarks.isEmpty ? '—' : sub.remarks, style: const TextStyle(fontSize: 15, height: 1.45)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionTitle('Evidence', 'साक्ष्य', icon: Icons.photo_library_outlined,
                    trailing: Text('${sub.evidence.length}', style: TextStyle(color: cs.onSurfaceVariant))),
                for (var i = 0; i < sub.evidence.length; i++) _RecordTile(record: sub.evidence[i], index: i + 1),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record, required this.index});
  final EvidenceRecord record;
  final int index;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final r = record;
    final kind = r.kind == EvKind.photo ? const Msg('Photo', 'फ़ोटो') : const Msg('Video', 'वीडियो');
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.onSurface.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(r.kind == EvKind.photo ? Icons.photo_outlined : Icons.videocam_outlined, size: 18, color: cs.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text('${kind.of(s.lang)} $index · ${fmtDateTime(r.capturedAt, s.lang)}',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(r.lat == null ? 'GPS —' : 'GPS ${fmtCoord(r.lat)}, ${fmtCoord(r.lng)}${r.accuracy == null ? '' : '  ±${r.accuracy!.round()} m'}',
              style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          Text('${r.fileName} · ${(r.sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB',
              style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SelectableText('SHA-256 ${r.sha256}',
                    style: TextStyle(fontSize: 11.5, fontFamily: 'monospace', color: cs.onSurface)),
              ),
              IconButton(
                visualDensity: VisualDensity.compact,
                tooltip: tx(context, 'Copy hash', 'हैश कॉपी करें'),
                icon: const Icon(Icons.copy_rounded, size: 18),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: r.sha256));
                  if (context.mounted) snack(context, 'Hash copied', 'हैश कॉपी हो गया');
                },
              ),
            ],
          ),
          EvidenceStatusLine(r.status, reason: r.reason),
        ],
      ),
    );
  }
}

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  String _both(LangMode m, String en, String hi) => m == LangMode.bi ? '$en · $hi' : (m == LangMode.hi ? hi : en);

  Future<void> _editVc(BuildContext context) async {
    final s = AppScope.read(context);
    final ctrl = TextEditingController(text: s.vcBase());
    final v = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Bi('Video call server', 'वीडियो कॉल सर्वर', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.url,
          decoration: fieldDecoration(c,
              label: tx(c, 'Meeting address', 'मीटिंग पता'),
              hint: 'https://meet.jit.si/',
              helper: tx(c, 'A Jitsi-compatible address. Your department can host its own for privacy.',
                  'जित्सी-संगत पता। निजता के लिए विभाग अपना सर्वर रख सकता है।')),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(c).pop(''), child: Text(tx(c, 'Default', 'डिफ़ॉल्ट'))),
          FilledButton(onPressed: () => Navigator.of(c).pop(ctrl.text.trim()), child: Text(tx(c, 'Save', 'सहेजें'))),
        ],
      ),
    );
    ctrl.dispose();
    if (v == null) return;
    if (v.isNotEmpty && !v.startsWith('https://')) {
      if (context.mounted) snack(context, 'The address must start with https://', 'पता https:// से शुरू होना चाहिए', error: true);
      return;
    }
    s.setVcBase(v);
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user;
    final cs = Theme.of(context).colorScheme;
    if (u == null) return const SizedBox.shrink();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      children: [
        Panel(
          child: Row(
            children: [
              CircleAvatar(
                radius: 30,
                backgroundColor: cs.primary,
                child: Text(u.initials, style: TextStyle(color: cs.onPrimary, fontSize: 20, fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(u.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 2),
                    Text(u.designation.isEmpty ? Roles.label(u.role).of(s.lang) : u.designation,
                        style: TextStyle(color: cs.onSurfaceVariant)),
                    Text(Roles.label(u.role).of(s.lang), style: TextStyle(fontSize: 12, color: cs.primary, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(u.email, style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Panel(
          child: Column(
            children: [
              const SectionTitle('Official details', 'आधिकारिक विवरण', icon: Icons.badge_outlined),
              InfoRow(icon: Icons.numbers_rounded, en: 'Employee ID', hi: 'कर्मचारी आईडी', value: u.employeeId.isEmpty ? '—' : u.employeeId),
              InfoRow(
                icon: Icons.location_city_rounded,
                en: 'District',
                hi: 'ज़िला',
                value: [u.district, u.state].where((x) => x.isNotEmpty).join(', ').isEmpty
                    ? '—'
                    : [u.district, u.state].where((x) => x.isNotEmpty).join(', '),
              ),
              InfoRow(icon: Icons.phone_android_rounded, en: 'Device ID', hi: 'डिवाइस आईडी', value: s.deviceId, selectable: true),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle('Language', 'भाषा', icon: Icons.translate_rounded),
              SegmentedButton<LangMode>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: LangMode.bi, label: Text('EN + हिं')),
                  ButtonSegment(value: LangMode.en, label: Text('English')),
                  ButtonSegment(value: LangMode.hi, label: Text('हिन्दी')),
                ],
                selected: {s.lang},
                onSelectionChanged: (v) => s.setLang(v.first),
              ),
              const SizedBox(height: 18),
              const SectionTitle('Appearance', 'दिखावट', icon: Icons.palette_outlined),
              SegmentedButton<ThemeMode>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: ThemeMode.system, icon: const Icon(Icons.brightness_auto_rounded), label: Text(tx(context, 'Auto', 'स्वतः'))),
                  ButtonSegment(value: ThemeMode.light, icon: const Icon(Icons.light_mode_rounded), label: Text(tx(context, 'Light', 'हल्का'))),
                  ButtonSegment(value: ThemeMode.dark, icon: const Icon(Icons.dark_mode_rounded), label: Text(tx(context, 'Dark', 'गहरा'))),
                ],
                selected: {s.themeMode},
                onSelectionChanged: (v) => s.setTheme(v.first),
              ),
              const SizedBox(height: 6),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: s.highContrast,
                onChanged: s.setContrast,
                secondary: const Icon(Icons.contrast_rounded),
                title: Bi('High contrast', 'उच्च कंट्रास्ट', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Bi('Stronger colours and borders for bright sunlight', 'तेज़ धूप के लिए गहरे रंग और किनारे',
                    style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Panel(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.dns_outlined),
                title: Bi('Server', 'सर्वर', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(s.serverUrl.isEmpty ? tx(context, 'Mock mode · no server set', 'मॉक मोड · सर्वर सेट नहीं') : s.serverUrl,
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: const Icon(Icons.edit_outlined),
                onTap: () => showServerDialog(context),
              ),
              ListTile(
                leading: const Icon(Icons.shield_outlined),
                title: Bi('Security', 'सुरक्षा', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(lastSignInLine(s, u), maxLines: 2, overflow: TextOverflow.ellipsis),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SecurityScreen())),
              ),
              ListTile(
                leading: const Icon(Icons.video_settings_rounded),
                title: Bi('Video call server', 'वीडियो कॉल सर्वर', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(s.vcBase(), maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: const Icon(Icons.edit_outlined),
                onTap: () => _editVc(context),
              ),
              ListTile(
                leading: const Icon(Icons.tour_outlined),
                title: Bi('Take the tour', 'परिचय देखें', style: const TextStyle(fontWeight: FontWeight.w600)),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => showTour(context),
              ),
              ListTile(
                leading: const Icon(Icons.support_agent_rounded),
                title: Bi('Ask Yukt', 'युक्त से पूछें', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(tx(context, 'Your inspection assistant', 'आपका निरीक्षण सहायक')),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => openYukt(context),
              ),
              ListTile(
                leading: const Icon(Icons.info_outline_rounded),
                title: Bi('About Nayan', 'नयन के बारे में', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('v$kAppVersion · ${platformLabel()}'),
                onTap: () => showAboutDialog(
                  context: context,
                  applicationName: 'Nayan · नयन',
                  applicationVersion: kAppVersion,
                  applicationIcon: const NayanLogo(width: 56),
                  children: [
                    Bi('Field inspection app of DOSJE NIGRANI. Evidence is sealed with GPS, time and SHA-256 on the phone and verified by the server.',
                        'दोसजे निगरानी का क्षेत्र निरीक्षण ऐप। साक्ष्य पर फ़ोन में ही GPS, समय और SHA-256 मुहर लगती है और सर्वर उसे सत्यापित करता है।'),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        SizedBox(
          height: 50,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: cs.error, side: BorderSide(color: cs.error.withValues(alpha: 0.6))),
            onPressed: () => signOutFlow(context),
            icon: const Icon(Icons.logout_rounded),
            label: Text(_both(s.lang, 'Sign out', 'साइन आउट'), style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }
}


// ============================================================================
// §13 SHARED MONITORING WIDGETS — live ticker, pulse, charts, alert tiles
// ============================================================================

Msg timeAgo(DateTime t) {
  final d = DateTime.now().difference(t);
  if (d.inSeconds < 60) return const Msg('just now', 'अभी');
  if (d.inMinutes < 60) return Msg('${d.inMinutes} min ago', '${d.inMinutes} मिनट पहले');
  if (d.inHours < 24) return Msg('${d.inHours} h ago', '${d.inHours} घंटे पहले');
  return Msg('${d.inDays} d ago', '${d.inDays} दिन पहले');
}

String both(LangMode m, String en, String hi) => m == LangMode.bi ? '$en · $hi' : (m == LangMode.hi ? hi : en);

Color severityColor(String s) => s == 'red' ? kRed : kAmber;

/// A softly pulsing dot that says "this is live".
class PulseDot extends StatefulWidget {
  const PulseDot({super.key, this.color = kGreen, this.size = 10});
  final Color color;
  final double size;

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sz = widget.size;
    return SizedBox(
      width: sz * 2.4,
      height: sz * 2.4,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: sz * (1 + 1.4 * t),
                height: sz * (1 + 1.4 * t),
                decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color.withValues(alpha: 0.35 * (1 - t))),
              ),
              Container(width: sz, height: sz, decoration: BoxDecoration(shape: BoxShape.circle, color: widget.color)),
            ],
          );
        },
      ),
    );
  }
}

/// "सूचना पट्ट"-style billboard: live events rotate one at a time.
class LiveTicker extends StatefulWidget {
  const LiveTicker({super.key});

  @override
  State<LiveTicker> createState() => _LiveTickerState();
}

class _LiveTickerState extends State<LiveTicker> {
  int _i = 0;
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(milliseconds: 3600), (_) {
      if (mounted) setState(() => _i++);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final events = s.liveEvents.take(10).toList();
    final e = events.isEmpty ? null : events[_i % events.length];
    return Panel(
      tint: kSage,
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: kRed, borderRadius: BorderRadius.circular(6)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
              const SizedBox(width: 5),
              Text(s.lang == LangMode.hi ? 'लाइव' : 'LIVE',
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1)),
            ]),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 40,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 450),
                transitionBuilder: (child, a) => ClipRect(
                  child: SlideTransition(
                    position: Tween<Offset>(begin: const Offset(0, 0.6), end: Offset.zero).animate(a),
                    child: FadeTransition(opacity: a, child: child),
                  ),
                ),
                child: e == null
                    ? Align(
                        key: const ValueKey('empty'),
                        alignment: Alignment.centerLeft,
                        child: Text(tx(context, 'Waiting for live updates…', 'लाइव अपडेट की प्रतीक्षा…'),
                            style: TextStyle(color: cs.onSurfaceVariant)),
                      )
                    : Row(
                        key: ValueKey('${e.at.microsecondsSinceEpoch}-${_i % events.length}'),
                        children: [
                          Icon(e.icon, size: 18, color: cs.primary),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(e.text.of(s.lang),
                                    maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                                Text(timeAgo(e.at).of(s.lang), style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
                              ],
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Two tiles per row on phones, three on wide screens.
class TileGrid extends StatelessWidget {
  const TileGrid({super.key, required this.children, this.spacing = 12});
  final List<Widget> children;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth > 640 ? 3 : 2;
      final w = (c.maxWidth - spacing * (cols - 1)) / cols;
      return Wrap(
        spacing: spacing,
        runSpacing: spacing,
        children: [for (final ch in children) SizedBox(width: w, child: ch)],
      );
    });
  }
}

/// Compliance split as a ring: red, amber, green (fixed order), with gaps.
class DonutChart extends StatelessWidget {
  const DonutChart({super.key, required this.values, required this.colors, this.size = 120, this.center});
  final List<int> values;
  final List<Color> colors;
  final double size;
  final Widget? center;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _DonutPainter(values, colors, Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08)),
        child: Center(child: center),
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter(this.values, this.colors, this.track);
  final List<int> values;
  final List<Color> colors;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.14;
    final rect = Offset(stroke / 2, stroke / 2) & Size(size.width - stroke, size.height - stroke);
    final base = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = track;
    canvas.drawArc(rect, 0, 2 * math.pi, false, base);
    final total = values.fold<int>(0, (a, b) => a + b);
    if (total == 0) return;
    const gap = 0.05;
    var start = -math.pi / 2;
    for (var i = 0; i < values.length; i++) {
      if (values[i] == 0) continue;
      final sweep = values[i] / total * 2 * math.pi;
      final p = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.butt
        ..color = colors[i];
      canvas.drawArc(rect, start + gap / 2, math.max(0.01, sweep - gap), false, p);
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) => old.values.join(',') != values.join(',') || old.track != track;
}

class LegendDot extends StatelessWidget {
  const LegendDot({super.key, required this.color, required this.label, this.value, this.dashed = false, this.ring = false});
  final Color color;
  final String label;
  final String? value;
  final bool dashed;
  final bool ring;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dashed)
            SizedBox(
              width: 16,
              height: 10,
              child: CustomPaint(painter: _DashPainter(color)),
            )
          else
            Container(
              width: ring ? 10 : 10,
              height: 10,
              decoration: BoxDecoration(
                color: ring ? null : color,
                shape: BoxShape.circle,
                border: ring ? Border.all(color: color, width: 2) : null,
              ),
            ),
          const SizedBox(width: 6),
          Flexible(child: Text(label, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant))),
          if (value != null) ...[
            const SizedBox(width: 6),
            Text(value!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }
}

class _DashPainter extends CustomPainter {
  _DashPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 2;
    var x = 0.0;
    while (x < size.width) {
      canvas.drawLine(Offset(x, size.height / 2), Offset(math.min(size.width, x + 4), size.height / 2), p);
      x += 7;
    }
  }

  @override
  bool shouldRepaint(covariant _DashPainter old) => old.color != color;
}

/// Horizontal bar used for risk scores (0..1).
class ScoreBar extends StatelessWidget {
  const ScoreBar({super.key, required this.value, this.color, this.height = 8});
  final double value;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final v = value < 0 ? 0.0 : (value > 1 ? 1.0 : value);
    final c = color ?? (v > 0.6 ? kRed : (v > 0.35 ? kAmber : kGreen));
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: SizedBox(
        height: height,
        child: Stack(
          children: [
            Positioned.fill(child: ColoredBox(color: cs.onSurface.withValues(alpha: 0.08))),
            FractionallySizedBox(
              widthFactor: v,
              child: Container(decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(99))),
            ),
          ],
        ),
      ),
    );
  }
}

/// Risk made visible: four factors stacked in a fixed order and colour.
class RiskStack extends StatelessWidget {
  const RiskStack({super.key, required this.row});
  final RiskRow row;

  static const factorColors = [kForest, kRed, kSand, kBlue];

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final parts = [0.35 * row.compliance, 0.25 * row.alerts, 0.20 * row.recency, 0.20 * row.anomaly];
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: SizedBox(
        height: 9,
        child: Row(
          children: [
            for (var i = 0; i < parts.length; i++)
              if (parts[i] > 0)
                Expanded(
                  flex: math.max(1, (parts[i] * 1000).round()),
                  child: Container(
                    margin: EdgeInsets.only(right: i == parts.length - 1 ? 0 : 2),
                    color: factorColors[i],
                  ),
                ),
            Expanded(
              flex: math.max(1, ((1 - row.score) * 1000).round()),
              child: ColoredBox(color: cs.onSurface.withValues(alpha: 0.07)),
            ),
          ],
        ),
      ),
    );
  }
}

class AlertTile extends StatelessWidget {
  const AlertTile({super.key, required this.alert, this.dense = false});
  final AlertItem alert;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final a = alert;
    final inst = s.instituteById(a.instituteId);
    final color = severityColor(a.severity);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = dark ? Color.lerp(color, Colors.white, 0.4)! : color;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => showAlertSheet(context, a),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
              child: Icon(a.icon, size: 19, color: fg),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.typeLabel.of(s.lang), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  Text(inst?.name ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                  if (!dense) ...[
                    const SizedBox(height: 3),
                    Text(a.detail, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5)),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(timeAgo(a.createdAt).of(s.lang), style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
                const SizedBox(height: 4),
                if (a.status != 'open')
                  Text(
                    a.status == 'escalated' ? tx(context, 'Escalated', 'आगे बढ़ाया') : tx(context, 'Reviewed', 'देखा गया'),
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: a.status == 'escalated' ? kRed : kGreen),
                  )
                else
                  Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> showAlertSheet(BuildContext context, AlertItem a) async {
  final s = AppScope.read(context);
  final inst = s.instituteById(a.instituteId);
  final official = s.user?.isOfficial ?? false;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (c) {
      final cs = Theme.of(c).colorScheme;
      Future<void> act(String action) async {
        final ok = await confirmDialog(
          c,
          title: action == 'escalated' ? const Msg('Escalate this alert?', 'यह अलर्ट आगे बढ़ाएँ?') : const Msg('Mark as reviewed?', 'देखा गया चिह्नित करें?'),
          body: action == 'escalated'
              ? const Msg('It goes to the next level (state / division) with your name on it.', 'यह आपके नाम के साथ अगले स्तर (राज्य / प्रभाग) को जाएगा।')
              : const Msg('The alert stays in the ledger with your name as reviewer.', 'अलर्ट आपके नाम के साथ रिकॉर्ड में रहेगा।'),
          confirm: action == 'escalated' ? const Msg('Escalate', 'आगे बढ़ाएँ') : const Msg('Mark reviewed', 'देखा गया'),
          danger: action == 'escalated',
        );
        if (!ok || !c.mounted) return;
        final err = await s.actOnAlert(a, action);
        if (!c.mounted) return;
        Navigator.of(c).pop();
        if (err != null && context.mounted) snack(context, err.en, err.hi, error: true);
      }

      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              Icon(a.icon, color: severityColor(a.severity)),
              const SizedBox(width: 10),
              Expanded(child: Bi(a.typeLabel.en, a.typeLabel.hi, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
              Pill(
                label: a.severity == 'red' ? const Msg('High', 'उच्च') : const Msg('Medium', 'मध्यम'),
                color: severityColor(a.severity),
              ),
            ]),
            const SizedBox(height: 10),
            Text(inst?.name ?? '—', style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('${inst?.district ?? ''} · ${fmtDateTime(a.createdAt, s.lang)}', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 13)),
            const SizedBox(height: 16),
            Text(a.detail, style: const TextStyle(fontSize: 15, height: 1.45)),
            const SizedBox(height: 18),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(c).pop();
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CctvScreen(instituteId: a.instituteId)));
                  },
                  icon: const Icon(Icons.videocam_rounded, size: 18),
                  label: Text(tx(c, 'Watch CCTV', 'सीसीटीवी देखें')),
                ),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(c).pop();
                    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => VcScreen(instituteId: a.instituteId)));
                  },
                  icon: const Icon(Icons.video_call_rounded, size: 18),
                  label: Text(tx(c, 'Verify by VC', 'वीसी से जाँचें')),
                ),
                if (official)
                  OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(c).pop();
                      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AssignScreen(instituteId: a.instituteId)));
                    },
                    icon: const Icon(Icons.casino_rounded, size: 18),
                    label: Text(tx(c, 'Surprise inspection', 'अचानक निरीक्षण')),
                  ),
              ],
            ),
            if (official && a.status == 'open') ...[
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => act('reviewed'),
                    child: Text(tx(c, 'Mark reviewed', 'देखा गया')),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: kRed, foregroundColor: Colors.white),
                    onPressed: () => act('escalated'),
                    child: Text(tx(c, 'Escalate', 'आगे बढ़ाएँ')),
                  ),
                ),
              ]),
            ],
          ],
        ),
      );
    },
  );
}

class AlertsScreen extends StatefulWidget {
  const AlertsScreen({super.key});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  bool _openOnly = true;
  String? _severity; // null = all, else 'red' | 'yellow'
  String? _instituteId;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final all = s.scopedAlerts;
    var list = _openOnly ? all.where((a) => a.status == 'open').toList() : all;
    if (_severity != null) list = list.where((a) => a.severity == _severity).toList();
    if (_instituteId != null) list = list.where((a) => a.instituteId == _instituteId).toList();
    final institutes = {for (final a in all) a.instituteId: s.instituteById(a.instituteId)?.name ?? ''}
      ..removeWhere((k, v) => v.isEmpty);
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Alerts', 'अलर्ट'), actions: const [DemoBadge()]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        children: [
          Wrap(spacing: 8, runSpacing: 8, children: [
            ChoiceChip(
              selected: _openOnly,
              onSelected: (_) => setState(() => _openOnly = true),
              label: Text('${both(s.lang, 'Open', 'खुले')} (${all.where((a) => a.status == 'open').length})'),
            ),
            ChoiceChip(
              selected: !_openOnly,
              onSelected: (_) => setState(() => _openOnly = false),
              label: Text('${both(s.lang, 'All', 'सभी')} (${all.length})'),
            ),
            const SizedBox(width: 4, height: 24, child: VerticalDivider()),
            ChoiceChip(
              selected: _severity == null,
              onSelected: (_) => setState(() => _severity = null),
              label: Text(both(s.lang, 'Any severity', 'कोई भी गंभीरता')),
            ),
            ChoiceChip(
              selected: _severity == 'red',
              onSelected: (_) => setState(() => _severity = 'red'),
              avatar: const Icon(Icons.circle, size: 10, color: kRed),
              label: Text(both(s.lang, 'Critical', 'गंभीर')),
            ),
            ChoiceChip(
              selected: _severity == 'yellow',
              onSelected: (_) => setState(() => _severity = 'yellow'),
              avatar: const Icon(Icons.circle, size: 10, color: kAmber),
              label: Text(both(s.lang, 'Warning', 'चेतावनी')),
            ),
            if (institutes.length > 1)
              PopupMenuButton<String?>(
                tooltip: tx(context, 'Filter by institute', 'संस्थान के अनुसार फ़िल्टर'),
                onSelected: (v) => setState(() => _instituteId = v),
                itemBuilder: (_) => [
                  PopupMenuItem(value: null, child: Text(tx(context, 'All institutes', 'सभी संस्थान'))),
                  for (final e in institutes.entries) PopupMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis)),
                ],
                child: Chip(
                  avatar: Icon(Icons.apartment_rounded, size: 16, color: _instituteId == null ? null : Theme.of(context).colorScheme.primary),
                  label: Text(_instituteId == null ? tx(context, 'Institute', 'संस्थान') : (institutes[_instituteId] ?? ''),
                      overflow: TextOverflow.ellipsis),
                ),
              ),
          ]),
          const SizedBox(height: 16),
          if (list.isEmpty)
            EmptyState(
              icon: Icons.verified_user_outlined,
              title: const Msg('Nothing matches these filters', 'इन फ़िल्टरों से कुछ नहीं मिला'),
              action: (_severity != null || _instituteId != null || !_openOnly)
                  ? TextButton(
                      onPressed: () => setState(() {
                        _openOnly = true;
                        _severity = null;
                        _instituteId = null;
                      }),
                      child: Text(tx(context, 'Clear filters', 'फ़िल्टर हटाएँ')),
                    )
                  : null,
            )
          else
            Panel(
              padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
              child: Column(children: [
                for (var i = 0; i < list.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  AlertTile(alert: list[i]),
                ],
              ]),
            ),
        ],
      ),
    );
  }
}

/// Attendance over time: present (line), enrolled (dashed), expected band
/// (rolling mean ± 2 SD) and AI flags (ringed dots). One y-axis.
class AttendanceChart extends StatelessWidget {
  const AttendanceChart({super.key, required this.days, required this.flags, this.height = 200});
  final List<AttendanceDay> days;
  final Set<String> flags; // yyyy-mm-dd
  final double height;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final dark = t.brightness == Brightness.dark;
    return SizedBox(
      height: height,
      child: CustomPaint(
        painter: _AttendancePainter(
          days: days,
          flags: flags,
          line: dark ? const Color(0xFFA9C5A6) : kForest,
          band: kSage.withValues(alpha: dark ? 0.22 : 0.18),
          enrolled: kSand,
          flag: kRed,
          grid: t.colorScheme.onSurface.withValues(alpha: 0.08),
          label: t.colorScheme.onSurfaceVariant,
          surface: t.colorScheme.surface,
        ),
        size: Size.infinite,
      ),
    );
  }
}

String dayKey(DateTime d) => '${d.year}-${two(d.month)}-${two(d.day)}';

class _AttendancePainter extends CustomPainter {
  _AttendancePainter({
    required this.days,
    required this.flags,
    required this.line,
    required this.band,
    required this.enrolled,
    required this.flag,
    required this.grid,
    required this.label,
    required this.surface,
  });

  final List<AttendanceDay> days;
  final Set<String> flags;
  final Color line;
  final Color band;
  final Color enrolled;
  final Color flag;
  final Color grid;
  final Color label;
  final Color surface;

  void _text(Canvas c, String s, Offset o, {TextAlign align = TextAlign.left, double size = 10}) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(color: label, fontSize: size)),
      textDirection: TextDirection.ltr,
      textAlign: align,
    )..layout();
    var dx = o.dx;
    if (align == TextAlign.right) dx -= tp.width;
    if (align == TextAlign.center) dx -= tp.width / 2;
    tp.paint(c, Offset(dx, o.dy - tp.height / 2));
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (days.isEmpty) return;
    const left = 34.0;
    const right = 8.0;
    const top = 8.0;
    const bottom = 22.0;
    final w = size.width - left - right;
    final h = size.height - top - bottom;
    var maxV = 1;
    for (final d in days) {
      maxV = math.max(maxV, math.max(d.present, d.enrolled));
    }
    final yMax = (maxV * 1.12).ceilToDouble();
    double x(int i) => left + (days.length == 1 ? w / 2 : w * i / (days.length - 1));
    double y(num v) => top + h - (v / yMax) * h;

    // grid + y labels
    final gp = Paint()
      ..color = grid
      ..strokeWidth = 1;
    for (var k = 0; k <= 4; k++) {
      final v = yMax * k / 4;
      final yy = y(v);
      canvas.drawLine(Offset(left, yy), Offset(size.width - right, yy), gp);
      _text(canvas, v.round().toString(), Offset(left - 6, yy), align: TextAlign.right);
    }

    // expected band
    final upper = <Offset>[];
    final lower = <Offset>[];
    for (var i = 7; i < days.length; i++) {
      final win = days.sublist(math.max(0, i - 14), i).map((e) => e.present.toDouble()).toList();
      final mean = win.reduce((a, b) => a + b) / win.length;
      final sd = math.max(1.5, math.sqrt(win.map((v) => (v - mean) * (v - mean)).reduce((a, b) => a + b) / win.length));
      upper.add(Offset(x(i), y(math.min(yMax, mean + 2 * sd))));
      lower.add(Offset(x(i), y(math.max(0, mean - 2 * sd))));
    }
    if (upper.length > 1) {
      final path = Path()..moveTo(upper.first.dx, upper.first.dy);
      for (final p in upper.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      for (final p in lower.reversed) {
        path.lineTo(p.dx, p.dy);
      }
      path.close();
      canvas.drawPath(path, Paint()..color = band);
    }

    // enrolled (dashed)
    final ep = Paint()
      ..color = enrolled
      ..strokeWidth = 1.6;
    for (var i = 0; i < days.length - 1; i++) {
      final a = Offset(x(i), y(days[i].enrolled));
      final b = Offset(x(i + 1), y(days[i + 1].enrolled));
      final segs = 3;
      for (var k = 0; k < segs; k++) {
        if (k.isOdd) continue;
        canvas.drawLine(Offset.lerp(a, b, k / segs)!, Offset.lerp(a, b, (k + 1) / segs)!, ep);
      }
    }

    // present (line)
    final lp = Paint()
      ..color = line
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeJoin = StrokeJoin.round;
    final path = Path()..moveTo(x(0), y(days[0].present));
    for (var i = 1; i < days.length; i++) {
      path.lineTo(x(i), y(days[i].present));
    }
    canvas.drawPath(path, lp);

    // flags
    for (var i = 0; i < days.length; i++) {
      if (!flags.contains(dayKey(days[i].day))) continue;
      final c = Offset(x(i), y(days[i].present));
      canvas.drawCircle(c, 6, Paint()..color = surface);
      canvas.drawCircle(c, 4.5, Paint()..color = flag);
    }

    // x labels: first, middle, last
    for (final i in {0, days.length ~/ 2, days.length - 1}) {
      final d = days[i].day;
      _text(canvas, '${d.day} ${_monthsEn[d.month - 1]}', Offset(x(i), size.height - bottom / 2),
          align: i == 0 ? TextAlign.left : (i == days.length - 1 ? TextAlign.right : TextAlign.center));
    }
  }

  @override
  bool shouldRepaint(covariant _AttendancePainter old) => old.days != days || old.flags != flags || old.line != line;
}

// ============================================================================
// §14 LIVE MONITORING DASHBOARD (officials)
// ============================================================================

class MonitorTab extends StatelessWidget {
  const MonitorTab({super.key, this.onGo});
  final void Function(int tab)? onGo;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user;
    if (u == null) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    final insts = s.scopedInstitutes;
    final red = insts.where((i) => i.status == 'red').length;
    final amber = insts.where((i) => i.status == 'yellow').length;
    final green = insts.where((i) => i.status == 'green').length;
    final alerts = s.scopedAlerts;
    final open = alerts.where((a) => a.status == 'open').toList();
    final openRed = open.where((a) => a.severity == 'red').length;
    final cams = s.scopedCameras;
    final live = cams.where((c) => c.online).length;
    var present = 0;
    var enrolled = 0;
    for (final i in insts) {
      final d = s.attendanceCache[i.id];
      if (d != null && d.isNotEmpty) {
        present += d.last.present;
        enrolled += d.last.enrolled;
      }
    }
    final attPct = enrolled == 0 ? null : (present / enrolled * 100).round();
    final anomalies = s.allAnomalies;
    final proxy = anomalies.where((a) => a.kind == 'flatline' || a.kind == 'above_enrolment' || a.kind == 'staff_flat').length;
    final today = DateTime.now();
    final vcToday = s.vcCalls.where((c) => c.startedAt.year == today.year && c.startedAt.month == today.month && c.startedAt.day == today.day).length;
    final risk = s.riskRows();

    final scope = u.district.isNotEmpty
        ? Msg('${u.district} district', '${u.district} ज़िला')
        : (u.state.isNotEmpty ? Msg(u.state, u.state) : const Msg('All states', 'सभी राज्य'));

    // Outcome metrics
    final evTotal = s.submissions.fold<int>(0, (a, b) => a + b.evidence.length);
    final evOk = s.submissions.fold<int>(0, (a, b) => a + b.okCount);
    final blocked = alerts.where((a) => a.type == 'hash_mismatch' || a.type == 'geofence_breach').length;
    final calls = s.vcCalls.where((c) => c.outcome != 'pending').toList();
    final answered = calls.where((c) => c.outcome == 'connected').length;

    return _Plain(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 120),
        children: [
          HomeHeader(onGo: onGo),
          const SizedBox(height: 16),
          const LiveTicker(),
          const SizedBox(height: 16),
          TileGrid(children: [
            QuickTile(
              icon: Icons.apartment_rounded,
              color: kForest,
              value: '${insts.length}',
              label: const Msg('Institutes / NGOs', 'संस्थान / एनजीओ'),
              sub: Msg('$red red · $amber amber · $green green', '$red लाल · $amber पीले · $green हरे'),
            ),
            QuickTile(
              icon: Icons.notifications_active_outlined,
              color: kRed,
              value: '${open.length}',
              label: const Msg('Open alerts', 'खुले अलर्ट'),
              sub: Msg('$openRed high severity', '$openRed उच्च गंभीरता'),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AlertsScreen())),
            ),
            QuickTile(
              icon: Icons.videocam_rounded,
              color: kGreen,
              value: '$live/${cams.length}',
              label: const Msg('Cameras live', 'कैमरे लाइव'),
              sub: Msg('${cams.length - live} need attention', '${cams.length - live} पर ध्यान दें'),
              onTap: onGo == null ? null : () => onGo!(1),
            ),
            QuickTile(
              icon: Icons.how_to_reg_rounded,
              color: kBlue,
              value: attPct == null ? '—' : '$attPct%',
              label: const Msg('Attendance today', 'आज उपस्थिति'),
              sub: Msg('$present of $enrolled residents', '$enrolled में से $present निवासी'),
              onTap: onGo == null ? null : () => onGo!(4),
            ),
            QuickTile(
              icon: Icons.insights_rounded,
              color: kSand,
              value: '${anomalies.length}',
              label: const Msg('Anomaly flags', 'विसंगति संकेत'),
              sub: Msg('$proxy proxy suspicions', '$proxy प्रॉक्सी संदेह'),
              onTap: onGo == null ? null : () => onGo!(4),
            ),
            QuickTile(
              icon: Icons.video_call_rounded,
              color: kSage,
              value: '$vcToday',
              label: const Msg('VC checks today', 'आज वीसी जाँच'),
              sub: Msg('${s.vcCalls.length} in the log', 'लॉग में ${s.vcCalls.length}'),
              onTap: onGo == null ? null : () => onGo!(2),
            ),
          ]),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionTitle('Compliance status', 'अनुपालन स्थिति', icon: Icons.shield_outlined),
                Row(
                  children: [
                    DonutChart(
                      values: [red, amber, green],
                      colors: const [kRed, kAmber, kGreen],
                      size: 116,
                      center: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text('${insts.length}', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                        Text(tx(context, 'institutes', 'संस्थान'), style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
                      ]),
                    ),
                    const SizedBox(width: 18),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          LegendDot(color: kRed, label: tx(context, 'Red — act now', 'लाल — तुरंत कार्रवाई'), value: '$red'),
                          LegendDot(color: kAmber, label: tx(context, 'Amber — watch', 'पीला — निगरानी'), value: '$amber'),
                          LegendDot(color: kGreen, label: tx(context, 'Green — compliant', 'हरा — अनुपालक'), value: '$green'),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionTitle('Needs action', 'कार्रवाई ज़रूरी',
                    icon: Icons.priority_high_rounded,
                    trailing: TextButton(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AlertsScreen())),
                      child: Text(tx(context, 'All', 'सभी')),
                    )),
                if (open.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Bi('No open alerts in your area.', 'आपके क्षेत्र में कोई खुला अलर्ट नहीं।',
                        style: TextStyle(color: cs.onSurfaceVariant)),
                  )
                else
                  for (var i = 0; i < math.min(4, open.length); i++) ...[
                    if (i > 0) const Divider(height: 1),
                    AlertTile(alert: open[i]),
                  ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Highest risk right now', 'अभी सबसे अधिक जोखिम', icon: Icons.local_fire_department_outlined),
                for (final r in risk.take(4))
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(r.inst.name,
                                  maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                            ),
                            Text('${(r.score * 100).round()}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        RiskStack(row: r),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                s.lang == LangMode.hi
                                    ? '${r.openAlerts} अलर्ट · ${r.anomalies} विसंगति संकेत · ${r.daysSince} दिन से निरीक्षण नहीं'
                                    : '${r.openAlerts} alerts · ${r.anomalies} anomaly flags · ${r.daysSince} days since inspection',
                                style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                              ),
                            ),
                            _MiniAction(
                              icon: Icons.videocam_rounded,
                              tip: tx(context, 'CCTV', 'सीसीटीवी'),
                              onTap: () => Navigator.of(context)
                                  .push(MaterialPageRoute<void>(builder: (_) => CctvScreen(instituteId: r.inst.id))),
                            ),
                            _MiniAction(
                              icon: Icons.video_call_rounded,
                              tip: tx(context, 'Random VC', 'रैंडम वीसी'),
                              onTap: () => Navigator.of(context)
                                  .push(MaterialPageRoute<void>(builder: (_) => VcScreen(instituteId: r.inst.id))),
                            ),
                            _MiniAction(
                              icon: Icons.casino_rounded,
                              tip: tx(context, 'Surprise inspection', 'अचानक निरीक्षण'),
                              onTap: () => Navigator.of(context)
                                  .push(MaterialPageRoute<void>(builder: (_) => AssignScreen(instituteId: r.inst.id))),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                Wrap(spacing: 12, runSpacing: 2, children: [
                  LegendDot(color: RiskStack.factorColors[0], label: tx(context, 'Compliance', 'अनुपालन')),
                  LegendDot(color: RiskStack.factorColors[1], label: tx(context, 'Alerts', 'अलर्ट')),
                  LegendDot(color: RiskStack.factorColors[2], label: tx(context, 'Time since visit', 'पिछला दौरा')),
                  LegendDot(color: RiskStack.factorColors[3], label: tx(context, 'Anomalies', 'विसंगति')),
                ]),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            tint: kSand,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Transparency outcomes', 'पारदर्शिता परिणाम', icon: Icons.verified_user_outlined),
                _OutcomeRow(
                  icon: Icons.fingerprint_rounded,
                  en: 'Evidence verified by SHA-256',
                  hi: 'SHA-256 से सत्यापित साक्ष्य',
                  value: evTotal == 0 ? '—' : '${(evOk / evTotal * 100).round()}%',
                  sub: Msg('$evOk of $evTotal files on this device', 'इस डिवाइस पर $evTotal में से $evOk फ़ाइलें'),
                ),
                _OutcomeRow(
                  icon: Icons.block_rounded,
                  en: 'Fake / altered reports blocked',
                  hi: 'फ़र्ज़ी / बदली रिपोर्ट रोकी गईं',
                  value: '$blocked',
                  sub: const Msg('Hash mismatch or outside the 500 m geofence', 'हैश मेल नहीं या 500 मी. जियोफ़ेंस से बाहर'),
                ),
                _OutcomeRow(
                  icon: Icons.person_off_outlined,
                  en: 'Proxy-functioning suspicions',
                  hi: 'प्रॉक्सी कार्यप्रणाली संदेह',
                  value: '$proxy',
                  sub: const Msg('Flat or impossible attendance, 100% staff for weeks', 'सपाट या असंभव उपस्थिति, हफ़्तों 100% स्टाफ़'),
                ),
                _OutcomeRow(
                  icon: Icons.phone_in_talk_outlined,
                  en: 'Verification calls answered',
                  hi: 'सत्यापन कॉल का उत्तर',
                  value: calls.isEmpty ? '—' : '${(answered / calls.length * 100).round()}%',
                  sub: Msg('$answered of ${calls.length} random VCs', '${calls.length} में से $answered रैंडम वीसी'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ReportsScreen())),
            child: Row(
              children: [
                Icon(Icons.description_outlined, color: cs.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Bi('Geo-tagged inspection reports', 'जियो-टैग निरीक्षण रिपोर्ट',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniAction extends StatelessWidget {
  const _MiniAction({required this.icon, required this.tip, required this.onTap});
  final IconData icon;
  final String tip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      tooltip: tip,
      onPressed: onTap,
      icon: Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
    );
  }
}

class _OutcomeRow extends StatelessWidget {
  const _OutcomeRow({required this.icon, required this.en, required this.hi, required this.value, required this.sub});
  final IconData icon;
  final String en;
  final String hi;
  final String value;
  final Msg sub;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 22, color: cs.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Bi(en, hi, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                Text(sub.of(s.lang), style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ],
            ),
          ),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  String _status = 'all'; // all | verified | submitted | rejected
  String? _institute;
  bool _busyId = false;

  Future<void> _download(Submission sub) async {
    if (_busyId) return;
    setState(() => _busyId = true);
    try {
      await shareReportPdf(context, sub);
    } finally {
      if (mounted) setState(() => _busyId = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final list = <Submission>[...s.submissions];
    if (s.isDemo) {
      for (final email in const ['inspector1@dosje.gov.in', 'inspector2@dosje.gov.in']) {
        final u = DemoBackend.login(email, DemoBackend.demoPassword);
        if (u != null) {
          final sub = DemoBackend.seededSubmission(u);
          if (!list.any((x) => x.id == sub.id)) list.add(sub);
        }
      }
    }
    list.sort((a, b) => b.submittedAt.compareTo(a.submittedAt));
    final institutes = {for (final sub in list) sub.instituteName}.toList()..sort();
    final shown = list.where((sub) {
      if (_status != 'all' && sub.status != _status) return false;
      if (_institute != null && sub.instituteName != _institute) return false;
      return true;
    }).toList();
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Inspection reports', 'निरीक्षण रिपोर्ट'), actions: const [DemoBadge()]),
      body: list.isEmpty
          ? const Center(child: EmptyState(icon: Icons.description_outlined, title: Msg('No reports yet', 'अभी कोई रिपोर्ट नहीं')))
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: Row(children: [
                    Expanded(
                      child: SizedBox(
                        height: 36,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: [
                            for (final f in const [
                              ('all', Msg('All', 'सभी')),
                              (AStatus.verified, Msg('Verified', 'सत्यापित')),
                              (AStatus.submitted, Msg('Submitted', 'जमा किया')),
                              (AStatus.rejected, Msg('Needs redo', 'दोबारा करें')),
                            ])
                              Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: ChoiceChip(
                                  label: Text(f.$2.of(s.lang)),
                                  selected: _status == f.$1,
                                  onSelected: (_) => setState(() => _status = f.$1),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    if (institutes.length > 1) ...[
                      const SizedBox(width: 8),
                      PopupMenuButton<String?>(
                        tooltip: tx(context, 'Filter by institute', 'संस्थान के अनुसार फ़िल्टर'),
                        icon: Icon(Icons.filter_list_rounded, color: _institute == null ? cs.onSurfaceVariant : cs.primary),
                        onSelected: (v) => setState(() => _institute = v),
                        itemBuilder: (_) => [
                          PopupMenuItem(value: null, child: Text(tx(context, 'All institutes', 'सभी संस्थान'))),
                          for (final i in institutes) PopupMenuItem(value: i, child: Text(i, overflow: TextOverflow.ellipsis)),
                        ],
                      ),
                    ],
                  ]),
                ),
                Expanded(
                  child: shown.isEmpty
                      ? EmptyState(
                          icon: Icons.filter_list_off_rounded,
                          title: const Msg('No reports match this filter', 'इस फ़िल्टर से कोई रिपोर्ट नहीं मिली'),
                          action: TextButton(
                            onPressed: () => setState(() {
                              _status = 'all';
                              _institute = null;
                            }),
                            child: Text(tx(context, 'Clear filters', 'फ़िल्टर हटाएँ')),
                          ),
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                          children: [
                            for (final sub in shown)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Panel(
                                  accent: _subColor(sub.status),
                                  onTap: () => Navigator.of(context)
                                      .push(MaterialPageRoute<void>(builder: (_) => SubmissionDetailScreen(submission: sub))),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Expanded(
                                            child: Text(sub.instituteName,
                                                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                          ),
                                          IconButton(
                                            tooltip: tx(context, 'Download PDF', 'पीडीएफ़ डाउनलोड करें'),
                                            visualDensity: VisualDensity.compact,
                                            onPressed: _busyId ? null : () => _download(sub),
                                            icon: const Icon(Icons.download_rounded),
                                          ),
                                        ],
                                      ),
                                      Text(
                                        '${fmtDateTime(sub.submittedAt, s.lang)} · GPS ${fmtCoord(sub.lat)}, ${fmtCoord(sub.lng)}',
                                        style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                                      ),
                                      const SizedBox(height: 8),
                                      Wrap(spacing: 6, runSpacing: 6, children: [
                                        Pill(label: _subLabel(sub.status), color: _subColor(sub.status), icon: _subIcon(sub.status)),
                                        Pill(
                                          label: Msg('${sub.okCount}/${sub.evidence.length} files verified', '${sub.okCount}/${sub.evidence.length} फ़ाइलें सत्यापित'),
                                          color: Colors.blueGrey,
                                          icon: Icons.fingerprint_rounded,
                                        ),
                                      ]),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
    );
  }
}

// ============================================================================
// §14b INSTITUTES MAP
// ============================================================================

/// A real map (OpenStreetMap tiles, no API key) plotting every institute in
/// the user's scope at its actual latitude/longitude. Nothing here is a fixed
/// image — markers come straight from live institute data, so the map updates
/// as institutes, their status or their coordinates change on the server.
class InstitutesMapScreen extends StatefulWidget {
  const InstitutesMapScreen({super.key});

  @override
  State<InstitutesMapScreen> createState() => _InstitutesMapScreenState();
}

class _InstitutesMapScreenState extends State<InstitutesMapScreen> {
  final MapController _map = MapController();
  String? _status; // null = all, else red | yellow | green
  Institute? _selected;

  Color _dot(String status) => status == 'red' ? kRed : (status == 'yellow' ? kAmber : kGreen);

  Future<void> _openDirections(Institute i) async {
    if (i.lat == null || i.lng == null) return;
    final uri = Uri.parse('geo:${i.lat},${i.lng}?q=${i.lat},${i.lng}(${Uri.encodeComponent(i.name)})');
    try {
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened && mounted) {
        await launchUrl(Uri.parse('https://www.openstreetmap.org/?mlat=${i.lat}&mlon=${i.lng}#map=17/${i.lat}/${i.lng}'),
            mode: LaunchMode.externalApplication);
      }
    } catch (_) {
      if (mounted) snack(context, 'Could not open a maps app.', 'मानचित्र ऐप नहीं खुल सका।', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final all = s.scopedInstitutes;
    final located = all.where((i) => i.lat != null && i.lng != null).toList();
    final shown = _status == null ? located : located.where((i) => i.status == _status).toList();

    // Default view: India-wide, re-centred on the scoped institutes when any
    // have real coordinates so the first frame already shows real data.
    var center = ll.LatLng(22.9734, 78.6569);
    var zoom = 4.3;
    if (located.isNotEmpty) {
      final lat = located.map((i) => i.lat!).reduce((a, b) => a + b) / located.length;
      final lng = located.map((i) => i.lng!).reduce((a, b) => a + b) / located.length;
      center = ll.LatLng(lat, lng);
      zoom = located.length == 1 ? 13 : 6;
    }

    return Scaffold(
      appBar: govAppBar(context, title: Bi('Institutes map', 'संस्थान मानचित्र'), actions: const [DemoBadge()]),
      body: all.isEmpty
          ? const Center(child: EmptyState(icon: Icons.map_outlined, title: Msg('No institutes in your scope', 'आपके क्षेत्र में कोई संस्थान नहीं')))
          : Stack(
              children: [
                FlutterMap(
                  mapController: _map,
                  options: MapOptions(
                    initialCenter: center,
                    initialZoom: zoom,
                    onTap: (_, __) => setState(() => _selected = null),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'in.gov.dosje.nayan',
                      maxNativeZoom: 19,
                    ),
                    MarkerLayer(
                      markers: [
                        for (final i in shown)
                          Marker(
                            point: ll.LatLng(i.lat!, i.lng!),
                            width: 40,
                            height: 40,
                            child: GestureDetector(
                              onTap: () => setState(() => _selected = i),
                              child: Icon(Icons.location_on_rounded, size: 40, color: _dot(i.status)),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  top: 12,
                  child: Wrap(spacing: 8, children: [
                    for (final f in const [
                      (null, Msg('All', 'सभी')),
                      ('red', Msg('Critical', 'गंभीर')),
                      ('yellow', Msg('Warning', 'चेतावनी')),
                      ('green', Msg('Normal', 'सामान्य')),
                    ])
                      ChoiceChip(
                        selected: _status == f.$1,
                        onSelected: (_) => setState(() => _status = f.$1),
                        backgroundColor: cs.surface,
                        label: Text(f.$2.of(s.lang)),
                      ),
                  ]),
                ),
                if (located.length < all.length)
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: _selected == null ? 12 : 150,
                    child: Panel(
                      tint: kSand,
                      padding: const EdgeInsets.all(10),
                      child: Bi(
                        '${all.length - located.length} institute(s) in scope have no coordinates on file and are not shown on the map.',
                        '${all.length - located.length} संस्थान(ओं) के निर्देशांक दर्ज नहीं हैं, इसलिए वे मानचित्र पर नहीं दिखते।',
                        style: const TextStyle(fontSize: 12.5),
                      ),
                    ),
                  ),
                if (_selected != null)
                  Positioned(
                    left: 12,
                    right: 12,
                    bottom: 12,
                    child: Panel(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 10,
                            height: 10,
                            margin: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(color: _dot(_selected!.status), shape: BoxShape.circle),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(_selected!.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                                Text(_selected!.typeLabel.of(s.lang), style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                                if (_selected!.district.isNotEmpty || _selected!.state.isNotEmpty)
                                  Text([_selected!.district, _selected!.state].where((x) => x.isNotEmpty).join(', '),
                                      style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                                const SizedBox(height: 8),
                                Wrap(spacing: 8, runSpacing: 8, children: [
                                  OutlinedButton.icon(
                                    onPressed: () => _openDirections(_selected!),
                                    icon: const Icon(Icons.directions_rounded, size: 16),
                                    label: Text(tx(context, 'Directions', 'दिशा-निर्देश')),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed: () => Navigator.of(context)
                                        .push(MaterialPageRoute<void>(builder: (_) => CctvScreen(instituteId: _selected!.id))),
                                    icon: const Icon(Icons.videocam_outlined, size: 16),
                                    label: Text(tx(context, 'CCTV', 'सीसीटीवी')),
                                  ),
                                ]),
                              ],
                            ),
                          ),
                          IconButton(
                            visualDensity: VisualDensity.compact,
                            onPressed: () => setState(() => _selected = null),
                            icon: const Icon(Icons.close_rounded, size: 18),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

// ============================================================================
// §15 LIVE CCTV
// ============================================================================

class CctvScreen extends StatelessWidget {
  const CctvScreen({super.key, this.instituteId});
  final String? instituteId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Live CCTV', 'लाइव सीसीटीवी'), actions: const [DemoBadge()]),
      body: CctvTab(instituteId: instituteId),
    );
  }
}

class CctvTab extends StatefulWidget {
  const CctvTab({super.key, this.instituteId});
  final String? instituteId;

  @override
  State<CctvTab> createState() => _CctvTabState();
}

class _CctvTabState extends State<CctvTab> {
  bool _issuesOnly = false;
  String? _inst;

  @override
  void initState() {
    super.initState();
    _inst = widget.instituteId;
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final insts = s.scopedInstitutes;
    var cams = s.scopedCameras;
    if (widget.instituteId != null && cams.every((c) => c.instituteId != widget.instituteId)) {
      cams = s.cameras.where((c) => c.instituteId == widget.instituteId).toList();
    }
    final liveN = cams.where((c) => c.status == 'online').length;
    final frozenN = cams.where((c) => c.status == 'stale').length;
    final offN = cams.where((c) => c.status == 'offline').length;
    var shown = cams;
    if (_inst != null) shown = shown.where((c) => c.instituteId == _inst).toList();
    if (_issuesOnly) shown = shown.where((c) => !c.online).toList();
    final instOptions = <Institute>[
      for (final i in insts)
        if (cams.any((c) => c.instituteId == i.id)) i,
    ];
    if (_inst != null && !instOptions.any((i) => i.id == _inst)) {
      final extra = s.instituteById(_inst!);
      if (extra != null) instOptions.add(extra);
    }

    return _Plain(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
        children: [
          Row(children: [
            Expanded(child: QuickTile(icon: Icons.fiber_manual_record, color: kGreen, value: '$liveN', label: const Msg('Live', 'लाइव'))),
            const SizedBox(width: 8),
            Expanded(child: QuickTile(icon: Icons.pause_circle_outline, color: kAmber, value: '$frozenN', label: const Msg('Frozen', 'रुकी'))),
            const SizedBox(width: 8),
            Expanded(child: QuickTile(icon: Icons.videocam_off_outlined, color: kRed, value: '$offN', label: const Msg('Offline', 'बंद'))),
          ]),
          const SizedBox(height: 16),
          Panel(
            tint: kSage,
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Icon(Icons.visibility_rounded, color: cs.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Bi('This screen checks every feed for frozen or looping frames, covered lenses and outages — a camera going dark before a visit is itself a signal.',
                    'यह स्क्रीन हर फ़ीड में रुके या दोहराए फ़्रेम, ढके लेंस और बंद होने की जाँच करती है — दौरे से पहले कैमरा बंद होना भी एक संकेत है।',
                    style: const TextStyle(fontSize: 13)),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: _inst,
                  isExpanded: true,
                  decoration: fieldDecoration(context, label: tx(context, 'Institute', 'संस्थान'), icon: Icons.apartment_rounded),
                  items: [
                    DropdownMenuItem<String?>(value: null, child: Text(tx(context, 'All institutes', 'सभी संस्थान'))),
                    for (final i in instOptions)
                      DropdownMenuItem<String?>(value: i.id, child: Text(i.name, overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _inst = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            ChoiceChip(
              selected: !_issuesOnly,
              onSelected: (_) => setState(() => _issuesOnly = false),
              label: Text(both(s.lang, 'All feeds', 'सभी फ़ीड')),
            ),
            ChoiceChip(
              selected: _issuesOnly,
              onSelected: (_) => setState(() => _issuesOnly = true),
              label: Text('${both(s.lang, 'Issues', 'समस्याएँ')} (${frozenN + offN})'),
            ),
          ]),
          const SizedBox(height: 16),
          if (shown.isEmpty)
            const EmptyState(icon: Icons.videocam_outlined, title: Msg('No feeds here', 'यहाँ कोई फ़ीड नहीं'))
          else
            TileGrid(children: [for (final c in shown) CameraTile(feed: c)]),
        ],
      ),
    );
  }
}

class CameraTile extends StatelessWidget {
  const CameraTile({super.key, required this.feed});
  final CameraFeed feed;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final inst = s.instituteById(feed.instituteId);
    return Panel(
      padding: EdgeInsets.zero,
      blur: false,
      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CameraViewerScreen(feed: feed))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AspectRatio(aspectRatio: 16 / 10, child: CameraFeedView(feed: feed, compact: true)),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(feed.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                Text(inst?.name ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A camera picture: a real network snapshot when the institute's camera has
/// one configured and online, otherwise an honest "no live picture" placeholder.
/// Nothing here is ever a simulated/fake video — connect a real stream URL
/// from Sentinel's camera settings to replace the placeholder with a live feed.
class CameraFeedView extends StatefulWidget {
  const CameraFeedView({super.key, required this.feed, this.compact = false});
  final CameraFeed feed;
  final bool compact;

  @override
  State<CameraFeedView> createState() => _CameraFeedViewState();
}

class _CameraFeedViewState extends State<CameraFeedView> {
  Timer? _clock;
  DateTime _now = DateTime.now();
  int _frame = 0;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _now = DateTime.now();
        _frame++;
      });
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.feed;
    final stamp = f.status == 'stale' ? (f.lastPing ?? _now) : _now;
    final l = stamp.toLocal();
    final ts = '${l.day}-${two(l.month)}-${l.year} ${two(l.hour)}:${two(l.minute)}:${two(l.second)}';
    Widget picture;
    if (f.snapshotUrl != null && f.online) {
      final sep = f.snapshotUrl!.contains('?') ? '&' : '?';
      picture = Image.network(
        '${f.snapshotUrl}${sep}t=${_frame ~/ 2}',
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => _CameraPlaceholder(feed: f, reason: _PlaceholderReason.feedError),
      );
    } else {
      picture = _CameraPlaceholder(
        feed: f,
        reason: (f.streamUrl == null && f.snapshotUrl == null)
            ? _PlaceholderReason.notConfigured
            : _PlaceholderReason.offline,
      );
    }
    final badgeColor = CameraFeed.statusColor(f.status);
    final small = widget.compact;
    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          picture,
          Positioned(
            left: 8,
            top: 8,
            child: Container(
              padding: EdgeInsets.symmetric(horizontal: small ? 6 : 8, vertical: 3),
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(6)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: f.online && _frame.isEven ? badgeColor : badgeColor.withValues(alpha: f.online ? 0.35 : 1),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  f.online ? 'REC · LIVE' : (f.status == 'stale' ? 'FROZEN' : 'NO SIGNAL'),
                  style: TextStyle(color: Colors.white, fontSize: small ? 9 : 11, fontWeight: FontWeight.w700, letterSpacing: 0.8),
                ),
              ]),
            ),
          ),
          Positioned(
            left: 8,
            bottom: 6,
            child: Text(ts,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontSize: small ? 9 : 12,
                  fontFamily: 'monospace',
                  shadows: const [Shadow(blurRadius: 3, color: Colors.black)],
                )),
          ),
          if (!small)
            Positioned(
              right: 8,
              bottom: 6,
              child: Text(f.name.toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700, shadows: [Shadow(blurRadius: 3, color: Colors.black)])),
            ),
        ],
      ),
    );
  }
}

enum _PlaceholderReason { notConfigured, offline, feedError }

/// Honest stand-in for a camera tile with no live image to show. Never draws
/// a simulated room or people — a real feed only ever comes from a real
/// snapshot/stream URL set on the camera (Sentinel → institute → cameras).
class _CameraPlaceholder extends StatelessWidget {
  const _CameraPlaceholder({required this.feed, required this.reason});
  final CameraFeed feed;
  final _PlaceholderReason reason;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final mock = s.isDemo;
    final msg = switch (reason) {
      _PlaceholderReason.notConfigured => mock
          ? const Msg('Mock preview — this test camera has no stream attached',
              'मॉक पूर्वावलोकन — इस परीक्षण कैमरे से कोई स्ट्रीम जुड़ी नहीं है')
          : const Msg('No live stream set up for this camera yet',
              'इस कैमरे के लिए अभी कोई लाइव स्ट्रीम सेट नहीं है'),
      _PlaceholderReason.offline =>
        const Msg('Camera offline — no picture available', 'कैमरा बंद — कोई तस्वीर उपलब्ध नहीं'),
      _PlaceholderReason.feedError =>
        const Msg('Could not load the live picture', 'लाइव तस्वीर लोड नहीं हो सकी'),
    };
    return Container(
      color: const Color(0xFF1C211D),
      alignment: Alignment.center,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.videocam_off_rounded, color: Colors.white.withValues(alpha: 0.55), size: 30),
            const SizedBox(height: 8),
            Bi(msg.en, msg.hi, center: true, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11.5)),
          ],
        ),
      ),
    );
  }
}

class CameraViewerScreen extends StatefulWidget {
  const CameraViewerScreen({super.key, required this.feed});
  final CameraFeed feed;

  @override
  State<CameraViewerScreen> createState() => _CameraViewerScreenState();
}

class _CameraViewerScreenState extends State<CameraViewerScreen> {
  final GlobalKey _shot = GlobalKey();
  bool _busy = false;

  Future<void> _snapshot() async {
    final boundary = _shot.currentContext?.findRenderObject();
    if (boundary is! RenderRepaintBoundary || _busy) return;
    setState(() => _busy = true);
    try {
      final image = await boundary.toImage(pixelRatio: 2);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw Exception('no image');
      final bytes = data.buffer.asUint8List();
      final hash = await hashBytes(bytes);
      if (!mounted) return;
      final s = AppScope.read(context);
      final now = DateTime.now();
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Bi('Snapshot sealed', 'स्नैपशॉट मुहरबंद', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.memory(bytes, height: 140, fit: BoxFit.cover)),
              const SizedBox(height: 10),
              Text(fmtDateTime(now, s.lang), style: const TextStyle(fontWeight: FontWeight.w700)),
              Text('${widget.feed.name} · ${s.instituteById(widget.feed.instituteId)?.name ?? ''}'),
              const SizedBox(height: 6),
              SelectableText('SHA-256 $hash', style: const TextStyle(fontFamily: 'monospace', fontSize: 11.5)),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: hash));
                if (c.mounted) Navigator.of(c).pop();
              },
              child: Text(tx(c, 'Copy hash', 'हैश कॉपी करें')),
            ),
            FilledButton(onPressed: () => Navigator.of(c).pop(), child: Text(tx(c, 'Done', 'ठीक है'))),
          ],
        ),
      );
    } catch (_) {
      if (mounted) snack(context, 'Could not capture the frame.', 'फ़्रेम कैप्चर नहीं हो सका।', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _raise() async {
    final s = AppScope.read(context);
    final ok = await confirmDialog(
      context,
      title: const Msg('Raise a CCTV alert?', 'सीसीटीवी अलर्ट दर्ज करें?'),
      body: const Msg('An alert with your name is added to the ledger for this institute.', 'इस संस्थान के लिए आपके नाम से अलर्ट दर्ज होगा।'),
      confirm: const Msg('Raise alert', 'अलर्ट दर्ज करें'),
    );
    if (!ok || !mounted) return;
    s.raiseLocalAlert(
      instituteId: widget.feed.instituteId,
      type: widget.feed.online ? 'cctv_tamper' : 'camera_offline',
      detail: "Raised from Nayan by ${s.user?.name ?? ''} while viewing feed '${widget.feed.name}' (${CameraFeed.statusLabel(widget.feed.status).en}).",
    );
    snack(context, 'Alert raised.', 'अलर्ट दर्ज हुआ।');
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final f = widget.feed;
    final inst = s.instituteById(f.instituteId);
    final frozen = f.status == 'stale';
    return Scaffold(
      appBar: govAppBar(context, title: Bi(f.name, inst?.name ?? '', maxLines: 1), actions: const [DemoBadge()]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: RepaintBoundary(
              key: _shot,
              child: AspectRatio(aspectRatio: 16 / 10, child: CameraFeedView(feed: f)),
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                InfoRow(icon: Icons.apartment_rounded, en: 'Institute', hi: 'संस्थान', value: inst?.name ?? '—'),
                InfoRow(icon: Icons.sensors_rounded, en: 'Status', hi: 'स्थिति', value: CameraFeed.statusLabel(f.status).of(s.lang)),
                InfoRow(
                  icon: Icons.access_time_rounded,
                  en: 'Last signal',
                  hi: 'अंतिम सिग्नल',
                  value: f.lastPing == null ? '—' : '${fmtDateTime(f.lastPing!, s.lang)} (${timeAgo(f.lastPing!).of(s.lang)})',
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            tint: frozen || !f.online ? kAmber : kSage,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Feed status', 'फ़ीड स्थिति', icon: Icons.sensors_rounded),
                _AiRow(
                  en: 'Connection',
                  hi: 'कनेक्शन',
                  value: f.online ? tx(context, 'Streaming', 'चालू') : (frozen ? tx(context, 'Stalled', 'अटका') : tx(context, 'Offline', 'बंद')),
                  ok: f.online,
                ),
                if (f.lastPing != null)
                  _AiRow(
                    en: 'Last change on this feed',
                    hi: 'इस फ़ीड पर अंतिम बदलाव',
                    value: frozen
                        ? tx(context, 'Same frame for a while — may be frozen', 'कुछ समय से एक जैसा फ़्रेम — शायद रुकी हुई')
                        : tx(context, 'Reporting in normally', 'सामान्य रूप से सक्रिय'),
                    ok: !frozen,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: ShineButton(
                label: tx(context, 'Seal snapshot', 'स्नैपशॉट लें'),
                icon: Icons.camera_rounded,
                onPressed: _busy ? null : _snapshot,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: ShineButton(
                label: tx(context, 'VC now', 'अभी वीसी'),
                icon: Icons.video_call_rounded,
                color: kSand,
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => VcScreen(instituteId: f.instituteId))),
              ),
            ),
          ]),
          const SizedBox(height: 10),
          Wrap(spacing: 10, runSpacing: 10, children: [
            OutlinedButton.icon(
              onPressed: _raise,
              icon: const Icon(Icons.report_outlined),
              label: Text(tx(context, 'Raise alert', 'अलर्ट दर्ज करें')),
            ),
            if (f.streamUrl != null)
              OutlinedButton.icon(
                onPressed: () async {
                  try {
                    await launchUrl(Uri.parse(f.streamUrl!), mode: LaunchMode.externalApplication);
                  } catch (_) {}
                },
                icon: const Icon(Icons.open_in_new_rounded),
                label: Text(tx(context, 'Open live stream', 'लाइव स्ट्रीम खोलें')),
              ),
          ]),
          const SizedBox(height: 10),
          Text(
            tx(context, 'A sealed snapshot carries its time and SHA-256, so it can be used as evidence.',
                'मुहरबंद स्नैपशॉट पर समय और SHA-256 होता है, इसलिए इसे साक्ष्य के रूप में उपयोग किया जा सकता है।'),
            style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

class _AiRow extends StatelessWidget {
  const _AiRow({required this.en, required this.hi, required this.value, required this.ok});
  final String en;
  final String hi;
  final String value;
  final bool ok;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(ok ? Icons.check_circle_rounded : Icons.error_rounded, size: 18, color: ok ? kGreen : kAmber),
          const SizedBox(width: 10),
          Expanded(child: Bi(en, hi, style: const TextStyle(fontSize: 13.5))),
          const SizedBox(width: 8),
          Flexible(child: Text(value, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
        ],
      ),
    );
  }
}

// ============================================================================
// §16 RANDOM VIDEO CONFERENCING (VC)
// ============================================================================

class VcScreen extends StatelessWidget {
  const VcScreen({super.key, this.instituteId});
  final String? instituteId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Random VC', 'रैंडम वीसी'), actions: const [DemoBadge()]),
      body: VcTab(instituteId: instituteId),
    );
  }
}

class VcTab extends StatefulWidget {
  const VcTab({super.key, this.instituteId});
  final String? instituteId;

  @override
  State<VcTab> createState() => _VcTabState();
}

class _VcTabState extends State<VcTab> {
  String _role = 'any';
  String? _inst; // null = random institute
  bool _drawing = false;
  VcParticipant? _picked;
  Institute? _pickedInst;
  String _commit = '';
  VcCall? _active;
  String _logOutcome = 'all'; // all | connected | flagged

  @override
  void initState() {
    super.initState();
    _inst = widget.instituteId;
  }

  Future<void> _draw() async {
    final s = AppScope.read(context);
    final pool = s.scopedInstitutes;
    if (pool.isEmpty && _inst == null) return;
    setState(() {
      _drawing = true;
      _picked = null;
      _active = null;
    });
    final seed = SeededRandom.newSeed();
    final rng = SeededRandom(seed);
    final inst = _inst != null ? s.instituteById(_inst!) : pool[(rng.next() * pool.length).floor().toInt() % pool.length];
    if (inst == null) {
      setState(() => _drawing = false);
      return;
    }
    List<VcParticipant> dir;
    try {
      dir = await s.vcDirectory(inst.id);
    } catch (_) {
      dir = const [];
    }
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    final candidates = _role == 'any' ? dir : dir.where((p) => p.role == _role).toList();
    if (candidates.isEmpty) {
      setState(() => _drawing = false);
      snack(context, 'Nobody registered for that role here.', 'यहाँ उस भूमिका में कोई पंजीकृत नहीं।', error: true);
      return;
    }
    final p = candidates[(rng.next() * candidates.length).floor().toInt() % candidates.length];
    setState(() {
      _drawing = false;
      _picked = p;
      _pickedInst = inst;
      _commit = SeededRandom.commitmentOf(seed);
    });
  }

  Future<void> _start() async {
    final s = AppScope.read(context);
    final p = _picked;
    final inst = _pickedInst;
    if (p == null || inst == null) return;
    final ok = await confirmDialog(
      context,
      title: const Msg('Start the video call?', 'वीडियो कॉल शुरू करें?'),
      body: Msg('A secure room opens for ${p.name} (${VcParticipant.roleLabel(p.role).en}) at ${inst.name}. The invitation goes to their registered number.',
          '${inst.name} के ${p.name} (${VcParticipant.roleLabel(p.role).hi}) के लिए सुरक्षित रूम खुलेगा। निमंत्रण उनके पंजीकृत नंबर पर जाएगा।'),
      confirm: const Msg('Start call', 'कॉल शुरू करें'),
    );
    if (!ok || !mounted) return;
    final room = 'DoSJE-Nayan-${_randomHex(10)}';
    final call = VcCall(
      id: 'vc-${DateTime.now().millisecondsSinceEpoch}',
      instituteId: inst.id,
      instituteName: inst.name,
      participantName: p.name,
      participantRole: p.role,
      startedAt: DateTime.now(),
      outcome: 'pending',
      room: room,
      byName: s.user?.name ?? '',
      random: widget.instituteId == null,
    );
    await s.saveVcCall(call);
    setState(() => _active = call);
    final base = s.vcBase();
    final url = '${base.endsWith('/') ? base : '$base/'}$room';
    try {
      final opened = await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      if (!opened && mounted) snack(context, 'Could not open the call. Room: $room', 'कॉल नहीं खुल सकी। रूम: $room', error: true);
    } catch (_) {
      if (mounted) snack(context, 'Could not open the call. Room: $room', 'कॉल नहीं खुल सकी। रूम: $room', error: true);
    }
  }

  Future<void> _record(VcCall c) async {
    await showVcOutcomeSheet(context, c);
    if (mounted) setState(() => _active = c.outcome == 'pending' ? c : null);
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final insts = s.scopedInstitutes;
    final calls = s.vcCalls.where((c) => widget.instituteId == null || c.instituteId == widget.instituteId).toList();
    final today = DateTime.now();
    final todayCalls = calls.where((c) => c.startedAt.year == today.year && c.startedAt.month == today.month && c.startedAt.day == today.day).length;
    final done = calls.where((c) => c.outcome != 'pending').toList();
    final answered = done.where((c) => c.outcome == 'connected').length;
    final flagged = done.where((c) => c.outcome != 'connected').length;
    final instOptions = [...insts];
    if (_inst != null && !instOptions.any((i) => i.id == _inst)) {
      final extra = s.instituteById(_inst!);
      if (extra != null) instOptions.add(extra);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
      children: [
        Row(children: [
          Expanded(child: QuickTile(icon: Icons.today_rounded, color: kSage, value: '$todayCalls', label: const Msg('Calls today', 'आज कॉल'))),
          const SizedBox(width: 8),
          Expanded(
            child: QuickTile(
              icon: Icons.phone_in_talk_rounded,
              color: kGreen,
              value: done.isEmpty ? '—' : '${(answered / done.length * 100).round()}%',
              label: const Msg('Answered', 'उत्तर मिला'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(child: QuickTile(icon: Icons.flag_rounded, color: kRed, value: '$flagged', label: const Msg('Flagged', 'चिह्नित'))),
        ]),
        const SizedBox(height: 16),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle('Surprise verification call', 'अचानक सत्यापन कॉल', icon: Icons.shuffle_rounded),
              Bi('The app picks the person at random, so nobody can prepare. Ask them to show the premises and the people present.',
                  'ऐप व्यक्ति को रैंडम चुनता है, ताकि कोई पहले से तैयारी न कर सके। उनसे परिसर और उपस्थित लोगों को दिखाने को कहें।',
                  style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
              const SizedBox(height: 16),
              Wrap(spacing: 10, runSpacing: 10, children: [
                for (final r in const [
                  ('any', Msg('Anyone', 'कोई भी')),
                  ('incharge', Msg('Project in-charge', 'परियोजना प्रभारी')),
                  ('staff', Msg('Staff', 'कर्मचारी')),
                  ('beneficiary', Msg('Beneficiary', 'लाभार्थी')),
                ])
                  ChoiceChip(
                    selected: _role == r.$1,
                    onSelected: (_) => setState(() => _role = r.$1),
                    label: Text(both(s.lang, r.$2.en, r.$2.hi)),
                  ),
              ]),
              const SizedBox(height: 16),
              DropdownButtonFormField<String?>(
                initialValue: _inst,
                isExpanded: true,
                decoration: fieldDecoration(context, label: tx(context, 'Institute', 'संस्थान'), icon: Icons.apartment_rounded),
                items: [
                  DropdownMenuItem<String?>(value: null, child: Text(tx(context, 'Random institute (recommended)', 'रैंडम संस्थान (सुझाया गया)'))),
                  for (final i in instOptions) DropdownMenuItem<String?>(value: i.id, child: Text(i.name, overflow: TextOverflow.ellipsis)),
                ],
                onChanged: (v) => setState(() => _inst = v),
              ),
              const SizedBox(height: 14),
              ShineButton(
                label: _drawing ? tx(context, 'Drawing…', 'चुना जा रहा है…') : both(s.lang, 'Draw & connect', 'चुनें और जोड़ें'),
                icon: Icons.casino_rounded,
                onPressed: _drawing ? null : _draw,
              ),
            ],
          ),
        ),
        if (_drawing) ...[
          const SizedBox(height: 16),
          const Panel(child: Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator()))),
        ],
        if (_picked != null && _pickedInst != null) ...[
          const SizedBox(height: 16),
          Panel(
            tint: kSand,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: kSand.withValues(alpha: 0.25),
                    child: Icon(
                      _picked!.role == 'beneficiary' ? Icons.person_rounded : (_picked!.role == 'incharge' ? Icons.badge_rounded : Icons.engineering_rounded),
                      color: kSand,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_picked!.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                        Text('${VcParticipant.roleLabel(_picked!.role).of(s.lang)} · ${_picked!.phoneMasked}',
                            style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                        Text(_pickedInst!.name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
                Text('Draw seal: ${shortHash(_commit)}', style: TextStyle(fontSize: 11.5, fontFamily: 'monospace', color: cs.onSurfaceVariant)),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(
                    child: ShineButton(
                      label: tx(context, 'Start video call', 'वीडियो कॉल शुरू करें'),
                      icon: Icons.videocam_rounded,
                      onPressed: _start,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filledTonal(
                    tooltip: tx(context, 'Draw again', 'फिर से चुनें'),
                    onPressed: _drawing ? null : _draw,
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ]),
              ],
            ),
          ),
        ],
        if (_active != null) ...[
          const SizedBox(height: 16),
          Panel(
            tint: kBlue,
            child: Row(children: [
              const PulseDot(color: kBlue),
              const SizedBox(width: 8),
              Expanded(
                child: Bi('Call in progress — record the outcome when you finish.', 'कॉल जारी है — समाप्त होने पर परिणाम दर्ज करें।',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              FilledButton(onPressed: () => _record(_active!), child: Text(tx(context, 'Record', 'दर्ज करें'))),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        const SectionTitle('Call log', 'कॉल लॉग', icon: Icons.history_rounded),
        if (calls.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [
            ChoiceChip(
              selected: _logOutcome == 'all',
              onSelected: (_) => setState(() => _logOutcome = 'all'),
              label: Text('${both(s.lang, 'All', 'सभी')} (${calls.length})'),
            ),
            ChoiceChip(
              selected: _logOutcome == 'connected',
              onSelected: (_) => setState(() => _logOutcome = 'connected'),
              label: Text('${both(s.lang, 'Connected', 'जुड़ी')} (${calls.where((c) => c.outcome == 'connected').length})'),
            ),
            ChoiceChip(
              selected: _logOutcome == 'flagged',
              onSelected: (_) => setState(() => _logOutcome = 'flagged'),
              label: Text('${both(s.lang, 'Flagged', 'चिह्नित')} (${calls.where((c) => c.outcome != 'connected' && c.outcome != 'pending').length})'),
            ),
          ]),
          const SizedBox(height: 8),
        ],
        Builder(builder: (context) {
          final logShown = calls.where((c) {
            if (_logOutcome == 'connected') return c.outcome == 'connected';
            if (_logOutcome == 'flagged') return c.outcome != 'connected' && c.outcome != 'pending';
            return true;
          }).toList();
          if (calls.isEmpty) {
            return const EmptyState(icon: Icons.video_call_outlined, title: Msg('No calls yet', 'अभी कोई कॉल नहीं'));
          }
          if (logShown.isEmpty) {
            return EmptyState(
              icon: Icons.filter_list_off_rounded,
              title: const Msg('No calls match this filter', 'इस फ़िल्टर से कोई कॉल नहीं मिली'),
              action: TextButton(
                onPressed: () => setState(() => _logOutcome = 'all'),
                child: Text(tx(context, 'Clear filter', 'फ़िल्टर हटाएँ')),
              ),
            );
          }
          return Panel(
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
            child: Column(children: [
              for (var i = 0; i < logShown.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                _VcCallTile(call: logShown[i], onTap: () => _record(logShown[i])),
              ],
            ]),
          );
        }),
      ],
    );
  }
}

class _VcCallTile extends StatelessWidget {
  const _VcCallTile({required this.call, required this.onTap});
  final VcCall call;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final c = call;
    final color = VcCall.outcomeColor(c.outcome);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
              child: Icon(c.outcome == 'connected' ? Icons.videocam_rounded : Icons.phone_missed_rounded, size: 19, color: color),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${c.participantName} · ${VcParticipant.roleLabel(c.participantRole).of(s.lang)}',
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  Text(c.instituteName, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                  if (c.notes.isNotEmpty)
                    Text(c.notes, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                  const SizedBox(height: 4),
                  Wrap(spacing: 10, children: [
                    if (c.identityOk != null)
                      _Check(ok: c.identityOk!, label: tx(context, 'Identity', 'पहचान')),
                    if (c.premisesShown != null)
                      _Check(ok: c.premisesShown!, label: tx(context, 'Premises', 'परिसर')),
                    if (c.headcount != null)
                      Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.groups_rounded, size: 14),
                        const SizedBox(width: 3),
                        Text('${c.headcount}', style: const TextStyle(fontSize: 12)),
                      ]),
                  ]),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(timeAgo(c.startedAt).of(s.lang), style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
              const SizedBox(height: 4),
              Text(VcCall.outcomeLabel(c.outcome).of(s.lang), style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
            ]),
          ],
        ),
      ),
    );
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.ok, required this.label});
  final bool ok;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded, size: 14, color: ok ? kGreen : kRed),
      const SizedBox(width: 3),
      Text(label, style: const TextStyle(fontSize: 12)),
    ]);
  }
}

Future<void> showVcOutcomeSheet(BuildContext context, VcCall call) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => _VcOutcomeSheet(call: call),
  );
}

class _VcOutcomeSheet extends StatefulWidget {
  const _VcOutcomeSheet({required this.call});
  final VcCall call;

  @override
  State<_VcOutcomeSheet> createState() => _VcOutcomeSheetState();
}

class _VcOutcomeSheetState extends State<_VcOutcomeSheet> {
  late String _outcome = widget.call.outcome == 'pending' ? 'connected' : widget.call.outcome;
  late bool _identity = widget.call.identityOk ?? true;
  late bool _premises = widget.call.premisesShown ?? true;
  late final TextEditingController _head = TextEditingController(text: widget.call.headcount?.toString() ?? '');
  late final TextEditingController _notes = TextEditingController(text: widget.call.notes);
  bool _saving = false;

  @override
  void dispose() {
    _head.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final s = AppScope.read(context);
    setState(() => _saving = true);
    final c = widget.call;
    final wasPending = c.outcome == 'pending';
    c.outcome = _outcome;
    c.identityOk = _outcome == 'connected' ? _identity : null;
    c.premisesShown = _outcome == 'connected' ? _premises : null;
    c.headcount = _outcome == 'connected' ? int.tryParse(_head.text.trim()) : null;
    c.notes = _notes.text.trim();
    await s.saveVcCall(c);
    if (wasPending && (_outcome != 'connected' || !_identity)) {
      s.raiseLocalAlert(
        instituteId: c.instituteId,
        type: 'vc_miss',
        detail: _outcome == 'no_answer'
            ? 'Random verification call to ${c.participantName} went unanswered.'
            : (_outcome == 'wrong_person'
                ? 'Random verification call answered by someone other than ${c.participantName}.'
                : 'Identity of ${c.participantName} could not be verified on the call.'),
      );
    }
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final c = widget.call;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Bi('Call outcome', 'कॉल का परिणाम', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('${c.participantName} · ${c.instituteName}', style: TextStyle(color: cs.onSurfaceVariant)),
            const SizedBox(height: 14),
            SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: 'connected', label: Text(tx(context, 'Connected', 'जुड़ा'))),
                ButtonSegment(value: 'no_answer', label: Text(tx(context, 'No answer', 'उत्तर नहीं'))),
                ButtonSegment(value: 'wrong_person', label: Text(tx(context, 'Wrong person', 'ग़लत व्यक्ति'))),
              ],
              selected: {_outcome},
              onSelectionChanged: (v) => setState(() => _outcome = v.first),
            ),
            if (_outcome == 'connected') ...[
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _identity,
                onChanged: (v) => setState(() => _identity = v),
                title: Bi('Identity matched the register', 'पहचान रजिस्टर से मेल खाई', style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _premises,
                onChanged: (v) => setState(() => _premises = v),
                title: Bi('Premises shown on camera', 'कैमरे पर परिसर दिखाया', style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              TextField(
                controller: _head,
                keyboardType: TextInputType.number,
                decoration: fieldDecoration(context, label: tx(context, 'People seen on the call', 'कॉल पर दिखे लोग'), icon: Icons.groups_rounded),
              ),
            ] else ...[
              const SizedBox(height: 16),
              Panel(
                tint: kAmber,
                padding: const EdgeInsets.all(12),
                child: Bi('A "missed verification call" alert will be raised for this institute.',
                    'इस संस्थान के लिए "छूटी सत्यापन कॉल" अलर्ट दर्ज होगा।',
                    style: const TextStyle(fontSize: 13)),
              ),
            ],
            const SizedBox(height: 16),
            TextField(
              controller: _notes,
              minLines: 2,
              maxLines: 5,
              decoration: fieldDecoration(context, label: tx(context, 'Notes', 'टिप्पणी')),
            ),
            const SizedBox(height: 16),
            ShineButton(
              label: both(s.lang, 'Save outcome', 'परिणाम सहेजें'),
              icon: Icons.save_rounded,
              onPressed: _saving ? null : _save,
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// §17 RANDOM ASSIGNMENT OF INSPECTION DUTIES (AI / automation)
// ============================================================================

class AssignScreen extends StatelessWidget {
  const AssignScreen({super.key, this.instituteId});
  final String? instituteId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Random assignment', 'रैंडम आवंटन'), actions: const [DemoBadge()]),
      body: AssignTab(instituteId: instituteId),
    );
  }
}

class AssignTab extends StatefulWidget {
  const AssignTab({super.key, this.instituteId});
  final String? instituteId;

  @override
  State<AssignTab> createState() => _AssignTabState();
}

class _AssignTabState extends State<AssignTab> {
  bool _risk = true;
  int _count = 1;
  String? _only;
  DrawResult? _proposal;
  bool _drawing = false;
  bool _saving = false;
  bool _saved = false;
  String _flicker = '';
  Timer? _shuffle;

  @override
  void initState() {
    super.initState();
    _only = widget.instituteId;
  }

  @override
  void dispose() {
    _shuffle?.cancel();
    super.dispose();
  }

  void _run() {
    final s = AppScope.read(context);
    final rows = s.riskRows();
    if (rows.isEmpty || s.drawInspectors.isEmpty) {
      snack(context, 'No institutes or inspectors available for a draw yet.', 'ड्रॉ के लिए अभी संस्थान या निरीक्षक उपलब्ध नहीं।', error: true);
      return;
    }
    setState(() {
      _drawing = true;
      _proposal = null;
      _saved = false;
    });
    final r = math.Random();
    var ticks = 0;
    _shuffle?.cancel();
    _shuffle = Timer.periodic(const Duration(milliseconds: 90), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      ticks++;
      setState(() => _flicker = rows[r.nextInt(rows.length)].inst.name);
      if (ticks >= 16) {
        t.cancel();
        setState(() {
          _drawing = false;
          _proposal = s.proposeDraw(riskWeighted: _risk, count: _only == null ? _count : 1, onlyInstituteIds: _only == null ? null : [_only!]);
        });
      }
    });
  }

  void _verify() {
    final s = AppScope.read(context);
    final p = _proposal;
    if (p == null) return;
    final commitOk = SeededRandom.commitmentOf(p.seed) == p.commitment;
    var rows = s.riskRows();
    if (_only != null) rows = rows.where((r) => r.inst.id == _only).toList();
    final insp = p.picks.isEmpty ? <InspectorInfo>[] : s.drawInspectors;
    final again = runDraw(
      rows: rows,
      inspectors: insp.map((i) {
        final load = s.assignments.where((a) => a.inspectorId == i.id && !AStatus.isDone(a.status)).length;
        return InspectorInfo(id: i.id, name: i.name, designation: i.designation, district: i.district, state: i.state, status: i.status, lastInstituteIds: i.lastInstituteIds, load: load);
      }).toList(),
      riskWeighted: p.strategy == 'risk',
      count: p.picks.length,
      byName: p.byName,
      seed: p.seed,
    );
    final same = again.picks.length == p.picks.length &&
        List.generate(p.picks.length, (i) => again.picks[i].inst.id == p.picks[i].inst.id).every((x) => x);
    if (commitOk && same) {
      snack(context, 'Verified: the seed matches its SHA-256 seal and re-running gives the same result.',
          'सत्यापित: सीड अपनी SHA-256 मुहर से मेल खाता है और दोबारा चलाने पर वही परिणाम आता है।');
    } else {
      snack(context, 'Data changed since the draw (new alerts or visits) — run a fresh draw.', 'ड्रॉ के बाद डेटा बदला — नया ड्रॉ चलाएँ।', error: true);
    }
  }

  Future<void> _confirm() async {
    final s = AppScope.read(context);
    final p = _proposal;
    if (p == null) return;
    final ok = await confirmDialog(
      context,
      title: const Msg('Assign these surprise inspections?', 'ये अचानक निरीक्षण सौंपें?'),
      body: Msg('${p.picks.length} inspection(s) go to the chosen inspectors now. Institutes are not told before the dispatch time.',
          '${p.picks.length} निरीक्षण अभी चुने गए निरीक्षकों को जाएँगे। संस्थानों को भेजने के समय से पहले नहीं बताया जाएगा।'),
      confirm: const Msg('Assign', 'सौंपें'),
    );
    if (!ok || !mounted) return;
    setState(() => _saving = true);
    final err = await s.confirmDraw(p);
    if (!mounted) return;
    setState(() {
      _saving = false;
      _saved = err == null;
    });
    if (err != null) {
      snack(context, err.en, err.hi, error: true);
    } else {
      snack(context, 'Assigned. Inspectors see it in their Visits list.', 'सौंप दिया गया। निरीक्षक इसे अपनी दौरा सूची में देखेंगे।');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final rows = s.riskRows();
    final onlyInst = _only == null ? null : s.instituteById(_only!);
    final p = _proposal;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
      children: [
        Panel(
          tint: kSage,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle('How the draw works', 'ड्रॉ कैसे होता है', icon: Icons.casino_rounded),
              Bi('Risk-weighted draw: compliance 35%, open alerts 25%, time since last inspection 20%, anomalies 20%. Every institute keeps a chance, so no one can predict a visit.',
                  'जोखिम-आधारित ड्रॉ: अनुपालन 35%, खुले अलर्ट 25%, पिछले निरीक्षण से समय 20%, विसंगतियाँ 20%। हर संस्थान की संभावना रहती है, ताकि कोई दौरे का अनुमान न लगा सके।',
                  style: const TextStyle(fontSize: 13)),
              const SizedBox(height: 6),
              Bi('Inspector rules: same state, never the last inspector of that institute, avoids their home district, lighter workload first.',
                  'निरीक्षक नियम: वही राज्य, उस संस्थान का पिछला निरीक्षक कभी नहीं, गृह ज़िला नहीं, कम काम वाले पहले।',
                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: true, icon: const Icon(Icons.leaderboard_rounded, size: 18), label: Text(tx(context, 'Risk weighted', 'जोखिम भारित'))),
                  ButtonSegment(value: false, icon: const Icon(Icons.shuffle_rounded, size: 18), label: Text(tx(context, 'Uniform', 'समान'))),
                ],
                selected: {_risk},
                onSelectionChanged: (v) => setState(() => _risk = v.first),
              ),
              const SizedBox(height: 16),
              if (onlyInst != null)
                Row(children: [
                  Expanded(
                    child: Chip(
                      avatar: const Icon(Icons.apartment_rounded, size: 18),
                      label: Text(onlyInst.name, overflow: TextOverflow.ellipsis),
                      onDeleted: () => setState(() => _only = null),
                    ),
                  ),
                ])
              else
                Row(children: [
                  Expanded(child: Bi('Inspections to draw', 'कितने निरीक्षण', style: const TextStyle(fontWeight: FontWeight.w600))),
                  IconButton.outlined(
                    onPressed: _count > 1 ? () => setState(() => _count--) : null,
                    icon: const Icon(Icons.remove_rounded),
                  ),
                  SizedBox(width: 36, child: Text('$_count', textAlign: TextAlign.center, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                  IconButton.outlined(
                    onPressed: _count < 5 ? () => setState(() => _count++) : null,
                    icon: const Icon(Icons.add_rounded),
                  ),
                ]),
              const SizedBox(height: 14),
              ShineButton(
                label: _drawing ? tx(context, 'Drawing…', 'ड्रॉ हो रहा है…') : both(s.lang, 'Run the draw', 'ड्रॉ चलाएँ'),
                icon: Icons.casino_rounded,
                onPressed: _drawing ? null : _run,
              ),
            ],
          ),
        ),
        if (_drawing) ...[
          const SizedBox(height: 16),
          Panel(
            tint: kSand,
            child: Row(children: [
              const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4)),
              const SizedBox(width: 12),
              Expanded(child: Text(_flicker, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
            ]),
          ),
        ],
        if (p != null) ...[
          const SizedBox(height: 16),
          Panel(
            tint: _saved ? kGreen : kSand,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionTitle(_saved ? 'Assigned' : 'Draw result', _saved ? 'सौंप दिया गया' : 'ड्रॉ परिणाम',
                    icon: _saved ? Icons.verified_rounded : Icons.casino_rounded),
                for (final pick in p.picks)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(pick.inst.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                        const SizedBox(height: 2),
                        Text(
                          s.lang == LangMode.hi
                              ? 'निरीक्षक: ${pick.inspector.name} (${pick.inspector.district}) · संभावना ${(pick.probability * 100).toStringAsFixed(1)}%'
                              : 'Inspector: ${pick.inspector.name} (${pick.inspector.district}) · chance ${(pick.probability * 100).toStringAsFixed(1)}%',
                          style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                        ),
                        Text(
                          s.lang == LangMode.hi
                              ? 'भेजने का समय: ${fmtDue(pick.dispatchAt).hi} — संस्थान को सूचना नहीं'
                              : 'Dispatch: ${fmtDue(pick.dispatchAt).en} — institute not informed',
                          style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                const Divider(),
                Text('Seal (SHA-256 of seed): ${shortHash(p.commitment)}', style: const TextStyle(fontSize: 11.5, fontFamily: 'monospace')),
                Text('Seed: ${shortHash(p.seed)}', style: TextStyle(fontSize: 11.5, fontFamily: 'monospace', color: cs.onSurfaceVariant)),
                const SizedBox(height: 10),
                Row(children: [
                  OutlinedButton.icon(
                    onPressed: _verify,
                    icon: const Icon(Icons.fact_check_outlined, size: 18),
                    label: Text(tx(context, 'Verify', 'सत्यापित करें')),
                  ),
                  const SizedBox(width: 10),
                  if (!_saved)
                    Expanded(
                      child: ShineButton(
                        height: 46,
                        label: _saving ? tx(context, 'Assigning…', 'सौंपा जा रहा है…') : tx(context, 'Confirm & assign', 'पुष्टि करें और सौंपें'),
                        icon: Icons.send_rounded,
                        onPressed: _saving ? null : _confirm,
                      ),
                    ),
                ]),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle('Risk ranking', 'जोखिम क्रम', icon: Icons.leaderboard_rounded),
              for (final r in rows.take(10))
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Expanded(child: Text(r.inst.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
                        Text('${(r.score * 100).round()}', style: const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                      const SizedBox(height: 5),
                      RiskStack(row: r),
                    ],
                  ),
                ),
              Wrap(spacing: 12, runSpacing: 2, children: [
                LegendDot(color: RiskStack.factorColors[0], label: tx(context, 'Compliance', 'अनुपालन')),
                LegendDot(color: RiskStack.factorColors[1], label: tx(context, 'Alerts', 'अलर्ट')),
                LegendDot(color: RiskStack.factorColors[2], label: tx(context, 'Time since visit', 'पिछला दौरा')),
                LegendDot(color: RiskStack.factorColors[3], label: tx(context, 'Anomalies', 'विसंगति')),
              ]),
            ],
          ),
        ),
        if (s.draws.isNotEmpty) ...[
          const SizedBox(height: 16),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SectionTitle('Draw ledger (this session)', 'ड्रॉ रिकॉर्ड (इस सत्र)', icon: Icons.receipt_long_outlined),
                for (final d in s.draws)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      '${fmtTime(d.at)} · ${d.picks.map((x) => x.inst.name.split(',').first).join(', ')} · ${shortHash(d.commitment)}',
                      style: const TextStyle(fontSize: 12.5),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ============================================================================
// §18 AI INSIGHTS — attendance & anomaly analytics
// ============================================================================

class InsightsScreen extends StatelessWidget {
  const InsightsScreen({super.key, this.instituteId});
  final String? instituteId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Smart insights', 'स्मार्ट विश्लेषण'), actions: const [DemoBadge()]),
      body: InsightsTab(instituteId: instituteId),
    );
  }
}

class InsightsTab extends StatefulWidget {
  const InsightsTab({super.key, this.instituteId});
  final String? instituteId;

  @override
  State<InsightsTab> createState() => _InsightsTabState();
}

class _InsightsTabState extends State<InsightsTab> {
  String? _inst;
  String? _findingsSeverity; // null = all, else 'red' | 'yellow'

  @override
  void initState() {
    super.initState();
    _inst = widget.instituteId;
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final insts = s.scopedInstitutes;
    if (insts.isEmpty) {
      return const Center(child: EmptyState(icon: Icons.insights_outlined, title: Msg('No institutes in your scope', 'आपके क्षेत्र में कोई संस्थान नहीं')));
    }
    final all = s.allAnomalies;
    // default: the institute with the most serious findings
    var selId = _inst;
    if (selId == null || !insts.any((i) => i.id == selId)) {
      selId = all.isNotEmpty ? all.first.instituteId : insts.first.id;
      if (!insts.any((i) => i.id == selId)) selId = insts.first.id;
    }
    final inst = insts.firstWhere((i) => i.id == selId);
    final days = s.attendanceCache[inst.id];
    if (days == null) {
      s.attendanceFor(inst.id).then((_) {
        if (mounted) setState(() {});
      });
    }
    final found = days == null ? <Anomaly>[] : detectAnomalies(inst, days);
    final flags = {for (final a in found) if (a.day != null && a.kind == 'spike') dayKey(a.day!)}..addAll(
        days == null ? const <String>{} : {for (final d in days) if (d.present > d.enrolled && d.enrolled > 0) dayKey(d.day)});
    final redN = all.where((a) => a.severity == 'red').length;
    final proxy = all.where((a) => a.kind == 'flatline' || a.kind == 'above_enrolment' || a.kind == 'staff_flat').length;
    var present = 0;
    var enrolled = 0;
    var staffP = 0;
    var staffT = 0;
    for (final i in insts) {
      final d = s.attendanceCache[i.id];
      if (d != null && d.isNotEmpty) {
        present += d.last.present;
        enrolled += d.last.enrolled;
        staffP += d.last.staffPresent;
        staffT += d.last.staffTotal;
      }
    }
    final official = s.user?.isOfficial ?? false;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
      children: [
        TileGrid(children: [
          QuickTile(icon: Icons.insights_rounded, color: kRed, value: '${all.length}', label: const Msg('Anomaly flags', 'विसंगति संकेत'), sub: Msg('$redN high severity', '$redN उच्च गंभीरता')),
          QuickTile(icon: Icons.person_off_outlined, color: kSand, value: '$proxy', label: const Msg('Proxy suspicions', 'प्रॉक्सी संदेह')),
          QuickTile(
            icon: Icons.groups_rounded,
            color: kBlue,
            value: enrolled == 0 ? '—' : '${(present / enrolled * 100).round()}%',
            label: const Msg('Residents present', 'निवासी उपस्थित'),
            sub: Msg('$present / $enrolled today', 'आज $present / $enrolled'),
          ),
          QuickTile(
            icon: Icons.badge_outlined,
            color: kGreen,
            value: staffT == 0 ? '—' : '${(staffP / staffT * 100).round()}%',
            label: const Msg('Staff present', 'कर्मचारी उपस्थित'),
            sub: Msg('$staffP / $staffT today', 'आज $staffP / $staffT'),
          ),
        ]),
        const SizedBox(height: 16),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle('Attendance — last 30 days', 'उपस्थिति — पिछले 30 दिन', icon: Icons.show_chart_rounded),
              DropdownButtonFormField<String>(
                key: ValueKey(inst.id),
                initialValue: inst.id,
                isExpanded: true,
                decoration: fieldDecoration(context, label: tx(context, 'Institute', 'संस्थान'), icon: Icons.apartment_rounded),
                items: [for (final i in insts) DropdownMenuItem(value: i.id, child: Text(i.name, overflow: TextOverflow.ellipsis))],
                onChanged: (v) => setState(() => _inst = v),
              ),
              const SizedBox(height: 14),
              if (days == null)
                const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()))
              else ...[
                AttendanceChart(days: days, flags: flags),
                const SizedBox(height: 8),
                Wrap(spacing: 14, runSpacing: 2, children: [
                  LegendDot(color: Theme.of(context).brightness == Brightness.dark ? const Color(0xFFA9C5A6) : kForest, label: tx(context, 'Present', 'उपस्थित')),
                  LegendDot(color: kSand, label: tx(context, 'Enrolled', 'नामांकित'), dashed: true),
                  LegendDot(color: kSage.withValues(alpha: 0.5), label: tx(context, 'Expected range', 'अपेक्षित सीमा')),
                  LegendDot(color: kRed, label: tx(context, 'Anomaly flag', 'विसंगति संकेत')),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: _MiniStat(
                      en: 'Today',
                      hi: 'आज',
                      value: '${days.last.present}/${days.last.enrolled}',
                    ),
                  ),
                  Expanded(
                    child: _MiniStat(
                      en: 'Staff today',
                      hi: 'आज स्टाफ़',
                      value: '${days.last.staffPresent}/${days.last.staffTotal}',
                    ),
                  ),
                  Expanded(
                    child: _MiniStat(
                      en: 'CCTV uptime',
                      hi: 'सीसीटीवी अपटाइम',
                      value: '${(days.last.cameraUptime * 100).round()}%',
                    ),
                  ),
                ]),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SectionTitle('Detailed findings', 'विस्तृत निष्कर्ष',
                  icon: Icons.fact_check_outlined,
                  trailing: Text('${found.length}', style: TextStyle(color: cs.onSurfaceVariant, fontWeight: FontWeight.w700))),
              if (found.isNotEmpty) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  ChoiceChip(
                    selected: _findingsSeverity == null,
                    onSelected: (_) => setState(() => _findingsSeverity = null),
                    label: Text(both(s.lang, 'All', 'सभी')),
                  ),
                  ChoiceChip(
                    selected: _findingsSeverity == 'red',
                    onSelected: (_) => setState(() => _findingsSeverity = 'red'),
                    avatar: const Icon(Icons.circle, size: 10, color: kRed),
                    label: Text(both(s.lang, 'Critical', 'गंभीर')),
                  ),
                  ChoiceChip(
                    selected: _findingsSeverity == 'yellow',
                    onSelected: (_) => setState(() => _findingsSeverity = 'yellow'),
                    avatar: const Icon(Icons.circle, size: 10, color: kAmber),
                    label: Text(both(s.lang, 'Warning', 'चेतावनी')),
                  ),
                ]),
                const SizedBox(height: 10),
              ],
              if (days != null && found.isEmpty)
                Bi('Nothing unusual in the last 30 days.', 'पिछले 30 दिनों में कुछ असामान्य नहीं।', style: TextStyle(color: cs.onSurfaceVariant)),
              if (found.isNotEmpty && found.where((a) => _findingsSeverity == null || a.severity == _findingsSeverity).isEmpty)
                Bi('No findings match this filter.', 'इस फ़िल्टर से कोई निष्कर्ष नहीं मिला।', style: TextStyle(color: cs.onSurfaceVariant)),
              for (final a in found.where((a) => _findingsSeverity == null || a.severity == _findingsSeverity))
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: severityColor(a.severity).withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: severityColor(a.severity).withValues(alpha: 0.35)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Icon(a.severity == 'red' ? Icons.error_rounded : Icons.warning_amber_rounded, size: 18, color: severityColor(a.severity)),
                        const SizedBox(width: 8),
                        Expanded(child: Text(a.title.of(s.lang), style: const TextStyle(fontWeight: FontWeight.w700))),
                      ]),
                      const SizedBox(height: 6),
                      Text(a.detail.of(s.lang), style: const TextStyle(fontSize: 13, height: 1.4)),
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, runSpacing: 6, children: [
                        if (official)
                          OutlinedButton.icon(
                            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AssignScreen(instituteId: inst.id))),
                            icon: const Icon(Icons.casino_rounded, size: 16),
                            label: Text(tx(context, 'Surprise inspection', 'अचानक निरीक्षण')),
                          ),
                        OutlinedButton.icon(
                          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => VcScreen(instituteId: inst.id))),
                          icon: const Icon(Icons.video_call_rounded, size: 16),
                          label: Text(tx(context, 'Verify by VC', 'वीसी से जाँचें')),
                        ),
                      ]),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionTitle('All institutes', 'सभी संस्थान', icon: Icons.table_rows_outlined),
              for (final i in insts) _InstituteInsightRow(inst: i, selected: i.id == inst.id, onTap: () => setState(() => _inst = i.id)),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Text(
          tx(context, 'Server: statistical outlier check on each institute\'s 60-day history. On the phone: baseline z-score, flat-line, enrolment and CCTV cross-checks you can read line by line.',
              'सर्वर: हर संस्थान के 60 दिन के इतिहास पर आइसोलेशन फ़ॉरेस्ट। फ़ोन पर: औसत से z-स्कोर, सपाट रेखा, नामांकन और सीसीटीवी की जाँच जो पंक्ति-दर-पंक्ति पढ़ी जा सकती है।'),
          style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.en, required this.hi, required this.value});
  final String en;
  final String hi;
  final String value;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        Bi(en, hi, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
      ],
    );
  }
}

class _InstituteInsightRow extends StatelessWidget {
  const _InstituteInsightRow({required this.inst, required this.selected, required this.onTap});
  final Institute inst;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final days = s.attendanceCache[inst.id];
    final flags = days == null ? 0 : detectAnomalies(inst, days).length;
    String att = '—';
    if (days != null && days.length >= 7) {
      final last7 = days.sublist(days.length - 7);
      final p = last7.fold<int>(0, (a, b) => a + b.present);
      final e = last7.fold<int>(0, (a, b) => a + b.enrolled);
      if (e > 0) att = '${(p / e * 100).round()}%';
    }
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: selected ? kSage.withValues(alpha: 0.14) : null,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: inst.status == 'red' ? kRed : (inst.status == 'yellow' ? kAmber : kGreen),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(inst.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                  Text(
                    s.lang == LangMode.hi ? '7 दिन उपस्थिति $att · ${inst.district}' : '7-day attendance $att · ${inst.district}',
                    style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            if (flags > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: kRed.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(99)),
                child: Text('$flags', style: const TextStyle(color: kRed, fontWeight: FontWeight.w800, fontSize: 12)),
              ),
          ],
        ),
      ),
    );
  }
}

// ============================================================================
// §19 PROFILE SCREEN, TOUR, PDF REPORT
// ============================================================================

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Profile & settings', 'प्रोफ़ाइल और सेटिंग')),
      body: const ProfileTab(),
    );
  }
}

class _TourSlide {
  const _TourSlide(this.icon, this.title, this.body);
  final IconData icon;
  final Msg title;
  final Msg body;
}

Future<void> showTour(BuildContext context) {
  final s = AppScope.read(context);
  final official = s.user?.isOfficial ?? false;
  final slides = official
      ? const [
          _TourSlide(Icons.space_dashboard_rounded, Msg('Live monitoring', 'लाइव निगरानी'),
              Msg('Institutes, alerts, cameras and attendance for your area update on their own. The LIVE strip shows what just happened.',
                  'आपके क्षेत्र के संस्थान, अलर्ट, कैमरे और उपस्थिति अपने आप अपडेट होते हैं। लाइव पट्टी बताती है कि अभी क्या हुआ।')),
          _TourSlide(Icons.videocam_rounded, Msg('Live CCTV', 'लाइव सीसीटीवी'),
              Msg('Watch any feed. Frozen or offline cameras are flagged automatically. Seal a snapshot as evidence with its SHA-256.',
                  'कोई भी फ़ीड देखें। रुके या बंद कैमरे अपने आप चिह्नित होते हैं। स्नैपशॉट को SHA-256 के साथ साक्ष्य बनाएँ।')),
          _TourSlide(Icons.video_call_rounded, Msg('Random VC', 'रैंडम वीसी'),
              Msg('The app picks an in-charge, staff member or beneficiary at random and opens a video call. Missed calls raise an alert.',
                  'ऐप प्रभारी, कर्मचारी या लाभार्थी को रैंडम चुनकर वीडियो कॉल खोलता है। छूटी कॉल पर अलर्ट बनता है।')),
          _TourSlide(Icons.casino_rounded, Msg('Random assignment', 'रैंडम आवंटन'),
              Msg('A risk-weighted draw picks institutes and inspectors. The seed is sealed with SHA-256, so anyone can verify it was fair.',
                  'जोखिम-आधारित ड्रॉ संस्थान और निरीक्षक चुनता है। सीड SHA-256 से मुहरबंद है, ताकि कोई भी निष्पक्षता जाँच सके।')),
          _TourSlide(Icons.insights_rounded, Msg('Smart insights', 'स्मार्ट विश्लेषण'),
              Msg('Attendance spikes, flat-line registers and "present while cameras were off" are caught and explained.',
                  'उपस्थिति में उछाल, सपाट रजिस्टर और "कैमरे बंद पर उपस्थिति" पकड़े और समझाए जाते हैं।')),
        ]
      : const [
          _TourSlide(Icons.map_rounded, Msg('Your visits', 'आपके दौरे'),
              Msg('Assignments from the random draw appear here. "Surprise" means the institute has not been told.',
                  'रैंडम ड्रॉ से मिले कार्य यहाँ दिखते हैं। "अचानक" का अर्थ है संस्थान को सूचना नहीं दी गई।')),
          _TourSlide(Icons.photo_camera_rounded, Msg('Geo-tagged evidence', 'जियो-टैग साक्ष्य'),
              Msg('Every photo and video gets GPS, time and a SHA-256 seal on your phone. The server checks it again.',
                  'हर फ़ोटो और वीडियो पर फ़ोन में ही GPS, समय और SHA-256 मुहर लगती है। सर्वर दोबारा जाँचता है।')),
          _TourSlide(Icons.videocam_rounded, Msg('CCTV & VC', 'सीसीटीवी और वीसी'),
              Msg('Check an institute\'s cameras before you go, or do a surprise video call with someone picked at random.',
                  'जाने से पहले संस्थान के कैमरे देखें, या रैंडम चुने व्यक्ति से अचानक वीडियो कॉल करें।')),
          _TourSlide(Icons.description_rounded, Msg('Reports', 'रिपोर्ट'),
              Msg('After submitting, download a geo-tagged PDF report with photos, GPS and hashes.',
                  'जमा करने के बाद फ़ोटो, GPS और हैश के साथ जियो-टैग पीडीएफ़ रिपोर्ट डाउनलोड करें।')),
        ];
  return showDialog<void>(
    context: context,
    builder: (_) => _TourDialog(slides: slides),
  );
}

class _TourDialog extends StatefulWidget {
  const _TourDialog({required this.slides});
  final List<_TourSlide> slides;

  @override
  State<_TourDialog> createState() => _TourDialogState();
}

class _TourDialogState extends State<_TourDialog> {
  int _i = 0;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final sl = widget.slides[_i];
    final last = _i == widget.slides.length - 1;
    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      child: Panel(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(colors: [kSage, kForest], begin: Alignment.topLeft, end: Alignment.bottomRight),
                boxShadow: [BoxShadow(color: kSage.withValues(alpha: 0.4), blurRadius: 16, offset: const Offset(0, 6))],
              ),
              child: Icon(sl.icon, color: Colors.white, size: 30),
            ),
            const SizedBox(height: 16),
            Bi(sl.title.en, sl.title.hi, center: true, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Bi(sl.body.en, sl.body.hi, center: true, style: TextStyle(fontSize: 14, height: 1.45, color: cs.onSurfaceVariant)),
            const SizedBox(height: 18),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var k = 0; k < widget.slides.length; k++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: k == _i ? 18 : 7,
                  height: 7,
                  decoration: BoxDecoration(color: k == _i ? kSage : cs.onSurface.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(99)),
                ),
            ]),
            const SizedBox(height: 14),
            Row(children: [
              TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(tx(context, 'Skip', 'छोड़ें'))),
              const Spacer(),
              FilledButton(
                onPressed: () => last ? Navigator.of(context).pop() : setState(() => _i++),
                child: Text(last ? tx(context, 'Start', 'शुरू करें') : tx(context, 'Next', 'आगे')),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

String _pdfSafe(String s) {
  final b = StringBuffer();
  for (final r in s.runes) {
    if (r == 0x2014 || r == 0x2013) {
      b.write('-');
    } else if (r == 0x2026) {
      b.write('...');
    } else if (r == 0x2018 || r == 0x2019) {
      b.write("'");
    } else if (r == 0x201C || r == 0x201D) {
      b.write('"');
    } else if (r < 256) {
      b.writeCharCode(r);
    } else {
      b.write('?');
    }
  }
  return b.toString();
}

/// Geo-tagged PDF report. Photos are included when their bytes are still in
/// memory (right after submitting); later reports list the hashes only.
Future<void> shareReportPdf(BuildContext context, Submission sub, {List<Evidence> photos = const []}) async {
  final s = AppScope.read(context);
  final inspector = s.user?.name ?? '';
  final doc = pw.Document(title: 'Nayan inspection report', author: _pdfSafe(inspector));
  const forest = PdfColor(0.247, 0.353, 0.271);
  const beige = PdfColor(0.953, 0.925, 0.867);
  pw.Widget kv(String k, String v) => pw.Padding(
        padding: const pw.EdgeInsets.symmetric(vertical: 2),
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.SizedBox(width: 110, child: pw.Text(k, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700))),
          pw.Expanded(child: pw.Text(_pdfSafe(v), style: const pw.TextStyle(fontSize: 10))),
        ]),
      );
  final images = <pw.Widget>[];
  for (final e in photos.where((x) => x.kind == EvKind.photo).take(8)) {
    images.add(pw.Container(
      width: 160,
      margin: const pw.EdgeInsets.only(right: 8, bottom: 8),
      child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Image(pw.MemoryImage(e.bytes), width: 160, height: 110, fit: pw.BoxFit.cover),
        pw.Text('${fmtDateTime(e.capturedAt, LangMode.en)}  GPS ${fmtCoord(e.lat)}, ${fmtCoord(e.lng)}', style: const pw.TextStyle(fontSize: 7)),
        pw.Text('SHA-256 ${shortHash(e.sha256)}', style: const pw.TextStyle(fontSize: 7)),
      ]),
    ));
  }
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(28),
    footer: (ctx) => pw.Align(
      alignment: pw.Alignment.centerRight,
      child: pw.Text('DOSJE NIGRANI - Nayan  |  page ${ctx.pageNumber} of ${ctx.pagesCount}', style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey600)),
    ),
    build: (ctx) => [
      pw.Container(
        padding: const pw.EdgeInsets.all(14),
        decoration: const pw.BoxDecoration(color: forest, borderRadius: pw.BorderRadius.all(pw.Radius.circular(6))),
        child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Text('Department of Social Justice & Empowerment - DOSJE NIGRANI', style: const pw.TextStyle(color: PdfColors.white, fontSize: 9)),
          pw.SizedBox(height: 4),
          pw.Text('Geo-tagged inspection report', style: pw.TextStyle(color: PdfColors.white, fontSize: 18, fontWeight: pw.FontWeight.bold)),
        ]),
      ),
      pw.SizedBox(height: 12),
      pw.Container(
        padding: const pw.EdgeInsets.all(10),
        decoration: const pw.BoxDecoration(color: beige, borderRadius: pw.BorderRadius.all(pw.Radius.circular(6))),
        child: pw.Column(children: [
          kv('Institute', sub.instituteName),
          kv('Inspector', inspector),
          kv('Submitted', fmtDateTime(sub.submittedAt, LangMode.en)),
          kv('GPS', sub.lat == null ? '-' : '${fmtCoord(sub.lat)}, ${fmtCoord(sub.lng)}'),
          kv('Map', sub.lat == null ? '-' : 'https://maps.google.com/?q=${sub.lat},${sub.lng}'),
          kv('Verification', '${sub.okCount} of ${sub.evidence.length} files verified by the server (SHA-256)'),
          kv('Record', sub.serverRecord ? 'Saved on the server' : 'Files on server; record on the device'),
          kv('Report ID', sub.id),
        ]),
      ),
      pw.SizedBox(height: 14),
      pw.Text('Checklist', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: forest)),
      pw.SizedBox(height: 6),
      pw.TableHelper.fromTextArray(
        headers: ['Item', 'Answer'],
        data: [for (final c in kChecklist) [c.en, (kAnswers[sub.answers[c.key]] ?? const Msg('-', '-')).en]],
        headerStyle: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
        headerDecoration: const pw.BoxDecoration(color: forest),
        cellStyle: const pw.TextStyle(fontSize: 9),
        cellAlignment: pw.Alignment.centerLeft,
      ),
      pw.SizedBox(height: 14),
      pw.Text('Remarks', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: forest)),
      pw.SizedBox(height: 4),
      pw.Text(_pdfSafe(sub.remarks.isEmpty ? '-' : sub.remarks), style: const pw.TextStyle(fontSize: 10, lineSpacing: 2)),
      pw.SizedBox(height: 14),
      pw.Text('Evidence', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: forest)),
      pw.SizedBox(height: 6),
      pw.TableHelper.fromTextArray(
        headers: ['#', 'Type', 'Captured', 'GPS', 'SHA-256', 'Server'],
        data: [
          for (var i = 0; i < sub.evidence.length; i++)
            [
              '${i + 1}',
              sub.evidence[i].kind.name,
              fmtDateTime(sub.evidence[i].capturedAt, LangMode.en),
              sub.evidence[i].lat == null ? '-' : '${fmtCoord(sub.evidence[i].lat)}, ${fmtCoord(sub.evidence[i].lng)}',
              sub.evidence[i].sha256,
              sub.evidence[i].status == EvStatus.ok ? 'Verified' : _pdfSafe(sub.evidence[i].reason ?? sub.evidence[i].status.name),
            ],
        ],
        headerStyle: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: PdfColors.white),
        headerDecoration: const pw.BoxDecoration(color: forest),
        cellStyle: const pw.TextStyle(fontSize: 7),
        columnWidths: {
          0: const pw.FixedColumnWidth(16),
          1: const pw.FixedColumnWidth(34),
          2: const pw.FixedColumnWidth(78),
          3: const pw.FixedColumnWidth(82),
          4: const pw.FlexColumnWidth(),
          5: const pw.FixedColumnWidth(48),
        },
      ),
      if (images.isNotEmpty) ...[
        pw.SizedBox(height: 14),
        pw.Text('Photos', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold, color: forest)),
        pw.SizedBox(height: 6),
        pw.Wrap(children: images),
      ],
      pw.SizedBox(height: 14),
      pw.Text(
        'Each file\'s SHA-256 was computed on the inspector\'s device at the moment of capture and recomputed by the server on arrival. '
        'A single changed pixel changes the hash, so a matching hash proves the file is untouched.',
        style: const pw.TextStyle(fontSize: 8, color: PdfColors.grey700),
      ),
    ],
  ));
  try {
    final bytes = await doc.save();
    await Printing.sharePdf(bytes: bytes, filename: 'nayan-report-${sub.id}.pdf');
  } catch (_) {
    if (context.mounted) snack(context, 'Could not create the PDF.', 'पीडीएफ़ नहीं बन सकी।', error: true);
  }
}

// ============================================================================
// §12 YUKT — inspection assistant. Uses the server's assistant when it has one
//     (the AI key stays on the server); otherwise answers from the app's own
//     data. Any action it suggests runs only after the inspector confirms.
// ============================================================================

bool _hasAny(String q, List<String> words) => words.any(q.contains);

/// Classic edit distance, used only to tolerate small typos (≤1 edit) in the
/// fuzzy fallback below — not for exact-keyword matching, which stays as
/// plain substring checks.
int _editDistance(String a, String b) {
  if (a == b) return 0;
  final la = a.length, lb = b.length;
  if (la == 0) return lb;
  if (lb == 0) return la;
  var prev = List<int>.generate(lb + 1, (j) => j);
  for (var i = 1; i <= la; i++) {
    final cur = List<int>.filled(lb + 1, 0);
    cur[0] = i;
    for (var j = 1; j <= lb; j++) {
      final cost = a[i - 1] == b[j - 1] ? 0 : 1;
      cur[j] = [cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost].reduce((x, y) => x < y ? x : y);
    }
    prev = cur;
  }
  return prev[lb];
}

/// A question that matched none of localYukt's keyword groups is not
/// necessarily off-topic — it may just be phrased differently or contain a
/// typo. This takes one more pass with light typo-tolerance and, on a
/// plausible (not certain) match, offers to open that topic instead of
/// answering outright, so the person can confirm rather than be misled by
/// a wrong guess.
YuktMsg? _fuzzyYukt(bool official, String q) {
  final topics = <(String id, List<String> keywords, Msg label, String actionType)>[
    ('cctv', ['camera', 'cctv', 'feed', 'frozen', 'कैमरा', 'सीसीटीवी'], const Msg('Live CCTV', 'लाइव सीसीटीवी'), 'open_tab'),
    ('vc', ['video', 'call', 'beneficiary', 'कॉल', 'वीसी', 'लाभार्थी'], const Msg('Random VC', 'रैंडम वीसी'), 'open_tab'),
    if (official) ('assign', ['assign', 'draw', 'random', 'surprise', 'आवंटन', 'अचानक'], const Msg('Random assignment', 'रैंडम आवंटन'), 'open_tab'),
    ('insights', ['anomaly', 'attendance', 'insight', 'proxy', 'उपस्थिति', 'विसंगति'], const Msg('Smart insights', 'स्मार्ट विश्लेषण'), 'open_tab'),
    ('alerts', ['alert', 'warning', 'अलर्ट', 'चेतावनी'], const Msg('Alerts', 'अलर्ट'), 'open_alerts'),
  ];
  final tokens = q.split(RegExp(r'[^a-zऀ-ॿ]+')).where((t) => t.length >= 4).toList();
  if (tokens.isEmpty) return null;
  String? bestId;
  Msg? bestLabel;
  String? bestAction;
  var bestScore = 0;
  for (final t in topics) {
    var score = 0;
    for (final k in t.$2) {
      if (k.length < 4) continue;
      for (final tok in tokens) {
        if (tok == k || _editDistance(tok, k) <= 1 || k.contains(tok) || tok.contains(k)) {
          score++;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = t.$1;
      bestLabel = t.$3;
      bestAction = t.$4;
    }
  }
  if (bestId == null || bestLabel == null || bestAction == null) return null;
  return YuktMsg(
    fromUser: false,
    text: Msg(
      'I\'m not fully sure, but this sounds like it could be about "${bestLabel.en}" — want me to open it?',
      'मुझे पूरा यकीन नहीं, पर शायद यह "${bestLabel.hi}" से जुड़ा है — क्या मैं इसे खोलूँ?',
    ),
    actions: [YuktAction(type: bestAction, id: bestId, label: bestLabel)],
  );
}

YuktMsg localYukt(AppState s, String question) {
  final q = question.toLowerCase().trim();
  final todo = s.assignments.where((a) => !AStatus.isDone(a.status)).toList();

  // Open a specific institute by name.
  for (final a in s.assignments) {
    final firstWord = a.institute.name.split(RegExp(r'[\s,]+')).first.toLowerCase();
    if (firstWord.length >= 4 && q.contains(firstWord)) {
      return YuktMsg(
        fromUser: false,
        text: Msg('${a.institute.name} — ${AStatus.label(a.status).en}. Shall I open it?',
            '${a.institute.name} — ${AStatus.label(a.status).hi}। क्या मैं इसे खोलूँ?'),
        actions: [YuktAction(type: 'open_assignment', id: a.id, label: Msg('Open ${a.institute.name}', '${a.institute.name} खोलें'))],
      );
    }
  }

  final official = s.user?.isOfficial ?? false;
  if (_hasAny(q, ['cctv', 'camera', 'कैमरा', 'सीसीटीवी', 'feed', 'frozen'])) {
    final cams = s.scopedCameras;
    final bad = cams.where((c) => !c.online).toList();
    return YuktMsg(
      fromUser: false,
      text: Msg(
        '${cams.length - bad.length} of ${cams.length} cameras are live. ${bad.isEmpty ? 'No problems right now.' : 'Needing attention: ${bad.take(4).map((c) => "${c.name} (${s.instituteById(c.instituteId)?.name.split(',').first ?? ''}, ${CameraFeed.statusLabel(c.status).en})").join('; ')}.'}',
        '${cams.length} में से ${cams.length - bad.length} कैमरे लाइव हैं। ${bad.isEmpty ? 'अभी कोई समस्या नहीं।' : 'ध्यान दें: ${bad.take(4).map((c) => "${c.name} (${s.instituteById(c.instituteId)?.name.split(',').first ?? ''}, ${CameraFeed.statusLabel(c.status).hi})").join('; ')}।'}',
      ),
      actions: [YuktAction(type: 'open_tab', id: 'cctv', label: const Msg('Live CCTV', 'लाइव सीसीटीवी'))],
    );
  }
  if (_hasAny(q, ['vc', 'video call', 'call', 'कॉल', 'वीसी', 'beneficiary', 'लाभार्थी'])) {
    final done = s.vcCalls.where((c) => c.outcome != 'pending').toList();
    final ans = done.where((c) => c.outcome == 'connected').length;
    return YuktMsg(
      fromUser: false,
      text: Msg(
        'Random VC picks an in-charge, staff member or beneficiary so nobody can prepare. ${done.isEmpty ? '' : '$ans of ${done.length} logged calls were answered.'} Missed calls raise an alert automatically.',
        'रैंडम वीसी प्रभारी, कर्मचारी या लाभार्थी को चुनता है ताकि कोई तैयारी न कर सके। ${done.isEmpty ? '' : '${done.length} में से $ans कॉल का उत्तर मिला।'} छूटी कॉल पर अपने आप अलर्ट बनता है।',
      ),
      actions: [YuktAction(type: 'open_tab', id: 'vc', label: const Msg('Random VC', 'रैंडम वीसी'))],
    );
  }
  if (_hasAny(q, ['assign', 'draw', 'random', 'आवंटन', 'ड्रॉ', 'surprise', 'अचानक'])) {
    final top = s.riskRows().take(3).map((r) => '${r.inst.name.split(',').first} (${(r.score * 100).round()})').join(', ');
    return YuktMsg(
      fromUser: false,
      text: Msg(
        'Surprise inspections are drawn with a risk-weighted random draw sealed by SHA-256. Highest risk now: $top.${official ? '' : ' Officials run the draw; you receive the visit.'}',
        'अचानक निरीक्षण जोखिम-आधारित रैंडम ड्रॉ से चुने जाते हैं, जो SHA-256 से मुहरबंद है। अभी सबसे अधिक जोखिम: $top।${official ? '' : ' ड्रॉ अधिकारी चलाते हैं; दौरा आपको मिलता है।'}',
      ),
      actions: [
        if (official) YuktAction(type: 'open_tab', id: 'assign', label: const Msg('Random assignment', 'रैंडम आवंटन')),
      ],
    );
  }
  if (_hasAny(q, ['anomal', 'attendance', 'उपस्थिति', 'proxy', 'प्रॉक्सी', 'insight', 'विसंगति', 'एआई', 'ai flag', ' ai '])) {
    final all = s.allAnomalies;
    return YuktMsg(
      fromUser: false,
      text: Msg(
        all.isEmpty
            ? 'No attendance anomalies in your area right now.'
            : '${all.length} anomaly flag(s). Most serious: ${all.first.title.en} at ${s.instituteById(all.first.instituteId)?.name ?? ''}.',
        all.isEmpty
            ? 'अभी आपके क्षेत्र में उपस्थिति में कोई विसंगति नहीं।'
            : '${all.length} विसंगति संकेत। सबसे गंभीर: ${s.instituteById(all.first.instituteId)?.name ?? ''} में ${all.first.title.hi}।',
      ),
      actions: [YuktAction(type: 'open_tab', id: 'insights', label: const Msg('Smart insights', 'स्मार्ट विश्लेषण'))],
    );
  }
  if (_hasAny(q, ['alert', 'अलर्ट', 'warning', 'चेतावनी'])) {
    final open = s.scopedAlerts.where((a) => a.status == 'open').toList();
    return YuktMsg(
      fromUser: false,
      text: Msg(
        open.isEmpty ? 'No open alerts.' : '${open.length} open alert(s). Latest: ${open.first.typeLabel.en} at ${s.instituteById(open.first.instituteId)?.name ?? ''}.',
        open.isEmpty ? 'कोई खुला अलर्ट नहीं।' : '${open.length} खुले अलर्ट। नवीनतम: ${s.instituteById(open.first.instituteId)?.name ?? ''} में ${open.first.typeLabel.hi}।',
      ),
      actions: [YuktAction(type: 'open_alerts', label: const Msg('Alerts', 'अलर्ट'))],
    );
  }

  if (_hasAny(q, ['today', 'aaj', 'आज', 'due', 'schedule', 'visit'])) {
    final due = todo.where((a) => a.dueToday || a.overdue).toList();
    if (due.isEmpty) {
      return YuktMsg(
        fromUser: false,
        text: Msg('Nothing is due today. You have ${todo.length} pending visit(s) in total.',
            'आज कुछ भी नियत नहीं है। कुल ${todo.length} दौरे बाकी हैं।'),
      );
    }
    return YuktMsg(
      fromUser: false,
      text: Msg(
        'Due today: ${due.map((a) => '${a.institute.name} (${fmtDue(a.dueAt!).en})').join('; ')}.',
        'आज नियत: ${due.map((a) => '${a.institute.name} (${fmtDue(a.dueAt!).hi})').join('; ')}।',
      ),
      actions: [
        for (final a in due.take(3))
          YuktAction(type: 'open_assignment', id: a.id, label: Msg('Open ${a.institute.name}', '${a.institute.name} खोलें')),
      ],
    );
  }

  if (_hasAny(q, ['pending', 'baaki', 'baki', 'बाकी', 'left', 'kitne', 'how many', 'कितने'])) {
    final urgent = todo.where((a) => a.urgent).length;
    return YuktMsg(
      fromUser: false,
      text: Msg(
        'You have ${todo.length} pending visit(s)${urgent > 0 ? ', $urgent urgent' : ''}, and ${s.submissions.length} submitted inspection(s) on this phone.',
        'आपके ${todo.length} दौरे बाकी हैं${urgent > 0 ? ', $urgent अति आवश्यक' : ''}, और इस फ़ोन पर ${s.submissions.length} निरीक्षण जमा हैं।',
      ),
      actions: [
        if (todo.isNotEmpty)
          YuktAction(type: 'open_assignment', id: todo.first.id, label: Msg('Open next visit', 'अगला दौरा खोलें')),
      ],
    );
  }

  if (_hasAny(q, ['hash', 'sha', 'हैश', 'tamper', 'seal', 'मुहर'])) {
    return YuktMsg(
      fromUser: false,
      text: const Msg(
        'Every photo or video gets a SHA-256 fingerprint on your phone the moment you take it. The server computes it again on arrival — if even one pixel changed, the fingerprints differ and the file is rejected. That is how officials know the evidence is untouched.',
        'हर फ़ोटो या वीडियो लेते ही फ़ोन पर उसकी SHA-256 पहचान (फ़िंगरप्रिंट) बनती है। सर्वर पहुँचने पर इसे दोबारा गणना करता है — एक भी पिक्सल बदला हो तो पहचान नहीं मिलती और फ़ाइल अस्वीकार होती है। इसी से अधिकारी जानते हैं कि साक्ष्य से छेड़छाड़ नहीं हुई।',
      ),
    );
  }

  if (_hasAny(q, ['gps', 'location', 'लोकेशन', 'jagah', 'जगह', 'far', 'door', 'दूर'])) {
    return YuktMsg(
      fromUser: false,
      text: const Msg(
        'Tips for a good GPS fix: turn on Location, stand near a window or outdoors, and wait a few seconds. The app shows how far you are from the institute — evidence taken more than 500 m away is flagged for the official.',
        'अच्छे GPS के लिए: लोकेशन चालू करें, खिड़की के पास या बाहर खड़े हों और कुछ सेकंड रुकें। ऐप दिखाता है कि आप संस्थान से कितनी दूर हैं — 500 मीटर से दूर लिए गए साक्ष्य अधिकारी के लिए चिह्नित होते हैं।',
      ),
    );
  }

  if (_hasAny(q, ['reject', 'अस्वीकार', 'fail', 'upload', 'internet', 'network'])) {
    return YuktMsg(
      fromUser: false,
      text: const Msg(
        'If a file is "Not uploaded", your internet dropped — tap Retry and nothing is lost. If it is "Rejected", the server found a problem (usually missing GPS or a changed file); take that photo again and resubmit.',
        'अगर फ़ाइल "अपलोड नहीं हुई" दिखे तो इंटरनेट टूटा था — दोबारा प्रयास दबाएँ, कुछ नहीं खोएगा। अगर "अस्वीकार" दिखे तो सर्वर को समस्या मिली (अक्सर GPS नहीं या फ़ाइल बदली); वह फ़ोटो दोबारा लें और फिर जमा करें।',
      ),
    );
  }

  if (_hasAny(q, ['how', 'kaise', 'कैसे', 'submit', 'jama', 'जमा', 'steps', 'start'])) {
    return YuktMsg(
      fromUser: false,
      text: const Msg(
        'An inspection has 4 steps: 1) Get your location. 2) Take photos/videos — GPS, time and SHA-256 are added automatically. 3) Answer the checklist. 4) Write remarks. Then tap "Submit inspection" and keep the app open until the upload finishes.',
        'निरीक्षण के 4 चरण हैं: 1) अपनी लोकेशन लें। 2) फ़ोटो/वीडियो लें — GPS, समय और SHA-256 अपने आप जुड़ते हैं। 3) जाँच सूची भरें। 4) टिप्पणी लिखें। फिर "निरीक्षण जमा करें" दबाएँ और अपलोड पूरा होने तक ऐप खुला रखें।',
      ),
      actions: [
        if (todo.isNotEmpty)
          YuktAction(type: 'open_assignment', id: todo.first.id, label: Msg('Open next visit', 'अगला दौरा खोलें')),
      ],
    );
  }

  if (_hasAny(q, ['hello', 'hi ', 'namaste', 'नमस्ते', 'hey'])) {
    final name = s.user?.name.split(' ').first ?? '';
    return YuktMsg(
      fromUser: false,
      text: Msg('Namaste $name! Ask me about today\'s visits, how to submit, GPS or the SHA-256 seal.',
          'नमस्ते $name! आज के दौरे, जमा करने का तरीका, GPS या SHA-256 मुहर के बारे में पूछें।'),
    );
  }

  final fuzzy = _fuzzyYukt(official, q);
  if (fuzzy != null) return fuzzy;

  return YuktMsg(
    fromUser: false,
    text: const Msg(
      'I can help with: today\'s visits, pending work, how to submit an inspection, GPS problems, failed or rejected uploads, and the SHA-256 seal. Try one of the suggestions below.',
      'मैं इनमें मदद कर सकता हूँ: आज के दौरे, बाकी काम, निरीक्षण कैसे जमा करें, GPS की समस्या, अपलोड न होना या अस्वीकार, और SHA-256 मुहर। नीचे दिए सुझाव आज़माएँ।',
    ),
  );
}

void openYukt(BuildContext context, {void Function(int tab)? onGo}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (_) => YuktSheet(onGo: onGo),
  );
}

class YuktSheet extends StatefulWidget {
  const YuktSheet({super.key, this.onGo});
  final void Function(int tab)? onGo;

  @override
  State<YuktSheet> createState() => _YuktSheetState();
}

class _YuktSheetState extends State<YuktSheet> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _thinking = false;

  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  StreamSubscription<Uint8List>? _micSub;
  List<int>? _pcm;
  Timer? _micCap;
  bool _recording = false;
  bool _transcribing = false;
  int? _speakingIndex;

  static const List<Msg> _suggestions = [
    Msg('Any camera problems?', 'कैमरों में कोई समस्या?'),
    Msg('Show anomaly flags', 'विसंगति संकेत दिखाएँ'),
    Msg('Open alerts', 'खुले अलर्ट'),
    Msg('What is due today?', 'आज क्या नियत है?'),
    Msg('How does the random draw work?', 'रैंडम ड्रॉ कैसे काम करता है?'),
    Msg('What is the SHA-256 seal?', 'SHA-256 मुहर क्या है?'),
  ];

  @override
  void initState() {
    super.initState();
    final s = AppScope.read(context);
    if (s.yukt.isEmpty) {
      final name = s.user?.name.split(' ').first ?? '';
      s.yukt.add(YuktMsg(
        fromUser: false,
        text: Msg('Namaste $name, I am Yukt. How can I help with your inspections?',
            'नमस्ते $name, मैं युक्त हूँ। निरीक्षण में आपकी क्या मदद करूँ?'),
      ));
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    _micSub?.cancel();
    _micCap?.cancel();
    _recorder.dispose();
    _player.dispose();
    super.dispose();
  }

  bool _voiceAvailable(AppState s) {
    final be = s.backend;
    return be != null && !be.isDemo && !s.usingSampleData;
  }

  String _bhashiniLang(AppState s) => s.lang == LangMode.hi ? 'hi' : 'en';

  Future<void> _toggleMic() async {
    if (_recording) {
      await _stopAndTranscribe();
      return;
    }
    final s = AppScope.read(context);
    if (!_voiceAvailable(s)) {
      snack(context, 'Voice needs a live server connection — type your question instead.',
          'आवाज़ के लिए सर्वर से जुड़ाव चाहिए — अभी अपना सवाल टाइप करें।', error: true);
      return;
    }
    try {
      if (!await _recorder.hasPermission()) {
        if (mounted) {
          snack(context, 'Microphone permission is needed for voice questions.', 'आवाज़ से पूछने के लिए माइक्रोफ़ोन अनुमति चाहिए।', error: true);
        }
        return;
      }
      _pcm = <int>[];
      final stream = await _recorder.startStream(
        const RecordConfig(encoder: AudioEncoder.pcm16bits, sampleRate: 16000, numChannels: 1),
      );
      _micSub = stream.listen((chunk) => _pcm?.addAll(chunk));
      setState(() => _recording = true);
      // Safety cap so a forgotten mic doesn't record indefinitely or build an
      // oversized upload.
      _micCap = Timer(const Duration(seconds: 12), () {
        if (_recording) _stopAndTranscribe();
      });
    } catch (_) {
      if (mounted) snack(context, 'Could not start the microphone.', 'माइक्रोफ़ोन शुरू नहीं हो सका।', error: true);
    }
  }

  Future<void> _stopAndTranscribe() async {
    _micCap?.cancel();
    _micCap = null;
    try {
      await _recorder.stop();
    } catch (_) {
      // ignore
    }
    await _micSub?.cancel();
    _micSub = null;
    final pcm = _pcm == null ? null : Uint8List.fromList(_pcm!);
    _pcm = null;
    if (!mounted) return;
    setState(() {
      _recording = false;
      _transcribing = pcm != null && pcm.isNotEmpty;
    });
    if (pcm == null || pcm.isEmpty) return;
    final s = AppScope.read(context);
    final be = s.backend;
    final u = s.user;
    if (be == null || u == null) {
      setState(() => _transcribing = false);
      return;
    }
    final wav = pcm16ToWav(pcm);
    final text = await be.speechToText(u, wav, _bhashiniLang(s));
    if (!mounted) return;
    setState(() => _transcribing = false);
    if (text == null || text.isEmpty) {
      snack(context, 'Could not make out what was said — please try again or type it.',
          'सुनाई नहीं दिया — फिर से कोशिश करें या टाइप करें।', error: true);
      return;
    }
    _send(text);
  }

  Future<void> _speak(Msg text, int index) async {
    final s = AppScope.read(context);
    if (!_voiceAvailable(s)) return;
    if (_speakingIndex == index) {
      await _player.stop();
      if (mounted) setState(() => _speakingIndex = null);
      return;
    }
    final be = s.backend;
    final u = s.user;
    if (be == null || u == null) return;
    await _player.stop();
    setState(() => _speakingIndex = index);
    final audio = await be.textToSpeech(u, text.of(s.lang), _bhashiniLang(s));
    if (!mounted) return;
    if (audio == null) {
      setState(() => _speakingIndex = null);
      snack(context, 'Could not read that reply aloud right now.', 'अभी इसे पढ़कर नहीं सुनाया जा सका।', error: true);
      return;
    }
    try {
      await _player.play(BytesSource(audio));
      _player.onPlayerComplete.first.then((_) {
        if (mounted && _speakingIndex == index) setState(() => _speakingIndex = null);
      });
    } catch (_) {
      if (mounted) setState(() => _speakingIndex = null);
    }
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send(String text) async {
    final q = text.trim();
    if (q.isEmpty || _thinking) return;
    final s = AppScope.read(context);
    _input.clear();
    s.addYukt(YuktMsg(fromUser: true, text: Msg(q, q)));
    setState(() => _thinking = true);
    _toBottom();

    YuktMsg? reply;
    final be = s.backend;
    final u = s.user;
    if (be != null && u != null && !be.isDemo && !s.usingSampleData) {
      final history = [
        for (final m in s.yukt.take(s.yukt.length - 1).toList().reversed.take(10).toList().reversed)
          {'role': m.fromUser ? 'user' : 'assistant', 'text': m.text.en},
      ];
      reply = await be.assistant(u, q, s.lang.name, history, {
        'pending': s.assignments.where((a) => !AStatus.isDone(a.status)).length,
        'assignments': [
          for (final a in s.assignments.take(10))
            {'id': a.id, 'institute': a.institute.name, 'status': a.status, 'due': a.dueAt?.toIso8601String()},
        ],
      });
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 350));
    }
    reply ??= localYukt(s, q);
    if (!mounted) return;
    s.addYukt(reply);
    setState(() => _thinking = false);
    _toBottom();
  }

  Future<void> _runAction(YuktAction action) async {
    final s = AppScope.read(context);
    if (action.type == 'open_tab' || action.type == 'open_alerts') {
      final ok = await confirmDialog(
        context,
        title: const Msg('Yukt wants to open a page', 'युक्त एक पेज खोलना चाहता है'),
        body: Msg('Open "${action.label.en}"?', '"${action.label.hi}" खोलें?'),
        confirm: const Msg('Open', 'खोलें'),
      );
      if (!ok || !mounted) return;
      final official = s.user?.isOfficial ?? false;
      final nav = Navigator.of(context);
      nav.pop();
      if (action.type == 'open_alerts') {
        nav.push(MaterialPageRoute<void>(builder: (_) => const AlertsScreen()));
        return;
      }
      final idx = switch (action.id) {
        'cctv' => 1,
        'vc' => 2,
        'assign' => official ? 3 : null,
        'insights' => official ? 4 : null,
        'visits' => official ? null : 0,
        _ => null,
      };
      if (idx != null && widget.onGo != null) {
        widget.onGo!(idx);
        return;
      }
      final Widget page = switch (action.id) {
        'cctv' => const CctvScreen(),
        'vc' => const VcScreen(),
        'assign' => const AssignScreen(),
        _ => const InsightsScreen(),
      };
      nav.push(MaterialPageRoute<void>(builder: (_) => page));
      return;
    }
    if (action.type != 'open_assignment' || action.id == null) return;
    final a = s.assignmentById(action.id!);
    if (a == null) {
      snack(context, 'That assignment is no longer in your list.', 'वह कार्य अब आपकी सूची में नहीं है।', error: true);
      return;
    }
    final ok = await confirmDialog(
      context,
      title: const Msg('Yukt wants to open a page', 'युक्त एक पेज खोलना चाहता है'),
      body: Msg('Open the assignment for ${a.institute.name}?', '${a.institute.name} का कार्य खोलें?'),
      confirm: const Msg('Open', 'खोलें'),
    );
    if (!ok || !mounted) return;
    final nav = Navigator.of(context);
    nav.pop();
    nav.push(MaterialPageRoute<void>(builder: (_) => AssignmentDetailScreen(assignmentId: a.id)));
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final serverAi = s.backend != null && !s.backend!.isDemo && !s.usingSampleData;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.78,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(colors: [kSand, kForest], begin: Alignment.topLeft, end: Alignment.bottomRight),
                    ),
                    child: const Icon(Icons.support_agent_rounded, color: Colors.white, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s.lang == LangMode.hi ? 'युक्त' : 'Yukt · युक्त',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        Text(
                          serverAi
                              ? tx(context, 'Inspection assistant', 'निरीक्षण सहायक')
                              : tx(context, 'Inspection assistant · works offline', 'निरीक्षण सहायक · बिना सर्वर भी'),
                          style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                itemCount: s.yukt.length + (_thinking ? 1 : 0),
                itemBuilder: (context, i) {
                  if (i >= s.yukt.length) {
                    return Align(
                      alignment: Alignment.centerLeft,
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(tx(context, 'Yukt is typing…', 'युक्त लिख रहा है…'),
                            style: TextStyle(color: cs.onSurfaceVariant, fontStyle: FontStyle.italic)),
                      ),
                    );
                  }
                  final m = s.yukt[i];
                  final mine = m.fromUser;
                  return Align(
                    alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                        decoration: BoxDecoration(
                          color: mine ? cs.primary : cs.onSurface.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(16),
                            topRight: const Radius.circular(16),
                            bottomLeft: Radius.circular(mine ? 16 : 4),
                            bottomRight: Radius.circular(mine ? 4 : 16),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (mine)
                              Text(m.text.en, style: TextStyle(color: cs.onPrimary, fontSize: 15))
                            else
                              Bi(m.text.en, m.text.hi, style: const TextStyle(fontSize: 15, height: 1.4)),
                            if (!mine && _voiceAvailable(s)) ...[
                              const SizedBox(height: 4),
                              InkWell(
                                borderRadius: BorderRadius.circular(16),
                                onTap: () => _speak(m.text, i),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 2),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    Icon(_speakingIndex == i ? Icons.stop_circle_rounded : Icons.volume_up_rounded,
                                        size: 16, color: cs.onSurfaceVariant),
                                    const SizedBox(width: 4),
                                    Text(_speakingIndex == i ? tx(context, 'Stop', 'रोकें') : tx(context, 'Listen', 'सुनें'),
                                        style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                                  ]),
                                ),
                              ),
                            ],
                            if (m.actions.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  for (final act in m.actions)
                                    ActionChip(
                                      avatar: const Icon(Icons.open_in_new_rounded, size: 16),
                                      label: Text(act.label.of(s.lang)),
                                      onPressed: () => _runAction(act),
                                    ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  for (final sug in _suggestions)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ActionChip(
                        label: Text(sug.of(s.lang)),
                        onPressed: _thinking ? null : () => _send(sug.of(s.lang)),
                      ),
                    ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _input,
                        textInputAction: TextInputAction.send,
                        onSubmitted: _send,
                        minLines: 1,
                        maxLines: 3,
                        decoration: fieldDecoration(
                          context,
                          label: _recording
                              ? tx(context, 'Listening…', 'सुन रहा हूँ…')
                              : (_transcribing ? tx(context, 'Transcribing…', 'लिख रहा हूँ…') : tx(context, 'Ask Yukt…', 'युक्त से पूछें…')),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    IconButton.filledTonal(
                      tooltip: _recording ? tx(context, 'Stop', 'रोकें') : tx(context, 'Ask by voice', 'आवाज़ से पूछें'),
                      style: _recording
                          ? IconButton.styleFrom(backgroundColor: cs.error, foregroundColor: cs.onError)
                          : null,
                      onPressed: _thinking || _transcribing ? null : _toggleMic,
                      icon: Icon(_recording ? Icons.stop_rounded : Icons.mic_none_rounded),
                    ),
                    const SizedBox(width: 6),
                    IconButton.filled(
                      tooltip: tx(context, 'Send', 'भेजें'),
                      onPressed: _thinking ? null : () => _send(_input.text),
                      icon: const Icon(Icons.send_rounded),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}


/// Pass-through wrapper (the app does not refresh on pull-down; data updates
/// on its own and from the refresh buttons).
class _Plain extends StatelessWidget {
  const _Plain({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => child;
}

// ============================================================================
// §20 HOME HEADER, TOP BAR, DRAWER, SEARCH
// ============================================================================

const Color _kHeadSaffron = Color(0xFFF2A43A);
const Color _kHeadGreen = Color(0xFF6E9E3C);

class _HeaderColors {
  _HeaderColors(BuildContext context) {
    final t = Theme.of(context);
    dark = t.brightness == Brightness.dark;
    hc = AppScope.of(context).highContrast;
    card = hc ? t.colorScheme.surface : (dark ? const Color(0xFF1B1F1C) : Colors.white.withValues(alpha: 0.95));
    border = hc ? t.colorScheme.outline : (dark ? Colors.white.withValues(alpha: 0.08) : const Color(0xFFE9E4D8));
    title = dark ? Colors.white : const Color(0xFF1C1C1A);
    muted = dark ? const Color(0xFF9EA39E) : const Color(0xFF9A968D);
    search = dark ? const Color(0xFF121512) : const Color(0xFFF0EEE8);
  }
  late final bool dark;
  late final bool hc;
  late final Color card;
  late final Color border;
  late final Color title;
  late final Color muted;
  late final Color search;
}

/// The logo disc, title, bell and avatar row shared by the home header and
/// the top bar of the other tabs.
class _BrandRow extends StatelessWidget {
  const _BrandRow({required this.subtitle, this.onGo, this.big = true, this.title});
  final Msg subtitle;
  final Msg? title;
  final void Function(int tab)? onGo;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user;
    final c = _HeaderColors(context);
    final open = s.scopedAlerts.where((a) => a.status == 'open').length;
    final disc = big ? 46.0 : 40.0;
    return Row(
      children: [
        IconButton(
          tooltip: tx(context, 'Menu', 'मेनू'),
          visualDensity: VisualDensity.compact,
          onPressed: () => Scaffold.of(context).openDrawer(),
          icon: Icon(Icons.menu_rounded, color: c.title, size: 26),
        ),
        Container(
          width: disc,
          height: disc,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: c.dark ? const Color(0xFF3A2410) : const Color(0xFFF8ECD9),
            border: Border.all(color: _kHeadGreen, width: 2),
          ),
          child: Icon(Icons.visibility_outlined, size: disc * 0.46, color: c.dark ? const Color(0xFFE0A860) : const Color(0xFF9A6A24)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title == null ? 'नयन · Nayan' : title!.of(s.lang == LangMode.hi ? LangMode.hi : LangMode.en),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: big ? 21 : 17, fontWeight: FontWeight.w700, color: c.title),
              ),
              Text(
                s.lang == LangMode.hi ? subtitle.hi : subtitle.en,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: big ? 13.5 : 12.5, fontWeight: FontWeight.w500, color: c.muted),
              ),
            ],
          ),
        ),
        Stack(
          clipBehavior: Clip.none,
          children: [
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: tx(context, 'Alerts', 'अलर्ट'),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AlertsScreen())),
              icon: Icon(Icons.notifications_none_rounded, color: c.title, size: 27),
            ),
            if (open > 0)
              Positioned(
                right: 10,
                top: 9,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(color: const Color(0xFFE0592A), shape: BoxShape.circle, border: Border.all(color: c.card, width: 1.5)),
                ),
              ),
          ],
        ),
        const SizedBox(width: 4),
        InkWell(
          customBorder: const CircleBorder(),
          onTap: () {
            if (u != null && !u.isOfficial && onGo != null) {
              onGo!(4);
            } else {
              Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ProfileScreen()));
            }
          },
          child: CircleAvatar(
            radius: big ? 25 : 20,
            backgroundColor: const Color(0xFFE6F0DC),
            child: Text(u?.initials ?? '?', style: TextStyle(color: const Color(0xFF2E5418), fontSize: big ? 17 : 14, fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }
}

Msg _brandSubtitle(AppUser? u) =>
    (u?.isOfficial ?? false) ? const Msg('DoSJE live monitoring', 'डीओएसजेई लाइव निगरानी') : const Msg('DoSJE field inspection', 'डीओएसजेई क्षेत्र निरीक्षण');

class _TricolourLine extends StatelessWidget {
  const _TricolourLine({this.height = 4});
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: const BoxDecoration(
        gradient: LinearGradient(colors: [_kHeadSaffron, Color(0xFFFFF8EC), _kHeadGreen]),
      ),
    );
  }
}

class _HeadStat extends StatelessWidget {
  const _HeadStat({required this.value, required this.label, required this.kind, this.onTap});
  final String value;
  final Msg label;
  final int kind; // 0 amber, 1 green, 2 red
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    late final Color bg;
    late final Color fg;
    switch (kind) {
      case 0:
        bg = const Color(0xFFF8ECD9);
        fg = const Color(0xFF8A5A14);
      case 1:
        bg = const Color(0xFFE6F0DC);
        fg = const Color(0xFF2E5418);
      default:
        bg = dark ? const Color(0xFF3D1111) : const Color(0xFFFCE8E8);
        fg = dark ? const Color(0xFFF08A84) : const Color(0xFFA8322C);
    }
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 6),
          child: Column(
            children: [
              Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: fg)),
              const SizedBox(height: 2),
              Text(
                s.lang == LangMode.hi ? label.hi : label.en,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: fg),
              ),
              if (s.lang == LangMode.bi)
                Text(label.hi, maxLines: 1, style: TextStyle(fontSize: 11, color: fg.withValues(alpha: 0.75))),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeadItem {
  _HeadItem({required this.icon, required this.kind, required this.title, required this.sub, required this.onTap});
  final IconData icon;
  final int kind;
  final String title;
  final String sub;
  final VoidCallback onTap;
}

/// The home header: brand row, greeting, search, three status boxes and
/// today's list — one rounded card with a tricolour edge.
class HomeHeader extends StatelessWidget {
  const HomeHeader({super.key, this.onGo});
  final void Function(int tab)? onGo;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user;
    if (u == null) return const SizedBox.shrink();
    final c = _HeaderColors(context);
    final official = u.isOfficial;
    final hour = DateTime.now().hour;
    final greet = hour < 12
        ? const Msg('Good morning', 'सुप्रभात')
        : (hour < 17 ? const Msg('Good afternoon', 'नमस्कार') : const Msg('Good evening', 'शुभ संध्या'));

    final List<_HeadStat> stats;
    final List<_HeadItem> items;
    final Msg listTitle;
    if (official) {
      final open = s.scopedAlerts.where((a) => a.status == 'open').toList();
      final cams = s.scopedCameras;
      final redInst = s.scopedInstitutes.where((i) => i.status == 'red').length;
      stats = [
        _HeadStat(
          value: '${open.length}',
          label: const Msg('Open alerts', 'खुले अलर्ट'),
          kind: 0,
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AlertsScreen())),
        ),
        _HeadStat(
          value: '${cams.where((x) => x.online).length}/${cams.length}',
          label: const Msg('Cameras live', 'कैमरे लाइव'),
          kind: 1,
          onTap: onGo == null ? null : () => onGo!(1),
        ),
        _HeadStat(
          value: '$redInst',
          label: const Msg('High risk', 'उच्च जोखिम'),
          kind: 2,
          onTap: onGo == null ? null : () => onGo!(4),
        ),
      ];
      listTitle = const Msg('Needs attention today', 'आज ध्यान दें');
      items = [
        for (var i = 0; i < math.min(3, open.length); i++)
          _HeadItem(
            icon: open[i].icon,
            kind: open[i].severity == 'red' ? 2 : 0,
            title: s.instituteById(open[i].instituteId)?.name ?? '—',
            sub: '${open[i].typeLabel.of(s.lang)} · ${timeAgo(open[i].createdAt).of(s.lang)}',
            onTap: () => showAlertSheet(context, open[i]),
          ),
      ];
    } else {
      final todo = s.assignments.where((a) => !AStatus.isDone(a.status)).toList();
      final done = s.assignments.where((a) => AStatus.isDone(a.status)).length;
      final overdue = todo.where((a) => a.overdue).length;
      stats = [
        _HeadStat(value: '${todo.length}', label: const Msg('Pending', 'बाकी'), kind: 0),
        _HeadStat(
          value: '$done',
          label: const Msg('Completed', 'पूरे'),
          kind: 1,
          onTap: onGo == null ? null : () => onGo!(3),
        ),
        _HeadStat(value: '$overdue', label: const Msg('Overdue', 'समय बीता'), kind: 2),
      ];
      final upcoming = [...todo]..sort((a, b) => (a.dueAt ?? a.createdAt).compareTo(b.dueAt ?? b.createdAt));
      final today = upcoming.where((a) => a.dueToday || a.overdue).toList();
      final showList = today.isNotEmpty ? today : upcoming;
      listTitle = today.isNotEmpty ? const Msg("Today's inspections", 'आज के निरीक्षण') : const Msg('Upcoming inspections', 'आगामी निरीक्षण');
      items = [
        for (var i = 0; i < math.min(3, showList.length); i++)
          _HeadItem(
            icon: showList[i].surprise ? Icons.casino_outlined : (i.isEven ? Icons.apartment_rounded : Icons.assignment_turned_in_outlined),
            kind: showList[i].overdue ? 2 : (i.isEven ? 0 : 1),
            title: showList[i].institute.name,
            sub: [
              if (showList[i].dueAt != null)
                (showList[i].dueToday ? fmtTime(showList[i].dueAt!) : fmtDue(showList[i].dueAt!).of(s.lang == LangMode.hi ? LangMode.hi : LangMode.en)),
              showList[i].surprise
                  ? tx(context, 'Surprise visit', 'अचानक दौरा')
                  : (showList[i].status == AStatus.inProgress ? tx(context, 'In progress', 'जारी') : tx(context, 'Site visit', 'स्थल दौरा')),
            ].join(' · '),
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AssignmentDetailScreen(assignmentId: showList[i].id))),
          ),
      ];
    }

    return Container(
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: c.border),
        boxShadow: c.hc
            ? null
            : [BoxShadow(color: Colors.black.withValues(alpha: c.dark ? 0.35 : 0.06), blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _TricolourLine(),
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 12, 14, 0),
              child: _BrandRow(subtitle: _brandSubtitle(u), onGo: onGo),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 14, 0),
              child: Row(children: [
                Expanded(
                  child: Text(
                    s.lang == LangMode.hi ? '${greet.hi}, ${u.name}' : '${greet.en}, ${u.name}',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w500, color: c.dark ? const Color(0xFFD8DCD8) : const Color(0xFF5F5B54)),
                  ),
                ),
                const DemoBadge(),
              ]),
            ),
            if (official && s.lastSync != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 2, 20, 0),
                child: Row(children: [
                  const PulseDot(size: 8),
                  Text(
                    s.lang == LangMode.hi ? 'लाइव · अपडेट ${fmtTime(s.lastSync!)}' : 'Live · updated ${fmtTime(s.lastSync!)}',
                    style: TextStyle(fontSize: 12.5, color: c.muted),
                  ),
                ]),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
              child: Material(
                color: c.search,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () => showSearch<void>(context: context, delegate: NayanSearch(origin: context, onGo: onGo)),
                  child: SizedBox(
                    height: 54,
                    child: Row(children: [
                      const SizedBox(width: 16),
                      Icon(Icons.search_rounded, color: c.muted, size: 26),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          official
                              ? tx(context, 'Search institutes, alerts, inspectors', 'संस्थान, अलर्ट, निरीक्षक खोजें')
                              : tx(context, 'Search inspections, sites, officers', 'निरीक्षण, स्थल, अधिकारी खोजें'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 16.5, color: c.muted),
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
            Container(
              height: 1,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [_kHeadSaffron.withValues(alpha: 0.7), _kHeadGreen.withValues(alpha: 0.7)]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
              child: Row(children: [
                Expanded(child: stats[0]),
                const SizedBox(width: 12),
                Expanded(child: stats[1]),
                const SizedBox(width: 12),
                Expanded(child: stats[2]),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
              child: Text(
                s.lang == LangMode.hi ? listTitle.hi : listTitle.en,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.title),
              ),
            ),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 18),
                child: Text(tx(context, 'Nothing scheduled.', 'कुछ निर्धारित नहीं।'), style: TextStyle(color: c.muted)),
              ),
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0) Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Divider(height: 1, color: c.border)),
              _HeadItemTile(item: items[i], colors: c),
            ],
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _HeadItemTile extends StatelessWidget {
  const _HeadItemTile({required this.item, required this.colors});
  final _HeadItem item;
  final _HeaderColors colors;

  @override
  Widget build(BuildContext context) {
    final bg = item.kind == 0 ? const Color(0xFFF8ECD9) : (item.kind == 1 ? const Color(0xFFE6F0DC) : const Color(0xFFFCE8E8));
    final fg = item.kind == 0 ? const Color(0xFF8A5A14) : (item.kind == 1 ? const Color(0xFF2E5418) : const Color(0xFFA8322C));
    return InkWell(
      onTap: item.onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 14, 12),
        child: Row(children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
            child: Icon(item.icon, color: fg, size: 25),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: colors.title)),
                const SizedBox(height: 2),
                Text(item.sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, color: colors.muted)),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: colors.muted, size: 28),
        ]),
      ),
    );
  }
}

/// Top bar for the other home tabs, in the same style as the header.
class NayanTopBar extends StatelessWidget implements PreferredSizeWidget {
  const NayanTopBar({super.key, required this.title, this.onGo});
  final Msg title;
  final void Function(int tab)? onGo;

  @override
  Size get preferredSize => const Size.fromHeight(76);

  @override
  Widget build(BuildContext context) {
    final c = _HeaderColors(context);
    final s = AppScope.of(context);
    return Material(
      color: c.card,
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const _TricolourLine(height: 3),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(4, 0, 12, 0),
                child: _BrandRow(subtitle: _brandSubtitle(s.user), title: title, onGo: onGo, big: false),
              ),
            ),
            Container(
              height: 1,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [_kHeadSaffron.withValues(alpha: 0.6), _kHeadGreen.withValues(alpha: 0.6)]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Sign-out with confirmation. Unsent evidence is kept on this phone for the
/// same inspector; the dialog says how many files are waiting.
Future<void> signOutFlow(BuildContext context) async {
  final s = AppScope.read(context);
  // Captured before the dialog: the drawer that may have called this closes
  // (and unmounts) while the dialog is open.
  final nav = nayanNavigatorKey.currentState ?? Navigator.of(context);
  final pending = s.pendingEvidenceCount;
  final ok = await confirmDialog(
    context,
    title: const Msg('Sign out?', 'साइन आउट करें?'),
    body: pending > 0
        ? Msg(
            '$pending photo/video file${pending == 1 ? ' is' : 's are'} waiting to upload. '
                'They stay in Nayan on this phone and can be submitted after the next sign-in by the same inspector. '
                'Keep the app open (do not force-close it) until then.',
            '$pending फ़ोटो/वीडियो अपलोड होने बाकी हैं। ये इस फ़ोन पर नयन में रहेंगे और इसी निरीक्षक के अगले साइन इन के बाद जमा किए जा सकेंगे। '
                'तब तक ऐप को ज़बरदस्ती बंद न करें।')
        : const Msg('You will need your email and password to sign in again.', 'दोबारा साइन इन करने के लिए ईमेल और पासवर्ड चाहिए होगा।'),
    confirm: const Msg('Sign out', 'साइन आउट'),
    danger: true,
  );
  if (!ok) return;
  await s.logout();
  if (!nav.mounted) return;
  nav.pushAndRemoveUntil(MaterialPageRoute<void>(builder: (_) => const LoginScreen()), (_) => false);
}

class NayanDrawer extends StatelessWidget {
  const NayanDrawer({super.key, required this.nav, required this.current, required this.onGo});
  final List<_NavItem> nav;
  final int current;
  final void Function(int tab) onGo;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final cs = Theme.of(context).colorScheme;
    final official = u?.isOfficial ?? false;
    void push(Widget page) {
      Navigator.of(context).pop();
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));
    }

    Widget tile(IconData icon, Msg label, VoidCallback onTap, {bool selected = false, Color? color}) => ListTile(
          leading: Icon(icon, color: color ?? (selected ? cs.primary : null)),
          title: Bi(label.en, label.hi, style: TextStyle(fontWeight: selected ? FontWeight.w700 : FontWeight.w500, color: color)),
          selected: selected,
          selectedTileColor: kSage.withValues(alpha: 0.16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          onTap: onTap,
        );

    return Drawer(
      backgroundColor: dark ? const Color(0xFF161B17) : kIvory,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [kForest, kSage], begin: Alignment.topLeft, end: Alignment.bottomRight),
            ),
            child: SafeArea(
              bottom: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _TricolourLine(height: 3),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          const NayanLogo(width: 58, onDark: true),
                          const SizedBox(width: 12),
                          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            const Text('नयन · Nayan', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                            Text(tx(context, 'DOSJE NIGRANI', 'दोसजे निगरानी'), style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12, letterSpacing: 1)),
                          ]),
                        ]),
                        const SizedBox(height: 18),
                        Text(u?.name ?? '', style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
                        Text(u == null ? '' : Roles.label(u.role).of(s.lang), style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13)),
                        Text(u?.email ?? '', style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
            child: Column(children: [
              for (var i = 0; i < nav.length; i++)
                tile(i == current ? nav[i].selected : nav[i].icon, Msg(nav[i].titleEn, nav[i].titleHi), () {
                  Navigator.of(context).pop();
                  onGo(i);
                }, selected: i == current),
              const Divider(height: 20),
              tile(Icons.map_outlined, const Msg('Institutes map', 'संस्थान मानचित्र'), () => push(const InstitutesMapScreen())),
              tile(Icons.notifications_active_outlined, const Msg('Alerts', 'अलर्ट'), () => push(const AlertsScreen())),
              if (!official) tile(Icons.insights_rounded, const Msg('Smart insights', 'स्मार्ट विश्लेषण'), () => push(const InsightsScreen())),
              if (official) tile(Icons.description_outlined, const Msg('Inspection reports', 'निरीक्षण रिपोर्ट'), () => push(const ReportsScreen())),
              if (official) tile(Icons.person_outline_rounded, const Msg('Profile & settings', 'प्रोफ़ाइल और सेटिंग'), () => push(const ProfileScreen())),
              tile(Icons.support_agent_rounded, const Msg('Ask Yukt', 'युक्त से पूछें'), () {
                Navigator.of(context).pop();
                openYukt(context, onGo: onGo);
              }),
              tile(Icons.tour_outlined, const Msg('Take the tour', 'परिचय देखें'), () {
                Navigator.of(context).pop();
                showTour(context);
              }),
              // Sign out lives only on the Profile screen now (one place, not two).
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text('v$kAppVersion · ${platformLabel()}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _SearchHit {
  _SearchHit(this.icon, this.title, this.sub, this.open);
  final IconData icon;
  final String title;
  final String sub;
  final void Function(BuildContext context) open;
}

class NayanSearch extends SearchDelegate<void> {
  NayanSearch({required this.origin, this.onGo});
  final BuildContext origin;
  final void Function(int tab)? onGo;

  @override
  String get searchFieldLabel => 'Search · खोजें';

  List<_SearchHit> _hits(BuildContext context) {
    final s = AppScope.read(context);
    final q = query.trim().toLowerCase();
    bool m(String x) => q.isEmpty || x.toLowerCase().contains(q);
    final out = <_SearchHit>[];
    for (final a in s.assignments) {
      if (m(a.institute.name) || m(a.institute.district)) {
        out.add(_SearchHit(Icons.assignment_outlined, a.institute.name, '${AStatus.label(a.status).of(s.lang)} · ${a.institute.district}',
            (c) => Navigator.of(c).push(MaterialPageRoute<void>(builder: (_) => AssignmentDetailScreen(assignmentId: a.id)))));
      }
    }
    final seen = s.assignments.map((a) => a.instituteId).toSet();
    for (final i in s.scopedInstitutes) {
      if (seen.contains(i.id)) continue;
      if (m(i.name) || m(i.district) || m(i.state)) {
        out.add(_SearchHit(Icons.apartment_rounded, i.name, '${i.district}, ${i.state}',
            (c) => Navigator.of(c).push(MaterialPageRoute<void>(builder: (_) => CctvScreen(instituteId: i.id)))));
      }
    }
    for (final a in s.scopedAlerts) {
      final inst = s.instituteById(a.instituteId);
      if (m(a.typeLabel.en) || m(a.detail) || m(inst?.name ?? '')) {
        out.add(_SearchHit(a.icon, a.typeLabel.of(s.lang), inst?.name ?? '', (c) => showAlertSheet(c, a)));
      }
    }
    for (final i in s.inspectorsList) {
      if (m(i.name) || m(i.district)) {
        out.add(_SearchHit(Icons.badge_outlined, i.name, '${i.designation} · ${i.district}', (c) {}));
      }
    }
    for (final cam in s.scopedCameras) {
      final inst = s.instituteById(cam.instituteId);
      if (q.isNotEmpty && (m(cam.name) || m(inst?.name ?? ''))) {
        out.add(_SearchHit(Icons.videocam_outlined, '${cam.name} · ${inst?.name ?? ''}', CameraFeed.statusLabel(cam.status).of(s.lang),
            (c) => Navigator.of(c).push(MaterialPageRoute<void>(builder: (_) => CameraViewerScreen(feed: cam)))));
      }
    }
    return out.take(40).toList();
  }

  @override
  List<Widget>? buildActions(BuildContext context) => [
        if (query.isNotEmpty) IconButton(onPressed: () => query = '', icon: const Icon(Icons.clear_rounded)),
      ];

  @override
  Widget? buildLeading(BuildContext context) =>
      IconButton(onPressed: () => close(context, null), icon: const Icon(Icons.arrow_back_rounded));

  Widget _list(BuildContext context) {
    final hits = _hits(context);
    if (hits.isEmpty) {
      return const Center(child: EmptyState(icon: Icons.search_off_rounded, title: Msg('No matches', 'कोई परिणाम नहीं')));
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: hits.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
      itemBuilder: (context, i) {
        final h = hits[i];
        return ListTile(
          leading: CircleAvatar(backgroundColor: kSage.withValues(alpha: 0.16), child: Icon(h.icon, color: kForest)),
          title: Text(h.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text(h.sub, maxLines: 1, overflow: TextOverflow.ellipsis),
          onTap: () {
            close(context, null);
            if (origin.mounted) h.open(origin);
          },
        );
      },
    );
  }

  @override
  Widget buildResults(BuildContext context) => _list(context);

  @override
  Widget buildSuggestions(BuildContext context) => _list(context);
}

// ============================================================================
// §21 SECURITY — sign-in results, server address rule, app lock, session
//     guard (idle / background / silent refresh), lock screen, Security
//     screen (password, 2-step verification, signed-in devices).
// ============================================================================

/// Root navigator, so the lock screen and sign-out can navigate from anywhere
/// (even after the drawer that started them has closed).
final GlobalKey<NavigatorState> nayanNavigatorKey = GlobalKey<NavigatorState>();

/// Outcome of a sign-in step (password or 2-step code).
class LoginResult {
  const LoginResult.ok()
      : error = null,
        needsCode = false,
        backToPassword = false,
        retryAfter = null;
  const LoginResult.code()
      : error = null,
        needsCode = true,
        backToPassword = false,
        retryAfter = null;
  const LoginResult.fail(Msg this.error, {this.needsCode = false, this.backToPassword = false, this.retryAfter});

  final Msg? error;

  /// Show (or stay on) the 6-digit code step.
  final bool needsCode;

  /// Leave the code step (verification timed out / account locked).
  final bool backToPassword;

  /// 423: seconds until the account can try again.
  final int? retryAfter;

  bool get isOk => error == null && !needsCode;
}

const Msg _kCodeTimedOut =
    Msg('Verification timed out. Please sign in again.', 'सत्यापन का समय समाप्त हो गया। कृपया दोबारा साइन इन करें।');

/// Friendly, bilingual message for a failed sign-in call (§1 of the contract).
Msg authErrorMsg(ApiException x) {
  if (x.network) {
    return const Msg('Could not reach the server. Check your internet and try again.',
        'सर्वर से संपर्क नहीं हो सका। इंटरनेट जाँचकर दोबारा प्रयास करें।');
  }
  switch (x.status) {
    case 401:
      // The server may add how many attempts are left; keep its sentence.
      return Msg(x.message.isEmpty ? 'Incorrect email or password.' : x.message, 'ईमेल या पासवर्ड ग़लत है।');
    case 423:
      return Msg(x.message, 'बहुत बार ग़लत साइन इन हुआ। कुछ मिनट बाद फिर प्रयास करें।');
    case 429:
      return const Msg('Too many attempts from this network. Please wait a minute and try again.',
          'इस नेटवर्क से बहुत अधिक प्रयास। एक मिनट रुककर फिर प्रयास करें।');
    case 403:
      return Msg(x.message.isEmpty ? 'This account is disabled. Contact your administrator.' : x.message,
          'यह खाता निष्क्रिय है। अपने व्यवस्थापक से संपर्क करें।');
    default:
      return Msg(x.message, x.message);
  }
}

/// Plain http:// is allowed only for hosts on this phone or a private network.
bool isLocalHost(String host) {
  final h = host.toLowerCase();
  if (h == 'localhost' || h == '127.0.0.1' || h == '10.0.2.2') return true;
  final parts = h.split('.');
  if (parts.length != 4) return false;
  final n = parts.map(int.tryParse).toList();
  if (n.any((x) => x == null || x < 0 || x > 255)) return false;
  final a = n[0]!;
  final b = n[1]!;
  return a == 10 || (a == 192 && b == 168) || (a == 172 && b >= 16 && b <= 31);
}

/// Checks a server address. Null means OK (empty = demo mode).
Msg? serverUrlProblem(String raw) {
  final url = raw.trim();
  if (url.isEmpty) return null;
  final u = Uri.tryParse(url);
  if (u == null || (u.scheme != 'https' && u.scheme != 'http') || u.host.isEmpty) {
    return const Msg('Enter the full address, starting with https://', 'पूरा पता दर्ज करें, https:// से शुरू करके');
  }
  if (u.scheme == 'http' && !isLocalHost(u.host)) {
    return const Msg('Use https:// for a public server.', 'सार्वजनिक सर्वर के लिए https:// का उपयोग करें।');
  }
  return null;
}

enum LockCause { idle, background, expired }

/// Timing rules for the app lock and the silent refresh. Pure functions of
/// timestamps, so a phone that slept is judged correctly when it wakes.
class LockPolicy {
  static const Duration idleLimit = Duration(minutes: 15);
  static const Duration warnBefore = Duration(minutes: 1);
  static const Duration backgroundLimit = Duration(minutes: 5);
  static const Duration refreshWhenLeft = Duration(minutes: 3);
  static const Duration activeWithin = Duration(minutes: 5);

  /// What should lock the app now, or null.
  static LockCause? cause(
      {required DateTime now, required DateTime lastActivity, DateTime? backgroundAt, DateTime? expiresAt}) {
    if (expiresAt != null && !now.isBefore(expiresAt)) return LockCause.expired;
    if (backgroundAt != null && now.difference(backgroundAt) > backgroundLimit) return LockCause.background;
    if (now.difference(lastActivity) >= idleLimit) return LockCause.idle;
    return null;
  }

  /// Time left before the idle lock during the last minute; otherwise null.
  static Duration? warning(DateTime now, DateTime lastActivity) {
    final left = idleLimit - now.difference(lastActivity);
    if (left <= Duration.zero || left > warnBefore) return null;
    return left;
  }

  /// Refresh when < 3 min are left on the token and the user was active in
  /// the last 5 min.
  static bool shouldRefresh({required DateTime now, required DateTime lastActivity, DateTime? expiresAt}) {
    if (expiresAt == null) return false;
    final left = expiresAt.difference(now);
    return left > Duration.zero && left < refreshWhenLeft && now.difference(lastActivity) <= activeWithin;
  }

  static Msg reason(LockCause c) => switch (c) {
        LockCause.idle =>
          const Msg('Locked after 15 minutes without activity.', '15 मिनट तक कोई गतिविधि न होने पर लॉक किया गया।'),
        LockCause.background => const Msg('Locked because Nayan was in the background for more than 5 minutes.',
            'नयन 5 मिनट से अधिक समय तक पृष्ठभूमि में रहा, इसलिए लॉक किया गया।'),
        LockCause.expired =>
          const Msg('Your session expired. Please sign in again.', 'आपका सत्र समाप्त हो गया। कृपया दोबारा साइन इन करें।'),
      };
}

/// "4:05" for countdowns.
String fmtCountdown(Duration d) => '${d.inMinutes}:${two(d.inSeconds % 60)}';

/// One line of the password checklist.
class PwRule {
  const PwRule(this.label, this.ok);
  final Msg label;
  final bool ok;
}

/// The server's password policy, checked live while typing (the server
/// checks again and has the final word).
class PasswordPolicy {
  static const int minLength = 12;

  static const Set<String> _common = {
    'password', 'passw0rd', 'password1', 'password12', 'password123', 'password123!', 'password@123',
    'qwerty', 'qwertyuiop', 'qwerty123', 'iloveyou', 'welcome', 'welcome123', 'welcome@123', 'admin',
    'admin123', 'admin@123', 'letmein', 'india', 'india123', 'india@123', 'abc123', 'abcd1234',
    '123456789012', '1234567890', '111111111111', 'changeme', 'changeme123',
  };

  static bool isCommon(String pw) {
    final l = pw.toLowerCase();
    return _common.contains(l) || _common.contains(l.replaceAll(RegExp(r'[^a-z]'), ''));
  }

  static List<PwRule> rules(String pw, {String name = '', String email = '', String current = ''}) {
    final lower = pw.toLowerCase();
    final local = email.split('@').first.toLowerCase();
    final names = name.toLowerCase().split(RegExp(r'\s+')).where((p) => p.length >= 3);
    final personal = (local.length >= 3 && lower.contains(local)) || names.any((p) => lower.contains(p));
    return [
      PwRule(const Msg('At least 12 characters', 'कम से कम 12 अक्षर'), pw.length >= minLength),
      PwRule(const Msg('An uppercase letter (A–Z)', 'एक बड़ा अक्षर (A–Z)'), RegExp('[A-Z]').hasMatch(pw)),
      PwRule(const Msg('A lowercase letter (a–z)', 'एक छोटा अक्षर (a–z)'), RegExp('[a-z]').hasMatch(pw)),
      PwRule(const Msg('A number (0–9)', 'एक अंक (0–9)'), RegExp('[0-9]').hasMatch(pw)),
      PwRule(const Msg('A symbol (such as ! @ # ?)', 'एक चिह्न (जैसे ! @ # ?)'), RegExp(r'[^A-Za-z0-9]').hasMatch(pw)),
      PwRule(const Msg('Does not contain your name or email', 'इसमें आपका नाम या ईमेल नहीं है'), pw.isNotEmpty && !personal),
      PwRule(const Msg('Not a common password', 'आम पासवर्ड नहीं है'), pw.isNotEmpty && !isCommon(pw)),
      PwRule(const Msg('Different from your current password', 'मौजूदा पासवर्ड से अलग है'), pw.isNotEmpty && pw != current),
    ];
  }

  /// 0 (empty/weak) … 4 (strong), for the meter.
  static int strength(String pw) {
    if (pw.isEmpty || isCommon(pw)) return 0;
    var classes = 0;
    for (final r in [RegExp('[A-Z]'), RegExp('[a-z]'), RegExp('[0-9]'), RegExp(r'[^A-Za-z0-9]')]) {
      if (r.hasMatch(pw)) classes++;
    }
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= minLength) score++;
    if (classes >= 3) score++;
    if (classes == 4 && pw.length >= 16) score++;
    return score;
  }
}

/// "Last signed in 27 Sep 2026, 10:32 AM · 10.0.0.2" for the profile tile.
String lastSignInLine(AppState s, AppUser u) {
  final at = u.lastLoginAt;
  if (at == null) {
    return const Msg('Password, 2-step verification, devices', 'पासवर्ड, 2-चरणीय सत्यापन, डिवाइस').of(s.lang);
  }
  final ip = u.lastLoginIp.isEmpty ? '' : ' · ${u.lastLoginIp}';
  return Msg('Last signed in ${fmtDateTime(at, LangMode.en)}$ip', 'पिछला साइन इन ${fmtDateTime(at, LangMode.hi)}$ip')
      .of(s.lang);
}

/// Label style used by the main buttons: "Sign in · साइन इन" in bilingual mode.
String _btn(LangMode lang, Msg m) => lang == LangMode.bi ? '${m.en} · ${m.hi}' : m.of(lang);

// ---------------------------------------------------------------------------
// Shared sign-in steps for the login and lock screens: no double submit,
// error message, 2-step code step, and the "try again in m:ss" wait (423).
// ---------------------------------------------------------------------------
mixin _SignInFlow<T extends StatefulWidget> on State<T> {
  final TextEditingController codeCtrl = TextEditingController();
  bool busy = false;
  bool codeStep = false;
  bool recovery = false;
  Msg? error;
  DateTime? _retryAt;
  Timer? _retryTimer;

  Duration get retryLeft {
    final at = _retryAt;
    if (at == null) return Duration.zero;
    final ms = at.difference(DateTime.now()).inMilliseconds;
    return ms <= 0 ? Duration.zero : Duration(seconds: (ms / 1000).ceil());
  }

  bool get waiting => retryLeft > Duration.zero;

  void disposeFlow() {
    codeCtrl.dispose();
    _retryTimer?.cancel();
  }

  /// Runs one step; true when the session is ready.
  Future<bool> runStep(Future<LoginResult> Function(AppState s) step) async {
    if (busy || waiting) return false;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    final r = await step(AppScope.read(context));
    if (!mounted) return false;
    setState(() {
      busy = false;
      error = r.error;
      if (r.needsCode) {
        if (!codeStep) recovery = false;
        codeStep = true;
        codeCtrl.clear();
      } else if (r.backToPassword) {
        codeStep = false;
      }
    });
    _startWait(r.retryAfter);
    return r.isOk;
  }

  void backToPassword() {
    AppScope.read(context).cancelCode();
    setState(() {
      codeStep = false;
      error = null;
      codeCtrl.clear();
    });
  }

  void toggleRecovery() => setState(() {
        recovery = !recovery;
        codeCtrl.clear();
      });

  void _startWait(int? seconds) {
    _retryTimer?.cancel();
    _retryTimer = null;
    if (seconds == null || seconds <= 0) {
      _retryAt = null;
      return;
    }
    _retryAt = DateTime.now().add(Duration(seconds: seconds));
    _retryTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || !waiting) t.cancel();
      if (mounted) setState(() {});
    });
  }

  /// Main button text; shows the wait while the account is locked (423).
  String buttonLabel(LangMode lang, Msg action) {
    if (!waiting) return _btn(lang, action);
    final left = fmtCountdown(retryLeft);
    return _btn(lang, Msg('Try again in $left', '$left बाद प्रयास करें'));
  }
}

/// Red message box under the sign-in fields.
class _ErrorBox extends StatelessWidget {
  const _ErrorBox(this.msg);
  final Msg msg;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: cs.error.withValues(alpha: 0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, color: cs.error, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Bi(msg.en, msg.hi, style: TextStyle(color: cs.error, fontSize: 14))),
        ],
      ),
    );
  }
}

/// The 2-step step: 6-digit code (paste works, submits on the 6th digit) or
/// a recovery code, plus "Back".
class _CodeStepFields extends StatelessWidget {
  const _CodeStepFields({
    required this.controller,
    required this.recovery,
    required this.onToggleRecovery,
    required this.onBack,
    required this.onSubmit,
  });
  final TextEditingController controller;
  final bool recovery;
  final VoidCallback onToggleRecovery;
  final VoidCallback onBack;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Icon(Icons.verified_user_outlined, color: cs.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Bi('2-step verification', '2-चरणीय सत्यापन', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 6),
        recovery
            ? Bi('Enter one of your recovery codes (XXXX-XXXX). Each code works only once.',
                'अपना कोई एक रिकवरी कोड (XXXX-XXXX) दर्ज करें। हर कोड केवल एक बार चलता है।',
                style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant))
            : Bi('Enter the 6-digit code from your authenticator app.', 'अपने ऑथेंटिकेटर ऐप से 6 अंकों का कोड दर्ज करें।',
                style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
        const SizedBox(height: 14),
        TextField(
          key: ValueKey<bool>(recovery),
          controller: controller,
          autofocus: true,
          autocorrect: false,
          textAlign: TextAlign.center,
          keyboardType: recovery ? TextInputType.visiblePassword : TextInputType.number,
          textInputAction: TextInputAction.done,
          autofillHints: const [AutofillHints.oneTimeCode],
          maxLength: recovery ? 9 : 6,
          inputFormatters: [
            recovery
                ? FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9-]'))
                : FilteringTextInputFormatter.digitsOnly,
          ],
          style: const TextStyle(fontSize: 22, letterSpacing: 6, fontWeight: FontWeight.w700),
          onChanged: (v) {
            if (!recovery && v.length == 6) onSubmit();
          },
          onSubmitted: (_) => onSubmit(),
          decoration: fieldDecoration(context,
                  label: recovery ? tx(context, 'Recovery code', 'रिकवरी कोड') : tx(context, '6-digit code', '6 अंकों का कोड'),
                  icon: Icons.pin_outlined)
              .copyWith(counterText: ''),
        ),
        const SizedBox(height: 4),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            TextButton.icon(
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded, size: 18),
              label: Text(tx(context, 'Back', 'वापस')),
            ),
            TextButton(
              onPressed: onToggleRecovery,
              child: Text(recovery
                  ? tx(context, 'Use the authenticator code', 'ऑथेंटिकेटर कोड इस्तेमाल करें')
                  : tx(context, 'Use a recovery code instead', 'इसके बजाय रिकवरी कोड इस्तेमाल करें')),
            ),
          ],
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Session guard: wraps the whole app (MaterialApp.builder). Pointer activity
// feeds the idle timer; the lifecycle observer judges background time by
// timestamps; a 1 s tick shows the last-minute warning, locks, and runs the
// silent token refresh. Locking pushes [LockScreen] on the root navigator.
// ---------------------------------------------------------------------------
class SessionGuard extends StatefulWidget {
  const SessionGuard({super.key, required this.child});
  final Widget child;

  @override
  State<SessionGuard> createState() => _SessionGuardState();
}

class _SessionGuardState extends State<SessionGuard> with WidgetsBindingObserver {
  Timer? _tick;
  DateTime? _backgroundAt;
  Duration? _warnLeft; // set while the "locking in 0:45" card shows
  bool _lockOpen = false;
  AppState? _app;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => _check());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final app = AppScope.read(context);
    if (!identical(app, _app)) {
      _app?.removeListener(_onApp);
      _app = app..addListener(_onApp);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tick?.cancel();
    _app?.removeListener(_onApp);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final app = _app;
    if (app == null) return;
    if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden) {
      _backgroundAt ??= DateTime.now();
    } else if (state == AppLifecycleState.resumed) {
      final since = _backgroundAt;
      _backgroundAt = null;
      app.checkLock(backgroundAt: since);
      _check();
    }
  }

  void _check() {
    final app = _app;
    if (app == null || !mounted) return;
    if (app.user == null || app.locked) {
      if (_warnLeft != null) setState(() => _warnLeft = null);
      return;
    }
    app.checkLock();
    if (app.locked) return; // _onApp opens the lock screen
    final left = LockPolicy.warning(DateTime.now(), app.lastActivity);
    if (left?.inSeconds != _warnLeft?.inSeconds) setState(() => _warnLeft = left);
    unawaited(app.maybeRefresh());
  }

  void _activity() {
    _app?.noteActivity();
    if (_warnLeft != null) setState(() => _warnLeft = null);
  }

  void _onApp() {
    final app = _app;
    if (app == null || !app.locked || app.user == null || _lockOpen) return;
    _lockOpen = true;
    // Navigate after the current frame (the change may arrive mid-build).
    WidgetsBinding.instance.addPostFrameCallback((_) => _openLock());
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  void _openLock() {
    final nav = nayanNavigatorKey.currentState;
    final app = _app;
    if (nav == null || app == null || !app.locked) {
      _lockOpen = false;
      return;
    }
    if (mounted && _warnLeft != null) setState(() => _warnLeft = null);
    nav.push(MaterialPageRoute<void>(builder: (_) => const LockScreen())).then((_) => _lockOpen = false);
  }

  @override
  Widget build(BuildContext context) {
    final left = _warnLeft;
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _activity(),
      onPointerSignal: (_) => _activity(),
      child: Stack(
        fit: StackFit.expand,
        children: [
          widget.child,
          if (left != null)
            Positioned(
              left: 16,
              right: 16,
              bottom: 24,
              child: SafeArea(child: _IdleWarning(left: left, onStay: _activity)),
            ),
        ],
      ),
    );
  }
}

/// Last-minute card: "For your security Nayan will lock in 0:45".
class _IdleWarning extends StatelessWidget {
  const _IdleWarning({required this.left, required this.onStay});
  final Duration left;
  final VoidCallback onStay;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final t = fmtCountdown(left);
    return Material(
      type: MaterialType.transparency,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Panel(
            tint: kSand,
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            child: Row(
              children: [
                Icon(Icons.lock_clock_outlined, color: cs.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Bi('For your security Nayan will lock in $t', 'सुरक्षा के लिए नयन $t में लॉक हो जाएगा',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: onStay,
                  child: Text(s.lang == LangMode.hi ? 'जारी रखें' : 'Stay signed in'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Lock screen: same account, password (+ 2-step code if the server asks).
// Local drafts and queued evidence are untouched.
// ---------------------------------------------------------------------------
class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> with _SignInFlow<LockScreen> {
  final _password = TextEditingController();
  bool _hide = true;

  @override
  void dispose() {
    _password.dispose();
    disposeFlow();
    super.dispose();
  }

  Future<void> _unlock() async {
    final ok = await runStep(
        (s) => codeStep ? s.verifyCode(codeCtrl.text) : s.login(s.user?.email ?? '', _password.text));
    if (!ok || !mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final u = s.user;
    final reason = s.lockReason;
    final pending = s.pendingEvidenceCount;
    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              const TricolourBar(height: 4),
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 440),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Center(child: NayanLogo(width: 84)),
                          const SizedBox(height: 14),
                          Bi('Locked for your security', 'आपकी सुरक्षा के लिए लॉक किया गया',
                              center: true, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: cs.primary)),
                          if (reason != null) ...[
                            const SizedBox(height: 6),
                            Bi(reason.en, reason.hi,
                                center: true, style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
                          ],
                          const SizedBox(height: 18),
                          Panel(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(children: [
                                  CircleAvatar(
                                    radius: 24,
                                    backgroundColor: cs.primary,
                                    child: Text(u?.initials ?? '?',
                                        style: TextStyle(color: cs.onPrimary, fontWeight: FontWeight.w700)),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(u?.name ?? '', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                                        Text(u?.email ?? '', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                                      ],
                                    ),
                                  ),
                                ]),
                                const SizedBox(height: 16),
                                if (codeStep)
                                  _CodeStepFields(
                                    controller: codeCtrl,
                                    recovery: recovery,
                                    onToggleRecovery: toggleRecovery,
                                    onBack: backToPassword,
                                    onSubmit: _unlock,
                                  )
                                else
                                  TextField(
                                    controller: _password,
                                    obscureText: _hide,
                                    autofocus: true,
                                    textInputAction: TextInputAction.done,
                                    autofillHints: const [AutofillHints.password],
                                    onSubmitted: (_) => _unlock(),
                                    decoration: fieldDecoration(context,
                                        label: tx(context, 'Password', 'पासवर्ड'),
                                        icon: Icons.lock_outline_rounded,
                                        suffix: IconButton(
                                          tooltip: _hide
                                              ? tx(context, 'Show password', 'पासवर्ड दिखाएँ')
                                              : tx(context, 'Hide password', 'पासवर्ड छिपाएँ'),
                                          onPressed: () => setState(() => _hide = !_hide),
                                          icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                        )),
                                  ),
                                if (error != null) ...[
                                  const SizedBox(height: 14),
                                  _ErrorBox(error!),
                                ],
                                const SizedBox(height: 18),
                                SizedBox(
                                  height: 52,
                                  child: FilledButton(
                                    onPressed: busy || waiting ? null : _unlock,
                                    child: busy
                                        ? const SizedBox(
                                            width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4))
                                        : Text(
                                            buttonLabel(s.lang,
                                                codeStep ? const Msg('Verify', 'सत्यापित करें') : const Msg('Unlock', 'अनलॉक करें')),
                                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (pending > 0) ...[
                            const SizedBox(height: 14),
                            Panel(
                              tint: kSage,
                              padding: const EdgeInsets.all(14),
                              child: Row(children: [
                                Icon(Icons.cloud_queue_rounded, color: cs.primary),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Bi('$pending file${pending == 1 ? '' : 's'} waiting to upload — safe on this phone.',
                                      '$pending फ़ाइलें अपलोड होने बाकी हैं — इस फ़ोन पर सुरक्षित हैं।',
                                      style: const TextStyle(fontSize: 13)),
                                ),
                              ]),
                            ),
                          ],
                          const SizedBox(height: 10),
                          TextButton.icon(
                            onPressed: busy ? null : () => signOutFlow(context),
                            icon: Icon(Icons.logout_rounded, color: cs.error),
                            label: Text(tx(context, 'Sign out', 'साइन आउट'),
                                style: TextStyle(color: cs.error, fontWeight: FontWeight.w600)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Security screen (Profile → Security): last sign-in, change password,
// 2-step verification, signed-in devices. Demo accounts get a clear note.
// ---------------------------------------------------------------------------
class SecurityScreen extends StatelessWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    if (s.user == null) return const SizedBox.shrink();
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Security', 'सुरक्षा')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        children: [
          if (s.isDemo) ...[
            const _NeedsServerNote(),
            const SizedBox(height: 16),
          ],
          const _LastSignInPanel(),
          const SizedBox(height: 16),
          const _PasswordPanel(),
          const SizedBox(height: 16),
          const _MfaPanel(),
          const SizedBox(height: 16),
          const _SessionsPanel(),
        ],
      ),
    );
  }
}

class _NeedsServerNote extends StatelessWidget {
  const _NeedsServerNote();

  @override
  Widget build(BuildContext context) {
    return Panel(
      tint: kSand,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, color: kSand),
          const SizedBox(width: 12),
          Expanded(
            child: Bi(
                'Test account — password, 2-step verification and device controls are available when connected to the server. Nothing here changes a real account.',
                'परीक्षण खाता — पासवर्ड, 2-चरणीय सत्यापन और डिवाइस नियंत्रण सर्वर से जुड़ने पर उपलब्ध होते हैं। यहाँ से किसी असली खाते में कोई बदलाव नहीं होता।',
                style: const TextStyle(fontSize: 14)),
          ),
        ],
      ),
    );
  }
}

class _LastSignInPanel extends StatelessWidget {
  const _LastSignInPanel();

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final u = s.user;
    if (u == null) return const SizedBox.shrink();
    final at = u.lastLoginAt;
    final String when;
    if (at != null) {
      when = fmtDateTime(at, s.lang);
    } else if (u.isDemo) {
      when = tx(context, 'Not recorded for test accounts', 'परीक्षण खातों के लिए दर्ज नहीं');
    } else {
      when = tx(context, 'This is your first sign-in', 'यह आपका पहला साइन इन है');
    }
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle('Last sign-in', 'पिछला साइन इन', icon: Icons.history_rounded),
          InfoRow(icon: Icons.schedule_rounded, en: 'When', hi: 'कब', value: when),
          InfoRow(
              icon: Icons.lan_outlined,
              en: 'Network address',
              hi: 'नेटवर्क पता',
              value: u.lastLoginIp.isEmpty ? '—' : u.lastLoginIp),
          const SizedBox(height: 6),
          Bi("Don't recognise it? Change your password and sign out the other devices.",
              'पहचान में नहीं आया? पासवर्ड बदलें और बाकी डिवाइस से साइन आउट करें।',
              style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _PasswordPanel extends StatefulWidget {
  const _PasswordPanel();

  @override
  State<_PasswordPanel> createState() => _PasswordPanelState();
}

class _PasswordPanelState extends State<_PasswordPanel> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _hide = true;
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final s = AppScope.read(context);
    final u = s.user;
    final be = s.backend;
    if (u == null || be == null || _busy) return;
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    try {
      final n = await be.changePassword(u, _current.text, _next.text);
      if (!mounted) return;
      _current.clear();
      _next.clear();
      _confirm.clear();
      snack(
        context,
        n > 0 ? 'Password changed. $n other sign-in${n == 1 ? ' was' : 's were'} signed out.' : 'Password changed.',
        n > 0 ? 'पासवर्ड बदल गया। $n अन्य साइन इन बंद किए गए।' : 'पासवर्ड बदल गया।',
      );
    } on ApiException catch (x) {
      final wrongCurrent = x.status == 401 && x.message.toLowerCase().contains('current password');
      if (x.status == 401 && !wrongCurrent) s.handleApiError(x);
      if (mounted) {
        snack(context, x.message, wrongCurrent ? 'मौजूदा पासवर्ड ग़लत है।' : x.message, error: true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final u = s.user;
    if (u == null) return const SizedBox.shrink();
    final pw = _next.text;
    final rules = PasswordPolicy.rules(pw, name: u.name, email: u.email, current: _current.text);
    final strength = PasswordPolicy.strength(pw);
    const meterColors = [kRed, kRed, kAmber, kGreen, kGreen];
    const meterLabels = [
      Msg('Too weak', 'बहुत कमज़ोर'),
      Msg('Weak', 'कमज़ोर'),
      Msg('Fair', 'ठीक'),
      Msg('Good', 'अच्छा'),
      Msg('Strong', 'मज़बूत'),
    ];
    final matches = _confirm.text.isNotEmpty && _confirm.text == pw;
    final canSave = !s.isDemo &&
        !_busy &&
        _current.text.isNotEmpty &&
        rules.every((r) => r.ok) &&
        matches;
    Widget field(TextEditingController c, String en, String hi, List<String> hints) => TextField(
          controller: c,
          obscureText: _hide,
          enabled: !s.isDemo,
          autofillHints: hints,
          onChanged: (_) => setState(() {}),
          decoration: fieldDecoration(context, label: tx(context, en, hi), icon: Icons.lock_outline_rounded),
        );
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle('Change password', 'पासवर्ड बदलें',
              icon: Icons.password_rounded,
              trailing: IconButton(
                tooltip: _hide ? tx(context, 'Show passwords', 'पासवर्ड दिखाएँ') : tx(context, 'Hide passwords', 'पासवर्ड छिपाएँ'),
                onPressed: () => setState(() => _hide = !_hide),
                icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
              )),
          field(_current, 'Current password', 'मौजूदा पासवर्ड', const [AutofillHints.password]),
          const SizedBox(height: 12),
          field(_next, 'New password', 'नया पासवर्ड', const [AutofillHints.newPassword]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: pw.isEmpty ? 0 : (strength + 1) / 5,
                  minHeight: 6,
                  color: meterColors[strength],
                  backgroundColor: cs.outlineVariant.withValues(alpha: 0.5),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(pw.isEmpty ? '' : meterLabels[strength].of(s.lang),
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: meterColors[strength])),
          ]),
          const SizedBox(height: 10),
          for (final r in rules)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(r.ok ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded,
                      size: 18, color: r.ok ? kGreen : cs.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(child: Bi(r.label.en, r.label.hi, style: const TextStyle(fontSize: 13))),
                ],
              ),
            ),
          const SizedBox(height: 12),
          field(_confirm, 'Confirm new password', 'नया पासवर्ड दोबारा', const [AutofillHints.newPassword]),
          if (_confirm.text.isNotEmpty && !matches) ...[
            const SizedBox(height: 6),
            Bi('The two new passwords do not match.', 'दोनों नए पासवर्ड मेल नहीं खाते।',
                style: TextStyle(fontSize: 13, color: cs.error)),
          ],
          const SizedBox(height: 14),
          SizedBox(
            height: 50,
            child: FilledButton.icon(
              onPressed: canSave ? _save : null,
              icon: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.check_rounded),
              label: Text(_btn(s.lang, const Msg('Change password', 'पासवर्ड बदलें'))),
            ),
          ),
          const SizedBox(height: 6),
          Bi('Other devices may be signed out after the change.', 'बदलाव के बाद अन्य डिवाइस से साइन आउट हो सकता है।',
              style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Password (and optionally a code) for turning 2-step verification on/off.
Future<({String password, String code})?> _askCredentials(BuildContext context,
    {required Msg title, required bool withCode}) async {
  final pw = TextEditingController();
  final code = TextEditingController();
  final res = await showDialog<({String password, String code})>(
    context: context,
    builder: (c) => AlertDialog(
      title: Bi(title.en, title.hi, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: pw,
            obscureText: true,
            autofocus: true,
            autofillHints: const [AutofillHints.password],
            decoration: fieldDecoration(c, label: tx(c, 'Your password', 'आपका पासवर्ड'), icon: Icons.lock_outline_rounded),
          ),
          if (withCode) ...[
            const SizedBox(height: 12),
            TextField(
              controller: code,
              keyboardType: TextInputType.visiblePassword,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9-]'))],
              decoration: fieldDecoration(c,
                  label: tx(c, 'Authenticator or recovery code', 'ऑथेंटिकेटर या रिकवरी कोड'), icon: Icons.pin_outlined),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(tx(c, 'Cancel', 'रद्द करें'))),
        FilledButton(
          onPressed: () => Navigator.of(c).pop((password: pw.text, code: code.text.trim().toUpperCase())),
          child: Text(tx(c, 'Continue', 'आगे बढ़ें')),
        ),
      ],
    ),
  );
  pw.dispose();
  code.dispose();
  if (res == null || res.password.isEmpty || (withCode && res.code.isEmpty)) return null;
  return res;
}

class _MfaPanel extends StatefulWidget {
  const _MfaPanel();

  @override
  State<_MfaPanel> createState() => _MfaPanelState();
}

class _MfaPanelState extends State<_MfaPanel> {
  bool _busy = false;

  /// Setup errors: a 401 here is "Incorrect password", not a dead session,
  /// unless the server says otherwise.
  void _fail(AppState s, ApiException x) {
    final wrongInput = x.status == 400 || (x.status == 401 && x.message.toLowerCase().contains('incorrect'));
    if (x.status == 401 && !wrongInput) s.handleApiError(x);
    if (mounted) snack(context, x.message, x.message, error: true);
  }

  Future<void> _turnOn() async {
    final s = AppScope.read(context);
    final u = s.user;
    final be = s.backend;
    if (u == null || be == null) return;
    final cred = await _askCredentials(context,
        title: const Msg('Turn on 2-step verification', '2-चरणीय सत्यापन चालू करें'), withCode: false);
    if (cred == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final setup = await be.mfaSetup(u, cred.password);
      if (!mounted) return;
      final codes = await showDialog<List<String>>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _MfaSetupDialog(setup: setup, backend: be, user: u),
      );
      if (codes == null || !mounted) return;
      s.setMfaEnabled(true);
      await showRecoveryCodes(context, codes);
    } on ApiException catch (x) {
      _fail(s, x);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _turnOff() async {
    final s = AppScope.read(context);
    final u = s.user;
    final be = s.backend;
    if (u == null || be == null) return;
    final cred = await _askCredentials(context,
        title: const Msg('Turn off 2-step verification', '2-चरणीय सत्यापन बंद करें'), withCode: true);
    if (cred == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await be.mfaDisable(u, cred.password, cred.code);
      s.setMfaEnabled(false);
      if (mounted) snack(context, '2-step verification is off.', '2-चरणीय सत्यापन बंद है।');
    } on ApiException catch (x) {
      _fail(s, x);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final u = s.user;
    if (u == null) return const SizedBox.shrink();
    final on = u.mfaEnabled;
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle('2-step verification', '2-चरणीय सत्यापन',
              icon: Icons.verified_user_outlined,
              trailing: Pill(
                label: on ? const Msg('On', 'चालू') : const Msg('Off', 'बंद'),
                color: on ? kGreen : kAmber,
                icon: on ? Icons.check_rounded : Icons.remove_rounded,
              )),
          Bi('After your password, Nayan asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).',
              'पासवर्ड के बाद नयन ऑथेंटिकेटर ऐप (Google Authenticator, Microsoft Authenticator, Authy…) से 6 अंकों का कोड माँगता है।',
              style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
          const SizedBox(height: 14),
          SizedBox(
            height: 48,
            child: on
                ? OutlinedButton.icon(
                    onPressed: s.isDemo || _busy ? null : _turnOff,
                    icon: const Icon(Icons.lock_open_rounded),
                    label: Text(_btn(s.lang, const Msg('Turn off', 'बंद करें'))),
                  )
                : FilledButton.icon(
                    onPressed: s.isDemo || _busy ? null : _turnOn,
                    icon: _busy
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.shield_rounded),
                    label: Text(_btn(s.lang, const Msg('Turn on', 'चालू करें'))),
                  ),
          ),
        ],
      ),
    );
  }
}

/// Secret key in blocks of 4 (with Copy), the otpauth link, and the first
/// code to confirm. Pops with the recovery codes once enabled.
class _MfaSetupDialog extends StatefulWidget {
  const _MfaSetupDialog({required this.setup, required this.backend, required this.user});
  final MfaSetup setup;
  final Backend backend;
  final AppUser user;

  @override
  State<_MfaSetupDialog> createState() => _MfaSetupDialogState();
}

class _MfaSetupDialogState extends State<_MfaSetupDialog> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  static String _grouped(String secret) {
    final clean = secret.replaceAll(RegExp(r'\s+'), '');
    final out = StringBuffer();
    for (var i = 0; i < clean.length; i += 4) {
      if (i > 0) out.write(' ');
      out.write(clean.substring(i, math.min(i + 4, clean.length)));
    }
    return out.toString();
  }

  Future<void> _copy(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) snack(context, 'Copied.', 'कॉपी किया गया।');
  }

  Future<void> _openLink() async {
    var ok = false;
    try {
      ok = await launchUrl(Uri.parse(widget.setup.otpauthUri), mode: LaunchMode.externalApplication);
    } catch (_) {
      ok = false;
    }
    if (!ok && mounted) {
      snack(context, 'No authenticator app opened. Type the key into the app instead.',
          'कोई ऑथेंटिकेटर ऐप नहीं खुला। कुंजी ऐप में टाइप करें।');
    }
  }

  Future<void> _confirm() async {
    final code = _code.text.trim();
    if (code.length != 6 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final codes = await widget.backend.mfaEnable(widget.user, code);
      if (!mounted) return;
      Navigator.of(context).pop(codes);
    } on ApiException catch (x) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = x.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final secret = _grouped(widget.setup.secret);
    return AlertDialog(
      title: Bi('Set up your authenticator app', 'ऑथेंटिकेटर ऐप सेट करें',
          style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Bi('1. In the app, add an account and enter this key (time-based):',
                '1. ऐप में खाता जोड़ें और यह कुंजी (समय-आधारित) दर्ज करें:',
                style: const TextStyle(fontSize: 14)),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
              decoration: BoxDecoration(
                color: kSage.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: kSage.withValues(alpha: 0.35)),
              ),
              child: Row(children: [
                Expanded(
                  child: SelectableText(secret,
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: 1)),
                ),
                IconButton(
                  tooltip: tx(context, 'Copy key', 'कुंजी कॉपी करें'),
                  onPressed: () => _copy(widget.setup.secret.replaceAll(RegExp(r'\s+'), '')),
                  icon: const Icon(Icons.copy_rounded),
                ),
              ]),
            ),
            if (widget.setup.otpauthUri.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 4, children: [
                TextButton.icon(
                  onPressed: _openLink,
                  icon: const Icon(Icons.open_in_new_rounded, size: 18),
                  label: Text(tx(context, 'Open in authenticator app', 'ऑथेंटिकेटर ऐप में खोलें')),
                ),
                TextButton.icon(
                  onPressed: () => _copy(widget.setup.otpauthUri),
                  icon: const Icon(Icons.link_rounded, size: 18),
                  label: Text(tx(context, 'Copy setup link', 'सेटअप लिंक कॉपी करें')),
                ),
              ]),
            ],
            const SizedBox(height: 12),
            Bi('2. Enter the 6-digit code the app shows:', '2. ऐप में दिख रहा 6 अंकों का कोड दर्ज करें:',
                style: const TextStyle(fontSize: 14)),
            const SizedBox(height: 8),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              maxLength: 6,
              autofillHints: const [AutofillHints.oneTimeCode],
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(fontSize: 20, letterSpacing: 6, fontWeight: FontWeight.w700),
              onChanged: (v) {
                setState(() {});
                if (v.length == 6) _confirm();
              },
              decoration: fieldDecoration(context, label: tx(context, '6-digit code', '6 अंकों का कोड'), icon: Icons.pin_outlined)
                  .copyWith(counterText: ''),
            ),
            if (_error != null) ...[
              const SizedBox(height: 6),
              Text(_error!, style: TextStyle(color: cs.error, fontSize: 13)),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(), child: Text(tx(context, 'Cancel', 'रद्द करें'))),
        FilledButton(
          onPressed: _busy || _code.text.trim().length != 6 ? null : _confirm,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(tx(context, 'Turn on', 'चालू करें')),
        ),
      ],
    );
  }
}

/// Recovery codes, shown once, with Copy.
Future<void> showRecoveryCodes(BuildContext context, List<String> codes) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (c) {
      final cs = Theme.of(c).colorScheme;
      return AlertDialog(
        title: Bi('Save your recovery codes', 'अपने रिकवरी कोड सहेजें',
            style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Bi('2-step verification is on. If you lose your phone, each code below signs you in once. They are shown only now — keep them somewhere safe, not on this phone.',
                  '2-चरणीय सत्यापन चालू है। फ़ोन खो जाने पर नीचे का हर कोड एक बार साइन इन कराता है। ये केवल अभी दिखेंगे — इन्हें इस फ़ोन से अलग किसी सुरक्षित जगह रखें।',
                  style: TextStyle(fontSize: 14, color: cs.onSurfaceVariant)),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: kSage.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kSage.withValues(alpha: 0.35)),
                ),
                child: Wrap(
                  spacing: 18,
                  runSpacing: 6,
                  children: [
                    for (final code in codes)
                      SelectableText(code,
                          style: const TextStyle(fontFamily: 'monospace', fontSize: 15, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: codes.join('\n')));
              if (c.mounted) snack(c, 'Recovery codes copied.', 'रिकवरी कोड कॉपी किए गए।');
            },
            icon: const Icon(Icons.copy_rounded, size: 18),
            label: Text(tx(c, 'Copy all', 'सभी कॉपी करें')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(c).pop(),
            child: Text(tx(c, 'I have saved them', 'मैंने सहेज लिए')),
          ),
        ],
      );
    },
  );
}

class _SessionsPanel extends StatefulWidget {
  const _SessionsPanel();

  @override
  State<_SessionsPanel> createState() => _SessionsPanelState();
}

class _SessionsPanelState extends State<_SessionsPanel> {
  List<DeviceSession>? _items;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!mounted) return;
    final s = AppScope.read(context);
    final u = s.user;
    final be = s.backend;
    if (u == null || be == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final items = await be.sessions(u);
      if (!mounted) return;
      setState(() => _items = items);
    } on ApiException catch (x) {
      s.handleApiError(x);
      if (mounted) setState(() => _error = x.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _run(Future<void> Function(AppState s, AppUser u, Backend be) action) async {
    final s = AppScope.read(context);
    final u = s.user;
    final be = s.backend;
    if (u == null || be == null || _busy) return;
    setState(() => _busy = true);
    try {
      await action(s, u, be);
    } on ApiException catch (x) {
      s.handleApiError(x);
      if (mounted) snack(context, x.message, x.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    await _load();
  }

  Future<void> _signOutOne(DeviceSession d) async {
    final ok = await confirmDialog(
      context,
      title: const Msg('Sign out this device?', 'इस डिवाइस से साइन आउट करें?'),
      body: Msg(d.device, d.device),
      confirm: const Msg('Sign out', 'साइन आउट'),
      danger: true,
    );
    if (!ok || !mounted) return;
    await _run((s, u, be) => be.revokeSession(u, d.id));
  }

  Future<void> _signOutOthers() async {
    final ok = await confirmDialog(
      context,
      title: const Msg('Sign out all other devices?', 'बाकी सभी डिवाइस से साइन आउट करें?'),
      body: const Msg('This phone stays signed in.', 'यह फ़ोन साइन इन रहेगा।'),
      confirm: const Msg('Sign out others', 'बाकी से साइन आउट'),
      danger: true,
    );
    if (!ok || !mounted) return;
    await _run((s, u, be) async {
      final n = await be.logoutOthers(u);
      if (mounted) {
        snack(context, '$n other device${n == 1 ? '' : 's'} signed out.', '$n अन्य डिवाइस से साइन आउट किया गया।');
      }
    });
  }

  static IconData _iconFor(String device) {
    final d = device.toLowerCase();
    if (d.contains('android') || d.contains('iphone') || d.contains('ios') || d.contains('app')) {
      return Icons.phone_android_rounded;
    }
    return Icons.computer_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final cs = Theme.of(context).colorScheme;
    final items = _items;
    final others = items?.where((d) => !d.current).length ?? 0;
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle('Signed-in devices', 'साइन-इन डिवाइस',
              icon: Icons.devices_other_rounded,
              trailing: IconButton(
                tooltip: tx(context, 'Refresh', 'रीफ़्रेश करें'),
                onPressed: _busy ? null : _load,
                icon: const Icon(Icons.refresh_rounded),
              )),
          if (items == null && _busy) const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator())),
          if (_error != null) Text(_error!, style: TextStyle(color: cs.error, fontSize: 13)),
          if (items != null && items.isEmpty)
            Bi('No devices to show.', 'दिखाने के लिए कोई डिवाइस नहीं।', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
          for (final d in items ?? const <DeviceSession>[])
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: CircleAvatar(
                backgroundColor: cs.primary.withValues(alpha: 0.12),
                child: Icon(_iconFor(d.device), color: cs.primary),
              ),
              title: Row(children: [
                Flexible(child: Text(d.device, style: const TextStyle(fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
                if (d.current) ...[
                  const SizedBox(width: 6),
                  const Pill(label: Msg('This device', 'यह डिवाइस'), color: kGreen),
                ],
              ]),
              subtitle: Text([
                if (d.lastSeenAt != null) '${tx(context, 'Active', 'सक्रिय')} ${fmtDateTime(d.lastSeenAt!, s.lang)}',
                if (d.ip.isNotEmpty) d.ip,
              ].join(' · ')),
              trailing: d.current
                  ? null
                  : IconButton(
                      tooltip: tx(context, 'Sign out this device', 'इस डिवाइस से साइन आउट'),
                      onPressed: _busy || s.isDemo ? null : () => _signOutOne(d),
                      icon: Icon(Icons.logout_rounded, color: cs.error),
                    ),
            ),
          const SizedBox(height: 10),
          SizedBox(
            height: 48,
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: cs.error, side: BorderSide(color: cs.error.withValues(alpha: 0.6))),
              onPressed: _busy || s.isDemo || others == 0 ? null : _signOutOthers,
              icon: const Icon(Icons.devices_rounded),
              label: Text(_btn(s.lang, const Msg('Sign out all other devices', 'बाकी सभी डिवाइस से साइन आउट'))),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final app = AppState(prefs);
  await app.init();
  runApp(NayanApp(app: app));
}
