import { installedAppPlatform } from './installedAppPlatform.ts';

export const DEVICE_MODE_PREFIX = 'flownote.device-mode:';
export const deviceOwner = (): string => {
  try {
    const user: unknown = JSON.parse(localStorage.getItem('flownote_auth_user') ?? 'null');
    return user && typeof user === 'object' && 'id' in user && typeof user.id === 'string' ? user.id : '';
  } catch { return ''; }
};
export const isDeviceOnly = (): boolean => {
  if (!installedAppPlatform(typeof navigator === 'undefined' ? '' : navigator.userAgent)) return false;
  const owner = deviceOwner();
  if (!owner) return false;
  try {
    const stored = localStorage.getItem(`${DEVICE_MODE_PREFIX}${owner}`);
    // Unknown/corrupt mode values must not silently resume uploading.
    return stored !== null && stored !== 'cloud';
  } catch { return true; }
};
export const setDeviceOnly = (enabled: boolean) => {
  const owner = deviceOwner();
  if (!owner) throw new Error('로그인한 계정을 확인해주세요.');
  localStorage.setItem(`${DEVICE_MODE_PREFIX}${owner}`, enabled ? 'device' : 'cloud');
};
export const newWorkspaceId = () => `${isDeviceOnly() ? 'device-' : ''}${crypto.randomUUID()}`;
export const deviceNamespace = (base: string) => isDeviceOnly() ? `${base}-device:${deviceOwner()}` : base;
