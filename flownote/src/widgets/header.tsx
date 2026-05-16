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
  User
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../shared/auth/AuthContext";

export default function Header() {
  // 사이드바 상태 관리
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const onMenuClick = () => {
    setIsSidebarOpen(true);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const closeProfile = () => {
    setIsProfileOpen(false);
  };

  const handleLogout = () => {
    logout();
    closeProfile();
    closeSidebar();
    navigate("/");
  };

  const navLinks = [
    { name: "Blog", href: "/blog", icon: <BookOpen size={22} /> },
    { name: "Social", href: "/social", icon: <Users size={22} /> },
    { name: "Task", href: "/task", icon: <CheckSquare size={22} /> },
  ];

  const profileLinks = [
    { name: "Canvas", href: "/canvas", icon: <Notebook size={18} /> },
    { name: "Social", href: "/social", icon: <Users size={18} /> },
    { name: "Task", href: "/task", icon: <CheckSquare size={18} /> },
  ];

  return (
    <>
      {/* --- 기존 헤더 유지 --- */}
      <header className="w-full bg-amber-100 py-2 px-2 relative z-30">
        <nav className="flex flex-row items-center justify-between text-stone-600">
          {/* Left Section: Menu & Logo */}
          <div className="flex items-center gap-2 md:gap-2">
            {/* Menu button */}
            <button
              onClick={onMenuClick}
              className="py-2 hover:bg-amber-200 rounded-md transition-colors duration-200"
              aria-label="Menu"
            >
              <Menu size={24} />
            </button>

            {/* Header title / Logo */}
            <a className="flex items-center gap-2 group" href="/">
              <div className="py-2 rounded-lg md:bg-transparent">
                <Notebook
                  className="md:hidden text-stone-700 group-hover:text-stone-500 transition-colors"
                  size={24}
                />
              </div>
              <span className="hidden md:inline text-stone-800 text-2xl font-mono group-hover:text-stone-500 transition-colors">
                Flownote
              </span>
            </a>

            {/* Desktop Navigation Links */}
            {navLinks.map((link) => (
              <a
                key={link.name}
                className="flex flex-col items-center hover:text-stone-400 transition-colors group"
                href={link.href}
                title={link.name}
              >
                <span className="md:hidden">{link.icon}</span>
                <span className="hidden md:inline">{link.name}</span>
              </a>
            ))}
          </div>

          {/* Center Section: Placeholder */}
          <div className="flex flex-row items-center gap-4 md:gap-8 font-medium"></div>

          {/* Right Section: Login/Profile Action */}
          <div className="relative flex items-center">
            {isAuthenticated && user ? (
              <>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 p-2 md:px-4 md:py-2 bg-stone-700 text-amber-50 rounded-full hover:bg-stone-600 transition-all shadow-md"
                  title={user.nickname}
                  aria-haspopup="menu"
                  aria-expanded={isProfileOpen}
                  onClick={() => setIsProfileOpen((open) => !open)}
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
                      <a
                        key={link.name}
                        href={link.href}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-amber-100 transition-colors"
                        role="menuitem"
                        onClick={closeProfile}
                      >
                        {link.icon}
                        <span>{link.name}</span>
                      </a>
                    ))}
                    <div className="my-2 border-t border-stone-200" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-stone-700 hover:bg-amber-100 transition-colors"
                      role="menuitem"
                      onClick={handleLogout}
                    >
                      <LogOut size={18} />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <a
                className="flex items-center justify-center p-2 md:px-4 md:py-2 bg-stone-700 text-amber-50 rounded-full hover:bg-stone-600 transition-all shadow-md"
                href="/login"
                title="Login"
              >
                <LogIn size={20} />
                <span className="hidden md:inline ml-2 text-sm font-semibold">
                  Login
                </span>
              </a>
            )}
          </div>
        </nav>
      </header>

      {/* --- 사이드바 컴포넌트 추가 --- */}
      
      {/* Background Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-40 transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-stone-50 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out ${
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
              aria-label="Close menu"
            >
              <X size={24} className="text-stone-600" />
            </button>
          </div>

          {/* Sidebar Navigation Links */}
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <a 
                key={link.name}
                href={link.href}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-amber-100 text-stone-700 transition-colors group"
                onClick={closeSidebar}
              >
                <span className="text-stone-500 group-hover:text-stone-700 transition-colors">
                  {link.icon}
                </span>
                <span className="text-lg font-medium">{link.name}</span>
              </a>
            ))}
            
            <div className="my-4 border-t border-stone-200" />
            
            {isAuthenticated && user ? (
              <>
                <div className="px-3 py-2 text-sm text-stone-500">
                  {user.nickname}
                </div>
                {profileLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-amber-100 text-stone-700 transition-colors group"
                    onClick={closeSidebar}
                  >
                    <span className="text-stone-500 group-hover:text-stone-700 transition-colors">
                      {link.icon}
                    </span>
                    <span className="text-lg font-medium">{link.name}</span>
                  </a>
                ))}
                <button
                  type="button"
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-stone-800 hover:text-amber-50 text-stone-700 transition-all group"
                  onClick={handleLogout}
                >
                  <LogOut size={22} className="text-stone-500 group-hover:text-amber-50" />
                  <span className="text-lg font-medium">Logout</span>
                </button>
              </>
            ) : (
              <a 
                href="/login"
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-stone-800 hover:text-amber-50 text-stone-700 transition-all group"
                onClick={closeSidebar}
              >
                <LogIn size={22} className="text-stone-500 group-hover:text-amber-50" />
                <span className="text-lg font-medium">Login</span>
              </a>
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
