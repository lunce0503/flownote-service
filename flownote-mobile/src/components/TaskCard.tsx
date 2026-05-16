import { StyleSheet, Text, View } from 'react-native';
import type { Task, TaskStatus } from '../types/api';

type TaskCardProps = {
  task: Task;
};

const statusLabel: Record<TaskStatus, string> = {
  TODO: '할 일',
  DOING: '진행 중',
  DONE: '완료',
};

const TaskCard = ({ task }: TaskCardProps) => {
  const tags = task.tags ?? [];
  const status = task.status ? statusLabel[task.status] : '상태 없음';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {task.task_name || '이름 없는 일정'}
        </Text>
        <Text style={styles.badge}>{status}</Text>
      </View>
      <Text style={styles.meta}>
        {task.due_date || '기한 없음'} · {task.estimated_minutes ?? 0}분
      </Text>
      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.slice(0, 4).map((tag) => (
            <Text key={tag} style={styles.tag}>
              #{tag}
            </Text>
          ))}
        </View>
      )}
      {task.memo && (
        <Text style={styles.memo} numberOfLines={1}>
          {task.memo}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 10,
    padding: 14,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  title: {
    color: '#1c1917',
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#44403c',
    borderRadius: 6,
    color: '#fffbeb',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  meta: {
    color: '#78716c',
    fontSize: 13,
    marginTop: 6,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    color: '#78350f',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  memo: {
    color: '#57534e',
    fontSize: 12,
    marginTop: 10,
  },
});

export default TaskCard;
