import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:nayan/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('Splash leads to login, demo inspector can sign in', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final app = AppState(prefs);
    await app.init();

    await tester.pumpWidget(NayanApp(app: app));
    expect(find.text('नयन'), findsOneWidget); // splash

    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('नयन · Nayan'), findsOneWidget); // login

    final res = await app.login('inspector1@dosje.gov.in', 'Password123!');
    expect(res.isOk, isTrue);
    expect(app.user?.name, 'Farhan Qureshi');

    final official = AppState(prefs);
    await official.init();
    expect((await official.login('official@dosje.gov.in', 'Password123!')).isOk, isTrue); // officials monitor from Nayan

    // One centralized app: institute staff and beneficiaries sign in to the
    // portal side of Nayan, linked to their own institute.
    final staffApp = AppState(prefs);
    await staffApp.init();
    expect((await staffApp.login('staff@dosje.gov.in', 'Password123!')).isOk, isTrue);
    expect(staffApp.user?.isInstitute, isTrue);
    expect(staffApp.user?.instituteId, isNotEmpty);
    expect(staffApp.scopedInstitutes.length, 1);

    final residentApp = AppState(prefs);
    await residentApp.init();
    expect((await residentApp.login('beneficiary@dosje.gov.in', 'Password123!')).isOk, isTrue);
    expect(residentApp.user?.isBeneficiary, isTrue);

    // Without a server the portal reads the mock store through the same calls.
    final staffRepo = PortalRepo.of(staffApp);
    expect(staffRepo.isMock, isTrue);
    expect(await staffRepo.findings(), isNotEmpty);
    final before = (await staffRepo.grievances()).length;
    await staffRepo.raiseGrievance(subject: 'Test subject', description: 'Test description', category: 'other', urgency: 'normal', confidential: false);
    expect((await staffRepo.grievances()).length, before + 1);
    expect((await PortalRepo.of(residentApp).me())?.name, 'Kavya Iyer');

    // Let demo data (assignments, monitoring, attendance) finish loading.
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    expect(app.assignments.length, greaterThanOrEqualTo(3));
    expect(official.monitorError, isNull);
    expect(official.monitorLoaded, isTrue, reason: 'loading=${official.monitorLoading} user=${official.user?.role}');
    expect(official.cameras, isNotEmpty);
    expect(official.riskRows(), isNotEmpty);

    // The draw is reproducible from its seed.
    final d1 = official.proposeDraw(riskWeighted: true, count: 2);
    final d2 = runDraw(
      rows: official.riskRows(),
      inspectors: official.drawInspectors,
      riskWeighted: true,
      count: 2,
      byName: 'x',
      seed: d1.seed,
    );
    expect(d2.picks.map((p) => p.inst.id).toList(), d1.picks.map((p) => p.inst.id).toList());
    expect(SeededRandom.commitmentOf(d1.seed), d1.commitment);
  });

  // ---- security (§21) -------------------------------------------------------

  test('Server address: https anywhere, http only for local/private hosts', () {
    expect(serverUrlProblem(''), isNull); // demo mode
    expect(serverUrlProblem('https://api.example.gov.in/api/v1'), isNull);
    expect(serverUrlProblem('http://localhost:8000/api/v1'), isNull);
    expect(serverUrlProblem('http://127.0.0.1:8000/api/v1'), isNull);
    expect(serverUrlProblem('http://10.0.2.2:8000/api/v1'), isNull);
    expect(serverUrlProblem('http://10.20.30.40/api/v1'), isNull);
    expect(serverUrlProblem('http://192.168.1.5:8000/api/v1'), isNull);
    expect(serverUrlProblem('http://172.16.0.9/api/v1'), isNull);
    expect(serverUrlProblem('http://172.31.255.1/api/v1'), isNull);
    expect(serverUrlProblem('http://172.32.0.1/api/v1')?.en, 'Use https:// for a public server.');
    expect(serverUrlProblem('http://api.example.gov.in/api/v1')?.en, 'Use https:// for a public server.');
    expect(serverUrlProblem('http://8.8.8.8/api/v1'), isNotNull);
    expect(serverUrlProblem('api.example.gov.in'), isNotNull);
    expect(serverUrlProblem('ftp://example.org'), isNotNull);
  });

  test('Lock policy: idle, warning, background, expiry and refresh window', () {
    final t0 = DateTime(2026, 9, 27, 10);
    expect(LockPolicy.cause(now: t0.add(const Duration(minutes: 14)), lastActivity: t0), isNull);
    expect(LockPolicy.cause(now: t0.add(const Duration(minutes: 15)), lastActivity: t0), LockCause.idle);
    expect(LockPolicy.warning(t0.add(const Duration(minutes: 13)), t0), isNull);
    expect(LockPolicy.warning(t0.add(const Duration(minutes: 14, seconds: 30)), t0), const Duration(seconds: 30));
    // Back from the background: > 5 minutes locks, 4 minutes does not.
    final now = t0.add(const Duration(minutes: 6));
    expect(LockPolicy.cause(now: now, lastActivity: now, backgroundAt: t0), LockCause.background);
    expect(LockPolicy.cause(now: now, lastActivity: now, backgroundAt: t0.add(const Duration(minutes: 2))), isNull);
    // Token expiry.
    expect(LockPolicy.cause(now: now, lastActivity: now, expiresAt: now), LockCause.expired);
    // Refresh only with < 3 min left and activity in the last 5 min.
    final exp = t0.add(const Duration(minutes: 15));
    expect(LockPolicy.shouldRefresh(now: t0.add(const Duration(minutes: 13)), lastActivity: t0.add(const Duration(minutes: 12)), expiresAt: exp), isTrue);
    expect(LockPolicy.shouldRefresh(now: t0.add(const Duration(minutes: 10)), lastActivity: t0.add(const Duration(minutes: 10)), expiresAt: exp), isFalse);
    expect(LockPolicy.shouldRefresh(now: t0.add(const Duration(minutes: 13)), lastActivity: t0.add(const Duration(minutes: 7)), expiresAt: exp), isFalse);
    expect(LockPolicy.shouldRefresh(now: t0, lastActivity: t0), isFalse); // demo: no expiry
  });

  test('Password policy checklist', () {
    bool allOk(String pw) =>
        PasswordPolicy.rules(pw, name: 'Farhan Qureshi', email: 'inspector1@dosje.gov.in', current: 'Old-Pass-1234')
            .every((r) => r.ok);
    expect(allOk('Tq7#vLm2@pXw9'), isTrue);
    expect(allOk('short1A!'), isFalse); // too short
    expect(allOk('farhan-Secure-2026!'), isFalse); // contains the name
    expect(allOk('Inspector1-Secure!'), isFalse); // contains the email name
    expect(allOk('Password123!'), isFalse); // common
    expect(allOk('Old-Pass-1234'), isFalse); // same as current
    expect(PasswordPolicy.strength(''), 0);
    expect(PasswordPolicy.strength('Tq7#vLm2@pXw9kR5'), 4);
  });

  test('Session is memory-only; lock keeps work; sign-out keeps unsent evidence', () async {
    SharedPreferences.setMockInitialValues({'nayan.session': '{"id":"x","token":"t"}', 'nayan.lang': 'en'});
    final prefs = await SharedPreferences.getInstance();
    final app = AppState(prefs);
    await app.init();
    expect(app.user, isNull); // cold start → sign-in screen
    expect(prefs.getString('nayan.session'), isNull);
    expect(app.lang, LangMode.en); // preferences are kept

    expect((await app.login('inspector1@dosje.gov.in', 'Password123!')).isOk, isTrue);
    final u = app.user!;
    final draft = InspectionDraft();
    draft.evidence.add(Evidence(
      localId: 'e1',
      kind: EvKind.photo,
      bytes: utf8.encode('demo'), // Uint8List
      fileName: 'IMG_1.jpg',
      capturedAt: DateTime.now(),
      sha256: 'x',
      lat: 26.8,
      lng: 80.9,
      accuracy: 5,
      deviceId: app.deviceId,
    ));
    app.drafts['asg-1'] = draft;
    expect(app.pendingEvidenceCount, 1);

    // Lock, then unlock with the same account: same session object, work kept.
    app.lock(LockPolicy.reason(LockCause.idle));
    expect(app.locked, isTrue);
    expect((await app.login(u.email, 'Password123!')).isOk, isTrue);
    expect(app.locked, isFalse);
    expect(identical(app.user, u), isTrue);
    expect(app.drafts['asg-1'], same(draft));

    // Sign out: lists cleared, the unsent photo waits for the same inspector.
    await app.logout();
    expect(app.user, isNull);
    expect(app.pendingEvidenceCount, 0);
    expect(prefs.getString('nayan.subs.${u.id}'), isNull);
    expect((await app.login('inspector2@dosje.gov.in', 'Password123!')).isOk, isTrue);
    expect(app.drafts, isEmpty); // another inspector does not see it
    await app.logout();
    expect((await app.login('inspector1@dosje.gov.in', 'Password123!')).isOk, isTrue);
    expect(app.drafts['asg-1'], same(draft));
    expect(app.pendingEvidenceCount, 1);
    await app.logout();
  });
}
