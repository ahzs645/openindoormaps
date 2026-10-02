import base from "./playwright.chrome.config";
export default {
  ...base,
  outputDir: "node_modules/.cache/indoor-editor-tests",
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "node_modules/.cache/indoor-editor-test-report.json" },
    ],
  ] as const,
  use: { ...base.use, baseURL: "http://127.0.0.1:42175" },
  webServer: {
    ...base.webServer,
    url: "http://127.0.0.1:42175",
    command:
      "npm run dev -- --config vite.editor-test.config.ts --host 127.0.0.1 --port 42175 --strictPort",
  },
};
