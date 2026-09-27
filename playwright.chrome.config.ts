import base from "./playwright.config";

export default {
  ...base,
  projects: [
    {
      name: "chromium",
      use: { channel: "chrome" as const },
    },
  ],
};
