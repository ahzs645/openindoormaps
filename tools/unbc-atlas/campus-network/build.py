"""Derive an offline campus-wide transfer map from the released public walking graph."""
import argparse,csv,hashlib,json,math,os,sys
from hallway_overview import simplify, key as segment_key
from hallway_tip import verified_tip_removals
from collections import defaultdict,Counter
from pathlib import Path

here=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stairs-only',action='store_true',help='Recompute the stair inventory, native landing checks and both hallway approaches, skipping the full atlas and room matrix.')
parser.add_argument('--audit-dir',type=Path,help='Directory containing the exported graph, stops, receipt and native model.')
parser.add_argument('--output-dir',type=Path,help='Output directory for the reports or atlas.')
options=parser.parse_args()
out=Path(options.output_dir or os.environ.get("UNBC_CAMPUS_OUTPUT_DIR",here)).resolve()
out.mkdir(parents=True,exist_ok=True)
root=here.parent
baseline=(root/'rotunda-review/trips/shipped/current-worker.log').resolve().parent
release=here/'hallway-review/release'
def installed_audit():
    ready=release/'map-ready'
    binding=release/'display/rebind-proof.json'
    if not ready.exists() or not binding.exists():
        return baseline
    runtime=ready.read_text().strip()
    receipt=json.loads((release/'audit/installed-receipt.json').read_bytes())
    assert runtime==receipt['runtimeSha256']==json.loads(binding.read_bytes())['runtimeSha256']
    return release/'audit'

audit_dir=options.audit_dir or os.environ.get('UNBC_CAMPUS_AUDIT_DIR')
audit=Path(audit_dir).resolve() if audit_dir else installed_audit().resolve()
patch_root=Path(os.environ.get('UNBC_CAMPUS_PATCH_DIR',here/'hallway-review' if audit==baseline else audit.parent/'display')).resolve()
read=lambda p:json.loads(p.read_bytes())
receipt=read(audit/'installed-receipt.json')
source=audit/'browser-route-data.json'
with source.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==receipt['datasetSha256']
sys.path.insert(0,str(root/'py'))
from stair_connections import read_stair_inputs, stair_report, write_report, add_approach_examples
d=read_stair_inputs(source) if options.stairs_only else read(source)
proof=read(audit/'visitor-display-proof.json')
assert all(proof[k]==receipt[k] for k in ('runtimeSha256','datasetSha256'))
rows=read(audit/'arcs.json')
levels={l['id']:l['name'] for l in d['nativeLevels']}
z={l['id']:l['elevationFeet'] for l in d['nativeLevels']}
buildings=sorted({r['building'] for r in d['records']})
record={r['key']:r for r in d['records']}
nodes={r['id']:r for r in d['nodes']}
edge={r['id']:r for r in d['edges']}
stops={r['key']:r for r in read(audit/'stops.json')}
rooms={r['record']:r for r in csv.DictReader((audit/'trip-destinations.csv').open())}
def rounded(pt):return [round(pt[0],2),round(pt[1],2)]
def fys(node):
    best=min(z,key=lambda l:abs(z[l]-node['pointFeet'][2]))
    return best if abs(z[best]-node['pointFeet'][2])<.01 else node['levelId']
def bounds(points):
    return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)] if points else None
transit={'stairs','local-steps','elevator','ramp'}
byedge=defaultdict(list);adj=defaultdict(set);radj=defaultdict(set)
for a in rows:
    byedge[a['e']].append(a)
    if a['k'] not in transit:
        adj[a['f']].add(a['t']);radj[a['t']].add(a['f'])
depart=defaultdict(set);arrive=defaultdict(set)
for k in rooms:
    s=stops[k]
    if s['departVertex']:depart[s['departVertex']].add(k)
    if s['arriveVertex']:arrive[s['arriveVertex']].add(k)
def walkrooms(graph,stops,start):
    seen={start};stack=[start];hits=set()
    while stack:
        v=stack.pop();hits.update(stops.get(v,()))
        for u in graph.get(v,()):
            if u not in seen:seen.add(u);stack.append(u)
    return hits
def vertex(node):return json.dumps([node],separators=(',',':'))
review={int(r['Native stair']):r for r in csv.DictReader((root/'staircase-connections.csv').open())}
def review_note(native):
    return review.get(native, {}).get('Practical follow-up') or 'Check the two landing approaches and the walking line through the native flight.'
def room_name(key):
    r=record[key];return r['number'] or r['name']
kinds={'stairs':'Stair','local-steps':'Local steps','elevator':'Lift','ramp':'Ramp'}
transfers={};table=[];marks=defaultdict(dict)
def endpoint(nodekey):
    n=nodes[nodekey];v=vertex(nodekey)
    return {'node':nodekey,'b':n['building'],'l':fys(n),'logical':n['levelId'],'xy':rounded(n['pointFeet']),'room':room_name(n['roomKey']),
            'in':len(walkrooms(radj,depart,v)),'out':len(walkrooms(adj,arrive,v))}
cache={}
for e in edge.values():
    kind=e['kind']
    if kind not in transit:continue
    es=byedge.get(e['id'],[]);v,w=vertex(e['from']),vertex(e['to'])
    dirs={(a['f'],a['t']) for a in es}
    if es:assert dirs <= {(v,w),(w,v)} and (kind=='stairs' or len(dirs)==2)
    ends=[]
    for key in [e['from'],e['to']]:
        if key not in cache:cache[key]=endpoint(key)
        ends.append(cache[key])
    group=e.get('connectorId') or e['id'];native=e.get('nativeElementId')
    if kind in ('stairs','local-steps'):
        if len(dirs)==1:
            start,end=ends if (v,w) in dirs else reversed(ends)
            landing_names=start['room']+' → '+end['room']
        else:
            landing_names=' ↔ '.join(s['room'] for s in ends)
    label= ('Lift · '+group.removeprefix('unbc-').removesuffix('-lift').replace('-',' ').title() if kind=='elevator' else 
        ('Building 04 '+('curved' if native==1587605 else 'straight')+' ramp' if kind=='ramp' and native in (1587605,1586431) else
        (landing_names if kind in ('stairs','local-steps') else 'Ramp '+str(native))))
    tr=transfers.setdefault(group,{'key':group,'name':label,'type':kinds[kind],'status':'Public' if es else 'Held','native':native,'b':set(),'ends':{},'pairs':[],'paths':{},'reason':review_note(native) if kind=='stairs' and not es else ''})
    assert tr['status']==('Public' if es else 'Held')
    loc={'04'} if native in (1586431,1587605) else {s['b'] for s in ends}
    tr['b'].update(loc)
    for s in ends:tr['ends'][s['node']]=s
    tr['pairs'].append([s['node'] for s in ends])
    if es and kind!='elevator':
        for s in ends:tr['paths'][s['l']]=[rounded(p) for p in es[0]['p']]
    table.append([tr['name'],kinds[kind],tr['status'],','.join(sorted(loc)),group,e['id'],native or '',ends[0]['room'],levels[ends[0]['l']],ends[1]['room'],levels[ends[1]['l']],ends[0]['in'],ends[0]['out'],ends[1]['in'],ends[1]['out'],tr['reason']])
def save(name,head,rows):
    with (out/name).open('w',newline='') as f:
        w=csv.writer(f);w.writerow(head);w.writerows(rows)
save('vertical-links.csv',['name','type','public_graph_status','building','connector','source_edge','native_id','first_landing','first_floor','second_landing','second_floor','rooms_reaching_first_without_vertical_transfer','rooms_reachable_from_first_without_vertical_transfer','rooms_reaching_second_without_vertical_transfer','rooms_reachable_from_second_without_vertical_transfer','held_review_note'],table)
flights=d['stairDisplay']['sourceFlights'];associated={t['native']:t for t in transfers.values() if t['type'] in ('Stair','Local steps')}
flight_rows=[];treads=defaultdict(list)
for f in flights:
    nid=f['stairElementId']; logical=f['levelIds'];pts=[r['ringFeet'] for r in f['treads'] if r['ringFeet']]
    for land in f.get('landings',[]):
        if land.get('ringFeet'):pts.append(land['ringFeet'])
    name='Native stair '+str(nid);item=associated.get(nid)
    st=item['status'] if item else 'Drawing only'
    flight_rows.append([nid,','.join(f['buildings']),', '.join(levels[l] for l in logical),len(f['treads']),st])
    for l in logical:
        if pts:treads[l].append([nid,[list(map(rounded,ring)) for ring in pts]])
    if not item:
        transfers['drawing-'+str(nid)]={'key':'drawing-'+str(nid),'name':name,'type':'Stair','native':nid,'status':st,'b':set(f['buildings']),'ends':{},'paths':{},'pairs':[],'reason':'The model supplies stair geometry. A public flight between landings has not been established.','footprint':bounds([pt for ring in pts for pt in ring]),'layers':logical}
save('native-stair-inventory.csv',['native_stair','model_buildings','model_levels','modeled_treads','classification'],flight_rows)
for t in transfers.values():
    t['b']=sorted(t['b']);t['ends']=list(t['ends'].values());t.setdefault('layers',sorted({s['l'] for s in t['ends']},key=z.get))
    if t['type']=='Lift':t['ends'].sort(key=lambda s:z[s['l']])
stair_checks = stair_report(d, transfers, byedge, receipt, read(here/'stair-observations.json'), review)
add_approach_examples(stair_checks, transfers, rows, record, rooms, stops)
write_report(out, stair_checks, levels)
from native_stair_caps import scan_native_caps, write_native_caps
source_proof=here/'stair-cap-evidence.json'
cap_report=scan_native_caps(d, read(source_proof) if source_proof.is_file() else None,
                            dataset_sha256=receipt['datasetSha256'], runtime_sha256=receipt['runtimeSha256'])
write_native_caps(cap_report, out)
for side in cap_report['rows']:
    for transfer in transfers.values():
        if transfer.get('native') != side['stairElementId'] or 'stairCheck' not in transfer:
            continue
        if side.get('namedCapPassed') is not None:
            transfer['stairCheck'].setdefault('reviewedLandings',[]).append(dict(
                level=side['servedLevelId'], passed=side['namedCapPassed'], room=side['roomNumber']))
if options.stairs_only:
    print(f"Reviewed {stair_checks['nativeStairs']} native stairs and {cap_report['ends']} landing ends.")
    sys.exit(0)
m=json.JSONDecoder().raw_decode((audit/'campus-connectivity.html').read_text().split('const data=',1)[1])[0]
def destlab(k):return rooms[k]['number'] or rooms[k]['name']
# Independently traverse the released directed arcs for every distinct departure vertex.
full=defaultdict(set)
for a in rows:full[a['f']].add(a['t'])
full_reverse=defaultdict(set)
for fr,ends in full.items():
    for to in ends:full_reverse[to].add(fr)
for s in cache.values():
    v=vertex(s['node'])
    s['fullIn']=len(walkrooms(full_reverse,depart,v))
    s['fullOut']=len(walkrooms(full,arrive,v))
from functools import lru_cache
@lru_cache(None)
def reached(v):return walkrooms(full,arrive,v) if v else set()
matrix=Counter();examples={};floormatrix=Counter();floorex={}
ref=read(audit/'review-graph.json')['reach']
for k,r in rooms.items():
    eligible=reached(stops[k]['departVertex'])-{k}
    assert len(eligible)==int(r['other_reachable_destinations'])
    assert all(int(rooms[u]['arrival_group']) in ref[r['departure_group']] for u in eligible)
    for u in eligible:
        key=(r['building'],rooms[u]['building']);matrix[key]+=1
        ex=(destlab(k),destlab(u))
        if key not in examples or ex<examples[key]:examples[key]=ex
        floors=(int(r['level']),int(rooms[u]['level']))
        floormatrix[floors]+=1
        if floors not in floorex or ex<floorex[floors]:floorex[floors]=ex
matrix_rows=[[a,b,matrix[a,b],*(examples.get((a,b),('','')))] for a in buildings for b in buildings]
save('building-connections.csv',['from_building','to_building','reachable_directed_room_pairs','example_origin','example_destination'],matrix_rows)
floor_rows=[[levels[a],levels[b],floormatrix[a,b],*(floorex.get((a,b),('','')))] for a in levels for b in levels]
assert sum(r[2] for r in floor_rows)==sum(matrix.values())
save('floor-connections.csv',['from_directory_floor','to_directory_floor','reachable_directed_room_pairs','example_origin','example_destination'],floor_rows)
def all_room_directions():
    for k in sorted(rooms):
        a=rooms[k]
        for j in sorted(reached(stops[k]['departVertex'])-{k}):
            b=rooms[j]
            yield [destlab(k),a['building'],levels[int(a['level'])],k,destlab(j),b['building'],levels[int(b['level'])],j]
save('all-room-directions.csv',['origin','origin_building','origin_directory_floor','origin_record','destination','destination_building','destination_directory_floor','destination_record'],all_room_directions())
room_index=sorted([[destlab(k),r['name'],r['building'],levels[int(r['level'])],r['departure_group'],r['arrival_group'],k] for k,r in rooms.items()])
geo={}
for l,name in levels.items():
    key=str(l);base=m['levels'].get(key,{});building_boxes=defaultdict(list)
    labels=[]
    for r in m['rooms']:
        if r['level']==l and r['point']:
            building_boxes[r['building']].append(r['point'])
            if r['n']:labels.append([r['n'],r['point'],r['building']])
    for t in transfers.values():
        if l in t['layers']:
            for b in t['b']:
                for s in t['ends']:
                    if s['l']==l:building_boxes[b].append(s['xy'])
                if t.get('footprint'):building_boxes[b].extend([t['footprint'][:2],t['footprint'][2:]])
    coords=base.get('coords',[]);rg=base.get('rings',[])
    fallback=[]
    if not base:
        for f in d['walkingSupport']['floors']:
            if abs(f['elevationFeet']-z[l])<.01:
                for part in f.get('partsFeet') or [f.get('ringsFeet',[])]:fallback.extend([[rounded(q) for q in ring] for ring in part])
    geom=[p for ring in fallback for p in ring]+coords+[p for _,rings in treads[l] for ring in rings for p in ring]
    geo[l]={'name':name,'exported':bool(base),'coords':coords,'rings':rg,'fallback':fallback,'network':m['visitorSegments'].get(key,[]),'stops':m['entryMarks'].get(key,[]),'labels':labels,'treads':treads[l],'bounds':bounds(geom),'byBuilding':{b:bounds(ps) for b,ps in building_boxes.items() if ps}}
display_review=simplify(geo,audit,rows,record,stops,receipt,patch_root)
# This particular virtual seam extends farther than the campus-wide cleanup tolerance.
tip,tip_proof=verified_tip_removals(geo,audit,rows,stops,read(audit/'all-branches.json'),receipt,transfers,
    read(patch_root/'floor1-tip-replay.json') if (patch_root/'floor1-tip-replay.json').is_file() else None)
display_review['floor1Tip']=tip_proof
if tip:
    g=geo[311]
    network=set(map(segment_key,g['network']))
    prev=(network-set(map(segment_key,g['currentExtra'])))|set(map(segment_key,g['previousExtra']))
    assert tip<=network
    network-=tip
    g.update(network=sorted(network),previousExtra=sorted(prev-network),currentExtra=sorted(network-prev))
previous_atlas=os.environ.get('UNBC_CAMPUS_PREVIOUS_ATLAS')
if previous_atlas:
    earlier=json.JSONDecoder().raw_decode(Path(previous_atlas).read_text().split('const data=',1)[1])[0]
    assert earlier['summary']['source']==receipt['datasetSha256']
    for l,g in geo.items():
        prev={segment_key(s) for s in earlier['geo'][str(l)]['network']}
        now={segment_key(s) for s in g['network']}
        g.update(previousExtra=sorted(prev-now),currentExtra=sorted(now-prev))
    previous_runtime=earlier['summary']['runtime']
    del earlier
elif audit!=baseline:
    # The comparison control restores the actual earlier geometry, including earlier gaps.
    earlier=json.JSONDecoder().raw_decode((baseline/'campus-connectivity.html').read_text().split('const data=',1)[1])[0]
    for l,g in geo.items():
        prev={segment_key(s) for s in earlier['visitorSegments'].get(str(l),[])}
        now={segment_key(s) for s in g['network']}
        g['previousExtra']=sorted(prev-now)
        g['currentExtra']=sorted(now-prev)
    del earlier
(out/'hallway-review-overview.json').write_text(json.dumps(display_review,indent=2))
assert len(flight_rows)==len({r[0] for r in flight_rows})
counts=Counter((t['type'],t['status']) for t in transfers.values())
summary={'source':receipt['datasetSha256'],'runtime':receipt['runtimeSha256'],'nativeStairs':len(flights),'directory':len(rooms),'buildings':buildings,'graphArcs':len(rows),'publicTrips':sum(matrix.values()),'crossBuildingDirections':sum(v for (a,b),v in matrix.items() if a!=b),'connectedBuildingPairs':sum(bool(matrix[a,b]) for i,a in enumerate(buildings) for b in buildings[i+1:]),'planLayers':sum(x['exported'] for x in geo.values()),'nativeLevels':len(geo),'counts':{k+' / '+s:v for (k,s),v in counts.items()}}
summary['hallwayRepairsVerified']=audit!=baseline and (audit.parent/'map-ready').read_text().strip()==receipt['runtimeSha256']
examples_of_walks=[]
if previous_atlas:summary['previousRuntime']=previous_runtime
evidence_path=os.environ.get('UNBC_CAMPUS_ATLAS_EVIDENCE')
evidence=read(Path(evidence_path)) if evidence_path else None
if evidence:
    assert evidence['runtimeSha256']==receipt['runtimeSha256'] and evidence['previousRuntime']==previous_runtime
    assert evidence['publicTrips']==summary['publicTrips']
    examples_of_walks=evidence['walks']
elif summary['hallwayRepairsVerified']:
    trips=read(audit.parent/'trips/current-worker.json')
    assert trips['runtimeSha256']==receipt['runtimeSha256']
    for start,end,layer in [('04-150','07-114',311),('10-2008','10-2004',694),('10-2052','10-2058',694)]:
        for origin,destination in [(start,end),(end,start)]:
            trip=next(t for t in trips['trips'] if (t['from'],t['to'],t['mode'])==(origin,destination,'public'))
            assert trip['metres']>0 and all(set(p['levelIds'])=={layer} for p in trip['paths'])
            parts=[[rounded(pt) for pt in p['pointsFeet']] for p in trip['paths'] if p['pointsFeet']]
            endpoints=[rounded(trip[k]['pointFeet']) for k in ('departure','arrival')]
            examples_of_walks.append({'origin':origin,'destination':destination,'level':layer,'metres':round(trip['metres'],2),
                                       'parts':parts,'ends':endpoints,'box':bounds([p for part in parts for p in part])})
if evidence:
    identifiers=[row[6] for row in room_index]
    save('directory-records.csv',['room_number_or_label','name','building','directory_floor','departure_group','arrival_group','record'],room_index)
    def full_matrix():
        for k in identifiers:
            targets=reached(stops[k]['departVertex'])-{k}
            yield [k,*['' if j==k else int(j in targets) for j in identifiers]]
    save('all-pair-reachability.csv',['origin_record',*identifiers],full_matrix())
    summary['allDistinctPairs']=len(identifiers)*(len(identifiers)-1)
payload={'reviewedViews':evidence.get('views',[]) if evidence else [],'roomRanges':evidence.get('roomRanges',[]) if evidence else [],'coverage':evidence['buildings'] if evidence else [],'walks':examples_of_walks,'summary':summary,'geo':geo,'levels':list(levels),'transfers':list(transfers.values()),'matrix':matrix_rows,'floorMatrix':floor_rows,'rooms':room_index,'reach':ref}
if (audit/'public-room-branches.json').is_file():
    from physical_level_overview import apply_physical_levels
    from landing_overview import apply_reviewed_landings
    physical_level_review=apply_physical_levels(payload,audit,d,rows)
    (out/'physical-level-overview-checks.json').write_text(json.dumps(physical_level_review,indent=2))
    landing_review=apply_reviewed_landings(payload,audit)
    (out/'landing-overview-checks.json').write_text(json.dumps(landing_review,indent=2))
(out/'summary.json').write_text(json.dumps(summary,indent=2))
(out/'campus-network.html').write_text((here/'template.html').read_text().replace('/*DATA*/',json.dumps(payload,separators=(',',':'),allow_nan=False).replace('</','<\\/')))
print(json.dumps(summary,indent=2))
for tr in transfers.values():
    if tr['status']=='Public':print(tr['name'],[(s['room'],s['in'],s['out'],s['fullIn'],s['fullOut']) for s in tr['ends']])
