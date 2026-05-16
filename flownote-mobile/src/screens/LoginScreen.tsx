import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type LoginScreenProps = {
  loading: boolean;
  error: string | null;
  onLogin: (email: string, password: string) => void;
};

const LoginScreen = ({ loading, error, onLogin }: LoginScreenProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.panel}>
          <Text style={styles.brand}>Flownote</Text>
          <Text style={styles.title}>모바일 지식관리</Text>
          <Text style={styles.description}>
            Spring WAS에서 앱 설정을 받아 기존 계정과 일정 데이터를 사용합니다.
          </Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="email"
            placeholderTextColor="#a8a29e"
            style={styles.input}
            value={email}
          />
          <TextInput
            onChangeText={setPassword}
            placeholder="password"
            placeholderTextColor="#a8a29e"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            disabled={loading}
            onPress={() => onLogin(email, password)}
            style={({ pressed }: { pressed: boolean }) => [
              styles.button,
              (pressed || loading) && styles.buttonPressed,
            ]}
          >
            {loading ? <ActivityIndicator color="#fffbeb" /> : <Text style={styles.buttonText}>Login</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1c1917',
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    backgroundColor: '#fef3c7',
    borderRadius: 14,
    padding: 20,
  },
  brand: {
    color: '#44403c',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#1c1917',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 8,
  },
  description: {
    color: '#57534e',
    fontSize: 14,
    marginBottom: 18,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    color: '#1c1917',
    fontSize: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
    marginBottom: 10,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#44403c',
    borderRadius: 8,
    padding: 14,
  },
  buttonPressed: {
    backgroundColor: '#57534e',
  },
  buttonText: {
    color: '#fffbeb',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default LoginScreen;
