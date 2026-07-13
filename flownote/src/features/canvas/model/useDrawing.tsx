import { useState, useRef, useCallback, useMemo } from 'react';
import type { Point, LineElement, ToolType } from '@/entities/canvas';
import { CanvasSpatialIndex } from './canvasSpatialIndex';

type GetCanvasCoords = (e: React.PointerEvent | MouseEvent) => Point;

const MIN_POINT_DISTANCE = 0.8;
const MAX_POINT_DISTANCE = 8;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const shouldKeepPoint = (previous: Point | undefined, next: Point) => (
  !previous || distance(previous, next) >= MIN_POINT_DISTANCE
);

const interpolatePoint = (start: Point, end: Point, ratio: number): Point => ({
  x: start.x + (end.x - start.x) * ratio,
  y: start.y + (end.y - start.y) * ratio,
});

const appendPoint = (points: Point[], next: Point) => {
  const previous = points.at(-1);
  if (!shouldKeepPoint(previous, next)) return;

  if (previous) {
    const gap = distance(previous, next);
    const steps = Math.floor(gap / MAX_POINT_DISTANCE);
    for (let step = 1; step <= steps; step += 1) {
      points.push(interpolatePoint(previous, next, step / (steps + 1)));
    }
  }

  points.push(next);
};

const smoothLinePoints = (points: Point[]) => {
  if (points.length <= 2) return points;

  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const previous = points[index - 1];
    const next = points[index + 1];
    return {
      x: point.x * 0.5 + (previous.x + next.x) * 0.25,
      y: point.y * 0.5 + (previous.y + next.y) * 0.25,
    };
  });
};

export const useDrawing = (getCanvasCoords: GetCanvasCoords, tool: ToolType) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnLines, setDrawnLines] = useState<LineElement[]>([]);
  const currentLine = useRef<Point[]>([]); // 현재 그리고 있는 선의 점들
  const lineSpatialIndex = useMemo(() => new CanvasSpatialIndex(drawnLines), [drawnLines]);

  const appendPointerToCurrentLine = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const coalescedEvents = typeof event.nativeEvent.getCoalescedEvents === 'function'
      ? event.nativeEvent.getCoalescedEvents()
      : [event.nativeEvent];

    coalescedEvents.forEach((sample) => {
      appendPoint(currentLine.current, getCanvasCoords(sample));
    });
  }, [getCanvasCoords]);

  const finishCurrentLine = useCallback(() => {
    const finishedLine = smoothLinePoints([...currentLine.current]);
    currentLine.current = [];
    setIsDrawing(false);
    return finishedLine;
  }, []);

  // 지우기 기능 (마우스 주변 일정 거리의 선 삭제)
  const eraseAtPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>, enabled = true) => {
    if (!enabled) return;
    const { x, y } = getCanvasCoords(e);
    const threshold = 10;
    const candidateIds = lineSpatialIndex.searchPoint({ x, y }, threshold, "line");
    setDrawnLines(prev => {
      let changed = false;
      const next = prev.flatMap(line => {
        if (!candidateIds.has(line.id)) return [line];
        const hit = line.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < threshold);
        if (!hit) return [line];
        changed = true;
        return line.status === 'new' ? [] : [{ ...line, status: 'deleted' as const }];
      });
      return changed ? next : prev;
    });
  }, [getCanvasCoords, lineSpatialIndex]);

  return {
    isDrawing,
    setIsDrawing,
    drawnLines,
    setDrawnLines,
    currentLine,
    appendPointerToCurrentLine,
    finishCurrentLine,
    eraseAtPointer,
  };
};
