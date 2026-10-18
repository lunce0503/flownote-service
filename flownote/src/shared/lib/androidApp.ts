// The native WebView appends this marker. Browser sessions retain their existing UI.
export const isAndroidApp = typeof navigator !== 'undefined'
  && /\bFlownoteAndroid\/\d/.test(navigator.userAgent);

if (isAndroidApp) document.documentElement.dataset.androidApp = 'true';
