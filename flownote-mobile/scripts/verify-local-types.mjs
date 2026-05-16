import { mkdtempSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = new URL('../', import.meta.url);
const serviceRoot = new URL('../../', import.meta.url);
const mobileTsc = new URL('node_modules/.bin/tsc', projectRoot);
const fallbackTsc = new URL('flownote/node_modules/.bin/tsc', serviceRoot);
const mobileTypes = new URL('node_modules/@types', projectRoot);
const fallbackTypes = new URL('flownote/node_modules/@types', serviceRoot);
const tsc = existsSync(mobileTsc) ? mobileTsc : fallbackTsc;
const typeRoots = [existsSync(mobileTypes) ? mobileTypes.pathname : fallbackTypes.pathname];
const tempDir = mkdtempSync(join(tmpdir(), 'flownote-mobile-tscheck.'));

const shimPath = join(tempDir, 'react-native.d.ts');
const configPath = join(tempDir, 'tsconfig.json');

writeFileSync(shimPath, `
declare module 'react-native' {
  import type { ComponentType } from 'react';
  export const ActivityIndicator: ComponentType<any>;
  export const BackHandler: { addEventListener(eventName: string, handler: () => boolean): { remove(): void } };
  export const FlatList: ComponentType<any>;
  export const KeyboardAvoidingView: ComponentType<any>;
  export const Platform: { OS: 'ios' | 'android' | 'web' | string };
  export const Pressable: ComponentType<any>;
  export const SafeAreaView: ComponentType<any>;
  export const ScrollView: ComponentType<any>;
  export const StyleSheet: { create<T extends Record<string, any>>(styles: T): T };
  export const Text: ComponentType<any>;
  export const TextInput: ComponentType<any>;
  export const View: ComponentType<any>;
}

declare module 'react-native-webview' {
  import { Component } from 'react';

  export type WebViewNavigation = {
    canGoBack: boolean;
  };

  export class WebView extends Component<any> {
    goBack(): void;
    reload(): void;
  }
}

declare module 'expo' {
  import type { ComponentType } from 'react';
  export function registerRootComponent(component: ComponentType<any>): void;
}
`);

writeFileSync(configPath, JSON.stringify({
  compilerOptions: {
    strict: true,
    jsx: 'react-jsx',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    target: 'ES2022',
    noEmit: true,
    skipLibCheck: true,
    types: ['react'],
    typeRoots,
  },
  files: [shimPath],
  include: [
    new URL('App.tsx', projectRoot).pathname,
    new URL('src/**/*.ts', projectRoot).pathname,
    new URL('src/**/*.tsx', projectRoot).pathname,
  ],
}, null, 2));

const result = spawnSync(tsc.pathname, ['-p', configPath], { stdio: 'inherit' });

process.exitCode = result.status ?? 1;
