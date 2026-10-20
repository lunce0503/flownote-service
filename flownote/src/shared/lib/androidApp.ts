import { installedAppPlatform } from './installedAppPlatform';
// Native containers append a marker. Safari and browser sessions retain their existing UI.
const platform = installedAppPlatform(typeof navigator === 'undefined' ? '' : navigator.userAgent);
export const isAndroidApp = platform === 'android';
export const isIOSApp = platform === 'ios';
export const isDesktopApp = platform === 'desktop';
export const isInstalledApp = platform !== null;

if (isAndroidApp) document.documentElement.dataset.androidApp = 'true';
if (isIOSApp) document.documentElement.dataset.iosApp = 'true';
if (isDesktopApp) document.documentElement.dataset.desktopApp = 'true';
if (isInstalledApp) document.documentElement.dataset.installedApp = 'true';
