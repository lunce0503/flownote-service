// src/components/InfiniteCanvas/hooks/useElementManipulation.ts
import { useState, useCallback } from 'react';
import type { Point, ImageElement, TextBoxElement, ToolType, CanvasElementStatus } from '../types/types';
import { v4 as uuidv4 } from 'uuid';

type GetCanvasCoords = (e: React.PointerEvent | MouseEvent) => Point;

export const useElementManipulation = (getCanvasCoords: GetCanvasCoords, tool: ToolType) => {
  const [images, setImages] = useState<ImageElement[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBoxElement[]>([]);
  const [movingObject, setMovingObject] = useState<{ type: 'image' | 'text'; id: string; index: number, status: CanvasElementStatus } | null>(null);


  // 텍스트 박스 생성
  const handleTextTool = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    const newText = prompt('Enter text:');
    if (newText) {
      setTextBoxes(prev => [...prev, { id: uuidv4(), text: newText, x, y, width: 100, height: 30, status: 'new' }]);
    }
  }, [getCanvasCoords]);

  // 요소 이동 로직 
  const moveElement = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!movingObject) return;

    const { x, y } = getCanvasCoords(e);

    if (movingObject.type === 'image') {
      setImages(prev => {
        const newImgs = [...prev];
          newImgs[movingObject.index] = { ...newImgs[movingObject.index], x, y, status: 'modified' };
          return newImgs;
      });
    } else if (movingObject.type === 'text') {
      setTextBoxes(prev => {
        const newBoxes = [...prev];
        newBoxes[movingObject.index] = { ...newBoxes[movingObject.index], x, y, status: 'modified' };
        return newBoxes;
      });
    }
  }, [movingObject, getCanvasCoords]);

  return {
    images,
    setImages,
    textBoxes,
    setTextBoxes,
    movingObject,
    setMovingObject,
    handleTextTool,
    moveElement,
  };
};