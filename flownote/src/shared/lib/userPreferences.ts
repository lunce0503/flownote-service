export type UserPreferences = {
  fontScale: "normal" | "large";
  density: "comfortable" | "compact";
  reduceMotion: boolean;
};
export const PREF_STORAGE_KEY = "flownote_user_preferences";
export const defaultPreferences: UserPreferences = { fontScale: "normal", density: "comfortable", reduceMotion: false };

export const parsePreferences = (stored: string | null): UserPreferences => {
  try {
    const value: unknown = JSON.parse(stored ?? "null");
    const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      fontScale: data.fontScale === "large" ? "large" : "normal",
      density: data.density === "compact" ? "compact" : "comfortable",
      reduceMotion: data.reduceMotion === true,
    };
  } catch { return { ...defaultPreferences }; }
};
export const readPreferences = (): UserPreferences => {
  try { return parsePreferences(window.localStorage.getItem(PREF_STORAGE_KEY)); }
  catch { return { ...defaultPreferences }; }
};
export const applyPreferences = (preferences: UserPreferences) => {
  document.documentElement.dataset.fontScale = preferences.fontScale;
  document.documentElement.dataset.density = preferences.density;
  document.documentElement.classList.toggle("motion-reduced", preferences.reduceMotion);
  window.dispatchEvent(new Event("flownote-preferences-change"));
};
