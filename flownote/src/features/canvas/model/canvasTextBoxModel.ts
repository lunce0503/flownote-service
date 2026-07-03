import type { TextBoxElement } from "../../../entities/canvas/model/types";
import { DEFAULT_TEXT_BOX_HEIGHT, DEFAULT_TEXT_BOX_WIDTH } from "./canvasConstants";

const TEXT_BOX_HORIZONTAL_PADDING = 24;
const TEXT_BOX_VERTICAL_PADDING = 20;
const TEXT_BOX_LINE_HEIGHT = 22;
const TEXT_BOX_MIN_WIDTH = DEFAULT_TEXT_BOX_WIDTH;
const TEXT_BOX_MIN_HEIGHT = DEFAULT_TEXT_BOX_HEIGHT;
const TEXT_BOX_MAX_WIDTH = 420;

const getCharacterWeight = (character: string) => (character.charCodeAt(0) > 255 ? 16 : 8);

const measureLineWidth = (line: string) => (
    [...line].reduce((width, character) => width + getCharacterWeight(character), 0)
);

export const getAutoTextBoxSize = (
    text: string,
    currentSize: Pick<TextBoxElement, "width" | "height"> = {
        width: DEFAULT_TEXT_BOX_WIDTH,
        height: DEFAULT_TEXT_BOX_HEIGHT,
    },
) => {
    const lines = text.length > 0 ? text.split("\n") : [""];
    const longestLineWidth = Math.max(...lines.map(measureLineWidth), 0);
    const width = Math.min(
        TEXT_BOX_MAX_WIDTH,
        Math.max(TEXT_BOX_MIN_WIDTH, currentSize.width, longestLineWidth + TEXT_BOX_HORIZONTAL_PADDING),
    );
    const wrappedLineCount = lines.reduce((count, line) => {
        const measuredWidth = measureLineWidth(line);
        const availableWidth = Math.max(1, width - TEXT_BOX_HORIZONTAL_PADDING);
        return count + Math.max(1, Math.ceil(measuredWidth / availableWidth));
    }, 0);
    const height = Math.max(
        TEXT_BOX_MIN_HEIGHT,
        currentSize.height,
        wrappedLineCount * TEXT_BOX_LINE_HEIGHT + TEXT_BOX_VERTICAL_PADDING,
    );

    return { width, height };
};
