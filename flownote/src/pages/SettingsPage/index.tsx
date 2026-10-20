import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Check,
  ClipboardList,
  HelpCircle,
  Languages,
  Mail,
  MessageSquare,
  Moon,
  Phone,
  Settings,
  ShieldCheck,
  Sun,
  Type,
  UserRound,
} from "lucide-react";
import { useTheme, type ThemeMode } from "@/features/theme";
import { isInstalledApp } from '@/shared/lib/androidApp';
import { useAuth } from "@/features/auth";
import { postFeedback, listMyFeedback, FEEDBACK_CATEGORIES, type FeedbackItem } from "@/entities/feedback";
import { readPreferences, applyPreferences, defaultPreferences, PREF_STORAGE_KEY, type UserPreferences } from "@/shared/lib/userPreferences";

type Language = "ko" | "en";

const OptionButton = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
      active
        ? "border-emerald-600 bg-emerald-600 text-white"
        : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
    }`}
  >
    {active ? <Check size={16} /> : null}
    {children}
  </button>
);

const ToggleRow = ({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <div className="font-black text-stone-950">{title}</div>
      <div className="text-sm text-stone-500">{description}</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-label={title}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors ${
        checked ? "justify-end bg-emerald-600" : "justify-start bg-stone-300"
      }`}
    >
      <span className="h-6 w-6 rounded-full bg-white shadow" />
    </button>
  </div>
);

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const { user, updateProfile } = useAuth();
  const [profileDraft, setProfileDraft] = useState<{ username: string; email: string; nickname: string; currentPassword: string } | null>(null);
  const [profileStatus, setProfileStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileError, setProfileError] = useState("");
  const profile = profileDraft ?? { username: user?.username ?? "", email: user?.email ?? "", nickname: user?.nickname ?? "", currentPassword: "" };
  const [preferences, setPreferences] = useState<UserPreferences>(readPreferences);
  const [preferenceError, setPreferenceError] = useState("");
  const [language, setLanguage] = useState<Language>(() => (
    window.localStorage.getItem("flownote_language") === "en" ? "en" : "ko"
  ));
  const [feedback, setFeedback] = useState({
    category: FEEDBACK_CATEGORIES[0] as string,
    message: "",
    contact: "",
  });
  // 피드백은 서버(DB)에 저장한다. 전송 상태를 명시적으로 다룬다.
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [myFeedback, setMyFeedback] = useState<FeedbackItem[]>([]);

  const updatePreferences = (next: Partial<UserPreferences>) => {
    const merged = { ...preferences, ...next };
    setPreferences(merged);
    try {
      window.localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(merged));
      setPreferenceError("");
    } catch { setPreferenceError("설정을 기기에 저장하지 못했습니다. 현재 화면에만 적용됩니다."); }
  };

  const updateLanguage = (nextLanguage: Language) => {
    window.localStorage.setItem("flownote_language", nextLanguage);
    setLanguage(nextLanguage);
    window.dispatchEvent(new Event("flownote-language-change"));
  };

  useEffect(() => {
    applyPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === PREF_STORAGE_KEY || event.key === null) setPreferences(readPreferences());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // 내가 보낸 피드백 목록을 서버에서 불러온다.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await listMyFeedback();
        if (active) setMyFeedback(items);
      } catch (error) {
        console.warn("피드백 목록 불러오기 실패:", error);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const submitFeedback = async () => {
    const trimmedMessage = feedback.message.trim();
    if (!trimmedMessage || feedbackStatus === "sending") return;

    setFeedbackStatus("sending");
    try {
      const created = await postFeedback({ ...feedback, message: trimmedMessage });
      setMyFeedback((prev) => [created, ...prev]);
      setFeedback({ category: FEEDBACK_CATEGORIES[0], message: "", contact: "" });
      setFeedbackStatus("sent");
      window.setTimeout(() => setFeedbackStatus("idle"), 2500);
    } catch (error) {
      console.error("피드백 전송 실패:", error);
      setFeedbackStatus("error");
    }
  };

  return (
    <main className="min-h-[calc(100vh-56px)] bg-stone-950 p-3 text-stone-900 md:p-5">
      <section data-testid="settings-panel" className="mx-auto w-full max-w-[1440px] rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-xl md:p-8">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-700">Preferences</p>
            <h1 className="text-2xl font-black text-stone-950 md:text-3xl">설정</h1>
            <p className="text-sm text-stone-500">화면 표시, 사용 편의, 고객센터 정보를 한 곳에서 관리합니다.</p>
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-600 shadow-sm">
            {user?.nickname ?? "사용자"} 계정
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <UserRound size={20} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">내 프로필</h2>
              </div>
              <form className="grid gap-3" onSubmit={async (event) => {
                event.preventDefault();
                if (profileStatus === "saving") return;
                setProfileStatus("saving");
                setProfileError("");
                try {
                  await updateProfile({ ...profile, username: profile.username.trim(), nickname: profile.nickname.trim(), email: profile.email.trim() });
                  setProfileDraft(null);
                  setProfileStatus("saved");
                } catch (error) {
                  const failure = error as { response?: { status?: number } };
                  setProfileError(failure.response?.status === 409 ? "이미 사용 중인 이메일입니다." : failure.response?.status === 403 ? "이메일을 변경하려면 현재 비밀번호를 확인해주세요." : "프로필을 저장하지 못했습니다. 다시 시도해주세요.");
                  setProfileStatus("error");
                }
              }}>
                {([['username', '사용자 이름'], ['nickname', '표시 이름'], ['email', '이메일']] as const).map(([key, label]) => (
                  <label key={key} className="grid gap-1 text-sm font-bold">
                    {label}
                    <input required type={key === 'email' ? 'email' : 'text'} maxLength={key === 'email' ? 254 : 80}
                      value={profile[key]} disabled={profileStatus === "saving"}
                      onChange={(event) => { setProfileDraft({ ...profile, [key]: event.target.value }); setProfileStatus("idle"); }}
                      className="min-h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-3 font-normal focus:ring-2 focus:ring-emerald-600" />
                  </label>
                ))}
                {profile.email.trim() !== user?.email && (
                  <label className="grid gap-1 text-sm font-bold">현재 비밀번호 (이메일 변경 확인)
                    <input required type="password" autoComplete="current-password" maxLength={200} value={profile.currentPassword}
                      onChange={(event) => setProfileDraft({ ...profile, currentPassword: event.target.value })}
                      className="min-h-11 rounded-lg border border-stone-300 px-3 font-normal" />
                  </label>
                )}
                <button type="submit" disabled={!user || profileStatus === "saving" || !profile.username.trim() || !profile.nickname.trim()}
                  className="min-h-11 rounded-lg bg-emerald-600 px-4 font-bold text-white disabled:opacity-50">
                  {profileStatus === "saving" ? "저장 중…" : "프로필 저장"}
                </button>
                {profileStatus === "saved" && <p role="status" className="text-sm text-emerald-700">프로필이 저장되었습니다.</p>}
                {profileStatus === "error" && <p role="alert" className="text-sm text-red-700">{profileError}</p>}
              </form>
            </section>
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <Settings size={20} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">화면 모드</h2>
              </div>
              {isInstalledApp ? <p className="text-sm text-stone-600">아이보리와 검정 색상의 앱 테마를 사용합니다.</p> : <div className="grid gap-2 sm:grid-cols-2">
                <OptionButton active={theme === "light"} onClick={() => setTheme("light" as ThemeMode)}>
                  <Sun size={18} />
                  라이트 모드
                </OptionButton>
                <OptionButton active={theme === "dark"} onClick={() => setTheme("dark" as ThemeMode)}>
                  <Moon size={18} />
                  다크 모드
                </OptionButton>
              </div>}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <Languages size={20} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">언어</h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <OptionButton active={language === "ko"} onClick={() => updateLanguage("ko")}>
                  한국어
                </OptionButton>
                <OptionButton active={language === "en"} onClick={() => updateLanguage("en")}>
                  English
                </OptionButton>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <Type size={20} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">보기 편의</h2>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <OptionButton active={preferences.fontScale === "normal"} onClick={() => updatePreferences({ fontScale: "normal" })}>
                  기본 글자
                </OptionButton>
                <OptionButton active={preferences.fontScale === "large"} onClick={() => updatePreferences({ fontScale: "large" })}>
                  큰 글자
                </OptionButton>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <OptionButton active={preferences.density === "comfortable"} onClick={() => updatePreferences({ density: "comfortable" })}>
                  여유 간격
                </OptionButton>
                <OptionButton active={preferences.density === "compact"} onClick={() => updatePreferences({ density: "compact" })}>
                  촘촘한 간격
                </OptionButton>
              </div>
            </section>

            <section className="space-y-3">
              <ToggleRow
                title="움직임 줄이기"
                description="애니메이션·화면 전환과 캔버스의 관성 이동을 줄입니다."
                checked={preferences.reduceMotion}
                onChange={(checked) => updatePreferences({ reduceMotion: checked })}
              />
              <p className="text-sm text-stone-600">보기 설정은 이 기기에 저장되며 다시 열어도 유지됩니다. 초기화는 프로필·노트·플래너에 영향을 주지 않습니다.</p>
              <button type="button" onClick={() => updatePreferences(defaultPreferences)} className="min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold">보기 설정 초기화</button>
              {preferenceError && <p role="alert" className="text-sm text-red-700">{preferenceError}</p>}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <MessageSquare size={20} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">사용자 피드백</h2>
              </div>
              <div className="grid gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-stone-500">어떤 부분이 어려웠나요?</span>
                  <select
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                    value={feedback.category}
                    onChange={(event) => setFeedback((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    {FEEDBACK_CATEGORIES.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-stone-500">내용</span>
                  <textarea
                    className="min-h-32 w-full resize-y rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                    value={feedback.message}
                    onChange={(event) => setFeedback((prev) => ({ ...prev, message: event.target.value }))}
                    placeholder="이용하면서 어려웠던 부분이나 개선되었으면 하는 점을 적어주세요."
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-stone-500">연락처 선택 입력</span>
                  <input
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                    value={feedback.contact}
                    onChange={(event) => setFeedback((prev) => ({ ...prev, contact: event.target.value }))}
                    placeholder="답변을 받을 이메일 또는 연락처"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => { void submitFeedback(); }}
                    disabled={!feedback.message.trim() || feedbackStatus === "sending"}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    <ClipboardList size={18} />
                    {feedbackStatus === "sending" ? "보내는 중…" : "피드백 보내기"}
                  </button>
                  {feedbackStatus === "sent" && (
                    <span className="text-sm font-bold text-emerald-700">피드백이 전송되었습니다. 감사합니다!</span>
                  )}
                  {feedbackStatus === "error" && (
                    <span className="text-sm font-bold text-red-600">전송에 실패했습니다. 잠시 후 다시 시도해 주세요.</span>
                  )}
                </div>

                {myFeedback.length > 0 && (
                  <div className="mt-2 border-t border-stone-200 pt-3">
                    <p className="mb-2 text-xs font-bold text-stone-500">내가 보낸 피드백 ({myFeedback.length})</p>
                    <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                      {myFeedback.map((item) => (
                        <li key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-stone-200 px-1.5 py-0.5 text-[11px] font-bold text-stone-700">
                              {item.category || "기타"}
                            </span>
                            <span className="text-[11px] text-stone-500">
                              {new Date(item.created_at).toLocaleString("ko-KR")}
                            </span>
                            <span className="ml-auto text-[11px] font-bold text-emerald-700">{item.status}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-800">{item.message}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <HelpCircle size={20} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">고객센터</h2>
              </div>
              <div className="space-y-3 text-sm text-stone-600">
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-3">
                  <Mail size={18} />
                  위 피드백 양식 이용
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-3">
                  <Phone size={18} />
                  평일 10:00 - 18:00
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-stone-900 p-4 text-white">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck size={20} />
                <h2 className="text-lg font-black">저장 방식</h2>
              </div>
              <p className="text-sm text-stone-300">
                화면 설정은 현재 브라우저에 저장됩니다. 다른 기기에서는 각 기기별로 다시 설정할 수 있습니다.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
};

export default SettingsPage;
