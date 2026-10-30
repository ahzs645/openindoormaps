import { test, expect } from "@playwright/test";
import { progressiveVisitorUiFixture } from "../fixtures/progressive-visitor-ui";
import { progressiveRoutingDisclosureFixture } from "../fixtures/progressive-routing";

for (const mobile of [false, true]) {
  test(`visitor search goes directly into directions on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const appUrl =
      process.env.PROGRESSIVE_VISITOR_APP_URL ??
      "http://127.0.0.1:42554/openindoormaps/";
    const manifestUrl = new URL("visitor-ui-fixture/manifest.json", appUrl)
      .href;
    const { files, manifest } = progressiveVisitorUiFixture(manifestUrl);
    const requests: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.addInitScript(() =>
      localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "false"),
    );
    await page.route("**/visitor-ui-fixture/**", async (route) => {
      requests.push(route.request().url());
      const body = files.get(route.request().url());
      await route.fulfill({
        status: body ? 200 : 404,
        body: body ? Buffer.from(body) : "Missing fixture",
      });
    });
    await page.goto(
      `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl)}`,
    );
    const search = page.getByLabel("Find a place", { exact: true });
    await expect(search).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByLabel("Map manifest URL", { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("link", { name: "Full OpenIndoorMaps", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open saved map", exact: true }),
    ).toBeVisible();
    await page.getByText("Map tools", { exact: true }).click();
    await expect(
      page.getByLabel("Map manifest URL", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Full OpenIndoorMaps", exact: true }),
    ).toBeVisible();
    await page.getByText("Map tools", { exact: true }).click();
    await search.fill("01-0");
    await page
      .getByRole("button", {
        name: "01-0 Office · Building 01 · Floor 1",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Directions to here", exact: true })
      .click();
    await expect(page.getByLabel("To", { exact: true })).toHaveValue("0");
    await expect(page.getByLabel("From", { exact: true })).toBeFocused();
    await expect(
      page.getByLabel("From", { exact: true }).locator("option"),
    ).toHaveCount(3);
    await search.fill("01-1");
    await page
      .getByRole("button", {
        name: "01-1 Office · Building 01 · Floor 1",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Start here", exact: true }).click();
    await expect(page.getByLabel("From", { exact: true })).toHaveValue("1");
    await expect(page.getByLabel("To", { exact: true })).toHaveValue("0");
    await page
      .getByRole("button", { name: "Swap places", exact: true })
      .click();
    await expect(page.getByLabel("From", { exact: true })).toHaveValue("0");
    await expect(page.getByLabel("To", { exact: true })).toHaveValue("1");
    const transit = page.getByRole("checkbox", {
      name: "Allow paths through other rooms",
      exact: true,
    });
    await expect(transit).not.toBeChecked();
    await transit.check();
    await expect(page).toHaveURL(/roomTransit=1/);
    await page
      .getByLabel("Route preference", { exact: true })
      .selectOption("accessible");
    await expect(
      page.getByText("Uses confirmed step-free connections.", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("From", { exact: true })).toHaveValue("0", {
      timeout: 60_000,
    });
    await expect(page.getByLabel("To", { exact: true })).toHaveValue("1");
    await expect(
      page.getByLabel("Route preference", { exact: true }),
    ).toHaveValue("accessible");
    await expect(transit).toBeChecked();
    await page.getByLabel("To", { exact: true }).selectOption("0");
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    await expect(page.getByTestId("route-status")).toContainText("same place");
    const routingPath = new URL(
      manifest.assets[manifest.routeAssetId].representations[0].path,
      manifestUrl,
    ).href;
    expect(requests).not.toContain(routingPath);
    await page.screenshot({
      path: test.info().outputPath("selected-place-directions.png"),
    });
    for (const [number, name, reason] of [
      ["01-2", "Staff", "restricted to staff"],
      ["01-3", "Stair", "no connected entrance"],
      ["01-4", "Void", "non-walkable"],
    ]) {
      await search.fill(number);
      await page
        .getByRole("button", {
          name: `${number} ${name} · Building 01 · Floor 1`,
          exact: true,
        })
        .click();
      const card = page.getByRole("region", {
        name: "Selected place",
        exact: true,
      });
      await expect(card).toContainText(reason);
      await expect(card.getByRole("button")).toHaveCount(0);
    }
    await search.fill("No such room");
    await expect(
      page.getByText("No matching places.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("unavailable-place.png"),
    });
    await page.goto(
      `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl)}&from=2&to=missing&accessible=1`,
    );
    await expect(page.getByLabel("From", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("To", { exact: true })).toHaveValue("");
    await expect(page.getByTestId("route-status")).toContainText(
      "directions link is unavailable",
    );
    await expect(
      page.getByRole("button", { name: "Get directions", exact: true }),
    ).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test(`actual visitor worker respects room transit and step-free on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const appUrl =
      process.env.PROGRESSIVE_VISITOR_APP_URL ??
      "http://127.0.0.1:42554/openindoormaps/";
    const manifestUrl = new URL("visitor-route-fixture/manifest.json", appUrl)
      .href;
    const { files } = progressiveVisitorUiFixture(
      manifestUrl,
      progressiveRoutingDisclosureFixture(),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.addInitScript(() =>
      localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "false"),
    );
    await page.route("**/visitor-route-fixture/**", async (request) => {
      const body = files.get(request.request().url());
      await request.fulfill({
        status: body ? 200 : 404,
        body: body ? Buffer.from(body) : "Missing fixture",
      });
    });
    await page.goto(
      `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl)}&from=0&to=1`,
    );
    const transit = page.getByRole("checkbox", {
      name: "Allow paths through other rooms",
      exact: true,
    });
    const getDirections = page.getByRole("button", {
      name: "Get directions",
      exact: true,
    });
    await expect(transit).not.toBeChecked({ timeout: 60_000 });
    await getDirections.click();
    await expect(page.getByTestId("route-status")).toContainText(
      "No hallway-only route",
      { timeout: 60_000 },
    );
    await transit.check();
    await expect(page.getByTestId("route-status")).toBeEmpty();
    await getDirections.click();
    await expect(page.getByTestId("route-status")).toHaveText(/^\d+ m$/, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("route-unknown-access")).toContainText(
      "1 areas",
    );
    await expect(page.getByTestId("route-unknown-accessibility")).toContainText(
      "2 connections",
    );
    await expect(page.getByTestId("route-transit-places")).toContainText(
      "01-2 · Unconfirmed transit room",
    );
    await page.screenshot({
      path: test.info().outputPath("transit-enabled-actual-worker.png"),
      fullPage: true,
    });
    await page.getByText("Change journey", { exact: true }).click();
    await transit.uncheck();
    await expect(page.getByTestId("route-status")).toBeEmpty();
    await expect(page.getByTestId("route-unknown-access")).toHaveCount(0);
    await expect(page.getByTestId("route-transit-places")).toHaveCount(0);
    await transit.check();
    await page
      .getByLabel("Route preference", { exact: true })
      .selectOption("accessible");
    await getDirections.click();
    await expect(page.getByTestId("route-status")).toContainText(
      "No confirmed step-free route",
      { timeout: 60_000 },
    );
    await page.screenshot({
      path: test.info().outputPath("step-free-refusal-actual-worker.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("manual map entry remains available and configured load failures can retry", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const appUrl =
    process.env.PROGRESSIVE_VISITOR_APP_URL ??
    "http://127.0.0.1:42554/openindoormaps/";
  const manifestUrl = new URL("visitor-ui-fixture/manifest.json", appUrl).href;
  const { files } = progressiveVisitorUiFixture(manifestUrl);
  let failManifest = false;
  await page.addInitScript(() =>
    localStorage.setItem("openindoormaps.reveal-rooms-on-zoom.v2", "false"),
  );
  await page.route("**/visitor-ui-fixture/**", async (route) => {
    const url = route.request().url();
    const body = files.get(url);
    const fail = url === manifestUrl && failManifest;
    await route.fulfill({
      status: fail ? 503 : body ? 200 : 404,
      body: fail
        ? "Map unavailable"
        : body
          ? Buffer.from(body)
          : "Missing fixture",
    });
  });
  await page.goto(`${appUrl}#/projects/visitor`);
  const input = page.getByLabel("Map manifest URL", { exact: true });
  await expect(input).toBeVisible({ timeout: 60_000 });
  await input.fill(manifestUrl);
  await page.getByRole("button", { name: "Open map", exact: true }).click();
  await expect(page.getByLabel("Find a place", { exact: true })).toBeVisible();
  failManifest = true;
  await page.goto(
    `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl)}&load-check=1`,
  );
  const retry = page.getByRole("button", {
    name: "Retry loading map",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(input).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open saved map", exact: true }),
  ).toBeVisible();
  failManifest = false;
  await retry.click();
  await expect(page.getByLabel("Find a place", { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
});
