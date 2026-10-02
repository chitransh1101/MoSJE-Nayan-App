// Renders the main screens with demo data at phone size and writes PNGs to
// test_screens/shots/ (run with --update-goldens). Used by CI to publish
// screenshots for review; not part of the normal test run.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nayan/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> _font(String family, List<String> paths) async {
  final loader = FontLoader(family);
  var any = false;
  for (final p in paths) {
    final f = File(p);
    if (f.existsSync()) {
      final bytes = f.readAsBytesSync();
      loader.addFont(Future<ByteData>.value(ByteData.view(bytes.buffer)));
      any = true;
    }
  }
  if (any) await loader.load();
}

Widget _host(AppState app, Widget home, {ThemeMode mode = ThemeMode.light}) => AppScope(
      app: app,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: buildTheme(Brightness.light, false),
        darkTheme: buildTheme(Brightness.dark, false),
        themeMode: mode,
        home: home,
      ),
    );

Future<void> _settle(WidgetTester t, [int steps = 8]) async {
  for (var i = 0; i < steps; i++) {
    await t.pump(const Duration(milliseconds: 400));
  }
}

Future<void> _shot(WidgetTester t, AppState app, Widget home, String name, {ThemeMode mode = ThemeMode.light, Future<void> Function()? then}) async {
  await t.pumpWidget(_host(app, home, mode: mode));
  await _settle(t);
  if (then != null) {
    await then();
    await _settle(t, 6);
  }
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('shots/$name.png'));
  await t.pumpWidget(const SizedBox());
  await t.pump(const Duration(seconds: 1));
}

void main() {
  testWidgets('screens', (t) async {
    const fonts = 'test_screens/fonts';
    await _font('Roboto', ['$fonts/Roboto-Regular.ttf', '$fonts/Roboto-Medium.ttf', '$fonts/Roboto-Bold.ttf']);
    await _font('NotoDeva', ['$fonts/NotoSansDevanagari.ttf']);
    await _font('MaterialIcons', ['$fonts/MaterialIcons-Regular.otf']);
    debugFontFallback = const ['NotoDeva'];

    t.view.physicalSize = const Size(780, 1800);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);

    SharedPreferences.setMockInitialValues({'nayan.tour.official': true, 'nayan.tour.inspector': true});
    final prefs = await SharedPreferences.getInstance();

    final ins = AppState(prefs);
    await ins.init();
    await _shot(t, ins, const LoginScreen(), '01_login');
    await ins.login('inspector1@dosje.gov.in', 'Password123!');
    for (var i = 0; i < 15; i++) {
      await t.pump(const Duration(seconds: 1));
    }
    await _shot(t, ins, const HomeScreen(), '02_inspector_visits');
    final a = ins.assignments.first;
    await _shot(t, ins, AssignmentDetailScreen(assignmentId: a.id), '03_assignment');
    await _shot(t, ins, InspectionScreen(assignmentId: a.id), '04_inspection');
    await _shot(t, ins, const CctvScreen(), '05_cctv');
    await _shot(t, ins, CameraViewerScreen(feed: ins.scopedCameras.first), '06_camera');
    await _shot(t, ins, const VcScreen(), '07_vc');
    await _shot(t, ins, SubmissionDetailScreen(submission: ins.submissions.first), '08_report');

    final off = AppState(prefs);
    await off.init();
    await off.login('official@dosje.gov.in', 'Password123!');
    for (var i = 0; i < 15; i++) {
      await t.pump(const Duration(seconds: 1));
    }
    await _shot(t, off, const HomeScreen(), '09_official_monitor');
    await _shot(t, off, const HomeScreen(), '10_official_monitor_dark', mode: ThemeMode.dark);
    await _shot(t, off, const AssignScreen(), '11_assign', then: () async {
      await t.tap(find.byIcon(Icons.casino_rounded).first);
      for (var i = 0; i < 6; i++) {
        await t.pump(const Duration(milliseconds: 500));
      }
    });
    await _shot(t, off, const InsightsScreen(), '12_insights');
    await _shot(t, off, const AlertsScreen(), '13_alerts');
    off.stopLive();
    ins.stopLive();
  });
}
