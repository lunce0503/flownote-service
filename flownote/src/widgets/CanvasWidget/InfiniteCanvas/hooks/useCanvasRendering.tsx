import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { Point, LineElement, ImageElement, TextBoxElement } from '../types/types';

export const useCanvasRendering = (
  canvasRef: RefObject<HTMLCanvasElement|null>,
  offset: { x: number; y: number },
  scale: number,
  currentDrawingLine: Point[], // 현재 그리는 선
) => {
  const redrawWith = useCallback((
    lines: LineElement[],
    imgs: ImageElement[],
    texts: TextBoxElement[]
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 재설정 (window.innerWidth/Height에 맞춰)
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 이미지 그리기
    imgs.forEach(img => {
      // 이미지가 로드되지 않았다면 그리지 않음 (혹은 플레이스홀더)
      if (img.image.complete) {
        ctx.drawImage(img.image, img.x, img.y, img.width, img.height);
      }
    });

    // 선 그리기
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    lines.forEach(line => {
      ctx.beginPath();
      line.points.forEach((point, idx) => {
        if (idx === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });

    // 텍스트 그리기
    texts.forEach(box => {
      ctx.fillStyle = 'black';
      ctx.font = '100px Arial';
      ctx.fillText(box.text, box.x, box.y + 16); // 텍스트 위치 조정

      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    });

    // 현재 그리는 선 (실시간 업데이트)
    if (currentDrawingLine.length > 0) {
      ctx.beginPath();
      currentDrawingLine.forEach((point, idx) => {
        if (idx === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }

    ctx.restore();
  }, [canvasRef, offset, scale, currentDrawingLine]); // 의존성 배열에 모든 상태 포함

  return { redrawWith };
};