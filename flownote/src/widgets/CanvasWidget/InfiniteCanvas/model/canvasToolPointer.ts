import type { ToolType } from '@/entities/canvas';

export type ToolPointerPosition = { x: number; y: number; pointerType: string };
type PointerSample = {
    type: string;
    pointerId: number;
    pointerType: string;
    clientX: number;
    clientY: number;
};
type SurfaceBounds = { left: number; top: number; width: number; height: number };

export const getCanvasPointerTool = (tool: ToolType, pointerType: string, pencilOnlyMode: boolean): ToolType | 'pan' => (
    pointerType === 'touch' && pencilOnlyMode && (tool === 'pen' || tool === 'eraser' || tool === 'lasso')
        ? 'pan' : tool
);

// Presentation only: never captures input or mutates drawing/gesture state.
export const createCanvasToolPointer = () => {
    const contacts = new Set<number>();
    let multipleContacts = false;
    return {
        reset() {
            contacts.clear();
            multipleContacts = false;
        },
        update(event: PointerSample, bounds: SurfaceBounds): ToolPointerPosition | null {
            if (['pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture'].includes(event.type)) {
                contacts.delete(event.pointerId);
                if (contacts.size === 0) multipleContacts = false;
                return null;
            }
            if (event.type === 'pointerdown') contacts.add(event.pointerId);
            if (contacts.size > 1) multipleContacts = true;
            if (multipleContacts || !['pen', 'touch'].includes(event.pointerType)) return null;
            if (event.pointerType === 'touch' && !contacts.has(event.pointerId)) return null;
            const x = event.clientX - bounds.left;
            const y = event.clientY - bounds.top;
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) return null;
            return { x, y, pointerType: event.pointerType };
        },
    };
};
