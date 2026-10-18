import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "progressive-visitor.spec.ts",
    "progressive-visitor-flow.spec.ts",
    "published-visitor-plan.spec.ts",
  ],
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath:
        process.env.PROGRESSIVE_CHROMIUM_PATH ??
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox",
      ],
    },
  },
});
