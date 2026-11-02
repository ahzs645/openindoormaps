"""Build the three source-evidence case files from read-only inputs.

Inputs (all read-only): the native dump written by dump-native-evidence.ts, the
master's floors/rooms.json, the pathway-preview data exported from that master,
and the earlier map-build tables in cand-final/. Needs shapely (case 3 only).

    python3 -I build-evidence.py DUMP.json ROOMS.json PREVIEW_DATA_DIR CAND_FINAL_DIR OUT_DIR \
        MASTER_ZIP FINAL_CANDIDATE_ZIP

Nothing here decides ownership, edits a master or changes routing data.
"""
import hashlib
import json
import math
import os
import sys

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.validation import make_valid

dump_path, rooms_path, preview, cand, out_dir, master_zip, final_zip = sys.argv[1:8]


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


dump = json.load(open(dump_path))
rooms = json.load(open(rooms_path))
ann = {r["key"]: r for r in rooms["annotations"]}
sides = {r["door"]: r for r in json.load(open(os.path.join(cand, "native-door-sides.json")))["rows"]}
doors_native = json.load(open(os.path.join(cand, "doors-native.json")))
door_rows = {r[1]: dict(zip(doors_native["fields"], r)) for r in doors_native["rows"]}
graph = json.load(open(os.path.join(cand, "graph-full.json")))
grec = {r["key"]: r for r in graph["records"]}
levels = {}


def level(lvl):
    if lvl not in levels:
        levels[lvl] = json.load(open(os.path.join(preview, f"level-{lvl}.json")))
    return levels[lvl]


def recs(case):
    return {r["elementId"]: r for r in dump["cases"][case]["records"]}


def bnds(r):
    b = r["boundsFeet"]
    return {k: [b["min"][k], b["max"][k]] for k in "xyz"}


def brief(r):
    keep = ("elementId", "categoryId", "categoryName", "categorySource", "typeName", "wallKind",
            "renderGeometryProvenance", "orientedBox", "solid")
    o = {k: r.get(k) for k in keep if r.get(k) is not None}
    o["boundsFeet"] = bnds(r)
    o["persistedHostId"] = (r.get("host") or {}).get("hostId")
    o["associatedLevelId"] = (r.get("associatedLevel") or {}).get("levelId")
    return o


def ring_dist(p, ring):
    best = (1e18, None)
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
        q = (a[0] + t * dx, a[1] + t * dy)
        d = math.hypot(p[0] - q[0], p[1] - q[1])
        if d < best[0]:
            best = (d, q)
    return best


def inside(p, ring):
    x, y = p
    hit = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def cell_at(lvl, p):
    for c in level(lvl)["cells"]:
        if sum(inside(p, r) for r in c["ringsFeet"]) % 2 == 1:
            return c["id"]
    return None


def segs_in(ring, win):
    x0, x1, y0, y1 = win
    out = []
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        if min(a[0], b[0]) <= x1 and max(a[0], b[0]) >= x0 and min(a[1], b[1]) <= y1 and max(a[1], b[1]) >= y0:
            out.append([a[:2], b[:2]])
    return out


def cell_segments(lvl, cid, win):
    c = next(c for c in level(lvl)["cells"] if c["id"] == cid)
    return {"id": cid, "exactFaceId": c["exactFaceId"], "roomCount": len(c["roomKeys"]),
            "rooms": [f"{ann[k].get('number')} {ann[k].get('name')}" if k in ann else k for k in c["roomKeys"]],
            "nativeFloorIds": c["nativeFloorIds"], "ringPointCounts": [len(r) for r in c["ringsFeet"]],
            "segmentsInWindow": {f"ring{i}": s for i, r in enumerate(c["ringsFeet"]) if (s := segs_in(r, win))},
            "window": {"x": win[:2], "y": win[2:]}}


def outline_rows(lvls, points, win=None, limit=12):
    rows = []
    for r in rooms["annotations"]:
        if r.get("levelId") not in lvls or r.get("status") == "deleted" or not r.get("polygonFeet"):
            continue
        ring = r["polygonFeet"]
        ds = {name: ring_dist(p, ring) for name, p in points.items()}
        xs = [q[0] for q in ring]
        ys = [q[1] for q in ring]
        rows.append({"key": r["key"], "levelId": r["levelId"], "room": f"{r.get('number')} {r.get('name')}",
                     "polygonSource": (r.get("source") or {}).get("polygon"), "confidence": r.get("confidence"),
                     "boundaryReview": r.get("boundaryReview"),
                     "bboxFeet": {"x": [min(xs), max(xs)], "y": [min(ys), max(ys)]},
                     **{f"{n}ToOutlineFeet": round(d[0], 4) for n, d in ds.items()},
                     **{f"{n}NearestOutlinePoint": [round(d[1][0], 4), round(d[1][1], 4)] for n, d in ds.items()}})
    first = next(iter(points))
    rows.sort(key=lambda x: x[f"{first}ToOutlineFeet"])
    return rows[:limit]


def plan_items(case, lvl, win, kinds=("walls", "doors", "columns")):
    R = recs(case)
    p = dump["cases"][case]["plans"][str(lvl)]
    out = {"cutElevationFeet": p["cutElevation"]}
    for k in kinds:
        rows = []
        for w in p[k]:
            xs = [q[0] for q in w["polygon"]]
            ys = [q[1] for q in w["polygon"]]
            if max(xs) >= win[0] and min(xs) <= win[1] and max(ys) >= win[2] and min(ys) <= win[3]:
                r = R.get(w["elementId"], {})
                rows.append({"elementId": w["elementId"], "categoryName": r.get("categoryName"), "typeName": r.get("typeName"),
                             "wallKind": r.get("wallKind"), "approximate": w.get("approximate"),
                             "persistedHostId": (r.get("host") or {}).get("hostId"), "polygonFeet": w["polygon"]})
        out[k] = rows
    return out


inputs = {
    "master-0388.zip": {"path": master_zip, "sha256": sha(master_zip)},
    "floors/rooms.json (from the master)": {"path": "master-0388.zip!floors/rooms.json", "sha256": sha(rooms_path)},
    "model/…(1).rvt (from the master)": {"path": "master-0388.zip!model/UNBC Model - 2026-06-30 - FINAL (Fixed Library) (1).rvt", "sha256": dump["rvt"]["sha256"]},
    "native dump (dump-native-evidence.ts output, scratch)": {"sha256": sha(dump_path), "convert": dump["convert"]},
    "final candidate zip": {"path": final_zip, "sha256": sha(final_zip)},
    "pathway preview index.json": {"path": os.path.join(preview, "index.json"), "sha256": sha(os.path.join(preview, "index.json"))},
}
for name in ("native-door-sides.json", "doors-native.json", "walls-native.json", "graph-full.json"):
    inputs[f"cand-final/{name}"] = {"path": os.path.join(cand, name), "sha256": sha(os.path.join(cand, name))}


def with_levels(lvls):
    i = dict(inputs)
    for l in lvls:
        p = os.path.join(preview, f"level-{l}.json")
        i[f"pathway preview level-{l}.json"] = {"path": p, "sha256": sha(p)}
    return i


method_common = [
    "RVT extracted from master-0388.zip and checked against manifest sha256 8c294549…; converted with Reviter convertRvtBytes(bytes, archivedFileName, {}) exactly as scripts/prepare-indoor-project.ts does (Reviter 2e7875d, unmodified checkout), see tools/dump-native-evidence.ts.",
    "Records = ConvertResult.elementBounds (category, provenance, orientedBox, boundsFeet, solid); host links = ConvertResult.nativeHostRelations (Partitions/InsertableInst.m_hostId, evidence 'persisted'); plan cut = architecturalPlanGeometry(model, level) used by the compiler and the aperture validator.",
    "Native cells and their room lists come from the pathway preview exported from the same master (index.json sourceInputSha256 6e7971f8…); door-side probes from cand-final/native-door-sides.json (0.25/0.5/1/1.5 ft steps beyond the saved footprint face).",
    "Dry-run validation calls the compiler's own withReviewedDoorApertures on an in-memory one-patch review; no master, review file, owner, access or route is written.",
]

origin = dump["meshes"]["origin"]


def mesh_world(eid):
    m = dump["meshes"]["byElement"].get(str(eid))
    if not m:
        return None
    pts = [[p[0] + origin["x"], p[1] + origin["y"], p[2] + origin["z"]] for t in m["triangles"] for p in t]
    # group into connected x-intervals of the triangle set
    tris = [[[p[0] + origin["x"], p[1] + origin["y"], p[2] + origin["z"]] for p in t] for t in m["triangles"]]
    spans = sorted([min(p[0] for p in t), max(p[0] for p in t)] for t in tris)
    merged = []
    for a, b in spans:
        if merged and a <= merged[-1][1] + 1e-6:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return {"batches": m["batches"], "triangleCount": m["triangleCount"],
            "worldBoundsFeet": {k: [min(p[i] for p in pts), max(p[i] for p in pts)] for i, k in enumerate("xyz")},
            "worldXIntervalsOfBody": merged,
            "note": "Float32 scene positions + ConvertResult.origin (micrometre-level quantisation)."}


# ------------------------------------------------------------------ case 1
R1 = recs("case1-2471813")
c1 = dump["case1ValidatorReplay"]
frame_roles = {2471836: "west jamb (inner face x = max x)", 2471837: "east jamb (inner face x = min x)",
               2471832: "sill (bottom transom under the leaf, spans the clear width)",
               2471834: "head (transom at the leaf top, spans the clear width)"}
frames = []
for eid in (2471836, 2471837, 2471832, 2471834):
    r = R1[eid]
    b = bnds(r)
    frames.append({"nativeElementId": eid, "role": frame_roles[eid], "categoryId": r["categoryId"], "categoryName": r["categoryName"],
                   "categorySource": r["categorySource"], "typeName": r.get("typeName"),
                   "renderGeometryProvenance": r["renderGeometryProvenance"], "persistedHostId": r["host"]["hostId"],
                   "hostRelation": r["host"], "boundsFeet": b,
                   "crossesPlanCutElevation": b["z"][0] < dump["cases"]["case1-2471813"]["plans"]["1487816"]["cutElevation"] < b["z"][1],
                   "orientedBoxEqualsElementBounds": True, "orientedBox": r["orientedBox"]})
host_children = []
for k in R1[2471383]["hostedChildren"]:
    r = R1[k]
    host_children.append({"elementId": k, "categoryName": r.get("categoryName"), "provenance": r.get("renderGeometryProvenance"),
                          "boundsFeet": bnds(r)})
case1 = {
    "format": "native-source-evidence-v1",
    "case": "door 2471813: 10-1300 Vestibule <-> 10-1302 Atrium, Campus Floor 1 (native level 1487816, Floor 1.25)",
    "status": "EVIDENCE_ONLY_NOT_APPLIED",
    "inputs": with_levels([1487816]),
    "method": method_common + [
        "Frame members = persisted children of curtain host 2471383 with category -2000171; roles by exact coordinates: jambs end at the leaf's x extent, sill/head span the same x extent at the leaf bottom/top z.",
        "Element 2472128 classified from its decoded category/type, persisted host links, solid, and the per-triangle native BRep mesh in ConvertResult.meshes (elementIds).",
    ],
    "door": brief(R1[2471813]) | {"hostedBy": R1[2471813]["host"], "savedPreparedRecord": door_rows.get(2471813)},
    "curtainHost": brief(R1[2471383]) | {"persistedChildren": host_children,
                                          "planParts(level 1487816)": [w["polygonFeet"] for w in plan_items("case1-2471813", 1487816, (171, 183, 760, 765))["walls"] if w["elementId"] == 2471383]},
    "planCutElevationFeet": dump["cases"]["case1-2471813"]["plans"]["1487816"]["cutElevation"],
    "frameEvidence": [{"nativeElementId": f["nativeElementId"], "orientedBox": f["orientedBox"]} for f in frames],
    "frameMembers": frames,
    "frameFindings": [
        "Exactly four category -2000171 (Curtain Wall Mullions, element-header, renderGeometryProvenance 'native') members of the same persisted host 2471383 frame the leaf: jambs 2471836/2471837, sill 2471832, head 2471834.",
        "Jamb inner faces: x = 174.0363832634051 (2471836 max x) and x = 179.64661948387752 (2471837 min x). The proposal text wrote the second value as 179.6466194838775; that string is a different double. Use 179.64661948387752 (it is also the value in the proposal's own apertureFeet and in the door orientedBox).",
        "Only the two jambs cross the plan cut elevation 7.2808398950131235 ft; sill z 3.2808..3.4449 and head z 11.0728..11.2369 do not (the validator's 'cutFrames.length === 2' rule).",
        "Sill 2471832 spans z 3.2808398950131235..3.4448818897637796, a rise of 0.16404 ft (50 mm) above the native floor; the leaf bottom (3.4448818897637743) sits on it. This is a model-derived 50 mm threshold, not a site measurement.",
        "The validator only checks category, provenance, persisted host and exact box equality, so it also accepts the top mullion 2471831 in place of the head (control replay). The head/sill roles above rest on z: the head starts at 11.072834645669289 and the sill ends at 3.4448818897637796, within 6e-15 ft of the leaf's top 11.072834645669293 and bottom 3.4448818897637743.",
    ],
    "dryRunValidatorReplay": c1,
    "element2472128": {
        "record": brief(R1[2472128]),
        "persistedHostRelation": R1[2472128].get("host"),
        "hostedChildren": R1[2472128]["hostedChildren"],
        "nativeMesh": mesh_world(2472128),
        "planPolygon": next(w["polygonFeet"] for w in plan_items("case1-2471813", 1487816, (170, 184, 762, 763))["walls"] if w["elementId"] == 2472128),
        "adjacentPlanWalls": [w for w in plan_items("case1-2471813", 1487816, (169, 185, 750, 764))["walls"] if w["elementId"] in (1501264, 1501266)],
        "classification": "NOT a curtain grid line or glazing element: category -2000011 Walls (element-header), basic wall type 'Interior Wall - 100mm', 0.328 ft thick, z 3.2808..13.7795, location line y 762.6691196429163 from x 170.6844585036667 to 182.9836868739894 between the faces of walls 1501264 and 1501266. Its native BRep body (Gypsum Wallboard, 24 triangles) exists only at x 170.684..171.373 and x 182.266..182.984, i.e. it is cut exactly where curtain wall 2471383 (x 171.37343488161943..182.265823333063) is embedded. In the native body there is no 100 mm wall across the door band.",
        "consequence": "architecturalPlanGeometry draws 2472128 from its full-length solid, so the plan/visitor wall list shows a 100 mm wall across the whole door band (y 762.5051..762.8332 over x 170.6845..182.9837). The reviewed curtain aperture alone cuts only host 2471383; the post-cut replay lists 2472128 as still overlapping the aperture. A source review must decide how the embedding wall's opening is represented (e.g. listing 2472128 in the aperture's wallEvidence, replayed below as an option, or a compiler fix that honours the embedded-curtain cut) before the door can connect.",
        "notConfirmed": "Whether a physical partition exists on site at this line (the native body says no).",
    },
    "nativeSides": sides.get(2471813),
    "cellOutlinesNearDoor": [cell_segments(1487816, "native-cell:3.280840:474", (170, 184, 755, 768)),
                             cell_segments(1487816, "native-cell:3.280840:459", (170, 184, 760, 768))],
    "roomOutlines": outline_rows({1487816}, {"doorCentre": (176.8415013736413, 762.6395333781979),
                                             "northProbe": (176.8415013736413, 762.6395333781979 + 0.10416666666666 + 0.25),
                                             "southProbe": (176.8415013736413, 762.6395333781979 - 0.10416666666666 - 0.25)}, limit=6),
    "remainsForDecision": [
        "Owner/site: is door 2471813 normally open and public; is there any partition on the 2472128 line (native body says no).",
        "Source review: how the plan represents the embedded-curtain cut in 2472128 (see consequence).",
        "Whether the 50 mm modelled sill (2471832) is real; it must stay a stepped threshold unless a site check says otherwise.",
    ],
}

# ------------------------------------------------------------------ case 2
R2 = recs("case2-2315416")
centre = (30.612502027737193, 528.5495338272797)
face = (32.25292197524376, 528.5495338272797)
probe = (32.50292197524376, 528.5495338272797)
strip = {"x": [32.25292197524376, 35.4648246270012], "y": [526.6952031186182, 530.4038645359411]}
samples = [(x, y) for x in (32.30, 33.0, 34.0, 35.0, 35.4) for y in (526.8, 527.5, 528.55, 529.5, 530.3)]
in_strip_volume = []
for r in dump["cases"]["case2-2315416"]["records"]:
    b = r["boundsFeet"]
    if b["max"]["x"] > strip["x"][0] + 1e-6 and b["min"]["x"] < strip["x"][1] - 1e-6 and b["max"]["y"] > strip["y"][0] and b["min"]["y"] < strip["y"][1] and b["max"]["z"] > 24.278215223097114 + 1e-6 and b["min"]["z"] < 33.46:
        in_strip_volume.append(brief(r))
lvl3 = level(400176)
rows2 = outline_rows({400176, 1487353}, {"probe": probe, "apertureFace": face, "doorCentre": centre}, limit=16)
for row in rows2:
    row["inCell826"] = row["key"] in next(c for c in lvl3["cells"] if c["id"].endswith(":826"))["roomKeys"]
    row["stripSamplesInside"] = sum(inside(p, ann[row["key"]]["polygonFeet"]) for p in samples)
f2 = [r for r in rooms["annotations"] if r["key"] in ("rm-694-3eff6106de76", "rm-694-fa60cb06b7c9")]
analog_edge = [e for e in graph["edges"] if e.get("nativeElementId") == 2311764]
strip_edge_walls = {}
for eid in (2315413, 1505949, 1505979, 2066749, 2038167, 2315493):
    r = R2[eid]
    strip_edge_walls[eid] = brief(r) | {"hostedDoors": [k for k in r["hostedChildren"] if R2.get(k, {}).get("categoryId") == -2000023]}
case2 = {
    "format": "native-source-evidence-v1",
    "case": "door 2315416: 08-360 Link <-> Building 08 side, Campus Floor 3 (native level 400176)",
    "status": "EVIDENCE_ONLY_NO_OWNER_CHOSEN",
    "inputs": with_levels([400176, 694]),
    "method": method_common + [
        "Strip = x 32.25292197524376 (curtain host 2315413 east face) .. 35.4648246270012 (08-316 Corridor drawn west edge), y 526.6952031186182..530.4038645359411 (the door's clear width). 25 sample points (x 32.30/33/34/35/35.4 × y 526.8/527.5/528.55/529.5/530.3) tested against every native cell and every room outline on levels 400176 and 1487353.",
        "Distances measured on the door's centre ray (y 528.5495338272797): door centre x 30.612502027737193; aperture east face x 32.25292197524376; native probe x 32.50292197524376 (0.25 ft beyond the face).",
    ],
    "distanceConvention": {"doorCentreTo08-316OutlineFeet": 4.8523, "apertureFaceTo08-316OutlineFeet": 3.2119, "nativeProbeTo08-316OutlineFeet": 2.9619,
                           "note": "All three are the same gap measured from different origins along the normal: 4.852 = 1.640 (half host band) + 3.212; 3.212 = 0.25 + 2.962."},
    "door": brief(R2[2315416]) | {"savedPreparedRecord": door_rows.get(2315416)},
    "historicalSill": {"elementId": 2315423, "record": brief(R2[2315423]),
                       "riseFeet": 24.442257217847768 - 24.278215223097114,
                       "exactRationalRiseFeet(Oct 18 filled-body diagnostic)": "92347433304021/562949953421312",
                       "status": "MODEL-DERIVED, NOT MEASURED: a 50 × 150 mm bottom mullion in host 2315413 whose top is 0.16404 ft (50 mm) above the native floor; the leaf starts at that top. No site measurement exists."},
    "stripContents": {
        "nativeRecordsWhoseBoundsEnterTheStripAboveTheFloor": in_strip_volume,
        "finding": "No native element (wall, curtain member, door, column, railing, room/area/separation record) has bounds inside the strip volume above the floor top 24.278 ft. The strip is open floor bounded by host 2315413 (west), basic walls 1505949 (south face y 523.0768) and 1505979 (north face y 532.4029), and continues east without any native wall at x 35.46.",
        "sampleCells": {str(p): cell_at(400176, p) for p in samples},
        "roomOutlinesCoveringAnySample": [r["room"] for r in rows2 if r["stripSamplesInside"]],
    },
    "roomBoundingAndRoomRecords": {
        "roomAreaCensus": dump["roomAreaCensus"],
        "finding": "The converted model exposes no Room (-2000160), RoomSeparationLines (-2000066), Area (-2003200) or AreaSchemeLines records anywhere (the schema declares Room/RoomBoundary* classes, but no instances are decoded into elementBounds). Room ownership in this pipeline comes only from DWG-derived outlines in floors/rooms.json; there is no native room boundary or separation line to consult.",
    },
    "stripEdgeWalls": strip_edge_walls,
    "curtain2066749Note": "Curtain host 2066749 (north of wall 1505979) has bounds and all 23 hosted members at y >= 536.0807; its decoded solid location line nominally starts at y 522.3604 (x 33.827), which would pass through the strip, but no geometry or member exists there. Its envelope east face x 35.46744806341993 equals 08-316's drawn west edge x 35.4648246270012 within 0.0026 ft.",
    "planWallsAndDoors(level 400176)": plan_items("case2-2315416", 400176, (26, 40, 515, 537)),
    "nativeCells": {"sides(native-door-sides.json)": sides.get(2315416),
                    "cell826NearStrip": cell_segments(400176, "native-cell:24.278215:826", (26, 40, 518, 538)),
                    "cell816NearDoor": cell_segments(400176, "native-cell:24.278215:816", (20, 34, 518, 538))},
    "roomOutlines": rows2,
    "floor2Analog": {
        "door": 2311764, "host": 2311758,
        "graphEdge": [{"id": e["id"], "enabled": e["enabled"], "roomKeys": e["roomKeys"],
                       "rooms": [f"{grec.get(k, {}).get('number')} {grec.get(k, {}).get('name')}" for k in e["roomKeys"]]} for e in analog_edge],
        "rooms": [{"key": r["key"], "room": f"{r['number']} {r['name']}", "polygonSource": r["source"]["polygon"], "polygonFeet": r["polygonFeet"]} for r in f2],
        "planWallsAndDoors(level 694)": plan_items("case2-2315416", 694, (26, 40, 519, 537)),
        "finding": "Floor 2 has the same curtain door geometry (host 2311758 x 28.972..32.253, same door clear width y 526.6952..530.4039) and the same bounding walls (1513774 south, 1513313 north). There the space east of the host is drawn as 08-216 Vestibule, whose outline starts at x 32.2491 (0.0038 ft from the host face) and covers the strip; door 2311764 is connected 08-216 Vestibule <-> 08-260 Link. On Floor 3 the corresponding footprint is drawn as 08-316 Corridor (x 35.4648..59.8648), with no vestibule label.",
    },
    "candidates": [
        {"owner": "08-316 Corridor (rm-400176-e6668d178587)",
         "for": ["Its drawn outline is the nearest on the Building 08 side (probe 2.962 ft, face 3.212 ft, centre 4.852 ft) and lies in the same native cell 826.",
                 "No native wall, door or other element separates the strip from 08-316's drawn area; the strip's north/south walls (1505979, 1505949) continue into 08-316.",
                 "Its outline shape on Floor 3 matches Floor 2's 08-216 Vestibule footprint, which on Floor 2 extends to the host face and owns door 2311764."],
         "against": ["Its drawn west edge stops 3.212 ft short of the aperture face (x 35.4648), so the DWG drew a boundary there; the reason (a line on the drawing, a finish face, or the curtain envelope 2066749 edge at x 35.4674) is not established.",
                     "The 2.962 ft probe gap exceeds the 2 ft native-owner default; legacy reach is 2 ft."]},
        {"owner": "unnamed vestibule / airlock between 08-360 and 08-316",
         "for": ["Floor 2 names the identical footprint a Vestibule (08-216).",
                 "The 3.2 ft strip has the depth of a door landing between a curtain door and a corridor."],
         "against": ["No Floor 3 room outline, label or native element defines a separate space; no door or partition at x 35.46 encloses it.",
                     "No room record with that name exists on level 400176 or 1487353."]},
        {"owner": "08-305 Corridor (rm-400176-2188e217a698)",
         "for": ["Listed among cell 826's 17 room names (the cell is wall-bounded but merges the whole Building 08 east wing on Floor 3)."],
         "against": ["Its outline (x 65.06..73.46, y 532.60..627.00) is 33.67 ft from the probe and covers no strip sample; cell-826 membership alone does not make it adjacent."]},
        {"owner": "08-360 Link extended through the door",
         "for": ["The door is hosted in the link's curtain wall."],
         "against": ["The link is on the other side of the glazing (native cell 816); the strip is east of the host face in cell 826."]},
    ],
    "siteOrDrawingCheckMustConfirm": [
        "On the Floor 3 architectural drawing (08 Tea Lab LVL 3) or on site: is there any partition, glazed screen or door at about x 35.46 (3.2 ft east of the curtain face) across the corridor between walls 1505949 and 1505979?",
        "Whether the space directly east of the curtain door is part of 08-316 Corridor, a separately numbered vestibule (as 08-216 on Floor 2), or another room.",
        "Whether door 2315416 is normally open and public, and whether the modelled 50 mm sill (2315423) exists.",
    ],
}

# ------------------------------------------------------------------ case 3
R3 = recs("case3-03-1052")
L694 = level(694)
c601 = next(c for c in L694["cells"] if c["id"] == "native-cell:14.435696:601")
rings = [[tuple(p[:2]) for p in r] for r in c601["ringsFeet"]]


def pv(r):
    g = make_valid(Polygon(r))
    return unary_union([x for x in getattr(g, "geoms", [g]) if x.geom_type in ("Polygon", "MultiPolygon")])


def ring_area(r):
    try:
        return abs(Polygon(r).area)
    except Exception:
        return 0


zero_area_holes = [i for i, r in enumerate(rings) if i and not (len(r) >= 4 and ring_area(r) > 1e-9)]
U = pv(rings[0]).difference(unary_union([pv(r) for i, r in enumerate(rings) if i and i not in zero_area_holes]))
vest_pt = Point(10.2, -148.0)
opening = {}
for eps in (1e-6, 1e-3, 0.005, 0.01, 0.05):
    O = U.buffer(-eps, join_style="mitre").buffer(eps, join_style="mitre")
    parts = [g for g in getattr(O, "geoms", [O]) if not g.is_empty]
    pk = [g for g in parts if g.covers(vest_pt)]
    opening[str(eps)] = {"components": len(parts), "pocketSeparate": bool(pk) and pk[0].area < 1000,
                         "componentContainingVestibule": {"areaSqFt": round(pk[0].area, 3), "bounds": [round(v, 6) for v in pk[0].bounds]} if pk else None}
O = U.buffer(-0.01, join_style="mitre").buffer(0.01, join_style="mitre")
parts = list(getattr(O, "geoms", [O]))
pocket = next(g for g in parts if g.covers(vest_pt))
slivers = [g for g in getattr(U.difference(O), "geoms", []) if g.area > 0 and g.distance(pocket) < 1e-6]
joins = []
for g in slivers:
    b = g.bounds
    joins.append({"kind": "sliver under a curtain mullion", "boundsFeet": {"x": [b[0], b[2]], "y": [b[1], b[3]]}, "widthFeet": round(min(b[2] - b[0], b[3] - b[1]), 6),
                  "lengthFeet": round(max(b[2] - b[0], b[3] - b[1]), 6),
                  "connectsTo": [[round(v, 3) for v in p.bounds] for p in parts if p is not pocket and g.distance(p) < 1e-6]})
joins.append({"kind": "zero-width slit between two east-wall holes", "ringA": 2, "ringB": 6,
              "ringA_bottomY": -149.97647404973594, "ringB_topY": -149.97647404973597, "xFeet": [14.342757095894072, 14.83488308014604],
              "widthFeet": -149.97647404973594 - -149.97647404973597,
              "note": "Holes 2 and 6 (the east curtain wall 1425500 cut into the cell) meet at the joint between mullion 1425543 (y -150.1405..-149.9765) and panel 1425509 (y -149.9765..-146.2035) without sharing a vertex value: a 2.8e-14 ft slit across the wall."})
for t in ({"rings": [0, 2], "point": [14.588820088020075, -137.38526670085486]}, {"rings": [0, 1], "point": [14.572415888545018, -160.9105934133596]}):
    joins.append({"kind": "zero-width corner contact (outer ring touches a hole at one point)", **t})
pocket_poly = [[round(x, 9), round(y, 9)] for x, y in pocket.exterior.coords]


def sub_region(p):
    pt = Point(p)
    if pocket.covers(pt):
        return "03-1052 pocket"
    for g in parts:
        if g.covers(pt):
            return f"other component bounds {[round(v, 3) for v in g.bounds]}"
    return None


door3 = {}
for d in (1425507, 1425511, 1425135, 481695):
    row = door_rows[d]
    fp = row["footprintFeet"]
    xs = [q[0] for q in fp]
    ys = [q[1] for q in fp]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    half = (max(xs) - min(xs)) / 2
    faces = {}
    for sgn, name in ((-1, "westFace"), (1, "eastFace")):
        fx = cx + sgn * half
        probe_pt = None
        for step in (0.25, 0.5, 1.0, 1.5):
            p = (cx + sgn * (half + step), cy)
            if cell_at(694, p):
                probe_pt = (p, step)
                break
        pts = {"probe": probe_pt[0] if probe_pt else (fx + sgn * 0.25, cy), "face": (fx, cy), "centre": (cx, cy)}
        faces[name] = {"faceX": fx, "probeFeet": pts["probe"], "probeStepFeet": probe_pt[1] if probe_pt else None,
                       "cell": cell_at(694, pts["probe"]), "subRegion(eps 0.01 opening)": sub_region(pts["probe"]) if probe_pt else None,
                       "nearestOutlines": outline_rows({694}, pts, limit=3)}
    r = R3[d]
    door3[d] = {"record": brief(r), "hostWall": brief(R3[r["host"]["hostId"]]), "savedPreparedRecord": row, "nativeSides": sides.get(d),
                "centreFeet": [cx, cy], "normal": "x", "halfDepthFeet": half, "faces": faces}
frames3 = {}
for d, ids in ((1425507, {"jambs": [1425541, 1425542], "sill": 1425528, "head": 1532179}),
               (1425511, {"jambs": [1425543, 1425544], "sill": 1425530, "head": 1532181})):
    frames3[d] = {"roles": ids, "members": [brief(R3[i]) for i in ids["jambs"] + [ids["sill"], ids["head"]]]}
out_1052 = ann["rm-694-484f9eec97d0"]["polygonFeet"]
pb = pocket.bounds
case3 = {
    "format": "native-source-evidence-v1",
    "case": "03-1052 Vestibule (rm-694-484f9eec97d0), Floor 2 (native level 694): pocket of native cell 601; doors 1425507, 1425511, 1425135, 481695 unmatched",
    "status": "EVIDENCE_ONLY_NOT_APPLIED",
    "inputs": with_levels([694]),
    "method": method_common + [
        "Cell 601 interior = outer ring minus its holes (two zero-area holes, rings 3 and 5, dropped) built with shapely make_valid; connectivity tested by morphological opening (erode then dilate by eps, mitre joins) at eps 1e-6 .. 0.05 ft. A component that separates at eps is joined only through channels narrower than 2·eps.",
        "Door faces from the saved footprint (doors-native.json); probes 0.25/0.5/1/1.5 ft beyond each face along x, as native-door-sides.json.",
    ],
    "cell601": {"id": c601["id"], "exactFaceId": c601["exactFaceId"], "rooms": [f"{ann[k]['number']} {ann[k]['name']}" for k in c601["roomKeys"]],
                "nativeFloorIds": c601["nativeFloorIds"], "ringPointCounts": [len(r) for r in c601["ringsFeet"]],
                "zeroAreaHoleRings": zero_area_holes,
                "segmentsNearVestibule": cell_segments(694, c601["id"], (3, 17, -162, -134))["segmentsInWindow"],
                "openingTest": opening},
    "pocket": {"boundsFeet": {"x": [pb[0], pb[2]], "y": [pb[1], pb[3]]}, "areaSqFt": round(pocket.area, 4), "exteriorFeet": pocket_poly,
               "faces": {"west": "x 6.206274156261 (inner face of west curtain mullions, hosts 481694/1425129)",
                         "east": "x 14.342757095894 (inner face of east curtain mullions, host 1425500)",
                         "south": "y -158.520437304529 (north face of basic wall 710235)",
                         "north": "y -137.385266700855 (south face of basic wall 481981)"}},
    "joins": joins,
    "joinFinding": "The pocket separates from the rest of cell 601 at eps 0.01 ft but not at 0.005 ft: its only finite-width connections are two 0.013123 ft (4 mm) slivers at y -158.5204..-158.5073, between the bottom curtain mullions (1425150 west, 1425532 east) and the north face of wall 710235. Across the east wall the two holes also meet with a 2.8e-14 ft slit at y -149.976474, and the outer ring touches holes at single points (14.58882, -137.385267) and (14.572416, -160.910593). None of these is a doorway; the curtain doors are the real connections.",
    "outline03-1052": {"polygonFeet": out_1052, "polygonSource": ann["rm-694-484f9eec97d0"]["source"]["polygon"],
                       "gapsToPocketFeet": {"west": 7.415293777558929 - pb[0], "east": pb[2] - 13.015293777558924,
                                            "south": -158.18335863865832 - pb[1], "north": pb[3] - -137.38335863865834}},
    "neighbourOutline03-1104": {"key": "rm-694-70a5a7eafba5", "westEdgeX": 16.2153, "gapFromEastMullionFaceFeet": round(16.2153 - 14.83488308014604, 4),
                                "note": "03-1104's west edge (x 16.2153) is 0.0139 ft inside the east curtain host envelope face x 16.2292."},
    "doors": door3,
    "hostWalls": {h: brief(R3[h]) | {"planParts": [w["polygonFeet"] for w in plan_items("case3-03-1052", 694, (3, 17, -160, -136))["walls"] if w["elementId"] == h]} for h in (1425500, 1425129, 481694)},
    "planWallsAndDoors(level 694)": plan_items("case3-03-1052", 694, (3, 17, -162, -134)),
    "frameMembersFor1425507and1425511": frames3,
    "dryRunValidatorReplay(curtain aperture option)": dump["case3ValidatorReplay"],
    "legacyEnvelopeCheck": "Each door leaf is 0.2083 ft deep, so the legacy matcher's normal-direction reach is 0.104 + 0.6 = 0.704 ft. 03-1052 is 1.574 ft and 03-1104 1.627 ft from the centres of 1425507/1425511, so neither side passes today (both pass the 2 ft outline limit). A host-band aperture (x 12.9484..16.2292, half-depth 1.640) would give 2.240 ft, as for case 1.",
    "remainsForDecision": [
        "Whether 03-1052 should own the whole pocket (x 6.2063..14.3428) and 03-1104 (not 03-1101 Entrance, whose outline is elsewhere in cell 601) the east side of 1425507/1425511: confirm on the drawing (03 CJMH LVL 1) or site.",
        "Whether 481695/1425135 are exterior doors (481695's west probe hits no cell; 1425135's west probe lands in a 0.88 ft slab strip x 4.8365..5.7141 outside the west glazing, inside the curtain envelope).",
        "Whether the modelled 50 mm sills (1425528, 1425530) are real.",
        "Public/normal-open status of all four doors.",
    ],
}

os.makedirs(out_dir, exist_ok=True)
for name, obj in (("case1-2471813-frame-evidence.json", case1), ("case2-2315416-strip-owner-evidence.json", case2),
                  ("case3-03-1052-outline-evidence.json", case3)):
    with open(os.path.join(out_dir, name), "w") as f:
        json.dump(obj, f, indent=1)
        f.write("\n")
    print(name, os.path.getsize(os.path.join(out_dir, name)))
