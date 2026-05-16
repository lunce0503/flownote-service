import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { loadMobileConfig } from './src/api/client';
import type { MobileConfig } from './src/types/api';

const MOBILE_APP_VERSION = '0.1.0';

const isVersionSupported = (currentVersion: string, minimumVersion: string) => {
  const current = currentVersion.split('.').map((part) => Number(part) || 0);
  const minimum = minimumVersion.split('.').map((part) => Number(part) || 0);
  const length = Math.max(current.length, minimum.length);

  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;

    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }

  return true;
};

type WebViewErrorEvent = {
  nativeEvent: {
    description: string;
  };
};

type WebViewHttpErrorEvent = {
  nativeEvent: {
    statusCode: number;
  };
};

const App = () => {
  const webViewRef = useRef<WebView>(null);
  const [config, setConfig] = useState<MobileConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    loadMobileConfig()
      .then(setConfig)
      .catch((error: Error) => setConfigError(error.message));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      webViewRef.current?.goBack();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [canGoBack]);

  const handleNavigationStateChange = (event: WebViewNavigation) => {
    setCanGoBack(event.canGoBack);
    if (webError) {
      setWebError(null);
    }
  };

  const reloadWebView = () => {
    setWebError(null);
    webViewRef.current?.reload();
  };

  if (!config && !configError) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fef3c7" />
      </View>
    );
  }

  if (configError || !config) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>모바일 설정을 불러오지 못했습니다.</Text>
        <Text style={styles.errorDetail}>{configError}</Text>
      </View>
    );
  }

  if (!config.enabled_features.includes('webview')) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>모바일 기능이 비활성화되었습니다.</Text>
        <Text style={styles.errorDetail}>WAS 설정에서 webview 기능을 활성화해야 합니다.</Text>
      </View>
    );
  }

  if (!isVersionSupported(MOBILE_APP_VERSION, config.minimum_supported_version)) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>앱 업데이트가 필요합니다.</Text>
        <Text style={styles.errorDetail}>
          현재 버전 {MOBILE_APP_VERSION} · 최소 지원 버전 {config.minimum_supported_version}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {webError ? (
        <View style={styles.center}>
          <Text style={styles.error}>웹 화면을 불러오지 못했습니다.</Text>
          <Text style={styles.errorDetail}>{webError}</Text>
          <Pressable style={styles.retryButton} onPress={reloadWebView}>
            <Text style={styles.retryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        source={{ uri: config.web_url }}
        style={[styles.webview, webError ? styles.hiddenWebview : null]}
        allowsBackForwardNavigationGestures
        domStorageEnabled
        javaScriptEnabled
        onError={(event: WebViewErrorEvent) => setWebError(event.nativeEvent.description)}
        onHttpError={(event: WebViewHttpErrorEvent) => {
          setWebError(`HTTP ${event.nativeEvent.statusCode}`);
        }}
        onNavigationStateChange={handleNavigationStateChange}
        pullToRefreshEnabled
        sharedCookiesEnabled
        startInLoadingState
        thirdPartyCookiesEnabled
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fef3c7" />
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1c1917',
    flex: 1,
  },
  webview: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  hiddenWebview: {
    height: 0,
    opacity: 0,
  },
  center: {
    alignItems: 'center',
    backgroundColor: '#1c1917',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    color: '#fecaca',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorDetail: {
    color: '#d6d3d1',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: '#1c1917',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  retryButton: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#1c1917',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default App;
