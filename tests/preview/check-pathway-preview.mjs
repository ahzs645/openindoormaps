/** Real browser inspection of an already exported preview. No routes are
 * calculated or qualified by this display check. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const [input, output, ...args] = process.argv.slice(2);
assert(
  input && output,
  "Usage: check-pathway-preview.mjs PREVIEW NEW-EVIDENCE [NATIVE-DOOR-ID...]",
);
assert(
  args.every((id) => /^\d+$/.test(id)),
  "Inspection IDs must be original numeric door IDs",
);
const root = path.resolve(input),
  out = path.resolve(output);
await mkdir(out, { recursive: false });
const rawManifest = await readFile(path.join(root, "data/index.json"));
const manifest = JSON.parse(rawManifest.toString());
assert.equal(manifest.format, "indoor-pathway-preview-v1");
const levels = new Map();
for (const meta of manifest.levels) {
  const raw = await readFile(path.join(root, "data", meta.url));
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    meta.sha256,
    `Changed level file ${meta.url}`,
  );
  levels.set(meta.id, JSON.parse(raw.toString()));
}
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const filename = path.resolve(
      root,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!filename.startsWith(root + path.sep))
      throw new Error("Outside preview root");
    const bytes = await readFile(filename);
    res.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
assert(address && typeof address !== "string");
let browser;
const checks = [],
  screenshots = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PREVIEW_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PREVIEW_CHROMIUM_EXECUTABLE }
      : {}),
  });
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 980 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.waitForFunction(
      () => document.querySelector("#level")?.options.length > 0,
    );
    const selectLevel = async (meta) => {
      await page.selectOption("#level", String(meta.id));
      const expectedLabel = `Native source pathway map · ${meta.name} · ${meta.elevationFeet} feet`;
      await page.waitForFunction(
        (label) =>
          document.querySelector("#map")?.getAttribute("aria-label") ===
            label &&
          !document.querySelector("#message").textContent.startsWith("Loading"),
        expectedLabel,
      );
    };
    const save = async (name) => {
      await page.screenshot({ path: path.join(out, name), fullPage: true });
      const bytes = await readFile(path.join(out, name));
      screenshots.push({
        file: name,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
      });
    };
    for (const meta of manifest.levels) {
      await selectLevel(meta);
      const value = levels.get(meta.id);
      const observed = await page.evaluate(() => ({
        rooms: document.querySelectorAll("#context .context-room").length,
        cells: document.querySelectorAll("#context .context-cell").length,
        network: document.querySelectorAll("#network [data-feature]").length,
        cellRings: [...document.querySelectorAll("#context .context-cell")].map(
          (cell) => ({
            count: (cell.getAttribute("d").match(/Z/g) ?? []).length,
            fill: cell.getAttribute("fill-rule"),
          }),
        ),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        view: document
          .querySelector("#map")
          .getAttribute("viewBox")
          .split(" ")
          .map(Number),
      }));
      const expectedNetwork =
        value.network.hallwayPaths.features.length +
        value.network.pathConnections.features.length +
        value.doorDiagnostics.length;
      assert.equal(observed.rooms, value.rooms.length);
      assert.equal(observed.cells, value.cells.length);
      assert.equal(observed.network, expectedNetwork);
      assert.deepEqual(
        observed.cellRings,
        value.cells.map((cell) => ({
          count: cell.ringsFeet.length,
          fill: "evenodd",
        })),
      );
      assert.equal(observed.horizontalOverflow, false);
      assert(observed.view.every(Number.isFinite));
      assert(observed.view[2] > 0 && observed.view[3] > 0);
      checks.push({
        device,
        levelId: meta.id,
        name: meta.name,
        rooms: observed.rooms,
        cells: observed.cells,
        networkFeatures: observed.network,
        originalRingCountsMatch: true,
        horizontalOverflow: false,
        status: "PASS",
      });
    }
    const overview =
      manifest.levels.find((meta) => meta.sharedGuideSegments > 0) ??
      manifest.levels.find((meta) => meta.sourceEdges > 0) ??
      manifest.levels[0];
    await selectLevel(overview);
    await save(`${device}-overview.png`);
    for (const nativeId of args.map(Number)) {
      const meta = manifest.levels.find((level) => {
        const value = levels.get(level.id);
        return (
          value.sourceEdges.some((edge) => edge.nativeElementId === nativeId) ||
          value.doorDiagnostics.some(
            (door) => door.nativeElementId === nativeId,
          )
        );
      });
      assert(meta, `No original doorway ${nativeId} exists in this export`);
      await selectLevel(meta);
      await page.fill("#edge", String(nativeId));
      await page.getByRole("button", { name: "Find", exact: true }).click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector("#details")
            .textContent.includes(`"nativeElementId": ${id}`),
        nativeId,
      );
      const detail = JSON.parse(await page.locator("#details").textContent());
      assert.equal(detail.display.nativeElementId, nativeId);
      assert.equal(detail.routeQualification, "not-performed-by-this-preview");
      if (detail.display.sourceDoorState)
        assert.equal(detail.display.routingEdgeCreated, false);
      await save(`${device}-door-${nativeId}.png`);
      if (meta.sharedGuideSegments > 0) {
        await page.selectOption("#mode", "guides");
        assert.equal(
          await page.locator("#network [data-feature]").count(),
          meta.sharedGuideSegments,
        );
        assert.equal(await page.locator("#selection").locator("*").count(), 0);
        await save(`${device}-door-${nativeId}-guides-only.png`);
        await page.selectOption("#mode", "complete");
      }
    }
    assert.deepEqual(errors, [], `${device} browser errors`);
    await page.close();
  }
  await writeFile(
    path.join(out, "browser-checks.json"),
    JSON.stringify(
      {
        format: "pathway-preview-browser-checks-v1",
        createdAt: new Date().toISOString(),
        manifestSha256: createHash("sha256").update(rawManifest).digest("hex"),
        browser: await browser.version(),
        sourceInputSha256: manifest.sourceInputSha256,
        implementationSha256: manifest.implementation.sha256 ?? null,
        checks,
        screenshots,
        pageErrors: [],
        routeAcceptancePerformed: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      levelViewportChecks: checks.length,
      screenshots: screenshots.length,
      output: out,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
