import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { generateFloorOpeningFixture } from "../fixtures/indoor-floor-opening";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
import type {
  FloorPreparationRequest,
  FloorPreparationResponse,
} from "../../app/indoor-project/prepared-floor";

const base = process.env.PAGES_BASE_PATH ?? "/openindoormaps/";
const fileName = "working-master.reviter.zip";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw new Error(`Browser error: ${error.message}`);
  });
});
let oldBytes: Buffer,
  newBytes: Buffer,
  oldRevision: string,
  newRevision: string;
type ImportProbe = {
  preparedColors: string[];
  restoreStarted?: boolean;
  restoreFinished?: boolean;
  releaseRestore?: () => void;
  firstFileStarted?: boolean;
  firstFileFinished?: boolean;
  releaseFirstFile?: () => void;
  writeStarted?: boolean;
  releaseWrite?: () => void;
};
test.beforeAll(async () => {
  const fixture = await generateFloorOpeningFixture(
    "/tmp/oim-replacement-import-fixture.reviter.zip",
  );
  oldBytes = await readFile(fixture.path);
  const project = await readIndoorProject(oldBytes);
  oldRevision = project.manifest.indoor.sha256.slice(0, 12);
  for (const [key, name] of [
    ["lower-main", "Updated imported studio"],
    ["upper-room", "Updated upper studio"],
  ]) {
    project.dataset.records.find((r) => r.key === key)!.name = name;
    project.rooms.annotations.find((r) => r.key === key)!.name = name;
    project.dataset.visitor!.places[key].displayName = name;
  }
  const room = project.dataset.records.find((r) => r.key === "lower-main")!;
  room.ringsFeet = [
    [
      [16, 16],
      [44, 16],
      [44, 44],
      [16, 44],
    ],
  ];
  project.dataset.visitor!.places[room.key].color = "#008800";
  project.rooms.visitorMetadata = structuredClone(project.dataset.visitor);
  newBytes = Buffer.from(await exportIndoorProject(project));
  const updated = await readIndoorProject(newBytes);
  newRevision = updated.manifest.indoor.sha256.slice(0, 12);
  expect(newRevision).not.toBe(oldRevision);
});

async function upload(page: Page, buffer: Buffer) {
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: fileName, mimeType: "application/zip", buffer });
  await expect(page.getByRole("status")).toContainText("Loaded", {
    timeout: 60_000,
  });
  await expect(
    page.getByRole("button", { name: "Clear map", exact: true }),
  ).toBeEnabled();
}
async function revision(page: Page, expected: string, restored = false) {
  const info = page.getByTestId("project-package");
  if (!(await info.evaluate((e) => (e as HTMLDetailsElement).open)))
    await info.locator("summary").click();
  await expect(info).toContainText(fileName);
  await expect(info.locator("code")).toHaveText(expected);
  await expect(info).toContainText(
    restored ? "Restored from this browser" : "Imported from ZIP",
  );
  const panel = (await info.locator("div").boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await info.locator("summary").click();
}

for (const mobile of [false, true]) {
  test(`same-name replacement refreshes floors and survives navigation; clear removes it on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    // Observe real prepared geometry, rather than only the changed text in React.
    await page.addInitScript(() => {
      const probe = ((
        globalThis as unknown as { importProbe: ImportProbe }
      ).importProbe = { preparedColors: [] });
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (
        message: FloorPreparationRequest,
      ) {
        if (message.levelIds)
          this.addEventListener(
            "message",
            ({ data }: MessageEvent<FloorPreparationResponse>) => {
              if ("value" in data) {
                const room = data.value.stairCutRooms.features.find(
                  (f) => f.properties?.key === "lower-main",
                );
                if (room)
                  probe.preparedColors.push(String(room.properties?.color));
              }
            },
            { once: true },
          );
        post.call(this, message);
      };
    });
    await page.goto(`${base}#/projects/indoor`);
    await upload(page, oldBytes);
    await revision(page, oldRevision);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { importProbe: ImportProbe }
          ).importProbe.preparedColors.at(-1),
        ),
      )
      .toBe("#ff0080");
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await upload(page, newBytes);
    await revision(page, newRevision);
    await expect(
      page.getByLabel("Route destination", { exact: true }),
    ).toContainText("Updated imported studio");
    await expect(
      page.getByLabel("Route destination", { exact: true }),
    ).not.toContainText("Lower room through atrium");
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { importProbe: ImportProbe }
          ).importProbe.preparedColors.at(-1),
        ),
      )
      .toBe("#008800");
    await page.getByLabel("Map floor", { exact: true }).selectOption("upper");
    await expect(
      page.getByLabel("Route destination", { exact: true }),
    ).toContainText("Updated upper studio");
    await page.getByRole("link", { name: "Venue maps", exact: true }).click();
    await page.getByRole("link", { name: /Prepared indoor projects/ }).click();
    await expect(page.getByRole("status")).toContainText("Loaded");
    await revision(page, newRevision, true);
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Loaded");
    await revision(page, newRevision, true);
    await page.getByTestId("project-package").locator("summary").click();
    await page.screenshot({
      path: testInfo.outputPath("loaded-map-revision.png"),
    });
    await page.getByTestId("project-package").locator("summary").click();
    // A rejected upload clearly explains that the previous map remains visible.
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "application/zip",
      buffer: Buffer.from("invalid ZIP"),
    });
    await expect(page.getByRole("status")).toContainText(
      "Previous map remains loaded.",
    );
    await expect(page.getByRole("status")).toBeVisible();
    await revision(page, newRevision, true);
    await page.getByRole("button", { name: "Clear map", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Map cleared");
    await expect(page.getByTestId("project-package")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("status")).toContainText(
      "Import a prepared Reviter project ZIP to begin.",
    );
    await expect(page.getByTestId("project-package")).toHaveCount(0);
    await upload(page, newBytes);
    await revision(page, newRevision);
  });
}

test("a delayed saved ZIP cannot overwrite a fresh import or reappear after Clear map", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${base}#/projects/indoor`);
  await upload(page, oldBytes);
  await page.addInitScript(() => {
    const probe = ((
      globalThis as unknown as { importProbe: ImportProbe }
    ).importProbe = { preparedColors: [] });
    const original = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      if (this instanceof File) return original.call(this);
      probe.restoreStarted = true;
      await new Promise<void>((resolve) => {
        probe.releaseRestore = resolve;
      });
      const bytes = await original.call(this);
      probe.restoreFinished = true;
      return bytes;
    };
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { importProbe: ImportProbe }).importProbe
            .restoreStarted,
      ),
    )
    .toBe(true);
  await upload(page, newBytes);
  await revision(page, newRevision);
  await page.evaluate(() =>
    (globalThis as unknown as { importProbe: ImportProbe }).importProbe
      .releaseRestore!(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { importProbe: ImportProbe }).importProbe
            .restoreFinished,
      ),
    )
    .toBe(true);
  await revision(page, newRevision);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { importProbe: ImportProbe }).importProbe
            .restoreStarted,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Clear map", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Map cleared");
  await page.evaluate(() =>
    (globalThis as unknown as { importProbe: ImportProbe }).importProbe
      .releaseRestore!(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { importProbe: ImportProbe }).importProbe
            .restoreFinished,
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("project-package")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Import a prepared Reviter project ZIP to begin.",
  );
});

test("overlapping imports keep the latest selection and Venue maps waits for its pending save", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`${base}#/projects/indoor`);
  await upload(page, oldBytes);
  await page
    .getByRole("button", { name: "Review project", exact: true })
    .click();
  await page.evaluate(() => {
    const probe = ((
      globalThis as unknown as { importProbe: ImportProbe }
    ).importProbe = { preparedColors: [] });
    const arrayBuffer = File.prototype.arrayBuffer;
    let first = true;
    File.prototype.arrayBuffer = async function () {
      if (!first) return arrayBuffer.call(this);
      first = false;
      probe.firstFileStarted = true;
      await new Promise<void>((resolve) => {
        probe.releaseFirstFile = resolve;
      });
      const bytes = await arrayBuffer.call(this);
      probe.firstFileFinished = true;
      return bytes;
    };
    const open = indexedDB.open.bind(indexedDB);
    let hold = true;
    indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => {
      const request = open(...args);
      if (hold && args[0] === "openindoormaps-projects") {
        hold = false;
        request.addEventListener(
          "success",
          (event) => {
            event.stopImmediatePropagation();
            probe.writeStarted = true;
            probe.releaseWrite = () =>
              request.dispatchEvent(new Event("success"));
          },
          { once: true },
        );
      }
      return request;
    };
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/zip",
    buffer: oldBytes,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { importProbe: ImportProbe }).importProbe
            .firstFileStarted,
      ),
    )
    .toBe(true);
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/zip",
    buffer: newBytes,
  });
  await expect(page.getByRole("status")).toContainText("Loaded");
  await revision(page, newRevision);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { importProbe: ImportProbe }).importProbe
            .writeStarted,
      ),
    )
    .toBe(true);
  await page.evaluate(() =>
    (globalThis as unknown as { importProbe: ImportProbe }).importProbe
      .releaseFirstFile!(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as unknown as { importProbe: ImportProbe }).importProbe
            .firstFileFinished,
      ),
    )
    .toBe(true);
  await revision(page, newRevision);
  await page.getByRole("link", { name: "Venue maps", exact: true }).click();
  await page.getByRole("link", { name: /Prepared indoor projects/ }).click();
  await expect(page.getByTestId("project-package")).toHaveCount(0);
  await page.evaluate(() =>
    (globalThis as unknown as { importProbe: ImportProbe }).importProbe
      .releaseWrite!(),
  );
  await expect(page.getByRole("status")).toContainText("Loaded");
  await revision(page, newRevision, true);
});
