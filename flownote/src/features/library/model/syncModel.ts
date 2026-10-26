import type { Book } from './library';

export const BOOK_SYNC_FIELDS = ['title', 'subject', 'page', 'bookmarks', 'favorite'] as const;
export type BookField = typeof BOOK_SYNC_FIELDS[number];
export type EditableBook = Pick<Book, BookField>;
export type BookDirty = Partial<Record<BookField, number>>;
export type CloudBook = Book & { revision: number; deleted: boolean; updatedAt: string };
export const editableBook = (book: Book): EditableBook => ({ title: book.title, subject: book.subject, page: book.page,
    bookmarks: [...book.bookmarks], favorite: book.favorite });
export const bookChanges = (book: Book): Partial<EditableBook> => Object.fromEntries(
    BOOK_SYNC_FIELDS.filter(field => book.dirty?.[field] !== undefined).map(field => [field, book[field]]),
);
export const dirtyBook = (book: Book, fields: readonly BookField[]): Book => {
    const version = (book.localVersion ?? 0) + 1;
    return { ...book, localVersion: version, dirty: { ...book.dirty, ...Object.fromEntries(fields.map(field => [field, version])) } };
};
const mergeBookmarks = (base: number[], local: number[], remote: number[]) => {
    const removed = new Set(base.filter(page => !local.includes(page)));
    const added = local.filter(page => !base.includes(page));
    return [...new Set([...remote.filter(page => !removed.has(page)), ...added])].sort((a, b) => a - b);
};
export const mergeCloudBook = (local: Book | undefined, remote: CloudBook): Book => {
    if (local && remote.revision <= (local.cloudRevision ?? 0)) return local;
    let next: Book = { ...remote, cloudRevision: remote.revision, cloudBase: editableBook(remote),
        dirty: local?.dirty, localVersion: local?.localVersion ?? 0, deleted: local?.deleted || remote.deleted };
    if (local && !remote.deleted) {
        for (const field of BOOK_SYNC_FIELDS) if (local.dirty?.[field] !== undefined) {
            const value = field === 'bookmarks' ? mergeBookmarks(local.cloudBase?.bookmarks ?? [], local.bookmarks, remote.bookmarks) : local[field];
            next = { ...next, [field]: value };
        }
    }
    return next;
};
// An ACK belongs to the captured generation. It cannot clear edits made while awaiting the network.
export const acknowledgeBook = (current: Book, remote: CloudBook, captured: BookDirty): Book => {
    if (remote.revision < (current.cloudRevision ?? 0)) return current;
    const dirty = { ...current.dirty };
    for (const field of BOOK_SYNC_FIELDS) if (dirty[field] !== undefined && dirty[field] === captured[field]) delete dirty[field];
    let next: Book = { ...current, dirty: Object.keys(dirty).length ? dirty : undefined, cloudRevision: remote.revision,
        cloudBase: editableBook(remote), deleted: current.deleted || remote.deleted, uploadId: undefined, syncError: undefined };
    for (const field of BOOK_SYNC_FIELDS) if (dirty[field] === undefined) next = { ...next, [field]: remote[field] };
    return next;
};
// Never forward cache, pending state or a client-selected owner into the public API.
export const uploadBookMetadata = (book: Book) => ({ id: book.id, ...editableBook(book), pages: book.pages,
    cover: book.cover, filename: book.filename, bytes: book.bytes, createdAt: book.createdAt });
