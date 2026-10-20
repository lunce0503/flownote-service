import type { NoteSummary } from './types';
export type NoteSummaryPage = { notes: NoteSummary[]; next_cursor?: string };
export async function collectNoteSummaries(fetchPage: (cursor?: string) => Promise<NoteSummaryPage>, onPage?: (notes: NoteSummary[]) => void) {
  const notes: NoteSummary[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    if (!Array.isArray(page.notes)) throw new Error('Invalid note summary page');
    notes.push(...page.notes);
    onPage?.([...notes]);
    cursor = page.next_cursor || undefined;
    if (cursor && visited.has(cursor)) throw new Error('Repeated note cursor');
    if (cursor) visited.add(cursor);
  } while (cursor);
  return notes;
}
