import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { publishedRouteAssetUrl } from "../../app/indoor-project/published-route-asset-url";
import { publishedDirectionsAsset } from "../../scripts/indoor/published-directions-asset";

const receipt = "/data/unbc-routing/checked.json.gz";
const manifest = "https://data.example.test/maps/unbc/manifest.json";

test("compiled directions assets follow the app mount, independent of the map manifest origin", () => {
  for (const base of ["/", "/openindoormaps/", "/maps/campus"])
    for (const page of [
      "index.html#/projects/visitor",
      "assets/route-worker.js",
    ])
      assert.equal(
        publishedRouteAssetUrl(receipt, manifest, {
          applicationBase: base,
          applicationUrl: `https://maps.example.test/openindoormaps/${page}`,
        }).href,
        `https://maps.example.test${base.replace(/\/$/, "")}${receipt}`,
      );
});

test("a bundled Pages build supplies the deployment prefix without a caller override", async () => {
  const result = await build({
    entryPoints: [
      fileURLToPath(
        new URL(
          "../../app/indoor-project/published-route-asset-url.ts",
          import.meta.url,
        ),
      ),
    ],
    bundle: true,
    format: "esm",
    write: false,
    define: { "import.meta.env.BASE_URL": JSON.stringify("/openindoormaps/") },
  });
  const bundled = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
  assert.equal(
    bundled.publishedRouteAssetUrl(
      receipt,
      "https://maps.example.test/openindoormaps/assets/route-worker.js",
    ).href,
    `https://maps.example.test/openindoormaps${receipt}`,
  );
});

test("absolute CDN receipts and manifest-relative receipts preserve their declared locations", () => {
  const options = {
    applicationBase: "/openindoormaps/",
    applicationUrl: "https://maps.example.test/openindoormaps/index.html",
  };
  for (const [value, expected] of [
    [
      "https://cdn.example.test/cache.gz?v=1",
      "https://cdn.example.test/cache.gz?v=1",
    ],
    ["//cdn.example.test/cache.gz", "https://cdn.example.test/cache.gz"],
    ["../checked.gz", "https://data.example.test/maps/checked.gz"],
    ["/shared-cache.gz", "https://data.example.test/shared-cache.gz"],
  ])
    assert.equal(
      publishedRouteAssetUrl(value, manifest, options).href,
      expected,
    );
});

test("publication gate maps the nested runtime URL to the checked artifact and refuses deployment escapes", () => {
  const publicRoot = path.resolve("work/test-public-root");
  for (const deployment of [
    "https://maps.example.test/",
    "https://maps.example.test/openindoormaps/",
  ]) {
    const found = publishedDirectionsAsset(receipt, publicRoot, deployment);
    assert.equal(found.url, deployment + receipt.slice(1));
    assert.equal(found.asset, path.join(publicRoot, receipt.slice(1)));
    assert.equal(found.deploymentUrl, deployment);
  }
  assert.equal(
    publishedDirectionsAsset(receipt, publicRoot).asset,
    path.join(publicRoot, receipt.slice(1)),
  );
  assert.equal(
    publishedDirectionsAsset(
      "https://cdn.example.test/map/data/checked.gz",
      publicRoot,
      "https://cdn.example.test/map/",
    ).asset,
    path.join(publicRoot, "data/checked.gz"),
  );
  for (const value of [
    "https://other.example.test/data/checked.gz",
    "/data/../../outside.gz",
    "/data/%2F..%2F..%2Foutside.gz",
  ])
    assert.throws(
      () =>
        publishedDirectionsAsset(
          value,
          publicRoot,
          "https://maps.example.test/openindoormaps/",
        ),
      /declared application deployment|declared publication root/,
    );
});
