import test from "node:test";
import assert from "node:assert/strict";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  readProjectRouteLink,
  projectRouteLinkUrl,
} from "../../app/indoor-project/route-link";
import { routeSearch } from "../../app/utils/deep-link";

const record = (key: string, overrides = {}) =>
  ({
    key,
    name: "Shared label",
    number: "",
    properties: {},
    walkable: true,
    access: "public",
    ...overrides,
  }) as IndoorRecord;
const data = {
  records: [
    record("a & b"),
    record("rm-2"),
    record("staff", { access: "staff" }),
    record("closed", { walkable: false }),
  ],
} as Pick<IndoorDataset, "records">;

test("stable string identities and accessible mode survive both hosting styles", () => {
  for (const base of [
    "https://example.test/openindoormaps/#/projects/indoor?package=%2Fproject.json&manifest=%2Fm.json&view=2d",
    "https://example.test/projects/indoor?package=%2Fproject.json&manifest=%2Fm.json&view=2d#details",
  ]) {
    const state = { start: "a & b", end: "rm-2", mode: "accessible" as const };
    const link = projectRouteLinkUrl(state, base);
    assert.deepEqual(readProjectRouteLink(routeSearch(link), data), {
      ...state,
      notice: "",
    });
    assert.equal(
      new URLSearchParams(routeSearch(link)).get("package"),
      "/project.json",
    );
    assert.equal(
      new URLSearchParams(routeSearch(link)).get("manifest"),
      "/m.json",
    );
    assert.equal(projectRouteLinkUrl(state, link), link);
    assert.equal(
      projectRouteLinkUrl({ start: "", end: "", mode: "public" }, link),
      base,
    );
  }
});

test("unknown, renamed-label, restricted and closed endpoints refuse selection", () => {
  for (const key of ["missing", "Shared label", "staff", "closed"]) {
    const state = readProjectRouteLink(
      `from=${encodeURIComponent(key)}&to=rm-2`,
      data,
    );
    assert.equal(state.start, "");
    assert.equal(state.end, "rm-2");
    assert.match(state.notice, /unavailable/);
  }
});

test("missing arrival remains available for normal refusal; no route authority is invented", () => {
  assert.equal(
    readProjectRouteLink("to=rm-2&profile=accessible", data).end,
    "rm-2",
  );
  assert.equal(
    readProjectRouteLink("to=rm-2&profile=accessible", data).mode,
    "accessible",
  );
  assert.equal(readProjectRouteLink("profile=staff", data).mode, "public");
  assert.equal(
    new URLSearchParams(
      routeSearch(
        projectRouteLinkUrl(
          { start: "", end: "rm-2", mode: "public" },
          "https://example.test/#/projects/indoor?accessible=1&profile=accessible",
        ),
      ),
    ).has("accessible"),
    false,
  );
});
