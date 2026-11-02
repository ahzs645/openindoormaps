import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { visitorPlanWanted } from "../../app/pages/progressive-visitor-plan-demand";

const revision = "a".repeat(64);
const main = `${revision}:combined-main`;
const floor2 = `${revision}:floor-2`;
const opening = {
  scopeKey: main,
  admitted: true,
  locked: false,
  mode: "2d",
  detail: false,
  requestedDetailScope: "",
  shownScope: "",
};

test("the opening overview does not load the default floor's checked plan", () => {
  assert.equal(visitorPlanWanted(opening), false);
  // Another floor's earlier request does not load this floor.
  assert.equal(
    visitorPlanWanted({
      ...opening,
      requestedDetailScope: floor2,
      shownScope: floor2,
    }),
    false,
  );
  // A key from another manifest revision is not this floor.
  assert.equal(
    visitorPlanWanted({
      ...opening,
      shownScope: `${"b".repeat(64)}:combined-main`,
    }),
    false,
  );
});

test("zooming to room detail, a kept detail request or a shown floor loads its plan", () => {
  assert.equal(visitorPlanWanted({ ...opening, detail: true }), true);
  // Zooming back out keeps a plan that was requested for this floor.
  assert.equal(
    visitorPlanWanted({ ...opening, requestedDetailScope: main }),
    true,
  );
  // A route focus, located place or chosen floor loads it at any zoom.
  assert.equal(visitorPlanWanted({ ...opening, shownScope: main }), true);
  assert.equal(
    visitorPlanWanted({ ...opening, scopeKey: floor2, shownScope: floor2 }),
    true,
  );
});

test("3D, the locked building overview and unadmitted floors never load a plan", () => {
  const wanted = { ...opening, detail: true, shownScope: main };
  assert.equal(visitorPlanWanted({ ...wanted, mode: "3d" }), false);
  assert.equal(visitorPlanWanted({ ...wanted, mode: "relative" }), false);
  assert.equal(visitorPlanWanted({ ...wanted, locked: true }), false);
  assert.equal(visitorPlanWanted({ ...wanted, admitted: false }), false);
});

test("the visitor page gates plan loading and marks shown floors in its handlers", () => {
  const page = readFileSync(
    new URL("../../app/pages/progressive-visitor-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /const planWanted = visitorPlanWanted\(\{/);
  assert.doesNotMatch(
    page,
    /const planWanted =\s*!locked &&\s*mode === "2d"/,
    "The plan must not load at startup regardless of zoom",
  );
  // Route and instruction focus, located places and the floor picker.
  const handler = (name: string) => {
    const start = page.indexOf(`const ${name} = `);
    assert(start !== -1, `${name} handler`);
    return page.slice(start, page.indexOf("\n  };\n", start));
  };
  assert.match(handler("focusInstruction"), /showScope\(preview\.scope\.id\)/);
  assert.match(handler("locate"), /showScope\(scope\.id\)/);
  assert.match(
    page,
    /setScopeId\(event\.target\.value\);\s*showScope\(event\.target\.value\);/,
  );
  // Opening a map (or reopening the saved one) starts again from the overview.
  assert.match(page, /setPlanState\(undefined\);\s*setShownScope\(""\);/);
});
