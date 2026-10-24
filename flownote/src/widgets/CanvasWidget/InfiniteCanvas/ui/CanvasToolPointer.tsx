import { useEffect, useState, type RefObject } from 'react';
import { Eraser, Hand, Lasso, Move, PenLine, Type } from 'lucide-react';
import type { ToolType } from '@/entities/canvas';
import { createCanvasToolPointer, getCanvasPointerTool, type ToolPointerPosition } from '../model/canvasToolPointer';

const tools = {
    pen: { label: '펜', Icon: PenLine },
    eraser: { label: '지우개', Icon: Eraser },
    lasso: { label: '올가미', Icon: Lasso },
    handle: { label: '이동', Icon: Hand },
    text: { label: '텍스트', Icon: Type },
    pan: { label: '화면 이동', Icon: Move },
};

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
    const { label, Icon } = tools[pointerTool];
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
                className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 border-2 border-stone-950 bg-white/70 ring-2 ring-white ${pointerTool === 'eraser' ? 'rounded-sm' : 'rounded-full'} ${pointerTool === 'lasso' ? 'border-dashed' : ''}`}
                style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
            />
            <span
                className="absolute inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-stone-950 px-2 py-1 text-xs font-bold text-white shadow-md ring-1 ring-white"
                style={{
                    // Keep the label above the finger and inside even narrow viewports.
                    left: `clamp(4px, ${(position?.x ?? 0) + 14}px, calc(100% - 100px))`,
                    top: (position?.y ?? 0) < 48 ? (position?.y ?? 0) + 18 : (position?.y ?? 0) - 40,
                }}
            >
                <Icon size={16} />{label}
            </span>
        </div>
    );
};
