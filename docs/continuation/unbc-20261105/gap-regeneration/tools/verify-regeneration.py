"""Stage A: verify the gap-patch regeneration against the run-1 master.

usage: verify-regeneration.py BEFORE-DIR AFTER-DIR GAP-PATCHES.json AFTER-GAPS.json OUT.json

BEFORE-DIR / AFTER-DIR hold graph-full.json and geometry.json written by
extract-tables.py from each master's viewer/indoor.json. AFTER-GAPS.json is the
group-gaps.py inventory of the after graph (walk-squeezes.py, 2.0 ft).

Definitions (all on enabled edges):
- component: connected component over every enabled edge (walk, door,
  opening, elevator, stairs, ramp, local-steps).
- walk cluster of a node: connected component over enabled walk edges only,
  i.e. what is reachable without crossing a door, opening or vertical edge.
- a room's arrival is door-connected when its walk cluster holds a portal of an
  enabled door/opening/vertical edge.
- walk neighbours of a room: other rooms whose arrival is in the same walk
  cluster (reachable inside one routing cell without a door).
- room portals: enabled door/opening/vertical edges with an endpoint in the
  room's walk cluster.
"""
import json, sys, math
from collections import defaultdict, Counter
import shapely
from shapely.geometry import Polygon, LineString, Point
from shapely.strtree import STRtree

bdir, adir, gp_path, agaps_path, out_path = sys.argv[1:6]
GP = json.load(open(gp_path))
AG = json.load(open(agaps_path))["gaps"]


def load(d):
    g = json.load(open(f"{d}/graph-full.json"))
    geo = json.load(open(f"{d}/geometry.json"))
    return g, geo


def analyse(g):
    nodes = {n["id"]: n for n in g["nodes"]}
    recs = {r["key"]: r for r in g["records"]}
    en = [e for e in g["edges"] if e.get("enabled")]
    adj, wadj = defaultdict(set), defaultdict(set)
    for e in en:
        adj[e["from"]].add(e["to"]); adj[e["to"]].add(e["from"])
        if e["kind"] == "walk":
            wadj[e["from"]].add(e["to"]); wadj[e["to"]].add(e["from"])

    def comps(a):
        c, k = {}, 0
        for n in nodes:
            if n in c: continue
            st = [n]; c[n] = k
            while st:
                x = st.pop()
                for y in a[x]:
                    if y not in c: c[y] = k; st.append(y)
            k += 1
        return c

    comp, wcl = comps(adj), comps(wadj)
    arrivals = [n for n in nodes.values() if n["kind"] == "arrival"]
    comp_arr = Counter(comp[n["id"]] for n in arrivals)
    big = comp_arr.most_common(1)[0][0]
    portal_edges = defaultdict(set)  # walk cluster -> non-walk edge ids
    for e in en:
        if e["kind"] != "walk":
            portal_edges[wcl[e["from"]]].add(e["id"]); portal_edges[wcl[e["to"]]].add(e["id"])
    cl_rooms = defaultdict(set)
    for n in arrivals:
        cl_rooms[wcl[n["id"]]].add(n.get("roomKey"))
    rooms = {}
    for n in arrivals:
        k = n.get("roomKey"); c = wcl[n["id"]]
        r = rooms.setdefault(k, {"arrivals": [], "main": False, "doorConnected": False, "neighbours": set(), "portals": set(), "cells": set(), "component": None})
        r["arrivals"].append(n["id"])
        r["main"] |= comp[n["id"]] == big
        r["doorConnected"] |= bool(portal_edges[c])
        r["neighbours"] |= cl_rooms[c] - {k}
        r["portals"] |= portal_edges[c]
        r["componentArrivals"] = comp_arr[comp[n["id"]]]
    # walk-cluster cells
    cl_cells = defaultdict(set)
    for e in en:
        if e["kind"] == "walk" and e.get("nativeCellId"):
            cl_cells[wcl[e["from"]]].add(e["nativeCellId"])
    for n in arrivals:
        rooms[n.get("roomKey")]["cells"] |= cl_cells[wcl[n["id"]]]
    walks = [e for e in en if e["kind"] == "walk"]
    wl = Counter(nodes[e["from"]]["levelId"] for e in walks)
    summary = {
        "enabledEdgesByKind": dict(Counter(e["kind"] for e in en)),
        "enabledWalksByLevel": {str(k): v for k, v in sorted(wl.items())},
        "components": len(set(comp.values())),
        "componentsWithArrivals": len(comp_arr),
        "largestComponentArrivals": comp_arr[big],
        "arrivals": len(arrivals),
        "roomsWithArrival": len(rooms),
        "roomsInLargestComponent": sum(1 for r in rooms.values() if r["main"]),
        "roomsDoorConnected": sum(1 for r in rooms.values() if r["doorConnected"]),
        "roomsWithWalkNeighbours": sum(1 for r in rooms.values() if r["neighbours"]),
        "componentArrivalSizes": sorted(comp_arr.values(), reverse=True),
    }
    return nodes, recs, rooms, summary, walks, comp, big


(bg, bgeo), (ag, ageo) = load(bdir), load(adir)
bn, brec, brooms, bsum, bwalks, bcomp, bbig = analyse(bg)
an, arec, arooms, asum, awalks, acomp, abig = analyse(ag)
name = lambda k: (arec.get(k) or brec.get(k) or {}).get("number") or (arec.get(k) or brec.get(k) or {}).get("name") or k

# --- graph identity checks -------------------------------------------------
node_diff = sorted(k for k in set(bn) | set(an) if bn.get(k) != an.get(k))
nonwalk = lambda g: {e["id"]: e for e in g["edges"] if e["kind"] != "walk"}
bnw, anw = nonwalk(bg), nonwalk(ag)
nonwalk_diff = sorted(k for k in set(bnw) | set(anw) if bnw.get(k) != anw.get(k))
rec_diff = sorted(k for k in set(brec) | set(arec) if brec.get(k) != arec.get(k))
bdoor = {x[2]: x for x in bgeo["doors"]}; adoor = {x[2]: x for x in ageo["doors"]}
door_diff = sorted(k for k in set(bdoor) | set(adoor) if bdoor.get(k) != adoor.get(k))
bw = Counter(json.dumps(w) for w in bgeo["walls"]); aw = Counter(json.dumps(w) for w in ageo["walls"])
walls_removed = list((bw - aw).elements()); walls_added = [json.loads(w) for w in (aw - bw).elements()]
patch_walls = [w for w in walls_added if str(w[4] or "").startswith("owner-gap:")]

# --- patched gaps closed --------------------------------------------------
patches = {p["id"]: p for p in GP["patches"]}
strips = {}
for w in patch_walls:
    strips.setdefault(w[4], []).append((w[0], Polygon(w[5][0], w[5][1:])))


def crossing(walks, nodes):
    by_level = defaultdict(list)
    for e in walks:
        by_level[nodes[e["from"]]["levelId"]].append(e)
    res = defaultdict(list)
    for pid, parts in strips.items():
        for lv, poly in parts:
            inner = poly.buffer(-1e-9)
            for e in by_level[lv]:
                line = LineString([p[:2] for p in e["pointsFeet"]])
                if line.intersects(poly):
                    x = line.intersection(poly)
                    res[pid].append({"edgeId": e["id"], "insideLengthFeet": x.length,
                                     "crossesInterior": (not inner.is_empty) and line.intersects(inner)})
    return res


before_cross, after_cross = crossing(bwalks, bn), crossing(awalks, an)
patched_gaps = [g for g in GP["gaps"] if g["outcome"].startswith("patched")]
gap_rows = []
for g in patched_gaps:
    lv, ids = g["levelId"], sorted(b["nativeElementId"] for b in g["bodies"])
    still = [x for x in AG if x["levelId"] == lv and sorted(x["bodyIds"]) == ids and math.dist(x["pointFeet"], g["pointFeet"]) < 2.0]
    near = [x for x in AG if x["levelId"] == lv and math.dist(x["pointFeet"], g["pointFeet"]) < 1.0]
    b_edges = [e for e in g["walkEdgeIds"]]
    a_ids = {e["id"] for e in awalks}
    gap_rows.append({
        "gapId": g["gapId"], "patchId": g["patchId"], "outcome": g["outcome"], "floor": g["floor"], "rooms": g["rooms"][:12],
        "walksBefore": len(b_edges), "beforeWalkIdsStillEnabled": [e for e in b_edges if e in a_ids],
        "afterSqueezeSameBodiesWithin2ft": [x["id"] for x in still],
        "afterSqueezeAnyBodiesWithin1ft": [{"id": x["id"], "bodies": x["bodyIds"], "rooms": x["rooms"][:6]} for x in near],
        "afterWalksTouchingStrip": [c["edgeId"] for c in after_cross.get(g["patchId"], [])],
    })
patch_rows = []
for pid, p in patches.items():
    patch_rows.append({
        "patchId": pid, "floor": p["floor"], "rooms": p["rooms"],
        "stripPresentInAfterWalls": pid in strips,
        "beforeWalksCrossingStrip": sorted({c["edgeId"] for c in before_cross.get(pid, []) if c["crossesInterior"]}),
        "beforeWalksTouchingStrip": len(before_cross.get(pid, [])),
        "afterWalksCrossingStrip": sorted({c["edgeId"] for c in after_cross.get(pid, []) if c["crossesInterior"]}),
        "afterWalksTouchingStrip": [{"edgeId": c["edgeId"], "insideLengthFeet": c["insideLengthFeet"]} for c in after_cross.get(pid, [])],
    })

# --- per-room connectivity ------------------------------------------------
# cells cut by patches (run-1 numbering = GAP-PATCHES numbering)
cell_patches = defaultdict(set)
for p in GP["patches"]:
    for eid in p["walkEdgeIds"]:
        cell_patches[eid.split(":walk:")[0]].add(p["id"])
for c in GP["cellPreview"]["pieces"]:
    for pid in c["patches"]:
        cell_patches[c["cellId"]].add(pid)
before_cross_edges = defaultdict(set)
for pid, rows in before_cross.items():
    for c in rows:
        if c["crossesInterior"]:
            before_cross_edges[c["edgeId"]].add(pid)
room_rows = []
for k in sorted(set(brooms) | set(arooms)):
    b, a = brooms.get(k), arooms.get(k)
    if b is None or a is None:
        room_rows.append({"roomKey": k, "room": name(k), "change": "arrival added" if b is None else "arrival removed"}); continue
    lostN, gainN = b["neighbours"] - a["neighbours"], a["neighbours"] - b["neighbours"]
    lostP, gainP = b["portals"] - a["portals"], a["portals"] - b["portals"]
    if not (lostN or gainN or lostP or gainP or b["main"] != a["main"] or b["doorConnected"] != a["doorConnected"]):
        continue
    reasons = sorted(set().union(*(cell_patches.get(c, set()) for c in b["cells"])))
    room_rows.append({
        "roomKey": k, "room": name(k), "levelId": bn[b["arrivals"][0]]["levelId"],
        "mainNetwork": [b["main"], a["main"]], "doorConnected": [b["doorConnected"], a["doorConnected"]],
        "componentArrivals": [b["componentArrivals"], a["componentArrivals"]],
        "lostWalkNeighbours": sorted(name(x) for x in lostN), "gainedWalkNeighbours": sorted(name(x) for x in gainN),
        "lostPortals": sorted(lostP), "gainedPortals": sorted(gainP),
        "portalsAfter": sorted(a["portals"]), "walkNeighboursAfter": sorted(name(x) for x in a["neighbours"]),
        "beforeCells": sorted(b["cells"]), "patchesInBeforeCells": reasons,
    })


def classify(r):
    if "change" in r: return r["change"]
    if r["mainNetwork"] == [True, False]: return "lost main network"
    if r["mainNetwork"] == [False, True]: return "gained main network"
    if r["doorConnected"] == [True, False]: return "lost door-connected arrival"
    if r["gainedWalkNeighbours"] or r["gainedPortals"]:
        return "gained walk neighbours or portals"
    if r["walkNeighboursAfter"]:
        return "partly separated (still walk-joined to some rooms)"
    return "separated from walk neighbours (lost leaked rooms/portals only)"


for r in room_rows:
    r["class"] = classify(r)
    r["explainedByPatch"] = bool(r.get("patchesInBeforeCells"))

lost_door = [r for r in room_rows if r.get("doorConnected") == [True, False]]
json.dump({
    "format": "unbc-gap-regeneration-verification-v1",
    "definitions": __doc__,
    "before": {"dir": bdir, "masterSha256": bgeo["masterSha256"], **bsum},
    "after": {"dir": adir, "masterSha256": ageo["masterSha256"], **asum},
    "identity": {
        "nodesChanged": node_diff, "nonWalkEdgesChanged": nonwalk_diff, "recordsChanged": rec_diff,
        "doorsChanged": door_diff, "wallsRemoved": len(walls_removed), "wallsAdded": len(walls_added),
        "ownerGapPatchWallsAdded": len(patch_walls), "otherWallsAdded": [w[:5] for w in walls_added if w not in patch_walls],
        "walkEdges": [len(bwalks), len(awalks)],
        "walkIdsOnlyBefore": len({e["id"] for e in bwalks} - {e["id"] for e in awalks}),
        "walkIdsOnlyAfter": len({e["id"] for e in awalks} - {e["id"] for e in bwalks}),
    },
    "patches": {
        "count": len(patch_rows), "stripsInAfterWalls": sum(r["stripPresentInAfterWalls"] for r in patch_rows),
        "crossedBefore": sum(1 for r in patch_rows if r["beforeWalksCrossingStrip"]),
        "crossedAfter": sum(1 for r in patch_rows if r["afterWalksCrossingStrip"]),
        "touchedAfter": sum(1 for r in patch_rows if r["afterWalksTouchingStrip"]),
        "rows": patch_rows,
    },
    "patchedGaps": {
        "count": len(gap_rows),
        "beforeWalkStillEnabled": sum(1 for r in gap_rows if r["beforeWalkIdsStillEnabled"]),
        "squeezeStillAtGap": sum(1 for r in gap_rows if r["afterSqueezeSameBodiesWithin2ft"]),
        "anySqueezeWithin1ft": sum(1 for r in gap_rows if r["afterSqueezeAnyBodiesWithin1ft"]),
        "rows": gap_rows,
    },
    "rooms": {
        "changed": len(room_rows), "byClass": dict(Counter(r["class"] for r in room_rows)),
        "lostDoorConnectedArrival": [r["room"] for r in lost_door],
        "notExplainedByPatch": [r["room"] for r in room_rows if not r.get("explainedByPatch")],
        "rows": room_rows,
    },
}, open(out_path, "w"), indent=1, default=sorted)
print(json.dumps({"before": bsum | {"componentArrivalSizes": bsum["componentArrivalSizes"][:6]},
                  "after": asum | {"componentArrivalSizes": asum["componentArrivalSizes"][:6]}}, indent=1))
print("nodes changed", len(node_diff), "nonwalk changed", len(nonwalk_diff), "records", len(rec_diff), "doors", len(door_diff),
      "walls -", len(walls_removed), "+", len(walls_added), "patch walls", len(patch_walls))
print("patches crossed before/after", sum(1 for r in patch_rows if r["beforeWalksCrossingStrip"]), sum(1 for r in patch_rows if r["afterWalksCrossingStrip"]),
      "touched after", sum(1 for r in patch_rows if r["afterWalksTouchingStrip"]))
print("gaps", len(gap_rows), "squeeze still", sum(1 for r in gap_rows if r["afterSqueezeSameBodiesWithin2ft"]),
      "before walk still enabled", sum(1 for r in gap_rows if r["beforeWalkIdsStillEnabled"]))
print("rooms changed", len(room_rows), Counter(r["class"] for r in room_rows))
print("lost door-connected", [r["room"] for r in lost_door])
print("not explained", [r["room"] for r in room_rows if not r.get("explainedByPatch")])
