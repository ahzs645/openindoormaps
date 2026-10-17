import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  HeavyWorkerSchedule,
  routeRequestReady,
} from "../../app/indoor-project/heavy-worker-schedule";
import {
  ProgressiveRouteClient,
  type ProgressiveRouteWorker,
  type ProgressiveRouteRequest,
} from "../../app/indoor-project/progressive-route-client";
import { sameRoutePlace } from "../../app/indoor-project/visitor-route-state";

/** Exercise the actual page handlers without importing its map/WebGL/loader.
 * The source AST is compiled unchanged; tests do not duplicate its branch logic.
 * Transport is controlled, so a positive request proves scheduling/download
 * intent, not a completed source-geometry calculation. */
const pageSource = ts.createSourceFile(
  "progressive-visitor-page.tsx",
  readFileSync(
    new URL("../../app/pages/progressive-visitor-page.tsx", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function sourceNode(name: string, kind: "variable" | "function") {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (
      (kind === "variable" &&
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === name) ||
      (kind === "function" &&
        ts.isFunctionDeclaration(node) &&
        node.name?.text === name)
    )
      found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(pageSource);
  assert.equal(found.length, 1, `One actual page handler ${name} is required`);
  return found[0];
}
const calculate = sourceNode("calculate", "variable") as ts.VariableDeclaration;
const reset = sourceNode(
  "resetDirections",
  "variable",
) as ts.VariableDeclaration;
assert(calculate.initializer && ts.isArrowFunction(calculate.initializer));
assert(reset.initializer && ts.isCallExpression(reset.initializer));
const resetCallback = reset.initializer.arguments[0];
assert(ts.isArrowFunction(resetCallback));
const compiled = ts.transpileModule(
  `${sourceNode("waitForWorkerSlot", "function").getText(pageSource)}
const resetDirections = (${resetCallback.getText(pageSource)});
globalThis.runPageDirections = (${calculate.initializer.getText(pageSource)});`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup(start: string, end: string, mode = "public") {
  const messages: ProgressiveRouteRequest[] = [];
  let workerCount = 0;
  const routes = new ProgressiveRouteClient(() => {
    workerCount++;
    const worker: ProgressiveRouteWorker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminate() {},
      postMessage(request) {
        messages.push(request);
        queueMicrotask(() =>
          worker.onmessage?.({
            data: {
              requestId: request.requestId,
              value: { route: null },
              steps: [],
              summary: { transitPlaces: [] },
            },
          } as MessageEvent),
        );
      },
    };
    return worker;
  });
  const schedule = new HeavyWorkerSchedule();
  const starts: string[] = [];
  const begin = schedule.begin.bind(schedule);
  schedule.begin = (kind) => {
    starts.push(kind);
    return begin(kind);
  };
  const states: Record<string, unknown[]> = {};
  const write = (key: string) => (value: unknown) =>
    (states[key] ??= []).push(value);
  const context = vm.createContext({
    start,
    end,
    profile: mode,
    client: {
      manifestUrl: "https://map.invalid/manifest.json",
      manifest: { revisionSha256: "a".repeat(64) },
      httpBrotliEnabled: false,
      offlineOnly: false,
    },
    routes,
    heavyWorkerSchedule: schedule,
    routeRequestReady,
    routeEpoch: { current: 0 },
    mapEpoch: { current: 0 },
    routeWaiting: { current: undefined },
    sameRoutePlace,
    AbortController,
    DOMException,
    Error,
    noop() {},
    isAbort: (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError",
    message: String,
    locate() {},
    setCalculating: write("calculating"),
    setRoute: write("route"),
    setSteps: write("steps"),
    setRouteSummary: write("summary"),
    setRouteMessage: write("message"),
  });
  vm.runInContext(compiled, context);
  return {
    run: context.runPageDirections as () => Promise<void>,
    messages,
    states,
    starts,
    workerCount: () => workerCount,
    dispose: () => routes.dispose(),
  };
}

test("actual compact-page handler returns same-place status without scheduling or loading routing", async () => {
  for (const profile of ["public", "accessible"]) {
    const check = setup("original-agora-key", "original-agora-key", profile);
    await check.run();
    assert.equal(check.workerCount(), 0);
    assert.equal(check.messages.length, 0);
    assert.deepEqual(check.starts, []);
    assert.deepEqual(check.states.calculating, [false]);
    assert.match(String(check.states.message.at(-1)), /same place/i);
    assert(
      !check.states.message.some((m) => /Loading|checking/.test(String(m))),
    );
    check.dispose();
  }
});

test("actual compact-page handler still requests checked routing for distinct identities", async () => {
  for (const profile of ["public", "accessible"]) {
    const check = setup("agora-floor-one", "agora-floor-two", profile);
    await check.run();
    assert.equal(check.workerCount(), 1);
    assert.equal(check.messages.length, 1);
    assert(
      check.messages[0].delivery,
      "Initial request carries actual routing-delivery intent",
    );
    assert.equal(check.messages[0].start, "agora-floor-one");
    assert.equal(check.messages[0].end, "agora-floor-two");
    assert.equal(check.messages[0].mode, profile);
    assert.deepEqual(check.starts, ["route"]);
    assert.deepEqual(check.states.calculating, [true, false]);
    assert(
      check.states.message.some((m) => /Loading and checking/.test(String(m))),
    );
    check.dispose();
  }
});

test("actual compact-page handler does not start directions with an unselected endpoint", async () => {
  for (const [start, end] of [
    ["", ""],
    ["original-room", ""],
    ["", "original-room"],
  ]) {
    const check = setup(start, end);
    await check.run();
    assert.equal(check.workerCount(), 0);
    assert.equal(check.messages.length, 0);
    assert.deepEqual(check.starts, []);
    check.dispose();
  }
});
