import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ToolType } from '@/entities/canvas';

export const useCanvasState = (canvasRef: RefObject<HTMLCanvasElement|null>) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [tool, setTool] = useState<ToolType>('pen');
  const offsetRef = useRef(offset);
  const scaleRef = useRef(scale);

  const setSyncedOffset = useCallback((next: { x: number; y: number }) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const setSyncedScale = useCallback((next: number) => {
    scaleRef.current = next;
    setScale(next);
  }, []);

  // 브라우저 기준 좌표를 캔버스 좌표로 변환
  const getCanvasCoords = useCallback((e: React.PointerEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const currentOffset = offsetRef.current;
    const currentScale = scaleRef.current;
    return {
      x: ((e.clientX - rect.left) * scaleX - currentOffset.x) / currentScale,
      y: ((e.clientY - rect.top) * scaleY - currentOffset.y) / currentScale,
    };
  }, [canvasRef]);

  return { offset, setOffset: setSyncedOffset, scale, setScale: setSyncedScale, tool, setTool, getCanvasCoords };
};
