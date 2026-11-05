"""Compare a guide catalog compiled on the regenerated master with the final
candidate catalog compiled on master-0388, across the native-cell renumbering.

usage: compare-catalogs.py BEFORE-CATALOG BEFORE-GRAPH AFTER-CATALOG AFTER-GRAPH GAP-PATCHES.json VERIFICATION.json OUT.json

Guides are keyed by their walk without the cell number (`walk:<from>|<to>`).
A before guide whose walk no longer exists is "walk removed" (the regeneration
dropped that walk); a key present on both sides is "same" when the polyline is
identical, otherwise "changed". Each changed or lost guide is attributed to the
patches of its before cell and to the rooms the verification lists as changed.
"""
import hashlib, json, re, sys
from collections import Counter, defaultdict

bc, bgp, ac, agp, gpp, vp, out = sys.argv[1:8]
key = lambda eid: re.sub(r"^native-cell:[^:]+:\d+:", "", eid)
cell = lambda eid: re.match(r"^(native-cell:[^:]+:\d+):", eid).group(1) if eid.startswith("native-cell:") else None


def load(cat, graph):
    raw = open(cat, "rb").read(); P = json.loads(raw)
    G = json.load(open(graph))
    walks = {key(e["id"]): e for e in G["edges"] if e["kind"] == "walk" and e["enabled"]}
    guides = {}
    for x in P["guides"]:
        k = key(x["edgeId"])
        assert k not in guides, k
        guides[k] = x
    return hashlib.sha256(raw).hexdigest(), P, guides, walks


bsha, BP, BG, BW = load(bc, bgp)
asha, AP, AG, AW = load(ac, agp)
GP = json.load(open(gpp)); V = json.load(open(vp))
cell_patches = defaultdict(set)
for c in GP["cellPreview"]["pieces"]:
    for pid in c["patches"]:
        cell_patches[c["cellId"]].add(pid)
for p in GP["patches"]:
    for e in p["walkEdgeIds"]:
        cell_patches[cell(e)].add(p["id"])
changed_rooms = {r["roomKey"] for r in V["rooms"]["rows"] if "roomKey" in r}
rows, counts = [], Counter()
for k in sorted(set(BG) | set(AG)):
    b, a = BG.get(k), AG.get(k)
    if b and a:
        status = "same" if b["pointsFeet"] == a["pointsFeet"] and b.get("kind") == a.get("kind") else "changed"
    elif b:
        status = "lost: walk removed by regeneration" if k not in AW else "lost: walk kept, guide not compiled"
    else:
        status = "gained: new walk" if k not in BW else "gained: walk existed, guide newly compiled"
    counts[status] += 1
    if status == "same":
        continue
    bcell = cell(b["edgeId"]) if b else None
    acell = cell(a["edgeId"]) if a else None
    w = AW.get(k) or BW.get(k)
    rooms = sorted(set(w["roomKeys"]) if w else [])
    rows.append({"key": k, "status": status, "beforeEdgeId": b and b["edgeId"], "afterEdgeId": a and a["edgeId"],
                 "beforeCellPatches": sorted(cell_patches.get(bcell, [])),
                 "roomsChangedInVerification": sorted(set(rooms) & changed_rooms)})
cells_b = Counter(cell(x["edgeId"]) for x in BP["guides"])
json.dump({"format": "unbc-gap-regeneration-catalog-comparison-v1",
           "before": {"path": bc, "sha256": bsha, "guides": len(BP["guides"]), "sourceGeometryKey": BP.get("sourceGeometryKey")},
           "after": {"path": ac, "sha256": asha, "guides": len(AP["guides"]), "sourceGeometryKey": AP.get("sourceGeometryKey")},
           "counts": dict(counts),
           "differencesInPatchedCells": sum(1 for r in rows if r["beforeCellPatches"]),
           "differencesOutsidePatchedCells": [r for r in rows if not r["beforeCellPatches"]],
           "rows": rows}, open(out, "w"), indent=1)
print(bsha[:8], len(BP["guides"]), "->", asha[:8], len(AP["guides"]), dict(counts))
print("differences outside patched cells:", sum(1 for r in rows if not r["beforeCellPatches"]))
