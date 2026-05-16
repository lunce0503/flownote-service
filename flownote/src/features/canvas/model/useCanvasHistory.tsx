import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ImageElement, LineElement, TextBoxElement } from '../../../entities/canvas/model/types';

type CanvasSnapshot = {
  lines: LineElement[];
  images: ImageElement[];
  textBoxes: TextBoxElement[];
};

type UseCanvasHistoryArgs = CanvasSnapshot & {
  setDrawnLines: Dispatch<SetStateAction<LineElement[]>>;
  setImages: Dispatch<SetStateAction<ImageElement[]>>;
  setTextBoxes: Dispatch<SetStateAction<TextBoxElement[]>>;
};

const cloneSnapshot = ({ lines, images, textBoxes }: CanvasSnapshot): CanvasSnapshot => ({
  lines: lines.map(line => ({ ...line, points: line.points.map(point => ({ ...point })) })),
  images: images.map(image => ({ ...image })),
  textBoxes: textBoxes.map(textBox => ({ ...textBox })),
});

export const useCanvasHistory = ({
  lines,
  images,
  textBoxes,
  setDrawnLines,
  setImages,
  setTextBoxes,
}: UseCanvasHistoryArgs) => {
  const historyRef = useRef<CanvasSnapshot[]>([]);
  const [historySize, setHistorySize] = useState(0);

  const recordHistory = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-49),
      cloneSnapshot({ lines, images, textBoxes }),
    ];
    setHistorySize(historyRef.current.length);
  }, [images, lines, textBoxes]);

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;

    setDrawnLines(previous.lines);
    setImages(previous.images);
    setTextBoxes(previous.textBoxes);
    setHistorySize(historyRef.current.length);
  }, [setDrawnLines, setImages, setTextBoxes]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setHistorySize(0);
  }, []);

  return {
    canUndo: historySize > 0,
    clearHistory,
    recordHistory,
    undo,
  };
};
