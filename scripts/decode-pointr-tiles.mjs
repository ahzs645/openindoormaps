/* eslint-env node */
/**
 * Decodes the Pointr Harrods vector tiles (z18) into one GeoJSON file for
 * scripts/port-pointr-harrods.py (stairs/escalator/elevator shafts, walls).
 *
 *   node scripts/decode-pointr-tiles.mjs [--fetch <pointr.har>]
 *
 * --fetch reads the tileset metadata the Pointr viewer requested (captured in
 * the HAR), including its tile URL template, and downloads the z18 tiles that
 * cover the site bounds. The template carries the viewer's read token, so it
 * is only read at run time and never written into the repo.
 *
 * Tiles and output live in the reference captures folder:
 * <OIM_REFERENCE_DIR>/v9.pointr.express/harrods-tiles/{z18/*.pbf,tiles-z18.geojson}
 */
import { VectorTile } from "@mapbox/vector-tile";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import Pbf from "pbf";

const ZOOM = 18;
const referenceRoot =
  process.env.OIM_REFERENCE_DIR ??
  join(homedir(), "Downloads", "Indoor Map", "indoor map references");
const dir = join(referenceRoot, "v9.pointr.express", "harrods-tiles");
const tileDir = join(dir, `z${ZOOM}`);

function tileOf(lon, lat) {
  const n = 2 ** ZOOM;
  const rad = (lat * Math.PI) / 180;
  return [
    Math.floor(((lon + 180) / 360) * n),
    Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
    ),
  ];
}

async function fetchTiles(harPath) {
  const entries = JSON.parse(readFileSync(harPath, "utf8")).log.entries;
  const entry = entries.find((e) =>
    /\/mbtiler\/.*\/tiles\/metadata\.json/.test(e.request.url),
  );
  if (!entry) throw new Error(`no Pointr tileset metadata in ${harPath}`);
  const metadata = JSON.parse(entry.response.content.text);
  const { tiles, ...rest } = metadata;
  mkdirSync(tileDir, { recursive: true });
  writeFileSync(join(dir, "metadata.json"), JSON.stringify(rest, null, 1));

  const [west, south, east, north] = metadata.bounds;
  const [x0, y0] = tileOf(west, north);
  const [x1, y1] = tileOf(east, south);
  let saved = 0;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const url = tiles[0]
        .replace("{z}", ZOOM)
        .replace("{x}", x)
        .replace("{y}", y);
      const response = await fetch(url);
      if (response.status === 404) continue; // empty tile, not stored
      if (!response.ok) throw new Error(`tile ${x}/${y}: ${response.status}`);
      writeFileSync(
        join(tileDir, `${x}_${y}.pbf`),
        Buffer.from(await response.arrayBuffer()),
      );
      saved++;
    }
  }
  console.log(`fetched ${saved} tiles (${x1 - x0 + 1}x${y1 - y0 + 1} range)`);
}

const fetchIndex = process.argv.indexOf("--fetch");
if (fetchIndex !== -1) await fetchTiles(process.argv[fetchIndex + 1]);
if (!existsSync(tileDir)) {
  throw new Error(`no tiles in ${tileDir}; run with --fetch <pointr.har>`);
}

const features = [];
for (const file of readdirSync(tileDir)) {
  if (!file.endsWith(".pbf")) continue;
  const [x, y] = file.replace(".pbf", "").split("_").map(Number);
  let buffer = readFileSync(join(tileDir, file));
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = gunzipSync(buffer);
  const tile = new VectorTile(new Pbf(buffer));
  for (const name of Object.keys(tile.layers)) {
    const layer = tile.layers[name];
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i).toGeoJSON(x, y, ZOOM);
      feature.properties = { ...feature.properties, _layer: name };
      features.push(feature);
    }
  }
}
writeFileSync(
  join(dir, `tiles-z${ZOOM}.geojson`),
  JSON.stringify({ type: "FeatureCollection", features }),
);
console.log(`decoded ${features.length} features`);
