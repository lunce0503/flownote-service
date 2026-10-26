import type { BookDirty, EditableBook } from './syncModel';

export const MAX_BOOK_BYTES = 100 * 1024 * 1024;
export const defaultSubjects = ['수학', '물리학', '화학', '생명과학', '컴퓨터과학'];
export type Book = {
  id: string; title: string; subject: string; pages: number; page: number;
  bookmarks: number[]; favorite: boolean; cover: string; filename: string;
  bytes: number; createdAt: string;
  cloudRevision?: number; cloudBase?: EditableBook; dirty?: BookDirty; localVersion?: number;
  deleted?: boolean; uploadId?: string; syncError?: string;
};
export type ReadingRegion = 'page' | 'trim' | 'left' | 'right';
export const bookPage = (page: number, pages: number) => Math.min(pages, Math.max(1, Math.trunc(page) || 1));
export const bookTitle = (title: string, filename: string) => (title.trim() || filename.replace(/\.pdf$/i, '').trim() || '제목 없는 책').slice(0, 160);
export const bookSubject = (subject: string) => subject.trim().slice(0, 40) || '미분류';
export const toggleBookmark = (marks: number[], page: number, pages: number) => {
  const target = bookPage(page, pages);
  return marks.includes(target) ? marks.filter(mark => mark !== target) : [...marks, target].sort((a, b) => a - b);
};
export const readingCrop = (width: number, height: number, region: ReadingRegion) => {
  const inset = region === 'page' ? 0 : .05;
  const x = region === 'right' ? width * .49 : width * inset;
  const w = region === 'left' || region === 'right' ? width * .46 : width * (1 - inset * 2);
  return { x, y: height * inset, width: w, height: height * (1 - inset * 2) };
};
export const validateBookFile = (file: Pick<File, 'size' | 'name' | 'type'>) => {
  if (!file.size) throw new Error('빈 파일은 추가할 수 없습니다.');
  if (file.size > MAX_BOOK_BYTES) throw new Error('100MB 이하 PDF를 선택해 주세요.');
  if (!/\.pdf$/i.test(file.name) || (file.type && !['application/pdf', 'application/octet-stream'].includes(file.type))) {
    throw new Error('PDF 파일을 선택해 주세요.');
  }
};
