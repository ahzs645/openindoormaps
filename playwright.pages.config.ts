import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "github-pages.spec.ts",
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:42175",
    launchOptions: {
      ...base.use.launchOptions,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command:
      "npx vite preview --mode pages --host 127.0.0.1 --port 42175 --strictPort",
    url: `http://127.0.0.1:42175${process.env.PAGES_BASE_PATH ?? "/openindoormaps/"}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
