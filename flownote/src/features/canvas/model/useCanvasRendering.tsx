import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { Point, LineElement, ImageElement, TextBoxElement } from '../../../entities/canvas/model/types';

const DRAWING_STROKE_COLOR = '#000000';

const drawSmoothLine = (ctx: CanvasRenderingContext2D, points: Point[]) => {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y + 0.01);
    ctx.stroke();
    return;
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const nextPoint = points[index + 1];
    const midPoint = {
      x: (point.x + nextPoint.x) / 2,
      y: (point.y + nextPoint.y) / 2,
    };
    ctx.quadraticCurveTo(point.x, point.y, midPoint.x, midPoint.y);
  }

  const lastPoint = points[points.length - 1];
  ctx.lineTo(lastPoint.x, lastPoint.y);
  ctx.stroke();
};

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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 이미지 그리기
    imgs.filter(img => img.status !== 'deleted').forEach(img => {
      // 이미지가 로드되지 않았다면 그리지 않음 (혹은 플레이스홀더)
      if (img.image.complete) {
        ctx.drawImage(img.image, img.x, img.y, img.width, img.height);
      }
    });

    // 선 그리기
    ctx.strokeStyle = DRAWING_STROKE_COLOR;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    lines.filter(line => line.status !== 'deleted').forEach(line => {
      drawSmoothLine(ctx, line.points);
    });

    // 텍스트 그리기
    texts.filter(box => box.status !== 'deleted').forEach(box => {
      ctx.fillStyle = 'black';
      ctx.font = '100px Arial';
      ctx.fillText(box.text, box.x, box.y + 16); // 텍스트 위치 조정

      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
    });

    // 현재 그리는 선 (실시간 업데이트)
    if (currentDrawingLine.length > 0) {
      ctx.strokeStyle = DRAWING_STROKE_COLOR;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawSmoothLine(ctx, currentDrawingLine);
    }

    ctx.restore();
  }, [canvasRef, offset, scale, currentDrawingLine]); // 의존성 배열에 모든 상태 포함

  return { redrawWith };
};
