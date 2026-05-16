import { useState } from 'react';
import type { RefObject } from 'react';
import type { ToolType } from '../../../entities/canvas/model/types';

export const useCanvasState = (canvasRef: RefObject<HTMLCanvasElement|null>) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [tool, setTool] = useState<ToolType>('pen');

  // 브라우저 기준 좌표를 캔버스 좌표로 변환
  const getCanvasCoords = (e: React.PointerEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX - offset.x) / scale,
      y: ((e.clientY - rect.top) * scaleY - offset.y) / scale,
    };
  };

  return { offset, setOffset, scale, setScale, tool, setTool, getCanvasCoords };
};
