import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorRecord } from "../../app/indoor-project/contract";
import type { ProjectRoute } from "../../app/indoor-project/viewer-routing";
import { isVisitorHallway } from "../../app/indoor-project/place-discovery";
import { isPassThroughPlace } from "../../app/indoor-project/display-passages";

const zip = process.env.INDOOR_PROJECT_ZIP,
  output = process.env.FLOOR_NAV_BROWSER_OUTPUT,
  audit = process.env.FLOOR_NAV_AUDIT,
  multifloorOnly = process.env.FLOOR_NAV_MULTIFLOOR_ONLY === "1";
test.skip(
  !zip || !output || (!audit && !multifloorOnly),
  "Set INDOOR_PROJECT_ZIP, FLOOR_NAV_BROWSER_OUTPUT and FLOOR_NAV_AUDIT",
);
type Reply = {
  worker: number;
  start: string;
  end: string;
  mode: string;
  route: ProjectRoute | null;
  diagnostic?: { message: string };
};
const replies = (page: Page) =>
  page.evaluate(
    () =>
      (globalThis as unknown as { floorRouteReplies: Reply[] })
        .floorRouteReplies,
  );
const escape = (s: string) =>
  s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

test("complete-floor journey and both sides of an actual lift transition on desktop/mobile", async ({
  page,
}) => {
  test.setTimeout(2_700_000);
  await mkdir(output!, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Original = globalThis.Worker;
    let serial = 0;
    const state = globalThis as unknown as { floorRouteReplies: Reply[] };
    state.floorRouteReplies = [];
    globalThis.Worker = class extends Original {
      private readonly sequence = ++serial;
      private readonly requests = new Map<
        number,
        { start: string; end: string; mode: string }
      >();
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (event) => {
          const request = this.requests.get(event.data?.requestId);
          if (request && event.data?.value && "route" in event.data.value)
            state.floorRouteReplies.push({
              worker: this.sequence,
              ...request,
              route: event.data.value.route,
              diagnostic: event.data.value.diagnostic,
            });
        });
      }
      postMessage(
        message: Parameters<Worker["postMessage"]>[0],
        transferOrOptions?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (message.start && message.end)
          this.requests.set(message.requestId, {
            start: message.start,
            end: message.end,
            mode: message.mode,
          });
        if (Array.isArray(transferOrOptions))
          super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
  });
  const raw = unzipSync(await readFile(zip!), {
    filter: (e) => e.name === "viewer/indoor.json",
  });
  const records = new Map<string, IndoorRecord>(
    (
      JSON.parse(strFromU8(raw["viewer/indoor.json"])).records as IndoorRecord[]
    ).map((r) => [r.key, r]),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/openindoormaps/#/projects/indoor?view=2d");
  await page.locator('input[type="file"]').setInputFiles(zip!);
  await expect(
    page.getByRole("status").filter({ hasText: "Loaded" }),
  ).toBeVisible({ timeout: 900_000 });
  const select = async (label: string, place: IndoorRecord) => {
    await page.getByLabel(label, { exact: true }).fill(place.number);
    await page
      .getByRole("option", { name: new RegExp(`^${escape(place.number)} ·`) })
      .click();
  };
  const waitRoute = async (start: string, end: string) => {
    await expect
      .poll(
        async () =>
          (await replies(page)).some((r) => r.start === start && r.end === end),
        { timeout: 900_000, intervals: [1000] },
      )
      .toBe(true);
    const reply = (await replies(page)).findLast(
      (r) => r.start === start && r.end === end,
    )!;
    expect(reply.route, reply.diagnostic?.message).not.toBeNull();
    await expect(page.getByTestId("project-route-result")).toBeVisible();
    await expect(page.getByTestId("project-route-result")).toContainText(
      `${reply.route!.distanceMetres.toFixed(1)} m`,
    );
    return reply;
  };
  const readyFloor = async () => {
    await expect(
      page.getByRole("progressbar", { name: /^Preparing / }),
    ).toBeHidden({ timeout: 900_000 });
  };
  let floorReply: Reply | undefined;
  let sameFloorCase:
    | { start: string; end: string; from: string; to: string }
    | undefined;
  if (!multifloorOnly) {
    // Select an actually calculated long same-floor case, not a drawn preview.
    let same:
      | {
          start: string;
          end: string;
          distanceMetres: number;
          sourceEdgeIds: string[];
        }
      | undefined;
    await expect
      .poll(
        async () => {
          const rows = (await readFile(audit!, "utf8").catch(() => ""))
            .split("\n")
            .filter(Boolean)
            .flatMap((s) => {
              try {
                return [JSON.parse(s)];
              } catch {
                return [];
              }
            });
          const candidates = rows
            .filter(
              (r) =>
                r.available &&
                r.mode === "public" &&
                r.tags.some((t: string) => t.startsWith("every-floor")) &&
                r.transitions.length === 0 &&
                [r.start, r.end].every((k) => {
                  const place = records.get(k);
                  return (
                    place &&
                    place.levelId === 402_367 &&
                    place.number &&
                    !place.stair &&
                    !isVisitorHallway(place) &&
                    !isPassThroughPlace(place)
                  );
                }),
            )
            .sort((a, b) => b.distanceMetres - a.distanceMetres);
          same = candidates[0];
          return !!same;
        },
        { timeout: 600_000, intervals: [2000] },
      )
      .toBe(true);
    const from = records.get(same!.start)!,
      to = records.get(same!.end)!;
    await page.getByLabel("Search indoor map", { exact: true }).fill(to.number);
    await page
      .getByRole("button", { name: new RegExp(`^${escape(to.number)} ·`) })
      .click();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await select("Route start", from);
    floorReply = await waitRoute(from.key, to.key);
    sameFloorCase = {
      start: from.key,
      end: to.key,
      from: from.number,
      to: to.number,
    };
    expect(floorReply.route!.edges.map((e) => e.id)).toEqual(
      same!.sourceEdgeIds,
    );
    expect(
      floorReply.route!.paths.every((p) =>
        p.levelIds.every((id) => id === 402_367),
      ),
    ).toBe(true);
    await readyFloor();
    await page.getByRole("button", { name: "Fit route", exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(output!, "desktop-full-floor-route.png"),
    });
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("mobile-current-instruction")).toBeVisible();
    await page.getByRole("button", { name: "Fit route", exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(output!, "mobile-full-floor-route.png"),
    });
    await page
      .getByRole("button", { name: "Close", exact: true })
      .filter({ visible: true })
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const upper = [...records.values()].find((r) => r.number === "05-411")!,
    lower = [...records.values()].find((r) => r.number === "05-341")!;
  if (multifloorOnly) {
    await page
      .getByLabel("Search indoor map", { exact: true })
      .fill(upper.number);
    await page
      .getByRole("button", { name: new RegExp(`^${escape(upper.number)} ·`) })
      .click();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page
      .getByRole("button", { name: "Clear route destination", exact: true })
      .click();
    await select("Route start", upper);
    await select("Route destination", lower);
  } else {
    await page
      .getByRole("button", { name: "Clear route start", exact: true })
      .click();
    await select("Route destination", lower);
    await select("Route start", upper);
  }
  const multi = await waitRoute(upper.key, lower.key);
  // Floor preparation may release an idle graph; record reuse without
  // treating worker lifetime as a routing correctness requirement.
  const lift = multi.route!.edges.find((e) => e.kind === "elevator");
  expect(lift).toBeDefined();
  expect(multi.route!.paths.some((p) => p.levelIds.includes(402_367))).toBe(
    true,
  );
  expect(multi.route!.paths.some((p) => p.levelIds.includes(400_176))).toBe(
    true,
  );
  expect(multi.route!.edges.some((e) => e.kind === "stairs")).toBe(false);
  await readyFloor();
  await page.getByRole("button", { name: "Fit route", exact: true }).click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(output!, "desktop-multifloor-result.png"),
  });
  await page
    .getByRole("button", { name: "Preview directions", exact: true })
    .click();
  await readyFloor();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Fit route", exact: true }).click();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(output!, "desktop-multifloor-upper.png"),
  });
  const transition = page
    .getByTestId("hospital-step-list")
    .getByRole("button", { name: /Take the elevator down/ });
  await transition.click();
  await page.waitForTimeout(800);
  await readyFloor();
  await expect(transition).toHaveAttribute("aria-current", "step");
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(output!, "desktop-lift-transition.png"),
  });
  await page
    .getByRole("button", { name: "Next step", exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForTimeout(800);
  await readyFloor();
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(output!, "desktop-multifloor-lower.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("mobile-route-floor")).toContainText("Floor 3");
  await page
    .getByRole("button", { name: "Previous step", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByTestId("mobile-current-instruction")).toContainText(
    "elevator down",
  );
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(output!, "mobile-lift-transition.png"),
  });
  await page
    .getByRole("button", { name: "Next step", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByTestId("mobile-route-floor")).toContainText("Floor 3");
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(output!, "mobile-multifloor-lower.png"),
  });
  expect(errors).toEqual([]);
  await writeFile(
    path.join(output!, "browser-proof.json"),
    JSON.stringify(
      {
        status: "passed",
        errors,
        scope: multifloorOnly ? "multifloor-only" : "same-floor-and-multifloor",
        sameFloorCase,
        multifloorCase: {
          start: upper.key,
          end: lower.key,
          from: upper.number,
          to: lower.number,
        },
        sameWorker: floorReply ? multi.worker === floorReply.worker : undefined,
        replies: await replies(page),
      },
      null,
      2,
    ),
  );
});
