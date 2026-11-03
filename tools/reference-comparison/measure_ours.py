"""Measure only our walking network (no reference captures needed), with the
same model and definitions as measure.py, for one or more guide catalogs.

    python3 -I tools/reference-comparison/measure_ours.py \
        --floors docs/continuation/unbc-20261031/campus/map/floors \
        --graph CAND_FINAL/graph-full.json --frame CAND_FINAL/frame-1a127847.json \
        --catalog before=docs/continuation/unbc-20261102/final-candidate/PREPARED-ROUTING.json \
        --catalog after=NEW/prepared-routing.json --out METRICS.json

Each catalog replaces the accepted-guide geometry (floor `net` categories 0/2)
edge by edge; every other stored walk keeps its saved geometry, so only the
guide geometry differs between catalogs. Besides the whole drawn network
(`venue`, as in measure.py) the shared-corridor guides are also measured on
their own (`guidesOnly`): those are the lines the corridor compiler draws.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navgraph as ng  # noqa: E402
from measure import OUR_FLOORS, venue_views  # noqa: E402

HEADLINE = [
    "spineTurnsOver5DegPer100m",
    "spineStraightRunShare",
    "spineStrokeLengthM",
    "spineJogsPer100m",
    "branchAttachmentAngleDeg",
    "branchAttachmentWithin10DegOf90",
    "branchAttachmentWithin5DegOf90",
    "zigzagsAll",
    "crossingsWithoutJunction",
    "bareDeadEnds",
    "bareDeadEndStubsUnder0_5m",
    "junctionsPer100m",
    "loopsPer100m",
    "nodes",
    "lengthM",
]


def load_filtered(floor_json, precise, keep):
    d = json.load(open(floor_json))
    g = ng.Graph(d["name"])
    edges, guides, fr = precise
    a, b, c, dd = fr["a"], fr["b"], fr["c"], fr["dd"]

    def tf(p):
        return (a * p[0] - b * p[1] + c, b * p[0] + a * p[1] + dd)

    for line, cat, ei in d["net"]:
        if not keep(cat):
            continue
        na, nb = d["netNodes"][ei]
        eid = d["netEdgeIds"][ei]
        src = guides.get(eid) if cat in (0, 2) else None
        pts = [tf(p) for p in (src or edges[eid])["pointsFeet"]]
        if math.hypot(pts[0][0] - line[0] / 10, pts[0][1] - line[1] / 10) > math.hypot(
            pts[-1][0] - line[0] / 10, pts[-1][1] - line[1] / 10
        ):
            pts = pts[::-1]
        g.add_polyline(("net", ei), na, nb, pts)
    for n in list(g.pos):
        if isinstance(n, str):
            if n.startswith("arrival:"):
                g.dest.add(n)
            elif n.startswith("door:") or n.startswith("opening:"):
                g.door.add(n)
    return g, d


def pick(m):
    return {k: m.get(k) for k in HEADLINE}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--floors", required=True)
    ap.add_argument("--graph", required=True)
    ap.add_argument("--frame", required=True)
    ap.add_argument("--catalog", action="append", required=True, help="label=PREPARED-ROUTING.json")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    G = json.load(open(a.graph))
    E = {e["id"]: e for e in G["edges"]}
    fr = json.load(open(a.frame))
    res = {"format": "reference-comparison-ours-v1", "catalogs": {}}
    for spec in a.catalog:
        label, path = spec.split("=", 1)
        raw = open(path, "rb").read()
        P = {x["edgeId"]: x for x in json.loads(raw)["guides"]}
        full, gonly, per = [], [], {}
        missing = 0
        for fid in OUR_FLOORS:
            fj = os.path.join(a.floors, f"{fid}.json")
            g, d, _facts = ng.load_ours(fj, (E, P, fr))
            full.append(g)
            go, _ = load_filtered(fj, (E, P, fr), lambda cat: cat in (0, 2))
            gonly.append(go)
            missing += sum(1 for _l, cat, ei in d["net"] if cat in (0, 2) and d["netEdgeIds"][ei] not in P)
            pv = ng.planarize(g)
            pm = ng.measure(pv)
            gm = ng.measure(ng.planarize(go))
            per[fid] = {"drawnUnion": pick(pm), "guidesOnly": pick(gm)}
        venue = venue_views(label, full)
        gvenue = venue_views(label + "-guides", gonly)
        res["catalogs"][label] = {
            "path": path,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "guides": len(P),
            "acceptedGuideNetLinesWithoutGuide": missing,
            "venue": {
                "drawnUnion": pick(venue["drawnUnion"]),
                "asStoredZigzags": venue["asStored"]["zigzagsAll"],
                "asStoredZigzagsPer100m": venue["asStored"]["zigzagsPer100m"],
            },
            "guidesOnly": {
                "drawnUnion": pick(gvenue["drawnUnion"]),
                "asStoredZigzags": gvenue["asStored"]["zigzagsAll"],
            },
            "floors": per,
        }
        print(label, json.dumps(res["catalogs"][label]["venue"]["drawnUnion"]))
    with open(a.out, "w") as fh:
        json.dump(res, fh, indent=1)
        fh.write("\n")


if __name__ == "__main__":
    main()
