import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writePreparedDisplayEngineBinding } from "./scripts/indoor/prepared-display-engine-binding";
import { writePublishedRouteRuntimeBinding } from "./scripts/indoor/published-route-runtime-binding";
import { writePublishedVisitorPlanRuntimeBinding } from "./scripts/indoor/published-visitor-plan-runtime-binding";
import { visitorOfflineShellPlugin } from "./scripts/indoor/visitor-offline-shell-build";

function preparedDisplayBindingPlugin(): Plugin {
  let root = "";
  let dependencies = new Set<string>();
  const refresh = () => {
    const result = writePreparedDisplayEngineBinding(root);
    const routing = writePublishedRouteRuntimeBinding(root);
    const plans = writePublishedVisitorPlanRuntimeBinding(root);
    dependencies = new Set(
      [...result.modules, ...routing.modules, ...plans.modules].map(
        ([path]) => `${root}/${path}`,
      ),
    );
  };
  return {
    name: "prepared-native-display-engine-binding",
    configResolved(config) {
      root = config.root;
      refresh();
    },
    handleHotUpdate(context) {
      if (dependencies.has(context.file)) refresh();
    },
  };
}

function geojsonPlugin(): Plugin {
  return {
    name: "vite-plugin-geojson",
    transform(_, id) {
      if (id.endsWith(".geojson")) {
        const json = readFileSync(id, "utf8");
        return {
          code: `export default ${json}`,
          map: null,
        };
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  base:
    mode === "pages"
      ? (process.env.PAGES_BASE_PATH ?? "/openindoormaps/")
      : "/",
  plugins: [
    preparedDisplayBindingPlugin(),
    geojsonPlugin(),
    react(),
    visitorOfflineShellPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias:
      process.env.SITE_DEMOS === "hospital" ||
      process.env.SITE_DEMOS === "indoor"
        ? [
            {
              find: /^(?:~|\.\.)\/data\/locations$/,
              replacement: fileURLToPath(
                new URL(
                  process.env.SITE_DEMOS === "indoor"
                    ? "./app/data/indoor-locations.ts"
                    : "./app/data/hospital-locations.ts",
                  import.meta.url,
                ),
              ),
            },
          ]
        : [],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/maplibre-gl")) return "maplibre";
          if (id.includes("node_modules/@turf")) return "turf";
        },
      },
    },
  },
}));
