import { PUBLISHED_ROUTE_RUNTIME_SHA256 } from "../../app/indoor-project/published-route-runtime-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { visitorRouteFailureMessage } from "../../app/indoor-project/visitor-route-state";
import type { RouteCase } from "../../scripts/indoor/pathway-candidate-audit";
import type { RouteCalculation } from "../../app/indoor-project/route-calculation";
import type { ProjectStep } from "../../app/indoor-project/navigation-steps";
import type { ProgressiveRouteSummary } from "../../app/indoor-project/progressive-route-summary";
import { expect, test, type Page, type Route } from "@playwright/test";
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
    .getByRole("button", {
      name: progressivePlaceLabel(room, shell),
      exact: true,
    })
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
  const completion = page.getByTestId("offline-status");
  // The first download must precede real app-worker registration. Blocking
  // service workers in the context would invalidate the later offline checks.
  expect(
    await page.evaluate(async () => ({
      controlled: !!navigator.serviceWorker.controller,
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
    })),
  ).toEqual({ controlled: false, registrations: 0 });
  const routingUrls = new Set(
    manifest.assets[manifest.routeAssetId].representations.flatMap(
      (representation) =>
        [
          representation.path,
          ...(representation.parts ?? []).map((part) => part.path),
        ].map((path) => new URL(path, manifestUrl!).href),
    ),
  );
  const isRouting = (url: URL) => routingUrls.has(url.href);
  let releaseRouting!: () => void;
  const routingHeld = new Promise<void>((resolve) => {
    releaseRouting = resolve;
  });
  let blockedRoutingRequests = 0;
  const holdRouting = async (route: Route) => {
    blockedRoutingRequests++;
    await routingHeld;
    // Pause aborts the real request. No substitute bytes/receipts are supplied.
    await route.continue().catch(() => {});
  };
  await page.route(isRouting, holdRouting);
  try {
    await page
      .getByRole("button", {
        name: "Download complete map for offline use",
        exact: true,
      })
      .click();
    await expect
      .poll(() => blockedRoutingRequests, { timeout: 180_000 })
      .toBeGreaterThan(0);
    await expect(completion).toHaveText(
      /^Downloading map: \d+ \/ \d+ map files saved\.$/,
    );
    await expect(completion).not.toContainText(
      "Complete map and app saved for offline use",
    );
    await page
      .getByRole("button", { name: "Pause download", exact: true })
      .click();
    await expect(completion).toHaveText(/^Download paused\./);
    await expect(
      page.getByRole("button", { name: "Resume map download", exact: true }),
    ).toBeEnabled();
  } finally {
    releaseRouting();
    await page.unroute(isRouting, holdRouting);
  }
  // Capture genuine rendered status mutations, so a short finishing state
  // cannot be missed between Playwright's polling intervals.
  const finishing = await page.evaluateHandle(() => {
    const observation = { seen: false };
    const capture = (records: MutationRecord[] = []) => {
      const texts = [
        document.querySelector('[data-testid="offline-status"]')?.textContent,
        ...records.flatMap((record) => [
          record.oldValue,
          ...Array.from(record.removedNodes, (node) => node.textContent),
        ]),
      ];
      if (
        texts.some((text) =>
          text?.trim().startsWith("Finishing offline setup."),
        )
      )
        observation.seen = true;
    };
    const observer = new MutationObserver(capture);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
    });
    capture();
    return { observation, observer };
  });
  try {
    await page
      .getByRole("button", { name: "Resume map download", exact: true })
      .click();
    await expect(completion).toContainText(
      "Complete map and app saved for offline use",
      { timeout: 1_200_000 },
    );
    expect(
      await finishing.evaluate(({ observation }) => observation.seen),
    ).toBe(true);
  } finally {
    await finishing.evaluate(({ observer }) => observer.disconnect());
    await finishing.dispose();
  }
  const completionText = await completion.textContent();
  const routingAsset = manifest.assets[manifest.routeAssetId];
  // Exercise the real persistent backend. Worker-only tests cannot establish
  // that a browser actually retained the full routing projection.
  const storedRouting = await page.evaluate(
    async ({ key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("openindoormaps-visitor-delivery-v1", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const record = await new Promise<{
          encoding: string;
          logicalBytes: number;
          bytes: ArrayBuffer;
        }>((resolve, reject) => {
          const request = db
            .transaction("assets")
            .objectStore("assets")
            .get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (!record || record.encoding !== "gzip")
          throw new Error("Persistent routing bytes are missing");
        const logical = await new Response(
          new Blob([record.bytes])
            .stream()
            .pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", logical);
        return {
          declaredLogicalBytes: record.logicalBytes,
          actualLogicalBytes: logical.byteLength,
          storedBytes: record.bytes.byteLength,
          actualLogicalSha256: [...new Uint8Array(digest)]
            .map((value) => value.toString(16).padStart(2, "0"))
            .join(""),
        };
      } finally {
        db.close();
      }
    },
    { key: routingAsset.logicalSha256 },
  );
  expect(storedRouting.declaredLogicalBytes).toBe(routingAsset.logicalBytes);
  expect(storedRouting.actualLogicalBytes).toBe(routingAsset.logicalBytes);
  expect(storedRouting.actualLogicalSha256).toBe(routingAsset.logicalSha256);
  expect(storedRouting.storedBytes).toBeGreaterThan(0);
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
      storedRouting,
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
  const start = shell.records.find(
    (record) =>
      record.number === (process.env.PROGRESSIVE_ROUTE_START ?? "05-136"),
  )!;
  const end = shell.records.find(
    (record) =>
      record.number === (process.env.PROGRESSIVE_ROUTE_END ?? "05-173"),
  )!;
  expect(start).toBeTruthy();
  expect(end).toBeTruthy();
  await page.getByText("Directions", { exact: true }).click();
  await page.getByLabel("From", { exact: true }).selectOption(start.key);
  await page.getByLabel("To", { exact: true }).selectOption(end.key);
  const offlineRouteStarted = Date.now();
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  await expect(page.getByTestId("route-status")).toHaveText(/^\d+ m$/, {
    timeout: 600_000,
  });
  await ready(page);
  await expect(page.getByTestId("route-unknown-access")).toBeVisible();
  await expect(page.getByTestId("current-instruction")).not.toBeEmpty();
  await test
    .info()
    .attach("actual-offline-directions-from-persistent-routing", {
      contentType: "application/json",
      body: JSON.stringify({
        storedRouting,
        route: await page.getByTestId("route-status").textContent(),
        elapsedMs: Date.now() - offlineRouteStarted,
        navigatorOnline: await page.evaluate(() => navigator.onLine),
        appReloadedBeforeDirections: true,
        browserNetworkDisabled: true,
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
  // Require a genuine published room/name/floor combination, not a mocked
  // shell or the search implementation itself as an oracle.
  const searchPlace = shell.records.find(
    (record) =>
      record.number.trim().length >= 5 &&
      /[A-Za-z]{3,}/.test(record.name) &&
      shell.nativeLevels.some(
        (level) => level.id === record.levelId && level.name,
      ) &&
      shell.records.filter((other) => other.number === record.number).length ===
        1,
  )!;
  expect(
    searchPlace,
    "Require a unique numbered place with actual name/floor metadata",
  ).toBeTruthy();
  const searchFloor = shell.nativeLevels.find(
    (level) => level.id === searchPlace.levelId,
  )!;
  const nameWord = searchPlace.name.match(/[A-Za-z]{3,}/)![0];
  const search = page.getByLabel("Find a place", { exact: true });
  await search.fill(searchPlace.number);
  await expect(page.locator(".visitor-search button").first()).toHaveText(
    progressivePlaceLabel(searchPlace, shell),
  );
  await search.fill(
    `  ${searchPlace.number}  ${nameWord}  ${searchFloor.name}  `,
  );
  const combinedMatch = page.locator(".visitor-search button").first();
  await expect(combinedMatch).toContainText(searchPlace.number);
  await expect(combinedMatch).toContainText(new RegExp(nameWord, "i"));
  await expect(combinedMatch).toContainText(searchFloor.name);
  await search.fill("   ");
  await expect(page.locator(".visitor-search")).toHaveCount(0);
  await search.fill(start.number);
  await page
    .getByRole("button", {
      name: progressivePlaceLabel(start, shell),
      exact: true,
    })
    .click();
  await ready(page);
  const beforeRoute = await canvasPixels(page);
  await page.getByText("Directions", { exact: true }).click();
  const journey = page.getByTestId("visitor-journey");
  await expect(
    journey.getByText(/Choose a room or entrance you can identify/),
  ).toBeVisible();
  await expect(
    journey.getByText(
      /Your position is not tracked; you advance the directions yourself/,
    ),
  ).toBeVisible();
  await expect(page.getByTestId("current-instruction")).toHaveCount(0);
  const from = page.getByLabel("From", { exact: true });
  const to = page.getByLabel("To", { exact: true });
  const availableKeys = await from
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
  const unknown = shell.records.find(
    (record) =>
      record.access === "unknown" && availableKeys.includes(record.key),
  )!;
  expect(
    unknown,
    "Require an actual selectable endpoint with unconfirmed access",
  ).toBeTruthy();
  const accessNotice = page.getByTestId("journey-unknown-endpoint-access");
  // Exercise explicit empty choices rather than depend on defaults/deep links
  // or whether locating a place selected an endpoint.
  await from.selectOption("");
  await to.selectOption("");
  await expect(from).toHaveValue("");
  await expect(to).toHaveValue("");
  await expect(accessNotice).toHaveCount(0);
  await from.selectOption(unknown.key);
  await expect(accessNotice).toContainText("starting place");
  await to.selectOption(unknown.key);
  await expect(accessNotice).toContainText("starting place and destination");
  await expect(page.getByTestId("current-instruction")).toHaveCount(0);
  // Restore the existing physical route fixture before its unchanged replay.
  await from.selectOption(start.key);
  await to.selectOption(end.key);
  const firstDirectionsStarted = Date.now();
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  await expect(page.getByTestId("route-status")).toHaveText(/^\d+ m$/, {
    timeout: 600_000,
  });
  const firstDirectionsElapsedMs = Date.now() - firstDirectionsStarted;
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
  await test.info().attach("actual-first-browser-directions", {
    contentType: "application/json",
    body: JSON.stringify({
      revisionSha256: manifest.revisionSha256,
      start: start.key,
      end: end.key,
      elapsedMs: firstDirectionsElapsedMs,
      freshBrowserContext: true,
      actualIndexedDbBackend: true,
      localHttpDelivery: true,
      cloudSoftwareRendering: true,
      physicalDevice: false,
      geometryOrAccessApproval: false,
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
  // Keep the original cold timing, layout, step and paint checks above intact.
  // Read the actual hash directly; no application URL helper is the oracle.
  const linkedUrl = page.url();
  const hash = new URL(linkedUrl).hash;
  expect(hash.split("?")[0]).toBe("#/projects/visitor");
  const linked = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
  expect(linked.get("manifest")).toBe(new URL(manifestUrl!).href);
  expect(linked.get("from")).toBe(start.key);
  expect(linked.get("to")).toBe(end.key);
  const preference = page.getByLabel("Route preference", { exact: true });
  await expect(preference).toHaveValue("public");
  // Walking is the canonical default: no stale step-free override may survive.
  expect(linked.get("profile")).toBeNull();
  expect(linked.get("accessible")).toBeNull();
  const firstRouteStatus = await page.getByTestId("route-status").textContent();
  const firstInstruction = await page
    .getByTestId("current-instruction")
    .textContent();
  const reloadStarted = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  const reloadElapsedMs = Date.now() - reloadStarted;
  await expect(from).toHaveValue(start.key);
  await expect(to).toHaveValue(end.key);
  await expect(preference).toHaveValue("public");
  expect(page.url()).toBe(linkedUrl);
  // The link restores choices, not a saved assertion that a route is valid.
  await expect(page.getByTestId("current-instruction")).toHaveCount(0);
  await expect(page.getByTestId("route-step-progress")).toHaveCount(0);
  const secondRouteStarted = Date.now();
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  await expect(page.getByTestId("route-status")).toHaveText(/^\d+ m$/, {
    timeout: 600_000,
  });
  const secondRouteElapsedMs = Date.now() - secondRouteStarted;
  await ready(page);
  await expect(page.getByTestId("route-status")).toHaveText(firstRouteStatus!);
  await expect(progress).toHaveText(`Step 1 of ${total}`);
  await expect(page.getByTestId("current-instruction")).toHaveText(
    firstInstruction!,
  );
  await expect(page.getByTestId("route-step-context")).not.toBeEmpty();
  await expect(page.getByTestId("route-unknown-access")).toBeVisible();
  await test.info().attach("actual-directions-link-reload-recalculation", {
    contentType: "application/json",
    body: JSON.stringify({
      revisionSha256: manifest.revisionSha256,
      linkedUrl,
      start: start.key,
      end: end.key,
      profile: "public",
      reloadElapsedMs,
      secondRouteElapsedMs,
      routeStatus: await page.getByTestId("route-status").textContent(),
      routeRecalculatedAfterReload: true,
      firstColdTimingRecordedSeparately: true,
      physicalDevice: false,
      geometryOrAccessApproval: false,
    }),
  });
  expect(errors).toEqual([]);
});

test("actual step-free preference refuses an unconfirmed ramp and clears the walking preview", async ({
  page,
}) => {
  test.skip(!manifestUrl, "Supply a matching real compiled UNBC publication.");
  test.setTimeout(600_000);
  const { shell } = await source();
  const startKey = "rm-311-86e02816d8fe";
  const endKey = "rm-1487816-1a09473066a2";
  expect(shell.records.some((record) => record.key === startKey)).toBe(true);
  expect(shell.records.some((record) => record.key === endKey)).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
  );
  await ready(page);
  await page.getByText("Directions", { exact: true }).click();
  await page.getByLabel("From", { exact: true }).selectOption(startKey);
  await page.getByLabel("To", { exact: true }).selectOption(endKey);
  await page
    .getByLabel("Route preference", { exact: true })
    .selectOption("public");
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  await expect(page.getByTestId("route-status")).toHaveText(/^\d+ m$/, {
    timeout: 300_000,
  });
  await ready(page);
  await expect(page.getByTestId("current-instruction")).not.toBeEmpty();
  await page.getByTestId("visitor-journey").locator("summary").click();
  await page
    .getByLabel("Route preference", { exact: true })
    .selectOption("accessible");
  await expect(page.getByTestId("current-instruction")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  await expect(page.getByTestId("route-status")).toHaveText(
    "No confirmed step-free route is available between these places.",
    { timeout: 300_000 },
  );
  await expect(
    page.getByLabel("Route preference", { exact: true }),
  ).toHaveValue("accessible");
  await expect(page.getByTestId("current-instruction")).toHaveCount(0);
  await expect(page.getByTestId("route-step-progress")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("actual-stepfree-refusal.png"),
  });
  await test.info().attach("actual-stepfree-refusal", {
    contentType: "application/json",
    body: JSON.stringify({
      startKey,
      endKey,
      walkingPreviewAvailable: true,
      selectedProfile: "accessible",
      confirmedStepFreeRouteAvailable: false,
      previousWalkingInstructionsCleared: true,
      physicalDevice: false,
      geometryOrAccessApproval: false,
    }),
  });
  expect(errors).toEqual([]);
});

// Opt-in after the fresh publisher/actual worker parity run, in a separate
// invocation from the unchanged first-cold Main/offline/step-free cases.
test("actual repaired 03/05/169 directions match fresh normal outputs on mobile", async ({
  page,
}) => {
  const normalDir = process.env.PROGRESSIVE_AFFECTED_NORMAL_DIR;
  const picksFile = process.env.PROGRESSIVE_AFFECTED_CASES_FILE;
  test.skip(
    !manifestUrl || !normalDir || !picksFile,
    "Pending fresh native publication, normal route outputs and explicit affected-case names.",
  );
  test.setTimeout(1_800_000);
  type Pick = {
    family: "03" | "05" | "169";
    direction: "forward" | "reverse";
    mode: "public" | "accessible";
    name: string;
  };
  type Presentation = {
    steps: ProjectStep[];
    summary: ProgressiveRouteSummary;
  };
  type Observed = {
    value: RouteCalculation;
    steps: ProjectStep[];
    summary: ProgressiveRouteSummary;
  };
  const { manifest, shell } = await source();
  const proofBytes = readFileSync(`${normalDir}/proof.json`);
  const proof = JSON.parse(proofBytes.toString());
  expect(proof.passed).toBe(true);
  expect(proof.normalPhysicalValidationRepeated).toBe(true);
  expect(proof.sourceDatasetUnchanged).toBe(true);
  expect(proof.datasetSha256).toBe(
    manifest.assets[manifest.routeAssetId].logicalSha256,
  );
  expect(proof.compiledTrustRootChanged).toBe(false);
  expect(proof.published).toBe(false);
  expect(proof.receipt.datasetSha256).toBe(proof.datasetSha256);
  expect(proof.runtimeSha256).toBe(PUBLISHED_ROUTE_RUNTIME_SHA256);
  expect(proof.receipt.runtimeSha256).toBe(PUBLISHED_ROUTE_RUNTIME_SHA256);
  expect(proof.engineSha256).toBe(PREPARED_DISPLAY_ENGINE_SHA256);
  expect(proof.receipt.engineSha256).toBe(PREPARED_DISPLAY_ENGINE_SHA256);
  expect(manifest.provenance.enginePreparationSha256).toBe(
    PREPARED_DISPLAY_ENGINE_SHA256,
  );
  expect(proof.receipt.source).toEqual(manifest.provenance.source);
  expect(shell.source).toEqual(manifest.provenance.source);
  await test.info().attach("actual-affected-source-and-normal-bindings", {
    contentType: "application/json",
    body: JSON.stringify({
      revisionSha256: manifest.revisionSha256,
      manifestUrl,
      source: manifest.provenance.source,
      shellSource: shell.source,
      normalReceiptSource: proof.receipt.source,
      proofSha256: createHash("sha256").update(proofBytes).digest("hex"),
      datasetSha256: proof.datasetSha256,
      engineSha256: proof.engineSha256,
      runtimeSha256: proof.runtimeSha256,
      routeCasesSha256: proof.routeCasesSha256,
      normalRouteResultsSha256: proof.normalRouteResultsSha256,
      normalProgressiveRouteResultsSha256:
        proof.normalProgressiveRouteResultsSha256,
      compiledTrustRootChanged: false,
      published: false,
      geometryOrVenueAccessApproval: false,
    }),
  });
  const readNormal = <T>(name: string, expectedSha: string): T => {
    const bytes = readFileSync(`${normalDir}/${name}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedSha);
    return JSON.parse(bytes.toString()) as T;
  };
  const cases = readNormal<RouteCase[]>(
    "route-cases.json",
    proof.routeCasesSha256,
  );
  const normal = readNormal<RouteCalculation[]>(
    "normal-route-results.json",
    proof.normalRouteResultsSha256,
  );
  const presentation = readNormal<Presentation[]>(
    "normal-progressive-route-results.json",
    proof.normalProgressiveRouteResultsSha256,
  );
  expect(normal).toHaveLength(cases.length);
  expect(presentation).toHaveLength(cases.length);
  const picks = JSON.parse(readFileSync(picksFile!, "utf8")) as Pick[];
  expect(new Set(picks.map((pick) => pick.name)).size).toBe(8);
  // Source-identity demands from the accepted original records/constructors;
  // they must be found in fresh output, never supplied as substitute routes.
  const identities = {
    "03": {
      room: "rm-694-504b25e5319a",
      partner: undefined,
      arrival: "arrival:door-derived:rm-694-504b25e5319a:908922",
      edge: "walk:door-derived:rm-694-504b25e5319a:908922",
      kind: "walk",
    },
    "05": {
      room: "rm-694-0bed6b73a3bd",
      partner: "rm-694-64382117d7ea",
      arrival: "arrival:stair-base-derived:rm-694-0bed6b73a3bd:1638837:1638854",
      edge: "walk:stair-base-derived:rm-694-0bed6b73a3bd:1638837:1638854",
      kind: "walk",
    },
    "169": {
      room: "rm-400176-561f2a7098b2",
      partner: "rm-402367-1fc9594ffaa7",
      arrival: undefined,
      edge: "stair:1696006:rm-400176-561f2a7098b2:rm-402367-1fc9594ffaa7",
      kind: "stairs",
    },
  };
  expect(
    picks.map((pick) => `${pick.family}/${pick.mode}/${pick.direction}`).sort(),
  ).toEqual(
    [
      "03/public/forward",
      "03/public/reverse",
      "05/public/forward",
      "05/public/reverse",
      "169/public/forward",
      "169/public/reverse",
      "169/accessible/forward",
      "169/accessible/reverse",
    ].sort(),
  );
  const selected = picks.map((pick) => {
    const matching = cases
      .map((value, i) => ({ value, i }))
      .filter(({ value }) => value.name === pick.name);
    expect(matching, pick.name).toHaveLength(1);
    const { value: c, i } = matching[0]!;
    expect(c.mode, pick.name).toBe(pick.mode);
    return { pick, c, expected: normal[i], shown: presentation[i] };
  });
  for (const family of ["03", "05", "169"] as const) {
    const forward = selected.find(
      ({ pick }) =>
        pick.family === family &&
        pick.mode === "public" &&
        pick.direction === "forward",
    )!;
    const reverse = selected.find(
      ({ pick }) =>
        pick.family === family &&
        pick.mode === "public" &&
        pick.direction === "reverse",
    )!;
    expect([reverse.c.start, reverse.c.end]).toEqual([
      forward.c.end,
      forward.c.start,
    ]);
    expect(forward.c.start).toBe(identities[family].room);
    if (identities[family].partner)
      expect(forward.c.end).toBe(identities[family].partner);
  }
  for (const row of selected.filter(({ pick }) => pick.mode === "accessible")) {
    const walking = selected.find(
      ({ pick }) =>
        pick.family === row.pick.family &&
        pick.mode === "public" &&
        pick.direction === row.pick.direction,
    )!;
    expect([row.c.start, row.c.end]).toEqual([walking.c.start, walking.c.end]);
  }
  const stairIds = [
    ...new Set(
      selected
        .filter(({ pick }) => pick.family === "169" && pick.mode === "public")
        .map(({ c }) => c.intendedEdgeId),
    ),
  ];
  expect(stairIds.every((id) => typeof id === "string" && id.length > 0)).toBe(
    true,
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  // Passive message observation only: original constructor, URL, options,
  // messages, listeners and calculation all run; nothing is fulfilled or mocked.
  await page.addInitScript(() => {
    const responses: unknown[] = [];
    Object.defineProperty(globalThis, "__affectedRouteResponses", {
      value: responses,
    });
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", ({ data }) => {
          if (
            data &&
            typeof data === "object" &&
            "value" in data &&
            "steps" in data
          )
            responses.push(data);
        });
      }
    };
  });
  for (const { pick, c, expected, shown } of selected) {
    const artifact = `${pick.family}-${pick.mode}-${pick.direction}`;
    expect(
      shell.records.filter((record) => record.key === c.start),
    ).toHaveLength(1);
    expect(shell.records.filter((record) => record.key === c.end)).toHaveLength(
      1,
    );
    if (c.mode === "public") {
      expect(c.expect).toBe("route");
      const identity = identities[pick.family];
      expect(c.intendedEdgeId).toBe(identity.edge);
      const edge = expected.route?.edges.find(
        (entry) => entry.id === identity.edge,
      );
      expect(edge).toMatchObject({
        id: identity.edge,
        kind: identity.kind,
        enabled: true,
      });
      if (pick.family === "169") expect(edge?.nativeElementId).toBe(1_696_006);
      else {
        expect(
          shell.records.find((record) => record.key === identity.room)
            ?.arrivalNodeId,
        ).toBe(identity.arrival);
        expect(edge?.to).toBe(identity.arrival);
        if (pick.family === "05")
          expect(edge?.from).toBe(
            shell.records.find(
              (record) => record.key === identities["05"].partner,
            )?.arrivalNodeId,
          );
      }
    } else {
      expect(
        c.forbiddenEdgeIds?.length,
        `${c.name}: source stair exclusion required`,
      ).toBeGreaterThan(0);
      for (const id of stairIds) expect(c.forbiddenEdgeIds).toContain(id);
    }
    if (expected.route) {
      expect(expected.route.nodeIds[0]).toBe(
        shell.records.find((record) => record.key === c.start)?.arrivalNodeId,
      );
      expect(expected.route.nodeIds.at(-1)).toBe(
        shell.records.find((record) => record.key === c.end)?.arrivalNodeId,
      );
    }
    const query = new URLSearchParams({
      manifest: new URL(manifestUrl!).href,
      from: c.start,
      to: c.end,
    });
    if (c.mode === "accessible") query.set("accessible", "1");
    await page.goto(`${appUrl}#/projects/visitor?${query}`);
    await ready(page);
    await expect(page.getByLabel("From", { exact: true })).toHaveValue(c.start);
    await expect(page.getByLabel("To", { exact: true })).toHaveValue(c.end);
    await expect(
      page.getByLabel("Route preference", { exact: true }),
    ).toHaveValue(c.mode);
    const linked = new URLSearchParams(new URL(page.url()).hash.split("?")[1]);
    expect(linked.get("manifest")).toBe(new URL(manifestUrl!).href);
    expect(linked.get("from")).toBe(c.start);
    expect(linked.get("to")).toBe(c.end);
    expect(linked.get("accessible")).toBe(c.mode === "accessible" ? "1" : null);
    await expect(
      page
        .getByTestId("visitor-journey")
        .getByText(/Your position is not tracked/),
    ).toBeVisible();
    const began = Date.now();
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (globalThis as unknown as { __affectedRouteResponses: unknown[] })
                .__affectedRouteResponses.length,
          ),
        { timeout: 600_000 },
      )
      .toBe(1);
    const actual = (await page.evaluate(
      () =>
        (globalThis as unknown as { __affectedRouteResponses: unknown[] })
          .__affectedRouteResponses[0],
    )) as Observed;
    expect(actual.value.route, c.name).toEqual(expected.route);
    expect(actual.value.diagnostic, c.name).toEqual(expected.diagnostic);
    expect(actual.steps, c.name).toEqual(shown.steps);
    expect(actual.summary, c.name).toEqual(shown.summary);
    const elapsedMs = Date.now() - began;
    const transitions: { step: number; levelId: number; scope: string }[] = [];
    if (expected.route) {
      const route = expected.route;
      for (const id of c.forbiddenEdgeIds ?? [])
        expect(actual.value.route!.edges.some((edge) => edge.id === id)).toBe(
          false,
        );
      await expect(page.getByTestId("route-status")).toHaveText(
        `${Math.round(route.distanceMetres)} m`,
      );
      expect(shown.steps.length).toBeGreaterThan(0);
      await expect(
        page.getByText("Manual preview. Your position is not tracked.", {
          exact: true,
        }),
      ).toBeVisible();
      await (route.unknownAccessAreas.length > 0
        ? expect(page.getByTestId("route-unknown-access")).toContainText(
            String(route.unknownAccessAreas.length),
          )
        : expect(page.getByTestId("route-unknown-access")).toHaveCount(0));
      await (route.unknownAccessibilityEdges
        ? expect(page.getByTestId("route-unknown-accessibility")).toContainText(
            String(route.unknownAccessibilityEdges),
          )
        : expect(page.getByTestId("route-unknown-accessibility")).toHaveCount(
            0,
          ));
      const next = page.getByRole("button", { name: "Next step", exact: true });
      const previous = page.getByRole("button", {
        name: "Previous step",
        exact: true,
      });
      for (const [i, step] of shown.steps.entries()) {
        await expect(page.getByTestId("route-step-progress")).toHaveText(
          `Step ${i + 1} of ${shown.steps.length}`,
        );
        await expect(page.getByTestId("current-instruction")).toHaveText(
          step.message,
        );
        await expect(page.getByTestId("route-step-context")).toHaveAttribute(
          "data-level-id",
          String(step.levelId),
        );
        await expect(page.getByTestId("route-step-context")).toHaveAttribute(
          "data-building",
          step.building,
        );
        await ready(page);
        const scopeId = await page
          .getByLabel("Floor", { exact: true })
          .inputValue();
        const scope = manifest.scopes.find((entry) => entry.id === scopeId)!;
        expect(scope.levelIds).toContain(step.levelId);
        expect(
          scope.building === "all" || scope.building === step.building,
        ).toBe(true);
        await expect(
          page.getByTestId("instruction-floor-unavailable"),
        ).toHaveCount(0);
        await expect(page.getByTestId("current-instruction")).toBeInViewport({
          ratio: 1,
        });
        await expect(previous).toBeInViewport({ ratio: 1 });
        await expect(next).toBeInViewport({ ratio: 1 });
        if (step.position || step.arrivalPosition)
          await expect(page.locator(".visitor-map")).toHaveAttribute(
            "data-zoom",
            "20.00",
          );
        if (
          i === 0 ||
          step.type === "floor-change" ||
          i === shown.steps.length - 1
        ) {
          await page.screenshot({
            path: test.info().outputPath(`${artifact}-controls-${i + 1}.png`),
          });
          const scroll = await page.evaluate(() => ({
            x: scrollX,
            y: scrollY,
          }));
          try {
            await expect
              .poll(async () => (await canvasPixels(page)).blue, {
                timeout: 30_000,
              })
              .toBeGreaterThan(0);
            await page.screenshot({
              path: test.info().outputPath(`${artifact}-map-${i + 1}.png`),
            });
          } finally {
            // Canvas screenshots can scroll the page; restore the actual
            // pre-measurement position before the next manual interaction.
            await page.evaluate(({ x, y }) => scrollTo(x, y), scroll);
          }
        }
        if (step.type === "floor-change")
          transitions.push({
            step: i + 1,
            levelId: step.levelId,
            scope: scopeId,
          });
        if (i < shown.steps.length - 1) await next.click();
      }
      await expect(next).toBeDisabled();
      if (shown.steps.length > 1) {
        await previous.click();
        await expect(page.getByTestId("current-instruction")).toHaveText(
          shown.steps.at(-2)!.message,
        );
      }
    } else {
      expect(c.mode).toBe("accessible");
      await expect(
        page.getByRole("button", { name: "Get directions", exact: true }),
      ).toBeEnabled();
      await expect(page.getByTestId("route-status")).toHaveText(
        visitorRouteFailureMessage(expected.diagnostic, c.mode, false),
      );
      await expect(page.getByTestId("current-instruction")).toHaveCount(0);
      expect(shown.steps).toEqual([]);
    }
    await test.info().attach(`actual-affected-${artifact}`, {
      contentType: "application/json",
      body: JSON.stringify({
        case: c,
        revisionSha256: manifest.revisionSha256,
        normalDatasetSha256: proof.datasetSha256,
        elapsedMs,
        transitions,
        actualWorkerMatchesNormal: true,
        screenshotsObserveCameraAndPaint: true,
        exactCameraCenterAsserted: false,
        physicalDevice: false,
        geometryOrVenueAccessApproval: false,
      }),
    });
  }
  expect(errors).toEqual([]);
});

// Entry navigation is a separate fresh context after the affected directions,
// so it does not consume any existing first-cold Main timing window.
test("actual root entry opens the published visitor map without query parameters", async ({
  page,
}) => {
  const rootUrl = process.env.PROGRESSIVE_ROOT_APP_URL;
  test.skip(
    !rootUrl || !manifestUrl,
    "Supply the actual query-free root and matching fresh publication.",
  );
  test.setTimeout(300_000);
  const root = new URL(rootUrl!);
  expect(root.search).toBe("");
  expect(root.hash).toBe("");
  expect(root.pathname.endsWith("/")).toBe(true);
  const { manifest, shell } = await source();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(root.href);
  const primary = page.getByRole("link", { name: "Find a place", exact: true });
  await expect(primary).toBeVisible();
  await expect(primary).toBeInViewport({ ratio: 1 });
  const href = await primary.getAttribute("href");
  expect(href).toBeTruthy();
  // Discover the destination from the real rendered link, not the manifest env.
  const destination = new URL(href!, page.url());
  expect(destination.origin).toBe(root.origin);
  const routeAddress = (url: URL) =>
    url.hash.startsWith("#/") ? new URL(url.hash.slice(1), url.origin) : url;
  const target = routeAddress(destination);
  expect(target.pathname).toBe("/projects/visitor");
  expect([...target.searchParams.keys()]).toEqual(["manifest"]);
  expect(target.searchParams.get("manifest")).toBe("/data/unbc/manifest.json");
  const discoveredManifest = new URL(
    target.searchParams.get("manifest")!,
    destination,
  );
  // This comparison detects a stale welcome link; it does not supply its target.
  expect(discoveredManifest.href).toBe(new URL(manifestUrl!).href);
  const responsePromise = page.waitForResponse(
    (response) => response.url() === discoveredManifest.href,
    { timeout: 180_000 },
  );
  await primary.click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const manifestBytes = await response.body();
  const browserManifest = JSON.parse(
    manifestBytes.toString(),
  ) as ProgressiveManifest;
  expect(browserManifest).toEqual(manifest);
  expect(browserManifest.provenance.source).toEqual(shell.source);
  expect(browserManifest.provenance.enginePreparationSha256).toBe(
    PREPARED_DISPLAY_ENGINE_SHA256,
  );
  await ready(page);
  await expect(page.getByLabel("Floor", { exact: true })).toHaveValue(
    manifest.defaultScopeId,
  );
  const landed = routeAddress(new URL(page.url()));
  expect(landed.pathname).toBe(target.pathname);
  expect(landed.searchParams.get("manifest")).toBe(discoveredManifest.href);
  expect(landed.searchParams.get("from")).toBeNull();
  expect(landed.searchParams.get("to")).toBeNull();
  await expect(
    page.getByRole("heading", { name: "UNBC campus map", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Find a place", { exact: true })).toBeVisible();
  await expect(page.getByTestId("current-instruction")).toHaveCount(0);
  await page.getByText("Directions", { exact: true }).click();
  await expect(
    page
      .getByTestId("visitor-journey")
      .getByText(
        /Your position is not tracked; you advance the directions yourself/,
      ),
  ).toBeVisible();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("To", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Get directions", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("current-instruction")).toHaveCount(0);
  await test.info().attach("actual-root-primary-visitor-entry", {
    contentType: "application/json",
    body: JSON.stringify({
      rootUrl: root.href,
      actualPrimaryHref: href,
      destination: destination.href,
      landedUrl: page.url(),
      discoveredManifest: discoveredManifest.href,
      browserManifestSha256: createHash("sha256")
        .update(manifestBytes)
        .digest("hex"),
      revisionSha256: browserManifest.revisionSha256,
      source: browserManifest.provenance.source,
      datasetSha256: browserManifest.provenance.datasetSha256,
      engineSha256: browserManifest.provenance.enginePreparationSha256,
      physicalDevice: false,
      geometryOrVenueAccessApproval: false,
    }),
  });
  expect(errors).toEqual([]);
});
