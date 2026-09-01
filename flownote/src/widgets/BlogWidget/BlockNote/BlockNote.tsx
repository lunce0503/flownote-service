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
import { useParams } from "react-router-dom";
import { getNoteData } from "@/entities/blog";
import { API_CORE_BASE_URL, authHeaders } from "@/shared/api";
import axios from "axios";
import { AlertCircle, Check, Loader2, Maximize2, Minimize2, RefreshCw, X } from "lucide-react";
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

type PendingNoteSave = {
  revision: number;
  note: BlockDataProps;
};

type NoteSaveStatus = "idle" | "pending" | "saving" | "retrying" | "saved" | "error";

const MAX_AUTOSAVE_RETRIES = 3;
const AUTOSAVE_RETRY_BASE_MS = 500;

const  BlockNote = () => {
  const { noteId } = useParams<{ noteId: string }>();
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
  type EditorDocument = typeof editor.document;
  type EditorBlock = EditorDocument[number];

  const toEditorDocument = useCallback((content: BlockDataProps["content"]): EditorDocument => (
    content as EditorDocument
  ), []);

  const normalizeBlocksForSave = useCallback((blocks: EditorDocument): BlockDataProps["content"] => {
    const normalize = (currentBlocks: EditorDocument): EditorDocument => currentBlocks.map((block) => {
      const nextBlock = structuredClone(block);
      if (Array.isArray(block.content)) {
        nextBlock.content = transformLatexInlineContent(block.content).content as typeof nextBlock.content;
      }
      if (block.children.length > 0) {
        nextBlock.children = normalize(block.children as EditorDocument) as typeof nextBlock.children;
      }
      return nextBlock;
    });
    return normalize(blocks);
  }, []);
  const [noteData,setNoteData] = useState<BlockDataProps | null>(null);
  const [isLoading,setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<NoteSaveStatus>("idle");
  const [saveRetryCount, setSaveRetryCount] = useState(0);
  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const [isDrawingSaving, setIsDrawingSaving] = useState(false);
  const [editingDrawingBlockId, setEditingDrawingBlockId] = useState<string | null>(null);
  const clientId = useMemo(() => getSyncClientId(), []);
  const noteDataRef = useRef<BlockDataProps | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const isApplyingRemoteContentRef = useRef(false);
  const localRevisionRef = useRef(0);
  const lastPersistedRevisionRef = useRef(0);
  const pendingSaveRef = useRef<PendingNoteSave | null>(null);
  const saveLoopPromiseRef = useRef<Promise<void> | null>(null);
  const saveQueueRunnerRef = useRef<(() => Promise<void>) | null>(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const ignoredDocumentHashRef = useRef<string | null>(null);

  const replaceEditorContent = useCallback((content: BlockDataProps["content"]) => {
    const editorContent = toEditorDocument(content);
    if (editorContent.length === 0 || areBlocksEqual(editor.document, editorContent)) {
      return false;
    }

    isApplyingRemoteContentRef.current = true;
    ignoredDocumentHashRef.current = JSON.stringify(content);
    try {
      editor.replaceBlocks(editor.document, editorContent);
    } finally {
      window.setTimeout(() => {
        isApplyingRemoteContentRef.current = false;
        ignoredDocumentHashRef.current = JSON.stringify(editor.document);
      }, 0);
    }

    return true;
  }, [editor, toEditorDocument]);

  useEffect(() => {
    noteDataRef.current = noteData;
  }, [noteData]);
  
  // 1. 페이지 진입 시 데이터 로드 로직
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      if (noteId) {
        try {
          setIsLoading(true);
          setLoadError(null);
          const data: BlockDataProps[] = await getNoteData();
          if (cancelled) return;
          const targetData = data.find((note) => note.id === noteId);
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
            retryCountRef.current = 0;
            setSaveRetryCount(0);
            setSaveStatus("saved");
          
          }
        } catch (error) {
          console.error("Failed to fetch note:", error);
          if (!cancelled) {
            setLoadError("노트를 불러오지 못했습니다.");
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [editor, loadAttempt, noteId, replaceEditorContent]);

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
  }, [clientId, editor, normalizeBlocksForSave]);

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

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleFailedSave = useCallback((pending: PendingNoteSave) => {
    const queuedPending = pendingSaveRef.current;
    if (!queuedPending || queuedPending.revision < pending.revision) {
      pendingSaveRef.current = pending;
    }

    const nextRetryCount = retryCountRef.current + 1;
    retryCountRef.current = nextRetryCount;
    if (isMountedRef.current) {
      setSaveRetryCount(Math.min(nextRetryCount, MAX_AUTOSAVE_RETRIES));
    }

    if (nextRetryCount > MAX_AUTOSAVE_RETRIES) {
      if (isMountedRef.current) setSaveStatus("error");
      return;
    }

    const retryDelay = AUTOSAVE_RETRY_BASE_MS * (2 ** (nextRetryCount - 1));
    if (isMountedRef.current) setSaveStatus("retrying");
    clearRetryTimer();
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void saveQueueRunnerRef.current?.();
    }, retryDelay);
  }, [clearRetryTimer]);

  const processSaveQueue = useCallback(() => {
    if (saveLoopPromiseRef.current) {
      return saveLoopPromiseRef.current;
    }

    clearRetryTimer();
    let retryScheduled = false;
    const loopPromise = (async () => {
      while (pendingSaveRef.current) {
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        const currentTitle = noteDataRef.current?.title ?? pending.note.title;

        try {
          if (isMountedRef.current) setSaveStatus("saving");
          const saved = await postNoteData({ ...pending.note, title: currentTitle });
          const savedRevision = saved.revision ?? pending.revision;
          retryCountRef.current = 0;
          if (isMountedRef.current) {
            setSaveRetryCount(0);
            setSaveStatus("saved");
          }
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
              retryScheduled = true;
              scheduleFailedSave(pending);
              break;
            }

            const serverRevision = serverNote.revision ?? 0;
            lastPersistedRevisionRef.current = Math.max(lastPersistedRevisionRef.current, serverRevision);
            localRevisionRef.current = Math.max(localRevisionRef.current, serverRevision);

            if (!areBlocksEqual(editor.document, serverNote.content) || pendingSaveRef.current) {
              const rebasedRevision = localRevisionRef.current + 1;
              localRevisionRef.current = rebasedRevision;
              const rebasedSave = createSaveSnapshot(rebasedRevision);
              if (rebasedSave) {
                retryScheduled = true;
                scheduleFailedSave(rebasedSave);
              }
            } else {
              applyServerNote(serverNote);
              retryCountRef.current = 0;
              if (isMountedRef.current) {
                setSaveRetryCount(0);
                setSaveStatus("saved");
              }
            }
            break;
          }

          retryScheduled = true;
          scheduleFailedSave(pending);
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
  }, [applyServerNote, clearRetryTimer, createSaveSnapshot, editor, fetchCurrentNote, scheduleFailedSave]);

  useEffect(() => {
    saveQueueRunnerRef.current = processSaveQueue;
  }, [processSaveQueue]);

  useEffect(() => subscribeSyncEvents((event) => {
    if (event.resource !== "notes" && event.resource !== "all") return;
    if (!noteId) return;

    const refreshNote = async () => {
      const data: BlockDataProps[] = await getNoteData();
      const targetData = data.find((note) => note.id === noteId);
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

    void refreshNote().catch((error) => {
      console.error("노트 동기화 갱신 실패:", error);
    });
  }), [applyServerNote, clientId, noteId]);

  const markLocalChange = useCallback(() => {
    clearRetryTimer();
    retryCountRef.current = 0;
    setSaveRetryCount(0);
    setSaveStatus("pending");
  }, [clearRetryTimer]);

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

  const retrySave = useCallback(() => {
    if (!pendingSaveRef.current) return;
    clearRetryTimer();
    retryCountRef.current = 0;
    setSaveRetryCount(0);
    setSaveStatus("pending");
    void processSaveQueue();
  }, [clearRetryTimer, processSaveQueue]);

  const discardPendingChange = useCallback(async () => {
    clearRetryTimer();
    pendingSaveRef.current = null;
    retryCountRef.current = 0;
    setSaveRetryCount(0);

    try {
      const serverNote = await fetchCurrentNote();
      if (!serverNote) {
        setSaveStatus("error");
        return;
      }
      applyServerNote(serverNote);
      setSaveStatus("saved");
    } catch (error) {
      console.error("노트 변경 취소 실패:", error);
      setSaveStatus("error");
    }
  }, [applyServerNote, clearRetryTimer, fetchCurrentNote]);

  useEffect(() => {
    isMountedRef.current = true;
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
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
      }
      clearRetryTimer();
    };
  }, [clearRetryTimer, flushSave]);

  const saveTitle = useCallback(async (nextTitle: string) => {
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
    markLocalChange();
    await flushSave();

  }, [createSaveSnapshot, flushSave, markLocalChange]);

  const handleTitle = (nextTitle:string) => {
    const currentNote = noteDataRef.current;
    if (!currentNote) return;

    const updatedNote = {
      ...currentNote,
      title: nextTitle
    };

    noteDataRef.current = updatedNote;
    setNoteData(updatedNote);
    setSaveStatus("pending");

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

    void saveTitle(currentNote.title);
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
    markLocalChange();
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
    const visit = (blocks: EditorDocument): EditorBlock | null => {
      for (const block of blocks) {
        if (block.type === "image" && block.props.url === url) {
          return block;
        }

        const found = visit(block.children as EditorDocument);
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
          type: "image",
          props: {
            url: imageUrl,
            name: file.name,
            caption: "드로잉 필기 수정본",
            showPreview: true,
          },
        });
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
          ],
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
  if (loadError) {
    return (
      <div className="m-4 flex flex-col items-center gap-3 rounded-lg bg-red-50 p-10 text-center text-red-700" role="alert">
        <AlertCircle size={22} aria-hidden="true" />
        <p>{loadError}</p>
        <button
          type="button"
          className="rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (!noteData) return <div className="p-10 text-center text-stone-500">노트를 찾을 수 없습니다.</div>;

  const saveStatusContent = {
    idle: { label: "저장 준비", icon: null, className: "text-stone-500" },
    pending: { label: "변경됨", icon: null, className: "text-amber-700" },
    saving: { label: "저장 중", icon: <Loader2 size={14} className="animate-spin" />, className: "text-blue-700" },
    retrying: { label: `재시도 중 (${saveRetryCount}/${MAX_AUTOSAVE_RETRIES})`, icon: <Loader2 size={14} className="animate-spin" />, className: "text-blue-700" },
    saved: { label: "저장됨", icon: <Check size={14} />, className: "text-emerald-700" },
    error: { label: "저장 실패", icon: <AlertCircle size={14} />, className: "text-red-700" },
  }[saveStatus];
  
  return (
    <div className="m-4 bg-white rounded-xl p-4">
      <div className="note-header mb-2 flex flex-col gap-2 rounded-xl bg-amber-100 p-1 text-stone-800">
        <input 
          type="text" 
          aria-label="노트 제목"
          className="m-1 w-[calc(100%-0.5rem)] min-w-0 bg-transparent text-2xl font-semibold outline-none"
          value={noteData.title}
          onChange={(e) => {handleTitle(e.target.value);}}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleTitleCompositionEnd}
          onBlur={handleTitleBlur}
          placeholder="제목"
        />
        <div className="flex w-full flex-wrap items-center justify-between gap-2 px-1 pb-1">
          <div className={`flex min-h-9 items-center gap-1.5 text-xs font-semibold ${saveStatusContent.className}`} role="status" aria-live="polite">
            {saveStatusContent.icon}
            <span>{saveStatusContent.label}</span>
            {saveStatus === "error" && (
              <>
                <button type="button" className="ml-1 inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-stone-800" onClick={retrySave}>
                  <RefreshCw size={13} /> 저장 다시 시도
                </button>
                <button type="button" className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-stone-800" onClick={() => void discardPendingChange()}>
                  <X size={13} /> 변경 취소
                </button>
              </>
            )}
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
        </div>
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
