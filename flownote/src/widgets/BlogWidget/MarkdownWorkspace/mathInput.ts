export type LatexCommand = { label: string; description: string; insert: string; cursor: number };
const commands: LatexCommand[] = [
  { label: '\\frac', description: '분수', insert: '\\frac{}{}', cursor: 6 },
  { label: '\\sqrt', description: '제곱근', insert: '\\sqrt{}', cursor: 6 },
  { label: '\\sum', description: '합', insert: '\\sum_{i=1}^{n} ', cursor: 14 },
  { label: '\\int', description: '적분', insert: '\\int_{a}^{b} ', cursor: 12 },
  { label: '\\lim', description: '극한', insert: '\\lim_{x \\to 0} ', cursor: 15 },
  ...['alpha', 'beta', 'gamma', 'theta', 'pi', 'infty', 'times', 'cdot', 'leq', 'geq', 'neq'].map(name => ({ label: `\\${name}`, description: '수학 기호', insert: `\\${name} `, cursor: name.length + 2 })),
  { label: '\\vec', description: '벡터', insert: '\\vec{}', cursor: 5 },
  { label: '\\begin', description: '여러 줄 정렬', insert: '\\begin{aligned}\n &= \\\\\n &= \n\\end{aligned}', cursor: 17 },
];
const escaped = (text: string, index: number) => {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) count++;
  return count % 2 === 1;
};

// Track delimiters without interpreting escaped dollars or code as mathematics.
function openMath(text: string) {
  let math = '', code = 0;
  for (let i = 0; i < text.length; i++) {
    if (escaped(text, i)) continue;
    if (text[i] === '`' && !math) {
      const size = text.slice(i).match(/^`+/)![0].length;
      if (!code) code = size; else if (code === size) code = 0;
      i += size - 1;
    } else if (!code && text[i] === '$') {
      const delimiter = text[i + 1] === '$' ? '$$' : '$';
      if (!math) math = delimiter; else if (math === delimiter) math = '';
      i += delimiter.length - 1;
    }
  }
  return code ? '' : math;
}
export function inlineMathMatch(text: string) {
  if (!text.endsWith('$') || text.endsWith('$$') || escaped(text, text.length - 1)) return null;
  for (let i = text.length - 2; i >= 0; i--) {
    if (text[i] !== '$' || escaped(text, i)) continue;
    if (text[i - 1] === '$' || text[i + 1] === '$' || openMath(text.slice(0, i)) || text.slice(0, i).split('`').length % 2 === 0) return null;
    const latex = text.slice(i + 1, -1).trim();
    return latex && !latex.includes('\n') ? { from: i, latex } : null;
  }
  return null;
}
export function multilineMath(lines: string[]) {
  if (lines.length < 3 || lines[0].trim() !== '$$' || lines.at(-1)?.trim() !== '$$') return null;
  const latex = lines.slice(1, -1).join('\n').trim();
  return latex || null;
}
export type MathCompletion = { from: number; to: number; items: LatexCommand[] };
export function latexCompletion(source: string, cursor: number, force = false): MathCompletion | null {
  const before = source.slice(0, cursor), match = before.match(/\\([a-zA-Z]*)$/);
  if (!match || escaped(before, match.index!) || (!force && !openMath(before))) return null;
  const items = commands.filter(command => command.label.slice(1).startsWith(match[1])).slice(0, 6);
  return items.length ? { from: match.index!, to: cursor, items } : null;
}
export function replaceCompletion(value: string, completion: MathCompletion, command: LatexCommand) {
  return { value: value.slice(0, completion.from) + command.insert + value.slice(completion.to), cursor: completion.from + command.cursor };
}
