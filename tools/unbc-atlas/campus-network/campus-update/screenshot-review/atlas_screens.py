"""Bind the five screenshot navigation views to fresh desktop-worker trips and earlier directory evidence."""
from pathlib import Path
import json,os,sys
here=Path(__file__).resolve().parent;update=here.parent; campus=update.parent; out=here/'atlas';release=here/os.environ.get('UNBC_SCREEN_RELEASE_DIR','final-release');audit=release/'audit'
sys.path[:0]=[str(update/'atlas'),str(campus.parent/'py')]
from evidence import make
from shapely.geometry import LineString,Point,box as rectangle
def read(p):return json.loads(p.read_bytes())
def atlas(folder):return json.JSONDecoder().raw_decode((folder/'campus-network.html').read_text().split('const data=',1)[1])[0]
old=atlas(update/'final-atlas')
views=[
 ('conference-lobby','06 · Lecture theatres and landing',694,'06',[-288,-148,-48,2],
  'The shared path runs straight for 7.44 m across the Floor 2 landing beside the steps. Select a landing marker to see its adjoining level.',
  [('06-213','06-209'),('06-214','06-209'),('06-215','06-213'),('04-209','06-305'),('04-150','06-205')]),
 ('agora-lecture','07 · Agora and lecture hall',311,'07',[-135,-48,30,105],
  'Follow the public hallway between the entrances to 07-218 and 07-232.',
  [('07-218','07-232'),('07-217','07-234'),('06-342','07-218'),('07-234','07-238')]),
 ('raised-rotunda','04 · Approaching the raised rotunda',311,'04',[-125,285,-12,402],
  'The rotunda is on Floor 1.25. The public connection from the northern washroom wing remains unconfirmed.',
  [('04-125','04-108'),('04-115','04-125'),('04-124','04-125')]),
 ('agora-switchback','07 · Ramps to Buildings 08 and 09',311,'07',[-6,382,127,482],
  'The hall at 07-180 links the switchback ramp from Floor 1.25 to the ramp and steps down to Building 09 on Floor 0.5. The step-free status of the eastern ramp and its door is unconfirmed.',
  [('08-103','09-200'),('07-217','09-200'),('07-180','09-200'),('09-201','08-103'),('07-217','09-205'),('07-217','09-210'),('08-103','09-210'),('09-200','07-170')]),
 ('student-commons','09 · Student Commons and shared hallway',1450417,'09',[95,430,344,535],
  'The ramp from Building 07 joins one shared hallway. The nearby steps also lead to Building 07. Select a walk to see which crossing it uses.',
  [('09-200','09-205'),('07-180','09-200'),('08-103','09-200'),('07-217','09-205'),('09-232','09-205'),('07-217','09-210'),('08-103','09-210')])]
observation=release/'upper-landing-observation.json'
if observation.is_file():
    field=read(observation)
    assert field["room"]=="06-S306" and field["modelSha256"]==read(audit/"installed-receipt.json")["source"]["modelSha256"]
    views.append(('stair-6-upper-hall','06 · Third-floor landing beside Stair 6',field["levelId"],field["building"],
                  [-309,-69,-255,-27],
                  'Visitors can cross this flat landing both ways between the Reception side and the hallway toward 06-368.',
                  [('06-370','06-390'),('06-368','06-370')]))
def stored_views(audit,out):
    return [{**v,'note':v['note'].replace(' Use Previous hallway drawing to compare the bend.','')}
            for v in old['reviewedViews'] if not v.get('traceWalks')]
def measured_evidence():
    extra=[(w['workerOrigin'],w['workerDestination']) for w in old['walks']]
    extra.extend(tuple(pair) for pair in read(release/'screenshot-pairs.json'))
    for view in views:extra.extend(view[-1])
    return make(audit,update/'final-checked/audit',out,stored_views,extra)
def localized(layer,box):
    boundary=rectangle(*box)
    return (any(boundary.intersects(LineString(path)) for path in layer['parts'] if len(path)>1)
            or any(boundary.covers(Point(p)) for p in layer['landings'])
            or any(boundary.covers(Point(p)) for _,p in layer['marks']))
def pair_checker(atlas):
    by_label={}
    for row in atlas['rooms']:
        for key in {row[0],row[6]}:by_label.setdefault(key,[]).append(row)
    def check(a,b):
        choices={bool(u[4] and v[5] and int(v[5]) in atlas['reach'].get(u[4],[]))
                 for u in by_label.get(a,[]) for v in by_label.get(b,[]) if u[6]!=v[6]}
        # An ambiguous duplicate number is not a definite room-to-room comparison.
        return choices.pop() if len(choices)==1 else None
    return check

def attach():
    path=out/'campus-network.html';header,token,text=path.read_text().partition('const data=')
    m,end=json.JSONDecoder().raw_decode(text);trips=read(release/'trips/current-worker.json')
    assert trips['runtimeSha256']==m['summary']['runtime']
    original=read(update/'final-checked/trips/current-worker.json')
    lookup={(r['from'],r['to'],r['mode']):r for r in trips['trips']}
    before={(r['from'],r['to'],r['mode']):r for r in original['trips']}
    previous_reach=pair_checker(old);current_reach=pair_checker(m)
    screens=[];results=[]
    by_key={(w['workerOrigin'],w['workerDestination']):i for i,w in enumerate(m['walks'])}
    for id,label,level,building,box,note,pairs in views:
        ids=[];details=[]
        for a,b in pairs:
            for src,dst in ((a,b),(b,a)):
                k=src,dst,'public';t=lookup.get(k)
                if not t:continue
                i=by_key.get((src,dst));w=m['walks'][i] if i is not None else None
                layer=w and w.get('layers',{}).get(str(level));visible=bool(layer and localized(layer,box))
                if visible and i not in ids:ids.append(i)
                acc=lookup.get((src,dst,'accessible'));prev=before.get(k)
                details.append(dict(origin=src,destination=dst,publicMetres=t.get('metres'),stepFreeTested=acc is not None,
                                    stepFreeMetres=acc.get('metres') if acc else None,previousTested=prev is not None,
                                    previousPublicMetres=prev.get('metres') if prev else None,
                                    previousDirectoryReachable=previous_reach(src,dst),currentDirectoryReachable=current_reach(src,dst),
                                    visibleOnPanel=visible))
        if id=='agora-switchback':
            audit_parallel=read(out/'agora-parallel-check.json')
            if not any(r['identicalEndpointSameFaceAlternative'] for r in audit_parallel['arcs']):
                note+=' The adjacent north–south lines near 07-178 serve the hallway and the ramp approach. Their graph endpoints differ.'
        if id=='raised-rotunda':
            negative=[d for d in details if d['origin']=='04-115' and d['destination']=='04-125']
            if negative and negative[0]['publicMetres'] is None:note+=' No public route is available from 04-115 to 04-125.'
        if id=='stair-6-upper-hall':
            edge=f"walk:landing:{field['nativeStair']}:1779623:upper-hallway"
            halls=[a for a in read(audit/'arcs.json') if a['e']==edge]
            assert len(halls)==2 and halls[0]['p']==halls[1]['p'][::-1]
            assert all(a['k']=='walk' and set(a['levels'])=={level} for a in halls)
            route=LineString([p[:2] for p in halls[0]['p']])
            assert len(halls[0]['p'])==2
            for src,dst in (('06-370','06-390'),('06-390','06-370'),('06-368','06-370')):
                t=lookup[src,dst,'public']
                assert t['metres'] is not None and [edge,'walk'] in t['edges']
                assert all(set(p['levelIds'])=={level} for p in t['paths'])
            segments=m['geo'][str(level)]['network']
            ends={tuple(round(k,2) for k in p[:2]) for p in halls[0]['p']}
            assert any({tuple(a),tuple(b)}==ends for _,a,b in segments), 'Missing flat landing in the campus overview'
            note+=f' The straight crossing measures {route.length*.3048:.2f} m. Walking directions up the flight remain on hold.'
        screen=dict(id=id,name=label,level=level,building=building,box=box,note=note,traceWalks=ids)
        if id=='stair-6-upper-hall':
            screen['nativeStair']=field['nativeStair']
        screens.append(screen)
        results.append(dict(id=id,physicalLevel=level,box=box,note=note,walkIndices=ids,requests=details))
    for v in screens:assert v['traceWalks'],(v['id'],'missing displayed return path')
    m['reviewedViews']=[v for v in m['reviewedViews'] if v['id'] not in {r['id'] for r in screens}]+screens
    previous_pairs={(w['workerOrigin'],w['workerDestination']) for w in old['walks']}
    # Directory labels and record keys can address the very same measured journey.
    # If the selection changed alias, check its complete response before counting it.
    for w in old['walks']:
        k=(w['workerOrigin'],w['workerDestination'])
        if k in by_key:continue
        response=lookup.get((*k,'public'))
        assert response and response.get('metres') is not None,k
        equivalent=[cur for cur in m['walks'] if (cur['origin'],cur['destination'])==(w['origin'],w['destination']) and
                    lookup[cur['workerOrigin'],cur['workerDestination'],'public']['paths']==response['paths']]
        assert equivalent,k

    (out/'screenshot-panel-checks.json').write_text(json.dumps({'runtime':m['summary']['runtime'],'prior':m['summary']['previousRuntime'],
        'priorWalksReplayed':len(previous_pairs),'newScreens':results},indent=2)+'\n')
    path.write_text(header+token+json.dumps(m,separators=(',',':'),allow_nan=False).replace('</','<\\/')+text[end:])
    print([(r['id'],len(r['traceWalks'])) for r in screens])
if __name__=='__main__':
    if sys.argv[1]=='evidence':
        m=measured_evidence();print(m['gained'],m['lost'],len(m['walks']))
    elif sys.argv[1]=='attach':attach()
    else:raise ValueError(sys.argv[1])
