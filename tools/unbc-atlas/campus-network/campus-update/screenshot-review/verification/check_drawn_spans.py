"""Test complete source spans against the network actually drawn on the Floor 1 map."""
import json
import sys
from pathlib import Path
from collections import defaultdict
HERE=Path(__file__).resolve().parent
REVIEW=HERE.parent
sys.path.insert(0,str(REVIEW.parents[2]/'py'))
from shapely.geometry import LineString
from shapely.ops import unary_union

def read(p):return json.loads(p.read_bytes())
def map_data(file):return json.JSONDecoder().raw_decode(file.read_text().split("const data=",1)[1])[0]

def main():
    new=map_data(REVIEW/'atlas/campus-network.html')
    previous=map_data(REVIEW.parent/'final-atlas/campus-network.html')
    assert new['summary']['runtime']==read(REVIEW/'final-release/installed-receipt.json')['runtimeSha256']
    cases={('Conference Centre lobby to Stair 4 landing','694'):read(REVIEW/'b06-floor2/original.json')[0]['path'],
           ('Agora, outside 07-218 and 07-232','311'):read(REVIEW/'b06/native-replay.json')['rows'][0]['points'],
           ('07-180 to switchback approach','311'):read(REVIEW/'b07-09/junction-proof.json')['positiveDirectedSpans'][0]['points']}
    outcomes={}
    for prefix,atlas in [('previous',previous),('current',new)]:
        for (place,level),points in cases.items():
            groups=defaultdict(list)
            for group,a,b in atlas['geo'][level]['network']:
                groups[group].append(LineString([a,b]))
            covered={g:unary_union(lines).buffer(.025) for g,lines in groups.items()}
            line=LineString([p[:2] for p in points])
            remaining=min(line.difference(ink).length for ink in covered.values())
            if prefix=='current':assert remaining < .02,(place,remaining)
            outcomes.setdefault(place,{})[prefix+'MissingMetres']=round(.3048*remaining,3)
    (HERE/'drawn-spans.json').write_text(json.dumps(outcomes,indent=2)+'\n')
    print(outcomes)
if __name__=='__main__':main()
