import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectRoute } from "../../app/indoor-project/viewer-routing";

const zip = process.env.INDOOR_PROJECT_ZIP;
const output = process.env.CORRIDOR_BROWSER_OUTPUT;
test.skip(
  !zip || !output,
  "Set INDOOR_PROJECT_ZIP and CORRIDOR_BROWSER_OUTPUT.",
);

test("real shared hallway route and reversible setting on desktop and mobile", async ({
  page,
}) => {
  // A cold full UNBC import still validates source evidence. Do it once, then
  // reuse that resident map while testing both viewports and preferences.
  test.setTimeout(1_200_000);
  await mkdir(output!, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const Original = globalThis.Worker;
    const state = globalThis as unknown as {
      corridorRouteReplies: {
        worker: number;
        options: { useSharedCorridorGuides?: boolean };
        route: ProjectRoute;
      }[];
    };
    state.corridorRouteReplies = [];
    let sequence = 0;
    globalThis.Worker = class extends Original {
      private readonly id = ++sequence;
      private readonly requests = new Map<
        number,
        { useSharedCorridorGuides?: boolean }
      >();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          if (event.data?.value?.route)
            state.corridorRouteReplies.push({
              worker: this.id,
              options: this.requests.get(event.data.requestId) ?? {},
              route: event.data.value.route,
            });
        });
      }
      postMessage(message: Parameters<Worker["postMessage"]>[0]) {
        this.requests.set(message.requestId, message.options ?? {});
        super.postMessage(message);
      }
    };
  });
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.goto("/openindoormaps/#/projects/indoor?view=2d");
  await page.locator('input[type="file"]').setInputFiles(zip!);
  await expect(
    page.getByRole("status").filter({ hasText: "Loaded" }),
  ).toBeVisible({
    timeout: 600_000,
  });
  await page.getByLabel("Search indoor map", { exact: true }).fill("05-423");
  await page.getByRole("button", { name: /05-423 ·/ }).click();
  await page.getByRole("button", { name: "Directions", exact: true }).click();
  await page.getByLabel("Route start", { exact: true }).fill("05-411");
  await page.getByRole("option", { name: /05-411 ·/ }).click();
  const setting = page.getByRole("checkbox", {
    name: "Use hallway centerlines",
  });
  await expect(setting).toBeChecked();
  await expect(page.getByTestId("project-route-result")).toBeVisible({
    timeout: 480_000,
  });
  const replies = () =>
    page.evaluate(
      () =>
        (
          globalThis as unknown as {
            corridorRouteReplies: {
              worker: number;
              options: { useSharedCorridorGuides?: boolean };
              route: ProjectRoute;
            }[];
          }
        ).corridorRouteReplies,
    );
  expect(
    (await replies())
      .at(-1)!
      .route.paths.some((p) => p.sharedCorridorGuideUsed),
  ).toBe(true);
  await setting.uncheck();
  await expect
    .poll(
      async () => (await replies()).at(-1)?.options.useSharedCorridorGuides,
      { timeout: 120_000 },
    )
    .toBe(false);
  expect(
    (await replies())
      .at(-1)!
      .route.paths.every((p) => !p.sharedCorridorGuideUsed),
  ).toBe(true);
  await setting.check();
  await expect
    .poll(
      async () => (await replies()).at(-1)?.options.useSharedCorridorGuides,
      { timeout: 120_000 },
    )
    .toBe(true);
  expect(
    (await replies())
      .at(-1)!
      .route.paths.some((p) => p.sharedCorridorGuideUsed),
  ).toBe(true);
  await page.screenshot({ path: path.join(output!, "desktop-setting.png") });
  await page
    .getByRole("button", { name: "Preview directions", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", { name: /^Preparing / }),
  ).toBeHidden({ timeout: 180_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(output!, "desktop-route.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("mobile-current-instruction")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(output!, "mobile-route.png") });
  await page
    .getByRole("button", { name: "Close", exact: true })
    .filter({ visible: true })
    .click();
  await expect(setting).toBeChecked();
  await setting.scrollIntoViewIfNeeded();
  const box = (await setting.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: path.join(output!, "mobile-setting.png") });
  expect(errors).toEqual([]);
  await writeFile(
    path.join(output!, "browser-routes.json"),
    JSON.stringify({ errors, replies: await replies() }, null, 2),
  );
});
