import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "tests/e2e", timeout: 60_000, use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" }, webServer: { command: "pnpm dev --hostname 127.0.0.1 --port 3000", url: "http://127.0.0.1:3000/api/setup/status", reuseExistingServer: true, timeout: 120_000 } });
