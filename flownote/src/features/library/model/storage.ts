import { deviceOwner } from '@/shared/lib/deviceMode';
import { bookPage, bookSubject, bookTitle, toggleBookmark, type Book } from './library';

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('flownote-textbook-library', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('books');
    request.result.createObjectStore('files');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('책장을 열지 못했습니다. 브라우저 저장소 권한을 확인해 주세요.'));
  request.onblocked = () => reject(new Error('다른 창을 닫고 다시 시도해 주세요.'));
});
const ownerCheck = (owner: string) => {
  if (!owner || deviceOwner() !== owner) throw new Error('계정이 변경됐습니다. 책장을 다시 열어 주세요.');
};
const announce = () => window.dispatchEvent(new Event('flownote-library-changed'));
async function transaction<T>(owner: string, stores: string[], write: boolean, action: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  ownerCheck(owner);
  const db = await open();
  try {
    ownerCheck(owner);
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, write ? 'readwrite' : 'readonly');
      let result: T;
      let failure: unknown;
      tx.oncomplete = () => {
        try { ownerCheck(owner); resolve(result); if (write) announce(); } catch (error) { reject(error); }
      };
      tx.onabort = tx.onerror = () => reject(new Error((failure instanceof DOMException ? failure.name : tx.error?.name) === 'QuotaExceededError'
        ? '기기 저장 공간이 부족합니다. 원본 PDF는 보관하고 다른 책을 정리한 뒤 다시 시도해 주세요.' : '책장 저장에 실패했습니다. 저장소 권한과 여유 공간을 확인해 주세요.'));
      try { action(tx, value => { result = value; }); } catch (error) { failure = error; tx.abort(); }
    });
  } finally { db.close(); }
}
export const listBooks = (owner: string): Promise<Book[]> => transaction(owner, ['books'], false, (tx, result) => {
  const request = tx.objectStore('books').getAll(IDBKeyRange.bound([owner, ''], [owner, '\uffff']));
  request.onsuccess = () => result(request.result as Book[]);
});
export const readBookFile = (owner: string, id: string): Promise<Blob> => transaction(owner, ['files'], false, (tx, result) => {
  const request = tx.objectStore('files').get([owner, id]);
  request.onsuccess = () => {
    // Read the initial Chromium prototype too; new writes avoid WebKit's File/Blob persistence failure.
    if (request.result instanceof Blob) { result(request.result); return; }
    if (!(request.result instanceof ArrayBuffer)) { tx.abort(); return; }
    result(new Blob([request.result], { type: 'application/pdf' }));
  };
});
export const addBook = async (owner: string, book: Book, file: Blob): Promise<void> => {
  // Prepare bytes BEFORE opening the transaction: awaiting File IO inside it would auto-close it.
  // WebKit may reject File/Blob object-store values with UnknownError; ArrayBuffer is portable.
  const bytes = await file.arrayBuffer();
  return transaction(owner, ['books', 'files'], true, (tx, result) => {
    tx.objectStore('books').add(book, [owner, book.id]);
    tx.objectStore('files').add(bytes, [owner, book.id]); result(undefined);
  });
};
export const deleteBook = (owner: string, id: string): Promise<void> => transaction(owner, ['books', 'files'], true, (tx, result) => {
  tx.objectStore('books').delete([owner, id]); tx.objectStore('files').delete([owner, id]); result(undefined);
});
export type BookChange = { type: 'page'; page: number } | { type: 'bookmark'; page: number } | { type: 'favorite' } | { type: 'details'; title: string; subject: string };
export const changeBook = (owner: string, id: string, change: BookChange): Promise<Book> => transaction(owner, ['books'], true, (tx, result) => {
  const store = tx.objectStore('books');
  const request = store.get([owner, id]);
  request.onsuccess = () => {
    const book = request.result as Book | undefined;
    if (!book) { tx.abort(); return; }
    if (change.type === 'page') book.page = bookPage(change.page, book.pages);
    if (change.type === 'bookmark') book.bookmarks = toggleBookmark(book.bookmarks, change.page, book.pages);
    if (change.type === 'favorite') book.favorite = !book.favorite;
    if (change.type === 'details') { book.title = bookTitle(change.title, book.filename); book.subject = bookSubject(change.subject); }
    store.put(book, [owner, id]); result(book);
  };
});
