"""Make the independent verifier authoritative for the schematic layer.

regularize.py and verify.py implement the hard wall/hole rule separately on
purpose. Where they disagree on an edge case, this step applies verify.py's own
geometry (its Floor.contacts): a schematic line that touches a wall or
uncovered hole is restored to its accepted original, a line whose ORIGINAL
already touches one is never redrawn, and such originals are added to the
source-crossing list if the regularizer's listing missed them. Accepted net
geometry is never modified.

usage: enforce-verifier.py OUT_DIR
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util

spec = importlib.util.spec_from_file_location("verify", os.path.join(HERE, "verify.py"))
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)

root = sys.argv[1]
report = {}
for fid in verify.FLOORS:
    path = os.path.join(root, "floors", fid + ".json")
    fl = json.load(open(path))
    F = verify.Floor(fl)
    listed = {x[0] for x in fl.get("sourceWallCrossings") or []}
    restored, added = [], []
    for i, ((l, cat, ei), s) in enumerate(zip(fl["net"], fl["schematic"])):
        P = verify.pts(l)
        oc = F.contacts(P)
        if oc:
            if s:
                fl["schematic"][i] = 0
                restored.append(i)
            if i not in listed:
                contacts = [[k, nid, round(ln, 3), list(P[seg]), []] for k, nid, ln, seg in oc]
                fl["sourceWallCrossings"].append([i, fl["netEdgeIds"][i] if "netEdgeIds" in fl else None, cat, contacts])
                added.append(i)
            continue
        if s and F.contacts(verify.pts(s)):
            fl["schematic"][i] = 0
            restored.append(i)
    fl["sourceWallCrossings"].sort(key=lambda x: x[0])
    json.dump(fl, open(path, "w"), separators=(",", ":"))
    report[fid] = {"schematicLinesRestored": restored, "sourceCrossingsAdded": added}
    print(fid, {k: len(v) for k, v in report[fid].items()})
json.dump(report, open(os.path.join(root, "enforce-verifier.json"), "w"), indent=1)
