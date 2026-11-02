/** Extra route cases accepted by export-published-route-hydration.ts.
 *
 * A case may carry explicit visitor routing options. When `options` is
 * present, both keys are required, so the recorded case says exactly which
 * arrival mode and ordinary-room transit rule were calculated; the access
 * profile remains `mode`. Without `options` the calculator keeps its legacy
 * defaults (all arrival choices, ordinary-room fallback allowed) and the case
 * is recorded byte-for-byte as before. */
import assert from "node:assert/strict";
import type { RouteCase } from "./pathway-candidate-audit";

export type ExplicitRouteCaseOptions = {
  endpointMode: "inside" | "hallway";
  allowOtherRoomTransit: boolean;
};

const fields = [
  "name",
  "start",
  "end",
  "mode",
  "expect",
  "intendedEdgeId",
  "forbiddenEdgeIds",
  "options",
];

export function parseExtraRouteCases(bytes: Uint8Array): RouteCase[] {
  assert(
    bytes.length > 0 && bytes.length <= 1024 * 1024,
    "Actual extra route case bytes exceed their JSON parse bound",
  );
  const extraCases = JSON.parse(new TextDecoder().decode(bytes)) as RouteCase[];
  assert(
    Array.isArray(extraCases) &&
      extraCases.length > 0 &&
      extraCases.length <= 128,
  );
  for (const c of extraCases) {
    assert(c && typeof c === "object" && !Array.isArray(c));
    assert(
      Object.keys(c).every((key) => fields.includes(key)),
      "Unknown extra route-case field",
    );
    for (const key of ["name", "start", "end"] as const)
      assert(
        typeof c[key] === "string" &&
          c[key].length > 0 &&
          c[key].length <= 2000,
      );
    assert(c.mode === "public" || c.mode === "accessible");
    assert(
      c.expect === undefined || c.expect === "route" || c.expect === "blocked",
    );
    if (c.intendedEdgeId !== undefined) {
      assert(
        typeof c.intendedEdgeId === "string" && c.intendedEdgeId.length > 0,
      );
      assert.equal(
        c.expect,
        "route",
        "An intended positive edge must require an actual route",
      );
    }
    if (c.forbiddenEdgeIds !== undefined)
      assert(
        Array.isArray(c.forbiddenEdgeIds) &&
          c.forbiddenEdgeIds.every(
            (id) => typeof id === "string" && id.length > 0,
          ) &&
          new Set(c.forbiddenEdgeIds).size === c.forbiddenEdgeIds.length,
      );
    if (c.options !== undefined) {
      const o = c.options as unknown;
      assert(
        o !== null &&
          typeof o === "object" &&
          !Array.isArray(o) &&
          Object.keys(o).length === 2 &&
          Object.keys(o).every((key) =>
            ["endpointMode", "allowOtherRoomTransit"].includes(key),
          ),
        "Explicit route options need exactly endpointMode and allowOtherRoomTransit",
      );
      assert(
        c.options.endpointMode === "inside" ||
          c.options.endpointMode === "hallway",
        "Invalid explicit endpoint mode",
      );
      assert.equal(
        typeof c.options.allowOtherRoomTransit,
        "boolean",
        "Invalid explicit other-room transit preference",
      );
    }
  }
  return extraCases;
}

/** The options a calculator receives for a case: none for a legacy case. */
export const routeCaseCalculatorOptions = (c: RouteCase) =>
  c.options === undefined
    ? undefined
    : {
        endpointMode: c.options.endpointMode,
        allowOtherRoomTransit: c.options.allowOtherRoomTransit,
      };
