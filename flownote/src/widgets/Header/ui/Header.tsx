import React, { useState } from "react";
import { 
  Notebook, 
  Menu, 
  LogIn, 
  LogOut,
  CheckSquare, 
  BookOpen, 
  Users, 
  X,
  User,
  Bot,
  Palette,
  TrendingUp,
  Settings,
  Activity,
  Puzzle,
  Ellipsis,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { ThemeModeControl } from "@/features/theme";

export default function Header() {
  // 사이드바 상태 관리
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isMoreOpen, setIsMoreOpen] = useState<boolean>(false);
  const [language, setLanguage] = useState<"ko" | "en">(() => (
    localStorage.getItem("flownote_language") === "en" ? "en" : "ko"
  ));
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const labels = {
    ko: {
      blog: "게시글",
      social: "소셜",
      agent: "에이전트",
      canvas: "그림판",
      task: "일정",
      stocks: "주식",
      puzzle: "퍼즐",
      stockChart: "주식 차트",
      banpick: "밴픽",
      magic: "Magic",
      settings: "설정",
      more: "기타",
      login: "로그인",
      logout: "로그아웃",
      menu: "메뉴",
      closeMenu: "메뉴 닫기",
      admin: "운영 진단",
    },
    en: {
      blog: "Blog",
      social: "Social",
      agent: "Agent",
      canvas: "Canvas",
      task: "Task",
      stocks: "Stocks",
      puzzle: "Puzzle",
      stockChart: "Stock Chart",
      banpick: "Banpick",
      magic: "Magic",
      settings: "Settings",
      more: "Etc",
      login: "Login",
      logout: "Logout",
      menu: "Menu",
      closeMenu: "Close menu",
      admin: "Diagnostics",
    },
  }[language];

  React.useEffect(() => {
    const handleLanguageChange = () => {
      setLanguage(localStorage.getItem("flownote_language") === "en" ? "en" : "ko");
    };
    window.addEventListener("flownote-language-change", handleLanguageChange);
    window.addEventListener("storage", handleLanguageChange);
    return () => {
      window.removeEventListener("flownote-language-change", handleLanguageChange);
      window.removeEventListener("storage", handleLanguageChange);
    };
  }, []);

  const onMenuClick = () => {
    setIsMoreOpen(false);
    setIsSidebarOpen(true);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const closeProfile = () => {
    setIsProfileOpen(false);
  };

  const closeMore = () => {
    setIsMoreOpen(false);
  };

  const handleLogout = () => {
    logout();
    closeProfile();
    closeMore();
    closeSidebar();
    navigate("/");
  };

  const primaryNavLinks = [
    { name: labels.canvas, href: "/canvas", icon: <Palette size={22} /> },
    { name: labels.blog, href: "/blog", icon: <BookOpen size={22} /> },
  ];

  const extraNavLinks = [
    { name: labels.social, href: "/social", icon: <Users size={22} /> },
    { name: labels.agent, href: "/agent", icon: <Bot size={22} /> },
    { name: labels.task, href: "/task", icon: <CheckSquare size={22} /> },
    { name: labels.stocks, href: "/stocks", icon: <TrendingUp size={22} /> },
    { name: labels.stockChart, href: "/stocks/chart", icon: <TrendingUp size={22} /> },
    { name: labels.puzzle, href: "/screw-puzzle", icon: <Puzzle size={22} /> },
    { name: labels.banpick, href: "/banpick", icon: <Trophy size={22} /> },
    { name: labels.magic, href: "/magic", icon: <Sparkles size={22} /> },
    { name: labels.settings, href: "/settings", icon: <Settings size={22} /> },
    ...(user?.role === "ADMIN" ? [{ name: labels.admin, href: "/admin/canvas", icon: <Activity size={22} /> }] : []),
  ];

  const sidebarLinks = [...primaryNavLinks, ...extraNavLinks];

  const profileLinks = [
    { name: labels.canvas, href: "/canvas", icon: <Palette size={18} /> },
    { name: labels.social, href: "/social", icon: <Users size={18} /> },
    { name: labels.agent, href: "/agent", icon: <Bot size={18} /> },
    { name: labels.task, href: "/task", icon: <CheckSquare size={18} /> },
    { name: labels.stocks, href: "/stocks", icon: <TrendingUp size={18} /> },
    { name: labels.settings, href: "/settings", icon: <Settings size={18} /> },
    ...(user?.role === "ADMIN" ? [{ name: labels.admin, href: "/admin/canvas", icon: <Activity size={18} /> }] : []),
  ];

  return (
    <>
      {/* --- 기존 헤더 유지 --- */}
      <header className="relative z-[900] w-full border-b border-stone-800 bg-stone-950 px-2 py-2 shadow-lg">
        <nav className="flex flex-row items-center justify-between text-stone-100">
          {/* Left Section: Menu & Logo */}
          <div className="flex items-center gap-2 md:gap-2">
            {/* Menu button */}
            <button
              onClick={onMenuClick}
              className="rounded-md p-2 transition-colors duration-200 hover:bg-stone-800"
              aria-label={labels.menu}
            >
              <Menu size={24} />
            </button>

            {/* Header title / Logo */}
            <Link className="flex items-center gap-2 group" to="/">
              <div className="py-2 rounded-lg md:bg-transparent">
                <Notebook
                  className="text-amber-200 transition-colors group-hover:text-white md:hidden"
                  size={24}
                />
              </div>
              <span className="hidden text-2xl font-black text-white transition-colors group-hover:text-amber-200 md:inline">
                Flownote
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            {primaryNavLinks.map((link) => (
              <Link
                key={link.name}
                className="group flex min-w-12 flex-col items-center rounded-lg px-2 py-1 text-xs font-bold text-stone-200 transition-colors hover:bg-stone-800 hover:text-amber-100"
                to={link.href}
                title={link.name}
                onClick={closeMore}
              >
                <span className="md:hidden">{link.icon}</span>
                <span className="hidden md:inline">{link.name}</span>
              </Link>
            ))}

            <div className="relative">
              <button
                type="button"
                className="group flex min-w-12 flex-col items-center rounded-lg px-2 py-1 text-xs font-bold text-stone-200 transition-colors hover:bg-stone-800 hover:text-amber-100"
                title={labels.more}
                aria-haspopup="menu"
                aria-expanded={isMoreOpen}
                onClick={() => {
                  setIsProfileOpen(false);
                  setIsMoreOpen((open) => !open);
                }}
              >
                <span className="md:hidden"><Ellipsis size={22} /></span>
                <span className="hidden md:inline-flex items-center gap-1">
                  <Ellipsis size={18} />
                  {labels.more}
                </span>
              </button>

              {isMoreOpen && (
                <div
                  className="absolute left-0 top-full z-[950] mt-2 w-56 rounded-lg border border-stone-700 bg-stone-950 py-2 shadow-xl"
                  role="menu"
                >
                  {extraNavLinks.map((link) => (
                    <Link
                      key={link.name}
                      to={link.href}
                      className="flex items-center gap-3 px-4 py-2 text-sm font-semibold text-stone-200 transition-colors hover:bg-stone-800 hover:text-amber-100"
                      role="menuitem"
                      onClick={closeMore}
                    >
                      {link.icon}
                      <span>{link.name}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center Section: Placeholder */}
          <div className="flex flex-row items-center gap-4 md:gap-8 font-medium"></div>

          {/* Right Section: Login/Profile Action */}
          <div className="relative flex items-center">
            {isAuthenticated && user ? (
              <>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-full bg-amber-100 p-2 text-stone-950 shadow-md transition-all hover:bg-amber-200 md:px-4 md:py-2"
                  title={user.nickname}
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  onClick={() => {
                    setIsMoreOpen(false);
                    setIsProfileOpen((open) => !open);
                  }}
                >
                  <User size={20} />
                  <span className="hidden md:inline max-w-32 truncate text-sm font-semibold">
                    {user.nickname}
                  </span>
                </button>

                {isProfileOpen && (
                  <div
                    className="absolute right-0 top-12 w-48 rounded-lg border border-stone-200 bg-stone-50 py-2 shadow-xl"
                    role="menu"
                  >
                    {profileLinks.map((link) => (
                      <Link
                        key={link.name}
                        to={link.href}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-amber-100 transition-colors"
                        role="menuitem"
                        onClick={closeProfile}
                      >
                        {link.icon}
                        <span>{link.name}</span>
                      </Link>
                    ))}
                    <div className="my-2 border-t border-stone-200" />
                    <ThemeModeControl />
                    <div className="my-2 border-t border-stone-200" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-stone-700 hover:bg-amber-100 transition-colors"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      <LogOut size={18} />
                      <span>{labels.logout}</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <Link
                className="flex items-center justify-center rounded-full bg-amber-100 p-2 text-stone-950 shadow-md transition-all hover:bg-amber-200 md:px-4 md:py-2"
                to="/login"
                title={labels.login}
              >
                <LogIn size={20} />
                <span className="hidden md:inline ml-2 text-sm font-semibold">
                  {labels.login}
                </span>
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* --- 사이드바 컴포넌트 추가 --- */}
      
      {/* Background Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-[999] bg-black/40 transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 left-0 z-[1000] h-full w-64 bg-stone-50 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ pointerEvents: isSidebarOpen ? 'auto' : 'none'} }
      >
        <div className="p-5 flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between mb-8 border-b border-stone-200 pb-4">
            <div className="flex items-center gap-2">
              <Notebook className="text-stone-800" size={24} />
              <span className="text-xl font-mono font-bold text-stone-800">Flownote</span>
            </div>
            <button 
              onClick={closeSidebar}
              className="p-1 hover:bg-stone-200 rounded-full transition-colors"
              aria-label={labels.closeMenu}
            >
              <X size={24} className="text-stone-600" />
            </button>
          </div>

          {/* Sidebar Navigation Links */}
          <nav className="flex flex-col gap-2">
            {sidebarLinks.map((link) => (
              <Link 
                key={link.name}
                to={link.href}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-amber-100 text-stone-700 transition-colors group"
                onClick={closeSidebar}
              >
                <span className="text-stone-500 group-hover:text-stone-700 transition-colors">
                  {link.icon}
                </span>
                <span className="text-lg font-medium">{link.name}</span>
              </Link>
            ))}
            
            <div className="my-4 border-t border-stone-200" />

            {isAuthenticated && user ? (
              <>
                <div className="px-3 py-2 text-sm text-stone-500">
                  {user.nickname}
                </div>
                {profileLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.href}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-amber-100 text-stone-700 transition-colors group"
                    onClick={closeSidebar}
                  >
                    <span className="text-stone-500 group-hover:text-stone-700 transition-colors">
                      {link.icon}
                    </span>
                    <span className="text-lg font-medium">{link.name}</span>
                  </Link>
                ))}
                <button
                  type="button"
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-stone-800 hover:text-amber-50 text-stone-700 transition-all group"
                  onClick={handleLogout}
                >
                  <LogOut size={22} className="text-stone-500 group-hover:text-amber-50" />
                  <span className="text-lg font-medium">{labels.logout}</span>
                </button>
              </>
            ) : (
              <Link 
                to="/login"
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-stone-800 hover:text-amber-50 text-stone-700 transition-all group"
                onClick={closeSidebar}
              >
                <LogIn size={22} className="text-stone-500 group-hover:text-amber-50" />
                <span className="text-lg font-medium">{labels.login}</span>
              </Link>
            )}
          </nav>

          {/* Sidebar Footer */}
          <div className="mt-auto pt-6 text-stone-400 text-xs font-mono">
            v1.0.0 @ Flownote
          </div>
        </div>
      </aside>
    </>
  );
}
