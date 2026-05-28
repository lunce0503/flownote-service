import { v4 as uuidv4 } from "uuid";
import type { BlockDataProps } from "../../../entities/blog";
import type { NoteFolder } from "../../../entities/blog/noteFolderData";

export type NoteBlock = {
    content?: Array<{
        text?: string;
    }>;
};

export type BlogNote = {
    id: string;
    title: string;
    content: NoteBlock[];
    created_at?: string | Date;
};

export type FolderForm = {
    category: string;
    name: string;
};

export const EMPTY_BLOG_FOLDER_FORM: FolderForm = {
    category: "",
    name: "",
};

export const BLOG_COLLAPSED_FOLDERS_STORAGE_KEY = "flownote.blog.collapsedFolderIds";

export const getNotePreview = (note: BlogNote) => note.content?.[0]?.content?.[0]?.text || "No content";

export const createBlankNote = (title: string): BlockDataProps => ({
    title,
    id: uuidv4(),
    content: [
        {
            id: uuidv4(),
            type: "paragraph",
            content: [],
            props: {
                textColor: "default",
                backgroundColor: "default",
                textAlignment: "left",
            },
            children: [],
        },
    ] as BlockDataProps["content"],
    created_at: new Date(),
});

export const buildNoteFolderIdByNoteId = (folders: NoteFolder[]) => {
    const entries = folders.flatMap((folder) => folder.noteIds.map((noteId) => [noteId, folder.id] as const));
    return new Map(entries);
};

export const getUnfiledNotes = (
    notes: BlogNote[],
    folderIdByNoteId: Map<string, string>,
) => notes.filter((note) => !folderIdByNoteId.has(note.id));

export const groupNoteFoldersByCategory = (folders: NoteFolder[]) => (
    folders.reduce<Record<string, NoteFolder[]>>((acc, folder) => {
        const category = folder.category.trim() || "카테고리 없음";
        acc[category] = [...(acc[category] ?? []), folder];
        return acc;
    }, {})
);
