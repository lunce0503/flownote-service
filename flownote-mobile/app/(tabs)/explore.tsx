import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/context/session-context';
import { flownoteApi, type Note, type Task } from '@/lib/flownote-api';

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return '날짜 없음';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '날짜 없음';
  }

  return date.toLocaleDateString();
};

const getNoteText = (content: unknown) => {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .flatMap((block) => {
      if (!block || typeof block !== 'object' || !('content' in block)) {
        return [];
      }

      const inlineContent = (block as { content?: unknown }).content;
      if (!Array.isArray(inlineContent)) {
        return [];
      }

      return inlineContent
        .map((item) => {
          if (!item || typeof item !== 'object' || !('text' in item)) {
            return '';
          }

          return String((item as { text?: unknown }).text ?? '');
        })
        .join('');
    })
    .filter(Boolean)
    .join('\n');
};

const buildNoteContent = (text: string) => [
  {
    id: `mobile-${Date.now()}`,
    type: 'paragraph',
    props: {
      textColor: 'default',
      backgroundColor: 'default',
      textAlignment: 'left',
    },
    content: text.trim()
      ? [
          {
            type: 'text',
            text: text.trim(),
            styles: {},
          },
        ]
      : [],
    children: [],
  },
];

export default function WorkspaceScreen() {
  const { token, user } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [taskName, setTaskName] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editingNoteTitle, setEditingNoteTitle] = useState('');
  const [editingNoteBody, setEditingNoteBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingSelectedNote, setSavingSelectedNote] = useState(false);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  const load = useCallback(async () => {
    if (!token) {
      setTasks([]);
      setNotes([]);
      return;
    }

    setLoading(true);
    try {
      const [nextTasks, nextNotes] = await Promise.all([
        flownoteApi.listTasks(token),
        flownoteApi.listNotes(token),
      ]);
      setTasks(nextTasks);
      setNotes(nextNotes);
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }

    setEditingNoteTitle(selectedNote.title);
    setEditingNoteBody(getNoteText(selectedNote.content));
  }, [selectedNote]);

  const changeTaskLocal = (id: string, patch: Partial<Task>) => {
    setTasks((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const saveTaskPatch = async (id: string, patch: Partial<Task>) => {
    if (!token) {
      return;
    }

    try {
      const result = await flownoteApi.updateTask(token, id, patch);
      if (result.updatedTask) {
        setTasks((current) =>
          current.map((item) => (item.id === id ? result.updatedTask ?? item : item))
        );
      }
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '작업을 업데이트하지 못했습니다.');
      load();
    }
  };

  const createTask = async () => {
    if (!token || !taskName.trim()) {
      return;
    }

    setSavingTask(true);
    try {
      const created = await flownoteApi.createTask(token, {
        taskName: taskName.trim(),
        memo: 'Expo 모바일 앱에서 생성됨',
      });
      setTasks((current) => [created, ...current]);
      setTaskName('');
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '작업을 만들지 못했습니다.');
    } finally {
      setSavingTask(false);
    }
  };

  const toggleTask = async (task: Task) => {
    if (!token) {
      return;
    }

    const nextStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    try {
      const result = await flownoteApi.updateTask(token, task.id, { status: nextStatus });
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? result.updatedTask ?? item : item))
      );
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '작업을 업데이트하지 못했습니다.');
    }
  };

  const deleteTask = async (task: Task) => {
    if (!token) {
      return;
    }

    try {
      await flownoteApi.deleteTask(token, task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '작업을 삭제하지 못했습니다.');
    }
  };

  const createNote = async () => {
    if (!token || !noteTitle.trim()) {
      return;
    }

    setSavingNote(true);
    try {
      const created = await flownoteApi.createNote(token, {
        title: noteTitle.trim(),
        content: buildNoteContent(noteBody),
      });
      setNotes((current) => [created, ...current]);
      setSelectedNoteId(created.id);
      setNoteTitle('');
      setNoteBody('');
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '노트를 만들지 못했습니다.');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (note: Note) => {
    if (!token) {
      return;
    }

    try {
      await flownoteApi.deleteNote(token, note.id);
      setNotes((current) => current.filter((item) => item.id !== note.id));
      if (selectedNoteId === note.id) {
        setSelectedNoteId(null);
        setEditingNoteTitle('');
        setEditingNoteBody('');
      }
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '노트를 삭제하지 못했습니다.');
    }
  };

  const saveSelectedNote = async () => {
    if (!token || !selectedNote || !editingNoteTitle.trim()) {
      return;
    }

    setSavingSelectedNote(true);
    try {
      const updated = await flownoteApi.createNote(token, {
        id: selectedNote.id,
        title: editingNoteTitle.trim(),
        content: buildNoteContent(editingNoteBody),
        createdAt: selectedNote.createdAt,
        revision: selectedNote.revision,
      });
      setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
    } catch (error) {
      Alert.alert('Flownote', error instanceof Error ? error.message : '노트를 수정하지 못했습니다.');
    } finally {
      setSavingSelectedNote(false);
    }
  };

  if (!token) {
    return (
      <ThemedView style={styles.centeredScreen}>
        <ThemedText type="subtitle">로그인이 필요합니다</ThemedText>
        <ThemedText style={styles.muted}>Account 탭에서 Flownote 계정으로 로그인하세요.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Workspace
          </ThemedText>
          <ThemedText style={styles.muted}>{user?.nickname ?? 'Flownote'}의 작업과 노트</ThemedText>
        </View>

        <View style={styles.quickGrid}>
          <Pressable style={styles.featureCard} onPress={() => router.push('/agent' as never)}>
            <ThemedText type="defaultSemiBold" style={styles.featureTitle}>
              Agent
            </ThemedText>
            <ThemedText style={styles.featureText}>문서 맥락 기반 AI 도구 열기</ThemedText>
          </Pressable>
          <Pressable style={styles.featureCard} onPress={() => router.push('/canvas' as never)}>
            <ThemedText type="defaultSemiBold" style={styles.featureTitle}>
              Canvas
            </ThemedText>
            <ThemedText style={styles.featureText}>아이디어 캔버스 열기</ThemedText>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <ThemedText type="subtitle" style={styles.panelTitle}>작업</ThemedText>
          <View style={styles.formRow}>
            <TextInput
              placeholder="새 작업"
              placeholderTextColor="#7C8794"
              style={styles.input}
              value={taskName}
              onChangeText={setTaskName}
            />
            <Pressable style={styles.addButton} onPress={createTask} disabled={savingTask}>
              {savingTask ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText type="defaultSemiBold" style={styles.addButtonText}>
                  추가
                </ThemedText>
              )}
            </Pressable>
          </View>
          {tasks.length === 0 ? (
            <ThemedText style={styles.muted}>등록된 작업이 없습니다.</ThemedText>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.itemCard}>
                <Pressable style={styles.checkButton} onPress={() => toggleTask(task)}>
                  <View style={[styles.check, task.status === 'DONE' && styles.checkActive]} />
                </Pressable>
                <View style={styles.itemText}>
                  <TextInput
                    placeholder="작업 제목"
                    placeholderTextColor="#7C8794"
                    style={styles.inlineInput}
                    value={task.taskName}
                    onChangeText={(value) => changeTaskLocal(task.id, { taskName: value })}
                    onEndEditing={(event) =>
                      saveTaskPatch(task.id, { taskName: event.nativeEvent.text })
                    }
                  />
                  <View style={styles.metaRow}>
                    <Pressable style={styles.statusPill} onPress={() => toggleTask(task)}>
                      <ThemedText type="defaultSemiBold" style={styles.statusText}>
                        {task.status ?? 'TODO'}
                      </ThemedText>
                    </Pressable>
                    <TextInput
                      placeholder="카테고리"
                      placeholderTextColor="#7C8794"
                      style={styles.categoryInput}
                      value={task.category ?? ''}
                      onChangeText={(value) => changeTaskLocal(task.id, { category: value })}
                      onEndEditing={(event) =>
                        saveTaskPatch(task.id, { category: event.nativeEvent.text })
                      }
                    />
                  </View>
                </View>
                <Pressable style={styles.deleteButton} onPress={() => deleteTask(task)}>
                  <ThemedText type="defaultSemiBold" style={styles.deleteButtonText}>
                    삭제
                  </ThemedText>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <View style={styles.panel}>
          <ThemedText type="subtitle" style={styles.panelTitle}>노트</ThemedText>
          <TextInput
            placeholder="노트 제목"
            placeholderTextColor="#7C8794"
            style={styles.input}
            value={noteTitle}
            onChangeText={setNoteTitle}
          />
          <TextInput
            multiline
            placeholder="내용"
            placeholderTextColor="#7C8794"
            style={[styles.input, styles.textArea]}
            value={noteBody}
            onChangeText={setNoteBody}
          />
          <Pressable style={styles.fullButton} onPress={createNote} disabled={savingNote}>
            {savingNote ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText type="defaultSemiBold" style={styles.addButtonText}>
                새 노트 저장
              </ThemedText>
            )}
          </Pressable>
          {notes.length === 0 ? (
            <ThemedText style={styles.muted}>등록된 노트가 없습니다.</ThemedText>
          ) : (
            notes.map((note) => (
              <View key={note.id} style={styles.itemCard}>
                <Pressable style={styles.itemMain} onPress={() => setSelectedNoteId(note.id)}>
                  <View style={styles.itemText}>
                    <ThemedText type="defaultSemiBold" style={styles.itemTitle}>
                      {note.title || '제목 없음'}
                    </ThemedText>
                    <ThemedText style={styles.itemMeta}>
                      {formatDate(note.updatedAt || note.createdAt)}
                    </ThemedText>
                    <ThemedText style={styles.notePreview} numberOfLines={2}>
                      {getNoteText(note.content) || '내용 없음'}
                    </ThemedText>
                  </View>
                </Pressable>
                <Pressable style={styles.deleteButton} onPress={() => deleteNote(note)}>
                  <ThemedText type="defaultSemiBold" style={styles.deleteButtonText}>
                    삭제
                  </ThemedText>
                </Pressable>
              </View>
            ))
          )}
          {selectedNote ? (
            <View style={styles.editorPanel}>
              <ThemedText type="defaultSemiBold" style={styles.panelTitle}>
                선택한 노트 보기/수정
              </ThemedText>
              <TextInput
                placeholder="노트 제목"
                placeholderTextColor="#7C8794"
                style={styles.input}
                value={editingNoteTitle}
                onChangeText={setEditingNoteTitle}
              />
              <TextInput
                multiline
                placeholder="노트 내용"
                placeholderTextColor="#7C8794"
                style={[styles.input, styles.editorTextArea]}
                value={editingNoteBody}
                onChangeText={setEditingNoteBody}
              />
              <Pressable
                style={styles.fullButton}
                onPress={saveSelectedNote}
                disabled={savingSelectedNote}>
                {savingSelectedNote ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText type="defaultSemiBold" style={styles.addButtonText}>
                    수정 저장
                  </ThemedText>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  content: {
    gap: 18,
    padding: 20,
    paddingTop: 64,
  },
  header: {
    gap: 6,
  },
  title: {
    color: '#143241',
  },
  panel: {
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1E6EA',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  panelTitle: {
    color: '#17212B',
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  featureCard: {
    flex: 1,
    gap: 6,
    minHeight: 86,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B9C7D1',
    backgroundColor: '#EAF3F7',
    padding: 14,
  },
  featureTitle: {
    color: '#123241',
    fontSize: 17,
  },
  featureText: {
    color: '#42505D',
    fontSize: 13,
    lineHeight: 18,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    minHeight: 48,
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CED8DF',
    backgroundColor: '#FFFFFF',
    color: '#17212B',
    fontSize: 16,
    paddingHorizontal: 12,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  addButton: {
    minWidth: 72,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#176B87',
    paddingHorizontal: 14,
  },
  fullButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#176B87',
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: '#FFFFFF',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8EEF2',
    backgroundColor: '#F8FAFB',
    padding: 12,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#8D99A6',
  },
  checkActive: {
    borderColor: '#1E7F57',
    backgroundColor: '#1E7F57',
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  inlineInput: {
    minHeight: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D7E0E7',
    backgroundColor: '#FFFFFF',
    color: '#17212B',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#DDEEF4',
    paddingHorizontal: 12,
  },
  statusText: {
    color: '#155E75',
    fontSize: 12,
  },
  categoryInput: {
    minHeight: 34,
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D7E0E7',
    backgroundColor: '#FFFFFF',
    color: '#475467',
    fontSize: 14,
    paddingHorizontal: 10,
  },
  itemTitle: {
    color: '#17212B',
  },
  itemMeta: {
    color: '#475467',
  },
  notePreview: {
    color: '#667085',
    lineHeight: 20,
  },
  editorPanel: {
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B9C7D1',
    backgroundColor: '#F3F8FA',
    padding: 12,
  },
  editorTextArea: {
    minHeight: 140,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  deleteButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D92D20',
    paddingHorizontal: 12,
  },
  deleteButtonText: {
    color: '#B42318',
  },
  muted: {
    color: '#5C6670',
  },
});
