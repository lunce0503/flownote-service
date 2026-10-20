export type MarkdownContent = {
  format: 'markdown';
  version: 1;
  markdown: string;
  legacy_original?: unknown[];
};
export const isMarkdown = (value: unknown): value is MarkdownContent => {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Partial<MarkdownContent>;
  return doc.format === 'markdown' && doc.version === 1 && typeof doc.markdown === 'string';
};
export const safeMarkdownUrl = (url: string): string => {
  if ([...url].some(c => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127 || c === '\\') || url.startsWith('//')) return '';
  return /^(https?:\/\/|mailto:|#|\/(?!\/))/.test(url) || !/^[\w+.-]+:/.test(url) ? url : '';
};
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const escape = (v: string) => v.replace(/[\\`*_[\]<>|]/g, '\\$&');

export function convertLegacy(original: unknown[]) {
  const warnings: string[] = [];
  const inline = (value: unknown): string => {
    if (typeof value === 'string') return escape(value);
    if (!Array.isArray(value)) return '';
    return value.map(item => {
      const v = record(item), props = record(v.props), styles = record(v.styles);
      if (v.type === 'latex') return props.displayMode ? `\n$$\n${String(props.latex ?? '')}\n$$\n` : `$${String(props.latex ?? '')}$`;
      if (v.type === 'link') return `[${inline(v.content)}](${safeMarkdownUrl(String(v.href ?? '')).replace(/[()]/g, c => encodeURIComponent(c))})`;
      let text = typeof v.text === 'string' ? escape(v.text) : '';
      if (styles.code) text = '`' + String(v.text ?? '').replaceAll('`', '\\`') + '`';
      if (styles.bold) text = `**${text}**`;
      if (styles.italic) text = `*${text}*`;
      if (styles.strike) text = `~~${text}~~`;
      if (!text && v.type !== 'text') warnings.push(`인라인 ${String(v.type ?? 'unknown')}: 원본 보관`);
      return text;
    }).join('');
  };
  const blocks = (items: unknown[], depth = 0): string => items.map(item => {
    const b = record(item), p = record(b.props), text = inline(b.content);
    let result: string;
    switch (b.type) {
      case 'paragraph': result = text; break;
      case 'heading': result = '#'.repeat(Math.min(6, Math.max(1, Number(p.level) || 1))) + ' ' + text; break;
      case 'bulletListItem': result = `${'  '.repeat(depth)}- ${text}`; break;
      case 'numberedListItem': result = `${'  '.repeat(depth)}1. ${text}`; break;
      case 'checkListItem': result = `${'  '.repeat(depth)}- [${p.checked ? 'x' : ' '}] ${text}`; break;
      case 'quote': result = text.split('\n').map(t => '> ' + t).join('\n'); break;
      case 'codeBlock': {
        const raw = Array.isArray(b.content) ? b.content.map(i => String(record(i).text ?? '')).join('') : String(b.content ?? '');
        const fence = '`'.repeat(Math.max(3, ...(raw.match(/`+/g) ?? []).map(s => s.length + 1)));
        result = `${fence}${String(p.language ?? '').replace(/[^\w+-]/g, '')}\n${raw}\n${fence}`; break;
      }
      case 'image': result = `![${escape(String(p.caption ?? p.name ?? 'image'))}](${safeMarkdownUrl(String(p.url ?? '')).replace(/[()]/g, c => encodeURIComponent(c))})`; break;
      case 'table': {
        const rows = record(b.content).rows;
        const cells = Array.isArray(rows) ? rows.map(r => {
          const cells = record(r).cells;
          return Array.isArray(cells) ? cells.map(c => inline(Array.isArray(c) ? c : record(c).content).replaceAll('\n', ' ')) : [];
        }) : [];
        const width = Math.max(0, ...cells.map(r => r.length));
        const row = (r: string[]) => '| ' + Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ') + ' |';
        result = cells.length ? [row(cells[0]), row(Array(width).fill('---')), ...cells.slice(1).map(row)].join('\n') : '';
        break;
      }
      default: warnings.push(`${String(b.type ?? 'unknown')}: 원본 보관`); result = `> [원본 보기: ${escape(String(b.type ?? 'unknown'))}]\n${text}`;
    }
    if (Array.isArray(b.children) && b.children.length) result += '\n' + blocks(b.children, depth + 1);
    return result;
  }).join('\n\n');
  const markdown = blocks(original);
  return { content: { format: 'markdown', version: 1, markdown, legacy_original: structuredClone(original) } as MarkdownContent, warnings };
}
