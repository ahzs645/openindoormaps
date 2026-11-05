"""Squeezes in the regenerated graph that the before inventory did not have,
plus walks at patched joints that still reach a neighbour, with the rooms each
walk joins and the patches that cut the before cell of those rooms.

usage: residual-leaks.py BEFORE-DIR AFTER-DIR BEFORE-GAPS AFTER-GAPS GAP-PATCHES VERIFICATION OUT.json
"""
import json, math, sys
bdir, adir, bgaps, agaps, gpp, verp, out = sys.argv[1:8]
B = json.load(open(bgaps))["gaps"]; A = json.load(open(agaps))["gaps"]
GP = json.load(open(gpp)); V = json.load(open(verp))
g = json.load(open(f"{adir}/graph-full.json")); bg = json.load(open(f"{bdir}/graph-full.json"))
nodes = {n["id"]: n for n in g["nodes"]}; recs = {r["key"]: r for r in g["records"]}
E = {e["id"]: e for e in g["edges"]}
num = lambda k: (recs.get(k) or {}).get("number") or (recs.get(k) or {}).get("name") or k
portal = {}
for e in g["edges"]:
    if e["enabled"] and e["kind"] != "walk":
        for n in (e["from"], e["to"]):
            portal.setdefault(n, []).append(e)


def end(nid):
    n = nodes[nid]
    if n["kind"] == "arrival":
        return {"node": nid, "arrivalOf": num(n["roomKey"])}
    return {"node": nid, "portals": [{"edge": e["id"], "kind": e["kind"], "rooms": [num(k) for k in e.get("roomKeys", [])]} for e in portal.get(nid, [])]}


def match(x, pool):
    return [y for y in pool if y["levelId"] == x["levelId"] and sorted(y["bodyIds"]) == sorted(x["bodyIds"]) and math.dist(y["pointFeet"], x["pointFeet"]) < 2.0]


room_rows = {r["room"]: r for r in V["rooms"]["rows"] if "room" in r}
patch_cells = {}
for c in GP["cellPreview"]["pieces"]:
    for pid in c["patches"]:
        patch_cells.setdefault(c["cellId"], set()).add(pid)
rows = []
for a in A:
    if match(a, B):
        continue
    for eid in a["edgeIds"]:
        e = E[eid]
        rooms = sorted({num(k) for k in e["roomKeys"]})
        bpatch = sorted({p for rm in rooms for p in (room_rows.get(rm, {}).get("patchesInBeforeCells") or [])})
        rows.append({"gapId": a["id"], "levelId": a["levelId"], "pointFeet": a["pointFeet"], "bodyIds": a["bodyIds"],
                     "bodyDistanceFeet": a["bodyDistanceFeet"], "walkWidthFeet": a["walkWidthFeet"], "walk": eid,
                     "walkRooms": rooms, "from": end(e["from"]), "to": end(e["to"]),
                     "patchesInBeforeCellsOfTheseRooms": bpatch})
persist = []
for r in V["patches"]["rows"]:
    for t in r["afterWalksTouchingStrip"]:
        e = E[t["edgeId"]]
        persist.append({"patchId": r["patchId"], "kind": "walk runs along the strip boundary (touches, does not cross the interior)",
                        "walk": t["edgeId"], "insideLengthFeet": t["insideLengthFeet"], "from": end(e["from"]), "to": end(e["to"])})
for r in V["patchedGaps"]["rows"]:
    gap = next(x for x in GP["gaps"] if x["gapId"] == r["gapId"])
    if not gap["outcome"].startswith("patched"):
        continue
    for gid in r["afterSqueezeSameBodiesWithin2ft"]:
        a = next(x for x in A if x["id"] == gid)
        for eid in a["edgeIds"]:
            e = E[eid]
            persist.append({"patchId": r["patchId"], "gapId": r["gapId"],
                            "kind": "the patched joint is closed, but the walk still squeezes past the same partition through the adjacent clearance",
                            "afterGap": gid, "bodyIds": a["bodyIds"], "bodyDistanceFeet": a["bodyDistanceFeet"], "walkWidthFeet": a["walkWidthFeet"],
                            "walk": eid, "from": end(e["from"]), "to": end(e["to"])})
json.dump({"format": "unbc-gap-regeneration-residual-leaks-v1", "newSqueezeWalks": rows, "atPatchedJoints": persist},
          open(out, "w"), indent=1)
for r in rows:
    f = r["from"].get("arrivalOf") or [p["rooms"] for p in r["from"]["portals"]]
    t = r["to"].get("arrivalOf") or [p["rooms"] for p in r["to"]["portals"]]
    print(r["gapId"], f"{r['bodyDistanceFeet']:.2g}", f"{r['walkWidthFeet']:.3f}", f, "->", t)
for p in persist:
    print("PERSIST", p["patchId"][:45], p["from"].get("arrivalOf"), "->", [x["rooms"] for x in p["to"].get("portals", [])] or p["to"].get("arrivalOf"))
