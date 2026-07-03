import { CANVAS_VIEWPORT_STORAGE_KEY, type StoredCanvasViewport } from "./canvasConstants";

const getCanvasViewportStorageKey = (canvasId: string) => `${CANVAS_VIEWPORT_STORAGE_KEY}.${canvasId}`;

export const parseStoredViewport = (raw: string | null): StoredCanvasViewport | null => {
    try {
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<StoredCanvasViewport>;
        if (typeof value.scale !== "number" || typeof value.offset?.x !== "number" || typeof value.offset?.y !== "number") {
            return null;
        }
        return {
            offset: { x: value.offset.x, y: value.offset.y },
            scale: Math.min(5, Math.max(0.2, value.scale)),
        };
    } catch {
        return null;
    }
};

export const readStoredViewport = (canvasId: string): StoredCanvasViewport | null => (
    parseStoredViewport(localStorage.getItem(getCanvasViewportStorageKey(canvasId)))
);

export const writeStoredViewport = (canvasId: string, viewport: StoredCanvasViewport) => {
    localStorage.setItem(getCanvasViewportStorageKey(canvasId), JSON.stringify(viewport));
};
