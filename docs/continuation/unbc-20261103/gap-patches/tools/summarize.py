"""Assemble the inventory, the reviewed patch file and the summary JSON.
usage: summarize.py WORK-DIR VALIDATE-DIR GEOMETRY.json OUT-DIR GRAPH-FULL.json
WORK-DIR holds gaps.json, designs.json, candidates2.json, dropped2.json,
candidates-kept-x.json and the final cell preview (cellpreview-final.json)."""
import json, os, sys, hashlib
from collections import Counter, defaultdict
work, val, geo, out, graph = sys.argv[1:6]
J = lambda p: json.load(open(p))
GEO = J(geo)
GR = J(graph)
EDGE = {e["id"]: e for e in GR["edges"]}
NODE = {n["id"]: n for n in GR["nodes"]}
REC = {r["key"]: r for r in GR["records"]}
def ends(eids):
    out = set()
    for i in eids:
        for nid in (EDGE[i]["from"], EDGE[i]["to"]):
            n = NODE.get(nid)
            if n and n["kind"] == "arrival": out.add(n["roomKey"])
    return out
names = {l["id"]: l["name"] for l in GEO["nativeLevels"]}
gaps = J(f"{work}/gaps.json")["gaps"]
designs = {d["gapId"]: d for d in J(f"{work}/designs.json")["designs"]}
cand2 = J(f"{work}/candidates2.json")
dropped = J(f"{work}/dropped2.json")["dropped"]
kept = J(f"{work}/candidates-kept-x.json")["candidates"]
guards = J(f"{val}/guards.json")
cellfinal = J(f"{work}/cellpreview-final.json")
refused_walk = {r["gapId"]: r["reason"] for r in cand2["refused"]}
gap_to_patch = {g: c["patch"]["id"] for c in cand2["candidates"] for g in c["gapIds"]}
guard_refused = {pid: msg for lv in guards.values() for pid, msg in lv["guard"].items()}
evidence_refused = {pid: msg for lv in guards.values() for pid, msg in lv["evidence"].items() if msg != "ok"}
dropped_ids = {d["patchId"]: d for d in dropped}
final_ids = [pid for lv in guards.values() for pid in lv["accepted"]]
rows = []
for g in gaps:
    d = designs[g["id"]]; cls, why = d["class"], d["reason"]; pid = gap_to_patch.get(g["id"])
    outcome = None
    if cls == "a" and g["id"] in refused_walk:
        cls, why = "d", "the walk passes beside this joint, not through it (no crossing of the designed strip)"
    if pid:
        outcome = ("patched" if pid in final_ids else "dropped: would isolate " + ", ".join(dropped_ids[pid]["wouldIsolate"]) if pid in dropped_ids
                   else "refused by guard: " + guard_refused.get(pid, evidence_refused.get(pid, "?")))
    rows.append({"gapId": g["id"], "levelId": g["levelId"], "floor": names[g["levelId"]], "class": cls, "reason": why,
                 "patchId": pid, "outcome": outcome or ("not patched (class %s)" % cls), "rooms": g["rooms"], "roomKeys": g["roomKeys"],
                 "walkEdgeIds": g["edgeIds"], "endpointRoomKeys": sorted(ends(g["edgeIds"])), "endpointRooms": sorted((REC[k]["number"] or REC[k]["name"]) for k in ends(g["edgeIds"]) if k in REC), "nativeCellIds": g["cells"], "pointFeet": g["pointFeet"],
                 "bodies": [{"nativeElementId": b["id"], "kind": b["kind"], "approximate": b["approximate"]} for b in g["bodies"]],
                 "bodyDistanceFeet": g["bodyDistanceFeet"], "walkClearanceFeet": g["walkWidthFeet"]})
def table(key):
    t = defaultdict(lambda: {"gaps": 0, "walks": set(), "rooms": set()})
    for r in rows:
        k = key(r); t[k]["gaps"] += 1; t[k]["walks"] |= set(r["walkEdgeIds"]); t[k]["rooms"] |= set(r["endpointRoomKeys"])
    return {f"{k[0]}|{k[1]}" if isinstance(k, tuple) else k: {"gaps": v["gaps"], "walks": len(v["walks"]), "rooms": len(v["rooms"])} for k, v in sorted(t.items())}
summary = {
    "byClassAndFloor": table(lambda r: (r["class"], r["floor"])),
    "byClass": table(lambda r: r["class"]),
    "byFloor": table(lambda r: r["floor"]),
    "byOutcome": dict(Counter(r["outcome"].split(":")[0] for r in rows)),
}
kmap = {c["patch"]["id"]: c for c in kept}
final = [kmap[pid] for pid in final_ids]
bands = Counter("exact contact (0 ft)" if c["exactGapFeet"] == 0 else "< 1e-12 ft" if c["exactGapFeet"] < 1e-12 else "1e-12 to 0.02 ft" if c["exactGapFeet"] < 0.02 else ">= 0.02 ft" for c in final)
patch_file = {"format": "openindoormaps-native-boundary-patches", "version": 1,
              "source": {"modelSha256": GEO["sourceModelSha256"], "roomsSha256": "5060e6f9f5a5b32c9b4d9b770fdfe693cccacc86ff8f58b0a4eee5a72bb9a09c"},
              "nativeBoundaryPatches": {"version": 1, "patches": [c["patch"] for c in final]}}
os.makedirs(out, exist_ok=True)
pf = json.dumps(patch_file, indent=1).encode()
open(f"{out}/OWNER-GAP-PATCHES.native-boundary-patches.json", "wb").write(pf)
res = {
    "format": "unbc-owner-gap-patches-v1",
    "authorization": {"statement": "project owner requested: patch accidental modelling gaps", "date": "2026-11-03",
                      "ownerWords": "go through all the gaps that are causing the extra connection in a lot of rooms where it is going through a very small gap that was an accident when we were designing it, so just fix it for us and patch the gap on how it should have been done"},
    "inputs": {"masterSha256": GEO["masterSha256"], "sourceModelSha256": GEO["sourceModelSha256"], "roomsSha256": patch_file["source"]["roomsSha256"]},
    "patchFile": {"path": "OWNER-GAP-PATCHES.native-boundary-patches.json", "sha256": hashlib.sha256(pf).hexdigest(), "patches": len(final), "status": "proposed",
                  "measuredGapBands": dict(bands)},
    "summary": summary,
    "dropped": dropped,
    "refusedByGuard": [{"patchId": k, "message": v} for k, v in guard_refused.items()],
    "refusedByEvidence": [{"patchId": k, "message": v} for k, v in evidence_refused.items()],
    "cellPreview": {"cellsTouched": len(cellfinal["cells"]), "cellsSplit": cellfinal["separatedPairs"], "isolated": cellfinal["isolated"],
                    "pieces": cellfinal["cells"]},
    "patches": [{"id": c["patch"]["id"], "levelId": c["levelId"], "floor": names[c["levelId"]], "shape": c["shape"],
                 "sourceWallId": c["patch"]["wallEvidence"][0]["nativeElementId"], "targetWallId": c["patch"]["wallEvidence"][1]["nativeElementId"],
                 "exactGapFeet": c["exactGapFeet"], "exactCornerDistancesFeet": c["exactCornerDistancesFeet"], "stripLengthFeet": c["patch"]["widthFeet"],
                 "gapIds": c["gapIds"], "rooms": c["rooms"], "walkEdgeIds": c["edgeIds"]} for c in final],
    "gaps": rows,
}
json.dump(res, open(f"{out}/GAP-PATCHES.json", "w"), indent=1)
print(json.dumps(summary, indent=1)); print(dict(bands), len(final))
