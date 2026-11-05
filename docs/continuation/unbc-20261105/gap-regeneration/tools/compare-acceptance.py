"""Compare two shared-corridor acceptance reports case by case.

usage: compare-acceptance.py BEFORE-REPORT.json AFTER-REPORT.json BEFORE-GRAPH AFTER-GRAPH GAP-PATCHES.json OUT.json

Walk edge ids carry their native cell number, which the regeneration
renumbered, so route edges are compared by a cell-free key
(`walk:<from>|<to>`); every other edge id is compared as is.
For each case: availability, expected, distance, required source edges and
native door verification, the edge-key sequence, and the walks that the
before route used which crossed a patched gap.
"""
import json, re, sys

bp, ap, bg, ag, gp, out = sys.argv[1:7]
B, A = json.load(open(bp)), json.load(open(ap))
GP = json.load(open(gp))
patched_walks = {}
for p in GP["patches"]:
    for e in p["walkEdgeIds"]:
        patched_walks.setdefault(e, []).append(p["id"])
for g in GP["gaps"]:
    if g.get("patchId"):
        for e in g["walkEdgeIds"]:
            patched_walks.setdefault(e, []).append(g["patchId"])


def key(eid):
    m = re.match(r"native-cell:[^:]+:\d+:(walk:.*)$", eid)
    return m.group(1) if m else eid


def recs(path):
    g = json.load(open(path))
    return {r["key"]: (r.get("number") or r.get("name")) for r in g["records"]}


names = recs(ag)
bc = {c["id"]: c for c in B["normalCases"]}
ac = {c["id"]: c for c in A["normalCases"]}
bw = {c["id"]: c.get("status") for c in B["productionWorkerCases"]}
aw = {c["id"]: c.get("status") for c in A["productionWorkerCases"]}
rows = []
for cid in list(bc) + [c for c in ac if c not in bc]:
    b, a = bc.get(cid), ac.get(cid)
    row = {"id": cid, "from": names.get((a or b)["from"]), "to": names.get((a or b)["to"]),
           "mode": (a or b).get("mode"), "options": (a or b).get("options"), "expected": (a or b).get("expected")}
    for tag, c, w in (("before", b, bw), ("after", a, aw)):
        if c is None:
            row[tag] = None; continue
        row[tag] = {"available": c.get("available"), "distanceMetres": c.get("distanceMetres"),
                    "sharedPaths": c.get("sharedPaths"),
                    "requiredSourceEdgesVerified": c.get("requiredSourceEdgesVerified"),
                    "requiredNativeDoorVerified": c.get("requiredNativeDoorVerified"),
                    "workerStatus": w.get(cid), "edges": len(c.get("edgeIds") or [])}
    if b and a:
        bk, ak = [key(e) for e in b.get("edgeIds") or []], [key(e) for e in a.get("edgeIds") or []]
        row["sameAvailability"] = b.get("available") == a.get("available")
        db, da = b.get("distanceMetres"), a.get("distanceMetres")
        row["distanceDeltaMetres"] = None if db is None or da is None else da - db
        row["sameEdgeKeys"] = bk == ak
        row["edgeKeysOnlyBefore"] = [k for k in bk if k not in ak]
        row["edgeKeysOnlyAfter"] = [k for k in ak if k not in bk]
        row["beforeWalksThroughPatchedGaps"] = {e: sorted(set(patched_walks[e])) for e in b.get("edgeIds") or [] if e in patched_walks}
        row["unchanged"] = row["sameAvailability"] and row["sameEdgeKeys"] and (row["distanceDeltaMetres"] in (None,) or abs(row["distanceDeltaMetres"]) < 1e-9)
    rows.append(row)
json.dump({
    "format": "unbc-acceptance-diff-v1",
    "before": {"path": bp, "status": B["status"], "sourceMasterSha256": B["sourceMasterSha256"], "guideSha256": B["guideSha256"],
               "available": sum(1 for c in B["normalCases"] if c.get("available")), "cases": len(B["normalCases"]), "failures": B["failures"]},
    "after": {"path": ap, "status": A["status"], "sourceMasterSha256": A["sourceMasterSha256"], "guideSha256": A["guideSha256"],
              "available": sum(1 for c in A["normalCases"] if c.get("available")), "cases": len(A["normalCases"]), "failures": A["failures"]},
    "unchangedCases": sum(1 for r in rows if r.get("unchanged")),
    "changedCases": [r["id"] for r in rows if not r.get("unchanged")],
    "cases": rows,
}, open(out, "w"), indent=1)
for r in rows:
    b, a = r.get("before") or {}, r.get("after") or {}
    print(f'{r["id"][:62]:62} {str(b.get("available")):5} {str(a.get("available")):5} '
          f'{(b.get("distanceMetres") or 0):9.3f} {(a.get("distanceMetres") or 0):9.3f} '
          f'{"same" if r.get("sameEdgeKeys") else "DIFF"} gaps={len(r.get("beforeWalksThroughPatchedGaps") or {})}')
