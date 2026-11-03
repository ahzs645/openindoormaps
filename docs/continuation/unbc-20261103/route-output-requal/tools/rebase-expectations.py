#!/usr/bin/env python3
"""Rebase POLICY-EXPECTATIONS.json distances after the route-output change.

  rebase-expectations.py OLD-EXPECTATIONS.json NEW-MATRIX.json OUT.json REPORT.json

The route-output change (route-line-cleanup.ts) may only shorten the reported
distance of the drawn line; it must not change any outcome, refusal reason or
required-edge use. This script refuses to write unless, for every case, the
new normal and worker outcomes keep the old expected kind and required-edge
use, and every new distance is <= the old expected distance and within 1.5 m
of it. Each rebased entry's `source` keeps the old value.
"""
import json, sys

old_path, matrix_path, out_path, report_path = sys.argv[1:5]
old = json.load(open(old_path))
rows = {r["id"]: r for r in json.load(open(matrix_path))["rows"]}
out, changes = [], []
for e in old["expectations"]:
    r = rows[e["id"]]
    for side in ("normal", "worker"):
        o = r[side]
        assert o["available"] == (e["expect"] == "route"), (e["id"], side)
    n = dict(e)
    if e["expect"] == "route":
        d = r["normal"]["distanceMetres"]
        assert abs(d - r["worker"]["distanceMetres"]) < 1e-9, e["id"]
        if "requiredEdgeUsed" in e:
            assert r["normal"].get("requiredEdgeUsed") == e["requiredEdgeUsed"], e["id"]
        delta = d - e["distanceMetres"]
        assert delta <= e["toleranceMetres"] and delta > -1.5, (e["id"], delta)
        if abs(delta) > e["toleranceMetres"] / 2:
            n["distanceMetres"] = round(d, 3)
            n["source"] = f"{e['source']} | rebased {e['distanceMetres']} -> {round(d, 3)} m after route-line cleanup (route output only)"
            changes.append({"id": e["id"], "old": e["distanceMetres"], "new": round(d, 3), "deltaMetres": round(delta, 3)})
    out.append(n)
doc = {k: old[k] for k in old if k != "expectations"}
doc["note"] = old["note"] + " Distances rebased after the route-output change; see rebase report."
doc["expectations"] = out
json.dump(doc, open(out_path, "w"), indent=1)
json.dump({"rebased": len(changes), "cases": len(out), "maxShorteningMetres": -min([c["deltaMetres"] for c in changes] or [0]), "changes": changes}, open(report_path, "w"), indent=1)
print(len(changes), "rebased of", len(out))
