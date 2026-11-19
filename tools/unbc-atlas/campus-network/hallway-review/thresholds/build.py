"""Trim only the exclusive room-side tips of verified public doorway branches."""
import argparse
import csv
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "py"))
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree


def xy(point):
    return tuple(round(v, 2) for v in point[:2])


def edge(a, b):
    return tuple(sorted((xy(a), xy(b))))


def segments(points):
    return [pair for a, b in zip(points, points[1:]) if (pair := edge(a, b))[0] != pair[1]]


def load(path):
    return json.loads(path.read_bytes())


def signed_crossing(points, door):
    origin, normal = door["pointFeet"], door["normalFeet"]
    distances = [sum((p[k]-origin[k])*normal[k] for k in (0,1)) for p in points]
    if distances[0]*distances[-1]>=0:
        return None
    crossings=[]
    for i,(a,b) in enumerate(zip(distances,distances[1:])):
        if a==b or a*b>0:
            continue
        t = a/(a-b)
        location=tuple(points[i][j]+t*(points[i+1][j]-points[i][j]) for j in (0,1))
        if not crossings or math.dist(location,crossings[-1][1])>1e-8:
            crossings.append((i,location))
    if len(crossings)!=1:
        return None
    i, location = crossings[0]
    ring=door.get("footprintFeet")
    if not ring or not Polygon(ring).covers(Point(location)):
        return None
    return i,location


def analyze(audit):
    receipt=load(audit/"installed-receipt.json")
    with (audit/"browser-route-data.json").open("rb") as f:
        assert hashlib.file_digest(f,"sha256").hexdigest()==receipt["datasetSha256"]
    dataset=load(audit/"browser-route-data.json")
    doors={d["id"]:d for d in dataset["doors"]}
    records={r["key"]:(r["circulation"],r["stair"],r["building"]) for r in dataset["records"]}
    del dataset
    verified=load(audit/"public-room-branches.json")
    proof=load(audit/"visitor-display-proof.json")
    assert all(receipt[k]==verified[k]==proof[k] for k in ("datasetSha256","runtimeSha256"))
    text=(audit/"campus-connectivity.html").read_text()
    m=json.JSONDecoder().raw_decode(text.split("const data=",1)[1])[0]
    rooms={r["k"]:r for r in m["rooms"]}
    with (audit/"trip-destinations.csv").open() as f:
        destinations={r["record"] for r in csv.DictReader(f)}
    stops={r["key"]:r for r in load(audit/"stops.json")}
    branches=verified["branches"]
    displayed={int(l):{(g,edge(a,b)) for g,a,b in rows} for l,rows in m["visitorSegments"].items()}
    marks={int(l):{(g,xy(p)) for g,p in rows} for l,rows in m["entryMarks"].items()}
    # Include audited geometry, other rooms' approaches, and protected stops at both ends of a journey.
    owners=defaultdict(lambda:defaultdict(set))
    for row in branches:
        for pair in segments(row["branch"]["pathToHallway"]):
            owners[row["level"]][pair].add(row["room"])
    guarded=defaultdict(set)
    def protect(level,point):
        guarded[level].add(xy(point))
    for stop in stops.values():
        for position in ("depart","arrive"):
            if s:=stop[position]:
                protect(s["levelId"],s["pointFeet"])
    for arc in load(audit/"arcs.json"):
        levels=arc["levels"];points=arc["p"]
        if not points:
            continue
        if len(set(levels))==1:
            for pair in segments(points):
                owners[levels[0]][pair].add("audited arc")
        else:
            protect(levels[0],points[0]); protect(levels[-1],points[-1])
    for level,rows in displayed.items():
        for _,pair in rows:
            if pair not in owners[level]:
                owners[level][pair].add("shared network")
    indices={}
    for level,claims in owners.items():
        entries=[(LineString(pair),claim) for pair,claim in claims.items()]
        entries.extend((Point(p),{"protected station"}) for p in guarded[level])
        indices[level]=(STRtree([g for g,_ in entries]),entries)

    by_level=defaultdict(lambda:dict(remove=[],add=[],branches=[]))
    stats=Counter(); categories=defaultdict(list)
    for row in branches:
        key,l,branch=row["room"],row["level"],row["branch"]
        rid=branch["entranceId"]; pts=branch["pathToHallway"]
        def keep(reason):
            stats[reason]+=1
            categories[reason].append(row["number"])
        if key not in destinations or any(records[key][:2]) or "areaLabel" in rooms[key]:
            keep("circulation, transfer or other non-room");continue
        d=doors[rid]
        if d.get("levelId")!=l:
            keep("branch and native door use different map levels");continue
        if (proof["verifiedDoorBranches"].get(key)!=rid or key not in d["roomKeys"] or
            not d.get("normalFeet") or d["normalFeet"]!=verified["doors"][rid].get("normalFeet") or d["pointFeet"]!=verified["doors"][rid]["pointFeet"]):
            keep("native crossing unverified");continue
        assert pts[0]==branch["roomSidePoint"]
        matched=next((s for s in ("depart","arrive") if stops[key][s] and stops[key][s]["stopId"]==branch["stopId"]),None)
        assert matched and math.dist(pts[-1],stops[key][matched]["pointFeet"])<1e-5
        g=rooms[key]["d" if matched=="depart" else "a"]
        assert g is not None
        cross=signed_crossing(pts,d)
        if cross is None:
            keep("no single crossing inside native opening");continue
        i,p=cross
        assert (g,xy(p)) in marks[l]
        source=segments(pts)
        assert all((g,e) in displayed[l] for e in source)
        remove=segments(pts[:i+2])
        add=segments([p,pts[i+1]])
        if not remove or remove==add:
            keep("already ends at threshold");continue
        if any(owners[l][e]!={key} for e in remove):
            keep("shared segment");continue
        # Check partial/collinear overlaps and unsplit crossings as well as identical edge keys.
        # Contact at the retained doorway is allowed. Every other contact with the removed tip
        # must belong exclusively to this branch. Compare at the drawing's 0.01 ft precision.
        tips=segments([*pts[:i+1],p])
        tree,entries=indices[l]
        shared=False
        contact=Point(xy(p)).buffer(.008)
        for pair in tips:
            line=LineString(pair)
            for idx in tree.query(line):
                shape,claims=entries[int(idx)]
                if claims=={key}:
                    continue
                intersection=line.intersection(shape)
                if not intersection.is_empty and not contact.covers(intersection):
                    shared=True;break
            if shared:break
        if shared:
            keep("shared crossing or protected station");continue
        def grouped(es):
            return [[g,list(a),list(b)] for a,b in es]
        change={"room":key,"number":row["number"],"door":rid,"threshold":xy(p),"hallwayStop":xy(pts[-1]),
                "source":grouped(source),"remove":grouped(remove),"add":grouped(add)}
        level=by_level[l]
        level["branches"].append(change);level["remove"].extend(change["remove"]);level["add"].extend(change["add"])
        stats["clipped room"]+=1
    longest=0.0;total=0.0
    for level,changes in by_level.items():
        removed=set()
        for branch in changes["branches"]:
            for group,a,b in branch["remove"]:
                ident=(group,edge(a,b));assert ident not in removed
                removed.add(ident)
            through=displayed[level]-{(g,edge(a,b)) for g,a,b in branch["remove"]}
            through|={(g,edge(a,b)) for g,a,b in branch["add"]}
            kept=[e for e in branch["source"] if e not in branch["remove"]]+branch["add"]
            # One continuous polyline, still terminating at the same hallway station.
            adjacency=defaultdict(set)
            for group,a,b in kept:
                assert (group,edge(a,b)) in through
                a,b=xy(a),xy(b);adjacency[a].add(b);adjacency[b].add(a)
            before=sum(math.dist(a,b) for _,a,b in branch["remove"])
            after=sum(math.dist(a,b) for _,a,b in branch["add"])
            assert before>=after
            longest=max(longest,before-after);total+=before-after
            start=xy(branch["threshold"]);end=xy(branch["hallwayStop"])
            seen={start};pending=[start]
            while pending:
                for nxt in adjacency[pending.pop()]-seen: seen.add(nxt);pending.append(nxt)
            assert end in seen
    assert sum(stats.values())==len(branches)
    return ({"datasetSha256":receipt["datasetSha256"],"runtimeSha256":receipt["runtimeSha256"],"levels":by_level},
            {"datasetSha256":receipt["datasetSha256"],"runtimeSha256":receipt["runtimeSha256"],"verifiedBranches":len(branches),
             "classification":dict(stats),"retainedByReason":categories,"byLevel":{str(l):len(ch["branches"]) for l,ch in by_level.items()},
             "tipFeetRemovedAcrossAllBranches":round(total,3),"longestTrimFeet":round(longest,3),
             "segmentsRemoved":sum(len(ch["remove"]) for ch in by_level.values()),"segmentsAdded":sum(len(ch["add"]) for ch in by_level.values())})


if __name__=="__main__":
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--audit",type=Path,default=(ROOT/"rotunda-review/trips/shipped/current-worker.log").resolve().parent)
    cli.add_argument("--output",type=Path,default=HERE)
    args=cli.parse_args()
    patch,proof=analyze(args.audit)
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/"patch.json").write_text(json.dumps(patch,separators=(",",":")))
    (args.output/"proof.json").write_text(json.dumps(proof,indent=2))
    print(proof["classification"],proof["segmentsRemoved"],proof["segmentsAdded"])
