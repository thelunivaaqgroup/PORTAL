import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    headless: true,
  },
  webServer: {
    command: "pnpm build && pnpm preview --port 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
