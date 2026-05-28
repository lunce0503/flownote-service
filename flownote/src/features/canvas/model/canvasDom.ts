export const isCanvasInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, input, textarea, select, [contenteditable='true'], [data-canvas-touch-allow='true']"));
};
