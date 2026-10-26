import { isDeviceOnly } from '@/shared/lib/deviceMode';
import { libraryError, libraryRequest, syncLibrary } from './cloud';
import { acknowledgeTerm, activeLibraryLookups, listLocalTerms, mergeTermSnapshot, mutateLocalTerm, ownerCheck, putLocalTerm, type LibraryTerm } from './storage';

export type DictionarySense = { partOfSpeech: string; definition: string; translation: string };
export type DictionaryResult = { term: string; definition: string; sourceUrl: string; found: boolean; license: string; language?: string; senses?: DictionarySense[] };
const termKey = (bookId: string, page: number, term: string) => JSON.stringify([bookId, page, term]);
const source = (term: string) => `https://en.wiktionary.org/wiki/${encodeURIComponent(term)}`;
export async function listTerms(owner: string, bookId: string, strict = false): Promise<LibraryTerm[]> {
  if (!isDeviceOnly()) {
    try {
      const baseline = await listLocalTerms(owner, bookId);
      const remote: LibraryTerm[] = [];
      let offset = 0;
      let more: boolean;
      do {
        const response = await libraryRequest<{ terms: LibraryTerm[]; more: boolean }>(owner, `/books/${bookId}/terms?offset=${offset}`);
        remote.push(...response.terms);
        more = response.more; offset += response.terms.length;
      } while (more);
      await mergeTermSnapshot(owner, bookId, remote, baseline);
    } catch (error) { if (strict) throw error; /* Cached history remains available during an outage or unfinished upload. */ }
  }
  ownerCheck(owner);
  return (await listLocalTerms(owner, bookId)).filter(term => !term.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function lookupTerm(owner: string, bookId: string, page: number, selected: string): Promise<DictionaryResult> {
  const term = selected.trim().replace(/\s+/g, ' ');
  if (!term || [...term].length > 120 || [...term].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('120자 이내의 단어나 짧은 구절을 선택해 주세요.');
  const existing = (await listLocalTerms(owner, bookId)).find(item => !item.deleted && item.page === page && item.term === term);
  const record: LibraryTerm = { id: existing?.id ?? crypto.randomUUID(), bookId, page, term,
    definition: existing?.definition ?? '', sourceUrl: source(term), createdAt: existing?.createdAt ?? new Date().toISOString(),
    pending: true, localVersion: (existing?.localVersion ?? 0) + 1, cloudId: existing?.cloudId };
  const key = termKey(bookId, page, term);
  activeLibraryLookups.add(key);
  try {
    await putLocalTerm(owner, record);
    if (isDeviceOnly()) throw new Error('단어를 기기에 저장했습니다. 사전 검색은 동기화를 켠 뒤 사용할 수 있습니다.');
    await syncLibrary(owner, true);
    const response = await libraryRequest<{ result: DictionaryResult; saved: LibraryTerm }>(owner, `/books/${bookId}/lookup`, {
      method: 'POST', data: { id: record.cloudId ?? record.id, page, term },
    });
    await acknowledgeTerm(owner, record, response.saved);
    return response.result;
  } catch (error) {
    throw new Error(`${libraryError(error)} 선택한 단어는 기기에 보관했습니다.`, { cause: error });
  } finally {
    activeLibraryLookups.delete(key);
    void syncLibrary(owner, true).catch(() => {});
  }
}
export async function saveTermDefinition(owner: string, term: LibraryTerm, definition: string) {
  if ([...definition].length > 8000) throw new Error('뜻과 메모는 8,000자 이내로 입력해 주세요.');
  await mutateLocalTerm(owner, term, { definition });
  await syncLibrary(owner, true);
}
export async function deleteTerm(owner: string, term: LibraryTerm) {
  await mutateLocalTerm(owner, term, { deleted: true });
  await syncLibrary(owner, true);
}
// Used for offline preparation so dictionary history travels with each cached book.
export async function cacheBookTerms(owner: string, bookId: string) { await listTerms(owner, bookId); }
