import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { progressiveRouteOptions } from "../../app/indoor-project/progressive-route-options";

/** Run the actual worker entry with controlled transport/calculator adapters.
 * This checks the message boundary, not physical routing; browser cases use
 * the real bundled worker and complete synthetic routing source separately. */
const source = readFileSync(
  new URL(
    "../../app/indoor-project/progressive-route.worker.ts",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function worker() {
  const calculations: unknown[][] = [];
  const responses: { requestId: number; error?: string; prepared?: boolean }[] =
    [];
  let loads = 0;
  const data = {
    records: [
      { key: "a", number: "A" },
      { key: "b", number: "B" },
    ],
  };
  const dependencies: Record<string, unknown> = {
    "./heavy-worker-schedule": { holdHeavyWorkerLifetimeLock() {} },
    "./native-exact-geos-overlay": {
      async initializeNativeExactGeosOverlay() {},
    },
    "./progressive-route-preparation": {
      async prepareProgressiveRouteCalculator() {
        return (...args: unknown[]) => {
          calculations.push(args);
          return { route: null };
        };
      },
    },
    "./progressive-route-summary": {
      progressiveRouteSummary: () => ({ transitPlaces: [] }),
    },
    "./visitor-metadata": { projectPlaceDisplayName: () => "Fixture place" },
    "./navigation-steps": { projectNavigationSteps: () => [] },
    "./progressive-route-options": { progressiveRouteOptions },
    "./progressive-visitor-client": {
      ProgressiveVisitorClient: {
        fromManifest(url: string, manifest: unknown) {
          loads++;
          return { manifestUrl: url, manifest, loadRouting: async () => data };
        },
      },
    },
  };
  const context = vm.createContext({
    exports: {},
    require(name: string) {
      assert(name in dependencies, `Unexpected worker dependency ${name}`);
      return dependencies[name];
    },
    postMessage(response: (typeof responses)[number]) {
      responses.push(response);
    },
  });
  vm.runInContext(compiled, context);
  return {
    calculations,
    responses,
    loads: () => loads,
    async send(extra: Record<string, unknown> = {}) {
      context.onmessage({
        data: {
          requestId: responses.length + 1,
          revisionSha256: "a".repeat(64),
          delivery: {
            url: "https://example.test/map.json",
            manifest: { revisionSha256: "a".repeat(64) },
          },
          start: "a",
          end: "b",
          mode: "public",
          ...extra,
        },
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      return responses.at(-1)!;
    },
  };
}

test("worker keeps explicit hallway/transit options through checked calculation", async () => {
  const w = worker();
  await w.send({
    options: { endpointMode: "hallway", allowOtherRoomTransit: true },
  });
  assert.equal(w.responses[0].error, undefined);
  assert.deepEqual(structuredClone(w.calculations), [
    [
      "a",
      "b",
      "public",
      {
        endpointMode: "hallway",
        allowOtherRoomTransit: true,
        preferHallways: true,
      },
    ],
  ]);
  await w.send({ delivery: undefined, mode: "accessible" });
  assert.equal(w.loads(), 1);
  assert.deepEqual(structuredClone(w.calculations[1]), [
    "a",
    "b",
    "accessible",
    {
      endpointMode: "inside",
      allowOtherRoomTransit: false,
      preferHallways: true,
    },
  ]);
});

test("worker rejects injected authority flags and malformed options before source loading", async () => {
  for (const options of [
    null,
    { allowOtherRoomTransit: "false" },
    { policy: {} },
    { useSharedCorridorGuides: false },
  ]) {
    const w = worker();
    assert.match((await w.send({ options })).error ?? "", /Invalid/);
    assert.equal(w.loads(), 0);
    assert.equal(w.calculations.length, 0);
  }
});

test("worker rejects nonvisitor route profiles", async () => {
  for (const mode of ["staff", "evacuation", null]) {
    const w = worker();
    assert.match(
      (await w.send({ mode })).error ?? "",
      /visitor routing profile/,
    );
    assert.equal(w.loads(), 0);
    assert.equal(w.calculations.length, 0);
  }
});

test("worker preparation remains lazy and does not calculate a route", async () => {
  const w = worker();
  assert.equal((await w.send({ prepareOnly: true })).prepared, true);
  assert.equal(w.loads(), 1);
  assert.equal(w.calculations.length, 0);
});
