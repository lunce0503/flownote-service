import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';

import { Header } from '@/widgets';
import { AuthProvider, ProtectedRoute } from '@/features/auth';
import { ThemeProvider } from '@/features/theme';
import { capabilityManifest, type CapabilityRoute } from './capabilityManifest.tsx';

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
  const shouldShowHeader = !["/login", "/signup"].includes(location.pathname);

  return (
    <>
      {shouldShowHeader && <Header />}
      <Routes>
        {capabilityManifest
          .filter((capability) => capability.enabled)
          .flatMap((capability) =>
            capability.routes.map((route, index) =>
              renderRoute(route, `${capability.id}.${index}`, capability.protected),
            ),
          )}
      </Routes>
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
