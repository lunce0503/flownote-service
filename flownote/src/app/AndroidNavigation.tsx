import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Bot, CalendarDays, Grid2X2, House, NotebookPen, Palette, X } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useFullscreen } from '@/shared/lib/useFullscreen';
import { capabilityManifest } from './capabilityManifest';
import './android-app.css';

const primary = [
  { path: '/', label: '홈', icon: House },
  { path: '/blog', label: '노트', icon: NotebookPen },
  { path: '/canvas', label: '캔버스', icon: Palette },
  { path: '/planner', label: '플래너', icon: CalendarDays },
];

export default function AndroidNavigation() {
  const { pathname } = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const { isFullscreen } = useFullscreen();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const authPage = pathname === '/login' || pathname === '/signup';
  const editor = /^\/canvas\/.+/.test(pathname);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
      if (event.key !== 'Tab') return;
      const controls = menuRef.current?.querySelectorAll<HTMLElement>('a, button');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
      menuButton?.focus();
    };
  }, [menuOpen]);

  useEffect(() => {
    document.documentElement.dataset.appNavigation = !authPage && !editor && !isFullscreen ? 'visible' : 'hidden';
  }, [authPage, editor, isFullscreen]);

  if (!isAuthenticated && !authPage) return <Navigate to="/login" replace />;
  if (authPage || isFullscreen) return null;

  return <>
    {editor ? <Link to="/canvas" className="android-editor-library" aria-label="캔버스 목록으로 돌아가기"><Grid2X2 size={18} /></Link> : (
      <nav className="android-navigation" aria-label="앱 기능">
        {primary.map(({ path, label, icon: Icon }) => <Link key={path} to={path}
          aria-current={(path === '/' ? pathname === '/' : pathname.startsWith(path)) ? 'page' : undefined}>
          <Icon size={21} aria-hidden="true" /><span>{label}</span>
        </Link>)}
        <button ref={menuButtonRef} type="button" aria-label="전체 기능" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Grid2X2 size={21} aria-hidden="true" /><span>전체</span>
        </button>
      </nav>
    )}
    {menuOpen && <div className="android-menu-backdrop" onClick={() => setMenuOpen(false)}>
      <section ref={menuRef} className="android-menu" role="dialog" aria-modal="true" aria-labelledby="android-menu-title"
        onClick={event => event.stopPropagation()}>
        <div className="android-menu-heading"><h2 id="android-menu-title">전체 기능</h2>
          <button autoFocus data-android-menu-close type="button" aria-label="전체 기능 닫기" onClick={() => setMenuOpen(false)}><X size={22} /></button>
        </div>
        <div className="android-menu-grid">
          {capabilityManifest.filter(item => item.enabled && item.id !== 'auth' && item.id !== 'home').map(item => {
            const path = item.routes.find(route => route.path && !route.path.includes(':'))?.path;
            return path ? <Link key={item.id} to={path} onClick={() => setMenuOpen(false)}>
              {item.id === 'agent' ? <Bot size={20} /> : <Grid2X2 size={20} />}
              <span>{item.label}{item.stage === 'development' && <small>개발 중</small>}</span>
            </Link> : null;
          })}
        </div>
        <button type="button" className="android-logout" onClick={() => {
          void logout().then(() => setMenuOpen(false)).catch(() => window.alert("로그아웃하지 못했습니다. 다시 시도해주세요."));
        }}>로그아웃</button>
      </section>
    </div>}
  </>;
}
