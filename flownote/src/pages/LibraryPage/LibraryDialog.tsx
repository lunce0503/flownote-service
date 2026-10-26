import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function LibraryDialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="library-dialog workspace-surface" aria-label={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2>{title}</h2><button type="button" aria-label="대화상자 닫기" onClick={close}><X size={20} /></button></header>{children}
  </dialog>;
}
