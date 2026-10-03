import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeepLinkUrl,
  readDeepLink,
  routeSearch,
} from "../../app/utils/deep-link";

test("Pages venue links preserve hash routes and unrelated query parameters", () => {
  const base =
    "https://example.github.io/openindoormaps/?campaign=test#/bc-hospital?token=abc&poi=5";
  const next = buildDeepLinkUrl(
    { from: 37, to: 10, floor: 2, accessible: true },
    base,
  );
  const url = new URL(next);
  assert.equal(url.pathname, "/openindoormaps/");
  assert.equal(url.search, "?campaign=test");
  assert.ok(url.hash.startsWith("#/bc-hospital?"));
  assert.equal(new URLSearchParams(routeSearch(next)).get("token"), "abc");
  assert.deepEqual(readDeepLink(routeSearch(next)), {
    poi: undefined,
    from: 37,
    to: 10,
    floor: 2,
    accessible: true,
  });
  assert.equal(
    buildDeepLinkUrl(
      {},
      "https://example.github.io/openindoormaps/#/bc-hospital?poi=1",
    ),
    "https://example.github.io/openindoormaps/#/bc-hospital",
  );
});

test("Browser routes keep their existing query and anchor behavior", () => {
  const next = buildDeepLinkUrl(
    { poi: 118 },
    "http://localhost:5173/bc-hospital?token=abc&from=1#details",
  );
  assert.equal(
    next,
    "http://localhost:5173/bc-hospital?token=abc&poi=118#details",
  );
  assert.equal(routeSearch(next), "?token=abc&poi=118");
  assert.equal(
    routeSearch("https://example.github.io/openindoormaps/#/projects/indoor"),
    "",
  );
});
