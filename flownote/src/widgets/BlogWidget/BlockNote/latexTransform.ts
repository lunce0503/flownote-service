import { normalizeLatex } from "./normalizeLatex";

type StyledTextInline = {
  type: "text";
  text: string;
  styles: Record<string, unknown>;
};

type LatexInline = {
  type: "latex";
  props: {
    latex: string;
    displayMode?: boolean;
  };
};

type InlineContent = StyledTextInline | LatexInline | Record<string, unknown>;

const LATEX_PATTERN = /\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;

const isStyledTextInline = (content: InlineContent): content is StyledTextInline =>
  content.type === "text" &&
  "text" in content &&
  typeof content.text === "string" &&
  "styles" in content;

export const transformLatexInlineContent = (content: InlineContent[]) => {
  let changed = false;

  const transformed = content.flatMap((item) => {
    if (!isStyledTextInline(item)) {
      return [item];
    }

    const parts: InlineContent[] = [];
    let lastIndex = 0;
    let itemChanged = false;

    for (const match of item.text.matchAll(LATEX_PATTERN)) {
      const fullMatch = match[0];
      const displayMode = fullMatch.startsWith("$$");
      const latex = (displayMode ? match[1] : match[2])?.trim();
      const index = match.index ?? 0;

      if (!latex) {
        continue;
      }

      if (index > lastIndex) {
        parts.push({
          ...item,
          text: item.text.slice(lastIndex, index),
        });
      }

      parts.push({
        type: "latex",
        props: {
          latex: normalizeLatex(latex),
          displayMode,
        },
      });

      lastIndex = index + fullMatch.length;
      itemChanged = true;
      changed = true;
    }

    if (!itemChanged) {
      return [item];
    }

    if (lastIndex < item.text.length) {
      parts.push({
        ...item,
        text: item.text.slice(lastIndex),
      });
    }

    return parts;
  });

  return {
    changed,
    content: transformed,
  };
};
