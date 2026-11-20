"""Prepare exact archived requests that traverse freshly changed cell-918 guides.

Inputs and missing-coverage evidence only. This script runs no routing, import,
export or worker. It never changes the earlier 28-case sample.
"""
from collections import Counter, defaultdict
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "pr4-work/input"
OUT = INPUT / "b10-cell918-changed-guides"
FINAL = ROOT / "pr4-work/qualification-final"
CONTEXT = INPUT / "corridor-source-context.json"
TRIPS = ROOT / "package-audit/atlas-generator/campus-network/campus-update/screenshot-review/upper-landing-release/trips/current-worker.json"
MEASUREMENTS = ROOT / "package-audit/UNBC-continue-01-workflows/evidence/current/browser-measurements.json.gz"
HARNESS = ROOT / "package-audit/UNBC-continue-01-workflows/workflows/check-browser.cjs"
CELL = "native-cell:24.278215:918"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write(name, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    (OUT / name).write_bytes(data)
    return sha(data)


def edge_ids(trip):
    return {e[0] for e in trip.get("edges", [])} | {
        edge for part in trip.get("paths", []) for edge in part.get("edgeIds", [])
    }


OUT.mkdir(exist_ok=False)
old_paths = [INPUT / ("b10-cell918-" + s + ".json") for s in ("cases", "inventory", "case-provenance")]
old_hashes = {str(p.relative_to(ROOT)): file_sha(p) for p in old_paths}
control_path = FINAL / "cell-918-control/prepared-routing.json"
candidate_path = FINAL / "cell-918-retained/prepared-routing.json"
control = json.loads(control_path.read_text())
candidate = json.loads(candidate_path.read_text())
old = {g["edgeId"]: g for g in control["guides"]}
new = {g["edgeId"]: g for g in candidate["guides"]}
assert old.keys() == new.keys()
changed = {key for key in old if old[key] != new[key]}
assert len(changed) == 7

# Reuse the bounded mmap property decoder; never parse the complete 200/302 MB
# source. The context is independently hashed and bound to the complete source.
helper = ROOT / "pr4-work/qualification-20261120/measure-cell-918.py"
spec = importlib.util.spec_from_file_location("cell_measure", helper)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
context_sha = file_sha(CONTEXT)
assert context_sha == "1b6fe9515af82aa9a88de6e55310331063cf86dc686a9e8ecae7c6204e615bdd"
record_list = module.unique_source_property(CONTEXT, "records")
records = {r["key"]: r for r in record_list}
keys = {}
for record in record_list:
    keys[record["number"]] = record["key"]
    keys[record["key"]] = record["key"]
nodes = {n["id"]: n for n in module.unique_source_property(CONTEXT, "nodes")}
edges = {e["id"]: e for e in module.unique_source_property(CONTEXT, "edges")}


def owner(key):
    r = records[key]
    return {k: r.get(k) for k in ("key", "number", "name", "building", "levelId", "access", "walkable")}


def endpoint(node_id):
    n = nodes[node_id]
    return {"node": n, "room": owner(n["roomKey"])}


trip_bytes = TRIPS.read_bytes()
trips = json.loads(trip_bytes)
assert sha(trip_bytes) == "73fbc23ff951ef09530efd439099982184fd03577d94337d511c944e58e50f14"
compressed = MEASUREMENTS.read_bytes()
assert sha(compressed) == "25d3db8d0d101f8a13054781bee41f804c4ec621d9d507b8959b7755f66c6ca2"
measurements = json.loads(gzip.decompress(compressed))
assert trips["datasetSha256"] == measurements["datasetSha256"] == "ecd8af21dd0d83740c5a3b5133298e52d88d71ce1c1db54c46e8642e853f66e3"
assert trips["runtimeSha256"] == measurements["runtimeSha256"]
assert len(trips["trips"]) == len(measurements["rows"]) == 1392
assert "options:{endpointMode:'pathway',allowOtherRoomTransit:false}" in HARNESS.read_text()
trip_index, browser_index = defaultdict(list), defaultdict(list)
for i, trip in enumerate(trips["trips"]):
    trip_index[(trip["from"], trip["to"], trip["mode"])].append((i, trip))
for i, row in enumerate(measurements["rows"]):
    browser_index[(row["a"], row["b"], row["mode"])].append((i, row))
direct = [(i, t) for i, t in enumerate(trips["trips"]) if edge_ids(t) & changed]
assert len(direct) == 34 and all(t["mode"] == "public" for _, t in direct)
pairs = []
seen = set()
for _, trip in direct:
    unordered = tuple(sorted((trip["from"], trip["to"])))
    if unordered not in seen:
        seen.add(unordered)
        pairs.append((trip["from"], trip["to"]))
assert len(pairs) == 17
initial = json.loads(old_paths[0].read_text())
initial_edges = {e for c in initial for e in c.get("requiredSourceEdgeIds", [])}
assert not (initial_edges & changed)
initial_requests = {(c["from"], c["to"], c["mode"]) for c in initial}
options = {"endpointMode": "pathway", "allowOtherRoomTransit": False}
cases, connections, provenance_rows = [], [], []
for pair_i, (a, b) in enumerate(pairs):
    assert records[keys[a]]["building"] == records[keys[b]]["building"] == "10"
    requests = []
    for mode in ("public", "accessible"):
        for direction, start, end in (("forward", a, b), ("reverse", b, a)):
            identity = (start, end, mode)
            assert len(browser_index[identity]) == len(trip_index[identity]) == 1
            browser_i, row = browser_index[identity][0]
            trip_i, trip = trip_index[identity][0]
            assert row["metres"] == trip["metres"]
            assert row["edges"] == [e[0] for e in trip.get("edges", [])]
            expected = row["metres"] is not None
            assert expected == (mode == "public")
            case = {
                "id": f"baseline-row-{browser_i + 1:04d}-{mode}-{start}-to-{end}",
                "from": keys[start], "to": keys[end], "mode": mode,
                "options": options.copy(), "expected": expected,
            }
            assert (case["from"], case["to"], mode) not in initial_requests
            changed_used = sorted(edge_ids(trip) & changed)
            if expected:
                assert len(row["edges"]) == len(set(row["edges"]))
                assert all(edges[e]["enabled"] and edges[e]["nativeCellId"] == CELL for e in row["edges"])
                assert len(changed_used) == 2
                assert any(p.get("sharedCorridorGuideUsed") for p in row["paths"])
                case["requiredSourceEdgeIds"] = row["edges"].copy()
                case["requireSharedGuide"] = True
            else:
                assert trip["diagnostic"]["constraint"] == "pathway-start"
            cases.append(case)
            requests.append({"id": case["id"], "direction": direction, "state": "bound", "routeCase": case})
            provenance_rows.append({
                "caseId": case["id"],
                "zeroBasedArchiveRow": browser_i,
                "zeroBasedWorkerDiagnosticRow": trip_i,
                "portableReplayRequestId": browser_i + 1,
                "requestIdMeaning": "Portable check-browser.cjs uses out.length + 1 in the archived browser order; the stored rows do not contain a wire requestId field.",
                "sourceRequest": {"a": start, "b": end, "mode": mode, "options": options.copy()},
                "resolvedRecords": [owner(keys[start]), owner(keys[end])],
                "changedGuideIdsTraversedInArchive": changed_used,
                "historicalBrowserRow": row,
                "historicalWorkerTrip": trip,
            })
    label = " ↔ ".join(f"{records[keys[k]]['number']} {records[keys[k]]['name']}" for k in (a, b))
    connections.append({
        "id": f"b10-918-changed-{pair_i + 1:02d}", "label": label,
        "evidence": "Exact archived stable-key requests; both public directions traversed two guides changed by the fresh candidate. Accessible counterparts recorded pathway-start refusals. These are future replay inputs, with zero current executions.",
        "requests": requests,
    })

assert len(cases) == len({c["id"] for c in cases}) == 68
source_binding = json.loads((INPUT / "b10-cell918-inventory.json").read_text())["source"]
cases_sha = write("cases.json", cases)
inventory_sha = write("inventory.json", {
    "format": "connection-acceptance-inventory-v1", "source": source_binding,
    "casesSha256": cases_sha, "inventoryComplete": True,
    "scope": "ONLY all 17 archived request pairs whose public routes traverse at least one of the seven fresh cell-918 changed guides, both directions and public/accessible profiles: 68 requests. These recorded requests cover two changed guides; five remain without archived traversal. Complete means this enumerated sample only. Zero current normal/worker requests have been executed from these files. This is not complete cell/campus/accessibility/release qualification.",
    "connections": connections,
})
required = {e for c in cases for e in c.get("requiredSourceEdgeIds", [])}
covered = required & changed
matrix = []
for edge_id in sorted(changed):
    e = edges[edge_id]
    archive_rows = [i for i, t in direct if edge_id in edge_ids(t)]
    case_ids = [c["id"] for c in cases if edge_id in c.get("requiredSourceEdgeIds", [])]
    door_ids = {int(n.split(":")[2]) for n in (e["from"], e["to"]) if n.startswith("door:")}
    adjacent_doors = [d for d in edges.values() if d.get("kind") == "door" and d.get("nativeElementId") in door_ids]
    matrix.append({
        "edgeId": edge_id, "sourceEdge": e,
        "endpoints": [endpoint(e["from"]), endpoint(e["to"])],
        "originalDoorCrossings": [{"edge": d, "endpoints": [endpoint(d["from"]), endpoint(d["to"])]} for d in adjacent_doors],
        "initial28RequiredEdgeCoverage": edge_id in initial_edges,
        "archivedWorkerRows": archive_rows, "archivedTraversalCount": len(archive_rows),
        "supplementalCaseIds": case_ids, "supplementalRequiredEdgeCount": len(case_ids),
        "currentExecutedRequests": 0,
        "status": "ARCHIVED_EXPECTATION_PREPARED_NOT_EXECUTED" if case_ids else "NO_ARCHIVED_TRAVERSAL_NEW_EVIDENCE_REQUIRED",
        "nextEvidence": "Run the preserved archived requests with current normal import and production worker." if case_ids else "Select actual eligible destinations using these original node/room and door bindings. Establish current route/refusal expectations and test both directions; do not infer successful navigation from a saved guide alone.",
    })
coverage_sha = write("changed-guide-coverage.json", {
    "format": "unbc-changed-guide-coverage-v1", "navigationAuthority": False,
    "status": "supplemental-inputs-not-executed", "source": source_binding,
    "controlGuideSha256": file_sha(control_path), "candidateGuideSha256": file_sha(candidate_path),
    "contextSha256": context_sha, "archivedWorkerSha256": sha(trip_bytes),
    "initialSampleSha256": old_hashes[str(old_paths[0].relative_to(ROOT))],
    "counts": {"changedGuides": len(changed), "initial28ChangedGuidesCovered": len(changed & initial_edges), "supplementalCases": len(cases), "expectedPublicRoutes": 34, "expectedAccessibleRefusals": 34, "archivedChangedGuidesCovered": len(covered), "changedGuidesWithoutArchivedTraversal": len(changed - covered), "currentExecutedSupplementalRequests": 0},
    "initialSelectionGap": "The earlier selector required literal 10- prefixed endpoint strings. This omitted archived requests expressed as stable rm-400176-* keys, even though their resolved records are Building 10 destinations.",
    "uncoveredChangedGuideIds": sorted(changed - covered),
    "matrix": matrix,
})
provenance_sha = write("provenance.json", {
    "format": "unbc-archived-case-selection-v1", "status": "verification-inputs-only-not-current-results",
    "navigationAuthority": False, "currentExecutedRequests": 0, "source": source_binding,
    "contextSha256": context_sha, "datasetSha256": measurements["datasetSha256"],
    "recordedRuntimeSha256": measurements["runtimeSha256"], "recordedWorkerAsset": measurements["asset"],
    "recordedWorkerBundleSha256": trips["workerBundleSha256"],
    "compressedMeasurementsSha256": sha(compressed), "workerTripFileSha256": sha(trip_bytes),
    "portableHarnessSha256": file_sha(HARNESS), "generatorSha256": file_sha(Path(__file__)),
    "boundedDecoderSha256": file_sha(helper), "controlGuideSha256": file_sha(control_path),
    "candidateGuideSha256": file_sha(candidate_path), "casesSha256": cases_sha,
    "inventorySha256": inventory_sha, "changedGuideCoverageSha256": coverage_sha,
    "selectionRule": "Inspect every one of 1392 archived worker trips regardless of endpoint label syntax; select unordered pairs having public traversal of a changed candidate guide, then include exact archived public/accessible forward/reverse requests. Resolve records with the original portable harness's number/key lookup.",
    "coverage": {"pairs": 17, "requests": 68, "expectedPublicRoutes": 34, "expectedAccessibleRefusals": 34, "uniqueDestinations": len({c[k] for c in cases for k in ("from", "to")}), "uniqueRequiredEdges": len(required), "changedGuidesRequired": len(covered), "changedGuidesWithoutArchivedTraversal": 5, "currentExecutedRequests": 0},
    "expectationLimits": "Historical paths/distances remain provenance, not desired candidate geometry. Required original edges and expected route/refusal availability are retained. No new success expectation was invented. Exact current normal/worker verification remains outstanding, and five changed guides have no recorded traversal. Accessible refusals are policy/qualified-start outcomes, not proof of no physical step-free route.",
    "earlier28FilesUnchanged": old_hashes,
    "rows": provenance_rows,
})
assert old_hashes == {str(p.relative_to(ROOT)): file_sha(p) for p in old_paths}
print(json.dumps({"directory": str(OUT), "cases": len(cases), "pairs": len(pairs), "casesSha256": cases_sha, "inventorySha256": inventory_sha, "provenanceSha256": provenance_sha, "coverageSha256": coverage_sha, "changedGuidesCovered": len(covered), "changedGuidesStillMissing": len(changed-covered), "currentExecutedRequests": 0, "readablePairs": [c["label"] for c in connections]}, indent=2))
