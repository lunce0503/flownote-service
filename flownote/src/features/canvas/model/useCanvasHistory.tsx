import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ImageElement, LineElement, TextBoxElement } from "@/entities/canvas";
import { markModified } from "./canvasGeometry";

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

type ElementChange<T extends { id: string }> = {
  id: string;
  before?: T;
  after?: T;
  beforeIndex: number;
};

type CanvasCommand = {
  type: "ADD_LINE" | "DELETE_LINE" | "MOVE_ELEMENT" | "BATCH_UPDATE";
  lines: ElementChange<LineElement>[];
  images: ElementChange<ImageElement>[];
  textBoxes: ElementChange<TextBoxElement>[];
};

const MAX_HISTORY_SIZE = 50;

const shallowSnapshot = ({ lines, images, textBoxes }: CanvasSnapshot): CanvasSnapshot => ({
  lines: [...lines],
  images: [...images],
  textBoxes: [...textBoxes],
});

const buildChanges = <T extends { id: string }>(before: T[], after: T[]): ElementChange<T>[] => {
  const beforeById = new Map(before.map((element, index) => [element.id, { element, index }]));
  const afterById = new Map(after.map((element) => [element.id, element]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const changes: ElementChange<T>[] = [];
  ids.forEach((id) => {
    const previous = beforeById.get(id);
    const current = afterById.get(id);
    if (previous?.element === current) return;
    changes.push({ id, before: previous?.element, after: current, beforeIndex: previous?.index ?? -1 });
  });
  return changes;
};

const classifyCommand = (
  lines: ElementChange<LineElement>[],
  images: ElementChange<ImageElement>[],
  textBoxes: ElementChange<TextBoxElement>[],
): CanvasCommand["type"] => {
  if (images.length === 0 && textBoxes.length === 0 && lines.length === 1) {
    if (!lines[0].before && lines[0].after) return "ADD_LINE";
    if (lines[0].before && (!lines[0].after || lines[0].after.status === "deleted")) return "DELETE_LINE";
  }
  if (lines.length + images.length + textBoxes.length === 1) return "MOVE_ELEMENT";
  return "BATCH_UPDATE";
};

const buildCommand = (before: CanvasSnapshot, after: CanvasSnapshot): CanvasCommand | null => {
  const lines = buildChanges(before.lines, after.lines);
  const images = buildChanges(before.images, after.images);
  const textBoxes = buildChanges(before.textBoxes, after.textBoxes);
  if (lines.length + images.length + textBoxes.length === 0) return null;
  return { type: classifyCommand(lines, images, textBoxes), lines, images, textBoxes };
};

const restoreExistingElement = <T extends { id: string; status?: string }>(before: T, current?: T): T => {
  if (before.status === "new") return before;
  if (!current || current.status === "new") return before;
  return markModified(before);
};

const buildUndoTombstone = <T extends { id: string; status?: string }>(current: T): T | null => {
  if (current.status === "new") return null;
  return { ...current, status: "deleted" };
};

const restoreChanges = <T extends { id: string; status?: string }>(current: T[], changes: ElementChange<T>[]): T[] => {
  if (changes.length === 0) return current;
  const changedIds = new Set(changes.map((change) => change.id));
  const currentById = new Map(current.map((element) => [element.id, element]));
  const restored = current.filter((element) => !changedIds.has(element.id));

  changes
    .filter((change) => !change.before)
    .sort((left, right) => left.beforeIndex - right.beforeIndex)
    .forEach((change) => {
      const tombstone = buildUndoTombstone(currentById.get(change.id) ?? change.after);
      if (tombstone) restored.splice(Math.max(0, change.beforeIndex), 0, tombstone);
    });

  changes
    .filter((change): change is ElementChange<T> & { before: T } => Boolean(change.before))
    .sort((left, right) => left.beforeIndex - right.beforeIndex)
    .forEach((change) => {
      restored.splice(
        Math.min(change.beforeIndex, restored.length),
        0,
        restoreExistingElement(change.before, currentById.get(change.id)),
      );
    });
  return restored;
};

export const useCanvasHistory = ({
  lines,
  images,
  textBoxes,
  setDrawnLines,
  setImages,
  setTextBoxes,
}: UseCanvasHistoryArgs) => {
  const historyRef = useRef<CanvasCommand[]>([]);
  const pendingBeforeRef = useRef<CanvasSnapshot | null>(null);
  const latestRef = useRef<CanvasSnapshot>({ lines, images, textBoxes });
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    latestRef.current = { lines, images, textBoxes };
    if (pendingBeforeRef.current && buildCommand(pendingBeforeRef.current, latestRef.current)) {
      setHistoryVersion((version) => version + 1);
    }
  }, [images, lines, textBoxes]);

  const finalizePendingCommand = useCallback(() => {
    const before = pendingBeforeRef.current;
    if (!before) return;
    const command = buildCommand(before, latestRef.current);
    pendingBeforeRef.current = null;
    if (!command) return;
    historyRef.current.push(command);
    if (historyRef.current.length > MAX_HISTORY_SIZE) historyRef.current.shift();
  }, []);

  const recordHistory = useCallback(() => {
    finalizePendingCommand();
    pendingBeforeRef.current = shallowSnapshot(latestRef.current);
    setHistoryVersion((version) => version + 1);
  }, [finalizePendingCommand]);

  const undo = useCallback(() => {
    finalizePendingCommand();
    const command = historyRef.current.pop();
    if (!command) return;
    setDrawnLines((current) => restoreChanges(current, command.lines));
    setImages((current) => restoreChanges(current, command.images));
    setTextBoxes((current) => restoreChanges(current, command.textBoxes));
    setHistoryVersion((version) => version + 1);
  }, [finalizePendingCommand, setDrawnLines, setImages, setTextBoxes]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    pendingBeforeRef.current = null;
    setHistoryVersion((version) => version + 1);
  }, []);

  const pendingCommand = pendingBeforeRef.current
    ? buildCommand(pendingBeforeRef.current, latestRef.current)
    : null;

  return {
    canUndo: historyVersion >= 0 && (historyRef.current.length > 0 || Boolean(pendingCommand)),
    clearHistory,
    recordHistory,
    undo,
  };
};
