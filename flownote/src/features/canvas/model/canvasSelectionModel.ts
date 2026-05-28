import type { ImageElement, LineElement, Point, TextBoxElement } from "../../../entities/canvas/model/types";
import { isPointInPolygon, lassoHitsLine, type Bounds } from "./canvasGeometry";

export type LassoSelection = {
    lineIds: Set<string>;
    imageIds: Set<string>;
    textBoxIds: Set<string>;
};

export const getLassoSelectionCount = (selection: LassoSelection | null) => (
    selection ? selection.lineIds.size + selection.imageIds.size + selection.textBoxIds.size : 0
);

export const buildLassoSelection = (
    polygon: Point[],
    lines: LineElement[],
    images: ImageElement[],
    textBoxes: TextBoxElement[],
): LassoSelection | null => {
    const selection: LassoSelection = {
        lineIds: new Set(lines.filter((line) => line.status !== "deleted" && lassoHitsLine(line, polygon)).map((line) => line.id)),
        imageIds: new Set(images.filter((image) => {
            const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 };
            return image.status !== "deleted" && isPointInPolygon(center, polygon);
        }).map((image) => image.id)),
        textBoxIds: new Set(textBoxes.filter((textBox) => {
            const center = { x: textBox.x + textBox.width / 2, y: textBox.y + textBox.height / 2 };
            return textBox.status !== "deleted" && isPointInPolygon(center, polygon);
        }).map((textBox) => textBox.id)),
    };

    return getLassoSelectionCount(selection) > 0 ? selection : null;
};

export const getLassoSelectionBounds = (
    selection: LassoSelection | null,
    lines: LineElement[],
    images: ImageElement[],
    textBoxes: TextBoxElement[],
): Bounds | null => {
    if (!selection || getLassoSelectionCount(selection) === 0) return null;

    const points: Point[] = [];
    lines.forEach((line) => {
        if (line.status !== "deleted" && selection.lineIds.has(line.id)) points.push(...line.points);
    });
    images.forEach((image) => {
        if (image.status !== "deleted" && selection.imageIds.has(image.id)) {
            points.push({ x: image.x, y: image.y }, { x: image.x + image.width, y: image.y + image.height });
        }
    });
    textBoxes.forEach((textBox) => {
        if (textBox.status !== "deleted" && selection.textBoxIds.has(textBox.id)) {
            points.push({ x: textBox.x, y: textBox.y }, { x: textBox.x + textBox.width, y: textBox.y + textBox.height });
        }
    });

    if (points.length === 0) return null;
    return points.reduce<Bounds>((bounds, point) => ({
        minX: Math.min(bounds.minX, point.x),
        minY: Math.min(bounds.minY, point.y),
        maxX: Math.max(bounds.maxX, point.x),
        maxY: Math.max(bounds.maxY, point.y),
    }), { minX: points[0].x, minY: points[0].y, maxX: points[0].x, maxY: points[0].y });
};
