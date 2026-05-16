import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import TaskCard from '../components/TaskCard';
import type { AuthUser, MobileConfig, Task } from '../types/api';

type HomeScreenProps = {
  config: MobileConfig;
  loading: boolean;
  taskError: string | null;
  tasks: Task[];
  user: AuthUser;
  onRefresh: () => void;
  onLogout: () => void;
};

const HomeScreen = ({ config, loading, taskError, tasks, user, onRefresh, onLogout }: HomeScreenProps) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Flownote</Text>
          <Text style={styles.greeting}>{user.nickname}</Text>
        </View>
        <Pressable onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>WAS</Text>
        <Text style={styles.statusUrl} numberOfLines={1}>
          {config.core_api_url}
        </Text>
      </View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>일정</Text>
        <Pressable onPress={onRefresh} style={styles.refreshButton}>
          <Text style={styles.refreshText}>새로고침</Text>
        </Pressable>
      </View>
      {taskError && <Text style={styles.errorText}>{taskError}</Text>}
      {loading ? (
        <ActivityIndicator color="#fef3c7" style={styles.loader} />
      ) : (
        <FlatList
          contentContainerStyle={tasks.length === 0 ? styles.emptyList : styles.list}
          data={tasks}
          keyExtractor={(item: Task) => item.id}
          ListEmptyComponent={<Text style={styles.emptyText}>표시할 일정이 없습니다.</Text>}
          renderItem={({ item }: { item: Task }) => <TaskCard task={item} />}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1c1917',
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingTop: 18,
  },
  brand: {
    color: '#fef3c7',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  greeting: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
  },
  logoutButton: {
    backgroundColor: '#44403c',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: {
    color: '#fffbeb',
    fontWeight: '800',
  },
  statusBar: {
    backgroundColor: '#292524',
    borderRadius: 10,
    marginBottom: 18,
    padding: 12,
  },
  statusText: {
    color: '#fef3c7',
    fontSize: 12,
    fontWeight: '900',
  },
  statusUrl: {
    color: '#d6d3d1',
    fontSize: 12,
    marginTop: 4,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  refreshButton: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  refreshText: {
    color: '#44403c',
    fontSize: 12,
    fontWeight: '900',
  },
  loader: {
    marginTop: 48,
  },
  list: {
    paddingBottom: 28,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    color: '#d6d3d1',
    textAlign: 'center',
  },
  errorText: {
    backgroundColor: '#7f1d1d',
    borderRadius: 8,
    color: '#fecaca',
    fontSize: 12,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});

export default HomeScreen;
