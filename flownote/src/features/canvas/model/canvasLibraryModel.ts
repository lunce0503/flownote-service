import type { CanvasDocumentSummary, CanvasFolder } from "@/entities/canvas";

export const buildCanvasFolderIdByCanvasId = (folders: CanvasFolder[]) => {
    const entries = folders.flatMap((folder) => folder.canvasIds.map((canvasId) => [canvasId, folder.id] as const));
    return new Map(entries);
};

export const getUnfiledCanvases = (
    documents: CanvasDocumentSummary[],
    folderIdByCanvasId: Map<string, string>,
) => documents.filter((document) => !folderIdByCanvasId.has(document.id));

export const groupCanvasFoldersByCategory = (folders: CanvasFolder[]) => (
    folders.reduce<Record<string, CanvasFolder[]>>((acc, folder) => {
        const category = folder.category.trim() || "카테고리 없음";
        acc[category] = [...(acc[category] ?? []), folder];
        return acc;
    }, {})
);

export const getCanvasTitle = (
    documents: CanvasDocumentSummary[],
    selectedCanvasId: string | null,
    fallback = "그림판",
) => documents.find((document) => document.id === selectedCanvasId)?.title ?? fallback;
