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
                a: ({ children, href }) => {
                    const label = String(children);
                    if (href && label.startsWith("동영상:")) {
                        return (
                            <span className="my-2 block">
                                <video className="max-h-80 max-w-full rounded-lg border bg-black" src={href} controls />
                                <a className="mt-1 inline-block font-semibold underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
                                    {children}
                                </a>
                            </span>
                        );
                    }

                    return (
                        <a className="font-semibold underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
                            {children}
                        </a>
                    );
                },
                img: ({ alt, src }) => (
                    <img className="my-2 max-h-64 rounded-lg border object-contain" alt={alt ?? "uploaded"} src={src ?? ""} />
                ),
                u: ({ children }) => <span className="underline">{children}</span>,
            }}
        >
            {message}
        </ReactMarkdown>
    );
}

export default ReactMarkdownRender;
