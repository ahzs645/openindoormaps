import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
for (const mobile of [false, true])
  test(`expanded UNBC editor persists managed locations and objects on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, info) => {
    test.skip(!data, "Provide INDOOR_PROJECT_ZIP");
    test.setTimeout(200_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { upgradeMap: Map }).upgradeMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!(
              globalThis as unknown as { upgradeMap: Map }
            ).upgradeMap?.getSource("project-annotations"),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (globalThis as unknown as { upgradeMap: Map }).upgradeMap.getPitch(),
        ),
      )
      .toBe(0);
    const room = data!.records.find((r) => r.number === "05-107")!,
      arrival = data!.nodes.find((n) => n.id === room.arrivalNodeId)!;
    await page.evaluate(
      (center) =>
        (globalThis as unknown as { upgradeMap: Map }).upgradeMap.jumpTo({
          center,
          zoom: 20.5,
          pitch: 0,
        }),
      geographicPoint(data!, arrival.pointFeet),
    );
    const click = async (dx = 0, dy = 0) => {
      const canvas = page.locator(".project-map canvas.maplibregl-canvas");
      await canvas.scrollIntoViewIfNeeded();
      const b = (await canvas.boundingBox())!;
      await page.mouse.click(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy);
    };
    await click();
    await expect(page.getByRole("heading", { name: /05-107/ })).toBeVisible();
    await page
      .getByRole("button", { name: "New location", exact: true })
      .click();
    await page
      .getByLabel("Location name", { exact: true })
      .fill("UNBC Student support");
    await page
      .getByLabel("Location description", { exact: true })
      .fill("Advising and registration assistance");
    await page
      .getByLabel("Location category", { exact: true })
      .fill("department");
    await page
      .getByLabel("Location search tags", { exact: true })
      .fill("registration, helpdesk");
    await page
      .getByLabel("Location symbol", { exact: true })
      .selectOption("information");
    await page
      .getByText("Contact, hours, links & images", { exact: true })
      .click();
    await page
      .getByLabel("Location website", { exact: true })
      .fill("https://www.unbc.ca");
    await page
      .getByLabel("Location phone", { exact: true })
      .fill("250-555-0100");
    await page
      .getByLabel("Location hours", { exact: true })
      .fill("Mon–Fri 9:00–17:00");
    await page
      .getByLabel("Location links", { exact: true })
      .fill("Contact | https://www.unbc.ca/contact");
    await page
      .getByLabel("Location photos", { exact: true })
      .fill("https://example.org/photo.jpg");
    await page
      .getByRole("button", { name: "Save location", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Attach selected room", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Manage location: UNBC Student support",
        exact: true,
      }),
    ).toContainText("1 attached rooms");
    await expect(
      page
        .locator(".project-annotation-label")
        .filter({ hasText: "UNBC Student support" }),
    ).toHaveCount(1);
    await page
      .getByRole("button", {
        name: "Place / move location marker",
        exact: true,
      })
      .click();
    await click(30, -35);
    await page
      .getByRole("button", { name: "Reset marker to room", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add label to selected room", exact: true })
      .click();
    await page.getByLabel("Annotation text", { exact: true }).fill("Help desk");
    await page
      .getByLabel("Annotation symbol", { exact: true })
      .selectOption("aed");
    await page
      .getByRole("button", { name: "Save annotation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Duplicate annotation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Nudge annotation right", exact: true })
      .click();
    await page.getByRole("button", { name: "Undo edit", exact: true }).click();
    await page.getByRole("button", { name: "Redo edit", exact: true }).click();
    for (const [tool, name] of [
      ["Rectangle", "Study zone"],
      ["Circle", "Meeting point"],
      ["Measure distance", "Counter length"],
    ]) {
      await page.getByRole("button", { name: tool, exact: true }).click();
      await page.getByLabel("Annotation text", { exact: true }).fill(name);
      await click(-50, -50);
      await click(45, 35);
      await page
        .getByRole("button", { name: "Create annotation", exact: true })
        .click();
      await expect(
        page.locator(".project-annotation-label").filter({ hasText: name }),
      ).toHaveCount(1);
    }
    await page.getByText("Layers & snapping", { exact: true }).click();
    await page.getByLabel("Annotation opacity", { exact: true }).fill("0.5");
    await expect
      .poll(() =>
        page
          .locator(".project-annotation-label")
          .first()
          .evaluate((e) => e.style.opacity),
      )
      .toBe("0.5");
    await page.getByLabel("Annotation opacity", { exact: true }).fill("1");
    await page.getByLabel("Geometry opacity", { exact: true }).fill("0.6");
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { upgradeMap: Map }
          ).upgradeMap.getPaintProperty("project-room-fill", "fill-opacity"),
        ),
      )
      .toBe(0.6);
    await page.getByLabel("Geometry opacity", { exact: true }).fill("1");
    await page
      .locator("summary")
      .filter({ hasText: "Floor display name" })
      .click();
    await page
      .getByLabel("Floor display name", { exact: true })
      .fill("UNBC Ground floor");
    await page
      .getByRole("button", { name: "Save floor name", exact: true })
      .click();
    await page.getByText("Download floor map", { exact: true }).click();
    const geoEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download GeoJSON", exact: true })
      .click();
    const geoPath = info.outputPath("floor.geojson");
    await (await geoEvent).saveAs(geoPath);
    const geo = JSON.parse(readFileSync(geoPath, "utf8"));
    expect(geo.type).toBe("FeatureCollection");
    expect(
      geo.features.some(
        (f: { properties: { text?: string } }) =>
          f.properties.text === "Counter length",
      ),
    ).toBe(true);
    const svgEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download SVG", exact: true })
      .click();
    const svgPath = info.outputPath("floor.svg");
    await (await svgEvent).saveAs(svgPath);
    expect(readFileSync(svgPath, "utf8")).toContain("UNBC Student support");
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page
      .getByLabel("Search indoor map", { exact: true })
      .fill("helpdesk");
    await page
      .getByRole("button", { name: /^05-107 · UNBC Student support/ })
      .click();
    await expect(page.locator(".project-place-card")).toContainText(
      "250-555-0100",
    );
    await expect(page.locator(".project-place-card")).toContainText("Mon–Fri");
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download reviewed ZIP", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    const archiveEvent = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download reviewed ZIP", exact: true })
      .click();
    const saved = info.outputPath("reviewed.zip");
    await (await archiveEvent).saveAs(saved);
    const files = unzipSync(readFileSync(saved)),
      rooms = JSON.parse(strFromU8(files["floors/rooms.json"])),
      restored = JSON.parse(strFromU8(files["viewer/indoor.json"]));
    expect(rooms.mapEdits.locations[0].roomKeys).toEqual([room.key]);
    expect(rooms.mapEdits.locations[0].tags).toEqual([
      "registration",
      "helpdesk",
    ]);
    expect(rooms.mapEdits.annotations).toHaveLength(5);
    expect(restored.records).toEqual(data!.records);
    expect(restored.edges).toEqual(data!.edges);
    expect(restored.nodes).toEqual(data!.nodes);
    await page.locator('input[type="file"]').setInputFiles(saved);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", {
        name: "Manage location: UNBC Student support",
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Location website", { exact: true }),
    ).toHaveValue("https://www.unbc.ca");
    await expect(
      page.getByRole("combobox", { name: "Map floor", exact: true }),
    ).toHaveValue(Object.keys(rooms.mapEdits.floorNames)[0]);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await expect(page.locator(".project-floor-picker > span")).toHaveText(
      /^(?:G|L[\d.-]*)$/,
    );
    await page
      .locator(".project-layout")
      .evaluate((element) => element.scrollTo(0, 0));
    await page
      .locator(".project-sidebar")
      .evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({
      path: `docs/screenshots/unbc-expanded-editor-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: mobile,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
