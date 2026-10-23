import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import './App.css';

import Header from '@/widgets/Header';
import { useFullscreen } from '@/shared/lib/useFullscreen';
import { getRouteDocumentTitle, useDocumentTitle } from '@/shared/lib/useDocumentTitle';
import { AuthProvider, ProtectedRoute } from '@/features/auth';
import { ThemeProvider } from '@/features/theme';
import { isInstalledApp } from '@/shared/lib/androidApp';
import AndroidNavigation from './AndroidNavigation';
import { DEVICE_MODE_PREFIX, deviceOwner, isDeviceOnly } from '@/shared/lib/deviceMode';
import {
  capabilityManifest,
  isCapabilityVisibleInNavigation,
  type CapabilityRoute,
} from './capabilityManifest.tsx';

const renderRoute = (route: CapabilityRoute, key: string, isProtected?: boolean) => {
  const element =
    route.element && isProtected ? <ProtectedRoute>{route.element}</ProtectedRoute> : route.element;

  if (route.index) {
    return <Route key={key} index element={element} />;
  }

  return (
    <Route key={key} path={route.path} element={element}>
      {route.children?.map((child, index) => renderRoute(child, `${key}.${index}`, isProtected))}
    </Route>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  const local = isDeviceOnly();
  const localRoute = /^\/(?:$|blog(?:\/|$)|canvas(?:\/|$)|planner(?:\/|$)|library(?:\/|$)|settings(?:\/|$))/.test(location.pathname);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === null || event.key === `${DEVICE_MODE_PREFIX}${deviceOwner()}` || event.key === 'flownote_auth_user') {
        window.dispatchEvent(new Event('flownote-device-mode-changing'));
        window.location.replace('/settings');
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const { isFullscreen } = useFullscreen();
  const [titleFeature, titleDetail] = getRouteDocumentTitle(location.pathname);
  useDocumentTitle(titleFeature, titleDetail, 0);
  // 전체 화면(전체로 보기) 중에는 브라우저 UI와 함께 Flownote 헤더도 숨긴다.
  const shouldShowHeader = !isInstalledApp && !isFullscreen && !["/login", "/signup"].includes(location.pathname);

  return (
    <>
      {shouldShowHeader && <Header isCapabilityVisible={isCapabilityVisibleInNavigation} />}
      {local && !/^\/canvas\/.+/.test(location.pathname) && <aside className="bg-[#eee8da] px-4 py-2 text-sm text-stone-900" aria-label="기기 저장 상태">
        <strong>기기 전용</strong> · 서버 저장·실시간 수신 꺼짐 <Link to="/settings" className="ml-2 underline">동기화 설정</Link>
      </aside>}
      {local && /^\/canvas\/.+/.test(location.pathname) && <Link to="/settings" className="device-mode-editor-badge">기기 전용 · 설정</Link>}
      {local && !localRoute ? <main className="p-6"><h1 className="text-xl font-bold">서버 연결이 필요한 기능입니다</h1><p className="my-3">기기 전용 모드에서는 이 기능을 사용할 수 없습니다.</p><Link to="/settings" className="underline">동기화 설정으로 이동</Link></main> : <Routes>
        {capabilityManifest
          .filter((capability) => capability.enabled)
          .flatMap((capability) =>
            capability.routes.map((route, index) =>
              renderRoute(route, `${capability.id}.${index}`, capability.protected),
            ),
          )}
      </Routes>}
      {isInstalledApp && <AndroidNavigation key={location.pathname} />}
    </>
  );
};

const App = () => {
  return (
    <div className='App'>
      <div className='w-full'>
        <BrowserRouter>
          <ThemeProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </div>
    </div>
  );
};

export default App;
