"""Bind the archived Building 10 cell-918 regression sample to current verification.

This constructs inputs only. Historical outcomes are expectations, never current
acceptance. Complete-cell compilation and actual worker verification remain required.
"""
from pathlib import Path
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "pr4-work/input"
CELL = "native-cell:24.278215:918"
CONTEXT = OUT / "corridor-source-context.json"
MEASUREMENTS = ROOT / "package-audit/UNBC-continue-01-workflows/evidence/current/browser-measurements.json.gz"
TRIPS = ROOT / "package-audit/atlas-generator/campus-network/campus-update/screenshot-review/upper-landing-release/trips/current-worker.json"
HARNESS = ROOT / "package-audit/UNBC-continue-01-workflows/workflows/check-browser.cjs"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(name, value):
    data = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()
    (OUT / name).write_bytes(data)
    return sha(data)


context_bytes = CONTEXT.read_bytes()
assert sha(context_bytes) == "1b6fe9515af82aa9a88de6e55310331063cf86dc686a9e8ecae7c6204e615bdd"
context = json.loads(context_bytes)
measurements_bytes = MEASUREMENTS.read_bytes()
assert sha(measurements_bytes) == "25d3db8d0d101f8a13054781bee41f804c4ec621d9d507b8959b7755f66c6ca2"
measurements = json.loads(gzip.decompress(measurements_bytes))
trips_bytes = TRIPS.read_bytes()
trips = json.loads(trips_bytes)
assert context["sourceSha256"] == measurements["datasetSha256"] == trips["datasetSha256"]
assert measurements["runtimeSha256"] == trips["runtimeSha256"]
assert len(measurements["rows"]) == len(trips["trips"]) == 1392
assert "options:{endpointMode:'pathway',allowOtherRoomTransit:false}" in HARNESS.read_text()

# Match the portable replay's exact last-record-wins number/key lookup.
keys = {}
for record in context["records"]:
    keys[record["number"]] = record["key"]
    keys[record["key"]] = record["key"]
records = {record["key"]: record for record in context["records"]}
edges = {edge["id"]: edge for edge in context["edges"]}
cell_edges = dict(context["scope"]["edgesByCell"])[CELL]
assert len(cell_edges) == 79
assert len({n for e in cell_edges for n in (edges[e]["from"], edges[e]["to"])}) == 53

rows = measurements["rows"]
pairs = []
seen = set()
for row in rows:
    if not (row["mode"] == "public" and row["a"].startswith("10-") and row["b"].startswith("10-")):
        continue
    if not any(e.startswith(CELL + ":walk:") for e in row["edges"]):
        continue
    unordered = tuple(sorted((row["a"], row["b"])))
    if unordered not in seen:
        seen.add(unordered)
        pairs.append((row["a"], row["b"]))
assert len(pairs) == 7

index = {}
for i, row in enumerate(rows):
    key = (row["a"], row["b"], row["mode"])
    index.setdefault(key, []).append((i, row))
trip_index = {}
for i, trip in enumerate(trips["trips"]):
    key = (trip["from"], trip["to"], trip["mode"])
    trip_index.setdefault(key, []).append((i, trip))

cases = []
connections = []
provenance_rows = []
options = {"endpointMode": "pathway", "allowOtherRoomTransit": False}
for a, b in pairs:
    requests = []
    for mode in ("public", "accessible"):
        for direction, start, end in (("forward", a, b), ("reverse", b, a)):
            matches = index[(start, end, mode)]
            assert len(matches) == 1, (start, end, mode, "duplicate archived request")
            i, row = matches[0]
            diagnostic_matches = trip_index[(start, end, mode)]
            assert len(diagnostic_matches) == 1, (start, end, mode, "duplicate worker diagnostic request")
            diagnostic_i, trip = diagnostic_matches[0]
            assert (trip["from"], trip["to"], trip["mode"]) == (start, end, mode)
            assert trip["metres"] == row["metres"]
            assert [e[0] for e in trip.get("edges", [])] == row["edges"]
            expected = row["metres"] is not None
            assert expected == (mode == "public")
            case = {
                "id": f"baseline-row-{i + 1:04d}-{mode}-{start}-to-{end}",
                "from": keys[start],
                "to": keys[end],
                "mode": mode,
                "options": options.copy(),
                "expected": expected,
            }
            if expected:
                assert row["edges"] and len(set(row["edges"])) == len(row["edges"])
                assert all(edges[e]["enabled"] for e in row["edges"])
                assert all(edges[e]["nativeCellId"] == CELL for e in row["edges"])
                assert any(p.get("sharedCorridorGuideUsed") for p in row["paths"])
                case["requiredSourceEdgeIds"] = row["edges"].copy()
                case["requireSharedGuide"] = True
            else:
                assert trip["diagnostic"]["constraint"] == "pathway-start"
            cases.append(case)
            requests.append({"id": case["id"], "direction": direction, "state": "bound", "routeCase": case})
            provenance_rows.append({
                "caseId": case["id"],
                "zeroBasedArchiveRow": i,
                "zeroBasedWorkerDiagnosticRow": diagnostic_i,
                "portableReplayRequestId": i + 1,
                "requestIdMeaning": "check-browser.cjs assigns out.length + 1 in this archived row order; the saved row itself has no wire requestId field",
                "sourceRequest": {"a": start, "b": end, "mode": mode, "options": options},
                "resolvedRecords": [{k: records[keys[number]].get(k) for k in ("key", "number", "name", "building", "levelId", "access", "walkable")} for number in (start, end)],
                "historicalBrowserRow": row,
                "historicalWorkerTrip": trip,
            })
    connections.append({
        "id": f"b10-918-{a}-{b}",
        "label": f"{a} to {b}: archived hallway-station regression",
        "evidence": "Exact November 18 baseline browser rows and recorded worker trips; expectations only. Public routes traversed native-cell:24.278215:918. Accessible counterparts recorded pathway-start refusal. The local stair label, where present, is a same-plane destination and does not assert a vertical stair connection.",
        "requests": requests,
    })

assert len(cases) == 28
assert len({c["id"] for c in cases}) == len(cases)
cases_sha = write("b10-cell918-cases.json", cases)
source_binding = {
    "sourceMasterSha256": "8e397ddf461a5ec997269848091972a71a0e5231a5dd9c7a4d8407d285db4f52",
    "sourceModelSha256": "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
    "sourceRoomsSha256": "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
}
inventory_sha = write("b10-cell918-inventory.json", {
    "format": "connection-acceptance-inventory-v1",
    "source": source_binding,
    "casesSha256": cases_sha,
    "inventoryComplete": True,
    "scope": "ONLY the seven archived Building 10 destination pairs whose recorded public paths use cell918, including each direction and both recorded profiles: 28 requests. This is the complete enumerated regression sample, not all 53 terminals, all 79 original cell edges, Building 10 connectivity, campus accessibility, or release qualification. Accessible refusals mean no qualified pathway start in that profile, not physical absence of step-free paths.",
    "connections": connections,
})
provenance_sha = write("b10-cell918-case-provenance.json", {
    "format": "unbc-archived-case-selection-v1",
    "status": "verification-inputs-only-not-current-results",
    "navigationAuthority": False,
    "source": source_binding,
    "contextSha256": sha(context_bytes),
    "datasetSha256": measurements["datasetSha256"],
    "recordedRuntimeSha256": measurements["runtimeSha256"],
    "recordedWorkerAsset": measurements["asset"],
    "recordedWorkerBundleSha256": trips["workerBundleSha256"],
    "compressedMeasurementsSha256": sha(measurements_bytes),
    "workerTripFileSha256": sha(trips_bytes),
    "portableHarnessSha256": sha(HARNESS.read_bytes()),
    "casesSha256": cases_sha,
    "inventorySha256": inventory_sha,
    "selectionRule": "Every archived public row with both destinations in Building 10 and at least one original cell918 walking edge; group unordered pairs; include exact archived forward/reverse public and accessible rows for each pair.",
    "coverage": {"pairs": 7, "requests": 28, "expectedPublicRoutes": 14, "expectedAccessibleRefusals": 14, "cellEligibleEdges": 79, "cellOriginalTerminals": 53},
    "expectationLimits": "Historical distances and points are retained for comparison, not frozen as desired candidate geometry. Required original edge IDs and route/refusal outcomes remain explicit. Current normal and actual-worker runs must create fresh evidence; these rows cannot satisfy acceptance by themselves.",
    "rows": provenance_rows,
})
print(json.dumps({"cases": str(OUT / "b10-cell918-cases.json"), "casesSha256": cases_sha, "inventorySha256": inventory_sha, "provenanceSha256": provenance_sha, "requests": len(cases), "pairs": pairs}, indent=2))
