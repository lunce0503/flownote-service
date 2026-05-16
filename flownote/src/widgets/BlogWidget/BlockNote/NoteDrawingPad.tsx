import NoteDrawingCanvas from "../../CanvasWidget/InfiniteCanvas/ui/NoteDrawingCanvas";

type NoteDrawingPadProps = {
  isSaving: boolean;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
};

const NoteDrawingPad = ({ isSaving, onClose, onSave }: NoteDrawingPadProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3">
          <p className="text-sm font-semibold text-amber-700">DRAWING NOTE</p>
          <h2 className="text-2xl font-bold text-stone-950">드로잉 필기</h2>
        </div>
        <NoteDrawingCanvas isSaving={isSaving} onCancel={onClose} onSave={onSave} />
      </div>
    </div>
  );
};

export default NoteDrawingPad;
