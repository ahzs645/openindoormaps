import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
for (const mobile of [false, true])
  test(`pin elevators retain stops and follow floor changes on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(
      !data?.connectors?.some((c) => c.id === "unbc-04-lift"),
      "Set INDOOR_PROJECT_ZIP to pin-connectors UNBC package.",
    );
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
          (globalThis as unknown as { pinLiftMap: Map }).pinLiftMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    // Check every physical stop on both lifts; source building names may differ.
    for (const c of data!.connectors!)
      for (const e of c.entrances) {
        const f = data!.floors.find((f) => f.levelIds.includes(e.levelId))!;
        await page
          .getByLabel("Project building", { exact: true })
          .selectOption("all");
        await page.getByLabel("Map floor", { exact: true }).selectOption(f.id);
        await expect
          .poll(() =>
            page
              .locator('.project-connector-marker[data-kind="elevator"]')
              .count(),
          )
          .toBeGreaterThan(0);
      }
    console.log("All seven stops checked", mobile);
    for (const id of ["unbc-04-lift", "unbc-agora-conference-lift"]) {
      const c = data!.connectors!.find((c) => c.id === id)!,
        a = c.entrances[0],
        b = c.entrances.at(-1)!;
      await page
        .getByLabel("Route start", { exact: true })
        .selectOption(a.roomKey);
      await page
        .getByLabel("Route destination", { exact: true })
        .selectOption(b.roomKey);
      await expect(page.getByTestId("project-route-result")).not.toContainText(
        "No verified route",
      );
      await page
        .getByRole("button", { name: "Explore map", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Get directions", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Preview directions", exact: true })
        .click();
      console.log("Preview opened", id, mobile);
      const route = findProjectRoute(data!, a.roomKey, b.roomKey)!;
      const steps = projectNavigationSteps(
        data!,
        route,
        "Departure",
        "Destination",
      );
      const index = steps.findIndex((s) => s.networkType === "elevator");
      expect(index).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < index; i++)
        await page
          .getByRole("button", { name: "Next step", exact: true })
          .click();
      // Following the lift reveals the destination's actual native-floor surface.
      await expect
        .poll(
          () =>
            page.evaluate(async (key) => {
              const m = (globalThis as unknown as { pinLiftMap: Map })
                .pinLiftMap;
              const areas = (await (
                m.getSource("project-areas") as GeoJSONSource
              ).getData()) as FeatureCollection;
              return (
                areas.features.some(
                  (f) =>
                    f.properties?.key === key ||
                    (f.properties?.boundarySource ===
                      "prepared-native-circulation" &&
                      Array.isArray(f.properties?.roomKeys) &&
                      f.properties.roomKeys.includes(key)),
                ) && !m.isMoving()
              );
            }, b.roomKey),
          { timeout: 30_000 },
        )
        .toBe(true);
      await expect(page.getByTestId("project-navigation")).toContainText(
        steps[index].message,
      );
      if (mobile)
        await expect(page.getByTestId("mobile-current-instruction")).toHaveText(
          steps[index].message,
        );
      await page.screenshot({
        path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/unbc-${id}-${mobile ? "mobile" : "desktop"}-follow.png`,
      });
      if (index > 0) {
        await page
          .getByRole("button", { name: "Previous step", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Open level selector",
            exact: true,
          }),
        ).toContainText(
          data!.floors.find((f) => f.levelIds.includes(a.levelId))!.name,
          { timeout: 30_000 },
        );
      }
      await page
        .getByRole("button", { name: mobile ? "Close" : "Back", exact: true })
        .filter({ visible: true })
        .click();
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
    }
    console.log("Both lift previews checked", mobile);
    // Pin's measured flight is visible in the shared lower-floor corridor.
    await page
      .getByLabel("Map floor", { exact: true })
      .selectOption(data!.floors.find((f) => f.levelIds.includes(311))!.id);
    await expect(
      page.locator(
        '.project-connector-marker[aria-label="Stairs · native flight #1372994"]',
      ),
    ).toHaveCount(1);
    if (mobile)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    expect(errors).toEqual([]);
  });
