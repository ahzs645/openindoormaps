/** Coverage from this invocation's complete normal and production-worker runs.
 * Inventory completeness, local topology and available journeys remain separate. */
import assert from "node:assert/strict";
import { routeRequestOptionsKey } from "../../../app/indoor-project/routing-options";
import {
  validateCandidateRouteCases,
  type CandidateRouteCase,
} from "./shared-corridor-acceptance";

export type ConnectionSourceBinding = {
  sourceMasterSha256: string;
  sourceModelSha256: string;
  sourceRoomsSha256: string;
};
export type ConnectionRequest =
  | {
      id: string;
      direction: "forward" | "reverse";
      state: "bound";
      routeCase: CandidateRouteCase;
    }
  | {
      id: string;
      direction: "forward" | "reverse";
      state: "evidence-required";
      mode: "public" | "accessible";
      reason: string;
    };
export type ConnectionInventory = {
  format: "connection-acceptance-inventory-v1";
  source: ConnectionSourceBinding;
  casesSha256: string;
  inventoryComplete: boolean;
  scope: string;
  connections: {
    id: string;
    label: string;
    evidence: string;
    requests: ConnectionRequest[];
  }[];
};
export type CurrentNormalConnectionResult = {
  id: string;
  runId: string;
  available: boolean;
  diagnosticParity: boolean;
  requiredSourceEdgesVerified: boolean;
};
export type CurrentWorkerConnectionResult = {
  id: string;
  runId: string;
  status: "PASS" | "FAILED";
  message?: string;
};

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
const isSha = (value: unknown) =>
  typeof value === "string" && /^[\da-f]{64}$/.test(value);
function uniqueId(value: unknown, seen: Set<string>, kind: string) {
  assert(
    nonempty(value) && !seen.has(value),
    `Invalid or duplicate ${kind} ID`,
  );
  seen.add(value);
}
function onlyKeys(value: object, keys: readonly string[], kind: string) {
  assert(
    Object.keys(value).every((key) => keys.includes(key)),
    `Unsupported ${kind} field`,
  );
}
function object(value: unknown): asserts value is Record<string, unknown> {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    "Expected an object",
  );
}

export function validateConnectionInventory(
  value: unknown,
  source: ConnectionSourceBinding,
  cases: readonly CandidateRouteCase[],
  casesSha256: string,
): asserts value is ConnectionInventory {
  object(value);
  onlyKeys(
    value,
    [
      "format",
      "source",
      "casesSha256",
      "inventoryComplete",
      "scope",
      "connections",
    ],
    "inventory",
  );
  assert.equal(value.format, "connection-acceptance-inventory-v1");
  object(value.source);
  object(source);
  const sourceFields = [
    "sourceMasterSha256",
    "sourceModelSha256",
    "sourceRoomsSha256",
  ] as const;
  onlyKeys(source, sourceFields, "source binding");
  assert(
    sourceFields.every((key) => isSha(source[key])),
    "Invalid current source binding",
  );
  assert.deepEqual(value.source, source, "Inventory belongs to another source");
  assert(
    isSha(casesSha256) && value.casesSha256 === casesSha256,
    "Inventory route cases changed",
  );
  assert.equal(
    typeof value.inventoryComplete,
    "boolean",
    "Inventory completeness must be explicit",
  );
  assert(nonempty(value.scope), "Inventory scope is required");
  assert(
    Array.isArray(value.connections) && value.connections.length > 0,
    "Inventory needs explicit connections",
  );
  const caseMap = new Map(cases.map((item) => [item.id, item]));
  assert.equal(caseMap.size, cases.length, "Duplicate case IDs");
  const connectionIds = new Set<string>(),
    requestIds = new Set<string>(),
    claimedCases = new Set<string>();
  const claimedJourneys = new Set<string>();
  for (const connection of value.connections) {
    object(connection);
    onlyKeys(connection, ["id", "label", "evidence", "requests"], "connection");
    uniqueId(connection.id, connectionIds, "connection");
    assert(
      nonempty(connection.label) && nonempty(connection.evidence),
      "Connection label and evidence scope are required",
    );
    assert(
      Array.isArray(connection.requests) && connection.requests.length > 0,
      "Connection needs requests",
    );
    for (const request of connection.requests) {
      object(request);
      uniqueId(request.id, requestIds, "request");
      assert(
        ["forward", "reverse"].includes(String(request.direction)),
        "Invalid request direction",
      );
      if (request.state === "evidence-required") {
        onlyKeys(
          request,
          ["id", "direction", "state", "mode", "reason"],
          "unbound request",
        );
        assert(
          ["public", "accessible"].includes(String(request.mode)) &&
            nonempty(request.reason),
          "Unbound request needs a profile and missing-evidence reason",
        );
        continue;
      }
      assert.equal(request.state, "bound", "Unknown connection request state");
      onlyKeys(
        request,
        ["id", "direction", "state", "routeCase"],
        "bound request",
      );
      const selected = [request.routeCase];
      validateCandidateRouteCases(selected);
      const item = selected[0];
      assert.deepEqual(
        item,
        caseMap.get(item.id),
        "Bound request differs from the exact current case",
      );
      uniqueId(item.id, claimedCases, "claimed case");
      const journey = JSON.stringify([
        item.from,
        item.to,
        item.mode,
        routeRequestOptionsKey(item.options),
      ]);
      assert(
        !claimedJourneys.has(journey),
        "The same journey cannot count as multiple connection requests",
      );
      claimedJourneys.add(journey);
      if (item.expected)
        assert(
          item.requiredSourceEdgeIds?.length,
          "Available connection cases must require an exact original crossing edge",
        );
    }
  }
  assert.equal(
    claimedCases.size,
    cases.length,
    "Every current case must belong to exactly one request",
  );
}

export function summarizeConnectionAcceptance(args: {
  inventory: ConnectionInventory;
  runId: string;
  source: ConnectionSourceBinding;
  cases: readonly CandidateRouteCase[];
  casesSha256: string;
  inventorySha256: string;
  implementationSha256: string;
  normal: readonly CurrentNormalConnectionResult[];
  worker: readonly CurrentWorkerConnectionResult[];
  failures: readonly { id: string; message: string }[];
}) {
  validateConnectionInventory(
    args.inventory,
    args.source,
    args.cases,
    args.casesSha256,
  );
  assert(nonempty(args.runId), "Current invocation identity is required");
  assert(
    isSha(args.inventorySha256) && isSha(args.implementationSha256),
    "Current evidence hashes are required",
  );
  const cases = new Set(args.cases.map((item) => item.id));
  const normal = new Map<string, CurrentNormalConnectionResult>();
  for (const row of args.normal) {
    assert(
      cases.has(row.id) && !normal.has(row.id),
      "Foreign or duplicate normal result",
    );
    assert.equal(
      row.runId,
      args.runId,
      "Historical normal results cannot satisfy current coverage",
    );
    normal.set(row.id, row);
  }
  const worker = new Map<string, CurrentWorkerConnectionResult>();
  for (const row of args.worker) {
    assert(
      cases.has(row.id) && !worker.has(row.id),
      "Foreign or duplicate worker result",
    );
    assert.equal(
      row.runId,
      args.runId,
      "Historical worker results cannot satisfy current coverage",
    );
    worker.set(row.id, row);
  }
  const counts = {
    connections: args.inventory.connections.length,
    requests: 0,
    checked: 0,
    available: 0,
    expectedRefusals: 0,
    failed: 0,
    notTested: 0,
    evidenceRequired: 0,
  };
  const connections = args.inventory.connections.map((connection) => ({
    ...connection,
    requests: connection.requests.map((request) => {
      counts.requests++;
      if (request.state === "evidence-required") {
        counts.evidenceRequired++;
        return { ...request, outcome: "EVIDENCE_REQUIRED" as const };
      }
      const item = request.routeCase,
        n = normal.get(item.id),
        w = worker.get(item.id);
      const failures = args.failures.filter(
        (failure) =>
          failure.id === item.id || failure.id === `worker:${item.id}`,
      );
      if (
        failures.length > 0 ||
        w?.status === "FAILED" ||
        (n &&
          (!n.diagnosticParity ||
            n.available !== item.expected ||
            (item.expected && !n.requiredSourceEdgesVerified)))
      ) {
        counts.failed++;
        return {
          ...request,
          outcome: "FAILED" as const,
          normal: n,
          productionWorker: w,
          failures,
        };
      }
      if (!n || !w) {
        counts.notTested++;
        return {
          ...request,
          outcome: "NOT_TESTED" as const,
          normal: n,
          productionWorker: w,
        };
      }
      counts.checked++;
      if (n.available) counts.available++;
      else counts.expectedRefusals++;
      return {
        ...request,
        outcome: n.available
          ? ("AVAILABLE" as const)
          : ("EXPECTED_REFUSAL" as const),
        normal: n,
        productionWorker: w,
      };
    }),
  }));
  return {
    format: "connection-acceptance-results-v1" as const,
    status:
      counts.failed > 0
        ? ("FAILED" as const)
        : counts.notTested > 0 ||
            counts.evidenceRequired > 0 ||
            !args.inventory.inventoryComplete
          ? ("INCOMPLETE" as const)
          : ("CHECKED" as const),
    runId: args.runId,
    source: args.source,
    casesSha256: args.casesSha256,
    inventorySha256: args.inventorySha256,
    implementationSha256: args.implementationSha256,
    inventoryComplete: args.inventory.inventoryComplete,
    scope: args.inventory.scope,
    counts,
    connections,
    campusConnectivityProven: false,
    releaseAcceptance: false,
    published: false,
  };
}
