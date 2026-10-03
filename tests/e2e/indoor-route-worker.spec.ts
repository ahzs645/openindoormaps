import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { findProjectRoute } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
test.skip(
  !data,
  "Provide the final UNBC master for routing performance checks.",
);
for (const mobile of [false, true])
  test(`multifloor route calculation keeps controls responsive on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const errors: string[] = [],
      workerURLs: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("worker", (w) => workerURLs.push(w.url()));
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    const start = data!.records.find((r) => r.number === "06-260")!,
      end = data!.records.find((r) => r.number === "07-240")!;
    await page
      .getByLabel("Route start", { exact: true })
      .selectOption(start.key);
    // Capture the UI heartbeat while the route worker is active.
    await page.evaluate(() => {
      const frames: number[] = [];
      (globalThis as unknown as { routeFrames: number[] }).routeFrames = frames;
      const tick = (time: number) => {
        frames.push(time);
        if (frames.length < 600) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const began = Date.now();
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption(end.key);
    await expect(page.getByTestId("project-route-calculating")).toBeVisible();
    // The worker runs while a map control remains usable.
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "2D rooms", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("project-route-calculating")).toHaveCount(0, {
      timeout: 30_000,
    });
    const elapsed = Date.now() - began;
    const expected = findProjectRoute(data!, start.key, end.key)!;
    await expect(page.getByTestId("project-route-result")).toContainText(
      `${expected.distanceMetres.toFixed(1)} m`,
    );
    expect(
      workerURLs.some((url) => url.includes("route-calculation.worker")),
    ).toBe(true);
    const frames = await page.evaluate(
      () => (globalThis as unknown as { routeFrames: number[] }).routeFrames,
    );
    expect(frames.length).toBeGreaterThan(5);
    await test.info().attach("route-timing", {
      body: JSON.stringify({
        elapsedMs: elapsed,
        animationFrames: frames.length,
        metres: expected.distanceMetres,
      }),
      contentType: "application/json",
    });
    // A changed destination while work is pending must not resurrect the old route.
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption(start.key);
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption(end.key);
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption(start.key);
    await expect(page.getByTestId("project-route-calculating")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("project-route-result")).toContainText(
      "0.0 m",
    );
    expect(errors).toEqual([]);
  });
