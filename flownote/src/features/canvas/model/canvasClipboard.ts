import type { ImageElement, LineElement, TextBoxElement } from "@/entities/canvas";

export type CanvasClipboard = {
    lines: LineElement[];
    images: ImageElement[];
    textBoxes: TextBoxElement[];
};

let canvasClipboard: CanvasClipboard | null = null;

const cloneClipboard = (clipboard: CanvasClipboard): CanvasClipboard => ({
    lines: clipboard.lines.map((line) => ({
        ...line,
        points: line.points.map((point) => ({ ...point })),
    })),
    images: clipboard.images.map((image) => ({ ...image })),
    textBoxes: clipboard.textBoxes.map((textBox) => ({ ...textBox })),
});

/** Keeps copied canvas elements alive while the SPA moves between canvas documents. */
export const readCanvasClipboard = (): CanvasClipboard | null => (
    canvasClipboard ? cloneClipboard(canvasClipboard) : null
);

export const writeCanvasClipboard = (clipboard: CanvasClipboard) => {
    canvasClipboard = cloneClipboard(clipboard);
};
