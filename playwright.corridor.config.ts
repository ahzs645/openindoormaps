import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "indoor-shared-corridors.spec.ts",
  workers: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:42176" },
  webServer: {
    command:
      "npx vite preview --mode pages --host 127.0.0.1 --port 42176 --strictPort",
    url: "http://127.0.0.1:42176/openindoormaps/",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
