import test from "node:test";
import assert from "node:assert/strict";
import {
  summarizeConnectionAcceptance,
  validateConnectionInventory,
  type ConnectionInventory,
  type CurrentNormalConnectionResult,
  type CurrentWorkerConnectionResult,
} from "../../scripts/indoor/lib/connection-acceptance";
import type { CandidateRouteCase } from "../../scripts/indoor/lib/shared-corridor-acceptance";

function fixture() {
  const source = {
    sourceMasterSha256: "a".repeat(64),
    sourceModelSha256: "b".repeat(64),
    sourceRoomsSha256: "c".repeat(64),
  };
  const casesSha256 = "d".repeat(64);
  const cases: CandidateRouteCase[] = [
    {
      id: "outbound",
      from: "A",
      to: "B",
      mode: "public",
      options: { endpointMode: "hallway", allowOtherRoomTransit: true },
      expected: true,
      requiredSourceEdgeIds: ["original-crossing"],
    },
    {
      id: "step-free",
      from: "A",
      to: "B",
      mode: "accessible",
      options: { endpointMode: "hallway", allowOtherRoomTransit: true },
      expected: false,
    },
  ];
  const inventory: ConnectionInventory = {
    format: "connection-acceptance-inventory-v1",
    source,
    casesSha256,
    inventoryComplete: false,
    scope: "Two exact journeys; another gateway lacks evidenced endpoints.",
    connections: [
      {
        id: "link",
        label: "Link",
        evidence: "Original crossing identity from the source",
        requests: cases.map((routeCase) => ({
          id: routeCase.id,
          direction: "forward",
          state: "bound",
          routeCase: structuredClone(routeCase),
        })),
      },
      {
        id: "unbound-link",
        label: "Another link",
        evidence: "Source ownership unresolved",
        requests: [
          {
            id: "unbound",
            direction: "reverse",
            state: "evidence-required",
            mode: "public",
            reason: "Need supported original doorway and endpoint identities",
          },
        ],
      },
    ],
  };
  const normal: CurrentNormalConnectionResult[] = cases.map((item) => ({
    id: item.id,
    runId: "current",
    available: item.expected,
    diagnosticParity: true,
    requiredSourceEdgesVerified: !!item.requiredSourceEdgeIds?.length,
  }));
  const worker: CurrentWorkerConnectionResult[] = cases.map((item) => ({
    id: item.id,
    runId: "current",
    status: "PASS",
  }));
  return {
    source,
    casesSha256,
    cases,
    inventory,
    normal,
    worker,
    runId: "current",
    inventorySha256: "e".repeat(64),
    implementationSha256: "f".repeat(64),
    failures: [] as { id: string; message: string }[],
  };
}

test("current normal and production-worker evidence distinguishes availability, expected refusal and unresolved scope", () => {
  const args = fixture();
  const result = summarizeConnectionAcceptance(args);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.counts.checked, 2);
  assert.equal(result.counts.available, 1);
  assert.equal(result.counts.expectedRefusals, 1);
  assert.equal(result.counts.evidenceRequired, 1);
  assert.equal(result.campusConnectivityProven, false);
  assert.equal(result.releaseAcceptance, false);
});
test("normal-only success cannot count as checked without a current production-worker replay", () => {
  const args = fixture();
  args.worker = [];
  const result = summarizeConnectionAcceptance(args);
  assert.equal(result.counts.checked, 0);
  assert.equal(result.counts.notTested, 2);
});
test("historical normal or worker PASS rows are rejected", () => {
  const args = fixture();
  args.normal[0].runId = "previous-run";
  assert.throws(() => summarizeConnectionAcceptance(args), /Historical normal/);
  args.normal[0].runId = "current";
  args.worker[0].runId = "previous-run";
  assert.throws(() => summarizeConnectionAcceptance(args), /Historical worker/);
});
test("source, raw case bytes, endpoint direction and policy must match the inventory", () => {
  const args = fixture();
  assert.throws(
    () =>
      validateConnectionInventory(
        args.inventory,
        { ...args.source, sourceRoomsSha256: "0".repeat(64) },
        args.cases,
        args.casesSha256,
      ),
    /another source/,
  );
  assert.throws(
    () =>
      validateConnectionInventory(
        args.inventory,
        args.source,
        args.cases,
        "0".repeat(64),
      ),
    /cases changed/,
  );
  const request = args.inventory.connections[0].requests[0];
  assert.equal(request.state, "bound");
  if (request.state !== "bound") throw new Error("fixture");
  [request.routeCase.from, request.routeCase.to] = [
    request.routeCase.to,
    request.routeCase.from,
  ];
  assert.throws(
    () => summarizeConnectionAcceptance(args),
    /exact current case/,
  );
  request.routeCase = structuredClone(args.cases[0]);
  request.routeCase.options.allowOtherRoomTransit = false;
  assert.throws(
    () => summarizeConnectionAcceptance(args),
    /exact current case/,
  );
});
test("one case cannot count for multiple connections, even with different inventory request names", () => {
  const args = fixture();
  args.inventory.connections[1].requests.push({
    ...structuredClone(args.inventory.connections[0].requests[0]),
    id: "second-claim",
  });
  assert.throws(
    () => summarizeConnectionAcceptance(args),
    /duplicate claimed case/,
  );
});
test("duplicate identical journeys with renamed case IDs cannot inflate coverage", () => {
  const args = fixture();
  const duplicate = {
    ...structuredClone(args.cases[0]),
    id: "renamed-outbound",
  };
  args.cases.push(duplicate);
  args.inventory.connections[0].requests.push({
    id: "third",
    direction: "forward",
    state: "bound",
    routeCase: duplicate,
  });
  assert.throws(() => summarizeConnectionAcceptance(args), /same journey/);
  // An explicitly spelled production default remains the same journey.
  duplicate.options.preferHallways = true;
  assert.throws(() => summarizeConnectionAcceptance(args), /same journey/);
});
test("an available connection needs the exact original crossing and verified traversal", () => {
  const args = fixture();
  args.normal[0].requiredSourceEdgesVerified = false;
  const result = summarizeConnectionAcceptance(args);
  assert.equal(result.counts.failed, 1);
  assert.equal(result.counts.available, 0);
  delete args.cases[0].requiredSourceEdgeIds;
  const request = args.inventory.connections[0].requests[0];
  if (request.state !== "bound") throw new Error("fixture");
  request.routeCase = structuredClone(args.cases[0]);
  assert.throws(
    () => summarizeConnectionAcceptance(args),
    /exact original crossing/,
  );
});
test("worker failures and changed expected availability remain failures", () => {
  const args = fixture();
  args.worker[0] = {
    id: "outbound",
    runId: "current",
    status: "FAILED",
    message: "Worker response differs",
  };
  args.normal[1].available = true;
  const result = summarizeConnectionAcceptance(args);
  assert.equal(result.status, "FAILED");
  assert.equal(result.counts.failed, 2);
  assert.equal(result.counts.checked, 0);
});
test("unclaimed cases, foreign results and persisted PASS fields cannot enter the current coverage report", () => {
  const args = fixture();
  args.inventory.connections[0].requests.pop();
  assert.throws(
    () => summarizeConnectionAcceptance(args),
    /exactly one request/,
  );
  const other = fixture();
  other.normal.push({ ...other.normal[0], id: "foreign" });
  assert.throws(
    () => summarizeConnectionAcceptance(other),
    /Foreign or duplicate/,
  );
  assert.throws(
    () =>
      summarizeConnectionAcceptance({
        ...fixture(),
        inventory: {
          ...fixture().inventory,
          status: "PASS",
        } as ConnectionInventory,
      }),
    /Unsupported inventory/,
  );
});
