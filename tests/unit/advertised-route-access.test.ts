import assert from "node:assert/strict";
import test from "node:test";
import { progressiveRoutingFixture } from "../fixtures/progressive-routing";
import {
  auditAdvertisedRouteAccess,
  validateAdvertisedRouteCases,
  type AdvertisedRouteCase,
} from "../../scripts/indoor/advertised-route-access";

function setup() {
  const data = progressiveRoutingFixture();
  const request: AdvertisedRouteCase = {
    id: "synthetic-public-route",
    from: data.records[0].key,
    to: data.records[1].key,
    mode: "public",
    options: { endpointMode: "inside" },
  };
  return { data, request };
}
test("a current calculated public fixture passes access only and preserves source", () => {
  const { data, request } = setup();
  const before = JSON.stringify(data);
  const audit = auditAdvertisedRouteAccess(data, [request]);
  assert.equal(audit.advertisedAccessPassed, true);
  assert.equal(audit.routesComputed, 1);
  assert.deepEqual(audit.routes[0].sourceEdgeIds, ["synthetic-walk"]);
  assert.equal(audit.geometryAuthority, false);
  assert.equal(audit.physicalDeviceAuthority, false);
  assert.equal(JSON.stringify(data), before);
});
test("unknown or restricted endpoints refuse without allocating a route graph", () => {
  for (const access of ["unknown", "staff"] as const) {
    const { data, request } = setup();
    data.records[0].access = access;
    const audit = auditAdvertisedRouteAccess(data, [request]);
    assert.equal(audit.advertisedAccessPassed, false);
    assert.equal(audit.routesComputed, 0);
    assert(
      audit.routes[0].problems.some(
        (p) => p.kind === `${access}-endpoint-access`,
      ),
    );
    assert.equal(data.records[0].access, access);
  }
});
test("source owner census prevents omitted unknown owners being advertised public", () => {
  const { data, request } = setup();
  data.records.push({
    ...structuredClone(data.records[0]),
    key: "unknown-source-owner",
    access: "unknown",
  });
  data.edges[0].roomKeys.push("unknown-source-owner");
  const audit = auditAdvertisedRouteAccess(data, [request]);
  assert.equal(audit.routesComputed, 1);
  assert.equal(audit.advertisedAccessPassed, false);
  assert(
    audit.routes[0].problems.some((p) => p.key === "unknown-source-owner"),
  );
});
test("an unowned source connection cannot inherit endpoint public access", () => {
  const { data, request } = setup();
  data.edges[0].roomKeys = [];
  const audit = auditAdvertisedRouteAccess(data, [request]);
  assert.equal(audit.advertisedAccessPassed, false);
  assert(
    audit.routes[0].problems.some(
      (p) => p.kind === "unowned-source-edge-access",
    ),
  );
});
test("step-free advertising retains normal refusal of unknown or stair edges", () => {
  for (const kind of ["walk", "stairs"] as const) {
    const { data, request } = setup();
    data.edges[0].kind = kind;
    data.edges[0].accessible = kind === "walk" ? "unknown" : "yes";
    const audit = auditAdvertisedRouteAccess(data, [
      { ...request, mode: "accessible" },
    ]);
    assert.equal(audit.advertisedAccessPassed, false);
    assert.equal(audit.routes[0].routeAvailable, false);
  }
});
test("walking does not falsely advertise an unconfirmed step-free property", () => {
  const { data, request } = setup();
  data.edges[0].accessible = "unknown";
  const audit = auditAdvertisedRouteAccess(data, [request]);
  assert.equal(audit.advertisedAccessPassed, true);
  assert.equal(audit.routes[0].unknownAccessibilityEdges, 1);
});
test("empty, ambiguous-profile and unsupported-grant case lists are rejected", () => {
  const { request } = setup();
  for (const cases of [
    [],
    [request, request],
    [{ ...request, mode: "staff" }],
    [{ ...request, options: { assumePublic: true } }],
  ])
    assert.throws(() => validateAdvertisedRouteCases(cases));
});
