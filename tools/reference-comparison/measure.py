"""Measure the UNBC walking network against reference indoor navigation graphs.

Usage (run with `python3 -I`; reference captures are untrusted data and are
only parsed as JSON, never executed):

    python3 -I tools/reference-comparison/measure.py \
        --bowie BOWIE_MVF_DIR --eaton EATON_MVF_DIR --demomall DEMO_MVF_DIR \
        --situm SITUM_BUILDING_JSON --pointr-routes ROUTE1.json ROUTE2.json \
        --floors docs/continuation/unbc-20261031/campus/map/floors \
        --graph GRAPH_FULL.json --guides PREPARED-ROUTING.json --frame FRAME.json \
        --manifest PROGRESSIVE_MANIFEST.json --carrier CARRIER.json.gz \
        --proof docs/continuation/unbc-20261102/final-candidate/browser/desktop-proof.json \
        --sizes BOWIE_ZIP EATON_ZIP DEMO_ZIP \
        --out docs/continuation/unbc-20261102/reference-comparison/METRICS.json

Only derived numbers are written. No reference geometry, names or code is
copied into the output.
"""

from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navgraph as ng  # noqa: E402

OUR_FLOORS = ["campus-floor-1", "floor-2", "campus-floor-3", "floor-4"]


def combine(label, graphs):
    out = ng.Graph(label)
    for i, g in enumerate(graphs):
        for n, p in g.pos.items():
            out.pos[(i, n)] = p
        out.dest.update((i, n) for n in g.dest)
        out.door.update((i, n) for n in g.door)
        out.edges.update(frozenset((i, x) for x in e) for e in g.edges)
    return out


def both_views(g):
    """View A = graph as stored; view B = drawn-network union (identical rules)."""
    a = ng.measure(g, with_crossings=False)
    b = ng.measure(ng.planarize(g))
    return {"asStored": a, "drawnUnion": b}


def venue_views(label, graphs):
    """Floors are planarized separately (stacked floors share coordinates)."""
    planar = [ng.planarize(g) for g in graphs]
    union = ng.measure(combine(label, planar), with_crossings=False)
    union["crossingsWithoutJunction"] = sum(ng.proper_crossings(g) for g in planar)
    return {
        "asStored": ng.measure(combine(label, graphs), with_crossings=False),
        "drawnUnion": union,
    }


def route_geometry(coords_lonlat):
    proj = ng.lonlat_projector(coords_lonlat)
    g = ng.Graph("route")
    pts = [proj(p) for p in coords_lonlat]
    for i, p in enumerate(pts):
        g.pos[i] = p
    path = list(range(len(pts)))
    t5, zig, straight, L = ng.polyline_stats(g, path)
    return {
        "points": len(pts),
        "polylineLengthM": round(L, 1),
        "meanPointSpacingM": round(L / max(1, len(pts) - 1), 2),
        "turnsOver5DegPer100m": round(100 * t5 / L, 2) if L else None,
        "straightRunShare": round(straight / L, 3) if L else None,
        "zigzags": zig,
        "jogsPer100m": round(100 * ng.jogs(g, path) / L, 2) if L else None,
    }


def pointr(route_files):
    out = []
    for f in route_files:
        d = json.load(open(f))
        dirs = d["directions"]["features"]
        nodes = d["nodes"]["features"]
        levels = sorted({n["properties"]["lvl"] for n in nodes})
        types = [x["properties"]["type"] for x in dirs]
        turns = [abs(math.degrees(x["properties"]["turnAngleRadians"])) for x in dirs if x["properties"]["type"].startswith("Turn")]
        geo = {}
        for lvl in levels:
            seg = [n["geometry"]["coordinates"] for n in nodes if n["properties"]["lvl"] == lvl]
            geo[str(lvl)] = route_geometry(seg)
        dist = d["distanceMeters"]
        out.append(
            {
                "distanceM": round(dist, 1),
                "timeS": round(d["timeSeconds"], 1),
                "routePoints": len(nodes),
                "levels": len(levels),
                "instructions": len(dirs),
                "instructionsExcludingDepartArrive": len([t for t in types if t != "Destination"]),
                "instructionsPer100m": round(100 * len(dirs) / dist, 2),
                "instructionTypes": types,
                "turnAnglesDeg": [round(t) for t in turns],
                "transitionsCarryAccessibleComfortableTravelTime": any(
                    (x["properties"].get("transitionInfo") or {}).get("isAccessible") is not None for x in dirs
                ),
                "routeGeometryPerLevel": geo,
            }
        )
    return out


def ours_directions(proof):
    d = json.load(open(proof))
    out = []
    for r in d["results"]:
        if r.get("expect") != "route" or not r.get("stepTotal"):
            continue
        m = r["shownMetres"]
        out.append(
            {
                "journey": r["label"],
                "shownM": m,
                "steps": r["stepTotal"],
                "stepsExcludingDepartArrive": r["stepTotal"] - 2,
                "stepsPer100m": round(100 * r["stepTotal"] / m, 2),
                "firstInstruction": r["firstInstruction"],
            }
        )
    return out


def reconstruct_route(eids, E, N, guides, fr):
    """Approximate route polyline: stored edge geometry (accepted guide when
    present) in route order, exact out-and-back pairs removed (as the viewer's
    corridor composition does for shared lanes), then our step rules
    (app/indoor-project/navigation-steps.ts: turn > 25 deg, legs < 0.5 m do not
    set the heading, consecutive straight legs merge within one building)
    re-applied. Not a browser result."""
    a, b, c, dd = fr["a"], fr["b"], fr["c"], fr["dd"]
    segs, pts = [], []
    for eid in eids:
        e = E[eid]
        p = [tuple(q[:2]) for q in (guides.get(eid) or e)["pointsFeet"]]
        if pts and math.dist(pts[-1], p[-1]) < math.dist(pts[-1], p[0]):
            p = p[::-1]
        bld = N[e["from"]]["building"]
        segs += [(p[i - 1], p[i], bld) for i in range(1, len(p))]
        pts += p if not pts else p[1:]
    raw = len(segs)
    st = []
    for s0, s1, bld in segs:
        if s0 == s1:
            continue
        if st and st[-1][0] == s1 and st[-1][1] == s0:
            st.pop()
            continue
        st.append((s0, s1, bld))
    reversals = raw - len(st)
    mpf = math.hypot(a, b)
    steps, prev, events = [], None, []
    for s0, s1, bld in st:
        dx, dy = s1[0] - s0[0], s1[1] - s0[1]
        m = math.hypot(dx, dy) * mpf
        turn = math.degrees(math.atan2(prev[0] * dy - prev[1] * dx, prev[0] * dx + prev[1] * dy)) if prev else 0.0
        align = m < 0.5
        turning = not align and abs(turn) > 25
        if not steps:
            steps.append(["depart", m, bld])
        elif not turning and steps[-1][0] in ("depart", "straight", "turn") and steps[-1][2] == bld:
            steps[-1][1] += m
        else:
            kind = ("around" if abs(turn) > 150 else "bear" if abs(turn) < 60 else "turn") if turning else "building-change"
            steps.append(["turn" if turning else "straight", m, bld])
            events.append({"event": kind, "turnDeg": round(turn), "precedingLegM": None})
        if not align:
            prev = (dx, dy)
    for i, ev in enumerate(events):
        ev["precedingLegM"] = round(steps[i][1], 1)
    g = ng.Graph("route")
    poly = [st[0][0]] + [x[1] for x in st]
    for i, q in enumerate(poly):
        g.pos[i] = (a * q[0] - b * q[1] + c, b * q[0] + a * q[1] + dd)
    path = list(range(len(poly)))
    t5, zig, straight, L = ng.polyline_stats(g, path)
    return {
        "storedSegments": raw,
        "outAndBackSegmentsRemoved": reversals,
        "polylineLengthM": round(L, 1),
        "turnsOver5DegPer100m": round(100 * t5 / L, 2),
        "straightRunShare": round(straight / L, 3),
        "jogsPer100m": round(100 * ng.jogs(g, path) / L, 2),
        "zigzags": zig,
        "emulatedSteps": len(steps) + 1,
        "middleEvents": events,
    }


def gz_size(path):
    data = open(path, "rb").read()
    return len(data), len(gzip.compress(data, 9))


RECONSTRUCT = {
    # browser journey label: (source file, row id)
    "corridor-default-04-204-to-08-267": ("acceptance", "link-4-8:corridor:04-204-to-08-267:hallway-only"),
    "island-default-06-366-to-06-364": ("policy", "06-366-to-06-364:inside:no-transit:public"),
    "island-default-06-388-to-06-364": ("policy", "06-388-to-06-364:inside:no-transit:public"),
    "0810-default-08-264-to-10-2006": ("policy", "08-264-to-10-2006:inside:no-transit:public"),
}


def reconstructions(a, E, N, P, fr):
    acc = {r["id"]: r for r in json.load(open(a.acceptance))["rows"]}
    with gzip.open(a.policy_matrix, "rt") as fh:
        pm = {r["id"]: r for r in json.load(fh)["rows"]}
    proof = {r["label"]: r for r in json.load(open(a.proof))["results"]}
    out = {}
    for label, (src, rid) in RECONSTRUCT.items():
        if src == "acceptance":
            eids, dist = acc[rid]["edgeIds"], acc[rid]["distanceMetres"]
        else:
            eids, dist = pm[rid]["normal"]["edgeIds"], pm[rid]["normal"]["distanceMetres"]
        r = reconstruct_route(eids, E, N, P, fr)
        r["routedDistanceM"] = round(dist, 2)
        r["browserSteps"] = proof[label]["stepTotal"]
        r["source"] = rid
        out[label] = r
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bowie", required=True)
    ap.add_argument("--eaton", required=True)
    ap.add_argument("--demomall", required=True)
    ap.add_argument("--situm", required=True)
    ap.add_argument("--pointr-routes", nargs=2, required=True)
    ap.add_argument("--floors", required=True)
    ap.add_argument("--graph", required=True)
    ap.add_argument("--guides", required=True)
    ap.add_argument("--frame", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--carrier", required=True)
    ap.add_argument("--proof", required=True)
    ap.add_argument("--sizes", nargs=3, required=True, help="bundle zips: bowie eaton demomall")
    ap.add_argument("--situm-routes-js", required=True)
    ap.add_argument("--acceptance", required=True, help="final-candidate acceptance NORMAL-ROUTES.json")
    ap.add_argument("--policy-matrix", required=True, help="final-candidate POLICY-MATRIX.json.gz")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    res = {
        "format": "reference-comparison-metrics-v1",
        "definitions": {
            "asStored": "Graph exactly as the dataset stores it. Polyline interior vertices are degree-2 nodes. Inter-floor links are excluded from per-floor graphs.",
            "drawnUnion": "Vertices merged within a 0.1 m lattice cell (first original coordinate kept), segments split at any vertex within 0.15 m of their interior, duplicate segments removed. No junction is added where segments cross; such crossings are counted.",
            "destinationNode": "Mappedin: a space's destinationNodes; Situm: a node within 3 m of an indoor POI (Situm binds destinations at run time); ours: arrival:* nodes.",
            "doorNode": "Mappedin: nodes of door connections; Situm: none; ours: door:*/opening:* portal nodes.",
            "deadEnd": "Degree-1 node; destination dead end when it is a destination or door node, otherwise bare. Stub = bare dead end whose only segment is < 0.5 m.",
            "chains": "Maximal degree-2 chains between anchors (degree != 2). Spine: junction to junction; branch: junction to dead end; destination branch: branch whose dead end is a destination/door node.",
            "branchAttachmentAngleDeg": "Acute angle (0-90) between the branch heading (to the point 1 m along it) and the spine axis at its junction (most collinear pair of incident spine chains, headings 1 m along).",
            "branchSpacingAlongSpineM": "Distance along a spine stroke between consecutive junctions that carry at least one branch.",
            "spineStroke": "Spine chains joined through junctions by the straightest continuation (deflection < 30 deg, greedy best first).",
            "spineTurnsOver5DegPer100m": "Heading changes > 5 deg between consecutive segments (>= 0.05 m) along spine strokes, per 100 m of stroke.",
            "spineStraightRunShare": "Share of spine-stroke length in runs >= 5 m whose segments stay within 3 deg of the run's first heading.",
            "spineJogsPer100m": "Net-zero sideways jogs along spine strokes: two consecutive turns > 5 deg of opposite sign, <= 3 m apart, summing to < 5 deg (rounded corners, whose turns share a sign, are not jogs).",
            "zigzag": "Turn > 120 deg where either adjacent segment is <= 2 m, along any chain (taken from asStored for the headline, since the union collapses out-and-back spikes into stubs).",
            "cyclomatic": "E - V + C over nodes with degree >= 1.",
        },
        "references": {},
        "ours": {},
    }

    # Mappedin
    for name, d, zp in (("bowie", a.bowie, a.sizes[0]), ("eaton", a.eaton, a.sizes[1]), ("demomall", a.demomall, a.sizes[2])):
        graphs, floors, _spaces, facts = ng.load_mvf(d)
        per = {}
        for mid, g in sorted(graphs.items(), key=lambda kv: -len(kv[1].pos)):
            fl = floors.get(mid, {})
            key = (fl.get("name") or "floor").strip()
            while key in per:
                key += "'"
            per[key] = {"elevation": fl.get("elevation"), **both_views(g)}
        venue = venue_views(name, list(graphs.values()))
        raw, comp = gz_size(os.path.join(d, "node.geojson"))
        files = [os.path.join(r, f) for r, _, fs in os.walk(d) for f in fs]
        facts["clientLoad"] = {
            "bundleZipBytes": os.path.getsize(zp),
            "bundleUncompressedBytes": sum(os.path.getsize(f) for f in files),
            "nodeGeojsonBytes": raw,
            "nodeGeojsonGzip9Bytes": comp,
            "connectionJsonBytes": os.path.getsize(os.path.join(d, "connection.json")),
            "wholeVenueInOneBundle": True,
            "routing": "client side over the loaded node graph (SDK getDirections; options accessible, zones, smoothing, excludedConnections, connectionIdWeightMap, includeNonPublic)",
        }
        res["references"][f"mappedin-{name}"] = {"facts": facts, "venue": venue, "floors": per}

    # Situm
    graphs, facts = ng.load_situm(a.situm)
    per = {}
    for fid, g in graphs.items():
        per[g.label] = both_views(g)
    facts["clientLoad"] = {
        "buildingJsonBytes": os.path.getsize(a.situm),
        "routesLibraryJsBytes": os.path.getsize(a.situm_routes_js),
        "worker": "persistent dedicated worker (initWorker persistent: true), graph built once per building (jsonFactory) and reused for directions, navigation, distances and where-am-I",
    }
    res["references"]["situm-citymall"] = {"facts": facts, "venue": venue_views("situm", list(graphs.values())), "floors": per}

    # Pointr
    res["references"]["pointr-harrods"] = {
        "routes": pointr(a.pointr_routes),
        "clientLoad": {"graphBytes": 0, "routing": "server side: one route request per journey (route?startPoiFid=..&destPoiFid=..&mode=normal); SDK modes normal/easy/accessible"},
        "routeResponseBytes": [os.path.getsize(f) for f in a.pointr_routes],
    }

    # Ours
    G = json.load(open(a.graph))
    E = {e["id"]: e for e in G["edges"]}
    P = {x["edgeId"]: x for x in json.load(open(a.guides))["guides"]}
    fr = json.load(open(a.frame))
    gs = []
    per = {}
    for fid in OUR_FLOORS:
        g, d, facts = ng.load_ours(os.path.join(a.floors, f"{fid}.json"), (E, P, fr))
        gs.append(g)
        per[fid] = {"floorName": d["name"], "facts": facts, **both_views(g)}
    from collections import Counter

    kinds = Counter(e["kind"] for e in G["edges"])
    acc = Counter(f"{e['kind']}:{e['accessible']}" for e in G["edges"])
    man = json.load(open(a.manifest))
    agg = {}
    for x in man["assets"].values():
        k = x["kind"]
        best = min(r["bytes"] for r in x["representations"])
        s = agg.setdefault(k, {"assets": 0, "logicalBytes": 0, "smallestEncodedBytes": 0})
        s["assets"] += 1
        s["logicalBytes"] += x["logicalBytes"]
        s["smallestEncodedBytes"] += best
    carrier_comp = os.path.getsize(a.carrier)
    with gzip.open(a.carrier, "rb") as fh:
        carrier_logical = len(fh.read())
    res["ours"] = {
        "venue": venue_views("ours", gs),
        "floors": per,
        "routingGraph": {
            "nodes": len(G["nodes"]),
            "edges": len(G["edges"]),
            "edgeKinds": dict(kinds),
            "edgeAccessible": dict(acc),
            "enabledEdges": sum(1 for e in G["edges"] if e["enabled"]),
            "recordAccess": dict(Counter(r["access"] for r in G["records"])),
        },
        "directions": ours_directions(a.proof),
        "directionsReconstruction": reconstructions(a, E, {n["id"]: n for n in G["nodes"]}, P, fr),
        "clientLoad": {
            "progressiveManifestAssets": agg,
            "directionsCarrierCompressedBytes": carrier_comp,
            "directionsCarrierLogicalBytes": carrier_logical,
            "worker": "dedicated route worker (published-route-calculation.worker.ts); on the whole-campus map it is not warmed up in the background and an idle one is released before a floor transition or evidence review (releaseIdleRouteBeforeFloor / releaseIdleRouteForReview), so the next request prepares it again",
        },
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(res, fh, indent=1, sort_keys=False)
        fh.write("\n")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
