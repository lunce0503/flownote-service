import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import type { PartialBlock } from "@blocknote/core";
import type { DiaryJournalBlock } from "@/entities/diary";

type Props = {
  initialContent: DiaryJournalBlock[];
  onChange: (blocks: DiaryJournalBlock[]) => void;
};

// BlockNote 기반 자유 타이핑 영역. 부모가 날짜를 key로 remount 하므로
// initialContent는 마운트 시 한 번만 반영하면 된다(날짜별 저장 내용 로드).
const DiaryJournal = ({ initialContent, onChange }: Props) => {
  const editor = useCreateBlockNote({
    initialContent: Array.isArray(initialContent) && initialContent.length > 0
      ? (initialContent as PartialBlock[])
      : undefined,
  });

  return (
    <div className="diary-journal min-h-64 rounded-lg border border-slate-200 bg-white py-2">
      <BlockNoteView editor={editor} theme="light" onChange={() => onChange(editor.document)} />
    </div>
  );
};

export default DiaryJournal;
