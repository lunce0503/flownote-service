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

// 게시글(노트)에서 쓰는 BlockNote 에디터를 그대로 재사용한다.
// 부모가 날짜를 key로 remount 하므로 initialContent는 마운트 시 한 번만 반영하면 된다.
const PlannerJournal = ({ initialContent, onChange }: Props) => {
  const editor = useCreateBlockNote({
    initialContent: Array.isArray(initialContent) && initialContent.length > 0
      ? (initialContent as PartialBlock[])
      : undefined,
  });

  return (
    <div className="min-h-56 rounded-lg border border-neutral-200 bg-white py-2 text-black">
      <BlockNoteView editor={editor} theme="light" onChange={() => onChange(editor.document)} />
    </div>
  );
};

export default PlannerJournal;
