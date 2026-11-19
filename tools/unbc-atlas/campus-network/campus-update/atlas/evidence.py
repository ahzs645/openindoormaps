"""Compare the full previous and candidate room-pair matrices and prepare single-floor worker walks."""
import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

def read(p):
    return json.loads(p.read_bytes())

def dump_csv(p, fields, rows):
    with p.open("w",newline="") as f:
        w=csv.writer(f);w.writerow(fields);w.writerows(rows)

def directory(audit):
    with (audit/"trip-destinations.csv").open() as f:
        return {r["record"]:r for r in csv.DictReader(f)}

def connections(audit, rooms):
    reach=read(audit/"review-graph.json")["reach"]
    arrivals=defaultdict(set)
    for k,r in rooms.items():
        if r["arrival_group"]:arrivals[int(r["arrival_group"])].add(k)
    by_group={g:set().union(*(arrivals[x] for x in nxt)) for g,nxt in reach.items()}
    dest={}
    for k,r in rooms.items():
        dest[k]=by_group.get(r["departure_group"],set())-{k}
        assert len(dest[k])==int(r["other_reachable_destinations"])
    return dest

def natural(s):
    return [(0,int(x)) if x.isdigit() else (1,x) for x in re.split(r"(\d+)",s)]

def compact_walk(t, native):
    if not t.get("metres") or t["mode"]!="public":return None
    xy=lambda p:[round(v,2) for v in p[:2]]
    def level(p):
        lv=min(native,key=lambda l:abs(native[l]-p[2]))
        return lv if abs(native[lv]-p[2])<.015 else None
    def box(points):
        return [func(p[i] for p in points) for func in (min,max) for i in (0,1)]
    parts=defaultdict(list);landings=defaultdict(set)
    for path in t["paths"]:
        current=[];last=None
        for a,b in zip(path["pointsFeet"],path["pointsFeet"][1:]):
            lv,to=level(a),level(b)
            if lv is None or lv!=to:
                if lv is not None:landings[lv].add(tuple(xy(a)))
                if to is not None:landings[to].add(tuple(xy(b)))
                current=[];last=None
                continue
            if xy(a)==xy(b):continue
            if last!=lv or not current or current[-1]!=xy(a):
                current=[xy(a)];parts[lv].append(current)
            current.append(xy(b));last=lv
    endpoints=[t[key]["pointFeet"] for key in ("departure","arrival")]
    start,end=map(level,endpoints)
    if start is None or end is None:return None
    ends=list(map(xy,endpoints))
    layers={}
    for lv in sorted({start,end}|parts.keys()|landings.keys(),key=native.get):
        stations=[[i,p] for i,p in enumerate(ends) if [start,end][i]==lv]
        transfers=sorted(landings[lv]); lines=parts[lv]
        bounds=box([p for line in lines for p in line]+[p for _,p in stations]+transfers)
        layers[lv]=dict(parts=lines,marks=stations,landings=transfers,box=bounds)
    return dict(origin=t["from"],destination=t["to"],level=start,metres=round(t["metres"],2),
                parts=layers[start]["parts"],ends=ends,box=layers[start]["box"],layers=layers)

def reviewed_views(audit,out):
    focus=audit.parent/"focused-checks.json"
    if not focus.exists():return []
    report=read(focus)
    assert report["passed"] and report["runtime"]==read(audit/"installed-receipt.json")["runtimeSha256"]
    joins={r["edge"]:r for r in read(audit.parent/"review-inputs/candidate-joins.json")}
    views=[]
    def bounds(points,margin):
        return [round(func(p[i] for p in points)+sign*margin,2) for func,sign in ((min,-1),(max,1)) for i in (0,1)]
    for i,r in enumerate(report["verifiedJoins"]):
        span=joins[r["edge"]];a,b=r["roomPair"]
        views.append(dict(id="join-"+str(i+1),name=a+" / "+b+" · hallway link",level=span["level"],building=span["building"],
                          box=bounds([span["fromPoint"],span["toPoint"]],15),note="The tested public walks between "+a+" and "+b+" work in both directions."))
    bends_file=out/"audited-bends.csv"
    with bends_file.open() as f:bends={int(r["index"]):r for r in csv.DictReader(f)}
    model=read(audit.parent.parent/"bends/source.json")
    plan=json.JSONDecoder().raw_decode((audit/"campus-connectivity.html").read_text().split("const data=",1)[1])[0]
    for r in model:
        result=bends[r["index"]]["result"]
        if result not in {"straightened on every owner","shortened between original vertices"}:continue
        pts=r["old"];x=sum(p[0] for p in pts)/len(pts);y=sum(p[1] for p in pts)/len(pts)
        labels=[q for q in plan["rooms"] if q["level"]==r["level"] and q["point"] and q["n"] and q["building"] in r["buildings"].split("|")]
        near=min(labels,key=lambda q:(x-q["point"][0])**2+(y-q["point"][1])**2)
        note=("All public paths using this stretch now follow the same straight segment." if result=="straightened on every owner"
              else "The middle of this hallway is straighter. Its two approaches still bend.")
        views.append(dict(id="bend-"+str(r["index"]),name=near["n"]+" · straighter hallway",level=r["level"],building=near["building"],
                          box=bounds(pts,12),note=note+" Use Previous hallway drawing to compare the bend."))
    if report["newRoomStops"]:
        stops={r["key"]:r for r in read(audit/"stops.json")}
        rooms=directory(audit)
        for key in report["newRoomStops"]:
            station=stops[key]["depart"];room=rooms[key]
            views.append(dict(id="entrance-"+room["number"],name=room["number"]+" · classroom entrance",level=station["levelId"],
                              building=room["building"],box=bounds([station["pointFeet"]],22),
                              note="This classroom now has a verified entrance branch and a public hallway stop for departures and arrivals."))
    return views

def make(audit,old,out,view_builder=reviewed_views,extra_walks=()):
    receipt=read(audit/"installed-receipt.json")
    prior=read(old/"installed-receipt.json")
    assert receipt["source"]==prior["source"]
    src=directory(audit); before=directory(old)
    cats={r["building"] for r in src.values()}|{r["building"] for r in before.values()}
    dest=connections(audit,src); prev=connections(old,before)
    changes=[];added=Counter();lost=Counter();total=Counter()
    for k in sorted(dest.keys()|prev.keys()):
        now,was=dest.get(k,set()),prev.get(k,set())
        if k in src:total[src[k]["building"]]+=len(now)
        for name,ds,index,counts in [("New",now-was,src,added),("Lost",was-now,before,lost)]:
            for j in sorted(ds):
                a,b=index[k],index[j];counts[a["building"]]+=1
                changes.append([name,a["building"],a["number"] or a["name"],k,b["building"],b["number"] or b["name"],j])
    dump_csv(out/"changed-room-directions.csv",["change","origin_building","origin","origin_record","destination_building","destination","destination_record"],changes)
    native=read(audit/"browser-route-data.json")["nativeLevels"]
    levels={str(r["id"]):r["name"] for r in native}
    elevations={r["id"]:r["elevationFeet"] for r in native}
    profile=defaultdict(list)
    for r in src.values():profile[r["building"],r["level"]].append(r)
    ranges=[]
    for (building,level),records in sorted(profile.items(),key=lambda item:(item[0][0],list(levels).index(item[0][1]))):
        nums=sorted({r["number"] for r in records if r["number"]},key=natural)
        ranges.append([building,level,levels[level],nums[0] if nums else "",nums[-1] if nums else "",len(nums),len(records),
                       sum(bool(r["departure_group"]) for r in records),sum(bool(r["arrival_group"]) for r in records)])
    dump_csv(out/"room-ranges.csv",["building","native_directory_level","directory_floor","first_room_number","last_room_number","distinct_numbers","directory_records","with_departure","with_arrival"],ranges)
    buildings=[dict(building=b,records=sum(len(v) for (c,_),v in profile.items() if c==b),reachable=total[b],added=added[b],lost=lost[b]) for b in sorted(cats)]
    dump_csv(out/"building-changes.csv",list(buildings[0]),[r.values() for r in buildings])
    # Resolve the worker's human-readable labels to the actual directional stations.
    stops={r["key"]:r for r in read(audit/"stops.json")}
    candidates=defaultdict(list)
    for k,r in src.items():candidates[r["number"] or r["name"]].append(k)
    def record(t,label,stopfield,tripfield):
        point=t[tripfield]["pointFeet"]
        return [k for k in ([label] if label in src else candidates[label]) if stops[k][stopfield] and stops[k][stopfield]["pointFeet"]==point]
    tripset=read(audit.parent/"trips/current-worker.json")
    assert tripset["runtimeSha256"]==receipt["runtimeSha256"] and tripset["cacheSha256"]==receipt["compressedSha256"] and tripset["datasetSha256"]==receipt["datasetSha256"]
    step_free={(t["from"],t["to"]):t.get("metres") for t in tripset["trips"] if t["mode"]=="accessible"}
    tested={}
    for t in tripset["trips"]:
        w=compact_walk(t,elevations)
        if not w:continue
        start,end=t["from"],t["to"]
        if (start,end) in tested:continue
        a=record(t,start,"depart","departure");b=record(t,end,"arrive","arrival")
        if len(a)!=1 or len(b)!=1 or b[0] not in dest[a[0]]:continue
        w.update(workerOrigin=start,workerDestination=end,origin=src[a[0]]["number"] or src[a[0]]["name"],destination=src[b[0]]["number"] or src[b[0]]["name"])
        w.update(originBuilding=src[a[0]]["building"],destinationBuilding=src[b[0]]["building"],gained=b[0] not in prev.get(a[0],set()))
        if (start,end) in step_free:
            distance=step_free[start,end]
            w["stepFreeMetres"]=round(distance,2) if distance is not None else None
        tested[start,end]=w
    selection={}
    def take(key):
        if key not in tested:return
        selection[key]=tested[key]
        rev=tuple(reversed(key))
        if rev in tested:selection[rev]=tested[rev]
    for b in sorted(cats):
        choices=[(key,w) for key,w in tested.items() if w["originBuilding"]==b==w["destinationBuilding"] and len(w["layers"])==1]
        choices.sort(key=lambda item:(not item[1]["gained"],abs(item[1]["metres"]-18),item[0]))
        if choices:take(choices[0][0])
    seen=set()
    for key,w in tested.items():
        if w["gained"] and (group:=(w["originBuilding"],w["destinationBuilding"],w["level"])) not in seen:
            take(key);seen.add(group);seen.add((group[1],group[0],group[2]))
    multilevel=next((key for key,w in tested.items() if len(w["layers"])>1 and w["originBuilding"]!=w["destinationBuilding"]),None)
    if multilevel:take(multilevel)
    for key in [("04-150","07-114"),("10-2008","10-2004"),("10-2052","10-2058"),("04-124","04-125"),("04-209","04-254"),("04-306","04-339"),("04-406","04-439"),("04-423","04-430")]:take(key)
    focus_pairs={("06-205","06-209"),("10-3066","10-3064"),("10-S104","10-1032"),("04-125","04-110"),("05-234","05-248"),("10-1020","10-1028"),("08-135","04-434"),("09-232","09-205"),("09-S201","09-205"),("10-3026","10-3060")}
    for key,w in tested.items():
        if (w["origin"],w["destination"]) in focus_pairs:take(key)
    for key in extra_walks:
        take(key)
    # The worker accepts record keys and directory labels; publish each identical trace once.
    unique={}
    for w in selection.values():
        unique.setdefault((w["origin"],w["destination"],repr(w["layers"])),w)
    evidence=dict(runtimeSha256=receipt["runtimeSha256"],previousRuntime=prior["runtimeSha256"],publicTrips=sum(total.values()),previousPublicTrips=sum(map(len,prev.values())),
                  gained=sum(added.values()),lost=sum(lost.values()),buildings=buildings,roomRanges=ranges,views=view_builder(audit,out),walks=list(unique.values()))
    assert evidence["publicTrips"]-evidence["previousPublicTrips"]==evidence["gained"]-evidence["lost"]
    (out/"evidence.json").write_text(json.dumps(evidence,separators=(",",":"))+"\n")
    return evidence

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit",type=Path);parser.add_argument("baseline",type=Path);parser.add_argument("out",type=Path)
    args=parser.parse_args();res=make(args.audit,args.baseline,args.out)
    print({k:v for k,v in res.items() if k!="walks"},len(res["walks"]),"tested routes")
