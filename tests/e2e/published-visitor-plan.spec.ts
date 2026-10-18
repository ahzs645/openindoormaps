import { expect, test, type Page } from "@playwright/test";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Feature, Point } from "geojson";
import type {
  PublishedVisitorPlan,
  PublishedVisitorPlanReceipt,
} from "../../app/indoor-project/published-visitor-plan-types";
import { restorePublishedVisitorPlanDelta } from "../../app/indoor-project/published-visitor-plan-delta";
import {
  connectorSvg,
  type ConnectorKind,
} from "../../app/indoor-project/connector-markers";
import { PUBLISHED_VISITOR_PLAN_RECEIPTS } from "../../app/indoor-project/published-visitor-plan-receipts";
import type {
  ProgressiveManifest,
  ProgressiveShell,
} from "../../app/indoor-project/progressive-delivery";

import { progressivePlaceLabel } from "../../app/pages/progressive-instruction-preview";

const manifestUrl =
  process.env.PROGRESSIVE_PLAN_MANIFEST_URL ??
  process.env.PROGRESSIVE_MANIFEST_URL;
const appUrl =
  process.env.PROGRESSIVE_VISITOR_APP_URL ??
  "http://127.0.0.1:42554/openindoormaps/";
const ready = async (page: Page) => {
  await expect(page.locator(".visitor-map")).toHaveAttribute(
    "data-floor-plan",
    "true",
    { timeout: 180_000 },
  );
  await expect(page.getByTestId("visitor-render-status")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 180_000 },
  );
};
async function source() {
  const response = await fetch(manifestUrl!);
  expect(response.ok).toBe(true);
  const manifest: ProgressiveManifest = await response.json();
  const registry: readonly PublishedVisitorPlanReceipt[] = process.env
    .PROGRESSIVE_PLAN_RECEIPTS_FILE
    ? JSON.parse(
        readFileSync(process.env.PROGRESSIVE_PLAN_RECEIPTS_FILE, "utf8"),
      )
    : PUBLISHED_VISITOR_PLAN_RECEIPTS;
  const receipts = registry.filter(
    (receipt) => receipt.revisionSha256 === manifest.revisionSha256,
  );
  expect(
    receipts.length,
    "Run against the actual compiled plan registry and matching publication",
  ).toBe(manifest.scopes.length);
  await test.info().attach("actual-publication-binding", {
    contentType: "application/json",
    body: JSON.stringify({
      manifestUrl,
      revisionSha256: manifest.revisionSha256,
      provenance: manifest.provenance,
      compiledPlanScopes: receipts.map((receipt) => receipt.scopeId),
      physicalDevice: false,
      geometryOrAccessApproval: false,
    }),
  });
  const shellAsset = manifest.assets[manifest.shellAssetId];
  const shellRepresentation = shellAsset.representations.find(
    (entry) => entry.encoding === "gzip",
  )!;
  const shellResponse = await fetch(
    new URL(shellRepresentation.path, manifestUrl!),
  );
  const shellBuffer: ArrayBuffer = await shellResponse.arrayBuffer();
  const bytes = new Uint8Array(shellBuffer);
  const shell: ProgressiveShell = JSON.parse(
    new TextDecoder().decode(
      bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes,
    ),
  );
  const known = new Map(
    Object.values(manifest.assets).flatMap((asset) =>
      asset.representations.map(
        (representation) =>
          [
            new URL(representation.path, manifestUrl!).href,
            asset.kind,
          ] as const,
      ),
    ),
  );
  return { manifest, receipts, shell, known };
}
async function checkedPlan(
  scopeId: string,
  receipts: readonly PublishedVisitorPlanReceipt[],
): Promise<PublishedVisitorPlan> {
  const receipt = receipts.find((value) => value.scopeId === scopeId)!;
  expect(receipt).toBeTruthy();
  const response = await fetch(new URL(receipt.url, manifestUrl!));
  expect(response.ok).toBe(true);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha = (value: Uint8Array | string) =>
    createHash("sha256").update(value).digest("hex");
  const compressed = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (compressed) expect(sha(bytes)).toBe(receipt.compressedSha256);
  const logical = compressed ? gunzipSync(bytes) : bytes;
  expect(sha(logical)).toBe(
    receipt.delta?.logicalSha256 ?? receipt.logicalSha256,
  );
  const wire = JSON.parse(logical.toString());
  const plan: PublishedVisitorPlan = receipt.delta
    ? restorePublishedVisitorPlanDelta(
        wire,
        await checkedPlan(receipt.delta.baseScopeId, receipts),
        receipt.delta.baseLogicalSha256,
      )
    : wire;
  expect(sha(JSON.stringify(plan))).toBe(receipt.logicalSha256);
  return plan;
}
const planMarkers = (plan: PublishedVisitorPlan) =>
  plan.layers.connectors.features.filter(
    (feature): feature is Feature<Point> => feature.geometry.type === "Point",
  );
async function expectOriginalMarkers(page: Page, plan: PublishedVisitorPlan) {
  const expected = planMarkers(plan).map((feature) => {
    const p = feature.properties ?? {};
    return {
      name: String(p.name),
      title: String(p.name) + (p.review ? " · entrance needs review" : ""),
      review: String(!!p.review),
      kind: String(p.kind),
      roomKey: String(p.key ?? ""),
      stairElementId: String(p.stairElementId ?? ""),
      edgeId: String(p.id ?? ""),
      nativeElementId: String(p.nativeElementId ?? ""),
      svg: connectorSvg(p.kind as ConnectorKind),
    };
  });
  const overlay = page.getByTestId("project-connector-markers");
  await expect(overlay).toHaveCount(1);
  await expect(overlay.locator("button")).toHaveCount(expected.length);
  const actual = await overlay.locator("button").evaluateAll(
    (buttons, icons) =>
      buttons.map((button, index) => {
        const canonical = document.createElement("div");
        canonical.innerHTML = `<svg>${icons[index]}</svg>`;
        return {
          name: button.getAttribute("aria-label"),
          title: button.getAttribute("title"),
          review: button.dataset.review,
          kind: button.dataset.kind,
          roomKey: button.dataset.roomKey,
          stairElementId: button.dataset.stairElementId,
          edgeId: button.dataset.edgeId,
          nativeElementId: button.dataset.nativeElementId,
          svg:
            button.querySelector("svg")?.innerHTML ===
            canonical.querySelector("svg")?.innerHTML,
        };
      }),
    expected.map((value) => value.svg),
  );
  expect(actual).toEqual(expected.map((value) => ({ ...value, svg: true })));
}
async function locateNearMarker(
  page: Page,
  marker: Feature<Point>,
  shell: ProgressiveShell,
  levelIds: number[],
) {
  const [longitude, latitude] = marker.geometry.coordinates;
  const room = shell.records
    .filter(
      (record) =>
        record.key !== marker.properties?.key &&
        record.number.length >= 5 &&
        record.geographic &&
        levelIds.includes(record.levelId),
    )
    .sort((a, b) => {
      const distance = (record: typeof a) =>
        (record.geographic![0] - longitude) ** 2 *
          Math.cos((latitude * Math.PI) / 180) ** 2 +
        (record.geographic![1] - latitude) ** 2;
      return distance(a) - distance(b);
    })[0];
  expect(
    room,
    "Require a real nearby place to move the camera without inventing a marker arrival",
  ).toBeTruthy();
  await page.getByLabel("Find a place", { exact: true }).fill(room.number);
  await page
    .getByRole("button", { name: `${room.number} ${room.name}`, exact: true })
    .click();
  await ready(page);
  await expect(page.locator(".visitor-map")).toHaveAttribute(
    "data-zoom",
    "20.00",
  );
  return room;
}
async function canvasPixels(page: Page) {
  const png = await page.locator(".maplibregl-canvas").screenshot();
  return page.evaluate(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let painted = 0,
        mint = 0,
        blue = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.min(data[i], data[i + 1], data[i + 2]) < 230) painted++;
        if (data[i + 1] - data[i] > 8 && data[i + 1] - data[i + 2] > 3) mint++;
        if (
          data[i] < 120 &&
          data[i + 1] > 120 &&
          data[i + 2] > 180 &&
          data[i + 2] - data[i + 1] > 20
        )
          blue++;
      }
      return { painted, mint, blue, pixels: canvas.width * canvas.height };
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );
}

for (const mobile of [false, true])
  test(`actual compact plan paints, switches floors and reopens cached map on ${mobile ? "mobile viewport" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(
      !manifestUrl,
      "Supply a matching real compiled plan publication; synthetic or mock-only evidence is insufficient.",
    );
    test.setTimeout(900_000);
    const { manifest, receipts, known } = await source();
    const glyphResponses: { url: string; status: number }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/glyphs/"))
        glyphResponses.push({ url: response.url(), status: response.status() });
    });
    const requests: string[] = [],
      workers: string[] = [],
      errors: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "HEAD") requests.push(request.url());
    });
    page.on("worker", (worker) => workers.push(worker.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.addInitScript(() =>
      localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
    );
    await page.goto(
      `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
    );
    await ready(page);
    await expect
      .poll(
        () =>
          glyphResponses.filter((response) => response.status === 200).length,
      )
      .toBeGreaterThan(0);
    expect(glyphResponses.filter((response) => response.status >= 400)).toEqual(
      [],
    );
    await test.info().attach("actual-map-label-glyphs", {
      contentType: "application/json",
      body: JSON.stringify(glyphResponses),
    });
    const firstPixels = await canvasPixels(page);
    expect(
      firstPixels.painted / firstPixels.pixels,
      "A ready floor must contain visible paint",
    ).toBeGreaterThan(0.01);
    if (
      manifest.provenance.source.modelSha256 ===
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178"
    )
      expect(
        firstPixels.mint / firstPixels.pixels,
        "UNBC circulation must be visible",
      ).toBeGreaterThan(0.003);
    expect(
      requests.filter((url) =>
        ["prepared-chunk", "presentation-context", "routing"].includes(
          known.get(url) ?? "",
        ),
      ),
    ).toEqual([]);
    expect(
      workers.filter((url) =>
        /progressive-floor|floor-display|native-explore/.test(url),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath("compact-cold-painted.png"),
    });
    const second = [...receipts]
      .filter((receipt) => receipt.scopeId !== manifest.defaultScopeId)
      .sort((a, b) => a.compressedBytes - b.compressedBytes)[0];
    expect(second).toBeTruthy();
    await page
      .getByLabel("Floor", { exact: true })
      .selectOption(second.scopeId);
    await ready(page);
    expect(requests.includes(new URL(second.url, manifestUrl!).href)).toBe(
      true,
    );
    const shared = receipts.find((receipt) => receipt.delta);
    if (shared) {
      await page
        .getByLabel("Floor", { exact: true })
        .selectOption(shared.scopeId);
      await ready(page);
      expect(requests.includes(new URL(shared.url, manifestUrl!).href)).toBe(
        true,
      );
    }
    await page
      .getByLabel("Floor", { exact: true })
      .selectOption(manifest.defaultScopeId);
    await ready(page);
    expect(
      requests.filter((url) =>
        ["prepared-chunk", "presentation-context", "routing"].includes(
          known.get(url) ?? "",
        ),
      ),
    ).toEqual([]);
    // Map-data requests are unavailable; the already loaded app remains online.
    // This checks persistent map caching, not service-worker app installation.
    const mapDirectory = new URL(".", manifestUrl!).href;
    await page.route(`${mapDirectory}**`, (route) =>
      route.abort("internetdisconnected"),
    );
    const planUrls = new Set(
      receipts.map((receipt) => new URL(receipt.url, manifestUrl!).href),
    );
    for (const url of planUrls)
      await page.route(url, (route) => route.abort("internetdisconnected"));
    const beforeCachedOpen = requests.length;
    await page
      .getByRole("button", { name: "Open saved map", exact: true })
      .click();
    await ready(page);
    await expect(
      page.getByText("Using the saved map revision.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Floor", { exact: true })
      .selectOption(second.scopeId);
    await ready(page);
    if (shared) {
      await page
        .getByLabel("Floor", { exact: true })
        .selectOption(shared.scopeId);
      await ready(page);
    }
    await page.screenshot({
      path: test.info().outputPath("compact-cached-floor.png"),
    });
    expect(
      requests
        .slice(beforeCachedOpen)
        .filter(
          (url) => known.has(url) || planUrls.has(url) || url === manifestUrl,
        ),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

test("actual compact plan rejects a corrupt carrier and retries the checked floor", async ({
  page,
}) => {
  test.skip(!manifestUrl, "Supply a matching real compiled plan publication.");
  test.setTimeout(300_000);
  const { manifest, receipts, known } = await source();
  const receipt = receipts.find(
    (entry) => entry.scopeId === manifest.defaultScopeId,
  )!;
  let corrupt = true;
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.route(new URL(receipt.url, manifestUrl!).href, (route) =>
    corrupt
      ? route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: "invalid checked plan",
        })
      : route.continue(),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await expect(page.getByRole("alert")).toContainText("checksum", {
    timeout: 180_000,
  });
  await expect(page.locator(".visitor-map")).toHaveAttribute(
    "data-floor-plan",
    "false",
  );
  expect(
    requests.filter((url) =>
      ["prepared-chunk", "presentation-context"].includes(known.get(url) ?? ""),
    ),
  ).toEqual([]);
  corrupt = false;
  await page.getByRole("button", { name: "Retry floor", exact: true }).click();
  await ready(page);
});

test("actual selected-floor 3D retry retains the chosen journey", async ({
  page,
}) => {
  test.skip(
    !manifestUrl,
    "Supply a matching real compiled UNBC plan publication.",
  );
  test.setTimeout(600_000);
  const { manifest, receipts, shell } = await source();
  const full = receipts
    .filter((receipt) => !receipt.delta)
    .sort((a, b) => a.logicalBytes - b.logicalBytes)[0]!;
  const scope = manifest.scopes.find((value) => value.id === full.scopeId)!;
  const contextUrls = new Set(
    manifest.assets[scope.contextAssetId].representations.map(
      (representation) => new URL(representation.path, manifestUrl!).href,
    ),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  await page.getByLabel("Floor", { exact: true }).selectOption(scope.id);
  await ready(page);
  await page.getByText("Directions", { exact: true }).click();
  const start = shell.records.find((record) => record.number === "05-136")!;
  const end = shell.records.find((record) => record.number === "05-173")!;
  expect(start).toBeTruthy();
  expect(end).toBeTruthy();
  await page.getByLabel("From", { exact: true }).selectOption(start.key);
  await page.getByLabel("To", { exact: true }).selectOption(end.key);
  await page
    .getByLabel("Route preference", { exact: true })
    .selectOption("accessible");
  let blockedRequests = 0;
  const contextRequest = (url: URL) => contextUrls.has(url.href);
  await page.route(contextRequest, (request) => {
    blockedRequests++;
    return request.abort("failed");
  });
  await page.getByLabel("Map view", { exact: true }).selectOption("3d");
  const retry = page.getByRole("button", {
    name: "Retry selected floor",
    exact: true,
  });
  await expect(retry).toBeVisible({ timeout: 180_000 });
  expect(blockedRequests).toBeGreaterThan(0);
  await page.unroute(contextRequest);
  await retry.click();
  await expect(page.getByTestId("visitor-render-status")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 180_000 },
  );
  await expect(page.locator(".visitor-map")).toHaveAttribute(
    "data-floor-detail",
    "true",
  );
  await expect(page.getByLabel("Floor", { exact: true })).toHaveValue(scope.id);
  await expect(page.getByLabel("Map view", { exact: true })).toHaveValue("3d");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(start.key);
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(end.key);
  await expect(
    page.getByLabel("Route preference", { exact: true }),
  ).toHaveValue("accessible");
  await expect(retry).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("actual-small-floor-3d-retry.png"),
  });
  await test.info().attach("actual-selected-floor-retry", {
    contentType: "application/json",
    body: JSON.stringify({
      scopeId: scope.id,
      contextAssetId: scope.contextAssetId,
      blockedRequests,
      start: start.key,
      end: end.key,
      profile: "accessible",
      routeRequested: false,
      physicalDevice: false,
    }),
  });
  await page.getByLabel("Map view", { exact: true }).selectOption("2d");
  await ready(page);
  expect(errors).toEqual([]);
});

test("actual same-floor duplicate endpoints can be compared on the map without changing the journey", async ({
  page,
}) => {
  test.skip(
    !manifestUrl,
    "Supply a matching real compiled UNBC plan publication.",
  );
  test.setTimeout(360_000);
  const { shell, known, receipts } = await source();
  const first = shell.records.find(
    (record) => record.key === "landing:ramp:1586431:lower",
  )!;
  const second = shell.records.find(
    (record) => record.key === "landing:ramp:1587605:lower",
  )!;
  expect(first?.geographic).toBeTruthy();
  expect(second?.geographic).toBeTruthy();
  expect(first.geographic).not.toEqual(second.geographic);
  const label = "Native ramp lower approach · Building 04 · Floor 1";
  expect(progressivePlaceLabel(first, shell)).toBe(label);
  expect(progressivePlaceLabel(second, shell)).toBe(label);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  const scopeBefore = await page
    .getByLabel("Floor", { exact: true })
    .inputValue();
  await page.getByText("Directions", { exact: true }).click();
  await page.getByLabel("From", { exact: true }).selectOption(first.key);
  await page.getByLabel("To", { exact: true }).selectOption(second.key);
  await page
    .getByLabel("Route preference", { exact: true })
    .selectOption("accessible");
  const beforeFocus = requests.length;
  await page
    .getByRole("button", { name: "Show start on map", exact: true })
    .click();
  await ready(page);
  await expect(page.getByTestId("selected-place")).toHaveAttribute(
    "data-place-key",
    first.key,
  );
  await expect(page.getByTestId("selected-place-context")).toHaveText(
    "Building 04 · Floor 1",
  );
  await expect
    .poll(async () =>
      Number(await page.locator(".visitor-map").getAttribute("data-zoom")),
    )
    .toBeGreaterThanOrEqual(19.9);
  await page.screenshot({
    path: test.info().outputPath("duplicate-start-source-focus.png"),
  });
  await page
    .getByRole("button", { name: "Show destination on map", exact: true })
    .click();
  await ready(page);
  await expect(page.getByTestId("selected-place")).toHaveAttribute(
    "data-place-key",
    second.key,
  );
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(first.key);
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(second.key);
  await expect(
    page.getByLabel("Route preference", { exact: true }),
  ).toHaveValue("accessible");
  await expect(page.getByLabel("Floor", { exact: true })).toHaveValue(
    scopeBefore,
  );
  const planUrls = new Set(
    receipts.map((receipt) => new URL(receipt.url, manifestUrl!).href),
  );
  const unexpected = requests
    .slice(beforeFocus)
    .filter(
      (url) =>
        planUrls.has(url) ||
        [
          "overview",
          "presentation-context",
          "prepared-chunk",
          "routing",
        ].includes(known.get(url) ?? ""),
    );
  expect(unexpected).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath("duplicate-destination-source-focus.png"),
  });
  await test.info().attach("actual-duplicate-endpoint-map-comparison", {
    contentType: "application/json",
    body: JSON.stringify({
      originalLabel: label,
      first: { key: first.key, geographic: first.geographic },
      second: { key: second.key, geographic: second.geographic },
      retainedScopeId: scopeBefore,
      unexpectedRequests: unexpected,
      routeRequested: false,
      physicalDevice: false,
      geometryOrAccessApproval: false,
    }),
  });
});

test("actual compact neighboring room can be picked from the genuine plan", async ({
  page,
}) => {
  test.skip(
    !manifestUrl,
    "Supply a matching real compiled UNBC plan publication.",
  );
  test.setTimeout(1_200_000);
  const { shell } = await source();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  const start = shell.records.find(
    (record) =>
      record.number === (process.env.PROGRESSIVE_ROUTE_START ?? "05-136"),
  )!;
  const end = shell.records.find(
    (record) =>
      record.number === (process.env.PROGRESSIVE_ROUTE_END ?? "05-173"),
  )!;
  expect(start?.geographic).toBeTruthy();
  expect(end).toBeTruthy();
  await page.getByLabel("Find a place", { exact: true }).fill(start.number);
  await page
    .getByRole("button", {
      name: progressivePlaceLabel(start, shell),
      exact: true,
    })
    .click();
  await ready(page);
  await expect(page.locator(".visitor-map")).toHaveAttribute(
    "data-zoom",
    "20.00",
  );
  const bounds = (await page.locator(".maplibregl-canvas").boundingBox())!;
  const mercatorY = (latitude: number) =>
    (1 -
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / Math.PI) /
    2;
  const scale = 512 * 2 ** 20;
  const target = shell.records
    .flatMap((record) => {
      if (
        record.key === start.key ||
        !record.number ||
        !record.geographic ||
        record.levelId !== start.levelId ||
        record.circulation ||
        record.stair ||
        !record.walkable
      )
        return [];
      const dx = ((record.geographic[0] - start.geographic![0]) / 360) * scale;
      const dy =
        (mercatorY(record.geographic[1]) - mercatorY(start.geographic![1])) *
        scale;
      return Math.abs(dx) < bounds.width / 2 - 30 &&
        Math.abs(dy) < bounds.height / 2 - 30 &&
        Math.hypot(dx, dy) > 150
        ? [{ record, dx, dy }]
        : [];
    })
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))[0];
  expect(
    target,
    "Require a real neighboring room inside the camera for map picking",
  ).toBeTruthy();
  await page.locator(".maplibregl-canvas").click({
    position: {
      x: bounds.width / 2 + target.dx,
      y: bounds.height / 2 + target.dy,
    },
  });
  await expect
    .poll(async () => {
      const selected = await page.getByTestId("selected-place").textContent();
      const expected = `${target.record.number} ${target.record.name}`;
      if (selected?.includes(expected)) return true;
      const choicePanel = page.getByRole("region", {
        name: "Choose a place",
        exact: true,
      });
      const choices =
        (await choicePanel.count()) > 0 ? await choicePanel.textContent() : "";
      return `${selected} ${choices}`.includes(
        `${target.record.number} ${target.record.name}`,
      );
    })
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("compact-real-room-pick.png"),
  });
  expect(errors).toEqual([]);
});

test("actual compact explicit 3D round trip returns to the checked 2D floor", async ({
  page,
}) => {
  test.skip(
    !manifestUrl,
    "Supply a matching real compiled UNBC plan publication.",
  );
  test.setTimeout(900_000);
  const { manifest, receipts } = await source();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  const small = [...receipts]
    .filter((receipt) => receipt.scopeId !== manifest.defaultScopeId)
    .sort((a, b) => a.logicalBytes - b.logicalBytes)[0];
  await page.getByLabel("Floor", { exact: true }).selectOption(small.scopeId);
  await ready(page);
  await page.getByLabel("Map view", { exact: true }).selectOption("3d");
  await expect(page.locator(".visitor-map")).toHaveAttribute(
    "data-floor-plan",
    "false",
  );
  await expect(page.getByTestId("visitor-render-status")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 300_000 },
  );
  await page.getByLabel("Map view", { exact: true }).selectOption("2d");
  await ready(page);
  await page
    .getByLabel("Floor", { exact: true })
    .selectOption(manifest.defaultScopeId);
  await ready(page);
  await page.screenshot({
    path: test.info().outputPath("compact-after-3d.png"),
  });
  expect(errors).toEqual([]);
});

test("actual original connector markers preserve icons and honest picks without duplicate overlays", async ({
  page,
}) => {
  test.skip(
    !manifestUrl,
    "Supply a matching real compiled marker publication.",
  );
  test.setTimeout(1_200_000);
  const { manifest, receipts, shell, known } = await source();
  const plan = await checkedPlan(manifest.defaultScopeId, receipts);
  const markers = planMarkers(plan);
  if (
    manifest.provenance.source.modelSha256 ===
    "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178"
  )
    expect(markers).toHaveLength(48);
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  await expectOriginalMarkers(page, plan);
  const named = markers.find(
    (feature) =>
      feature.properties?.key &&
      shell.records.some((record) => record.key === feature.properties?.key),
  )!;
  expect(named).toBeTruthy();
  const room = shell.records.find(
    (record) => record.key === named.properties!.key,
  )!;
  await locateNearMarker(page, named, shell, plan.levelIds);
  const namedButton = page
    .getByTestId("project-connector-markers")
    .getByRole("button", { name: String(named.properties!.name), exact: true });
  await expect(namedButton).toBeVisible();
  await namedButton.click();
  await expect(page.getByTestId("selected-place")).toContainText(
    `${room.number} ${room.name}`,
  );
  await page.screenshot({
    path: test.info().outputPath("original-named-stair-picked.png"),
  });
  const notices: {
    id: string;
    selectedPlaceBefore: string | null;
    selectedPlaceAfter: string | null;
  }[] = [];
  for (const marker of [
    markers.find(
      (feature) =>
        !feature.properties?.key &&
        String(feature.properties?.id).startsWith("source-stair:"),
    ),
    markers.find(
      (feature) =>
        !feature.properties?.key &&
        String(feature.properties?.id).startsWith("connector:"),
    ),
  ]) {
    expect(
      marker,
      "Require an actual source-only stair and an actual edge-only connector",
    ).toBeTruthy();
    await locateNearMarker(page, marker!, shell, plan.levelIds);
    const before = await page.getByTestId("selected-place").textContent();
    const button = page
      .getByTestId("project-connector-markers")
      .locator(
        `button[data-edge-id=${JSON.stringify(String(marker!.properties!.id))}]`,
      );
    await expect(button).toBeVisible();
    await button.click();
    await expect(
      page.getByText(
        "Directions are unavailable for this connection. Choose a nearby room or entrance.",
        { exact: true },
      ),
    ).toBeVisible();
    const after = await page.getByTestId("selected-place").textContent();
    expect(after).toBe(before);
    notices.push({
      id: String(marker!.properties!.id),
      selectedPlaceBefore: before,
      selectedPlaceAfter: after,
    });
    await page
      .getByRole("button", { name: "Close notice", exact: true })
      .click();
    await expect(
      page.getByText(
        "Directions are unavailable for this connection. Choose a nearby room or entrance.",
        { exact: true },
      ),
    ).toHaveCount(0);
  }
  const small = [...receipts]
    .filter((receipt) => receipt.scopeId !== manifest.defaultScopeId)
    .sort((a, b) => a.logicalBytes - b.logicalBytes)[0];
  await page.getByLabel("Floor", { exact: true }).selectOption(small.scopeId);
  await ready(page);
  await page.getByLabel("Map view", { exact: true }).selectOption("3d");
  await expect(page.getByTestId("visitor-render-status")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 300_000 },
  );
  expect(
    await page.getByTestId("project-connector-markers").count(),
  ).toBeLessThanOrEqual(1);
  await page.getByLabel("Map view", { exact: true }).selectOption("2d");
  await ready(page);
  await page
    .getByLabel("Floor", { exact: true })
    .selectOption(manifest.defaultScopeId);
  await ready(page);
  await expectOriginalMarkers(page, plan);
  expect(requests.filter((url) => known.get(url) === "routing")).toEqual([]);
  expect(errors).toEqual([]);
  await test.info().attach("original-marker-source-and-click-proof", {
    contentType: "application/json",
    body: JSON.stringify({
      scopeId: plan.scopeId,
      markerCount: markers.length,
      namedPlaceKey: room.key,
      notices,
      physicalDevice: false,
      geometryOrAccessApproval: false,
    }),
  });
});

test("actual original connector styling keeps readable blue circular icons and a normal pick", async ({
  page,
}) => {
  test.skip(
    !manifestUrl,
    "Supply a matching real compiled marker publication.",
  );
  test.setTimeout(300_000);
  const { manifest, receipts, shell } = await source();
  const plan = await checkedPlan(manifest.defaultScopeId, receipts);
  const named = planMarkers(plan).find(
    (feature) =>
      feature.properties?.key &&
      shell.records.some((record) => record.key === feature.properties?.key),
  )!;
  expect(named).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  await expectOriginalMarkers(page, plan);
  await locateNearMarker(page, named, shell, plan.levelIds);
  const button = page
    .getByTestId("project-connector-markers")
    .getByRole("button", { name: String(named.properties!.name), exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS("background-color", "rgb(65, 103, 142)");
  await expect(button).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(button).toHaveCSS("border-radius", "50%");
  await expect(button).toHaveCSS("padding", "5px");
  const style = await button.evaluate((element) => {
    const style = getComputedStyle(element),
      icon = element.querySelector("svg")!.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      color: style.color,
      borderRadius: style.borderRadius,
      padding: style.padding,
      iconWidth: icon.width,
      iconHeight: icon.height,
    };
  });
  expect(style.iconWidth).toBeGreaterThan(12);
  expect(style.iconHeight).toBeGreaterThan(12);
  await button.click();
  const room = shell.records.find(
    (record) => record.key === named.properties!.key,
  )!;
  await expect(page.getByTestId("selected-place")).toContainText(
    `${room.number} ${room.name}`,
  );
  await page.screenshot({
    path: test.info().outputPath("original-blue-circular-marker.png"),
  });
  await test.info().attach("actual-original-marker-computed-style", {
    contentType: "application/json",
    body: JSON.stringify({
      roomKey: room.key,
      markerName: named.properties!.name,
      ...style,
      physicalDevice: false,
      geometryOrAccessApproval: false,
    }),
  });
});

test("actual complete map download reopens the app, glyphs and full/shared floors with all network offline", async ({
  page,
  context,
}) => {
  test.skip(!manifestUrl, "Supply a matching real compiled plan publication.");
  test.setTimeout(1_800_000);
  const { manifest, receipts, shell } = await source();
  const mainPlan = await checkedPlan(manifest.defaultScopeId, receipts);
  const full = [...receipts]
    .filter((receipt) => !receipt.delta)
    .sort((a, b) => a.logicalBytes - b.logicalBytes)[0];
  const shared =
    receipts.find(
      (receipt) => receipt.scopeId === manifest.defaultScopeId && receipt.delta,
    ) ?? receipts.find((receipt) => receipt.delta);
  expect(full, "Require an actual full floor carrier").toBeTruthy();
  expect(shared, "Require an actual shared floor carrier").toBeTruthy();
  const errors: string[] = [];
  const offlineGlyphs: {
    url: string;
    status: number;
    fromServiceWorker: boolean;
  }[] = [];
  let fullyOffline = false;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (fullyOffline && response.url().includes("/glyphs/"))
      offlineGlyphs.push({
        url: response.url(),
        status: response.status(),
        fromServiceWorker: response.fromServiceWorker(),
      });
  });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  await page
    .getByRole("button", {
      name: "Download complete map for offline use",
      exact: true,
    })
    .click();
  const completion = page.getByTestId("offline-status");
  await expect(completion).toContainText(
    "Complete map and app saved for offline use",
    {
      timeout: 1_200_000,
    },
  );
  const completionText = await completion.textContent();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), {
      timeout: 30_000,
    })
    .toBe(true);
  await context.setOffline(true);
  fullyOffline = true;
  const navigation = await page.reload({ waitUntil: "domcontentloaded" });
  expect(
    navigation?.fromServiceWorker(),
    "The cold app navigation must come from the saved app worker",
  ).toBe(true);
  await ready(page);
  await expect(
    page.getByText("Using the saved map revision.", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByLabel("Floor", { exact: true }).selectOption(full.scopeId);
  await ready(page);
  await page.getByLabel("Floor", { exact: true }).selectOption(shared!.scopeId);
  await ready(page);
  await expectOriginalMarkers(page, mainPlan);
  const named = planMarkers(mainPlan).find(
    (feature) =>
      feature.properties?.key &&
      shell.records.some((record) => record.key === feature.properties?.key),
  )!;
  expect(named).toBeTruthy();
  await locateNearMarker(page, named, shell, mainPlan.levelIds);
  await expect(
    page.getByTestId("project-connector-markers").getByRole("button", {
      name: String(named.properties!.name),
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        offlineGlyphs.filter(
          (response) => response.status === 200 && response.fromServiceWorker,
        ).length,
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThan(0);
  expect(offlineGlyphs.filter((response) => response.status >= 400)).toEqual(
    [],
  );
  const pixels = await canvasPixels(page);
  expect(pixels.painted / pixels.pixels).toBeGreaterThan(0.01);
  await page.screenshot({
    path: test.info().outputPath("complete-map-all-network-offline.png"),
  });
  await test.info().attach("complete-map-all-network-offline", {
    contentType: "application/json",
    body: JSON.stringify({
      completionText,
      navigatorOnline: false,
      navigationFromServiceWorker: navigation?.fromServiceWorker(),
      fullScopeId: full.scopeId,
      sharedScopeId: shared!.scopeId,
      sharedBaseScopeId: shared!.delta!.baseScopeId,
      offlineGlyphs,
      offlineMarkerCount: planMarkers(mainPlan).length,
      visibleOfflineNamedMarker: named.properties!.name,
      physicalDevice: false,
      geometryOrAccessApproval: false,
    }),
  });
  expect(errors).toEqual([]);
});

test("actual compact walking route remains visibly above the checked plan", async ({
  page,
}) => {
  test.skip(
    !manifestUrl,
    "Supply a matching real compiled UNBC plan publication.",
  );
  test.setTimeout(900_000);
  const { manifest, receipts, shell, known } = await source();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "true"),
  );
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  const start = shell.records.find(
    (r) => r.number === (process.env.PROGRESSIVE_ROUTE_START ?? "05-136"),
  )!;
  const end = shell.records.find(
    (r) => r.number === (process.env.PROGRESSIVE_ROUTE_END ?? "05-173"),
  )!;
  expect(start).toBeTruthy();
  expect(end).toBeTruthy();
  await page.getByLabel("Find a place", { exact: true }).fill(start.number);
  await page
    .getByRole("button", {
      name: progressivePlaceLabel(start, shell),
      exact: true,
    })
    .click();
  await ready(page);
  const beforeRoute = await canvasPixels(page);
  await page.getByText("Directions", { exact: true }).click();
  await page.getByLabel("From", { exact: true }).selectOption(start.key);
  await page.getByLabel("To", { exact: true }).selectOption(end.key);
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  await expect(page.getByTestId("route-status")).toHaveText(/^\d+ m$/, {
    timeout: 600_000,
  });
  await ready(page);
  await expect(page.getByTestId("route-unknown-access")).toBeVisible();
  const progress = page.getByTestId("route-step-progress");
  await expect(progress).toHaveText(/^Step 1 of \d+$/);
  await expect(page.getByTestId("current-instruction")).not.toBeEmpty();
  await expect(page.getByTestId("route-step-context")).not.toBeEmpty();
  await expect(
    page.getByText("Manual preview. Your position is not tracked.", {
      exact: true,
    }),
  ).toBeVisible();
  const previous = page.getByRole("button", {
    name: "Previous step",
    exact: true,
  });
  const next = page.getByRole("button", { name: "Next step", exact: true });
  // Check the actual post-result layout before any click can auto-scroll it.
  await expect(page.getByTestId("visitor-journey")).toHaveJSProperty(
    "open",
    false,
  );
  await expect(page.getByTestId("current-instruction")).toBeInViewport({
    ratio: 1,
  });
  await expect(previous).toBeInViewport({ ratio: 1 });
  await expect(next).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("instruction-warning-notice")).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    path: test
      .info()
      .outputPath("mobile-current-instruction-before-interaction.png"),
  });
  await test.info().attach("mobile-current-instruction-layout", {
    contentType: "application/json",
    body: JSON.stringify({
      viewport: page.viewportSize(),
      instruction: await page.getByTestId("current-instruction").boundingBox(),
      previous: await previous.boundingBox(),
      next: await next.boundingBox(),
      warning: await page
        .getByTestId("instruction-warning-notice")
        .boundingBox(),
      panel: await page.locator(".visitor-panel").boundingBox(),
      journeyCollapsed: true,
      noPostResultClickOrTestScroll: true,
      physicalDevice: false,
    }),
  });
  await expect(previous).toBeDisabled();
  expect((await previous.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const allSteps = page.getByTestId("visitor-all-steps");
  await expect(allSteps).toHaveJSProperty("open", false);
  const total = Number((await progress.textContent())!.match(/of (\d+)/)![1]);
  expect(total).toBeGreaterThan(1);
  if (total > 1) {
    const beforeStep = requests.length;
    const scopeBefore = await page
      .getByLabel("Floor", { exact: true })
      .inputValue();
    await next.click();
    await expect(progress).toHaveText(`Step 2 of ${total}`);
    await ready(page);
    const context = page.getByTestId("route-step-context");
    const scope = manifest.scopes.find((value) => value.id === scopeBefore)!;
    const level = Number(await context.getAttribute("data-level-id"));
    const building = await context.getAttribute("data-building");
    expect(scope.levelIds).toContain(level);
    expect(scope.building === "all" || scope.building === building).toBe(true);
    await expect(page.getByLabel("Floor", { exact: true })).toHaveValue(
      scopeBefore,
    );
    const planUrls = new Set(
      receipts.map((value) => new URL(value.url, manifestUrl!).href),
    );
    expect(
      requests
        .slice(beforeStep)
        .filter(
          (url) =>
            planUrls.has(url) ||
            ["overview", "prepared-chunk", "presentation-context"].includes(
              known.get(url) ?? "",
            ),
        ),
    ).toEqual([]);
    await previous.click();
    await expect(progress).toHaveText(`Step 1 of ${total}`);
    await ready(page);
  }
  await allSteps.locator("summary").click();
  await expect(allSteps.locator('button[aria-current="step"]')).toHaveCount(1);
  await allSteps.getByRole("button").first().click();
  await expect(progress).toHaveText(`Step 1 of ${total}`);
  await allSteps.locator("summary").click();
  await expect
    .poll(async () => (await canvasPixels(page)).blue, { timeout: 30_000 })
    .toBeGreaterThan(beforeRoute.blue + 20);
  await page.screenshot({
    path: test.info().outputPath("compact-actual-route.png"),
  });
  expect(errors).toEqual([]);
});
