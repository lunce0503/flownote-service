export type PointerDisplay = { pointerType: string; contact: boolean } | null;
export const isMobileCanvasInput = (userAgent: string, platform = '', touchPoints = 0) =>
    /Android|iPad|iPhone|iPod|FlownoteIOS\//i.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);

export const canvasPointerAppearance = (tool: string, position: PointerDisplay, mobile: boolean) => ({
    visible: !!position && !(position.pointerType === 'mouse' && tool !== 'eraser')
        && !(mobile && tool === 'pen' && position.contact),
    diameter: tool === 'eraser' ? 32 : 4,
});
