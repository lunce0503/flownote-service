import { Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "../model/ThemeContext";

const options: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "light", label: "라이트", icon: Sun },
  { value: "dark", label: "다크", icon: Moon },
];

const ThemeModeControl = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="px-3 py-2">
      <div className="mb-2 text-xs font-bold text-stone-500">화면 모드</div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-200 p-1">
        {options.map((option) => {
          const Icon = option.icon;
          const isActive = theme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
              onClick={() => setTheme(option.value)}
            >
              <Icon size={14} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeModeControl;
