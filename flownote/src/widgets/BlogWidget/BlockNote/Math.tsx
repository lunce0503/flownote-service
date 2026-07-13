import {
  createReactBlockSpec,
  ResizableFileBlockWrapper,
} from "@blocknote/react";
import type { ReactCustomBlockRenderProps } from "@blocknote/react";
import ReactMarkdownRender from "@/shared/ui/ReactMarkdownRender";

export const LaTexViewer = (props: Omit<ReactCustomBlockRenderProps<string>, "content">) => {
    return(
        <ReactMarkdownRender message={"$$E=mc^2$$"}/>
    )
}
export const Math = createReactBlockSpec(
  {
    type: "math",
    propSchema: {
      name: {
        default: "" as const,
      },
      url: {
        default: "" as const,
      },
      caption: {
        default: "" as const,
      },
      showPreview: {
        default: true,
      },
      previewWidth: {
        default: undefined,
        type: "number",
      },
    },
    content: "none",
  },
  {
    meta: {
      fileBlockAccept: ["application/math"],
    },
    render: (props) => (
      <ResizableFileBlockWrapper
        {...(props as any)}
      >
        <LaTexViewer {...(props as any)} />
      </ResizableFileBlockWrapper>
    ),
  },
);