import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm exec tsx tests/e2e/start-server.ts",
    url: "http://127.0.0.1:3000/api/setup/status",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
