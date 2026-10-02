import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

// Editor round-trip tests import large local archives. Keep their module graph
// stable even when the workspace is being edited in another development tab.
export default defineConfig(
  mergeConfig(base, { server: { hmr: false, watch: { ignored: ["**/*"] } } }),
);
