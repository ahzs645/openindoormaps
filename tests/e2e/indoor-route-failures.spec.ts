import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  findProjectRoute,
  geographicPoint,
} from "../../app/indoor-project/routing";
import {
  projectNavigationSteps,
  projectFloorName,
} from "../../app/indoor-project/navigation-steps";
const projectPath = process.env.INDOOR_PROJECT_ZIP;
const screenshots = process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots";
const dataset: IndoorDataset | undefined =
  projectPath && existsSync(projectPath)
    ? JSON.parse(
        strFromU8(unzipSync(readFileSync(projectPath))["viewer/indoor.json"]),
      )
    : undefined;
test.skip(
  !projectPath || !existsSync(projectPath),
  "Provide the regenerated UNBC ZIP.",
);
const scenarios = [
  {
    name: "automatic entrance recovery and ordinary-room routing",
    pairs: [
      ["09-230", "09-232"],
      ["07-240", "07-244"],
    ],
  },
  ...(process.env.INDOOR_TEST_COMPLEX_ROUTE === "1"
    ? [
        {
          name: "registered doorway campus routing",
          pairs: [["10-1016", "07-244"]],
        },
      ]
    : []),
];
for (const mobile of [false, true])
  for (const scenario of scenarios) {
    test(`${scenario.name} on ${mobile ? "mobile" : "desktop"}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      await page.goto("/projects/indoor");
      await expect(page.locator('input[type="file"]')).toBeAttached({
        timeout: 30_000,
      });
      await page.evaluate(async () => {
        const path = performance
          .getEntriesByType("resource")
          .map((r) => r.name)
          .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
        const { default: lib } = await import(path);
        const add = lib.Map.prototype.addSource;
        lib.Map.prototype.addSource = function (
          this: Map,
          ...args: Parameters<Map["addSource"]>
        ) {
          if (args[0] === "project-areas")
            (
              globalThis as unknown as { automaticRouteMap: Map }
            ).automaticRouteMap = this;
          return add.apply(this, args);
        };
      });
      await page.locator('input[type="file"]').setInputFiles(projectPath!);
      await expect(page.getByRole("status")).toContainText("Loaded", {
        timeout: 45_000,
      });
      for (const [start, destination] of scenario.pairs) {
        await page
          .getByLabel("Search indoor map", { exact: true })
          .fill(destination);
        await page
          .getByRole("button", { name: new RegExp(destination) })
          .click();
        await page
          .getByRole("button", { name: "Directions", exact: true })
          .click();
        const from = page.getByLabel("Route start", { exact: true });
        await from.fill(start);
        await from.press("Enter");
        const result = page.getByTestId("project-route-result");
        await expect(result).toContainText(/\b\d+\.\d m\b/);
        await expect(result).not.toContainText(
          /no prepared entrance|restricted areas|destination room rather than a passage/,
        );
        await expect(
          page.getByRole("button", { name: "Preview directions", exact: true }),
        ).toBeVisible();
        if (destination === "07-244") {
          await page
            .getByRole("button", { name: "Fit route", exact: true })
            .click();
          await page.screenshot({
            path: `${screenshots}/unbc-${start === "10-1016" ? "campus" : "automatic"}-routing-${mobile ? "mobile" : "desktop"}.png`,
          });
          await page
            .getByRole("button", { name: "Preview directions", exact: true })
            .click();
          await expect(
            page.getByRole("button", { name: "Next step", exact: true }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Next step", exact: true })
            .click();
          const a = dataset!.records.find((r) => r.number === start)!;
          const b = dataset!.records.find((r) => r.number === destination)!;
          const expectedRoute = findProjectRoute(dataset!, a.key, b.key)!;
          const expectedSteps = projectNavigationSteps(
            dataset!,
            expectedRoute,
            "Departure",
            "Destination",
          );
          const progress = page.getByRole("progressbar", {
            name: "Route progress",
            exact: true,
          });
          await expect(progress).toHaveAttribute(
            "aria-valuemax",
            String(expectedSteps.length - 1),
          );
          const cameras: number[][] = [];
          const captures = new Map<number, string[]>();
          if (start === "10-1016") {
            const sourceDoor = expectedRoute.edges.find(
              (e) => e.sourceDoorProof,
            )!;
            expect(sourceDoor).toBeTruthy();
            const center = sourceDoor.pointsFeet[0];
            const closest = expectedSteps
              .map((s, i) => ({
                i,
                distance: Math.min(
                  ...s.pointsFeet.map((p) =>
                    Math.hypot(
                      p[0] - center[0],
                      p[1] - center[1],
                      p[2] - center[2],
                    ),
                  ),
                ),
              }))
              .sort((a, b) => a.distance - b.distance)[0].i;
            const transition = expectedSteps.findIndex(
              (s) =>
                s.networkType === "local-steps" || s.networkType === "stairs",
            );
            for (const [name, index] of [
              ["source-door", closest],
              ["floor-change", transition],
            ] as const)
              for (const offset of [-1, 0, 1]) {
                const i = index + offset;
                if (i < 1 || i >= expectedSteps.length) continue;
                captures.set(i, [
                  ...(captures.get(i) ?? []),
                  `${name}-${offset < 0 ? "before" : offset > 0 ? "after" : "current"}`,
                ]);
              }
          }
          for (let index = 1; index < expectedSteps.length; index++) {
            if (index > 1)
              await page
                .getByRole("button", { name: "Next step", exact: true })
                .click();
            await expect(progress).toHaveAttribute(
              "aria-valuenow",
              String(index),
            );
            const step = expectedSteps[index];
            await expect(
              page.getByRole("button", {
                name: "Open level selector",
                exact: true,
              }),
            ).toContainText(projectFloorName(dataset!, step.levelId));
            if (index < expectedSteps.length - 1) {
              await (mobile
                ? expect(
                    page.getByTestId("mobile-current-instruction"),
                  ).toHaveText(step.message)
                : expect(
                    page.locator(
                      '[data-testid="hospital-desktop-preview"] [aria-current="step"]',
                    ),
                  ).toHaveAttribute("aria-label", step.message));
            }
            // Following must move the actual camera to the displayed step, with
            // its points inside the region left uncovered by the preview cards.
            const coordinates = step.pointsFeet.map((p) =>
              geographicPoint(dataset!, p),
            );
            await expect
              .poll(
                () =>
                  page.evaluate((points) => {
                    const map = (
                      globalThis as unknown as { automaticRouteMap: Map }
                    ).automaticRouteMap;
                    if (map.isMoving()) return false;
                    const rect = map.getContainer().getBoundingClientRect();
                    const mobile = rect.width < 768;
                    const desktopCard = document
                      .querySelector(
                        '[data-testid="hospital-desktop-preview"]',
                      )!
                      .getBoundingClientRect();
                    const topCard = document
                      .querySelector('[aria-label="Current direction"]')
                      ?.getBoundingClientRect();
                    const floorChip = document
                      .querySelector('[data-testid="mobile-route-floor"]')
                      ?.getBoundingClientRect();
                    const left = mobile
                      ? 20
                      : desktopCard.right - rect.left + 15;
                    const top =
                      mobile && topCard ? topCard.bottom - rect.top + 5 : 60;
                    const bottom =
                      mobile && floorChip
                        ? floorChip.top - rect.top - 5
                        : rect.height - 40;
                    return points.every((p) => {
                      const pixel = map.project(p as [number, number]);
                      return (
                        pixel.x >= left &&
                        pixel.x <= rect.width - 15 &&
                        pixel.y >= top &&
                        pixel.y <= bottom
                      );
                    });
                  }, coordinates),
                { timeout: 15_000 },
              )
              .toBe(true);
            cameras.push(
              await page.evaluate(() => {
                const map = (
                  globalThis as unknown as { automaticRouteMap: Map }
                ).automaticRouteMap;
                return [map.getCenter().lng, map.getCenter().lat];
              }),
            );
            for (const label of captures.get(index) ?? [])
              await page.screenshot({
                path: `${screenshots}/unbc-campus-${mobile ? "mobile" : "desktop"}-${label}.png`,
              });
          }
          expect(new Set(cameras.map((c) => c.join(","))).size).toBeGreaterThan(
            3,
          );
          await expect(
            page.getByRole("button", { name: "Next step", exact: true }),
          ).toBeDisabled();
          await page
            .getByRole("button", { name: "Previous step", exact: true })
            .click();
          await expect(progress).toHaveAttribute(
            "aria-valuenow",
            String(expectedSteps.length - 2),
          );
        } else
          await page.getByRole("button", { name: "Back", exact: true }).click();
      }
      expect(errors).toEqual([]);
    });
  }
