import { createReactInlineContentSpec } from "@blocknote/react";
import { renderToString } from "katex";
import "katex/dist/katex.min.css";
import { normalizeLatex } from "./normalizeLatex";

export const LatexInline = createReactInlineContentSpec(
  {
    type: "latex",
    propSchema: {
      latex: {
        default: "",
      },
      displayMode: {
        default: false,
      },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const latex = normalizeLatex(inlineContent.props.latex);
      const displayMode = inlineContent.props.displayMode;
      const html = renderToString(latex, {
        displayMode,
        strict: false,
        throwOnError: false,
      });

      return (
        <span
          className={displayMode ? "block w-full py-2 text-center" : "inline-block px-1 align-baseline"}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
    toExternalHTML: ({ inlineContent }) => {
      const latex = normalizeLatex(inlineContent.props.latex);

      if (inlineContent.props.displayMode) {
        return <span>{`$$${latex}$$`}</span>;
      }

      return <span>{`$${latex}$`}</span>;
    },
  },
);
