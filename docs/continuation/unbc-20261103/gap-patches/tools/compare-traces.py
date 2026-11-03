"""Compare the baseline selection trace with the group-preview trace per level.
usage: compare-traces.py VALIDATE-DIR GRAPH-FULL.json OUT.json
A room is 'separated' when it shared a native region with another room before
and no longer shares it with that room after. A region holding rooms but no
measured door is reported (the selection trace closes doors, so its doors list
is the region's door contact)."""
import glob, json, sys
val, graph, out = sys.argv[1:4]
G = json.load(open(graph)); rec = {r["key"]: r for r in G["records"]}
name = lambda k: (rec[k]["number"] or rec[k]["name"]) if k in rec else k
res = {"levels": []}
for f in sorted(glob.glob(f"{val}/level-*.json")):
    d = json.load(open(f))
    if not d.get("after"): continue
    before = {k: frozenset(r["roomKeys"]) for r in d["before"] for k in r["roomKeys"]}
    after = {k: frozenset(r["roomKeys"]) for r in d["after"] for k in r["roomKeys"]}
    separated = sorted(k for k in before if k in after and len(before[k]) > 1 and len(after[k]) < len(before[k]))
    doorless_before = {frozenset(r["roomKeys"]) for r in d["before"] if r["roomKeys"] and not r["nativeDoorIds"]}
    new_doorless = [sorted(name(k) for k in r["roomKeys"]) for r in d["after"] if r["roomKeys"] and not r["nativeDoorIds"] and frozenset(r["roomKeys"]) not in doorless_before]
    res["levels"].append({"levelId": d["levelId"], "patches": len(d["accepted"]), "regionsBefore": len(d["before"]), "regionsAfter": len(d["after"]),
                          "roomsSeparated": len(separated), "separatedRooms": [name(k) for k in separated], "newDoorlessRegions": new_doorless,
                          "baselineSeconds": d["beforeSeconds"]})
json.dump(res, open(out, "w"), indent=1)
for l in res["levels"]: print(l["levelId"], l["patches"], l["regionsBefore"], "->", l["regionsAfter"], "separated", l["roomsSeparated"], "new door-less", l["newDoorlessRegions"])
