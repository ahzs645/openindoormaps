import { defineConfig } from "@playwright/test";
import base from "./playwright.pages.config";

export default defineConfig({
  ...base,
  testMatch: ["indoor-route-links.spec.ts", "progressive-visitor-flow.spec.ts"],
  workers: 1,
  use: {
    ...base.use,
    launchOptions: {
      ...base.use?.launchOptions,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
});
