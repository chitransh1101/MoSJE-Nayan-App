// ============================================================================
// §P  INSTITUTE & BENEFICIARY PORTAL
//
// Nayan is one centralized app for every stakeholder in the scheme:
//   • Department officials / PMU  → live monitoring (main.dart §13–§18)
//   • Inspection teams            → field visits (main.dart §9–§12)
//   • Institute staff             → this file: findings, compliance documents,
//                                   residents, grievances, notices
//   • Beneficiaries               → this file: my status, schemes, grievances,
//                                   well-being calls, notices, rights
//
// Same FastAPI routes the Setu web portal uses (backend/app/api/v1):
//   GET  /institutes/{id}                 Institute detail
//   GET  /institutes/{id}/alerts          findings, each with `responses`
//   POST /alerts/{id}/responses           {message}
//   GET  /institutes/{id}/documents       Document[]
//   POST /institutes/{id}/documents       multipart {file, description, alert_id?}
//   GET  /institutes/{id}/residents       resident summaries (staff)
//   GET  /grievances   POST /grievances   {institute_id, subject, description, category, urgency, confidential}
//   GET  /schemes                         scheme catalogue
//   GET  /beneficiaries/me                own record
//   POST /beneficiaries/me/scheme-requests {scheme_key}
//   GET  /vc/calls/me  POST /vc/calls/requests {preferred_time, note}
//   GET  /notices
//
// When no server is configured (or a test account is used) the screens read
// and write the in-memory MOCK store below instead. The mock store only
// stands in for the database during testing — every screen goes through the
// same PortalRepo calls either way, nothing on screen is fixed.
// ============================================================================

part of 'main.dart';

// ---------------------------------------------------------------- models ----

class Finding {
  Finding({required this.alert, List<FindingReply>? replies}) : replies = replies ?? [];
  final AlertItem alert;
  final List<FindingReply> replies;

  factory Finding.fromJson(Map<String, dynamic> j) => Finding(
        alert: AlertItem.fromJson(j),
        replies: [
          for (final r in _asList(j['responses']).whereType<Map>()) FindingReply.fromJson(Map<String, dynamic>.from(r)),
        ],
      );
}

class FindingReply {
  FindingReply({required this.message, required this.author, required this.at});
  final String message;
  final String author;
  final DateTime at;

  factory FindingReply.fromJson(Map<String, dynamic> j) => FindingReply(
        message: _str(j['message']),
        author: _str(j['author_name']),
        at: _toDate(j['created_at']) ?? DateTime.now(),
      );
}

class PortalDoc {
  PortalDoc({required this.id, required this.description, required this.fileUrl, required this.uploadedAt, this.alertId});
  final String id;
  final String description;
  final String fileUrl;
  final DateTime uploadedAt;
  final String? alertId;

  factory PortalDoc.fromJson(Map<String, dynamic> j) => PortalDoc(
        id: _str(j['id']),
        description: _str(j['description']),
        fileUrl: _str(j['file_url']),
        uploadedAt: _toDate(j['uploaded_at']) ?? DateTime.now(),
        alertId: j['alert_id'] == null ? null : _str(j['alert_id']),
      );

  String get fileName {
    final last = fileUrl.split('/').last;
    final i = last.indexOf('_');
    return i > 0 && i < 12 ? last.substring(i + 1) : last;
  }
}

class Grievance {
  Grievance({
    required this.id,
    required this.subject,
    required this.description,
    required this.status,
    required this.createdAt,
    this.category = '',
    this.urgency = 'normal',
    this.confidential = false,
    this.escalationLevel = 1,
    this.slaDueAt,
  });
  final String id;
  final String subject;
  final String description;
  final String status; // open | in_review | resolved | rejected
  final DateTime createdAt;
  final String category;
  final String urgency;
  final bool confidential;
  final int escalationLevel;
  final DateTime? slaDueAt;

  factory Grievance.fromJson(Map<String, dynamic> j) => Grievance(
        id: _str(j['id']),
        subject: _str(j['subject']),
        description: _str(j['description']),
        status: _str(j['status'], 'open'),
        createdAt: _toDate(j['created_at']) ?? DateTime.now(),
        category: _str(j['category']),
        urgency: _str(j['urgency'], 'normal'),
        confidential: j['confidential'] == true,
        escalationLevel: (_toDouble(j['escalation_level']) ?? 1).round(),
        slaDueAt: _toDate(j['sla_due_at']),
      );

  bool get open => status == 'open' || status == 'in_review';

  static Msg statusLabel(String s) {
    switch (s) {
      case 'in_review':
        return const Msg('In review', 'समीक्षा में');
      case 'resolved':
        return const Msg('Resolved', 'हल हुई');
      case 'rejected':
        return const Msg('Closed', 'बंद');
      default:
        return const Msg('Open', 'खुली');
    }
  }

  static Color statusColor(String s) =>
      s == 'resolved' ? kGreen : (s == 'rejected' ? Colors.blueGrey : (s == 'in_review' ? kBlue : kAmber));
}

class SchemeInfo {
  SchemeInfo({required this.key, required this.name, required this.hi, this.amount, this.period = '', this.about = '', this.documents = const []});
  final String key;
  final String name;
  final String hi;
  final double? amount;
  final String period;
  final String about;
  final List<String> documents;

  factory SchemeInfo.fromJson(Map<String, dynamic> j) => SchemeInfo(
        key: _str(j['key']),
        name: _str(j['name']),
        hi: _str(j['hi'], _str(j['name'])),
        amount: _toDouble(j['amount']),
        period: _str(j['period']),
        about: _str(j['about']),
        documents: [for (final d in _asList(j['documents'])) '$d'],
      );
}

class SchemeApp {
  SchemeApp({required this.key, required this.name, required this.hi, required this.status, this.applicationId = '', this.amount, this.period = '', this.nextDate, this.nextStep = ''});
  final String key;
  final String name;
  final String hi;
  final String status; // pending | approved | active | rejected
  final String applicationId;
  final double? amount;
  final String period;
  final DateTime? nextDate;
  final String nextStep;

  factory SchemeApp.fromJson(Map<String, dynamic> j) => SchemeApp(
        key: _str(j['key']),
        name: _str(j['name'], _str(j['key'])),
        hi: _str(j['hi'], _str(j['name'], _str(j['key']))),
        status: _str(j['status'], 'pending'),
        applicationId: _str(j['application_id']),
        amount: _toDouble(j['amount']),
        period: _str(j['period']),
        nextDate: _toDate(j['next_date']),
        nextStep: _str(j['next_step']),
      );

  static Msg statusLabel(String s) {
    switch (s) {
      case 'approved':
        return const Msg('Approved', 'स्वीकृत');
      case 'active':
        return const Msg('Receiving', 'मिल रहा है');
      case 'rejected':
        return const Msg('Not approved', 'अस्वीकृत');
      default:
        return const Msg('In process', 'प्रक्रिया में');
    }
  }

  static Color statusColor(String s) => s == 'active' || s == 'approved' ? kGreen : (s == 'rejected' ? kRed : kAmber);
}

class BeneficiaryRecord {
  BeneficiaryRecord({
    required this.name,
    this.beneficiaryId = '',
    this.instituteName = '',
    this.admittedOn,
    this.room = '',
    this.guardian = '',
    this.caseWorker = '',
    this.category = '',
    this.schemes = const [],
    this.documents = const [],
    this.lastCheckup,
    this.nextCheckup,
    this.healthNotes = '',
  });
  final String name;
  final String beneficiaryId;
  final String instituteName;
  final DateTime? admittedOn;
  final String room;
  final String guardian;
  final String caseWorker;
  final String category;
  final List<SchemeApp> schemes;
  final List<(String name, String status)> documents;
  final DateTime? lastCheckup;
  final DateTime? nextCheckup;
  final String healthNotes;

  factory BeneficiaryRecord.fromJson(Map<String, dynamic> j) {
    final h = j['health'] is Map ? Map<String, dynamic>.from(j['health'] as Map) : const <String, dynamic>{};
    return BeneficiaryRecord(
      name: _str(j['name']),
      beneficiaryId: _str(j['beneficiary_id']),
      instituteName: _str(j['institute_name']),
      admittedOn: _toDate(j['admitted_on']),
      room: _str(j['room']),
      guardian: _str(j['guardian']),
      caseWorker: _str(j['case_worker']),
      category: _str(j['category']),
      schemes: [for (final s in _asList(j['schemes']).whereType<Map>()) SchemeApp.fromJson(Map<String, dynamic>.from(s))],
      documents: [
        for (final d in _asList(j['documents']).whereType<Map>()) (_str(d['name']), _str(d['status'], 'pending')),
      ],
      lastCheckup: _toDate(h['last_checkup']),
      nextCheckup: _toDate(h['next_checkup']),
      healthNotes: _str(h['notes']),
    );
  }
}

class CallRecord {
  CallRecord({required this.id, required this.status, this.at, this.officialName = '', this.note = ''});
  final String id;
  final String status; // scheduled | completed | missed | requested
  final DateTime? at;
  final String officialName;
  final String note;

  factory CallRecord.fromJson(Map<String, dynamic> j) => CallRecord(
        id: _str(j['id']),
        status: _str(j['status'], 'scheduled'),
        at: _toDate(j['scheduled_at']),
        officialName: _str(j['official_name']),
        note: _str(j['note'], _str(j['outcome'])),
      );
}

class NoticeItem {
  NoticeItem({required this.id, required this.title, required this.body, required this.at});
  final String id;
  final String title;
  final String body;
  final DateTime at;

  factory NoticeItem.fromJson(Map<String, dynamic> j) => NoticeItem(
        id: _str(j['id']),
        title: _str(j['title']),
        body: _str(j['body']),
        at: _toDate(j['created_at']) ?? DateTime.now(),
      );
}

class ResidentSummary {
  ResidentSummary({required this.name, this.beneficiaryId = '', this.age, this.gender = '', this.room = '', this.admittedOn, this.openGrievances = 0, this.schemesActive = 0, this.docsPending = 0});
  final String name;
  final String beneficiaryId;
  final int? age;
  final String gender;
  final String room;
  final DateTime? admittedOn;
  final int openGrievances;
  final int schemesActive;
  final int docsPending;

  factory ResidentSummary.fromJson(Map<String, dynamic> j) => ResidentSummary(
        name: _str(j['name']),
        beneficiaryId: _str(j['beneficiary_id']),
        age: _toDouble(j['age'])?.round(),
        gender: _str(j['gender']),
        room: _str(j['room']),
        admittedOn: _toDate(j['admitted_on']),
        openGrievances: (_toDouble(j['grievances_open']) ?? 0).round(),
        schemesActive: _asList(j['schemes']).whereType<Map>().where((s) => s['status'] == 'active' || s['status'] == 'approved').length,
        docsPending: _asList(j['documents']).whereType<Map>().where((d) => d['status'] != 'verified').length,
      );
}

// ------------------------------------------------------------ repository ----

/// One entry point for every portal screen. Talks to the server when the
/// account is a real one, otherwise to [MockPortalStore].
class PortalRepo {
  PortalRepo._(this._user, this._base);
  final AppUser _user;
  final String? _base; // null → mock store

  static PortalRepo of(AppState s) {
    final u = s.user!;
    final live = s.backend is RealBackend && !s.usingSampleData && !u.isDemo;
    return PortalRepo._(u, live ? s.serverUrl : null);
  }

  bool get isMock => _base == null;
  String get instituteId => _user.instituteId;
  MockPortalStore get _mock => MockPortalStore.instance;

  Uri _u(String path) => Uri.parse('${_base!.trim().replaceAll(RegExp(r'/+$'), '')}$path');
  Map<String, String> get _h => {'Authorization': 'Bearer ${_user.token}', 'Accept': 'application/json', ..._clientHeader};

  Future<dynamic> _get(String path) => RealBackend._guard(
      () async => RealBackend._decode(await http.get(_u(path), headers: _h).timeout(const Duration(seconds: 20))));

  Future<dynamic> _post(String path, Map<String, dynamic> body) => RealBackend._guard(() async => RealBackend._decode(await http
      .post(_u(path), headers: {..._h, 'Content-Type': 'application/json'}, body: jsonEncode(body))
      .timeout(const Duration(seconds: 20))));

  List<Map<String, dynamic>> _maps(dynamic b) => [for (final x in _asList(b).whereType<Map>()) Map<String, dynamic>.from(x)];

  // ---- institute ----
  Future<Institute?> institute() async {
    if (instituteId.isEmpty) return null;
    if (isMock) return DemoBackend.instituteById(instituteId);
    final b = await _get('/institutes/$instituteId');
    return b is Map ? Institute.fromJson(Map<String, dynamic>.from(b)) : null;
  }

  Future<List<Finding>> findings() async {
    if (isMock) return _mock.findingsFor(instituteId);
    return [for (final m in _maps(await _get('/institutes/$instituteId/alerts'))) Finding.fromJson(m)];
  }

  Future<void> respond(Finding f, String message) async {
    if (isMock) {
      f.replies.add(FindingReply(message: message, author: _user.name, at: DateTime.now()));
      return;
    }
    await _post('/alerts/${f.alert.id}/responses', {'message': message});
  }

  Future<List<PortalDoc>> documents() async {
    if (isMock) return List.of(_mock.docs);
    final list = [for (final m in _maps(await _get('/institutes/$instituteId/documents'))) PortalDoc.fromJson(m)];
    list.sort((a, b) => b.uploadedAt.compareTo(a.uploadedAt));
    return list;
  }

  Future<void> uploadDocument(Uint8List bytes, String fileName, String description, {String? alertId}) async {
    if (isMock) {
      _mock.docs.insert(
          0,
          PortalDoc(
              id: 'doc-${DateTime.now().millisecondsSinceEpoch}',
              description: description,
              fileUrl: 'mock/$fileName',
              uploadedAt: DateTime.now(),
              alertId: alertId));
      return;
    }
    await RealBackend._guard(() async {
      final req = http.MultipartRequest('POST', _u('/institutes/$instituteId/documents'))
        ..headers.addAll(_h)
        ..fields['description'] = description
        ..files.add(http.MultipartFile.fromBytes('file', bytes, filename: fileName));
      if (alertId != null) req.fields['alert_id'] = alertId;
      final streamed = await req.send().timeout(const Duration(seconds: 60));
      return RealBackend._decode(await http.Response.fromStream(streamed));
    });
  }

  Future<List<ResidentSummary>> residents() async {
    if (isMock) return List.of(_mock.residents);
    return [for (final m in _maps(await _get('/institutes/$instituteId/residents'))) ResidentSummary.fromJson(m)];
  }

  // ---- grievances (both roles) ----
  Future<List<Grievance>> grievances() async {
    final list = isMock
        ? List.of(_user.isBeneficiary ? _mock.myGrievances : _mock.instituteGrievances)
        : [for (final m in _maps(await _get('/grievances'))) Grievance.fromJson(m)];
    list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return list;
  }

  Future<void> raiseGrievance({required String subject, required String description, required String category, required String urgency, required bool confidential}) async {
    if (isMock) {
      final g = Grievance(
        id: 'grv-${DateTime.now().millisecondsSinceEpoch}',
        subject: subject,
        description: description,
        status: 'open',
        createdAt: DateTime.now(),
        category: category,
        urgency: urgency,
        confidential: confidential,
        slaDueAt: DateTime.now().add(const Duration(days: 21)),
      );
      (_user.isBeneficiary ? _mock.myGrievances : _mock.instituteGrievances).insert(0, g);
      return;
    }
    await _post('/grievances', {
      'institute_id': instituteId,
      'subject': subject,
      'description': description,
      'category': category,
      'urgency': urgency,
      'confidential': confidential,
    });
  }

  // ---- beneficiary ----
  Future<BeneficiaryRecord?> me() async {
    if (isMock) return _mock.record(_user);
    final b = await _get('/beneficiaries/me');
    return b is Map ? BeneficiaryRecord.fromJson(Map<String, dynamic>.from(b)) : null;
  }

  Future<List<SchemeInfo>> schemes() async {
    if (isMock) return List.of(_mock.catalogue);
    return [for (final m in _maps(await _get('/schemes'))) SchemeInfo.fromJson(m)];
  }

  Future<void> requestScheme(SchemeInfo s) async {
    if (isMock) {
      if (_mock.applications.any((a) => a.key == s.key && a.status != 'rejected')) {
        throw ApiException('You already have an application for this scheme', status: 409);
      }
      _mock.applications.add(SchemeApp(key: s.key, name: s.name, hi: s.hi, status: 'pending', amount: s.amount, period: s.period,
          nextStep: 'The institute office will verify your documents.'));
      return;
    }
    await _post('/beneficiaries/me/scheme-requests', {'scheme_key': s.key});
  }

  Future<List<CallRecord>> calls() async {
    if (isMock) return List.of(_mock.calls);
    return [for (final m in _maps(await _get('/vc/calls/me'))) CallRecord.fromJson(m)];
  }

  Future<void> requestCall(String preferredTime, String note) async {
    if (isMock) {
      _mock.calls.insert(0, CallRecord(id: 'req-${DateTime.now().millisecondsSinceEpoch}', status: 'requested', at: DateTime.now(), note: note));
      return;
    }
    await _post('/vc/calls/requests', {'preferred_time': preferredTime, 'note': note});
  }

  Future<List<NoticeItem>> notices() async {
    if (isMock) return List.of(_mock.notices);
    return [for (final m in _maps(await _get('/notices'))) NoticeItem.fromJson(m)];
  }
}

/// In-memory MOCK data for testing without the department's database. Same
/// shapes as the server's replies; edits made in the app live until it closes.
class MockPortalStore {
  MockPortalStore._() {
    final now = DateTime.now();
    final inst = DemoBackend.institutes.first.id;
    _findings[inst] = [
      Finding(
        alert: AlertItem(id: 'mock-f1', instituteId: inst, type: 'attendance_spike', severity: 'red', status: 'open',
            detail: 'Marked attendance was higher than enrolment on two days last week.', createdAt: now.subtract(const Duration(days: 3))),
      ),
      Finding(
        alert: AlertItem(id: 'mock-f2', instituteId: inst, type: 'camera_offline', severity: 'yellow', status: 'open',
            detail: 'Dormitory corridor camera has been offline for over 24 hours.', createdAt: now.subtract(const Duration(days: 1))),
      ),
      Finding(
        alert: AlertItem(id: 'mock-f3', instituteId: inst, type: 'vc_miss', severity: 'yellow', status: 'reviewed',
            detail: 'A random verification call to the in-charge was not answered.', createdAt: now.subtract(const Duration(days: 9))),
        replies: [
          FindingReply(message: 'The in-charge was attending a district meeting; the call was returned within the hour.',
              author: 'Sunita Rao', at: now.subtract(const Duration(days: 8))),
        ],
      ),
    ];
    docs.addAll([
      PortalDoc(id: 'mock-d1', description: 'Fire safety certificate (renewed)', fileUrl: 'mock/fire_noc_2026.pdf', uploadedAt: now.subtract(const Duration(days: 20))),
      PortalDoc(id: 'mock-d2', description: 'Monthly attendance register — previous month', fileUrl: 'mock/attendance_register.pdf', uploadedAt: now.subtract(const Duration(days: 6))),
    ]);
    residents.addAll([
      ResidentSummary(name: 'Kavya Iyer', beneficiaryId: 'UP-LKO-B-0412', age: 15, gender: 'F', room: 'B-12', admittedOn: DateTime(now.year - 1, 7, 14), schemesActive: 2, docsPending: 1, openGrievances: 1),
      ResidentSummary(name: 'Pooja Verma', beneficiaryId: 'UP-LKO-B-0388', age: 14, gender: 'F', room: 'B-09', admittedOn: DateTime(now.year - 2, 3, 2), schemesActive: 1),
      ResidentSummary(name: 'Rani Kushwaha', beneficiaryId: 'UP-LKO-B-0451', age: 16, gender: 'F', room: 'A-04', admittedOn: DateTime(now.year, 1, 21), docsPending: 2),
      ResidentSummary(name: 'Shabnam Ansari', beneficiaryId: 'UP-LKO-B-0367', age: 13, gender: 'F', room: 'A-02', admittedOn: DateTime(now.year - 2, 11, 9), schemesActive: 2),
    ]);
    instituteGrievances.addAll([
      Grievance(id: 'mock-g1', subject: 'Drinking water purifier not working', description: 'The RO unit on the first floor has not worked for 4 days.',
          status: 'in_review', createdAt: now.subtract(const Duration(days: 4)), category: 'facilities', slaDueAt: now.add(const Duration(days: 17))),
      Grievance(id: 'mock-g2', subject: 'Grievance (confidential)', description: 'Shown to the Department only.', status: 'open',
          createdAt: now.subtract(const Duration(days: 2)), category: 'safety', urgency: 'high', confidential: true, slaDueAt: now.add(const Duration(days: 19))),
    ]);
    myGrievances.add(Grievance(id: 'mock-g3', subject: 'Scholarship instalment delayed', description: 'The last instalment has not reached my account.',
        status: 'open', createdAt: now.subtract(const Duration(days: 6)), category: 'benefits', slaDueAt: now.add(const Duration(days: 15))));
    catalogue.addAll([
      SchemeInfo(key: 'pm_scholarship', name: 'Pre-matric scholarship', hi: 'प्री-मैट्रिक छात्रवृत्ति', amount: 1000, period: 'per month',
          about: 'Monthly support for school students from eligible categories.', documents: ['Aadhaar', 'School enrolment certificate', 'Bank passbook']),
      SchemeInfo(key: 'skill_dev', name: 'Skill development training', hi: 'कौशल विकास प्रशिक्षण', amount: 0, period: 'one time',
          about: 'Free vocational training with a stipend during the course.', documents: ['Aadhaar', 'Age proof']),
      SchemeInfo(key: 'health_cover', name: 'Health cover', hi: 'स्वास्थ्य कवर', amount: 500000, period: 'per year',
          about: 'Cashless hospital treatment at empanelled hospitals.', documents: ['Aadhaar', 'Institute residence certificate']),
    ]);
    applications.addAll([
      SchemeApp(key: 'pm_scholarship', name: 'Pre-matric scholarship', hi: 'प्री-मैट्रिक छात्रवृत्ति', status: 'active', applicationId: 'PMSCHOLARSHIP/UP/2026/10231',
          amount: 1000, period: 'per month', nextDate: DateTime(now.year, now.month + 1, 7)),
      SchemeApp(key: 'health_cover', name: 'Health cover', hi: 'स्वास्थ्य कवर', status: 'pending', applicationId: 'HEALTHCOVER/UP/2026/10498',
          amount: 500000, period: 'per year', nextStep: 'Upload the institute residence certificate.'),
    ]);
    calls.addAll([
      CallRecord(id: 'mock-c1', status: 'scheduled', at: now.add(const Duration(days: 2, hours: 3)), officialName: 'District Social Welfare Office',
          note: 'A routine well-being call. Staff will not be on the call.'),
      CallRecord(id: 'mock-c2', status: 'completed', at: now.subtract(const Duration(days: 18)), officialName: 'Anita Deshmukh'),
    ]);
    notices.addAll([
      NoticeItem(id: 'mock-n1', title: 'Health check-up camp on the 15th', body: 'A free health check-up camp will be held at the institute. All residents should attend.', at: now.subtract(const Duration(days: 2))),
      NoticeItem(id: 'mock-n2', title: 'Scholarship documents', body: 'Residents applying for scholarships should give updated bank details to the office by month end.', at: now.subtract(const Duration(days: 10))),
    ]);
  }

  static final MockPortalStore instance = MockPortalStore._();

  final Map<String, List<Finding>> _findings = {};
  final List<PortalDoc> docs = [];
  final List<ResidentSummary> residents = [];
  final List<Grievance> instituteGrievances = [];
  final List<Grievance> myGrievances = [];
  final List<SchemeInfo> catalogue = [];
  final List<SchemeApp> applications = [];
  final List<CallRecord> calls = [];
  final List<NoticeItem> notices = [];

  List<Finding> findingsFor(String instituteId) => _findings[instituteId] ?? [];

  BeneficiaryRecord record(AppUser u) {
    final now = DateTime.now();
    return BeneficiaryRecord(
      name: u.name,
      beneficiaryId: 'UP-LKO-B-0412',
      instituteName: DemoBackend.instituteById(u.instituteId)?.name ?? '',
      admittedOn: DateTime(now.year - 1, 7, 14),
      room: 'B-12',
      guardian: 'Lakshmi Iyer (mother)',
      caseWorker: 'Sunita Rao',
      category: 'Child in need of care',
      schemes: List.of(applications),
      documents: const [('Aadhaar', 'verified'), ('School enrolment certificate', 'verified'), ('Institute residence certificate', 'pending')],
      lastCheckup: now.subtract(const Duration(days: 34)),
      nextCheckup: now.add(const Duration(days: 12)),
      healthNotes: 'Fit. Routine eye test due at next check-up.',
    );
  }
}

// ------------------------------------------------------------- the shell ----

class PortalHome extends StatefulWidget {
  const PortalHome({super.key});

  @override
  State<PortalHome> createState() => _PortalHomeState();
}

class _PortalHomeState extends State<PortalHome> {
  int _tab = 0;

  static const _instituteNav = [
    _NavItem('Home', 'होम', Icons.apartment_outlined, Icons.apartment_rounded, 'My institute', 'मेरा संस्थान'),
    _NavItem('Findings', 'निष्कर्ष', Icons.fact_check_outlined, Icons.fact_check_rounded, 'Inspection findings', 'निरीक्षण निष्कर्ष'),
    _NavItem('Documents', 'दस्तावेज़', Icons.folder_outlined, Icons.folder_rounded, 'Compliance documents', 'अनुपालन दस्तावेज़'),
    _NavItem('Grievances', 'शिकायतें', Icons.feedback_outlined, Icons.feedback_rounded, 'Grievances', 'शिकायतें'),
    _NavItem('Profile', 'प्रोफ़ाइल', Icons.person_outline_rounded, Icons.person_rounded, 'Profile & settings', 'प्रोफ़ाइल और सेटिंग'),
  ];

  static const _beneficiaryNav = [
    _NavItem('Status', 'स्थिति', Icons.badge_outlined, Icons.badge_rounded, 'My status', 'मेरी स्थिति'),
    _NavItem('Schemes', 'योजनाएँ', Icons.volunteer_activism_outlined, Icons.volunteer_activism_rounded, 'Schemes & benefits', 'योजनाएँ और लाभ'),
    _NavItem('Grievances', 'शिकायतें', Icons.feedback_outlined, Icons.feedback_rounded, 'My grievances', 'मेरी शिकायतें'),
    _NavItem('Calls', 'कॉल', Icons.call_outlined, Icons.call_rounded, 'Calls with the Department', 'विभाग से कॉल'),
    _NavItem('Profile', 'प्रोफ़ाइल', Icons.person_outline_rounded, Icons.person_rounded, 'Profile & settings', 'प्रोफ़ाइल और सेटिंग'),
  ];

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user!;
    final staff = u.isInstitute;
    final nav = staff ? _instituteNav : _beneficiaryNav;
    if (_tab >= nav.length) _tab = 0;
    final pages = staff
        ? <Widget>[
            InstituteOverviewTab(onGo: (i) => setState(() => _tab = i)),
            const FindingsTab(),
            const DocumentsTab(),
            const GrievancesTab(),
            const PortalProfileTab(),
          ]
        : <Widget>[
            BeneficiaryStatusTab(onGo: (i) => setState(() => _tab = i)),
            const SchemesTab(),
            const GrievancesTab(),
            const CallsTab(),
            const PortalProfileTab(),
          ];
    return Scaffold(
      appBar: govAppBar(context, title: Bi(nav[_tab].titleEn, nav[_tab].titleHi), back: false, actions: const [DemoBadge()]),
      body: SafeArea(bottom: false, child: IndexedStack(index: _tab, children: pages)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          for (final n in nav)
            NavigationDestination(icon: Icon(n.icon), selectedIcon: Icon(n.selected), label: s.lang == LangMode.hi ? n.hi : n.en),
        ],
      ),
    );
  }
}

/// Loads data through [PortalRepo] with a spinner, an error with retry, and
/// a reload hook for after a change.
class _Loader<T> extends StatefulWidget {
  const _Loader({super.key, required this.load, required this.builder});
  final Future<T> Function(PortalRepo repo) load;
  final Widget Function(BuildContext context, T data, PortalRepo repo, VoidCallback reload) builder;

  @override
  State<_Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<_Loader<T>> {
  Future<T>? _future;
  PortalRepo? _repo;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_future == null) _reload();
  }

  void _reload() {
    final repo = PortalRepo.of(AppScope.read(context));
    setState(() {
      _repo = repo;
      _future = widget.load(repo);
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) {
          final e = snap.error;
          final msg = e is ApiException ? e.message : 'Could not load this page.';
          return Center(
            child: EmptyState(
              icon: Icons.cloud_off_rounded,
              title: Msg(msg, e is ApiException ? msg : 'यह पेज लोड नहीं हो सका।'),
              action: FilledButton.tonal(onPressed: _reload, child: Text(tx(context, 'Try again', 'फिर कोशिश करें'))),
            ),
          );
        }
        return widget.builder(context, snap.data as T, _repo!, _reload);
      },
    );
  }
}

String _errText(Object e) => e is ApiException ? e.message : 'Something went wrong. Please try again.';

String _rupees(double? v) {
  if (v == null || v <= 0) return '—';
  final n = v.round().toString();
  if (n.length <= 3) return '₹$n';
  final last3 = n.substring(n.length - 3);
  var rest = n.substring(0, n.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '₹${parts.join(',')},$last3';
}

// -------------------------------------------------------- institute side ----

class InstituteOverviewTab extends StatelessWidget {
  const InstituteOverviewTab({super.key, required this.onGo});
  final void Function(int tab) onGo;

  @override
  Widget build(BuildContext context) {
    return _Loader<(Institute?, List<Finding>, List<Grievance>, List<PortalDoc>)>(
      load: (r) async => (await r.institute(), await r.findings(), await r.grievances(), await r.documents()),
      builder: (context, d, repo, reload) {
        final s = AppScope.of(context);
        final cs = Theme.of(context).colorScheme;
        final inst = d.$1;
        final openF = d.$2.where((f) => f.alert.status == 'open').toList();
        final unanswered = openF.where((f) => f.replies.isEmpty).length;
        final openG = d.$3.where((g) => g.open).length;
        if (inst == null) {
          return const Center(
              child: EmptyState(
                  icon: Icons.apartment_outlined,
                  title: Msg('No institute is linked to this account', 'इस खाते से कोई संस्थान जुड़ा नहीं है'),
                  body: Msg('Ask the Department to link your account to your institute.', 'विभाग से अपना खाता संस्थान से जोड़ने को कहें।')));
        }
        final statusColor = inst.status == 'red' ? kRed : (inst.status == 'yellow' ? kAmber : kGreen);
        return RefreshIndicator(
          onRefresh: () async => reload(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              if (repo.isMock) const _MockNote(),
              Panel(
                accent: statusColor,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(inst.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text('${inst.typeLabel.of(s.lang)} · ${[inst.district, inst.state].where((x) => x.isNotEmpty).join(', ')}',
                      style: TextStyle(color: cs.onSurfaceVariant, fontSize: 13)),
                  const SizedBox(height: 12),
                  Row(children: [
                    Pill(
                      label: inst.status == 'red'
                          ? const Msg('Needs attention', 'ध्यान आवश्यक')
                          : (inst.status == 'yellow' ? const Msg('Under watch', 'निगरानी में') : const Msg('In good standing', 'अच्छी स्थिति')),
                      color: statusColor,
                      icon: Icons.circle,
                    ),
                    const Spacer(),
                    if (inst.complianceScore != null)
                      Text('${inst.complianceScore!.round()}/100',
                          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: statusColor)),
                  ]),
                  if (inst.complianceScore != null) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                          value: (inst.complianceScore! / 100).clamp(0, 1).toDouble(), minHeight: 8, color: statusColor, backgroundColor: statusColor.withValues(alpha: 0.15)),
                    ),
                    const SizedBox(height: 4),
                    Bi('Compliance score from inspections, documents and monitoring', 'निरीक्षण, दस्तावेज़ और निगरानी से अनुपालन अंक',
                        style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                  ],
                ]),
              ),
              const SizedBox(height: 14),
              TileGrid(children: [
                QuickTile(
                    icon: Icons.fact_check_rounded,
                    color: kRed,
                    value: '${openF.length}',
                    label: const Msg('Open findings', 'खुले निष्कर्ष'),
                    sub: Msg('$unanswered awaiting your reply', '$unanswered पर आपका जवाब बाकी'),
                    onTap: () => onGo(1)),
                QuickTile(icon: Icons.folder_rounded, color: kBlue, value: '${d.$4.length}', label: const Msg('Documents filed', 'जमा दस्तावेज़'), onTap: () => onGo(2)),
                QuickTile(icon: Icons.feedback_rounded, color: kAmber, value: '$openG', label: const Msg('Open grievances', 'खुली शिकायतें'), onTap: () => onGo(3)),
                QuickTile(
                    icon: Icons.groups_rounded,
                    color: kGreen,
                    value: '→',
                    label: const Msg('Residents', 'निवासी'),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ResidentsScreen()))),
              ]),
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const SectionTitle('What the Department expects', 'विभाग की अपेक्षाएँ', icon: Icons.checklist_rounded),
                  for (final t in const [
                    Msg('Reply to every open finding with what was done.', 'हर खुले निष्कर्ष पर बताएँ कि क्या किया गया।'),
                    Msg('Keep certificates and registers uploaded and current.', 'प्रमाणपत्र और रजिस्टर अपलोड और अद्यतन रखें।'),
                    Msg('Keep CCTV online — an outage is itself flagged.', 'सीसीटीवी चालू रखें — बंद होना भी चिह्नित होता है।'),
                    Msg('Inspections and verification calls are random and unannounced.', 'निरीक्षण और सत्यापन कॉल रैंडम और बिना सूचना के होते हैं।'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Icon(Icons.check_circle_outline_rounded, size: 18, color: cs.primary),
                        const SizedBox(width: 8),
                        Expanded(child: Bi(t.en, t.hi, style: const TextStyle(fontSize: 13.5))),
                      ]),
                    ),
                ]),
              ),
              const SizedBox(height: 14),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.campaign_outlined),
                title: Bi('Notices from the Department', 'विभाग की सूचनाएँ'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NoticesScreen())),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MockNote extends StatelessWidget {
  const _MockNote();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Panel(
        tint: kSand,
        padding: const EdgeInsets.all(10),
        child: Row(children: [
          const Icon(Icons.science_outlined, size: 18, color: kSand),
          const SizedBox(width: 8),
          Expanded(
            child: Bi('Mock data for testing — no department database is connected yet. Changes last until the app is closed.',
                'परीक्षण के लिए मॉक डेटा — अभी कोई विभागीय डेटाबेस जुड़ा नहीं है। बदलाव ऐप बंद होने तक रहते हैं।',
                style: const TextStyle(fontSize: 12)),
          ),
        ]),
      ),
    );
  }
}

class FindingsTab extends StatefulWidget {
  const FindingsTab({super.key});

  @override
  State<FindingsTab> createState() => _FindingsTabState();
}

class _FindingsTabState extends State<FindingsTab> {
  String _filter = 'open'; // open | awaiting | all

  Future<void> _reply(Finding f, PortalRepo repo, VoidCallback reload) async {
    final ctrl = TextEditingController();
    final text = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (c) => Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(c).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Bi('Reply to this finding', 'इस निष्कर्ष का जवाब', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(f.alert.detail, style: TextStyle(color: Theme.of(c).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 14),
          TextField(
            controller: ctrl,
            minLines: 3,
            maxLines: 6,
            maxLength: 4000,
            decoration: fieldDecoration(c,
                label: tx(c, 'What was done', 'क्या किया गया'), hint: tx(c, 'e.g. Camera repaired on 12 Sep, receipt uploaded.', 'जैसे 12 सितंबर को कैमरा ठीक कराया, रसीद अपलोड की।')),
          ),
          const SizedBox(height: 8),
          ShineButton(label: tx(c, 'Send reply', 'जवाब भेजें'), icon: Icons.send_rounded, onPressed: () => Navigator.of(c).pop(ctrl.text.trim())),
        ]),
      ),
    );
    ctrl.dispose();
    if (text == null || !mounted) return;
    if (text.length < 3) {
      snack(context, 'Please write a little more.', 'कृपया थोड़ा और लिखें।', error: true);
      return;
    }
    try {
      await repo.respond(f, text);
      if (!mounted) return;
      snack(context, 'Reply sent to the Department.', 'जवाब विभाग को भेजा गया।');
      reload();
    } catch (e) {
      if (mounted) snack(context, _errText(e), _errText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Loader<List<Finding>>(
      load: (r) => r.findings(),
      builder: (context, all, repo, reload) {
        final s = AppScope.of(context);
        final cs = Theme.of(context).colorScheme;
        final shown = all.where((f) {
          if (_filter == 'open') return f.alert.status == 'open';
          if (_filter == 'awaiting') return f.alert.status == 'open' && f.replies.isEmpty;
          return true;
        }).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            if (repo.isMock) const _MockNote(),
            Wrap(spacing: 8, children: [
              for (final f in const [('open', Msg('Open', 'खुले')), ('awaiting', Msg('Awaiting reply', 'जवाब बाकी')), ('all', Msg('All', 'सभी'))])
                ChoiceChip(selected: _filter == f.$1, onSelected: (_) => setState(() => _filter = f.$1), label: Text(f.$2.of(s.lang))),
            ]),
            const SizedBox(height: 12),
            if (shown.isEmpty)
              const EmptyState(icon: Icons.verified_rounded, title: Msg('Nothing here', 'यहाँ कुछ नहीं'))
            else
              for (final f in shown)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Panel(
                    accent: severityColor(f.alert.severity),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Icon(f.alert.icon, size: 18, color: severityColor(f.alert.severity)),
                        const SizedBox(width: 8),
                        Expanded(child: Text(f.alert.typeLabel.of(s.lang), style: const TextStyle(fontWeight: FontWeight.w700))),
                        Text(timeAgo(f.alert.createdAt).of(s.lang), style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                      ]),
                      const SizedBox(height: 6),
                      Text(f.alert.detail, style: const TextStyle(fontSize: 13.5, height: 1.4)),
                      for (final r in f.replies) ...[
                        const SizedBox(height: 8),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: cs.primary.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(10)),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${r.author} · ${fmtDateTime(r.at, s.lang)}', style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                            const SizedBox(height: 2),
                            Text(r.message, style: const TextStyle(fontSize: 13)),
                          ]),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        FilledButton.tonalIcon(
                          onPressed: () => _reply(f, repo, reload),
                          icon: const Icon(Icons.reply_rounded, size: 18),
                          label: Text(f.replies.isEmpty ? tx(context, 'Reply', 'जवाब दें') : tx(context, 'Add update', 'अपडेट जोड़ें')),
                        ),
                        OutlinedButton.icon(
                          onPressed: () async {
                            final done = await pickAndUploadDocument(context, repo, alertId: f.alert.id, defaultDescription: 'Evidence for: ${f.alert.typeLabel.en}');
                            if (done) reload();
                          },
                          icon: const Icon(Icons.attach_file_rounded, size: 18),
                          label: Text(tx(context, 'Attach proof', 'प्रमाण जोड़ें')),
                        ),
                      ]),
                    ]),
                  ),
                ),
          ],
        );
      },
    );
  }
}

/// Photograph or pick a document and file it with the institute's records.
Future<bool> pickAndUploadDocument(BuildContext context, PortalRepo repo, {String? alertId, String defaultDescription = ''}) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(leading: const Icon(Icons.photo_camera_outlined), title: Text(tx(c, 'Photograph the document', 'दस्तावेज़ की फ़ोटो लें')), onTap: () => Navigator.of(c).pop(ImageSource.camera)),
        ListTile(leading: const Icon(Icons.photo_library_outlined), title: Text(tx(c, 'Choose a scanned copy', 'स्कैन की हुई कॉपी चुनें')), onTap: () => Navigator.of(c).pop(ImageSource.gallery)),
      ]),
    ),
  );
  if (source == null || !context.mounted) return false;
  XFile? file;
  try {
    file = await ImagePicker().pickImage(source: source, imageQuality: 85, maxWidth: 2400);
  } catch (_) {
    if (context.mounted) snack(context, 'Could not open the camera or gallery.', 'कैमरा या गैलरी नहीं खुल सकी।', error: true);
    return false;
  }
  if (file == null || !context.mounted) return false;
  final ctrl = TextEditingController(text: defaultDescription);
  final description = await showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      title: Bi('Describe the document', 'दस्तावेज़ का विवरण', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
      content: TextField(controller: ctrl, maxLength: 200, decoration: fieldDecoration(c, label: tx(c, 'Description', 'विवरण'), hint: tx(c, 'e.g. Fire NOC 2026', 'जैसे फ़ायर एनओसी 2026'))),
      actions: [
        TextButton(onPressed: () => Navigator.of(c).pop(), child: Text(tx(c, 'Cancel', 'रद्द करें'))),
        FilledButton(onPressed: () => Navigator.of(c).pop(ctrl.text.trim()), child: Text(tx(c, 'Upload', 'अपलोड करें'))),
      ],
    ),
  );
  ctrl.dispose();
  if (description == null || !context.mounted) return false;
  try {
    final bytes = await file.readAsBytes();
    final name = file.name.isEmpty ? 'document.jpg' : file.name;
    await repo.uploadDocument(bytes, name, description.isEmpty ? name : description, alertId: alertId);
    if (context.mounted) snack(context, 'Document uploaded.', 'दस्तावेज़ अपलोड हुआ।');
    return true;
  } catch (e) {
    if (context.mounted) snack(context, _errText(e), _errText(e), error: true);
    return false;
  }
}

class DocumentsTab extends StatefulWidget {
  const DocumentsTab({super.key});

  @override
  State<DocumentsTab> createState() => _DocumentsTabState();
}

class _DocumentsTabState extends State<DocumentsTab> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    return _Loader<List<PortalDoc>>(
      load: (r) => r.documents(),
      builder: (context, docs, repo, reload) {
        final s = AppScope.of(context);
        final cs = Theme.of(context).colorScheme;
        final q = _q.toLowerCase();
        final shown = q.isEmpty ? docs : docs.where((d) => d.description.toLowerCase().contains(q) || d.fileName.toLowerCase().contains(q)).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            if (repo.isMock) const _MockNote(),
            ShineButton(
              label: tx(context, 'Upload a document', 'दस्तावेज़ अपलोड करें'),
              icon: Icons.upload_file_rounded,
              onPressed: () async {
                if (await pickAndUploadDocument(context, repo)) reload();
              },
            ),
            const SizedBox(height: 12),
            TextField(
              onChanged: (v) => setState(() => _q = v),
              decoration: fieldDecoration(context, label: tx(context, 'Search documents', 'दस्तावेज़ खोजें'), icon: Icons.search_rounded),
            ),
            const SizedBox(height: 12),
            if (shown.isEmpty)
              EmptyState(
                  icon: Icons.folder_open_outlined,
                  title: docs.isEmpty ? const Msg('No documents yet', 'अभी कोई दस्तावेज़ नहीं') : const Msg('No documents match', 'कोई दस्तावेज़ मेल नहीं खाता'))
            else
              Panel(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
                child: Column(children: [
                  for (var i = 0; i < shown.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(shown[i].fileName.toLowerCase().endsWith('.pdf') ? Icons.picture_as_pdf_outlined : Icons.description_outlined, color: cs.primary),
                      title: Text(shown[i].description, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('${shown[i].fileName} · ${fmtDate(shown[i].uploadedAt, s.lang)}${shown[i].alertId != null ? ' · ${tx(context, 'proof for a finding', 'निष्कर्ष का प्रमाण')}' : ''}',
                          maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                      trailing: shown[i].fileUrl.startsWith('http')
                          ? IconButton(
                              tooltip: tx(context, 'Open', 'खोलें'),
                              icon: const Icon(Icons.open_in_new_rounded),
                              onPressed: () => launchUrl(Uri.parse(shown[i].fileUrl), mode: LaunchMode.externalApplication),
                            )
                          : null,
                    ),
                  ],
                ]),
              ),
          ],
        );
      },
    );
  }
}

class ResidentsScreen extends StatefulWidget {
  const ResidentsScreen({super.key});

  @override
  State<ResidentsScreen> createState() => _ResidentsScreenState();
}

class _ResidentsScreenState extends State<ResidentsScreen> {
  String _q = '';
  bool _attention = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Residents', 'निवासी'), actions: const [DemoBadge()]),
      body: _Loader<List<ResidentSummary>>(
        load: (r) => r.residents(),
        builder: (context, all, repo, reload) {
          final s = AppScope.of(context);
          final cs = Theme.of(context).colorScheme;
          final q = _q.toLowerCase();
          final shown = all.where((r) {
            if (q.isNotEmpty && !r.name.toLowerCase().contains(q) && !r.beneficiaryId.toLowerCase().contains(q) && !r.room.toLowerCase().contains(q)) return false;
            if (_attention && r.docsPending == 0 && r.openGrievances == 0) return false;
            return true;
          }).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              if (repo.isMock) const _MockNote(),
              TextField(
                onChanged: (v) => setState(() => _q = v),
                decoration: fieldDecoration(context, label: tx(context, 'Search by name, ID or room', 'नाम, आईडी या कमरे से खोजें'), icon: Icons.search_rounded),
              ),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                ChoiceChip(selected: !_attention, onSelected: (_) => setState(() => _attention = false), label: Text('${both(s.lang, 'All', 'सभी')} (${all.length})')),
                ChoiceChip(selected: _attention, onSelected: (_) => setState(() => _attention = true), label: Text(both(s.lang, 'Needs follow-up', 'अनुवर्ती आवश्यक'))),
              ]),
              const SizedBox(height: 12),
              if (shown.isEmpty)
                const EmptyState(icon: Icons.groups_outlined, title: Msg('No residents match', 'कोई निवासी मेल नहीं खाता'))
              else
                for (final r in shown)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Panel(
                      padding: const EdgeInsets.all(14),
                      child: Row(children: [
                        CircleAvatar(backgroundColor: cs.primary.withValues(alpha: 0.12), child: Text(r.name.isEmpty ? '?' : r.name[0], style: TextStyle(color: cs.primary))),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(r.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(
                                [r.beneficiaryId, if (r.age != null) '${r.age} ${tx(context, 'yrs', 'वर्ष')}', if (r.room.isNotEmpty) '${tx(context, 'Room', 'कमरा')} ${r.room}']
                                    .where((x) => x.isNotEmpty)
                                    .join(' · '),
                                style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                            const SizedBox(height: 6),
                            Wrap(spacing: 6, runSpacing: 6, children: [
                              Pill(label: Msg('${r.schemesActive} scheme(s)', '${r.schemesActive} योजना'), color: kGreen, icon: Icons.volunteer_activism_rounded),
                              if (r.docsPending > 0) Pill(label: Msg('${r.docsPending} doc(s) pending', '${r.docsPending} दस्तावेज़ बाकी'), color: kAmber, icon: Icons.description_rounded),
                              if (r.openGrievances > 0) Pill(label: Msg('${r.openGrievances} open grievance', '${r.openGrievances} खुली शिकायत'), color: kRed, icon: Icons.feedback_rounded),
                            ]),
                          ]),
                        ),
                      ]),
                    ),
                  ),
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Bi('Grievances marked confidential are counted here but never shown to institute staff.',
                    'गोपनीय शिकायतें यहाँ केवल गिनी जाती हैं, संस्थान कर्मचारियों को कभी दिखाई नहीं जातीं।',
                    style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ------------------------------------------------------------ both roles ----

class GrievancesTab extends StatefulWidget {
  const GrievancesTab({super.key});

  @override
  State<GrievancesTab> createState() => _GrievancesTabState();
}

class _GrievancesTabState extends State<GrievancesTab> {
  String _filter = 'open'; // open | resolved | all

  Future<void> _raise(PortalRepo repo, VoidCallback reload) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => RaiseGrievanceScreen(repo: repo)));
    if (ok == true) reload();
  }

  @override
  Widget build(BuildContext context) {
    return _Loader<List<Grievance>>(
      load: (r) => r.grievances(),
      builder: (context, all, repo, reload) {
        final s = AppScope.of(context);
        final cs = Theme.of(context).colorScheme;
        final shown = all.where((g) {
          if (_filter == 'open') return g.open;
          if (_filter == 'resolved') return !g.open;
          return true;
        }).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            if (repo.isMock) const _MockNote(),
            ShineButton(label: tx(context, 'Raise a grievance', 'शिकायत दर्ज करें'), icon: Icons.add_comment_rounded, onPressed: () => _raise(repo, reload)),
            const SizedBox(height: 12),
            Wrap(spacing: 8, children: [
              for (final f in const [('open', Msg('Open', 'खुली')), ('resolved', Msg('Closed', 'बंद')), ('all', Msg('All', 'सभी'))])
                ChoiceChip(selected: _filter == f.$1, onSelected: (_) => setState(() => _filter = f.$1), label: Text(f.$2.of(s.lang))),
            ]),
            const SizedBox(height: 12),
            if (shown.isEmpty)
              const EmptyState(icon: Icons.inbox_outlined, title: Msg('No grievances here', 'यहाँ कोई शिकायत नहीं'))
            else
              for (final g in shown)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Panel(
                    accent: Grievance.statusColor(g.status),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        if (g.confidential) ...[Icon(Icons.lock_rounded, size: 16, color: cs.onSurfaceVariant), const SizedBox(width: 6)],
                        Expanded(child: Text(g.subject, style: const TextStyle(fontWeight: FontWeight.w700))),
                        Pill(label: Grievance.statusLabel(g.status), color: Grievance.statusColor(g.status)),
                      ]),
                      const SizedBox(height: 6),
                      Text(g.description, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
                      const SizedBox(height: 8),
                      Wrap(spacing: 10, runSpacing: 4, children: [
                        Text('${tx(context, 'Filed', 'दर्ज')} ${fmtDate(g.createdAt, s.lang)}', style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                        if (g.open && g.slaDueAt != null)
                          Text(
                            g.slaDueAt!.isBefore(DateTime.now())
                                ? tx(context, 'Past the 21-day limit — escalated', '21 दिन की सीमा पार — आगे भेजी गई')
                                : '${tx(context, 'Answer due by', 'उत्तर की अंतिम तिथि')} ${fmtDate(g.slaDueAt!, s.lang)}',
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: g.slaDueAt!.isBefore(DateTime.now()) ? kRed : cs.onSurfaceVariant),
                          ),
                        if (g.escalationLevel > 1)
                          Text('${tx(context, 'Level', 'स्तर')} ${g.escalationLevel}', style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: kRed)),
                      ]),
                    ]),
                  ),
                ),
          ],
        );
      },
    );
  }
}

class RaiseGrievanceScreen extends StatefulWidget {
  const RaiseGrievanceScreen({super.key, required this.repo});
  final PortalRepo repo;

  @override
  State<RaiseGrievanceScreen> createState() => _RaiseGrievanceScreenState();
}

class _RaiseGrievanceScreenState extends State<RaiseGrievanceScreen> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _category = 'facilities';
  String _urgency = 'normal';
  bool _confidential = false;
  bool _busy = false;

  static const _categories = [
    ('facilities', Msg('Facilities (food, water, rooms)', 'सुविधाएँ (भोजन, पानी, कमरे)')),
    ('safety', Msg('Safety or ill-treatment', 'सुरक्षा या दुर्व्यवहार')),
    ('health', Msg('Health', 'स्वास्थ्य')),
    ('benefits', Msg('Scholarship or benefit', 'छात्रवृत्ति या लाभ')),
    ('education', Msg('Education', 'शिक्षा')),
    ('other', Msg('Something else', 'कुछ और')),
  ];

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final subject = _subject.text.trim();
    final body = _body.text.trim();
    if (subject.length < 3 || body.length < 5) {
      snack(context, 'Please add a short title and describe what happened.', 'कृपया छोटा शीर्षक और पूरी बात लिखें।', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.repo.raiseGrievance(subject: subject, description: body, category: _category, urgency: _urgency, confidential: _confidential);
      if (!mounted) return;
      snack(context, 'Grievance registered. You will get an answer within 21 days.', 'शिकायत दर्ज हुई। 21 दिनों में उत्तर मिलेगा।');
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) snack(context, _errText(e), _errText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final beneficiary = s.user?.isBeneficiary ?? false;
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Raise a grievance', 'शिकायत दर्ज करें')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          DropdownButtonFormField<String>(
            initialValue: _category,
            isExpanded: true,
            decoration: fieldDecoration(context, label: tx(context, 'What is it about?', 'किस बारे में?'), icon: Icons.category_outlined),
            items: [for (final c in _categories) DropdownMenuItem(value: c.$1, child: Text(c.$2.of(s.lang)))],
            onChanged: (v) => setState(() => _category = v ?? 'other'),
          ),
          const SizedBox(height: 12),
          TextField(controller: _subject, maxLength: 120, decoration: fieldDecoration(context, label: tx(context, 'Short title', 'छोटा शीर्षक'))),
          const SizedBox(height: 4),
          TextField(
              controller: _body,
              minLines: 4,
              maxLines: 8,
              decoration: fieldDecoration(context, label: tx(context, 'What happened?', 'क्या हुआ?'), hint: tx(context, 'When, where, who was involved.', 'कब, कहाँ, कौन शामिल था।'))),
          const SizedBox(height: 12),
          Bi('How urgent is it?', 'कितना ज़रूरी है?', style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: [
              ButtonSegment(value: 'normal', label: Text(tx(context, 'Normal', 'सामान्य'))),
              ButtonSegment(value: 'high', label: Text(tx(context, 'Urgent', 'तुरंत'))),
            ],
            selected: {_urgency},
            onSelectionChanged: (v) => setState(() => _urgency = v.first),
          ),
          if (beneficiary) ...[
            const SizedBox(height: 8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _confidential,
              onChanged: (v) => setState(() => _confidential = v),
              secondary: const Icon(Icons.lock_outline_rounded),
              title: Bi('Keep it confidential', 'गोपनीय रखें'),
              subtitle: Bi('Only the Department sees it — not the institute staff.', 'केवल विभाग देखेगा — संस्थान कर्मचारी नहीं।', style: const TextStyle(fontSize: 12)),
            ),
          ],
          const SizedBox(height: 16),
          ShineButton(label: _busy ? tx(context, 'Sending…', 'भेजा जा रहा है…') : tx(context, 'Submit grievance', 'शिकायत जमा करें'), icon: Icons.send_rounded, onPressed: _busy ? null : _submit),
          const SizedBox(height: 12),
          Bi('Every grievance must be answered within 21 days. If it is not, it moves up to the next level automatically.',
              'हर शिकायत का 21 दिनों में उत्तर देना ज़रूरी है। ऐसा न होने पर यह अपने आप अगले स्तर पर जाती है।',
              style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class NoticesScreen extends StatelessWidget {
  const NoticesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Notices', 'सूचनाएँ'), actions: const [DemoBadge()]),
      body: _Loader<List<NoticeItem>>(
        load: (r) => r.notices(),
        builder: (context, list, repo, reload) {
          final s = AppScope.of(context);
          final cs = Theme.of(context).colorScheme;
          if (list.isEmpty) return const Center(child: EmptyState(icon: Icons.campaign_outlined, title: Msg('No notices', 'कोई सूचना नहीं')));
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              if (repo.isMock) const _MockNote(),
              for (final n in list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Panel(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(fmtDate(n.at, s.lang), style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                      const SizedBox(height: 8),
                      Text(n.body, style: const TextStyle(fontSize: 13.5, height: 1.4)),
                    ]),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// ------------------------------------------------------ beneficiary side ----

class BeneficiaryStatusTab extends StatelessWidget {
  const BeneficiaryStatusTab({super.key, required this.onGo});
  final void Function(int tab) onGo;

  @override
  Widget build(BuildContext context) {
    return _Loader<BeneficiaryRecord?>(
      load: (r) => r.me(),
      builder: (context, me, repo, reload) {
        final s = AppScope.of(context);
        final cs = Theme.of(context).colorScheme;
        if (me == null) {
          return const Center(child: EmptyState(icon: Icons.badge_outlined, title: Msg('Your record is not available yet', 'आपका रिकॉर्ड अभी उपलब्ध नहीं है')));
        }
        final pendingDocs = me.documents.where((d) => d.$2 != 'verified').toList();
        return RefreshIndicator(
          onRefresh: () async => reload(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              if (repo.isMock) const _MockNote(),
              Panel(
                tint: kSage,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(me.name, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
                  if (me.beneficiaryId.isNotEmpty) Text(me.beneficiaryId, style: TextStyle(fontFamily: 'monospace', color: cs.onSurfaceVariant)),
                  const SizedBox(height: 10),
                  InfoRow(icon: Icons.apartment_rounded, en: 'Institute', hi: 'संस्थान', value: me.instituteName.isEmpty ? '—' : me.instituteName),
                  if (me.room.isNotEmpty) InfoRow(icon: Icons.bed_outlined, en: 'Room', hi: 'कमरा', value: me.room),
                  if (me.admittedOn != null) InfoRow(icon: Icons.event_outlined, en: 'Admitted on', hi: 'प्रवेश तिथि', value: fmtDate(me.admittedOn!, s.lang)),
                  if (me.caseWorker.isNotEmpty) InfoRow(icon: Icons.support_agent_rounded, en: 'Case worker', hi: 'केस वर्कर', value: me.caseWorker),
                  if (me.guardian.isNotEmpty) InfoRow(icon: Icons.family_restroom_rounded, en: 'Guardian', hi: 'अभिभावक', value: me.guardian),
                ]),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  SectionTitle('My benefits', 'मेरे लाभ',
                      icon: Icons.volunteer_activism_rounded, trailing: TextButton(onPressed: () => onGo(1), child: Text(tx(context, 'All schemes', 'सभी योजनाएँ')))),
                  if (me.schemes.isEmpty) Bi('No scheme applications yet.', 'अभी कोई योजना आवेदन नहीं।', style: TextStyle(color: cs.onSurfaceVariant)),
                  for (final a in me.schemes)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(s.lang == LangMode.hi ? a.hi : a.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            Text(
                              [
                                if (a.amount != null && a.amount! > 0) '${_rupees(a.amount)} ${a.period}',
                                if (a.nextDate != null) '${tx(context, 'next', 'अगला')} ${fmtDate(a.nextDate!, s.lang)}',
                                if (a.nextStep.isNotEmpty) a.nextStep,
                              ].join(' · '),
                              style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                            ),
                          ]),
                        ),
                        Pill(label: SchemeApp.statusLabel(a.status), color: SchemeApp.statusColor(a.status)),
                      ]),
                    ),
                ]),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const SectionTitle('Health', 'स्वास्थ्य', icon: Icons.favorite_outline_rounded),
                  if (me.lastCheckup != null) InfoRow(icon: Icons.history_rounded, en: 'Last check-up', hi: 'पिछली जाँच', value: fmtDate(me.lastCheckup!, s.lang)),
                  if (me.nextCheckup != null) InfoRow(icon: Icons.event_available_rounded, en: 'Next check-up', hi: 'अगली जाँच', value: fmtDate(me.nextCheckup!, s.lang)),
                  if (me.healthNotes.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(me.healthNotes, style: const TextStyle(fontSize: 13))),
                  if (me.lastCheckup == null && me.nextCheckup == null && me.healthNotes.isEmpty)
                    Bi('No health record yet.', 'अभी कोई स्वास्थ्य रिकॉर्ड नहीं।', style: TextStyle(color: cs.onSurfaceVariant)),
                ]),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  SectionTitle('My documents', 'मेरे दस्तावेज़',
                      icon: Icons.folder_shared_outlined,
                      trailing: pendingDocs.isEmpty ? null : Pill(label: Msg('${pendingDocs.length} pending', '${pendingDocs.length} बाकी'), color: kAmber)),
                  for (final d in me.documents)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(children: [
                        Icon(d.$2 == 'verified' ? Icons.verified_rounded : Icons.schedule_rounded, size: 18, color: d.$2 == 'verified' ? kGreen : kAmber),
                        const SizedBox(width: 8),
                        Expanded(child: Text(d.$1)),
                        Text(d.$2 == 'verified' ? tx(context, 'Verified', 'सत्यापित') : tx(context, 'Pending', 'बाकी'),
                            style: TextStyle(fontSize: 12, color: d.$2 == 'verified' ? kGreen : kAmber, fontWeight: FontWeight.w600)),
                      ]),
                    ),
                  if (me.documents.isEmpty) Bi('No documents on record.', 'कोई दस्तावेज़ दर्ज नहीं।', style: TextStyle(color: cs.onSurfaceVariant)),
                ]),
              ),
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                      onPressed: () => onGo(2), icon: const Icon(Icons.feedback_outlined), label: Text(tx(context, 'Report a problem', 'समस्या बताएँ'))),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                      onPressed: () => onGo(3), icon: const Icon(Icons.call_outlined), label: Text(tx(context, 'Talk to the Department', 'विभाग से बात करें'))),
                ),
              ]),
            ],
          ),
        );
      },
    );
  }
}

class SchemesTab extends StatefulWidget {
  const SchemesTab({super.key});

  @override
  State<SchemesTab> createState() => _SchemesTabState();
}

class _SchemesTabState extends State<SchemesTab> {
  String _q = '';

  Future<void> _request(SchemeInfo sc, PortalRepo repo, VoidCallback reload) async {
    final ok = await confirmDialog(
      context,
      title: const Msg('Apply for this scheme?', 'इस योजना के लिए आवेदन करें?'),
      body: Msg('Your request for "${sc.name}" goes to the institute office, which completes the application with your documents.',
          '"${sc.hi}" के लिए आपका अनुरोध संस्थान कार्यालय को जाएगा, जो आपके दस्तावेज़ों से आवेदन पूरा करेगा।'),
      confirm: const Msg('Send request', 'अनुरोध भेजें'),
    );
    if (!ok || !mounted) return;
    try {
      await repo.requestScheme(sc);
      if (!mounted) return;
      snack(context, 'Request sent. Track it on My status.', 'अनुरोध भेजा गया। मेरी स्थिति पर देखें।');
      reload();
    } catch (e) {
      if (mounted) snack(context, _errText(e), _errText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Loader<(List<SchemeInfo>, BeneficiaryRecord?)>(
      load: (r) async => (await r.schemes(), await r.me()),
      builder: (context, d, repo, reload) {
        final s = AppScope.of(context);
        final cs = Theme.of(context).colorScheme;
        final mine = {for (final a in d.$2?.schemes ?? const <SchemeApp>[]) a.key: a};
        final q = _q.toLowerCase();
        final shown = q.isEmpty ? d.$1 : d.$1.where((x) => x.name.toLowerCase().contains(q) || x.hi.contains(_q) || x.about.toLowerCase().contains(q)).toList();
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            if (repo.isMock) const _MockNote(),
            TextField(onChanged: (v) => setState(() => _q = v), decoration: fieldDecoration(context, label: tx(context, 'Search schemes', 'योजनाएँ खोजें'), icon: Icons.search_rounded)),
            const SizedBox(height: 12),
            if (shown.isEmpty) const EmptyState(icon: Icons.volunteer_activism_outlined, title: Msg('No schemes match', 'कोई योजना मेल नहीं खाती')),
            for (final sc in shown)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(s.lang == LangMode.hi ? sc.hi : sc.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                      if (mine[sc.key] != null) Pill(label: SchemeApp.statusLabel(mine[sc.key]!.status), color: SchemeApp.statusColor(mine[sc.key]!.status)),
                    ]),
                    if (sc.amount != null && sc.amount! > 0)
                      Text('${_rupees(sc.amount)} ${sc.period}', style: TextStyle(color: cs.primary, fontWeight: FontWeight.w700)),
                    if (sc.about.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(sc.about, style: const TextStyle(fontSize: 13))),
                    if (sc.documents.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text('${tx(context, 'Documents', 'दस्तावेज़')}: ${sc.documents.join(', ')}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                      ),
                    if (mine[sc.key] == null || mine[sc.key]!.status == 'rejected') ...[
                      const SizedBox(height: 10),
                      FilledButton.tonalIcon(
                          onPressed: () => _request(sc, repo, reload),
                          icon: const Icon(Icons.how_to_reg_rounded, size: 18),
                          label: Text(tx(context, 'Ask to be enrolled', 'नामांकन का अनुरोध करें'))),
                    ],
                  ]),
                ),
              ),
          ],
        );
      },
    );
  }
}

class CallsTab extends StatelessWidget {
  const CallsTab({super.key});

  Future<void> _request(BuildContext context, PortalRepo repo, VoidCallback reload) async {
    var slot = 'Morning (10 am – 12 pm)';
    final note = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(c).bottom),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Bi('Ask the Department to call you', 'विभाग से कॉल का अनुरोध', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Bi('A department officer calls you directly. Institute staff are not on the call.',
                'विभाग का अधिकारी सीधे आपको कॉल करेगा। संस्थान कर्मचारी कॉल पर नहीं होंगे।',
                style: TextStyle(fontSize: 13, color: Theme.of(c).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 12),
            for (final t in const ['Morning (10 am – 12 pm)', 'Afternoon (2 pm – 4 pm)', 'Evening (5 pm – 7 pm)'])
              RadioListTile<String>(
                contentPadding: EdgeInsets.zero,
                value: t,
                groupValue: slot,
                onChanged: (v) => set(() => slot = v ?? slot),
                title: Text(t),
              ),
            TextField(controller: note, maxLines: 3, maxLength: 1000, decoration: fieldDecoration(c, label: tx(c, 'Anything we should know? (optional)', 'कुछ बताना चाहें? (वैकल्पिक)'))),
            const SizedBox(height: 8),
            ShineButton(label: tx(c, 'Request call', 'कॉल का अनुरोध करें'), icon: Icons.call_rounded, onPressed: () => Navigator.of(c).pop(true)),
          ]),
        ),
      ),
    );
    final text = note.text.trim();
    note.dispose();
    if (ok != true || !context.mounted) return;
    try {
      await repo.requestCall(slot, text);
      if (!context.mounted) return;
      snack(context, 'Request sent. The Department will call you.', 'अनुरोध भेजा गया। विभाग आपको कॉल करेगा।');
      reload();
    } catch (e) {
      if (context.mounted) snack(context, _errText(e), _errText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Loader<List<CallRecord>>(
      load: (r) => r.calls(),
      builder: (context, calls, repo, reload) {
        final s = AppScope.of(context);
        final cs = Theme.of(context).colorScheme;
        return ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            if (repo.isMock) const _MockNote(),
            ShineButton(label: tx(context, 'Ask for a call', 'कॉल का अनुरोध करें'), icon: Icons.add_call, onPressed: () => _request(context, repo, reload)),
            const SizedBox(height: 14),
            if (calls.isEmpty)
              const EmptyState(icon: Icons.call_outlined, title: Msg('No calls yet', 'अभी कोई कॉल नहीं'))
            else
              Panel(
                padding: const EdgeInsets.fromLTRB(14, 4, 14, 4),
                child: Column(children: [
                  for (var i = 0; i < calls.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        switch (calls[i].status) {
                          'completed' => Icons.call_made_rounded,
                          'missed' => Icons.phone_missed_rounded,
                          'requested' => Icons.schedule_send_rounded,
                          _ => Icons.event_rounded,
                        },
                        color: switch (calls[i].status) { 'completed' => kGreen, 'missed' => kRed, _ => cs.primary },
                      ),
                      title: Text(
                        switch (calls[i].status) {
                          'completed' => tx(context, 'Call completed', 'कॉल पूरी हुई'),
                          'missed' => tx(context, 'Missed call', 'छूटी कॉल'),
                          'requested' => tx(context, 'You asked for a call', 'आपने कॉल माँगी'),
                          _ => tx(context, 'Call scheduled', 'कॉल निर्धारित'),
                        },
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        [
                          if (calls[i].at != null) fmtDateTime(calls[i].at!, s.lang),
                          if (calls[i].officialName.isNotEmpty) calls[i].officialName,
                          if (calls[i].note.isNotEmpty) calls[i].note,
                        ].join(' · '),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ]),
              ),
          ],
        );
      },
    );
  }
}

class RightsScreen extends StatelessWidget {
  const RightsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    const rights = [
      Msg('Safe, clean living space, nutritious food and drinking water.', 'सुरक्षित, साफ़ आवास, पौष्टिक भोजन और पीने का पानी।'),
      Msg('Education, health check-ups and medical care.', 'शिक्षा, स्वास्थ्य जाँच और इलाज।'),
      Msg('Every benefit you are enrolled in, paid on time into your own account.', 'जिन योजनाओं में आप नामांकित हैं, उनका लाभ समय पर आपके खाते में।'),
      Msg('Dignity — no physical punishment, abuse or discrimination.', 'सम्मान — कोई शारीरिक दंड, दुर्व्यवहार या भेदभाव नहीं।'),
      Msg('To complain without fear. A confidential grievance is never shown to institute staff.', 'बिना डर के शिकायत। गोपनीय शिकायत संस्थान कर्मचारियों को कभी नहीं दिखाई जाती।'),
      Msg('An answer to every grievance within 21 days, or it moves up automatically.', 'हर शिकायत का 21 दिनों में उत्तर, वरना यह अपने आप ऊपर जाती है।'),
      Msg('To speak privately with a Department officer.', 'विभाग के अधिकारी से अकेले में बात करना।'),
    ];
    return Scaffold(
      appBar: govAppBar(context, title: Bi('Your rights', 'आपके अधिकार')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          for (final r in rights)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Panel(
                padding: const EdgeInsets.all(14),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(Icons.shield_outlined, color: cs.primary),
                  const SizedBox(width: 10),
                  Expanded(child: Bi(r.en, r.hi, style: const TextStyle(fontSize: 14, height: 1.4))),
                ]),
              ),
            ),
          const SizedBox(height: 6),
          Panel(
            tint: kRed,
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              const Icon(Icons.emergency_outlined, color: kRed),
              const SizedBox(width: 10),
              Expanded(
                child: Bi('In an emergency call 112. Childline: 1098. Women helpline: 181.', 'आपात स्थिति में 112 पर कॉल करें। चाइल्डलाइन: 1098। महिला हेल्पलाइन: 181।',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class PortalProfileTab extends StatelessWidget {
  const PortalProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final u = s.user!;
    final inst = s.instituteById(u.instituteId);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              CircleAvatar(radius: 26, backgroundColor: kSage.withValues(alpha: 0.2), child: Text(u.initials, style: const TextStyle(fontWeight: FontWeight.w800, color: kForest))),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u.name, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                  Text(Roles.label(u.role).of(s.lang), style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ]),
              ),
            ]),
            const SizedBox(height: 10),
            InfoRow(icon: Icons.mail_outline_rounded, en: 'Email', hi: 'ईमेल', value: u.email),
            InfoRow(icon: Icons.apartment_rounded, en: 'Institute', hi: 'संस्थान', value: inst?.name ?? '—'),
          ]),
        ),
        const SizedBox(height: 14),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
            const SizedBox(height: 14),
            const SectionTitle('Appearance', 'दिखावट', icon: Icons.palette_outlined),
            SegmentedButton<ThemeMode>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(value: ThemeMode.system, label: Text(tx(context, 'Auto', 'स्वतः'))),
                ButtonSegment(value: ThemeMode.light, label: Text(tx(context, 'Light', 'हल्का'))),
                ButtonSegment(value: ThemeMode.dark, label: Text(tx(context, 'Dark', 'गहरा'))),
              ],
              selected: {s.themeMode},
              onSelectionChanged: (v) => s.setTheme(v.first),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        Panel(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.campaign_outlined),
              title: Bi('Notices', 'सूचनाएँ'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NoticesScreen())),
            ),
            if (u.isBeneficiary)
              ListTile(
                leading: const Icon(Icons.shield_outlined),
                title: Bi('Your rights', 'आपके अधिकार'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const RightsScreen())),
              ),
            ListTile(
              leading: const Icon(Icons.lock_outline_rounded),
              title: Bi('Security & devices', 'सुरक्षा और डिवाइस'),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SecurityScreen())),
            ),
          ]),
        ),
        const SizedBox(height: 18),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: kRed, side: const BorderSide(color: kRed), minimumSize: const Size.fromHeight(48)),
          onPressed: () => signOutFlow(context),
          icon: const Icon(Icons.logout_rounded),
          label: Text(tx(context, 'Sign out', 'साइन आउट')),
        ),
        const SizedBox(height: 10),
        Center(child: Text('v$kAppVersion · ${platformLabel()}', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant))),
      ],
    );
  }
}
