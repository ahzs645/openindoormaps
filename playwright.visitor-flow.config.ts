import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Run after build:pages; these cases use the real built worker with fixtures. */
export default defineConfig({
  ...base,
  testMatch: ["progressive-visitor-flow.spec.ts"],
  workers: 1,
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:42554/openindoormaps/",
    launchOptions: {
      ...base.use?.launchOptions,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command:
      "npx vite preview --mode pages --host 127.0.0.1 --port 42554 --strictPort",
    url: "http://127.0.0.1:42554/openindoormaps/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
