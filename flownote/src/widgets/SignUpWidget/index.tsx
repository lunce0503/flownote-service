import { type FormEvent, useState } from "react";
import postUserData from "../../entities/users/api/postUserData";
import type { UserDataProps } from "../../entities/users";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Mail, Notebook, User } from "lucide-react";

const SignUpWidget= () => {
    const [userdata, setUserdata] = useState<UserDataProps>({
        username: "",
        email: "",
        password: "",
        nickname: "",
    });
    const navigate = useNavigate();
    const [confirmPassword, setConfirmPassword] = useState("");

    const handleSignUp = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (userdata.password !== confirmPassword) {
            alert("비밀번호가 일치하지 않습니다. 다시 확인해주세요.");
            return;
        }

        postUserData(userdata);
        alert("회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.");
        navigate("/login");
    }

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

            {/* 회원가입 폼 */}
            <div className="w-full max-w-md bg-stone-50 rounded-3xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <h2 className="text-2xl font-bold text-stone-800 mb-6 text-center">회원가입</h2>

                    <form onSubmit={handleSignUp} className="space-y-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-stone-700 ml-1" htmlFor="signup-username">
                                사용자 이름
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                                <input
                                    id="signup-username"
                                    type="text"
                                    placeholder="Username"
                                    className="w-full pl-10 pr-4 py-3 bg-white text-black border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    value={userdata.username}
                                    onChange={(e) => setUserdata({...userdata, username: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-stone-700 ml-1" htmlFor="signup-nickname">
                                닉네임
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                                <input
                                    id="signup-nickname"
                                    type="text"
                                    placeholder="Nickname"
                                    className="w-full pl-10 pr-4 py-3 bg-white text-black border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    value={userdata.nickname}
                                    onChange={(e) => setUserdata({...userdata, nickname: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-stone-700 ml-1" htmlFor="signup-email">
                                이메일 주소
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                                <input
                                    id="signup-email"
                                    type="email"
                                    placeholder="name@example.com"
                                    className="w-full pl-10 pr-4 py-3 bg-white text-black border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    value={userdata.email}
                                    onChange={(e) => setUserdata({...userdata, email: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-stone-700 ml-1" htmlFor="signup-password">
                                비밀번호
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                                <input
                                    id="signup-password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-3 bg-white text-black border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    value={userdata.password}
                                    onChange={(e) => setUserdata({...userdata, password: e.target.value})}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium text-stone-700 ml-1" htmlFor="signup-confirm-password">
                                비밀번호 확인
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
                                <input
                                    id="signup-confirm-password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-4 py-3 bg-white text-black border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition-all"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        
                        <button 
                            type="submit"
                            className="w-full bg-stone-800 text-amber-50 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-stone-700 transition-all shadow-md group mt-6"
                        >
                            계정 만들기
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </form>
                </div>

                <div className="bg-stone-100 p-6 text-center border-t border-stone-200">
                    <p className="text-stone-600 text-sm">
                        이미 계정이 있으신가요?{" "}
                        <a href="/login" className="text-stone-800 font-bold hover:text-amber-600 transition-colors underline underline-offset-4">
                            로그인
                        </a>
                    </p>
                </div>
            </div>

            <div className="mt-8 text-stone-400 text-xs font-mono">
                © 2026 Flownote Inc. All rights reserved.
            </div>
        </div>
    );
}

export default SignUpWidget;
