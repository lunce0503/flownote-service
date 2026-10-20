// This is the persisted category -> folder -> note hierarchy, never invented nesting.
export type TreeNote = { id: string; title: string };
export type TreeFolder = { id: string; name: string; category: string; noteIds: string[] };
export function workspaceTree<T extends TreeNote>(notes: T[], folders: TreeFolder[]) {
  const byId = new Map(notes.map(n => [n.id, n]));
  const assigned = new Set<string>();
  const categories = new Map<string, { folder: TreeFolder; notes: T[] }[]>();
  for (const folder of folders) {
    const members = folder.noteIds.flatMap(id => {
      const note = byId.get(id);
      if (!note || assigned.has(id)) return [];
      assigned.add(id); return [note];
    });
    const category = folder.category.trim() || '카테고리 없음';
    categories.set(category, [...(categories.get(category) ?? []), { folder, notes: members }]);
  }
  return { categories: [...categories], unfiled: notes.filter(n => !assigned.has(n.id)) };
}
