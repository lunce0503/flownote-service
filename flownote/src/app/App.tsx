import {BrowserRouter, Routes,Route, useLocation } from 'react-router-dom';
import './App.css';

import { Header } from '../widgets';
import Magic from './routers/magic/magic.tsx';

import Home from './routers/Home';
import Blog from './routers/Blog/index.tsx';
import Social from './routers/Social/index.tsx';
import Agent from './routers/Agent/index.tsx';
import TaskRoute from './routers/Task/route.tsx';
import LoginRoute from './routers/Login/route.tsx';
import SignUpRoute from './routers/SignUp/routes.tsx';
import LolBanPickRoute from './routers/LolBanPick/route.tsx';
import CanvasRoute from './routers/Canvas/route.tsx';
import StockRoute from './routers/Stock/route.tsx';
import StockChartRoute from './routers/Stock/chart.tsx';
import SettingsRoute from './routers/Settings/route.tsx';
import BlogDetail from './routers/BlogDetail/index.tsx';
import { AuthProvider } from '../shared/auth/AuthContext.tsx';
import ProtectedRoute from '../shared/auth/ProtectedRoute.tsx';
import { ThemeProvider } from '../features/theme';

const AppRoutes = () => {
  const location = useLocation();
  const shouldShowHeader = !["/login", "/signup"].includes(location.pathname);

  return (
    <>
      {shouldShowHeader && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/magic" element={<Magic />} />
        <Route path="/blog">
          <Route index element={<Blog />} />
          <Route path=":title" element={<BlogDetail />}></Route>
        </Route>
        <Route
          path="/social"
          element={
            <ProtectedRoute>
              <Social />
            </ProtectedRoute>
          }
        ></Route>
        <Route
          path="/agent"
          element={
            <ProtectedRoute>
              <Agent />
            </ProtectedRoute>
          }
        ></Route>
        <Route
          path="/task"
          element={
            <ProtectedRoute>
              <TaskRoute />
            </ProtectedRoute>
          }
        ></Route>
        <Route path="/login" element={<LoginRoute />}></Route>
        <Route path="/signup" element={<SignUpRoute/>}></Route>
        <Route path="/banpick" element={<LolBanPickRoute />}></Route>
        <Route
          path="/canvas"
          element={
            <ProtectedRoute>
              <CanvasRoute />
            </ProtectedRoute>
          }
        ></Route>
        <Route
          path="/stocks"
          element={
            <ProtectedRoute>
              <StockRoute />
            </ProtectedRoute>
          }
        ></Route>
        <Route
          path="/stocks/chart"
          element={
            <ProtectedRoute>
              <StockChartRoute />
            </ProtectedRoute>
          }
        ></Route>
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsRoute />
            </ProtectedRoute>
          }
        ></Route>
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
