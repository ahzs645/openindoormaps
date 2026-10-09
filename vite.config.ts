import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { writePreparedDisplayEngineBinding } from "./scripts/indoor/prepared-display-engine-binding";

function preparedDisplayBindingPlugin(): Plugin {
  let root = "";
  let dependencies = new Set<string>();
  const refresh = () => {
    const result = writePreparedDisplayEngineBinding(root);
    dependencies = new Set(result.modules.map(([path]) => `${root}/${path}`));
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
  plugins: [preparedDisplayBindingPlugin(), geojsonPlugin(), react()],
  resolve: {
    tsconfigPaths: true,
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
