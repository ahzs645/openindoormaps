import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";

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

export default defineConfig({
  plugins: [geojsonPlugin(), react()],
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
});
