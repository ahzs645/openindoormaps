import { sourceStairKind } from "../../app/indoor-project/source-stairs";
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_ALL_STAIRS_ZIP;
test.skip(
  !zip || !existsSync(zip),
  "Provide the complete native staircase project.",
);
for (const mobile of [false, true])
  test(`inspect all 82 native stairs on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/projects/indoor?view=relative");
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { stairMap: Map }).stairMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator("input[type=file]").setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByText(/^82 stairs · \d+ connection reviews$/).click();
    const d: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const stairs = d.stairDisplay!.sourceFlights!;
    const floorFor = (s: (typeof stairs)[number]) =>
      d.floors.find((f) => f.levelIds.includes(s.levelIds[0])) ??
      d.floors.find((f) => f.levelIds.some((id) => s.levelIds.includes(id)))!;
    for (const stair of [...stairs].sort((a, b) =>
      floorFor(a).id.localeCompare(floorFor(b).id),
    )) {
      await page
        .getByRole("button", {
          name: `Show native stair #${stair.stairElementId}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: `Source ${sourceStairKind(stair).toLowerCase()} #${stair.stairElementId}`,
          exact: true,
        }),
      ).toBeVisible();
      const points = stair.treads.flatMap((t) => t.ringFeet),
        center = geographicPoint(d, [
          (Math.min(...points.map((p) => p[0])) +
            Math.max(...points.map((p) => p[0]))) /
            2,
          (Math.min(...points.map((p) => p[1])) +
            Math.max(...points.map((p) => p[1]))) /
            2,
        ]);
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ center, id }) => {
                const m = (globalThis as unknown as { stairMap: Map }).stairMap,
                  c = m.getCenter(),
                  source = m.getStyle().sources["project-native-stairs"];
                const count =
                  source.type === "geojson" && typeof source.data !== "string"
                    ? (
                        source.data as import("geojson").FeatureCollection
                      ).features.filter(
                        (f) => f.properties?.stairElementId === id,
                      ).length
                    : 0;
                return (
                  count > 0 &&
                  Math.abs(c.lng - center[0]) + Math.abs(c.lat - center[1]) <
                    1e-7
                );
              },
              { center, id: stair.stairElementId },
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
      await expect(
        page.locator(`[data-stair-element-id="${stair.stairElementId}"]`),
      ).toHaveCount(1);
      if (
        [1_588_220, 1_430_244, 1_460_777, 2_082_097].includes(
          stair.stairElementId,
        )
      ) {
        await page.locator("canvas.maplibregl-canvas").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `node_modules/.cache/indoor-editor-tests/all-stair-${stair.stairElementId}-${mobile ? "mobile" : "desktop"}.png`,
        });
      }
    }
    await page
      .getByLabel("Find native stairs", { exact: true })
      .fill("1588220");
    await expect(
      page.getByRole("button", { name: /Show native stair #/ }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Show native stair #1588220", exact: true })
      .click();
    await expect(
      page.getByText(
        "Entrance connection needs review before directions are available. Stairs are excluded from wheelchair paths.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page.goto("about:blank");
  });
