export function downloadNote(name: string, text: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '_'); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

