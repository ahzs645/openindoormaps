"""Drop patches that would leave a room with no door, opening or vertical portal.
usage: drop-isolating.py CELLS-DIR GRAPH-FULL.json CANDIDATES.json KEEP-OUT.txt DROPPED-OUT.json [exclude-ids.txt]
Iterates cell-preview.py: for the first isolated room it removes the single
patch that restores a portal, else every patch on that piece, and repeats."""
import json, subprocess, sys, os
cells, graph, cand, keep_out, drop_out = sys.argv[1:6]
exclude = set(open(sys.argv[6]).read().split()) if len(sys.argv) > 6 else set()
here = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(cand))["candidates"]
keep = [c["patch"]["id"] for c in C if c["patch"]["id"] not in exclude]
dropped = []
def run(ids):
    open(keep_out, "w").write("\n".join(ids))
    tmp = keep_out + ".preview.json"
    subprocess.run([sys.executable, "-I", f"{here}/cell-preview.py", cells, graph, cand, tmp, keep_out], check=True, capture_output=True)
    return json.load(open(tmp))
r = run(keep)
while r["isolated"]:
    iso = r["isolated"][0]
    fixed = None
    for pid in iso["patches"]:
        t = run([k for k in keep if k != pid])
        if not any(set(x["roomKeys"]) & set(iso["roomKeys"]) for x in t["isolated"]):
            fixed = [pid]; break
    fixed = fixed or iso["patches"]
    for pid in fixed:
        dropped.append({"patchId": pid, "wouldIsolate": iso["rooms"], "roomKeys": iso["roomKeys"], "cellId": iso["cellId"],
                        "reason": "the room has no door, opening or vertical portal of its own; this gap is its only connection"})
    keep = [k for k in keep if k not in fixed]
    r = run(keep)
json.dump({"dropped": dropped, "final": r}, open(drop_out, "w"), indent=1)
print("kept", len(keep), "dropped", len(dropped))
for d in dropped: print(" ", d["patchId"], d["wouldIsolate"])
