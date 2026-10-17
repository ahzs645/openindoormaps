import { expect, test, type Page } from "@playwright/test";
import { gunzipSync } from "node:zlib";
import type {
  ProgressiveManifest,
  ProgressiveShell,
} from "../../app/indoor-project/progressive-delivery";
const manifestUrl = process.env.PROGRESSIVE_MANIFEST_URL;
const routeStart = process.env.PROGRESSIVE_ROUTE_START ?? "05-136";
const routeEnd = process.env.PROGRESSIVE_ROUTE_END ?? "05-173";
const waitForPaintedMap = (page: Page) =>
  expect(page.getByTestId("visitor-render-status")).toHaveAttribute(
    "data-state",
    "ready",
    { timeout: 300_000 },
  );
// A real Library capture must contain its broad mint native floor, not just
// connectors on a blank background. Read screenshot pixels without extra deps.
async function expectLibraryFloorPaint(page: Page, nativeThree = false) {
  const png = await page.locator(".maplibregl-canvas").screenshot();
  const fraction = await page.evaluate(
    async (dataUrl) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let mint = 0;
      let opaqueOverview = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 1] - pixels[i] > 8 && pixels[i + 1] - pixels[i + 2] > 3)
          mint++;
        if (
          Math.abs(pixels[i] - 141) <= 2 &&
          Math.abs(pixels[i + 1] - 147) <= 2 &&
          Math.abs(pixels[i + 2] - 149) <= 2
        )
          opaqueOverview++;
      }
      return {
        mint: mint / (canvas.width * canvas.height),
        opaqueOverview: opaqueOverview / (canvas.width * canvas.height),
      };
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );
  expect(
    fraction.mint,
    "Library native floor must be visibly painted after readiness",
  ).toBeGreaterThan(0.08);
  if (nativeThree)
    expect(
      fraction.opaqueOverview,
      "2D grey backing must not cover the native3D Library",
    ).toBeLessThan(0.15);
}
const escape = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
for (const mobile of [false, true])
  test(`progressive visitor verifies lazy floor and route loading on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(
      !manifestUrl,
      "Provide a current progressive map manifest; this does not substitute a synthetic map for UNBC approval.",
    );
    test.setTimeout(3_600_000);
    const manifest: ProgressiveManifest = await fetch(manifestUrl!).then(
      (response) => response.json(),
    );
    const shellAsset = manifest.assets[manifest.shellAssetId];
    const shellGzip = shellAsset.representations.find(
      (representation) => representation.encoding === "gzip",
    )!;
    const shellResponse = await fetch(new URL(shellGzip.path, manifestUrl!));
    const shellBytes = new Uint8Array(await shellResponse.arrayBuffer());
    const shell: ProgressiveShell = JSON.parse(
      new TextDecoder().decode(
        shellBytes[0] === 0x1f && shellBytes[1] === 0x8b
          ? gunzipSync(shellBytes)
          : shellBytes,
      ),
    );
    const first = manifest.scopes.find(
      (scope) => scope.id === manifest.defaultScopeId,
    )!;
    const requests: { url: string; method: string }[] = [];
    const errors: string[] = [];
    page.on("request", (request) =>
      requests.push({ url: request.url(), method: request.method() }),
    );
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto(
      `${process.env.PROGRESSIVE_VISITOR_APP_URL ?? "http://127.0.0.1:42554/openindoormaps/"}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl!)}`,
    );
    await expect(page.getByLabel("Floor", { exact: true })).toHaveValue(
      first.id,
    );
    await expect(page.locator(".visitor-loading")).toHaveCount(0, {
      timeout: 120_000,
    });
    await waitForPaintedMap(page);
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
    const initialKinds = requests
      .filter((request) => request.method !== "HEAD" && known.has(request.url))
      .map((request) => known.get(request.url));
    expect(new Set(initialKinds)).toEqual(new Set(["shell", "overview"]));
    await page.screenshot({ path: test.info().outputPath("overview.png") });
    const start = shell.records.find((record) => record.number === routeStart)!;
    const end = shell.records.find((record) => record.number === routeEnd)!;
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    await page.getByLabel("Find a place", { exact: true }).fill(start.number);
    await page
      .getByRole("button", {
        name: new RegExp(`^${escape(start.number)} ${escape(start.name)}$`),
      })
      .click();
    await expect(
      page.locator('.visitor-map[data-floor-detail="true"]'),
    ).toBeVisible({ timeout: 180_000 });
    expect(
      requests.some(
        (request) =>
          request.method !== "HEAD" && known.get(request.url) === "routing",
      ),
    ).toBe(false);
    await waitForPaintedMap(page);
    if (
      shell.source.modelSha256 ===
        "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" &&
      routeStart === "05-136"
    )
      await expectLibraryFloorPaint(page);
    await page.screenshot({ path: test.info().outputPath("detail.png") });
    await page.getByLabel("Map view", { exact: true }).selectOption("relative");
    await waitForPaintedMap(page);
    if (
      shell.source.modelSha256 ===
        "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" &&
      routeStart === "05-136"
    )
      await expectLibraryFloorPaint(page, true);
    await page.screenshot({
      path: test.info().outputPath("native-height-3d.png"),
    });
    await page.getByLabel("Map view", { exact: true }).selectOption("2d");
    await waitForPaintedMap(page);
    await page.getByText("Directions", { exact: true }).click();
    await page.getByLabel("From", { exact: true }).selectOption(start.key);
    await page.getByLabel("To", { exact: true }).selectOption(end.key);
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    await expect(page.getByTestId("route-status")).toHaveText(/^\d+ m$/, {
      timeout: 3_000_000,
    });
    expect(
      requests.some(
        (request) =>
          request.method !== "HEAD" && known.get(request.url) === "routing",
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("actual-calculator-route.png"),
    });
    await page
      .getByLabel("Route preference", { exact: true })
      .selectOption("accessible");
    await expect(page.getByTestId("route-status")).toBeEmpty();
    expect(errors).toEqual([]);
  });

test("progressive visitor discloses source access and ordinary-room transit then clears stale instructions", async ({
  page,
}) => {
  const url = process.env.PROGRESSIVE_DISCLOSURE_MANIFEST_URL;
  test.skip(
    !url,
    "Provide the explicitly synthetic disclosure fixture manifest.",
  );
  await page.goto(
    `${process.env.PROGRESSIVE_VISITOR_APP_URL ?? "http://127.0.0.1:42554/openindoormaps/"}#/projects/visitor?manifest=${encodeURIComponent(url!)}`,
  );
  await expect(page.getByLabel("Floor", { exact: true })).toBeVisible();
  await page.getByText("Directions", { exact: true }).click();
  await page.getByLabel("From", { exact: true }).selectOption("0");
  await page.getByLabel("To", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  await expect(page.getByTestId("route-unknown-access")).toHaveText(
    "Public access is unknown for 1 areas.",
  );
  await expect(page.getByTestId("route-unknown-accessibility")).toHaveText(
    "Step-free access is unconfirmed for 2 connections.",
  );
  await expect(page.getByTestId("route-transit-places")).toContainText(
    "01-2 · Unconfirmed transit room",
  );
  await page.getByLabel("To", { exact: true }).selectOption("0");
  await expect(page.getByTestId("route-unknown-access")).toHaveCount(0);
  await expect(page.getByTestId("route-unknown-accessibility")).toHaveCount(0);
  await expect(page.getByTestId("route-transit-places")).toHaveCount(0);
  await expect(page.getByTestId("route-status")).toBeEmpty();
});

test("partial publications identify missing floors and keep a locked overview while locating places", async ({
  page,
}) => {
  const url = process.env.PROGRESSIVE_PARTIAL_MANIFEST_URL;
  test.skip(!url, "Provide the explicitly synthetic partial fixture manifest.");
  await page.goto(
    `${process.env.PROGRESSIVE_VISITOR_APP_URL ?? "http://127.0.0.1:42554/openindoormaps/"}#/projects/visitor?manifest=${encodeURIComponent(url!)}`,
  );
  await expect(page.getByText(/Some floors are unavailable/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Download complete map for offline use",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByLabel("Reveal rooms when zooming in", { exact: true })
    .uncheck();
  await page.getByLabel("Find a place", { exact: true }).fill("01-0");
  await page
    .getByRole("button", { name: "01-0 Synthetic office", exact: true })
    .click();
  await expect(
    page.locator('.visitor-map[data-floor-detail="false"]'),
  ).toBeVisible();
  await page.getByLabel("Find a place", { exact: true }).fill("02-100");
  await page
    .getByRole("button", { name: "02-100 Synthetic upper floor", exact: true })
    .click();
  await expect(
    page.getByText("This floor is not available in this map publication."),
  ).toBeVisible();
});
