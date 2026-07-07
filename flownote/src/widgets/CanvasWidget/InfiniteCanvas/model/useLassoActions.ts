import { useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { markModified, type LassoSelection } from "@/features/canvas";
import type { ImageElement, LineElement, Point, TextBoxElement, ToolType } from "@/entities/canvas";

export type LassoClipboard = {
    lines: LineElement[];
    images: ImageElement[];
    textBoxes: TextBoxElement[];
};

const LASSO_PASTE_OFFSET = 32;

type LassoBounds = { minX: number; minY: number; maxX: number; maxY: number } | null;

type UseLassoActionsParams = {
    lassoSelection: LassoSelection | null;
    setLassoSelection: (selection: LassoSelection | null) => void;
    lassoBounds: LassoBounds;
    drawnLines: LineElement[];
    images: ImageElement[];
    textBoxes: TextBoxElement[];
    setDrawnLines: React.Dispatch<React.SetStateAction<LineElement[]>>;
    setImages: React.Dispatch<React.SetStateAction<ImageElement[]>>;
    setTextBoxes: React.Dispatch<React.SetStateAction<TextBoxElement[]>>;
    setTool: (tool: ToolType) => void;
    recordHistory: () => void;
};

/** 올가미 선택 대상의 이동/확대/복사/붙여넣기/색상/삭제 액션. 상태 변형 로직만 담당한다. */
export const useLassoActions = ({
    lassoSelection,
    setLassoSelection,
    lassoBounds,
    drawnLines,
    images,
    textBoxes,
    setDrawnLines,
    setImages,
    setTextBoxes,
    setTool,
    recordHistory,
}: UseLassoActionsParams) => {
    const [lassoClipboard, setLassoClipboard] = useState<LassoClipboard | null>(null);
    const lassoPasteCountRef = useRef(0);

    const moveLassoSelection = (dx: number, dy: number) => {
        if (!lassoSelection) return;

        setDrawnLines((prev) => prev.map((line) => (
            lassoSelection.lineIds.has(line.id)
                ? markModified({ ...line, points: line.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) })
                : line
        )));
        setImages((prev) => prev.map((image) => (
            lassoSelection.imageIds.has(image.id)
                ? markModified({ ...image, x: image.x + dx, y: image.y + dy })
                : image
        )));
        setTextBoxes((prev) => prev.map((textBox) => (
            lassoSelection.textBoxIds.has(textBox.id)
                ? markModified({ ...textBox, x: textBox.x + dx, y: textBox.y + dy })
                : textBox
        )));
    };

    const handleScaleLassoSelection = (factor: number) => {
        if (!lassoSelection || !lassoBounds) return;
        recordHistory();

        const center = {
            x: (lassoBounds.minX + lassoBounds.maxX) / 2,
            y: (lassoBounds.minY + lassoBounds.maxY) / 2,
        };
        const scalePoint = (point: Point): Point => ({
            x: center.x + (point.x - center.x) * factor,
            y: center.y + (point.y - center.y) * factor,
        });

        setDrawnLines((prev) => prev.map((line) => (
            lassoSelection.lineIds.has(line.id)
                ? markModified({ ...line, points: line.points.map(scalePoint) })
                : line
        )));
        setImages((prev) => prev.map((image) => {
            if (!lassoSelection.imageIds.has(image.id)) return image;
            const topLeft = scalePoint({ x: image.x, y: image.y });
            return markModified({ ...image, x: topLeft.x, y: topLeft.y, width: image.width * factor, height: image.height * factor });
        }));
        setTextBoxes((prev) => prev.map((textBox) => {
            if (!lassoSelection.textBoxIds.has(textBox.id)) return textBox;
            const topLeft = scalePoint({ x: textBox.x, y: textBox.y });
            return markModified({ ...textBox, x: topLeft.x, y: topLeft.y, width: textBox.width * factor, height: textBox.height * factor });
        }));
    };

    const handleCopyLassoSelection = () => {
        if (!lassoSelection) return;

        setLassoClipboard({
            lines: drawnLines
                .filter((line) => line.status !== "deleted" && lassoSelection.lineIds.has(line.id))
                .map((line) => ({ ...line, points: line.points.map((point) => ({ ...point })) })),
            images: images
                .filter((image) => image.status !== "deleted" && lassoSelection.imageIds.has(image.id))
                .map((image) => ({ ...image })),
            textBoxes: textBoxes
                .filter((textBox) => textBox.status !== "deleted" && lassoSelection.textBoxIds.has(textBox.id))
                .map((textBox) => ({ ...textBox })),
        });
        lassoPasteCountRef.current = 0;
    };

    const handlePasteLassoSelection = () => {
        if (!lassoClipboard) return;
        recordHistory();

        lassoPasteCountRef.current += 1;
        const pasteOffset = LASSO_PASTE_OFFSET * lassoPasteCountRef.current;
        const nextLineIds = new Set<string>();
        const nextImageIds = new Set<string>();
        const nextTextBoxIds = new Set<string>();

        const pastedLines = lassoClipboard.lines.map((line) => {
            const id = uuidv4();
            nextLineIds.add(id);
            return {
                ...line,
                id,
                points: line.points.map((point) => ({ x: point.x + pasteOffset, y: point.y + pasteOffset })),
                status: "new" as const,
            };
        });
        const pastedImages = lassoClipboard.images.map((image) => {
            const id = uuidv4();
            nextImageIds.add(id);
            return {
                ...image,
                id,
                x: image.x + pasteOffset,
                y: image.y + pasteOffset,
                status: "new" as const,
            };
        });
        const pastedTextBoxes = lassoClipboard.textBoxes.map((textBox) => {
            const id = uuidv4();
            nextTextBoxIds.add(id);
            return {
                ...textBox,
                id,
                x: textBox.x + pasteOffset,
                y: textBox.y + pasteOffset,
                status: "new" as const,
            };
        });

        setDrawnLines((prev) => [...prev, ...pastedLines]);
        setImages((prev) => [...prev, ...pastedImages]);
        setTextBoxes((prev) => [...prev, ...pastedTextBoxes]);
        setLassoSelection({
            lineIds: nextLineIds,
            imageIds: nextImageIds,
            textBoxIds: nextTextBoxIds,
        });
        setTool("lasso");
    };

    const handleChangeLassoSelectionColor = (color: string) => {
        if (!lassoSelection) return;
        recordHistory();
        setDrawnLines((prev) => prev.map((line) => (
            lassoSelection.lineIds.has(line.id)
                ? markModified({ ...line, color })
                : line
        )));
        setTextBoxes((prev) => prev.map((textBox) => (
            lassoSelection.textBoxIds.has(textBox.id)
                ? markModified({ ...textBox, color })
                : textBox
        )));
        setImages((prev) => prev.map((image) => (
            lassoSelection.imageIds.has(image.id)
                ? markModified({ ...image, tintColor: color })
                : image
        )));
    };

    const handleDeleteLassoSelection = () => {
        if (!lassoSelection) return;
        recordHistory();
        setDrawnLines((prev) => prev.map((line) => (lassoSelection.lineIds.has(line.id) ? markModified({ ...line, status: "deleted" }) : line)));
        setImages((prev) => prev.map((image) => (lassoSelection.imageIds.has(image.id) ? markModified({ ...image, status: "deleted" }) : image)));
        setTextBoxes((prev) => prev.map((textBox) => (lassoSelection.textBoxIds.has(textBox.id) ? markModified({ ...textBox, status: "deleted" }) : textBox)));
        setLassoSelection(null);
    };

    return {
        lassoClipboard,
        moveLassoSelection,
        handleScaleLassoSelection,
        handleCopyLassoSelection,
        handlePasteLassoSelection,
        handleChangeLassoSelectionColor,
        handleDeleteLassoSelection,
    };
};
