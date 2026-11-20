#!/usr/bin/env python3
"""Read-only comparison of complete-cell guide outputs; never a route replay.

The large, already-validated source JSON is hashed as a stream. Only its unique
preparedRouting/nodes properties are decoded, using bounded mmap slices, so this
analysis does not retain another copy of the full source alongside a worker job.
"""
import argparse
import hashlib
import json
import math
import mmap
from pathlib import Path
import re


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text())


def unique_source_property(path, name):
    with Path(path).open("rb") as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as raw:
        matches = list(re.finditer(rb'"' + name.encode() + rb'"\s*:', raw))
        if len(matches) != 1:
            raise ValueError(f"Expected one schema property {name}, found {len(matches)}")
        start = matches[0].end()
        while raw[start:start + 1] in (b" ", b"\n", b"\r", b"\t"):
            start += 1
        size = 512 * 1024
        while size <= 64 * 1024 * 1024:
            try:
                value, _ = json.JSONDecoder().raw_decode(raw[start:start + size].decode("utf8"))
                return value
            except (json.JSONDecodeError, UnicodeDecodeError):
                size *= 2
        raise ValueError(f"Property {name} exceeded the bounded decoder")


def compact(points):
    return [p for i, p in enumerate(points) if not i or p != points[i - 1]]


def path_metrics(points):
    points = compact(points)
    angles = []
    for i in range(1, len(points) - 1):
        u = [points[i][j] - points[i - 1][j] for j in range(2)]
        v = [points[i + 1][j] - points[i][j] for j in range(2)]
        if math.hypot(*u) and math.hypot(*v):
            angle = abs(math.degrees(math.atan2(u[0] * v[1] - u[1] * v[0], sum(a * b for a, b in zip(u, v)))))
            angles.append({"index": i, "degrees": angle, "pointFeet": points[i]})
    return {
        "vertices": len(points),
        "lengthFeet": sum(math.dist(a[:2], b[:2]) for a, b in zip(points, points[1:])),
        "bendsOver5Degrees": sum(a["degrees"] > 5 for a in angles),
        "turnbacksAtLeast145Degrees": sum(a["degrees"] >= 145 for a in angles),
        "maximumBendDegrees": max((a["degrees"] for a in angles), default=0),
    }, angles


def core(guide):
    a, b = guide["hallwayJoins"]
    assert 0 <= a <= b < len(guide["pointsFeet"])
    return guide["pointsFeet"][a:b + 1]


def aggregate(guides, use_core):
    metrics = [path_metrics(core(g) if use_core else g["pointsFeet"])[0] for g in guides]
    summed = ["vertices", "lengthFeet", "bendsOver5Degrees", "turnbacksAtLeast145Degrees"]
    return {**{key: sum(m[key] for m in metrics) for key in summed},
            "maximumBendDegrees": max((m["maximumBendDegrees"] for m in metrics), default=0)}


def compare(before, after):
    old = {g["edgeId"]: g for g in before}
    new = {g["edgeId"]: g for g in after}
    assert len(old) == len(before) and len(new) == len(after)
    changed = []
    for edge_id in sorted(old.keys() & new.keys()):
        a, b = old[edge_id], new[edge_id]
        if a == b:
            continue
        changed.append({
            "edgeId": edge_id,
            "originalEndpointsUnchanged": a["pointsFeet"][0] == b["pointsFeet"][0] and a["pointsFeet"][-1] == b["pointsFeet"][-1],
            "hallwayJoinsUnchanged": a["hallwayJoins"] == b["hallwayJoins"],
            "controlCore": path_metrics(core(a))[0],
            "candidateCore": path_metrics(core(b))[0],
            "controlFullPath": path_metrics(a["pointsFeet"])[0],
            "candidateFullPath": path_metrics(b["pointsFeet"])[0],
            "before": a,
            "after": b,
        })
    return {
        "beforeGuideCount": len(old), "afterGuideCount": len(new),
        "removedGuideIds": sorted(old.keys() - new.keys()),
        "addedGuideIds": sorted(new.keys() - old.keys()),
        "changedGuideCount": len(changed), "changedGuides": changed,
        "controlCoreTotals": aggregate(before, True), "candidateCoreTotals": aggregate(after, True),
        "controlFullPathTotals": aggregate(before, False), "candidateFullPathTotals": aggregate(after, False),
    }


def branch(guide, original_point):
    points = guide["pointsFeet"]
    a, b = guide["hallwayJoins"]
    if points[0] == original_point:
        approach = compact(points[:a + 1])
        lane = compact(points[a:b + 1])
    elif points[-1] == original_point:
        approach = compact(points[b:][::-1])
        lane = compact(points[a:b + 1][::-1])
    else:
        return None
    if len(approach) < 2 or len(lane) < 2:
        return None
    u = [approach[-1][j] - approach[-2][j] for j in range(2)]
    v = [lane[1][j] - lane[0][j] for j in range(2)]
    cosine = min(1, max(0, abs(sum(a * b for a, b in zip(u, v))) / (math.hypot(*u) * math.hypot(*v))))
    return {"joinFeet": approach[-1], "approachLengthFeet": path_metrics(approach)[0]["lengthFeet"],
            "acuteAngleToCoreDegrees": math.degrees(math.acos(cosine))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--recorded-trips", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    control_dir, candidate_dir = args.root / "cell-918-control", args.root / "cell-918-retained"
    control = read_json(control_dir / "prepared-routing.json")
    candidate = read_json(candidate_dir / "prepared-routing.json")
    reports = [read_json(p / "report.json") for p in (control_dir, candidate_dir)]
    bindings = [read_json(p / "binding.json")["binding"] for p in (control_dir, candidate_dir)]
    checkpoints = [read_json(next((p / "cells").glob("*.json"))) for p in (control_dir, candidate_dir)]
    for field in ("inputZipSha256", "inputJsonSha256", "compilerBinding", "sourceModelSha256", "sourceGeometryKey"):
        assert bindings[0][field] == bindings[1][field], field
    source_sha = digest(args.source)
    assert source_sha == bindings[0]["inputJsonSha256"], "Actual source does not match both runs"
    assert checkpoints[0]["scope"] == checkpoints[1]["scope"], "Changed source scope"
    scope = checkpoints[0]["scope"]
    eligible = set(scope["edgeIds"])
    original_prepared = unique_source_property(args.source, "preparedRouting")
    original_guides = [g for g in original_prepared["guides"] if g["edgeId"].startswith(scope["cellId"] + ":walk:")]
    nodes = {n["id"]: n for n in unique_source_property(args.source, "nodes")}
    endpoint_mismatches = []
    for guide in candidate["guides"]:
        terminal_ids = guide["edgeId"].split(":walk:", 1)[1].split("|")
        assert len(terminal_ids) == 2 and all(key in nodes for key in terminal_ids)
        expected = sorted(nodes[key]["pointFeet"] for key in terminal_ids)
        actual = sorted([guide["pointsFeet"][0], guide["pointsFeet"][-1]])
        if expected != actual:
            endpoint_mismatches.append(guide["edgeId"])
    assert not endpoint_mismatches, "An original terminal coordinate changed"
    comparison = compare(control["guides"], candidate["guides"])
    changed = {g["edgeId"] for g in comparison["changedGuides"]}
    refused = [r["cells"][0]["refusedEdges"] for r in reports]
    assert refused[0] == refused[1]
    compiled = {g["edgeId"] for g in candidate["guides"]}
    refused_ids = {r["edgeId"] for r in refused[0]}
    assert compiled.isdisjoint(refused_ids) and compiled | refused_ids == eligible
    node = nodes["door:400176:2263214:1"]
    branches = []
    for row in comparison["changedGuides"]:
        before, after = branch(row["before"], node["pointFeet"]), branch(row["after"], node["pointFeet"])
        if before is not None:
            branches.append({"edgeId": row["edgeId"], "before": before, "after": after})
    trips = read_json(args.recorded_trips)
    target_trips = []
    for trip in trips["trips"]:
        if {trip["from"], trip["to"]} != {"10-3026", "10-3060"}:
            continue
        chains = []
        for path in trip.get("paths", []):
            points = compact(path["pointsFeet"])
            if not points:
                continue
            if chains and chains[-1][-1] == points[0]:
                chains[-1].extend(points[1:])
            else:
                chains.append(points)
        target_trips.append({
            "from": trip["from"], "to": trip["to"], "mode": trip["mode"],
            "recordedMetres": trip.get("metres"),
            "recordedTurnbacks": [a for points in chains for a in path_metrics(points)[1] if a["degrees"] >= 145],
            "changedGuidesUsedByRecordedTrip": sorted(changed & {edge[0] for edge in trip.get("edges", [])}),
            "currentWorkerReplayed": False,
        })
    result = {
        "status": "complete-cell-geometry-comparison-only", "navigationAuthority": False,
        "method": "Exact guide values and source inventories compared; consecutive duplicate points removed only for planar angle/length measurements. Bends exceed 5 degrees; turnbacks are at least 145 degrees. Totals sum over guide paths, so shared lanes may be counted more than once. Original source terminal coordinates are checked independently; direction ordering is compared with the fresh control. No worker or browser journey was executed by this script.",
        "inputs": {str(p): digest(p) for p in [Path(__file__), args.source, control_dir / "prepared-routing.json", candidate_dir / "prepared-routing.json", control_dir / "report.json", candidate_dir / "report.json", args.recorded_trips]},
        "sourceBinding": {k: bindings[0][k] for k in ("inputZipSha256", "inputJsonSha256", "compilerBinding", "sourceModelSha256", "sourceGeometryKey")},
        "scope": scope,
        "inventory": {"sourceWalkingEdges": reports[0]["walkingEdges"], "eligibleOriginalEdges": len(eligible),
                      "originalTerminals": len(scope["terminalIds"]), "sourceStoredGuidesInCell": len(original_guides),
                      "controlGuides": len(control["guides"]), "candidateGuides": len(candidate["guides"]),
                      "retainedOriginalFallbacks": len(refused_ids), "refusedEdges": refused[0],
                      "compiledGuideIds": sorted(compiled), "unaccountedOriginalEdges": [],
                      "originalTerminalCoordinateMismatches": endpoint_mismatches,
                      "sourceInventoryUnchanged": True, "sourceEndpointsUnchanged": all(r["originalEndpointsUnchanged"] for r in comparison["changedGuides"])},
        "freshControlComparison": comparison,
        "recordedMasterToFreshControl": compare(original_guides, control["guides"]),
        "recordedMasterToCandidate": compare(original_guides, candidate["guides"]),
        "changedStation": {"terminalId": node["id"], "originalPointFeet": node["pointFeet"], "branches": branches},
        "recordedTargetTrips": {"provenance": {k: v for k, v in trips.items() if k != "trips"}, "trips": target_trips},
        "candidateAcceptance": {k: reports[1]["cells"][0][k] for k in ["straightRunsWithdrawn", "straightRunsComparison"]},
        "actualNavigationAcceptancePerformed": False,
    }
    # Network statistics are already retained in the compiler report; avoid
    # copying their large refusal catalogs into a geometry metric artifact.
    result["candidateAcceptance"]["straightRunsComparison"].pop("candidateNetworks", None)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "changedGuides": len(changed),
                      "coreControl": comparison["controlCoreTotals"], "coreCandidate": comparison["candidateCoreTotals"],
                      "stationBranches": branches, "recordedTargetTrips": target_trips,
                      "storedMasterToControlChanged": result["recordedMasterToFreshControl"]["changedGuideCount"]}, indent=2))


if __name__ == "__main__":
    main()
