import { defineConfig } from "@playwright/test";
import base from "./playwright.native-area.config";
export default defineConfig({
  ...base,
  testMatch: [
    "indoor-outdoor-scope.spec.ts",
    "indoor-native-gap-review.spec.ts",
  ],
});
