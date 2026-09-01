import type { CanvasElementStatus, LineElement, Point } from "@/entities/canvas";

export type Bounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
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
