import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LineElement } from "@/entities/canvas";
import type {
    CanvasLineStreamEndEvent,
    CanvasLineStreamPointsEvent,
    CanvasLineStreamStartEvent,
    CanvasStreamCallbacks,
} from "./canvasSocketClient";

type SendLineStart = (line: Omit<LineElement, "status">) => void;
type SendLinePoints = (lineId: string, points: LineElement["points"]) => void;
type SendLineEnd = (line: Omit<LineElement, "status">) => void;

export const useLineStreaming = (clearHistory: () => void) => {
    const [remoteLinesById, setRemoteLinesById] = useState<Record<string, LineElement>>({});
    const activeLineIdRef = useRef<string | null>(null);
    const streamedPointCountRef = useRef(0);
    const removalTimersRef = useRef(new Set<number>());

    useEffect(() => () => {
        removalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        removalTimersRef.current.clear();
    }, []);

    const handleRemoteLineStart = useCallback((event: CanvasLineStreamStartEvent) => {
        const line = event.line;
        if (!line?.id || !Array.isArray(line.points)) return;
        setRemoteLinesById((previous) => ({
            ...previous,
            [line.id]: { ...line, points: line.points.map((point) => ({ ...point })), status: "unchanged" },
        }));
    }, []);

    const handleRemoteLinePoints = useCallback((event: CanvasLineStreamPointsEvent) => {
        if (!event.lineId || !Array.isArray(event.points) || event.points.length === 0) return;
        const lineId = event.lineId;
        const points = event.points;
        setRemoteLinesById((previous) => {
            const current = previous[lineId];
            if (!current) return previous;
            return {
                ...previous,
                [lineId]: {
                    ...current,
                    points: [...current.points, ...points.map((point) => ({ ...point }))],
                },
            };
        });
    }, []);

    const handleRemoteLineEnd = useCallback((event: CanvasLineStreamEndEvent) => {
        if (!event.lineId) return;
        const lineId = event.lineId;
        const line = event.line;
        setRemoteLinesById((previous) => {
            if (!line?.id || !Array.isArray(line.points)) return previous;
            return {
                ...previous,
                [lineId]: { ...line, points: line.points.map((point) => ({ ...point })), status: "unchanged" },
            };
        });

        const timer = window.setTimeout(() => {
            removalTimersRef.current.delete(timer);
            setRemoteLinesById((previous) => {
                if (!previous[lineId]) return previous;
                const next = { ...previous };
                delete next[lineId];
                return next;
            });
        }, 10_000);
        removalTimersRef.current.add(timer);
    }, []);

    const clearRemoteLines = useCallback(() => {
        setRemoteLinesById({});
        clearHistory();
    }, [clearHistory]);

    const streamCallbacks = useMemo<CanvasStreamCallbacks>(() => ({
        onLineStreamStart: handleRemoteLineStart,
        onLineStreamPoints: handleRemoteLinePoints,
        onLineStreamEnd: handleRemoteLineEnd,
        onRemoteCanvasChanged: clearRemoteLines,
    }), [clearRemoteLines, handleRemoteLineEnd, handleRemoteLinePoints, handleRemoteLineStart]);

    const beginLocalLine = useCallback((line: Omit<LineElement, "status">, send: SendLineStart) => {
        activeLineIdRef.current = line.id;
        streamedPointCountRef.current = line.points.length;
        send(line);
    }, []);

    const streamLocalPoints = useCallback((
        points: LineElement["points"],
        previousPointCount: number,
        send: SendLinePoints,
    ) => {
        const lineId = activeLineIdRef.current;
        if (!lineId) return;
        const newPoints = points.slice(Math.max(previousPointCount, streamedPointCountRef.current));
        if (newPoints.length === 0) return;
        streamedPointCountRef.current = points.length;
        send(lineId, newPoints.map((point) => ({ ...point })));
    }, []);

    const finishLocalLine = useCallback((line: Omit<LineElement, "status">, send: SendLineEnd) => {
        const finishedLine = { ...line, id: activeLineIdRef.current ?? line.id };
        send(finishedLine);
        activeLineIdRef.current = null;
        streamedPointCountRef.current = 0;
        return finishedLine;
    }, []);

    const resetLocalLine = useCallback(() => {
        activeLineIdRef.current = null;
        streamedPointCountRef.current = 0;
    }, []);

    const remoteLines = useMemo(() => Object.values(remoteLinesById), [remoteLinesById]);

    return {
        remoteLines,
        streamCallbacks,
        beginLocalLine,
        streamLocalPoints,
        finishLocalLine,
        resetLocalLine,
        clearRemoteLines,
    };
};
