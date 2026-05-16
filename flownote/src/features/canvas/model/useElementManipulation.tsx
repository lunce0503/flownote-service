import { useState, useCallback } from 'react';
import type { Point, ImageElement, TextBoxElement, ToolType, CanvasElementStatus } from '../../../entities/canvas/model/types';
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
          const current = newImgs[movingObject.index];
          newImgs[movingObject.index] = { ...current, x, y, status: current.status === 'new' ? 'new' : 'modified' };
          return newImgs;
      });
    } else if (movingObject.type === 'text') {
      setTextBoxes(prev => {
        const newBoxes = [...prev];
        const current = newBoxes[movingObject.index];
        newBoxes[movingObject.index] = { ...current, x, y, status: current.status === 'new' ? 'new' : 'modified' };
        return newBoxes;
      });
    }
  }, [movingObject, getCanvasCoords]);

  const eraseElementAtPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    setImages(prev => prev.flatMap(image => {
      const hit = image.status !== 'deleted'
        && x >= image.x
        && x <= image.x + image.width
        && y >= image.y
        && y <= image.y + image.height;
      if (!hit) return [image];
      return image.status === 'new' ? [] : [{ ...image, status: 'deleted' as const }];
    }));

    setTextBoxes(prev => prev.flatMap(textBox => {
      const hit = textBox.status !== 'deleted'
        && x >= textBox.x
        && x <= textBox.x + textBox.width
        && y >= textBox.y
        && y <= textBox.y + textBox.height;
      if (!hit) return [textBox];
      return textBox.status === 'new' ? [] : [{ ...textBox, status: 'deleted' as const }];
    }));
  }, [getCanvasCoords]);

  return {
    images,
    setImages,
    textBoxes,
    setTextBoxes,
    movingObject,
    setMovingObject,
    eraseElementAtPointer,
    handleTextTool,
    moveElement,
  };
};
