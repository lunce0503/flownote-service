import type { BlockDataProps } from '../../../entities/blog/model/types';
import { noteDrafts, type NoteDraft } from '../../../entities/blog/model/noteDrafts.ts';
import { isDeviceOnly } from '../../../shared/lib/deviceMode.ts';

type Queue = { pause: () => void; readonly settled: Promise<void> };
const active = new Map<string, Queue>();
const keyFor = (owner: string, id: string) => JSON.stringify([owner, id]);
export const waitForNoteSave = (owner: string, id: string) => active.get(keyFor(owner, id))?.settled ?? Promise.resolve();
export const pauseNoteSave = (owner: string, id: string) => active.get(keyFor(owner, id))?.pause();

// Persistence and acknowledgements are serialized outside the component lifecycle.
export function createNoteSaveQueue(owner: string, initial: BlockDataProps, save: (note: BlockDataProps) => Promise<BlockDataProps>,
  isOwner: () => boolean, notify: (status: string) => void, drafts = noteDrafts) {
  let revision = initial.revision ?? 0;
  let pending: { draft: NoteDraft; persisted: Promise<void> } | null = null;
  let failedSequence: string | null = null;
  let saving = false;
  let blocked = false;
  let conflict = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completion = Promise.resolve();
  const flush = () => {
    if (saving || blocked || !pending || !isOwner()) return completion;
    const snapshot = pending;
    saving = true;
    completion = (async () => {
      try {
        await snapshot.persisted;
        if (!isOwner()) return;
        notify('저장 중');
        const saved = await save({ ...snapshot.draft.note, revision: revision + 1 });
        if (!isOwner()) return;
        revision = saved.revision ?? revision + 1;
        await drafts.ack(owner, saved.id, snapshot.draft.sequence);
        if (pending?.draft.sequence === snapshot.draft.sequence) pending = null;
        if (pending) await drafts.rebase(owner, initial.id, pending.draft.sequence, revision);
        notify(pending?.draft.sequence === failedSequence ? '기기 보관 실패 — 내보내기 필요' : pending ? '기기에 보관됨' : isDeviceOnly() ? '기기에 저장됨 · 동기화 꺼짐' : '서버에 저장됨');
      } catch (error) {
        blocked = true;
        conflict = (error as { response?: { status?: number } }).response?.status === 409;
        notify(conflict ? '충돌 — 서버본 확인 후 초안을 복구하세요' : '저장 실패 — 기기 초안 또는 .md 내보내기를 확인하세요');
      } finally {
        saving = false;
        if (blocked && active.get(keyFor(owner, initial.id)) === queue) active.delete(keyFor(owner, initial.id));
        if (!blocked && pending && isOwner()) void flush();
      }
    })();
    return completion;
  };
  const queue = {
    capture(note: BlockDataProps) {
      clearTimeout(timer);
      const capture = drafts.capture(owner, note, revision);
      pending = capture;
      failedSequence = null;
      notify('변경됨');
      void capture.persisted.then(() => {
        if (pending?.draft.sequence !== capture.draft.sequence) return;
        notify(blocked ? '자동 저장 중지 — 입력은 기기에 보관됨' : '기기에 보관됨');
        if (!blocked) timer = setTimeout(() => void flush(), 650);
      }).catch(() => {
        if (pending?.draft.sequence !== capture.draft.sequence) return;
        failedSequence = capture.draft.sequence; blocked = true; notify('기기 보관 실패 — 내보내기 필요');
      });
    },
    retry() { if (conflict) { notify('충돌 — 서버본 확인 후 초안을 복구하세요'); return; } blocked = false; void flush(); },
    resume() { active.set(keyFor(owner, initial.id), queue); if (!conflict) blocked = false; },
    pause() { blocked = true; clearTimeout(timer); if (!saving && active.get(keyFor(owner, initial.id)) === queue) active.delete(keyFor(owner, initial.id)); },
    get revision() { return revision; },
    get conflicted() { return conflict; },
    get hasPending() { return pending !== null; },
    get settled() { return completion; },
  };
  active.set(keyFor(owner, initial.id), queue);
  return queue;
}
