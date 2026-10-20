import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { safeMarkdownUrl } from '@/entities/blog';
import 'katex/dist/katex.min.css';

export default function MarkdownPreview({ source }: { source: string }) {
  return <div className="note-markdown" data-testid="markdown-preview">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: 'warn' }]]}
      skipHtml urlTransform={safeMarkdownUrl}
      components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        img: ({ src, alt }) => src ? <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" /> : <span>{alt} (차단된 이미지)</span> }}>
      {source}
    </ReactMarkdown>
  </div>;
}
