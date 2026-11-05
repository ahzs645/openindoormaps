"""Owner's Floor 2 examples: walk neighbours and own doors before/after.
usage: owner-examples.py BEFORE-DIR AFTER-DIR OUT.json ROOM..."""
import json, sys
from collections import defaultdict
bdir, adir, out, *rooms = sys.argv[1:]
res = {}
for tag, d in (("before", bdir), ("after", adir)):
    g = json.load(open(f"{d}/graph-full.json"))
    nodes = {n["id"]: n for n in g["nodes"]}
    recs = {r["key"]: r for r in g["records"]}
    num = lambda k: (recs.get(k) or {}).get("number") or (recs.get(k) or {}).get("name") or k
    en = [e for e in g["edges"] if e["enabled"]]
    wadj = defaultdict(set); portal = defaultdict(list)
    for e in en:
        if e["kind"] == "walk":
            wadj[e["from"]].add(e["to"]); wadj[e["to"]].add(e["from"])
        else:
            portal[e["from"]].append(e); portal[e["to"]].append(e)
    for k, r in recs.items():
        if r.get("levelId") != 694 or num(k) not in rooms: continue
        start = r.get("arrivalNodeId") or f"arrival:{k}"
        seen, st = {start}, [start]
        while st:
            x = st.pop()
            for y in wadj[x]:
                if y not in seen: seen.add(y); st.append(y)
        nbrs = sorted(num(nodes[n]["roomKey"]) for n in seen if nodes[n]["kind"] == "arrival" and nodes[n].get("roomKey") != k)
        doors = sorted({(e["id"], "/".join(num(x) for x in e.get("roomKeys", []))) for n in seen for e in portal[n]})
        walks = sorted({e["id"] for e in en if e["kind"] == "walk" and (e["from"] == start or e["to"] == start)})
        res.setdefault(num(k), {})[tag] = {"walkNeighbourRooms": nbrs, "portals": [list(x) for x in doors], "arrivalWalks": walks}
json.dump(res, open(out, "w"), indent=1)
for r in rooms:
    v = res.get(r, {})
    for t in ("before", "after"):
        x = v.get(t, {})
        print(r, t, "neighbours", x.get("walkNeighbourRooms"), "portals", [p[1] for p in x.get("portals", [])])
