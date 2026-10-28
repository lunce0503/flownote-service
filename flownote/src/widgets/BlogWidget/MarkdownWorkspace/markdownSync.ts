// React can echo an earlier input after ProseMirror has already received the
// next keystroke. Such echoes must never replace the document/IME selection.
export function markdownSync(initial: string) {
  let external = initial;
  const emitted = new Set<string>();
  return {
    emit(value: string) {
      emitted.add(value);
      if (emitted.size > 64) emitted.delete(emitted.values().next().value!);
    },
    receive(value: string) {
      if (value === external) return false;
      external = value;
      return !emitted.has(value);
    },
  };
}
