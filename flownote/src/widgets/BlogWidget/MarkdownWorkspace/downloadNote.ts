import { downloadBlob } from '@/shared/lib/downloadBlob';

export function downloadNote(name: string, text: string, type = 'text/markdown;charset=utf-8') {
  void downloadBlob(name, new Blob([text], { type }));
}

