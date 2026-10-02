// Run once after `flutter create` has generated the android/, ios/ and web/
// folders:   dart run tool/setup_platforms.dart
//
// Adds camera / location permissions with bilingual explanations, the app
// name, and the web-app (PWA) details so Nayan installs to the home screen on
// iPhone and Android. Safe to run more than once.

import 'dart:convert';
import 'dart:io';

void main() {
  _android();
  _ios();
  _web();
  stdout.writeln('Nayan platform setup done.');
}

String? _read(String path) {
  final f = File(path);
  if (!f.existsSync()) {
    stdout.writeln('  skip (not found): $path');
    return null;
  }
  return f.readAsStringSync();
}

void _write(String path, String text) {
  File(path).writeAsStringSync(text);
  stdout.writeln('  updated: $path');
}

void _android() {
  const path = 'android/app/src/main/AndroidManifest.xml';
  var s = _read(path);
  if (s == null) return;
  const perms = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.RECORD_AUDIO',
  ];
  final add = StringBuffer();
  for (final p in perms) {
    if (!s.contains('"$p"')) add.writeln('    <uses-permission android:name="$p"/>');
  }
  if (add.isNotEmpty) s = s.replaceFirst('<application', '${add}    <application');
  s = s.replaceFirst(RegExp(r'android:label="[^"]*"'), 'android:label="Nayan"');
  const view = '''
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
''';
  if (!s.contains('android:scheme="https"')) {
    if (s.contains('</queries>')) {
      s = s.replaceFirst('</queries>', '$view    </queries>');
    } else {
      s = s.replaceFirst('</manifest>', '    <queries>\n$view    </queries>\n</manifest>');
    }
  }
  _write(path, s);
}

void _ios() {
  const path = 'ios/Runner/Info.plist';
  var s = _read(path);
  if (s == null) return;
  const keys = {
    'NSCameraUsageDescription':
        'Nayan uses the camera to capture inspection evidence. / नयन निरीक्षण साक्ष्य लेने के लिए कैमरे का उपयोग करता है।',
    'NSMicrophoneUsageDescription':
        'Nayan records sound with inspection videos. / नयन निरीक्षण वीडियो के साथ आवाज़ रिकॉर्ड करता है।',
    'NSPhotoLibraryUsageDescription':
        'Nayan may save or read inspection photos. / नयन निरीक्षण फ़ोटो सहेज या पढ़ सकता है।',
    'NSLocationWhenInUseUsageDescription':
        'Nayan records where each piece of evidence was taken. / नयन दर्ज करता है कि हर साक्ष्य कहाँ लिया गया।',
  };
  final add = StringBuffer();
  for (final e in keys.entries) {
    if (!s.contains('<key>${e.key}</key>')) add.write('\t<key>${e.key}</key>\n\t<string>${e.value}</string>\n');
  }
  if (!s.contains('<key>LSApplicationQueriesSchemes</key>')) {
    add.write('\t<key>LSApplicationQueriesSchemes</key>\n\t<array>\n\t\t<string>https</string>\n\t</array>\n');
  }
  final end = s.lastIndexOf('</dict>');
  if (end > 0 && add.isNotEmpty) s = s.substring(0, end) + add.toString() + s.substring(end);
  s = s.replaceFirst(
    RegExp(r'<key>CFBundleDisplayName</key>\s*<string>[^<]*</string>'),
    '<key>CFBundleDisplayName</key>\n\t<string>Nayan</string>',
  );
  _write(path, s);
}

void _web() {
  const mPath = 'web/manifest.json';
  final m = _read(mPath);
  if (m != null) {
    final j = jsonDecode(m) as Map<String, dynamic>;
    j['name'] = 'Nayan · नयन — Field Inspection';
    j['short_name'] = 'Nayan';
    j['description'] = 'Field inspection app for DoSJE inspectors';
    j['start_url'] = '.';
    j['display'] = 'standalone';
    j['orientation'] = 'portrait';
    j['background_color'] = '#3F5A45';
    j['theme_color'] = '#3F5A45';
    _write(mPath, const JsonEncoder.withIndent('    ').convert(j));
  }

  const iPath = 'web/index.html';
  var h = _read(iPath);
  if (h == null) return;
  h = h.replaceFirst(RegExp(r'<title>[^<]*</title>'), '<title>Nayan · नयन</title>');
  h = h.replaceFirst(RegExp(r'<meta name="description" content="[^"]*">'),
      '<meta name="description" content="Nayan — field inspection app for DoSJE inspectors">');
  h = h.replaceFirst(RegExp(r'<meta name="apple-mobile-web-app-title" content="[^"]*">'),
      '<meta name="apple-mobile-web-app-title" content="Nayan">');
  if (!h.contains('name="theme-color"')) {
    h = h.replaceFirst('</head>', '  <meta name="theme-color" content="#3F5A45">\n</head>');
  }
  if (!h.contains('overscroll-behavior')) {
    // No browser pull-to-refresh or bounce: the web app behaves like an app.
    h = h.replaceFirst('</head>', '  <style>html, body { overscroll-behavior: none; overflow: hidden; }</style>\n</head>');
  }
  if (!h.contains('name="mobile-web-app-capable"')) {
    h = h.replaceFirst('</head>', '  <meta name="mobile-web-app-capable" content="yes">\n</head>');
  }
  if (!h.contains('id="nayan-loading"')) {
    // Simple branded loading screen while the app downloads.
    const loading = '''
  <div id="nayan-loading" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#3F5A45;color:#fff;font-family:sans-serif">
    <div style="font-size:40px;font-weight:700">नयन</div>
    <div style="letter-spacing:6px;margin-top:4px">NAYAN</div>
    <div style="margin-top:14px;opacity:.75;font-size:14px">Loading… · लोड हो रहा है…</div>
  </div>
  <script>
    window.addEventListener('flutter-first-frame', function () {
      var el = document.getElementById('nayan-loading');
      if (el) el.remove();
    });
  </script>
''';
    h = h.replaceFirst(RegExp(r'<body>'), '<body>\n$loading');
  }
  _write(iPath, h);
}
