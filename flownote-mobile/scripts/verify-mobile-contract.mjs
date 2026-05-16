import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const appJson = JSON.parse(read('app.json'));
const appSource = read('App.tsx');

const compareVersions = (currentVersion, minimumVersion) => {
  const current = currentVersion.split('.').map((part) => Number(part) || 0);
  const minimum = minimumVersion.split('.').map((part) => Number(part) || 0);
  const length = Math.max(current.length, minimum.length);

  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;

    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }

  return true;
};

const checks = [
  {
    name: 'mobile app loads backend-managed config',
    pass: read('src/api/client.ts').includes("'/api/mobile/config'"),
  },
  {
    name: 'mobile app depends on native WebView package',
    pass: Boolean(packageJson.dependencies?.['react-native-webview']),
  },
  {
    name: 'app renders backend-managed web url in WebView',
    pass: appSource.includes('react-native-webview')
      && appSource.includes('source={{ uri: config.web_url }}'),
  },
  {
    name: 'app handles iOS and Android web navigation',
    pass: appSource.includes('allowsBackForwardNavigationGestures')
      && appSource.includes('BackHandler.addEventListener'),
  },
  {
    name: 'app respects backend-managed feature flags',
    pass: appSource.includes("enabled_features.includes('webview')"),
  },
  {
    name: 'app respects backend-managed minimum supported version',
    pass: appSource.includes('minimum_supported_version')
      && appSource.includes('isVersionSupported'),
  },
  {
    name: 'mobile app version matches package manifest',
    pass: appSource.includes(`MOBILE_APP_VERSION = '${packageJson.version}'`)
      && appJson.expo?.version === packageJson.version
      && appJson.expo?.runtimeVersion === packageJson.version,
  },
  {
    name: 'minimum version comparison handles semantic numeric order',
    pass: compareVersions('1.10.0', '1.2.0')
      && compareVersions('1.2.0', '1.2.0')
      && !compareVersions('1.2.0', '1.10.0'),
  },
  {
    name: 'WAS url is externally configurable',
    pass: read('.env.example').includes('EXPO_PUBLIC_WAS_URL='),
  },
  {
    name: 'native app permits local HTTP web urls on iOS and Android',
    pass: appJson.expo?.android?.usesCleartextTraffic === true
      && appJson.expo?.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === true,
  },
];

const failed = checks.filter((check) => !check.pass);

checks.forEach((check) => {
  console.log(`${check.pass ? 'ok' : 'fail'} - ${check.name}`);
});

if (failed.length > 0) {
  process.exitCode = 1;
}
