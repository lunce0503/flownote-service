// The native WebView appends this marker. Browser sessions retain their existing UI.
export const isAndroidApp = typeof navigator !== 'undefined'
  && /\bFlownoteAndroid\/\d/.test(navigator.userAgent);
export const isDesktopApp = typeof navigator !== 'undefined'
  && /\bFlownoteDesktop\/\d/.test(navigator.userAgent);
export const isInstalledApp = isAndroidApp || isDesktopApp;

if (isAndroidApp) document.documentElement.dataset.androidApp = 'true';
if (isDesktopApp) document.documentElement.dataset.desktopApp = 'true';
if (isInstalledApp) document.documentElement.dataset.installedApp = 'true';
