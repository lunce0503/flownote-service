import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { isDeviceOnly, isDeviceModeTransitioning } from './deviceMode';
import { withDeviceWorkspace } from './deviceStorage';
import { handleDeviceRequest } from './deviceWorkspace';
import { DEVICE_SYNC_HEADER, isDeviceSyncNetworkRequest } from './deviceSyncNetwork';

const blockedMessage = '기기 전용 모드에서는 서버 기능을 사용할 수 없습니다. 설정에서 동기화를 켜주세요.';
export function installDeviceTransport() {
  axios.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (isDeviceModeTransitioning()) throw new AxiosError('작업 공간을 전환 중입니다. 화면을 다시 열어주세요.', 'ERR_DEVICE_ONLY', config);
    const url = new URL(config.url ?? '', config.baseURL ?? window.location.origin);
    const deviceSyncRequest = isDeviceSyncNetworkRequest(config.headers);
    if ('delete' in config.headers && typeof config.headers.delete === 'function') config.headers.delete(DEVICE_SYNC_HEADER);
    let body: unknown = config.data;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* Unsupported raw bodies are never forwarded in device mode. */ } }
    if (isDeviceOnly() && !deviceSyncRequest) {
      config.adapter = async request => {
        if (request.signal?.aborted) throw new axios.CanceledError();
        try {
          // The adapter never delegates unknown paths or failures to a network adapter.
          const parsed = new URL(axios.getUri(request), window.location.origin);
          const data = await withDeviceWorkspace((request.method ?? 'get').toUpperCase() !== 'GET', state => handleDeviceRequest(state, request.method ?? 'GET', parsed.pathname + parsed.search, body));
          return { data, status: 200, statusText: 'Device only', headers: {}, config: request };
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : blockedMessage;
          throw new AxiosError(message, 'ERR_DEVICE_ONLY', request, undefined,
            { data: { detail: message }, status: message.includes('충돌') ? 409 : 503, statusText: 'Device only', headers: {}, config: request });
        }
      };
    } else {
      // A local ID is never valid on the server, even if an old timer outlives a mode switch.
      const hasLocalId = url.pathname.split('/').some(part => part.startsWith('device-')) || (body && typeof body === 'object' && 'id' in body && typeof body.id === 'string' && body.id.startsWith('device-'));
      if (hasLocalId && !deviceSyncRequest) throw new AxiosError('기기 전용 자료를 서버에 자동 전송하지 않습니다.', 'ERR_DEVICE_ONLY', config);
    }
    return config;
  });
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (isDeviceModeTransitioning()) return Promise.reject(new Error('작업 공간 전환 중에는 서버 요청을 보내지 않습니다.'));
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const deviceSyncRequest = isDeviceSyncNetworkRequest(headers);
    const staticAsset = url.origin === location.origin && url.pathname.startsWith('/assets/') && method.toUpperCase() === 'GET';
    if (isDeviceOnly() && !deviceSyncRequest && /^https?:$/.test(url.protocol) && !staticAsset) return Promise.reject(new Error(blockedMessage));
    if (deviceSyncRequest) {
      const sanitizedHeaders = new Headers(headers);
      sanitizedHeaders.delete(DEVICE_SYNC_HEADER);
      return originalFetch(input, { ...init, headers: sanitizedHeaders });
    }
    return originalFetch(input, init);
  };
}
