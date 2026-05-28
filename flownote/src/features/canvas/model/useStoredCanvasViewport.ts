import { useEffect, useRef } from "react";
import type { Point } from "../../../entities/canvas/model/types";
import { DEFAULT_CANVAS_VIEWPORT } from "./canvasConstants";
import { readStoredViewport, writeStoredViewport } from "./canvasViewportStorage";

type UseStoredCanvasViewportParams = {
    selectedCanvasId: string | null;
    offset: Point;
    scale: number;
    setOffset: (offset: Point) => void;
    setScale: (scale: number) => void;
};

export const useStoredCanvasViewport = ({
    selectedCanvasId,
    offset,
    scale,
    setOffset,
    setScale,
}: UseStoredCanvasViewportParams) => {
    const offsetRef = useRef(offset);
    const scaleRef = useRef(scale);

    useEffect(() => {
        if (!selectedCanvasId) return;
        const storedViewport = readStoredViewport(selectedCanvasId) ?? DEFAULT_CANVAS_VIEWPORT;
        offsetRef.current = storedViewport.offset;
        scaleRef.current = storedViewport.scale;
        setOffset(storedViewport.offset);
        setScale(storedViewport.scale);
    }, [selectedCanvasId, setOffset, setScale]);

    useEffect(() => {
        if (!selectedCanvasId) return;
        offsetRef.current = offset;
        writeStoredViewport(selectedCanvasId, { offset, scale: scaleRef.current });
    }, [offset, selectedCanvasId]);

    useEffect(() => {
        if (!selectedCanvasId) return;
        scaleRef.current = scale;
        writeStoredViewport(selectedCanvasId, { offset: offsetRef.current, scale });
    }, [scale, selectedCanvasId]);

    return { offsetRef, scaleRef };
};
