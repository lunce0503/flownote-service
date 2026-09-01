import NoteDrawingCanvas from "../../CanvasWidget/InfiniteCanvas/ui/NoteDrawingCanvas";
import { useEffect, useRef } from "react";

type NoteDrawingPadProps = {
  isSaving: boolean;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
};

const NoteDrawingPad = ({ isSaving, onClose, onSave }: NoteDrawingPadProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isSavingRef = useRef(isSaving);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusableSelector = "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const focusableElements = () => Array.from(dialog?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSavingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={dialogRef}
        className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawing-note-title"
        tabIndex={-1}
      >
        <div className="mb-3">
          <p className="text-sm font-semibold text-amber-700">드로잉 노트</p>
          <h2 id="drawing-note-title" className="text-2xl font-bold text-stone-950">드로잉 필기</h2>
        </div>
        <NoteDrawingCanvas isSaving={isSaving} onCancel={onClose} onSave={onSave} />
      </div>
    </div>
  );
};

export default NoteDrawingPad;
