import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';

type RouteModule = { default: ComponentType };

const lazyRoute = (loader: () => Promise<RouteModule>) => {
  const Component = lazy(loader);
  return (
    <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-sm text-stone-500">불러오는 중...</div>}>
      <Component />
    </Suspense>
  );
};

const routes = {
  home: lazyRoute(() => import('./routers/Home/route.tsx')),
  blog: lazyRoute(() => import('./routers/Blog/index.tsx')),
  blogDetail: lazyRoute(() => import('./routers/BlogDetail/index.tsx')),
  social: lazyRoute(() => import('./routers/Social/index.tsx')),
  agent: lazyRoute(() => import('./routers/Agent/index.tsx')),
  login: lazyRoute(() => import('./routers/Login/route.tsx')),
  signup: lazyRoute(() => import('./routers/SignUp/routes.tsx')),
  banpick: lazyRoute(() => import('./routers/LolBanpick/route.tsx')),
  screwPuzzle: lazyRoute(() => import('./routers/ScrewPuzzle/route.tsx')),
  canvas: lazyRoute(() => import('./routers/Canvas/route.tsx')),
  canvasList: lazyRoute(() => import('./routers/Canvas/list.tsx')),
  planner: lazyRoute(() => import('./routers/Planner/route.tsx')),
  stocks: lazyRoute(() => import('./routers/Stock/route.tsx')),
  stockChart: lazyRoute(() => import('./routers/Stock/chart.tsx')),
  settings: lazyRoute(() => import('./routers/Settings/route.tsx')),
  adminCanvas: lazyRoute(() => import('./routers/AdminCanvas/route.tsx')),
  adminFeedback: lazyRoute(() => import('./routers/AdminFeedback/route.tsx')),
  magic: lazyRoute(() => import('./routers/Magic/magic.tsx')),
};

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
    routes: [{ path: '/', element: routes.home }],
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
          { index: true, element: routes.blog },
          { path: ':title', element: routes.blogDetail },
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
      { path: '/canvas', element: routes.canvasList },
      { path: '/canvas/:canvasId', element: routes.canvas },
    ],
  },
  {
    id: 'planner',
    label: '플래너',
    nav: true,
    enabled: true,
    protected: true,
    // /planner = 할 일 · 시간표 · 일기 통합 화면(일간/주간/월간 보기).
    routes: [{ path: '/planner', element: routes.planner }],
  },
  {
    id: 'stocks',
    label: '주식',
    nav: true,
    enabled: true,
    protected: true,
    routes: [
      { path: '/stocks', element: routes.stocks },
      { path: '/stocks/chart', element: routes.stockChart },
    ],
  },
  {
    id: 'social',
    label: '소셜',
    nav: true,
    enabled: true,
    protected: true,
    routes: [{ path: '/social', element: routes.social }],
  },
  {
    id: 'agent',
    label: 'AI 에이전트',
    nav: true,
    enabled: true,
    protected: true,
    routes: [{ path: '/agent', element: routes.agent }],
  },
  {
    id: 'banpick',
    label: '밴픽',
    nav: false,
    enabled: true,
    routes: [{ path: '/banpick', element: routes.banpick }],
  },
  {
    id: 'screw-puzzle',
    label: '나사 퍼즐',
    nav: true,
    enabled: true,
    routes: [{ path: '/screw-puzzle', element: routes.screwPuzzle }],
  },
  {
    id: 'magic',
    label: 'Magic',
    nav: false,
    enabled: true,
    routes: [{ path: '/magic', element: routes.magic }],
  },
  {
    id: 'settings',
    label: '설정',
    nav: false,
    enabled: true,
    protected: true,
    routes: [{ path: '/settings', element: routes.settings }],
  },
  {
    id: 'admin-canvas',
    label: '캔버스 관리',
    nav: false,
    enabled: true,
    protected: true,
    routes: [{ path: '/admin/canvas', element: routes.adminCanvas }],
  },
  {
    id: 'admin-feedback',
    label: '피드백 관리',
    nav: false,
    enabled: true,
    protected: true,
    // 관리자 전용. 설정 화면에서 접수된 사용자 피드백을 확인한다.
    routes: [{ path: '/admin/feedback', element: routes.adminFeedback }],
  },
  {
    id: 'auth',
    label: '인증',
    nav: false,
    enabled: true,
    routes: [
      { path: '/login', element: routes.login },
      { path: '/signup', element: routes.signup },
    ],
  },
];
