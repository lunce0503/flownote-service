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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
