import { defineConfig } from "@playwright/test";
import base from "./playwright.pages.config";

export default defineConfig({
  ...base,
  testMatch: ["indoor-enclosure-review.spec.ts"],
  workers: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:42401" },
  webServer: {
    command:
      "npx vite preview --mode pages --host 127.0.0.1 --port 42401 --strictPort",
    url: `http://127.0.0.1:42401${process.env.PAGES_BASE_PATH ?? "/openindoormaps/"}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
