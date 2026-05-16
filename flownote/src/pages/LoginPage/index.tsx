import React, { useState } from "react";
import { 
  Notebook, 
  Mail, 
  Lock, 
  ArrowRight
} from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import loginUserData from "../../entities/users/api/loginUserData";
import { useAuth } from "../../shared/auth/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const loginResponse = await loginUserData({ email, password });
      login(loginResponse.token, loginResponse.user);
      navigate("/", { replace: true });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.error ?? "로그인에 실패했습니다.");
      } else {
        setErrorMessage("로그인에 실패했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Chrome 아이콘을 위한 인라인 SVG
  const ChromeIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" y1="8" x2="12" y2="8" />
      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
    </svg>
  );

  // Github 아이콘을 위한 인라인 SVG (임포트 오류 방지)
  const GithubIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-amber-100 flex flex-col justify-center items-center p-4 font-sans">
      {/* 로고 섹션 */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="p-3 bg-stone-800 rounded-2xl shadow-lg">
          <Notebook className="text-amber-50" size={32} />
        </div>
        <h1 className="text-3xl font-mono font-bold text-stone-800">Flownote</h1>
        <p className="text-stone-600 text-sm">생각의 흐름을 기록하세요</p>
      </div>

      {/* 로그인 카드 */}
      <div className="w-full max-w-md bg-stone-50 rounded-3xl shadow-xl overflow-hidden">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-stone-800 mb-6 text-center">로그인</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 이메일 입력 */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700 ml-1" htmlFor="email">
                이메일 주소
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                <input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-white text-black border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* 비밀번호 입력 */}
            <div className="space-y-1">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-medium text-stone-700" htmlFor="password">
                  비밀번호
                </label>
                <a href="#" className="text-xs text-stone-500 hover:text-amber-600 transition-colors">
                  비밀번호를 잊으셨나요?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-white text-black border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* 로그인 버튼 */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-stone-800 text-amber-50 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-stone-700 transition-all shadow-md group mt-6"
            >
              {isSubmitting ? "확인 중..." : "계속하기"}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>

            {errorMessage && (
              <p className="text-sm text-red-600 text-center" role="alert">
                {errorMessage}
              </p>
            )}
          </form>

          {/* 구분선 */}
          <div className="relative my-8 text-center">
            <hr className="border-stone-200" />
            <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-stone-50 px-4 text-xs text-stone-400 uppercase tracking-widest">
              또는
            </span>
          </div>

          {/* 소셜 로그인 버튼 */}
          <div className="grid grid-cols-2 gap-4">
            <button className="flex items-center justify-center gap-2 py-2.5 border border-stone-200 rounded-xl hover:bg-stone-100 transition-colors">
              <ChromeIcon />
              <span className="text-sm font-medium text-stone-700">Google</span>
            </button>
            <button className="flex items-center justify-center gap-2 py-2.5 border border-stone-200 rounded-xl hover:bg-stone-100 transition-colors">
              <GithubIcon />
              <span className="text-sm font-medium text-stone-700">Github</span>
            </button>
          </div>
        </div>

        {/* 하단 푸터 */}
        <div className="bg-stone-100 p-6 text-center border-t border-stone-200">
          <p className="text-stone-600 text-sm">
            아직 계정이 없으신가요?{" "}
            <a href="/signup" className="text-stone-800 font-bold hover:text-amber-600 transition-colors underline underline-offset-4">
              회원가입
            </a>
          </p>
        </div>
      </div>

      {/* 배경 장식 */}
      <div className="mt-8 text-stone-400 text-xs font-mono">
        © 2026 Flownote Inc. All rights reserved.
      </div>
    </div>
  );
}
