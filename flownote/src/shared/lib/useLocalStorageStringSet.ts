import { useCallback, useState } from "react";

type StringSetSetter = Set<string> | ((current: Set<string>) => Set<string>);

const parseStoredStringSet = (stored: string | null) => {
    if (!stored) return new Set<string>();

    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed)
            ? new Set(parsed.filter((value): value is string => typeof value === "string"))
            : new Set<string>();
    } catch {
        return new Set<string>();
    }
};

export const useLocalStorageStringSet = (key: string) => {
    const [value, setValueState] = useState(() => parseStoredStringSet(localStorage.getItem(key)));

    const setValue = useCallback((nextValue: StringSetSetter) => {
        setValueState((current) => {
            const resolved = typeof nextValue === "function" ? nextValue(current) : nextValue;
            localStorage.setItem(key, JSON.stringify([...resolved]));
            return new Set(resolved);
        });
    }, [key]);

    return [value, setValue] as const;
};
