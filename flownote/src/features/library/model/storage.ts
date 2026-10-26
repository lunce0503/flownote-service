import { deviceOwner } from '@/shared/lib/deviceMode';
import { bookPage, bookSubject, bookTitle, toggleBookmark, type Book } from './library';
import { dirtyBook, type BookField } from './syncModel';

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('flownote-textbook-library', 2);
  request.onupgradeneeded = () => {
    for (const name of ['books', 'files', 'terms']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
  };
  request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  request.onerror = () => reject(new Error('책장을 열지 못했습니다. 브라우저 저장소 권한을 확인해 주세요.'));
  request.onblocked = () => reject(new Error('다른 창을 닫고 다시 시도해 주세요.'));
});
export const ownerCheck = (owner: string) => {
  if (!owner || deviceOwner() !== owner) throw new Error('계정이 변경됐습니다. 책장을 다시 열어 주세요.');
};
const announce = () => window.dispatchEvent(new Event('flownote-library-changed'));
export async function libraryTransaction<T>(owner: string, stores: string[], write: boolean, action: (tx: IDBTransaction, result: (value: T) => void) => void, notify = true): Promise<T> {
  ownerCheck(owner);
  const db = await open();
  try {
    ownerCheck(owner);
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, write ? 'readwrite' : 'readonly');
      let result: T;
      let failure: unknown;
      tx.oncomplete = () => {
        try { ownerCheck(owner); resolve(result); if (write && notify) announce(); } catch (error) { reject(error); }
      };
      tx.onabort = tx.onerror = () => reject(new Error((failure instanceof DOMException ? failure.name : tx.error?.name) === 'QuotaExceededError'
        ? '기기 저장 공간이 부족합니다. 원본 PDF는 보관하고 다른 책을 정리한 뒤 다시 시도해 주세요.' : '책장 저장에 실패했습니다. 저장소 권한과 여유 공간을 확인해 주세요.'));
      try { action(tx, value => { result = value; }); } catch (error) { failure = error; tx.abort(); }
    });
  } finally { db.close(); }
}
export const listBooks = (owner: string, includeDeleted = false): Promise<Book[]> => libraryTransaction(owner, ['books'], false, (tx, result) => {
  const request = tx.objectStore('books').getAll(IDBKeyRange.bound([owner, ''], [owner, '\uffff']));
  request.onsuccess = () => result((request.result as Book[]).filter(book => includeDeleted || !book.deleted));
});
export const getLocalBook = (owner: string, id: string): Promise<Book | undefined> => libraryTransaction(owner, ['books'], false, (tx, result) => {
  const request = tx.objectStore('books').get([owner, id]); request.onsuccess = () => result(request.result as Book | undefined);
});
export const hasBookFile = (owner: string, id: string): Promise<boolean> => libraryTransaction(owner, ['files'], false, (tx, result) => {
  const request = tx.objectStore('files').getKey([owner, id]); request.onsuccess = () => result(request.result !== undefined);
});
export const readBookFile = (owner: string, id: string): Promise<Blob> => libraryTransaction(owner, ['files', 'books'], false, (tx, result) => {
  const book = tx.objectStore('books').get([owner, id]);
  book.onsuccess = () => {
    if (!book.result || (book.result as Book).deleted) { tx.abort(); return; }
    const request = tx.objectStore('files').get([owner, id]);
    request.onsuccess = () => {
      if (request.result instanceof Blob) { result(request.result); return; }
      if (!(request.result instanceof ArrayBuffer)) { tx.abort(); return; }
      result(new Blob([request.result], { type: 'application/pdf' }));
    };
  };
});
export const cacheBookFile = async (owner: string, id: string, file: Blob): Promise<void> => {
  const bytes = await file.arrayBuffer();
  return libraryTransaction(owner, ['books', 'files'], true, (tx, result) => {
    const book = tx.objectStore('books').get([owner, id]);
    book.onsuccess = () => { if (!book.result || (book.result as Book).deleted) { tx.abort(); return; }
      tx.objectStore('files').put(bytes, [owner, id]); result(undefined); };
  }, false);
};
export const addBook = async (owner: string, book: Book, file: Blob): Promise<void> => {
  const bytes = await file.arrayBuffer();
  return libraryTransaction(owner, ['books', 'files'], true, (tx, result) => {
    tx.objectStore('books').add({ ...book, localVersion: 1 }, [owner, book.id]);
    tx.objectStore('files').add(bytes, [owner, book.id]); result(undefined);
  });
};
// Re-read inside the write transaction: late network responses must not replace newer local input.
export async function mutateLocalBook(owner: string, id: string, update: (book: Book | undefined) => Book | undefined): Promise<Book | undefined> {
  let changed = false;
  const result = await libraryTransaction<Book | undefined>(owner, ['books', 'files', 'terms'], true, (tx, result) => {
    const store = tx.objectStore('books'); const request = store.get([owner, id]);
    request.onsuccess = () => {
      try {
        const original = request.result as Book | undefined;
        const book = update(original);
        if (book && JSON.stringify(book) !== JSON.stringify(original)) {
          changed = true; store.put(book, [owner, id]);
          if (book.deleted) {
            tx.objectStore('files').delete([owner, id]);
            tx.objectStore('terms').delete(IDBKeyRange.bound([owner, id, ''], [owner, id, '\uffff']));
          }
        }
        result(book);
      } catch { tx.abort(); }
    };
  }, false);
  if (changed) announce(); return result;
}
export const deleteBook = async (owner: string, id: string): Promise<void> => {
  await mutateLocalBook(owner, id, book => book ? { ...dirtyBook(book, ['title']), deleted: true } : undefined);
};
export type BookChange = { type: 'page'; page: number } | { type: 'bookmark'; page: number } | { type: 'favorite' } | { type: 'details'; title: string; subject: string };
export const changeBook = async (owner: string, id: string, change: BookChange): Promise<Book> => {
  const book = await mutateLocalBook(owner, id, original => {
    if (!original || original.deleted) throw new Error('삭제된 책입니다.');
    let next = { ...original };
    const fields: BookField[] = [];
    if (change.type === 'page') { next.page = bookPage(change.page, next.pages); fields.push('page'); }
    if (change.type === 'bookmark') { next.bookmarks = toggleBookmark(next.bookmarks, change.page, next.pages); fields.push('bookmarks'); }
    if (change.type === 'favorite') { next.favorite = !next.favorite; fields.push('favorite'); }
    if (change.type === 'details') { next.title = bookTitle(change.title, next.filename); next.subject = bookSubject(change.subject); fields.push('title', 'subject'); }
    const edited = fields.filter(field => JSON.stringify(next[field]) !== JSON.stringify(original[field]));
    if (edited.length) next = dirtyBook(next, edited);
    return next;
  });
  if (!book) throw new Error('책을 찾을 수 없습니다.'); return book;
};

export const activeLibraryLookups = new Set<string>();
export type LibraryTerm = {
  id: string; bookId: string; page: number; term: string; definition: string; sourceUrl: string; createdAt: string;
  pending?: boolean; deleted?: boolean; localVersion?: number; cloudId?: string;
};
export const listLocalTerms = (owner: string, bookId?: string): Promise<LibraryTerm[]> => libraryTransaction(owner, ['terms'], false, (tx, result) => {
  const range = bookId ? IDBKeyRange.bound([owner, bookId, ''], [owner, bookId, '\uffff']) : IDBKeyRange.bound([owner, ''], [owner, '\uffff']);
  const request = tx.objectStore('terms').getAll(range);
  request.onsuccess = () => result(request.result as LibraryTerm[]);
});
export const putLocalTerm = (owner: string, term: LibraryTerm): Promise<void> => libraryTransaction(owner, ['terms', 'books'], true, (tx, result) => {
  const book = tx.objectStore('books').get([owner, term.bookId]);
  book.onsuccess = () => {
    if (!book.result || (book.result as Book).deleted) { tx.abort(); return; }
    tx.objectStore('terms').put(term, [owner, term.bookId, term.id]); result(undefined);
  };
});
export const acknowledgeTerm = (owner: string, captured: LibraryTerm, saved?: LibraryTerm): Promise<void> => libraryTransaction(owner, ['terms'], true, (tx, result) => {
  const store = tx.objectStore('terms'); const request = store.get([owner, captured.bookId, captured.id]);
  request.onsuccess = () => {
    const current = request.result as LibraryTerm | undefined;
    if (current && current.localVersion === captured.localVersion) {
      store.delete([owner, captured.bookId, captured.id]);
      if (saved) store.put(saved, [owner, saved.bookId, saved.id]);
    } else if (current && saved) {
      store.put({ ...current, cloudId: saved.id }, [owner, captured.bookId, captured.id]);
    }
    result(undefined);
  };
});

export const mutateLocalTerm = (owner: string, term: LibraryTerm, change: Partial<LibraryTerm>): Promise<void> => libraryTransaction(owner, ['terms', 'books'], true, (tx, result) => {
  const bookRequest = tx.objectStore('books').get([owner, term.bookId]);
  bookRequest.onsuccess = () => {
    if (!bookRequest.result || (bookRequest.result as Book).deleted) { result(undefined); return; }
    const store = tx.objectStore('terms'); const request = store.get([owner, term.bookId, term.id]);
    request.onsuccess = () => {
      const current = (request.result as LibraryTerm | undefined) ?? term;
      store.put({ ...current, ...change, pending: true, localVersion: (current.localVersion ?? 0) + 1 }, [owner, term.bookId, term.id]); result(undefined);
    };
  };
});
export const mergeTermSnapshot = (owner: string, bookId: string, remote: LibraryTerm[], baseline: LibraryTerm[]): Promise<void> => libraryTransaction(owner, ['terms', 'books'], true, (tx, result) => {
  const store = tx.objectStore('terms');
  const bookRequest = tx.objectStore('books').get([owner, bookId]);
  bookRequest.onsuccess = () => {
    if (!bookRequest.result || (bookRequest.result as Book).deleted) { result(undefined); return; }
    const request = store.getAll(IDBKeyRange.bound([owner, bookId, ''], [owner, bookId, '\uffff']));
    request.onsuccess = () => {
      const current = request.result as LibraryTerm[];
      const remoteIds = new Set(remote.map(term => term.id));
      for (const term of current) if (!term.pending && !remoteIds.has(term.id)) {
        const before = baseline.find(item => item.id === term.id && !item.pending);
        if (before && JSON.stringify(before) === JSON.stringify(term)) store.delete([owner, bookId, term.id]);
      }
      for (const term of remote) {
        const pending = current.find(item => item.pending && item.term === term.term && item.page === term.page);
        if (pending) store.put({ ...pending, cloudId: term.id }, [owner, bookId, pending.id]);
        else {
          const now = current.find(item => item.id === term.id);
          const before = baseline.find(item => item.id === term.id);
          if (!now || (before && JSON.stringify(now) === JSON.stringify(before))) store.put(term, [owner, bookId, term.id]);
        }
      }
      result(undefined);
    };
  };
});
