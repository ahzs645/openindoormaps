import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "indoor-floor-navigation.spec.ts",
  workers: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:42177" },
  webServer: {
    command:
      "npx vite preview --mode pages --host 127.0.0.1 --port 42177 --strictPort",
    url: "http://127.0.0.1:42177/openindoormaps/",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
