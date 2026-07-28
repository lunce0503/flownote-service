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
} from "lucide-react";
import { useTheme, type ThemeMode } from "@/features/theme";
import { useAuth } from "@/features/auth";
import { postFeedback, listMyFeedback, FEEDBACK_CATEGORIES, type FeedbackItem } from "@/entities/feedback";

type FontScale = "normal" | "large";
type Density = "comfortable" | "compact";
type Language = "ko" | "en";

type UserPreferences = {
  fontScale: FontScale;
  density: Density;
  reduceMotion: boolean;
  confirmBeforeDelete: boolean;
};

const PREF_STORAGE_KEY = "flownote_user_preferences";

const defaultPreferences: UserPreferences = {
  fontScale: "normal",
  density: "comfortable",
  reduceMotion: false,
  confirmBeforeDelete: true,
};

const readPreferences = (): UserPreferences => {
  const stored = window.localStorage.getItem(PREF_STORAGE_KEY);
  if (!stored) return defaultPreferences;

  try {
    return { ...defaultPreferences, ...JSON.parse(stored) } as UserPreferences;
  } catch {
    return defaultPreferences;
  }
};

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
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<UserPreferences>(readPreferences);
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
    setPreferences((prev) => {
      const merged = { ...prev, ...next };
      window.localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  };

  const updateLanguage = (nextLanguage: Language) => {
    window.localStorage.setItem("flownote_language", nextLanguage);
    setLanguage(nextLanguage);
    window.dispatchEvent(new Event("flownote-language-change"));
  };

  useEffect(() => {
    document.documentElement.dataset.fontScale = preferences.fontScale;
    document.documentElement.dataset.density = preferences.density;
    document.documentElement.classList.toggle("motion-reduced", preferences.reduceMotion);
  }, [preferences]);

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
      <section className="mx-auto max-w-5xl rounded-2xl border border-stone-200 bg-stone-50 p-4 shadow-xl md:p-6">
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
                <Settings size={20} className="text-emerald-700" />
                <h2 className="text-lg font-black text-stone-950">화면 모드</h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <OptionButton active={theme === "light"} onClick={() => setTheme("light" as ThemeMode)}>
                  <Sun size={18} />
                  라이트 모드
                </OptionButton>
                <OptionButton active={theme === "dark"} onClick={() => setTheme("dark" as ThemeMode)}>
                  <Moon size={18} />
                  다크 모드
                </OptionButton>
              </div>
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
                description="애니메이션과 화면 전환 움직임을 줄여 집중하기 쉽게 합니다."
                checked={preferences.reduceMotion}
                onChange={(checked) => updatePreferences({ reduceMotion: checked })}
              />
              <ToggleRow
                title="삭제 전 확인"
                description="삭제 버튼을 누를 때 한 번 더 확인하도록 설정합니다."
                checked={preferences.confirmBeforeDelete}
                onChange={(checked) => updatePreferences({ confirmBeforeDelete: checked })}
              />
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
                <a className="flex items-center gap-3 rounded-xl border border-stone-200 p-3 hover:bg-stone-50" href="mailto:support@flownote.local">
                  <Mail size={18} />
                  support@flownote.local
                </a>
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
