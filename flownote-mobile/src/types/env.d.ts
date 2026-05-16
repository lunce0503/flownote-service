declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_WAS_URL?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
