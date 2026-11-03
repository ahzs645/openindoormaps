"""Before/after route OUTPUT metrics from two measure-route-output.ts runs.

Usage: python3 -I summarize.py BEFORE.json AFTER.json OUT.json
Standard library only. Journeys are the 8 browser journeys; "policy" is every
case of POLICY-CASES.json (refusals are counted, never measured).
"""
import json
import math
import statistics
import sys


def kinds(steps):
    out = {"depart": 0, "turn": 0, "bear": 0, "around": 0, "straight": 0,
           "building-change": 0, "floor-change": 0, "arrive": 0}
    for s in steps:
        if s["type"] == "turn":
            out["around" if s.get("turnKind") == "around" else
                "bear" if s.get("turnKind") == "slight" else "turn"] += 1
        else:
            out[s["type"]] += 1
    return out


def shape(paths, mpf):
    """Bends over 5 deg and sideways jogs (opposite turns over 5 deg joined by
    a leg of at most 3 m, net change under 5 deg; reference-comparison
    definition) on the composed horizontal line."""
    pts = []
    for p in paths:
        for q in p["pointsFeet"]:
            if not pts or pts[-1] != q:
                pts.append(q)
    segs = []
    for a, b in zip(pts, pts[1:]):
        m = math.hypot(b[0] - a[0], b[1] - a[1]) * mpf
        if m > 1e-6 and abs(b[2] - a[2]) < 0.01:
            segs.append((b[0] - a[0], b[1] - a[1], m))
    turns = []
    for (ux, uy, um), (vx, vy, vm) in zip(segs, segs[1:]):
        turns.append((math.degrees(math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)), vm))
    bends = sum(1 for t, _ in turns if abs(t) > 5)
    jogs = 0
    for (t1, leg), (t2, _) in zip(turns, turns[1:]):
        if abs(t1) > 5 and abs(t2) > 5 and t1 * t2 < 0 and leg <= 3 and abs(t1 + t2) < 5:
            jogs += 1
    return bends, jogs


def row(r, mpf):
    if not r["available"]:
        return {"available": False, "message": (r.get("diagnostic") or {}).get("message")}
    line = r["line"]
    return {
        "available": True,
        "steps": r["stepCount"],
        "stepsPer100m": round(r["stepsPer100m"], 2),
        "stepKinds": kinds(r["steps"]),
        "messages": [s["message"] for s in r["steps"]],
        "reportedDistanceM": round(r["distanceMetres"], 3),
        "drawnLengthM": round(line["drawnLengthMetres"], 3),
        "routedEdgeLengthM": round(r["sourceDistanceMetres"], 3),
        "preferenceCost": r.get("preferenceCost"),
        "segments": line["segments"],
        "segmentsUnder2m": line["shortSegmentsUnder2m"],
        "exactRetracePairs": line["exactRetracePairs"],
        "reversalsOver150": line["reversalsOver150"],
        "zigzags": line["zigzags"],
        "bendsOver5": shape(r["paths"], mpf)[0],
        "jogs": shape(r["paths"], mpf)[1],
        "edgeIdsSha256": r["edgeIdsSha256"],
    }


def aggregate(rows):
    routed = [r for r in rows if r["available"]]
    def total(key):
        return sum(r[key] for r in routed)
    per100 = [r["stepsPer100m"] for r in routed]
    return {
        "cases": len(rows),
        "routed": len(routed),
        "refused": len(rows) - len(routed),
        "steps": total("steps"),
        "stepsPer100mMedian": round(statistics.median(per100), 2) if per100 else None,
        "stepsPer100mMax": round(max(per100), 2) if per100 else None,
        "stepsPer100mOverall": round(100 * total("steps") / total("reportedDistanceM"), 2) if routed else None,
        "bearSteps": sum(r["stepKinds"]["bear"] for r in routed),
        "turnSteps": sum(r["stepKinds"]["turn"] for r in routed),
        "segments": total("segments"),
        "segmentsUnder2m": total("segmentsUnder2m"),
        "exactRetracePairs": total("exactRetracePairs"),
        "reversalsOver150": total("reversalsOver150"),
        "zigzags": total("zigzags"),
        "bendsOver5": total("bendsOver5"),
        "jogs": total("jogs"),
        "drawnLengthM": round(total("drawnLengthM"), 2),
        "routedEdgeLengthM": round(total("routedEdgeLengthM"), 2),
    }


def mpf(run):
    """Metres per project foot: recorded, or recovered from a drawn length."""
    if "metresPerFoot" in run:
        return run["metresPerFoot"]
    r = next(r for r in run["rows"] if r["available"])
    feet = 0.0
    pts = []
    for p in r["paths"]:
        for q in p["pointsFeet"]:
            if not pts or pts[-1] != q:
                pts.append(q)
    for a, b in zip(pts, pts[1:]):
        feet += math.hypot(b[0] - a[0], b[1] - a[1])
    return r["line"]["drawnLengthMetres"] / feet


def main(before_path, after_path, out_path):
    before = json.load(open(before_path))
    after = json.load(open(after_path))
    assert before["inputSha256"] == after["inputSha256"]
    b = {r["id"]: row(r, mpf(before)) for r in before["rows"]}
    a = {r["id"]: row(r, mpf(after)) for r in after["rows"]}
    assert b.keys() == a.keys()
    same_outcome = all(b[k]["available"] == a[k]["available"] for k in b)
    same_edges = all(b[k].get("edgeIdsSha256") == a[k].get("edgeIdsSha256") for k in b)
    same_refusals = all(b[k].get("message") == a[k].get("message") for k in b if not b[k]["available"])
    same_cost = all(b[k].get("preferenceCost") == a[k].get("preferenceCost") for k in b)
    deltas = [a[k]["reportedDistanceM"] - b[k]["reportedDistanceM"] for k in b if b[k]["available"]]
    journeys = [k for k in b if k.startswith("journey:")]
    policy = [k for k in b if not k.startswith("journey:")]
    out = {
        "inputSha256": after["inputSha256"],
        "routeRuntimeSha256": {"before": before["routeRuntimeSha256"], "after": after["routeRuntimeSha256"]},
        "invariants": {
            "sameRouteOrRefusalForEveryCase": same_outcome,
            "sameRoutedEdgeSequenceForEveryRoute": same_edges,
            "sameRefusalMessages": same_refusals,
            "samePreferenceCost": same_cost,
            "reportedDistanceChangeM": {"min": round(min(deltas), 3), "max": round(max(deltas), 3)},
        },
        "journeys": {k[len("journey:"):]: {"before": b[k], "after": a[k]} for k in journeys},
        "policyCases": {
            "before": aggregate([b[k] for k in policy]),
            "after": aggregate([a[k] for k in policy]),
        },
        "policyCaseRows": {k: {"before": b[k], "after": a[k]} for k in policy},
    }
    for side in ("before", "after"):
        for r in out["policyCaseRows"].values():
            r[side].pop("messages", None)
    json.dump(out, open(out_path, "w"), indent=1)
    print(json.dumps({k: out[k] for k in ("invariants", "policyCases")}, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:4])
