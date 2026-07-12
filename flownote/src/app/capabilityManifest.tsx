import type { ReactElement } from 'react';

import Home from './routers/Home/route.tsx';
import Blog from './routers/Blog/index.tsx';
import BlogDetail from './routers/BlogDetail/index.tsx';
import Social from './routers/Social/index.tsx';
import Agent from './routers/Agent/index.tsx';
import TaskRoute from './routers/Task/route.tsx';
import LoginRoute from './routers/Login/route.tsx';
import SignUpRoute from './routers/SignUp/routes.tsx';
import LolBanPickRoute from './routers/LolBanpick/route.tsx';
import ScrewPuzzleRoute from './routers/ScrewPuzzle/route.tsx';
import CanvasRoute from './routers/Canvas/route.tsx';
import CanvasListRoute from './routers/Canvas/list.tsx';
import StockRoute from './routers/Stock/route.tsx';
import StockChartRoute from './routers/Stock/chart.tsx';
import SettingsRoute from './routers/Settings/route.tsx';
import AdminCanvasRoute from './routers/AdminCanvas/route.tsx';
import Magic from './routers/Magic/magic.tsx';

// 하나의 라우트 노드. index 라우트, 또는 children을 가진 부모 라우트를 표현한다.
export type CapabilityRoute = {
  path?: string;
  index?: boolean;
  element?: ReactElement;
  children?: CapabilityRoute[];
};

// "역량 모듈" 한 단위. enabled 플래그로 조합/분리를 데이터로 토글한다.
export type Capability = {
  id: string;
  label: string;
  // 네비게이션/대시보드 노출 여부. 시스템 라우트(로그인 등)는 false.
  nav: boolean;
  // 조합·분리 토글. false면 라우트가 등록되지 않는다.
  enabled: boolean;
  // 로그인 필요 여부. 역량 내 모든 라우트에 동일 적용된다.
  protected?: boolean;
  // 이 역량이 소유하는 라우트들.
  routes: CapabilityRoute[];
};

// 주력 제품(Canvas + 게시글)과 확장 역량, 시스템 라우트를 하나의 매니페스트로 관리한다.
// 새 역량 추가 = 이 배열에 항목 하나를 더하는 것. 분리 = enabled를 false로.
export const capabilityManifest: Capability[] = [
  {
    id: 'home',
    label: '홈',
    nav: false,
    enabled: true,
    routes: [{ path: '/', element: <Home /> }],
  },
  {
    id: 'blog',
    label: '게시글',
    nav: true,
    enabled: true,
    routes: [
      {
        path: '/blog',
        children: [
          { index: true, element: <Blog /> },
          { path: ':title', element: <BlogDetail /> },
        ],
      },
    ],
  },
  {
    id: 'canvas',
    label: '그림판',
    nav: true,
    enabled: true,
    protected: true,
    // /canvas = 그림판 목록, /canvas/:canvasId = 해당 캔버스 편집기(멀티 캔버스 URL 구분).
    routes: [
      { path: '/canvas', element: <CanvasListRoute /> },
      { path: '/canvas/:canvasId', element: <CanvasRoute /> },
    ],
  },
  {
    id: 'stocks',
    label: '주식',
    nav: true,
    enabled: true,
    protected: true,
    routes: [
      { path: '/stocks', element: <StockRoute /> },
      { path: '/stocks/chart', element: <StockChartRoute /> },
    ],
  },
  {
    id: 'task',
    label: '할 일',
    nav: true,
    enabled: true,
    protected: true,
    routes: [{ path: '/task', element: <TaskRoute /> }],
  },
  {
    id: 'social',
    label: '소셜',
    nav: true,
    enabled: true,
    protected: true,
    routes: [{ path: '/social', element: <Social /> }],
  },
  {
    id: 'agent',
    label: 'AI 에이전트',
    nav: true,
    enabled: true,
    protected: true,
    routes: [{ path: '/agent', element: <Agent /> }],
  },
  {
    id: 'banpick',
    label: '밴픽',
    nav: false,
    enabled: true,
    routes: [{ path: '/banpick', element: <LolBanPickRoute /> }],
  },
  {
    id: 'screw-puzzle',
    label: '나사 퍼즐',
    nav: true,
    enabled: true,
    routes: [{ path: '/screw-puzzle', element: <ScrewPuzzleRoute /> }],
  },
  {
    id: 'magic',
    label: 'Magic',
    nav: false,
    enabled: true,
    routes: [{ path: '/magic', element: <Magic /> }],
  },
  {
    id: 'settings',
    label: '설정',
    nav: false,
    enabled: true,
    protected: true,
    routes: [{ path: '/settings', element: <SettingsRoute /> }],
  },
  {
    id: 'admin-canvas',
    label: '캔버스 관리',
    nav: false,
    enabled: true,
    protected: true,
    routes: [{ path: '/admin/canvas', element: <AdminCanvasRoute /> }],
  },
  {
    id: 'auth',
    label: '인증',
    nav: false,
    enabled: true,
    routes: [
      { path: '/login', element: <LoginRoute /> },
      { path: '/signup', element: <SignUpRoute /> },
    ],
  },
];
