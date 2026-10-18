import type { CanvasElementStatus, LineElement, Point } from "@/entities/canvas";

export type Bounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

export type CanvasViewport = {
    offset: Point;
    scale: number;
    width: number;
    height: number;
};

export const CANVAS_RENDER_WINDOW_SCALE = 1.5;
export const CANVAS_RENDER_MAX_INTERPOLATED_POINTS = 12_000;

export const getCanvasViewportBounds = ({ offset, scale, width, height }: CanvasViewport): Bounds => ({
    minX: -offset.x / scale,
    minY: -offset.y / scale,
    maxX: (width - offset.x) / scale,
    maxY: (height - offset.y) / scale,
});

export const expandBounds = (bounds: Bounds, scale: number): Bounds => {
    const extraWidth = (bounds.maxX - bounds.minX) * (scale - 1) / 2;
    const extraHeight = (bounds.maxY - bounds.minY) * (scale - 1) / 2;
    return {
        minX: bounds.minX - extraWidth,
        minY: bounds.minY - extraHeight,
        maxX: bounds.maxX + extraWidth,
        maxY: bounds.maxY + extraHeight,
    };
};

export const containsBounds = (container: Bounds, target: Bounds) => (
    container.minX <= target.minX
    && container.minY <= target.minY
    && container.maxX >= target.maxX
    && container.maxY >= target.maxY
);

export const interpolateLinePointsForRendering = (
    points: Point[],
    maxPointCount = CANVAS_RENDER_MAX_INTERPOLATED_POINTS,
): Point[] => {
    if (points.length <= 2) return points;

    const sourceLimit = Math.max(2, Math.floor(maxPointCount / 2));
    const sourcePoints = points.length <= sourceLimit
        ? points
        : Array.from({ length: sourceLimit }, (_, index) => (
            points[Math.round(index * (points.length - 1) / (sourceLimit - 1))]
        ));
    const interpolated: Point[] = [sourcePoints[0]];

    for (let index = 0; index < sourcePoints.length - 1; index += 1) {
        const current = sourcePoints[index];
        const next = sourcePoints[index + 1];
        interpolated.push(
            {
                x: current.x * 0.75 + next.x * 0.25,
                y: current.y * 0.75 + next.y * 0.25,
            },
            {
                x: current.x * 0.25 + next.x * 0.75,
                y: current.y * 0.25 + next.y * 0.75,
            },
        );
    }

    interpolated.push(sourcePoints[sourcePoints.length - 1]);
    return interpolated;
};

export const markModified = <T extends { status?: CanvasElementStatus }>(item: T): T => ({
    ...item,
    status: item.status === "new" ? "new" : "modified",
});

export const removeOrMarkDeleted = <T extends { id: string; status?: CanvasElementStatus }>(
    items: T[],
    ids: Set<string>,
): T[] => items.flatMap((item) => {
    if (!ids.has(item.id)) return [item];
    return item.status === "new" ? [] : [{ ...item, status: "deleted" as const }];
});

export const isPointInPolygon = (point: Point, polygon: Point[]) => {
    if (polygon.length < 3) return false;

    let inside = false;
    for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex++) {
        const current = polygon[currentIndex];
        const previous = polygon[previousIndex];
        const intersects = ((current.y > point.y) !== (previous.y > point.y))
            && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
        if (intersects) inside = !inside;
    }

    return inside;
};

export const lassoHitsLine = (line: LineElement, polygon: Point[]) => (
    line.points.some((point) => isPointInPolygon(point, polygon))
);

export const isPointInsideBounds = (point: Point, bounds: Bounds | null) => (
    Boolean(bounds && point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY)
);
