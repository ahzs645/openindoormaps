"""Native-wall door sides: which native cell lies on each side of every door.

Diagnostic only. For each source door, step just past each face of its saved
footprint along the saved normal and find the native circulation cell (the
wall-bounded face) containing that point. Cell owners come from the cell's
room keys, i.e. the old room shapes supply names only. Connected doors are
used to measure agreement; unmatched doors receive a proposed owner pair.
No geometry, owner or access is changed.
"""
import collections
import json
import math
import os
import sys
import zipfile

candidate, preview, out = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.loads(zipfile.ZipFile(candidate).read("viewer/indoor.json"))
rec = {r["key"]: r for r in d["records"]}
label = lambda k: f"{rec[k].get('number') or ''} {rec[k].get('name') or ''}".strip() if k in rec else k

cells_by_level = collections.defaultdict(list)
for name in os.listdir(os.path.join(preview, "data")):
    if not name.startswith("level-"):
        continue
    for c in json.load(open(os.path.join(preview, "data", name)))["cells"]:
        xs = [p[0] for p in c["ringsFeet"][0]]
        ys = [p[1] for p in c["ringsFeet"][0]]
        entry = (c["id"], c["roomKeys"], c["ringsFeet"], (min(xs), min(ys), max(xs), max(ys)))
        for lid in c["levelIds"]:
            if all(e[0] != c["id"] for e in cells_by_level[lid]):
                cells_by_level[lid].append(entry)


def inside_ring(x, y, ring):
    hit = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def cell_at(level, x, y):
    for cid, owners, rings, (a, b, c, e) in cells_by_level.get(level, []):
        if a <= x <= c and b <= y <= e:
            # Even-odd over outer ring and holes.
            if sum(inside_ring(x, y, r) for r in rings) % 2 == 1:
                return cid, owners
    return None, []


STEPS = [0.25, 0.5, 1.0, 1.5]  # feet beyond the footprint face; bounded, reported per side
rows = []
for door in d["doors"]:
    fp, nrm, pt = door.get("footprintFeet"), door.get("normalFeet"), door.get("pointFeet")
    if not (fp and nrm and pt):
        continue
    nx, ny = nrm
    ln = math.hypot(nx, ny) or 1
    nx, ny = nx / ln, ny / ln
    depth = max(abs((p[0] - pt[0]) * nx + (p[1] - pt[1]) * ny) for p in fp)
    sides = []
    for sign in (1, -1):
        found = (None, [], None)
        for step in STEPS:
            off = depth + step
            cid, owners = cell_at(door["levelId"], pt[0] + sign * nx * off, pt[1] + sign * ny * off)
            if cid:
                found = (cid, owners, step)
                break
        sides.append(found)
    (ca, oa, sa), (cb, ob, sb) = sides
    existing = sorted(door.get("roomKeys") or [])
    if ca and cb and ca != cb:
        kind = "native-pair"
    elif ca and cb:
        kind = "same-cell"
    elif ca or cb:
        kind = "one-side"
    else:
        kind = "no-cell"
    native_owners = sorted(set(oa) | set(ob))
    agrees = bool(existing) and set(existing) <= set(native_owners)
    rows.append(
        {
            "door": door["nativeElementId"],
            "levelId": door["levelId"],
            "state": door.get("state"),
            "existingOwners": [label(k) for k in existing],
            "kind": kind,
            "sideA": {"cell": ca, "owners": [label(k) for k in oa], "stepFeet": sa},
            "sideB": {"cell": cb, "owners": [label(k) for k in ob], "stepFeet": sb},
            "existingWithinNativeOwners": agrees,
        }
    )

summary = collections.Counter((r["state"], r["kind"]) for r in rows)
connected = [r for r in rows if r["state"] == "connected" and r["kind"] == "native-pair"]
agree = sum(r["existingWithinNativeOwners"] for r in connected)
report = {
    "format": "native-wall-door-sides-v1",
    "diagnosticOnly": True,
    "doors": len(rows),
    "byStateAndKind": {f"{s}/{k}": n for (s, k), n in sorted(summary.items(), key=lambda x: str(x))},
    "connectedNativePairAgreement": {"agree": agree, "of": len(connected)},
    "rows": rows,
}
json.dump(report, open(out, "w"), indent=1)
print(json.dumps({k: v for k, v in report.items() if k != "rows"}, indent=1))
for t in (2315416, 1328018, 1779399, 1779388, 2471813, 1500735, 296596, 621887, 1425507):
    for r in rows:
        if r["door"] == t:
            print(t, r["state"], r["kind"], "| A:", r["sideA"]["owners"], r["sideA"]["stepFeet"], "| B:", r["sideB"]["owners"], r["sideB"]["stepFeet"], "| existing:", r["existingOwners"])
