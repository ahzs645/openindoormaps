import { defineConfig } from "@playwright/test";
import base from "./playwright.pages.config";
export default defineConfig({
  ...base,
  testMatch: [
    "indoor-native-area-review.spec.ts",
    "indoor-native-gap-review.spec.ts",
  ],
  workers: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:42402" },
  webServer: {
    command:
      "npx vite preview --mode pages --host 127.0.0.1 --port 42402 --strictPort",
    url: "http://127.0.0.1:42402/openindoormaps/",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
