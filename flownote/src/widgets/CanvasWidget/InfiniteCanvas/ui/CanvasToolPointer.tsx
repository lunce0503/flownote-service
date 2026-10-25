import { useEffect, useState, type RefObject } from 'react';
import type { ToolType } from '@/entities/canvas';
import { createCanvasToolPointer, getCanvasPointerTool, type ToolPointerPosition } from '../model/canvasToolPointer';

export const CanvasToolPointer = ({ canvasRef, tool, pencilOnlyMode }: {
    canvasRef: RefObject<HTMLCanvasElement | null>;
    tool: ToolType;
    pencilOnlyMode: boolean;
}) => {
    const [position, setPosition] = useState<ToolPointerPosition | null>(null);

    useEffect(() => {
        const surface = canvasRef.current;
        if (!surface) return;
        const pointer = createCanvasToolPointer();
        let frame: number | null = null;
        let pending: ToolPointerPosition | null = null;
        const update = (event: PointerEvent) => {
            pending = pointer.update(event, surface.getBoundingClientRect());
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
                setPosition(pending);
            });
        };
        const reset = () => {
            pointer.reset();
            pending = null;
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null;
            setPosition(null);
        };
        const events = ['pointerenter', 'pointerdown', 'pointermove', 'pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture'] as const;
        for (const name of events) surface.addEventListener(name, update, { passive: true });
        window.addEventListener('blur', reset);
        window.addEventListener('resize', reset);
        document.addEventListener('visibilitychange', reset);
        return () => {
            if (frame !== null) window.cancelAnimationFrame(frame);
            for (const name of events) surface.removeEventListener(name, update);
            window.removeEventListener('blur', reset);
            window.removeEventListener('resize', reset);
            document.removeEventListener('visibilitychange', reset);
        };
    }, [canvasRef]);

    const pointerTool = getCanvasPointerTool(tool, position?.pointerType ?? '', pencilOnlyMode);
    return (
        <div
            data-testid="canvas-tool-pointer"
            data-tool={pointerTool}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-30"
            style={{ display: position ? 'block' : 'none' }}
        >
            <span
                data-testid="canvas-tool-pointer-tip"
                className="absolute h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-stone-900/70 bg-white/60"
                style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
            />
        </div>
    );
};
