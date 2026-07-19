import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { postNoteData } from "@/entities/blog";
import type { BlockDataProps } from "@/entities/blog";
import { useNavigate, useParams } from "react-router-dom";
import { getNoteData } from "@/entities/blog";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import axios from "axios";
import { Maximize2, Minimize2 } from "lucide-react";
import { LatexInline } from "./LatexInline";
import { transformLatexInlineContent } from "./latexTransform";
import NoteDrawingPad from "./NoteDrawingPad";
import { getSyncClientId, subscribeSyncEvents } from "@/shared/lib/sync";
import { useFullscreen } from "@/shared/lib/useFullscreen";

const uploadFile = async (file: File) => {
  if (!API_CORE_BASE_URL) {
    throw new Error("노트 업로드 API 기본 URL이 설정되지 않았습니다.");
  }

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

const areBlocksEqual = (left: BlockDataProps["content"], right: BlockDataProps["content"]) => {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const normalizeBlocksForSave = (blocks: BlockDataProps["content"]): BlockDataProps["content"] => (
  blocks.map((block) => {
    const nextBlock = { ...block } as typeof block;

    if (Array.isArray(block.content)) {
      nextBlock.content = transformLatexInlineContent(block.content).content as typeof block.content;
    }
    if (block.children.length > 0) {
      nextBlock.children = normalizeBlocksForSave(block.children) as typeof block.children;
    }

    return nextBlock;
  }) as BlockDataProps["content"]
);

type PendingNoteSave = {
  revision: number;
  note: BlockDataProps;
};

const  BlockNote = () => {
  const { title } = useParams<{title:string}>();
  const navigate = useNavigate();
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  const schema = useMemo(() => BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
    },
    inlineContentSpecs: {
      ...defaultInlineContentSpecs,
      latex: LatexInline,
    },
  }), []);

  const editor = useCreateBlockNote({
    schema,
    uploadFile,    
  });
  const [noteData,setNoteData] = useState<BlockDataProps | null>(null);
  const [isLoading,setIsLoading] = useState<boolean>(true);
  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const [isDrawingSaving, setIsDrawingSaving] = useState(false);
  const [editingDrawingBlockId, setEditingDrawingBlockId] = useState<string | null>(null);
  const clientId = useMemo(() => getSyncClientId(), []);
  const noteDataRef = useRef<BlockDataProps | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const isApplyingRemoteContentRef = useRef(false);
  const localRevisionRef = useRef(0);
  const lastPersistedRevisionRef = useRef(0);
  const pendingSaveRef = useRef<PendingNoteSave | null>(null);
  const saveLoopPromiseRef = useRef<Promise<void> | null>(null);
  const saveQueueRunnerRef = useRef<(() => Promise<void>) | null>(null);
  const ignoredDocumentHashRef = useRef<string | null>(null);

  const replaceEditorContent = useCallback((content: BlockDataProps["content"]) => {
    if (content.length === 0 || areBlocksEqual(editor.document, content)) {
      return false;
    }

    isApplyingRemoteContentRef.current = true;
    ignoredDocumentHashRef.current = JSON.stringify(content);
    try {
      editor.replaceBlocks(editor.document, content);
    } finally {
      window.setTimeout(() => {
        isApplyingRemoteContentRef.current = false;
        ignoredDocumentHashRef.current = JSON.stringify(editor.document);
      }, 0);
    }

    return true;
  }, [editor]);

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
            if (replaceEditorContent(targetData.content)) {
              ignoredDocumentHashRef.current = JSON.stringify(editor.document);
            }
            const revision = targetData.revision ?? 0;
            localRevisionRef.current = revision;
            lastPersistedRevisionRef.current = revision;
            pendingSaveRef.current = null;
          
          }
        } catch (error) {
          console.error("Failed to fetch note:", error);
        } finally {
          setIsLoading(false); // 로딩 해제 (이게 있어야 화면이 뜹니다!)
        }
      }
    };
    fetchData();
  }, [editor, title, replaceEditorContent]);

  const createSaveSnapshot = useCallback((revision: number): PendingNoteSave | null => {
    const currentNote = noteDataRef.current;
    if (!currentNote) return null;

    return {
      revision,
      note: {
        ...currentNote,
        content: normalizeBlocksForSave(structuredClone(editor.document)),
        revision,
        client_id: clientId,
      },
    };
  }, [clientId, editor]);

  const applyServerNote = useCallback((targetData: BlockDataProps) => {
    const revision = targetData.revision ?? 0;
    noteDataRef.current = targetData;
    setNoteData(targetData);
    localRevisionRef.current = revision;
    lastPersistedRevisionRef.current = revision;
    pendingSaveRef.current = null;
    replaceEditorContent(targetData.content);
  }, [replaceEditorContent]);

  const fetchCurrentNote = useCallback(async () => {
    const currentNote = noteDataRef.current;
    if (!currentNote) return null;

    const data = await getNoteData();
    return data.find((note) => note.id === currentNote.id) ?? null;
  }, []);

  const processSaveQueue = useCallback(() => {
    if (saveLoopPromiseRef.current) {
      return saveLoopPromiseRef.current;
    }

    let retryScheduled = false;
    const loopPromise = (async () => {
      while (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        const currentTitle = noteDataRef.current?.title ?? pending.note.title;

        try {
          const saved = await postNoteData({ ...pending.note, title: currentTitle });
          const savedRevision = saved.revision ?? pending.revision;
          lastPersistedRevisionRef.current = Math.max(lastPersistedRevisionRef.current, savedRevision);
          noteDataRef.current = {
            ...(noteDataRef.current ?? pending.note),
            content: pending.note.content,
            revision: savedRevision,
            updated_at: saved.updated_at,
            client_id: saved.client_id,
          };
          setNoteData((current) => current ? {
            ...current,
            revision: savedRevision,
            updated_at: saved.updated_at,
            client_id: saved.client_id,
          } : current);
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 409) {
            let serverNote: BlockDataProps | null = null;
            try {
              serverNote = await fetchCurrentNote();
            } catch (refreshError) {
              console.error("노트 충돌 상태 조회 실패:", refreshError);
            }
            if (!serverNote) {
              pendingSaveRef.current = pending;
              retryScheduled = true;
              window.setTimeout(() => void saveQueueRunnerRef.current?.(), 1500);
              break;
            }

            const serverRevision = serverNote.revision ?? 0;
            lastPersistedRevisionRef.current = Math.max(lastPersistedRevisionRef.current, serverRevision);
            localRevisionRef.current = Math.max(localRevisionRef.current, serverRevision);

            if (!areBlocksEqual(editor.document, serverNote.content) || pendingSaveRef.current) {
              const rebasedRevision = localRevisionRef.current + 1;
              localRevisionRef.current = rebasedRevision;
              pendingSaveRef.current = createSaveSnapshot(rebasedRevision);
            } else {
              applyServerNote(serverNote);
            }
            continue;
          }

          if (!pendingSaveRef.current || pendingSaveRef.current.revision < pending.revision) {
            pendingSaveRef.current = pending;
          }
          retryScheduled = true;
          window.setTimeout(() => void saveQueueRunnerRef.current?.(), 1500);
          console.error("노트 자동 저장 실패:", error);
          break;
        }
      }
    })();

    saveLoopPromiseRef.current = loopPromise;
    void loopPromise.finally(() => {
      saveLoopPromiseRef.current = null;
      if (pendingSaveRef.current && !retryScheduled) {
        void saveQueueRunnerRef.current?.();
      }
    });
    return loopPromise;
  }, [applyServerNote, createSaveSnapshot, editor, fetchCurrentNote]);

  saveQueueRunnerRef.current = processSaveQueue;

  useEffect(() => subscribeSyncEvents((event) => {
    if (event.resource !== "notes" && event.resource !== "all") return;
    if (!title) return;

    const refreshNote = async () => {
      const decodedTitle = decodeURIComponent(title);
      const data: BlockDataProps[] = await getNoteData();
      const targetData = data.find((note) => note.title === decodedTitle || note.id === noteDataRef.current?.id);
      if (!targetData) return;

      const currentNote = noteDataRef.current;
      const remoteRevision = targetData.revision ?? 0;
      const hasLocalEditInProgress =
        isComposingRef.current ||
        pendingSaveRef.current !== null ||
        saveLoopPromiseRef.current !== null ||
        localRevisionRef.current > lastPersistedRevisionRef.current;

      if (event.clientId === clientId || (event.noteId && event.noteId !== currentNote?.id)) {
        return;
      }
      if (hasLocalEditInProgress) {
        return;
      }
      if (event.action === "note-saved" && remoteRevision <= lastPersistedRevisionRef.current) return;

      applyServerNote(targetData);
    };

    void refreshNote();
  }), [applyServerNote, clientId, title]);

  const queueSave = useCallback((delay = 700) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    if (isComposingRef.current) return;

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void processSaveQueue();
    }, delay);
  }, [processSaveQueue]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    return processSaveQueue();
  }, [processSaveQueue]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushSave();
      }
    };

    const handlePageLeave = () => {
      void flushSave();
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
      void processSaveQueue();
    };
  }, [flushSave, processSaveQueue]);

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

    const nextRevision = Math.max(localRevisionRef.current, lastPersistedRevisionRef.current) + 1;
    localRevisionRef.current = nextRevision;
    pendingSaveRef.current = createSaveSnapshot(nextRevision);
    await flushSave();

    if (shouldReplaceRoute) {
      navigate(`/blog/${encodeURIComponent(trimmedTitle)}`, { replace: true });
    }
  }, [createSaveSnapshot, flushSave, navigate]);

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
    const documentHash = JSON.stringify(editor.document);
    if (isApplyingRemoteContentRef.current || ignoredDocumentHashRef.current === documentHash) {
      ignoredDocumentHashRef.current = null;
      return;
    }

    const nextRevision = Math.max(localRevisionRef.current, lastPersistedRevisionRef.current) + 1;
    localRevisionRef.current = nextRevision;
    pendingSaveRef.current = createSaveSnapshot(nextRevision);
    queueSave();
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const handleTitleCompositionEnd = () => {
    isComposingRef.current = false;

    const currentNote = noteDataRef.current;
    if (currentNote?.title.trim()) {
      void saveTitle(currentNote.title);
    }
  };

  const handleEditorCompositionEnd = () => {
    isComposingRef.current = false;
    queueSave();
  };

  const findImageBlockByUrl = useCallback((url: string) => {
    const visit = (blocks: typeof editor.document): any => {
      for (const block of blocks) {
        if (block.type === "image" && (block.props as any)?.url === url) {
          return block;
        }

        const found = visit(block.children as typeof editor.document);
        if (found) return found;
      }

      return null;
    };

    return visit(editor.document);
  }, [editor]);

  const handleEditorClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const image = target?.closest("img") as HTMLImageElement | null;
    if (!image?.src) return;

    const block = findImageBlockByUrl(image.src);
    if (!block) return;

    setEditingDrawingBlockId(block.id);
    setIsDrawingOpen(true);
  };

  const handleSaveDrawing = async (file: File) => {
    setIsDrawingSaving(true);
    try {
      const imageUrl = await uploadFile(file);
      if (editingDrawingBlockId) {
        editor.updateBlock(editingDrawingBlockId, {
          props: {
            url: imageUrl,
            name: file.name,
            caption: "드로잉 필기 수정본",
            showPreview: true,
          },
        } as any);
      } else {
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
      }

      setIsDrawingOpen(false);
      setEditingDrawingBlockId(null);
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
          onCompositionEnd={handleTitleCompositionEnd}
          onBlur={handleTitleBlur}
          placeholder="Title"
        />
        <button
          type="button"
          onClick={() => {
            setEditingDrawingBlockId(null);
            setIsDrawingOpen(true);
          }}
          className="rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
        >
          드로잉 필기
        </button>
        {/* 영상 전체 화면처럼 브라우저 UI와 Flownote 헤더를 숨기고 노트에 집중한다. */}
        <button
          type="button"
          onClick={() => { void toggleFullscreen(); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
          title={isFullscreen ? "전체 보기 종료 (Esc)" : "브라우저 툴바와 헤더를 숨기고 전체 화면으로 봅니다"}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {isFullscreen ? "전체 보기 종료" : "전체로 보기"}
        </button>
      </div>
      
      <div onClick={handleEditorClick} onCompositionStart={handleCompositionStart} onCompositionEnd={handleEditorCompositionEnd}>
        <BlockNoteView 
          editor={editor} 
          onChange={handleNoteData}
          theme="light"
        />
      </div>

      {isDrawingOpen ? (
        <NoteDrawingPad
          isSaving={isDrawingSaving}
          onClose={() => {
            setEditingDrawingBlockId(null);
            setIsDrawingOpen(false);
          }}
          onSave={handleSaveDrawing}
        />
      ) : null}
      
    </div>
  );
}

export default BlockNote;
