"""Write the inventory inputs from a master's viewer/indoor.json without a
project import: geometry.json in the same table layout as scan-all-levels.ts
(walls, doors, fixtures, floors, records) and graph-full.json (nodes, edges,
records), which is what walk-squeezes.py / group-gaps.py read.
usage: extract-tables.py INDOOR.json MASTER-SHA256 OUT-DIR"""
import json, sys, os
src, sha, out = sys.argv[1:4]
d = json.load(open(src))
os.makedirs(out, exist_ok=True)
geo = {
    "masterSha256": sha, "sourceModelSha256": d["source"]["modelSha256"],
    "nativeLevels": [{"id": l["id"], "name": l["name"], "elevationFeet": l.get("elevationFeet")} for l in d["nativeLevels"]],
    "walls": [[w["levelId"], w["nativeElementId"], w.get("kind"), bool(w.get("approximate")), w.get("reviewPatchId"), w["ringsFeet"]] for w in d["walls"]],
    "doors": [[x["levelId"], x["nativeElementId"], x["id"], x["state"], x["roomKeys"], x.get("footprintFeet"), x.get("normalFeet"), x.get("hostWallNativeElementId")] for x in d.get("doors") or []],
    "fixtures": [[f["levelIds"], f["nativeElementId"], f["ringsFeet"]] for f in (d.get("circulationGeometry") or {}).get("fixtures") or []],
    "floors": [[f["nativeElementId"], f["elevationFeet"], f.get("partsFeet") or [f["ringsFeet"]]] for f in (d.get("walkingSupport") or {}).get("floors") or []],
    "records": [[r["key"], r["levelId"], r["number"] if r.get("number") is not None else (r.get("properties") or {}).get("number"), r.get("name"), bool(r.get("circulation")), (r.get("properties") or {}).get("floorOpeningsFeet")] for r in d["records"]],
}
json.dump(geo, open(f"{out}/geometry.json", "w"), separators=(",", ":"))
json.dump({"nodes": d["nodes"], "edges": d["edges"], "records": d["records"]}, open(f"{out}/graph-full.json", "w"))
print("walls", len(geo["walls"]), "edges", len(d["edges"]))
