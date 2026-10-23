import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-cloud',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'https://flownote-react-staging.vercel.app',
    // Authentication credentials and document content must not enter trace artifacts.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'library-webkit', testMatch: ['textbook-library.spec.ts'], use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
    { name: 'ios-webkit', testMatch: ['ios-app.spec.ts', 'canvas-pdf-reader.spec.ts', 'device-only.spec.ts', 'native-pdf-export.spec.ts'], use: {
      ...devices['iPad Pro 11'], browserName: 'webkit',
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FlownoteIOS/1.2.0',
    } },
  ],
});
