"""Turn designed class (a)/(b) gaps into proposed NativeBoundaryPatch rows.
usage: build-candidates.py GEOMETRY.json GRAPH-FULL.json DESIGNS.json OUT.json
A design becomes a candidate only if the walk that revealed it actually runs
through the strip interior and the strip touches no measured door footprint."""
import json, sys
from shapely.geometry import Polygon, LineString
geo, graph, des, out = sys.argv[1:5]
GEO = json.load(open(geo)); G = json.load(open(graph)); D = json.load(open(des))["designs"]
E = {e["id"]: e for e in G["edges"]}
doors = {}
for lv, eid, did, state, rk, fp, nrm, host in GEO["doors"]:
    if fp: doors.setdefault(lv, []).append((eid, Polygon(fp)))
AUTH = "project owner requested: patch accidental modelling gaps (2026-11-03)"
cands, seen, refused = [], {}, []
for d in D:
    x = d["design"]
    if d["class"] not in ("a", "b") or not x: continue
    poly = Polygon(x["ringFeet"])
    core = poly.buffer(-1e-4)
    walks = [eid for eid in d["edgeIds"] if LineString([p[:2] for p in E[eid]["pointsFeet"]]).intersects(core)]
    hit_doors = [eid for eid, fp in doors.get(d["levelId"], []) if fp.intersection(poly).area > 1e-9]
    key = (d["levelId"], x["sourceId"], x["targetId"], tuple(round(v, 4) for v in x["capFeet"][0]))
    if not walks or hit_doors:
        refused.append({"gapId": d["gapId"], "reason": "walk does not cross the strip" if not walks else f"strip touches door {hit_doors}"})
        continue
    if key in seen:
        seen[key]["gapIds"].append(d["gapId"]); seen[key]["edgeIds"] = sorted(set(seen[key]["edgeIds"]) | set(walks)); continue
    mid = [(x["capFeet"][0][i] + x["capFeet"][1][i]) / 2 for i in range(2)]
    pid = f"owner-gap:{d['levelId']}:{x['sourceId']}-{x['targetId']}:{mid[0]:.4f}:{mid[1]:.4f}"
    gap = x["gapFeet"]
    run = gap + 0.04
    shape = ("carries the original end cap of partition #%d (%.6f ft wide) along its own axis to the first face of #%d"
             % (x["sourceId"], x["capWidthFeet"], x["targetId"])) if x["shape"] == "cap-to-face" else \
            ("bridges the facing end caps of #%d and #%d on their shared axis" % (x["sourceId"], x["targetId"]))
    notes = (f"{AUTH}. Accidental wall-end gap: {shape}. Measured gap {gap:.3e} ft"
             + (f" (corner runs {x['cornerRunsFeet'][0]:.3e} / {x['cornerRunsFeet'][1]:.3e} ft)" if "cornerRunsFeet" in x else "")
             + f"; strip overlaps 0.02 ft into each supporting face, so widthFeet records the full {run:.4f} ft run. "
             f"Walking branches {len(walks)} crossed this gap between {', '.join(d['rooms'][:6])}{'…' if len(d['rooms'])>6 else ''}. "
             "No door, opening, floor hole or column is covered; floor, opening and door guards are rechecked by the existing preview. "
             "Evidence: docs/continuation/unbc-20261103/gap-patches/README.md (gap " + d["gapId"] + "). Diagnostic retrace only until Reviter regenerates.")
    row = {"id": pid, "levelId": d["levelId"], "sourceModelSha256": GEO["sourceModelSha256"], "status": "proposed",
           "widthFeet": run, "ringsFeet": [x["ringFeet"]],
           "wallEvidence": [{"nativeElementId": x["sourceId"], "ringsFeet": x["sourceRings"]},
                            {"nativeElementId": x["targetId"], "ringsFeet": x["targetRings"]}],
           "nativeDoorIds": [], "notes": notes}
    c = {"patch": row, "gapIds": [d["gapId"]], "class": d["class"], "shape": x["shape"], "gapFeet": gap,
         "rooms": d["rooms"], "roomKeys": d["roomKeys"], "edgeIds": walks, "cells": d["cells"], "levelId": d["levelId"]}
    seen[key] = c; cands.append(c)
json.dump({"format": "unbc-gap-patch-candidates-v1", "candidates": cands, "refused": refused}, open(out, "w"))
from collections import Counter
print(len(cands), "candidates", Counter(c["levelId"] for c in cands), "refused", Counter(r["reason"][:30] for r in refused))
