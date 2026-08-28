import { useState, useRef, useCallback } from 'react';
import type { Point, LineElement } from '@/entities/canvas';
import { removeOrMarkDeleted } from './canvasGeometry';
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

export const useDrawing = (getCanvasCoords: GetCanvasCoords) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnLines, setDrawnLines] = useState<LineElement[]>([]);
  const currentLineRef = useRef<Point[]>([]); // 현재 그리고 있는 선의 점들
  // 공간 인덱스는 지우개에서만 쓴다. drawnLines가 바뀔 때마다 미리 만들면
  // 획을 하나 그릴 때마다 전체 선의 모든 점을 순회(O(전체 점 수))해 필기 직후 딜레이가 생긴다.
  // 실제로 필요할 때 지연 생성하고, 같은 drawnLines 동안은 재사용한다.
  const lineSpatialIndexRef = useRef<{ source: LineElement[]; index: CanvasSpatialIndex } | null>(null);
  const getLineSpatialIndex = useCallback(() => {
    const cached = lineSpatialIndexRef.current;
    if (cached && cached.source === drawnLines) return cached.index;
    const index = new CanvasSpatialIndex(drawnLines);
    lineSpatialIndexRef.current = { source: drawnLines, index };
    return index;
  }, [drawnLines]);

  const appendPointerToCurrentLine = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const coalescedEvents = typeof event.nativeEvent.getCoalescedEvents === 'function'
      ? event.nativeEvent.getCoalescedEvents()
      : [event.nativeEvent];

    coalescedEvents.forEach((sample) => {
      appendPoint(currentLineRef.current, getCanvasCoords(sample));
    });
  }, [getCanvasCoords]);

  const finishCurrentLine = useCallback(() => {
    const finishedLine = smoothLinePoints([...currentLineRef.current]);
    currentLineRef.current = [];
    setIsDrawing(false);
    return finishedLine;
  }, []);

  // 지우기 기능 (마우스 주변 일정 거리의 선 삭제)
  const eraseAtPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>, enabled = true) => {
    if (!enabled) return;
    const { x, y } = getCanvasCoords(e);
    const threshold = 10;
    const candidateIds = getLineSpatialIndex().searchPoint({ x, y }, threshold, "line");
    setDrawnLines(prev => {
      const hitIds = new Set<string>();
      prev.forEach(line => {
        if (!candidateIds.has(line.id)) return;
        const hit = line.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < threshold);
        if (hit) hitIds.add(line.id);
      });
      return hitIds.size > 0 ? removeOrMarkDeleted(prev, hitIds) : prev;
    });
  }, [getCanvasCoords, getLineSpatialIndex]);

  return {
    isDrawing,
    setIsDrawing,
    drawnLines,
    setDrawnLines,
    currentLineRef,
    appendPointerToCurrentLine,
    finishCurrentLine,
    eraseAtPointer,
  };
};
