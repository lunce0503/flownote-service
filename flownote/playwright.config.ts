import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  // The shared mock server stores canvas and schedule scenarios in memory.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: isCi ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/mock-server.mjs",
      url: "http://127.0.0.1:4174/health",
      reuseExistingServer: !isCi,
    },
    {
      command: "VITE_CORE_API_URL=http://127.0.0.1:4174 VITE_API_BASE_URL=http://127.0.0.1:4174 VITE_API_BASE_URL2=http://127.0.0.1:4174 VITE_CANVAS_API_URL=http://127.0.0.1:4174 VITE_CANVAS_SOCKET_URL=http://127.0.0.1:4174 VITE_SYNC_API_URL= yarn dev --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173/login",
      reuseExistingServer: !isCi,
    },
  ],
});
