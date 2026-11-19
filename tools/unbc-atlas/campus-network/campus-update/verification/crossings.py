"""Screen measured public browser journeys for planar loops on one uninterrupted elevation."""
import argparse
import csv
import json
import math
import sys
from collections import Counter,defaultdict
from pathlib import Path

HERE=Path(__file__).resolve().parent
CAMPUS=HERE.parents[1]
sys.path.insert(0,str(CAMPUS.parent/"py"))
from shapely.geometry import LineString
from shapely.strtree import STRtree


def levels(row):
    run=[]
    for p in row.get("paths") or []:
        edge=p["edgeIds"][0]
        for a,b in zip(p["pointsFeet"],p["pointsFeet"][1:]):
            if a[:2]==b[:2] and a[2]==b[2]:continue
            if abs(a[2]-b[2])>1e-7 or run and math.dist(run[-1][1],a)>1e-6:
                if run:yield run
                run=[]
            if abs(a[2]-b[2])<=1e-7:run.append((a,b,edge))
    if run:yield run


def loops(row):
    found={}
    for run in levels(row):
        if len(run)<3:continue
        segments=[LineString((a[:2],b[:2])) for a,b,e in run]
        tree=STRtree(segments)
        distance=[0.]
        for s in segments:distance.append(distance[-1]+s.length)
        for i,s in enumerate(segments):
            for j in tree.query(s,predicate="intersects"):
                if j<i+2:continue
                t=segments[j]; hit=s.intersection(t)
                if hit.geom_type!="Point":continue
                xy=hit.coords[0]
                length=(distance[j]+t.project(hit)-distance[i]-s.project(hit))*.3048
                if length<.05:continue
                ring=[xy]+[tuple(run[k][1][:2]) for k in range(i,j)]+[xy]
                area=abs(math.fsum((b[0]-a[0])*(b[1]+a[1]) for a,b in zip(ring,ring[1:]))/2)
                if area<.003:continue
                key=(round(run[i][0][2],4),round(xy[0],4),round(xy[1],4),round(length,3))
                found[key]=(run[i][2],run[j][2],round(area*.3048**2,4))
    return found


def scan(files):
    results={}
    for path in files:
        if not path.is_file():continue
        obj=json.loads(path.read_bytes()); records=obj if isinstance(obj,list) else obj["rows"]
        for r in records:
            if r["mode"]=="public" and r["metres"] is not None:
                results[r["a"],r["b"]]=loops(r)
    return results


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("browser",type=Path)
    p.add_argument("--out",type=Path,default=HERE/"measured-loops.csv")
    args=p.parse_args()
    old=scan([CAMPUS/"hallway-review/release/browser-verified.json",HERE.parent/"release/baseline-review/browser-measurements.json"])
    new=scan([args.browser])
    out=[]
    for pair,seen in new.items():
        for (z,x,y,length), (u,v,area) in seen.items():
            baseline=old.get(pair)
            status="previous trip unavailable or unsampled" if baseline is None else "seen on previous trip" if (z,x,y,length) in baseline else "new on comparable trip"
            out.append(dict(origin=pair[0],destination=pair[1],elevation_feet=z,x_feet=x,y_feet=y,closed_walk_m=length,
                            enclosed_area_m2=area,first_edge=u,last_edge=v,comparison=status))
    fields=['origin','destination','elevation_feet','x_feet','y_feet','closed_walk_m','enclosed_area_m2','first_edge','last_edge','comparison']
    with args.out.open("w",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(out)
    print(json.dumps(dict(successfulTrips=len(new),positiveAreaLoopOccurrences=len(out),
                          distinctShapes=len({(r["x_feet"],r["y_feet"],r["elevation_feet"],r["closed_walk_m"]) for r in out}),
                          comparison=Counter(r["comparison"] for r in out)),indent=2))


if __name__=="__main__":
    main()
