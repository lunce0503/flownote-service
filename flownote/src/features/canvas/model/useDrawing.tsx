import { useState, useRef, useCallback } from 'react';
import type { Point, LineElement, ToolType } from '../../../entities/canvas/model/types';

type GetCanvasCoords = (e: React.PointerEvent | MouseEvent) => Point;

export const useDrawing = (getCanvasCoords: GetCanvasCoords, tool: ToolType) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnLines, setDrawnLines] = useState<LineElement[]>([]);
  const currentLine = useRef<Point[]>([]); // 현재 그리고 있는 선의 점들

  // 지우기 기능 (마우스 주변 일정 거리의 선 삭제)
  const eraseAtPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const threshold = 10;
    setDrawnLines(prev => {
      return prev.flatMap(line => {
        const hit = line.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < threshold);
        if (!hit) return [line];
        return line.status === 'new' ? [] : [{ ...line, status: 'deleted' as const }];
      });
    });
  }, [getCanvasCoords]);

  return {
    isDrawing,
    setIsDrawing,
    drawnLines,
    setDrawnLines,
    currentLine,
    eraseAtPointer,
  };
};
