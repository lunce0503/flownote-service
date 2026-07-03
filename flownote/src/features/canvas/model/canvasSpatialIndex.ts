import RBush from "rbush";
import type { ImageElement, LineElement, Point, TextBoxElement } from "../../../entities/canvas/model/types";
import type { Bounds } from "./canvasGeometry";

type ElementKind = "line" | "image" | "text";

type SpatialItem = Bounds & {
  id: string;
  kind: ElementKind;
};

export const getLineBounds = (line: LineElement): Bounds => {
  const first = line.points[0] ?? { x: 0, y: 0 };
  return line.points.reduce<Bounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: first.x, minY: first.y, maxX: first.x, maxY: first.y });
};

export const getPointsBounds = (points: Point[]): Bounds | null => {
  if (points.length === 0) return null;
  return points.reduce<Bounds>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: points[0].x, minY: points[0].y, maxX: points[0].x, maxY: points[0].y });
};

export class CanvasSpatialIndex {
  private readonly tree = new RBush<SpatialItem>();

  constructor(lines: LineElement[], images: ImageElement[] = [], textBoxes: TextBoxElement[] = []) {
    const items: SpatialItem[] = [];
    lines.forEach((line) => {
      if (line.status === "deleted" || line.points.length === 0) return;
      items.push({ ...getLineBounds(line), id: line.id, kind: "line" });
    });
    images.forEach((image) => {
      if (image.status === "deleted") return;
      items.push({
        id: image.id, kind: "image", minX: image.x, minY: image.y,
        maxX: image.x + image.width, maxY: image.y + image.height,
      });
    });
    textBoxes.forEach((textBox) => {
      if (textBox.status === "deleted") return;
      items.push({
        id: textBox.id, kind: "text", minX: textBox.x, minY: textBox.y,
        maxX: textBox.x + textBox.width, maxY: textBox.y + textBox.height,
      });
    });
    if (items.length > 0) this.tree.load(items);
  }

  search(bounds: Bounds, kind?: ElementKind): Set<string> {
    return new Set(this.tree.search(bounds)
      .filter((item) => !kind || item.kind === kind)
      .map((item) => item.id));
  }

  searchPoint(point: Point, radius: number, kind?: ElementKind): Set<string> {
    return this.search({
      minX: point.x - radius,
      minY: point.y - radius,
      maxX: point.x + radius,
      maxY: point.y + radius,
    }, kind);
  }
}
