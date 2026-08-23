export type NoteContent = unknown[];

export interface BlockDataProps {
  id: string;
  title: string;
  content: NoteContent;
  created_at: Date | string;
  updated_at?: string;
  revision?: number;
  client_id?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

export const getFirstNoteText = (content: NoteContent): string | null => {
  const visit = (value: unknown): string | null => {
    if (typeof value === "string") return value.trim() || null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = visit(item);
        if (text) return text;
      }
      return null;
    }
    if (!isRecord(value)) return null;
    if (typeof value.text === "string" && value.text.trim()) return value.text.trim();
    return visit(value.content) ?? visit(value.children);
  };

  return visit(content);
};
