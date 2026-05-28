import { useCallback, useState } from "react";

type BooleanSetter = boolean | ((current: boolean) => boolean);

export const useLocalStorageBoolean = (key: string, defaultValue: boolean) => {
    const [value, setValueState] = useState(() => {
        const stored = localStorage.getItem(key);
        if (stored === null) return defaultValue;
        return stored !== "false";
    });

    const setValue = useCallback((nextValue: BooleanSetter) => {
        setValueState((current) => {
            const resolved = typeof nextValue === "function" ? nextValue(current) : nextValue;
            localStorage.setItem(key, String(resolved));
            return resolved;
        });
    }, [key]);

    return [value, setValue] as const;
};
