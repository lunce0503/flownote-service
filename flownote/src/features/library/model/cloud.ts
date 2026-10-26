import { axios, API_CORE_BASE_URL, authHeaders } from '@/shared/api';
import type { AxiosRequestConfig } from 'axios';
import { isDeviceOnly, isDeviceModeTransitioning } from '@/shared/lib/deviceMode';
import { DEVICE_SYNC_HEADER, runWithDeviceSyncNetwork } from '@/shared/lib/deviceSyncNetwork';
import type { Book } from './library';
import * as local from './storage';
import { acknowledgeBook, bookChanges, mergeCloudBook, uploadBookMetadata, type CloudBook } from './syncModel';

const reconciling = new Set<string>();
export type LibrarySyncStatus = { owner: string; message: string; busy: boolean; error: boolean };
const status = (owner: string, message: string, busy = false, error = false) => {
  window.dispatchEvent(new CustomEvent<LibrarySyncStatus>('flownote-library-sync', { detail: { owner, message, busy, error } }));
};
const onlineCheck = (owner: string) => {
  local.ownerCheck(owner);
  if ((isDeviceOnly() && !reconciling.has(owner)) || isDeviceModeTransitioning()) throw new Error('동기화가 꺼져 있습니다. 책은 기기에 보관합니다.');
};
export async function libraryRequest<T>(owner: string, path: string, config: AxiosRequestConfig = {}): Promise<T> {
  onlineCheck(owner);
  const response = await axios.request<T>({ ...config, url: `${API_CORE_BASE_URL}/api/library${path}`,
    headers: { ...authHeaders(), ...config.headers, 'X-Flownote-Expected-Owner': owner, ...(reconciling.has(owner) ? { [DEVICE_SYNC_HEADER]: '1' } : {}) }, timeout: 120000 });
  onlineCheck(owner);
  if (response.headers['x-flownote-owner'] !== owner) throw new Error('로그인한 계정이 책장 계정과 다릅니다. 다시 로그인해 주세요.');
  return response.data;
}
const httpStatus = (error: unknown) => axios.isAxiosError(error) ? error.response?.status : undefined;
export const libraryError = (error: unknown) => {
  const data = axios.isAxiosError<{ error?: string; detail?: string }>(error) ? error.response?.data : undefined;
  return data?.error || data?.detail || (error instanceof Error ? error.message : '책장 동기화에 실패했습니다. 기기 자료를 보관하고 다시 시도해 주세요.');
};
const jobs = new Map<string, Promise<void>>();
const requested = new Set<string>();
const lastAttempt = new Map<string, number>();
async function upload(owner: string, book: Book): Promise<CloudBook> {
  const file = await local.readBookFile(owner, book.id);
  const session = await libraryRequest<{ id: string; chunkBytes: number; parts: number[] }>(owner, '/uploads', {
    method: 'POST', data: { book: uploadBookMetadata(book) },
  });
  if (session.chunkBytes !== 1024 * 1024) throw new Error('책 업로드 규격을 확인하지 못했습니다.');
  await local.mutateLocalBook(owner, book.id, current => current ? { ...current, uploadId: session.id } : undefined);
  const completed = new Set(session.parts);
  const count = Math.ceil(file.size / session.chunkBytes);
  for (let part = 0; part < count; part++) {
    if (completed.has(part)) continue;
    onlineCheck(owner);
    status(owner, `“${book.title}” 클라우드에 저장 중 · ${Math.round(part / count * 100)}%`, true);
    const bytes = await file.slice(part * session.chunkBytes, (part + 1) * session.chunkBytes).arrayBuffer();
    const sum = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(sum), value => value.toString(16).padStart(2, '0')).join('');
    await libraryRequest(owner, `/uploads/${session.id}/chunks/${part}`, { method: 'PUT', data: bytes,
      headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-Sha256': hash } });
  }
  return libraryRequest<CloudBook>(owner, `/uploads/${session.id}/complete`, { method: 'POST' });
}
async function pushBook(owner: string, snapshot: Book) {
  if (snapshot.deleted) {
    if (!snapshot.cloudRevision) return;
    try {
      await libraryRequest(owner, `/books/${snapshot.id}?revision=${snapshot.cloudRevision}`, { method: 'DELETE' });
      await local.mutateLocalBook(owner, snapshot.id, book => book ? { ...book, dirty: undefined, cloudRevision: snapshot.cloudRevision! + 1, syncError: undefined } : undefined);
    } catch (error) {
      if (httpStatus(error) !== 409) throw error;
      const remote = await libraryRequest<CloudBook>(owner, `/books/${snapshot.id}`);
      await local.mutateLocalBook(owner, snapshot.id, book => mergeCloudBook(book, remote));
      requested.add(owner);
    }
    return;
  }
  if (!snapshot.cloudRevision) {
    try {
      const remote = await upload(owner, snapshot);
      await local.mutateLocalBook(owner, snapshot.id, current => current ? acknowledgeBook(current, remote, snapshot.dirty ?? {}) : undefined);
    } catch (error) {
      if (httpStatus(error) !== 409) throw error;
      const remote = await libraryRequest<CloudBook>(owner, `/books/${snapshot.id}`);
      // A completed upload may have lost its ACK. Merge instead of uploading the original twice.
      await local.mutateLocalBook(owner, snapshot.id, current => mergeCloudBook(current, remote));
      requested.add(owner);
    }
    return;
  }
  const changes = bookChanges(snapshot);
  if (!Object.keys(changes).length) return;
  try {
    const remote = await libraryRequest<CloudBook>(owner, `/books/${snapshot.id}`, { method: 'PATCH',
      data: { revision: snapshot.cloudRevision, changes } });
    await local.mutateLocalBook(owner, snapshot.id, current => current ? acknowledgeBook(current, remote, snapshot.dirty ?? {}) : undefined);
  } catch (error) {
    if (httpStatus(error) !== 409) throw error;
    const remote = await libraryRequest<CloudBook>(owner, `/books/${snapshot.id}`);
    await local.mutateLocalBook(owner, snapshot.id, current => mergeCloudBook(current, remote));
    requested.add(owner);
  }
}
async function pushTerms(owner: string) {
  const terms = await local.listLocalTerms(owner);
  for (const term of terms.filter(item => item.pending && !local.activeLibraryLookups.has(JSON.stringify([item.bookId, item.page, item.term])))) {
    const book = await local.getLocalBook(owner, term.bookId);
    if (!book || book.deleted || !book.cloudRevision) continue;
    if (term.deleted) {
      try { await libraryRequest(owner, `/books/${term.bookId}/terms/${term.cloudId ?? term.id}`, { method: 'DELETE' }); }
      catch (error) { if (httpStatus(error) !== 404) throw error; }
      await local.acknowledgeTerm(owner, term);
    } else {
      const saved = await libraryRequest<local.LibraryTerm>(owner, `/books/${term.bookId}/terms`, { method: 'POST',
        data: { id: term.cloudId ?? term.id, term: term.term, page: term.page, definition: term.definition } });
      await local.acknowledgeTerm(owner, term, saved);
    }
  }
}
async function synchronize(owner: string) {
  onlineCheck(owner); status(owner, '책장을 동기화하고 있습니다…', true);
  let attempts = 0;
  do {
    requested.delete(owner);
    for (const book of await local.listBooks(owner, true)) {
      onlineCheck(owner);
      // Acknowledged tombstones are retained as a barrier; they need no further writes.
      if (book.deleted && !book.dirty && book.cloudRevision && !book.syncError) continue;
      try { await pushBook(owner, book); }
      catch (error) {
        if (!isDeviceOnly()) await local.mutateLocalBook(owner, book.id, current => current ? { ...current, syncError: libraryError(error) } : undefined);
        throw error;
      }
    }
    let cursor = '';
    do {
      const page = await libraryRequest<{ books: CloudBook[]; nextCursor?: string }>(owner, `/books${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const remote of page.books) await local.mutateLocalBook(owner, remote.id, current => mergeCloudBook(current, remote));
      cursor = page.nextCursor ?? '';
    } while (cursor);
    await pushTerms(owner);
  } while (requested.has(owner) && ++attempts < 3);
  status(owner, requested.has(owner) ? '새 변경을 기기에 보관했습니다. 이어서 동기화합니다.' : '클라우드와 동기화됨 · 다른 기기에서도 이어서 읽을 수 있어요');
}
export async function syncLibrary(owner: string, force = false): Promise<void> {
  local.ownerCheck(owner);
  if ((isDeviceOnly() && !reconciling.has(owner)) || isDeviceModeTransitioning()) { status(owner, '동기화 꺼짐 · 이 기기에 보관'); return Promise.resolve(); }
  const running = jobs.get(owner);
  if (running) { if (force) requested.add(owner); return running; }
  if (!force && Date.now() - (lastAttempt.get(owner) ?? 0) < 20000) return Promise.resolve();
  lastAttempt.set(owner, Date.now());
  const job = synchronize(owner).catch(error => {
    status(owner, `${libraryError(error)} · 기기 자료는 유지됩니다.`, false, true); throw error;
  }).finally(() => {
    jobs.delete(owner);
    if (requested.has(owner) && !isDeviceOnly()) window.setTimeout(() => { void syncLibrary(owner, true).catch(() => {}); }, 1000);
  });
  jobs.set(owner, job); return job;
}
const kick = (owner: string) => { void syncLibrary(owner, true).catch(() => {}); };
export async function listBooks(owner: string): Promise<Book[]> {
  const books = await local.listBooks(owner); void syncLibrary(owner).catch(() => {}); return books;
}
export async function addBook(owner: string, book: Book, file: Blob) { await local.addBook(owner, book, file); kick(owner); }
export async function changeBook(owner: string, id: string, update: local.BookChange) {
  const book = await local.changeBook(owner, id, update); kick(owner); return book;
}
export async function deleteBook(owner: string, id: string) { await local.deleteBook(owner, id); kick(owner); }
export async function readBookFile(owner: string, id: string): Promise<Blob> {
  if (await local.hasBookFile(owner, id)) return local.readBookFile(owner, id);
  const book = await local.getLocalBook(owner, id);
  if (!book || book.deleted) throw new Error('책을 찾을 수 없습니다.');
  if (isDeviceOnly()) throw new Error('이 기기에 원본 PDF가 없습니다. 동기화를 켜고 한 번 열어 주세요.');
  const file = await libraryRequest<Blob>(owner, `/books/${id}/file`, { responseType: 'blob' });
  if (file.size !== book.bytes) throw new Error('PDF 다운로드가 완전하지 않습니다. 다시 시도해 주세요.');
  await local.cacheBookFile(owner, id, file); return file;
}
export async function reconcileLibraryToCloud(owner: string) {
  return runWithDeviceSyncNetwork(async () => {
    local.ownerCheck(owner); reconciling.add(owner);
    try { await syncLibrary(owner, true); }
    finally { reconciling.delete(owner); }
  });
}
