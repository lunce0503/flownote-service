import { readBookFile, syncLibrary } from './cloud';
import { listBooks } from './storage';
import { listTerms } from './terms';

export async function cacheLibraryForOffline(owner: string, progress: (message: string) => void = () => {}) {
  await syncLibrary(owner, true);
  for (const book of await listBooks(owner)) {
    progress(`오프라인 보관 준비 · “${book.title}”`);
    await readBookFile(owner, book.id);
    await listTerms(owner, book.id, true);
  }
}
