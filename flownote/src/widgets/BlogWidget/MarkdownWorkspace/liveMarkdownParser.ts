import { Marked, marked, type Token, type TokensList } from 'marked';

// Tiptap 3.20 task-list tokenization uses a helper lexer that can redirect
// marked's shared tokenizer, leaving later inline token arrays empty.
// Repair only those unparsed inline arrays after block lexing completes.
export function createLiveMarkdownParser() {
  const parser = new Marked();
  const lex = parser.lexer.bind(parser);
  parser.lexer = (source: string, options?: Parameters<typeof lex>[1]): TokensList => {
    const tokens = lex(source, options);
    const repair = (items: Token[]) => {
      for (const token of items) {
        if ('tokens' in token && Array.isArray(token.tokens)) {
          if (token.tokens.length === 0 && 'text' in token && token.text && ['paragraph', 'heading', 'text'].includes(token.type)) {
            token.tokens = parser.Lexer.lexInline(token.text, parser.defaults);
          }
          repair(token.tokens);
        }
        if (token.type === 'list') for (const item of token.items) repair(item.tokens);
      }
    };
    repair(tokens);
    return tokens;
  };
  // Tiptap's option is typed as the singleton although it only uses the
  // instance lexer/use/setOptions surface. Marked supports isolated instances.
  return Object.assign(parser, { getDefaults: marked.getDefaults }) as unknown as typeof marked;
}
