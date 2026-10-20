export function installedAppPlatform(userAgent: string): 'ios' | 'android' | 'desktop' | null {
  if (/\bFlownoteIOS\/\d/.test(userAgent)) return 'ios';
  if (/\bFlownoteAndroid\/\d/.test(userAgent)) return 'android';
  if (/\bFlownoteDesktop\/\d/.test(userAgent)) return 'desktop';
  return null;
}
