import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import 'katex/dist/katex.min.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';


interface ReactMarkdownRenderProps {
    message : string;
}


const ReactMarkdownRender = ({message}:ReactMarkdownRenderProps) => {
    return(
        <ReactMarkdown
            remarkPlugins={[remarkGfm,remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                code(props: any) {
                    const { children, className, node, ...rest } = props;
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                        <div className="my-2 rounded-md overflow-hidden">
                            <SyntaxHighlighter
                                {...rest}
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                            >
                                {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                        </div>
                    ) : (
                        <code className="bg-gray-200 text-red-500 px-1 rounded" {...rest}>
                            {children}
                        </code>
                    );
                },
                ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
                p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                u: ({ children }) => <span className="underline">{children}</span>,
            }}
        >
            {message}
        </ReactMarkdown>
    );
}

export default ReactMarkdownRender;
