import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import postNoteData from "../../../entities/blog/postNoteData";
import type { BlockDataProps } from "../../../entities/blog";
import { useNavigate, useParams } from "react-router-dom";
import getNoteData from "../../../entities/blog/getNoteData";
import { API_CORE_BASE_URL, authHeaders } from "../../../shared/api";
import axios from "axios";
import { LatexInline } from "./LatexInline";
import { transformLatexInlineContent } from "./latexTransform";
import NoteDrawingPad from "./NoteDrawingPad";
import { updateNoteTitle } from "../../../entities/blog/noteDataActions";

const uploadFile = async (file: File) => {
  const body = new FormData();
  body.append("file", file);

  const response = await axios.post(`${API_CORE_BASE_URL}/api/notes/upload`, body, {
    headers: authHeaders(),
  });

  const data = response.data;
  const finalUrl = `${API_CORE_BASE_URL}${data.fileUrl}`;
  
  console.log("최종 전달된 이미지 URL:", finalUrl); // 디버깅용
  return finalUrl;
}
const  BlockNote = () => {
  const { title } = useParams<{title:string}>();
  const navigate = useNavigate();

  const schema = BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      latex: LatexInline,
    },
  });

  const editor = useCreateBlockNote({
    schema,
    uploadFile,    
  });
  const [noteData,setNoteData] = useState<BlockDataProps | null>(null);
  const [isLoading,setIsLoading] = useState<boolean>(true);
  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const [isDrawingSaving, setIsDrawingSaving] = useState(false);
  const noteDataRef = useRef<BlockDataProps | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    noteDataRef.current = noteData;
  }, [noteData]);
  
  // 1. 페이지 진입 시 데이터 로드 로직
  useEffect(() => {
    const fetchData = async () => {
      if (title) {
        const decodedTitle = decodeURIComponent(title);
        try {
          setIsLoading(true);
          // 실제 환경에서는 여기서 API 호출을 합니다.
          // const data = await getNoteByTitle(decodedTitle);
          const data: BlockDataProps[] = await getNoteData();
          const targetData = data.find((note)=>note.title===decodedTitle)
          if (targetData){
            setNoteData(targetData);
            noteDataRef.current = targetData;

          // 데이터에 내용(Block)이 있다면 에디터에 주입
            if (targetData.content.length > 0) {
              editor.replaceBlocks(editor.document, targetData.content);
            }
          
          }
        } catch (error) {
          console.error("Failed to fetch note:", error);
        } finally {
          setIsLoading(false); // 로딩 해제 (이게 있어야 화면이 뜹니다!)
        }
      }
    };
    fetchData();
  }, [title, editor]);

  const normalizeLatexInBlocks = useCallback((blocks: BlockDataProps["content"]) => {
    for (const block of blocks) {
      if (Array.isArray(block.content)) {
        const { changed, content } = transformLatexInlineContent(block.content);

        if (changed) {
          editor.updateBlock(block.id, {
            content,
          });
        }
      }

      if (block.children.length > 0) {
        normalizeLatexInBlocks(block.children);
      }
    }
  }, [editor]);

  const buildCurrentNoteData = useCallback(() => {
    const currentNote = noteDataRef.current;
    if (!currentNote) return null;

    normalizeLatexInBlocks(editor.document);

    return {
      ...currentNote,
      content : editor.document,
      created_at: new Date()
    };
  }, [editor, normalizeLatexInBlocks]);

  const saveNoteData = useCallback(async () => {
    const blockData = buildCurrentNoteData();
    if (!blockData) return;

    noteDataRef.current = blockData;
    await postNoteData(blockData);
  }, [buildCurrentNoteData]);

  const queueSave = useCallback((delay = 700) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (isComposingRef.current) return;

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveNoteData();
    }, delay);
  }, [saveNoteData]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    return saveNoteData();
  }, [saveNoteData]);

  const saveNoteDataWithKeepalive = useCallback(() => {
    const blockData = buildCurrentNoteData();
    if (!blockData) return;

    void fetch(`${API_CORE_BASE_URL}/api/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(blockData),
      keepalive: true,
    });
  }, [buildCurrentNoteData]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveNoteDataWithKeepalive();
      }
    };

    const handlePageLeave = () => {
      saveNoteDataWithKeepalive();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
      }
      void saveNoteData();
    };
  }, [saveNoteData, saveNoteDataWithKeepalive]);

  const saveTitle = useCallback(async (nextTitle: string, shouldReplaceRoute = false) => {
    const currentNote = noteDataRef.current;
    const trimmedTitle = nextTitle.trim();
    if (!currentNote || !trimmedTitle) return;

    const updatedNote = {
      ...currentNote,
      title: trimmedTitle,
    };
    noteDataRef.current = updatedNote;
    setNoteData(updatedNote);

    await updateNoteTitle(currentNote.id, trimmedTitle);
    await flushSave();

    if (shouldReplaceRoute) {
      navigate(`/blog/${encodeURIComponent(trimmedTitle)}`, { replace: true });
    }
  }, [flushSave, navigate]);

  const handleTitle = (nextTitle:string) => {
    const currentNote = noteDataRef.current;
    if (!currentNote) return;

    const updatedNote = {
      ...currentNote,
      title: nextTitle
    };

    noteDataRef.current = updatedNote;
    setNoteData(updatedNote);

    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
    }

    if (isComposingRef.current) return;

    titleTimerRef.current = setTimeout(() => {
      titleTimerRef.current = null;
      void saveTitle(nextTitle);
    }, 800);
  }

  const handleTitleBlur = () => {
    const currentNote = noteDataRef.current;
    if (!currentNote) return;

    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = null;
    }

    void saveTitle(currentNote.title, true);
  };

  const handleNoteData = () => {
    queueSave();
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    queueSave(80);

    const currentNote = noteDataRef.current;
    if (currentNote?.title.trim()) {
      void saveTitle(currentNote.title);
    }
  };

  const handleSaveDrawing = async (file: File) => {
    setIsDrawingSaving(true);
    try {
      const imageUrl = await uploadFile(file);
      const referenceBlock = editor.getTextCursorPosition().block;

      editor.insertBlocks(
        [
          {
            type: "image",
            props: {
              url: imageUrl,
              name: file.name,
              caption: "드로잉 필기",
              showPreview: true,
            },
          },
        ] as any,
        referenceBlock,
        "after",
      );

      setIsDrawingOpen(false);
      await flushSave();
    } finally {
      setIsDrawingSaving(false);
    }
  };

  if (isLoading) return <div className="p-10 text-center text-stone-500">노트를 불러오는 중...</div>;
  if (!noteData) return <div className="p-10 text-center text-stone-500">노트를 찾을 수 없습니다.</div>;
  
  return (
    <div className="m-4 bg-white rounded-xl p-4">
      <div className='note-header mb-2 flex flex-wrap items-center gap-2 bg-amber-100 text-stone-800 rounded-xl p-1'>
        <input 
          type="text" 
          className="m-1 min-w-0 flex-1 bg-transparent text-2xl font-semibold outline-none"
          value={noteData.title}
          onChange={(e) => {handleTitle(e.target.value);}}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onBlur={handleTitleBlur}
          placeholder="Title"
        />
        <button
          type="button"
          onClick={() => setIsDrawingOpen(true)}
          className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
        >
          드로잉 필기
        </button>
      </div>
      
      <div onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd}>
        <BlockNoteView 
          editor={editor} 
          onChange={handleNoteData}
          theme="light"
        />
      </div>

      {isDrawingOpen ? (
        <NoteDrawingPad
          isSaving={isDrawingSaving}
          onClose={() => setIsDrawingOpen(false)}
          onSave={handleSaveDrawing}
        />
      ) : null}
      
    </div>
  );
}

export default BlockNote;
