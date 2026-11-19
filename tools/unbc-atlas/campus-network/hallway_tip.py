"""Check the small virtual seam at 07-163 / 07-113A before hiding its three detour strokes."""
import json
from pathlib import Path

LEVEL = 311
SEAM = "opening:recovered-circulation-seam:rm-311-399064f64ec1:rm-311-8e1b19ddd9ef:2:59"
CELL = "native-cell:0.000000:71"
PEER_WALK = CELL + ":walk:" + SEAM + ":0|" + SEAM + ":1"
FRESH_EDGE = CELL + ":walk:arrival:rm-311-8e1b19ddd9ef|" + SEAM + ":1"
DATASET = "ecd8af21dd0d83740c5a3b5133298e52d88d71ce1c1db54c46e8642e853f66e3"
CACHES = {"91f49908a2dca840b4091d80520bb74da55d2e44b3538b1a8571671cd5eaf696",
          "28e4ee794aa36094d243dd1d1e0c92ca4b1957808655bf4a6fd6bbce10c980ef"}
def point(p):
    return tuple(round(v,2) for v in p[:2])
def segment(a,b):
    return tuple(sorted((a,b)))
def segments(path):
    return {segment(a,b) for a,b in zip(path,path[1:]) if a!=b}
def vertex(obj):
    return json.dumps(obj,separators=(",",":"))
anchor=(22.66,309.54); peer=(23.18,309.37); near_a=(22.85,307.25); near_b=(22.82,308.20)
local={anchor,peer,near_a,near_b}
tip={segment(anchor,near_a),segment(near_a,near_b),segment(near_b,peer)}
direct=segment(anchor,peer)
station_west=vertex([SEAM+":1",vertex([CELL,22.661683650948312,309.5424568550392,0])])
station_peer=vertex([SEAM+":0",vertex([CELL,23.181211444631526,309.37269545361494,0])])
expected={anchor:station_west,peer:station_peer,near_a:vertex([SEAM+":1"]),near_b:vertex([SEAM+":0"])}

def crosses(a,b,c,d):
    # Work in integer hundredths of a foot, the overview's coordinate grid.
    a,b,c,d=[tuple(round(v*100) for v in p) for p in (a,b,c,d)]
    if any(max(min(a[i],b[i]),min(c[i],d[i]))>min(max(a[i],b[i]),max(c[i],d[i])) for i in (0,1)):return False
    def orient(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    return orient(a,b,c)*orient(a,b,d)<=0 and orient(c,d,a)*orient(c,d,b)<=0
def contact(path):
    if len(path)==1:return any(crosses(path[0],path[0],p,q) for p,q in tip)
    return any(crosses(a,b,c,d) for a,b in zip(path,path[1:]) for c,d in tip)

def verified_tip_removals(geo,audit,arcs,stops,branches,receipt,transfers,replay=None):
    proof={"level":LEVEL,"seam":SEAM,"dataset":receipt.get("datasetSha256"),"carrier":receipt.get("compressedSha256")}
    def hold(reason):return set(),{**proof,"verified":False,"reason":reason}
    folder=Path(audit);read=lambda n:json.loads((folder/n).read_bytes())
    same_uses=bool(replay and replay.get("sameLocalUses") and all(replay.get(k)==receipt.get(k) for k in ("datasetSha256","runtimeSha256","compressedSha256")))
    if replay:proof["newReleaseEvidence"]=replay
    if replay and not same_uses:return hold("local public uses or source binding changed")
    if (not (folder/"installed-receipt.json").is_file() or proof["dataset"]!=DATASET or
            (proof["carrier"] not in CACHES and not same_uses) or receipt!=read("installed-receipt.json")):
        return hold("unrecognized source or runtime receipt")
    if not (folder/"arcs.json").is_file() or arcs!=read("arcs.json"):return hold("missing matching directed graph")
    if not transfers:return hold("missing transfer inventory")
    # Accept only actual, complete room-branch rows for this audited snapshot.
    if not (folder/"all-branches.json").is_file() or not branches or branches!=read("all-branches.json"):return hold("missing matching room-branch evidence")
    g=geo.get(LEVEL,geo.get(str(LEVEL)));lines={segment(point(p),point(q)):group for group,p,q in g["network"]}
    if direct not in lines:return hold("two-station overview link absent")
    visible=tip&lines.keys()
    if len({lines[q] for q in visible}|{lines[direct]})!=1:return hold("different public components at seam")
    for line in lines:
        if line in tip or line==direct:continue
        if near_a in line or near_b in line:return hold("another overview branch now uses an interior point")
        if not set(line)&{anchor,peer} and contact(line):return hold("another overview branch crosses the detour")
    station_coords=set();outer=set();outside_nodes=set();raw_peer_directions=set();seen_source_ids=set()
    for row in arcs:
        levels=row["levels"];xyz=row["p"];points=[point(p) for p in xyz]
        if LEVEL not in levels or not points:continue
        ps=segments(points)
        named=row["e"]==SEAM or (row["k"]=="walk" and row["e"].startswith(CELL+":walk:") and SEAM in row["e"])
        if not named and contact(points) and (row["k"]!="walk" or ps&tip):return hold("another modeled feature contacts the detour")
        if not (ps&tip or points[0] in local or points[-1] in local):continue
        if not named or levels!=[LEVEL,LEVEL]:return hold("non-seam or level change uses the selected geometry")
        vs=[row["f"],row["t"]];ends=[points[0],points[-1]]
        for v,q in zip(vs,ends):
            if q in local:
                if expected[q]!=v:return hold("raw graph vertex identity changed")
                station_coords.add(q)
        if ps&tip and (not all(q in local for q in ends) or not ps<=tip|{direct}):return hold("a through walk uses the recessed strokes")
        if all(q in local for q in ends) and ps=={direct} and row["e"]==PEER_WALK:raw_peer_directions.add(tuple(ends))
        if (ends[0] in local)!=(ends[1] in local):
            i=0 if ends[0] in local else 1
            outer.add(ends[i]);outside_nodes.add(vs[1-i])
        if ps&tip:seen_source_ids.add(row["e"])
    if station_coords!=local or raw_peer_directions!={(anchor,peer),(peer,anchor)} or outer!={anchor,peer}:return hold("two-way native peer walk or attachments changed")
    items=stops.values() if isinstance(stops,dict) else stops
    marks=[point(station["pointFeet"]) for r in items for station in (r["depart"],r["arrive"]) if station and station["levelId"]==LEVEL]
    marks.extend(point(s[1]) for s in g["stops"])
    if any(contact([p]) for p in marks):return hold("mapped room stop on the detour")
    if any(contact([point(p) for p in r["branch"]["pathToHallway"]]) for r in branches if r["level"]==LEVEL):return hold("published room approach at the detour")
    transfer_rows=transfers.values() if isinstance(transfers,dict) else transfers
    for row in transfer_rows:
        if LEVEL not in row["layers"]:continue
        for end in row["ends"]:
            if end["l"]==LEVEL and contact([point(end["xy"])]):return hold("vertical transfer station at the detour")
        pts=row.get("paths",{}).get(LEVEL,row.get("paths",{}).get(str(LEVEL),[]))
        if pts and contact([point(p) for p in pts]):return hold("vertical transfer crosses the detour")
        bb=row.get("footprint")
        if bb and not (bb[2]<22.66 or bb[0]>23.18 or bb[3]<307.25 or bb[1]>309.54):return hold("native stair footprint overlaps the detour")
    for _,rings in g["treads"]:
        for ring in rings:
            if ring and contact([point(p) for p in ring+[ring[0]]]):return hold("native stair tread at the detour")
    removable={(lines[q],*q) for q in visible}
    return removable,{**proof,"verified":True,"retainedPeerWalk":PEER_WALK,"retainedPeerSegment":[lines[direct],*direct],"externalAttachmentStations":sorted(outer),"rawVertexCount":len(station_coords),"outsidePeerCount":len(outside_nodes),"localizedSources":sorted(seen_source_ids),"removed":[list(v) for v in sorted(removable)]}
