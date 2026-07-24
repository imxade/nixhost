import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "production-setup",
      testMatch: /setup\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:3000" },
    },
    {
      name: "ci-admin",
      testMatch: /ci-admin\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:3001" },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx tests/e2e/start-server.ts",
      url: "http://127.0.0.1:3000/api/setup/status",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm start:ci",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
