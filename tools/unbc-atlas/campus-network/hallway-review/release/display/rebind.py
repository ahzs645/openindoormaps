"""Reproduce Building 08, coffee-junction, and ordinary doorway display decisions for a specified audited release."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent
REVIEW=HERE.parents[1]
ROOT=REVIEW.parents[1]
DEFAULT_OLD=(ROOT/'rotunda-review/trips/shipped/current-worker.log').resolve().parent
DEFAULT_APP=HERE.parent/'openindoormaps'
SYS_NODE=Path('/workspace/scratch/unbc-test/runtime/bin/node')
sys.path.insert(0,str(ROOT/'py'))
from shapely.geometry import LineString, Point
from shapely.ops import unary_union


def read(path):
    return json.loads(path.read_bytes())


def write(path,value):
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(value,indent=2)+'\n');temp.replace(path)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def core(value):
    return {k:v for k,v in value.items() if k not in ('datasetSha256','runtimeSha256')}


def xy(p):
    return tuple(round(v,2) for v in p[:2])


def edge(a,b):
    return tuple(sorted((xy(a),xy(b))))


def shape(points):
    points=[xy(v) for v in points]
    if not points:return None
    return Point(points[0]) if len(set(points))==1 else LineString(points)


def graphic(audit):
    s=(audit/'campus-connectivity.html').read_text()
    return json.JSONDecoder().raw_decode(s.split('const data=',1)[1])[0]


def physical(name,audit,app,out):
    """Run the same native-body cases using the new checkout and its installed viewer asset."""
    folder=out/name;folder.mkdir(exist_ok=True,parents=True)
    names={'building08':('check.mts','proposals.json'),'junction':('physical-checks.mts','candidates.json')}
    script_name,input_name=names[name]
    physical_input=REVIEW/name/input_name
    source=REVIEW/name/script_name
    script=source.read_text().replace('../../../rotunda-review/worker-release/openindoormaps/',app.resolve().as_posix()+'/')
    begin='const root=path.resolve(' if name=='building08' else 'const base=path.resolve('
    end='const rawface=topo.faces.find(' if name=='building08' else 'const z=14.435695538057743,level=694;'
    imports,_,rest=script.partition(begin);assert rest
    _,_,geometry=rest.partition(end);assert geometry
    load="""
const [audit,app,input]=process.argv.slice(2);
const read=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipt=read(path.join(audit,'installed-receipt.json'));
const raw=fs.readFileSync(path.join(audit,'browser-route-data.json'));
const digest=hash(raw);assert.equal(digest,receipt.datasetSha256);
const compiled=fs.readFileSync(path.join(app,'public',receipt.url));assert.equal(hash(compiled),receipt.compressedSha256);
const mats=JSON.parse(gunzipSync(compiled));assert.equal(mats.hydration.runtimeSha256,receipt.runtimeSha256);
const topo=mats.topology;
"""
    if name=='building08':
        load+="const data=JSON.parse(raw.toString()),plan=read(input),cell='native-cell:14.435696:637',floor=14.435695538057743,level=694,Q=rational(floor);\n"
    else:
        imports+="import {gunzipSync} from 'node:zlib';\n"
        load+="const d=JSON.parse(raw.toString()),trips=receipt,published={value:mats.hydration};\n"
        geometry=geometry.replace("path.join(import.meta.dirname,'candidates.json')",'input')
    target=folder/'verify-physical.mts'
    target.write_text(imports+load+end+geometry)
    with (folder/'physical.log').open('w') as log:
        subprocess.run([str(SYS_NODE),'--import','tsx',str(target),str(audit),str(app),str(physical_input)],cwd=app,stdout=log,stderr=subprocess.STDOUT,check=True)
    result=read(folder/'physical-checks.json');old=read(REVIEW/name/'physical-checks.json')
    receipt=read(audit/'installed-receipt.json')
    assert all(result[k]==receipt[k] for k in ('datasetSha256','runtimeSha256'))
    return {'passedIdenticalCases':core(result)==core(old),'originalScript':digest(source),'actualScript':digest(target),
            'caseDefinitions':digest(physical_input),'originalProof':digest(REVIEW/name/'physical-checks.json'),'recomputedProof':digest(folder/'physical-checks.json')}


def witnesses(audit,level,mask,overview):
    def intersects(points):
        obj=shape(points)
        return obj is not None and mask.intersects(obj)
    rows={}
    arcs=[]
    for a in read(audit/'arcs.json'):
        if level not in a['levels']:continue
        if len(set(a['levels']))==1:
            points=a['p']
        else:
            points=[p for p,l in zip((a['p'][0],a['p'][-1]),(a['levels'][0],a['levels'][-1])) if l==level]
        if intersects(points):arcs.append((a['e'],a['f'],a['t'],a['k'],a['levels'],a['p']))
    rows['directedArcs']=arcs
    rows['stations']=[(r['key'],direction,r[direction]) for r in read(audit/'stops.json') for direction in ('depart','arrive') if r[direction] and r[direction]['levelId']==level and intersects([r[direction]['pointFeet']])]
    rows['roomBranches']=[(r['room'],r['branch']) for r in read(audit/'all-branches.json') if r['level']==level and intersects(r['branch']['pathToHallway'])]
    rows['overviewLines']=[edge(a,b) for _,a,b in overview['visitorSegments'][str(level)] if intersects([a,b])]
    rows['doorMarks']=[xy(p) for _,p in overview['entryMarks'].get(str(level),[]) if intersects([p])]
    rows['verticalTransfers']=[(xy(p),kind) for _,p,kind in overview['transferMarks'].get(str(level),[]) if intersects([p])]
    return {k:Counter(json.dumps(v,sort_keys=True,separators=(',',':')) for v in vals) for k,vals in rows.items()}


def rebind_local(name,old,new,out,physical_info,old_map,new_map):
    previous=read(REVIEW/name/'display-patch.json')
    old_receipt=read(old/'installed-receipt.json');current=read(new/'installed-receipt.json')
    assert all(previous[k]==old_receipt[k] for k in ('datasetSha256','runtimeSha256'))
    level=previous['level']
    # A half-centimetre display margin covers two independently rounded model points.
    mask=unary_union([LineString([a,b]) for _,a,b in previous['remove']+previous['add']]).buffer(.02)
    past=witnesses(old,level,mask,old_map);now=witnesses(new,level,mask,new_map)
    deltas={k:{'added':sum((now[k]-past[k]).values()),'removed':sum((past[k]-now[k]).values())} for k in past}
    conflicts=any(x['added'] or x['removed'] for x in deltas.values())
    geometry=new_map['visitorSegments'][str(level)]
    groups_by_line={}
    for g,a,b in geometry:groups_by_line.setdefault(edge(a,b),set()).add(g)
    groups=set.intersection(*(groups_by_line.get(edge(a,b),set()) for _,a,b in previous['remove']))
    ok=physical_info['passedIdenticalCases'] and not conflicts and len(groups)==1
    if ok:
        group=groups.pop()
        result=dict(previous)
        for k in ('add','remove'):result[k]=[[group,a,b] for _,a,b in previous[k]]
        if 'originalTrunk' in result:result['originalTrunk']=[group,*result['originalTrunk'][1:]]
        if 'retainedTrunk' in result:result['retainedTrunk']=[group,*result['retainedTrunk'][1:]]
        if 'group' in result:result['group']=group
        if name=='building08':result['tests']={**result['tests'],'physicalChecksSha256':physical_info['recomputedProof']}
    else:
        result={'level':level,'remove':[],'add':[],'scope':'The current overview retains the audited source geometry because locally affected uses or native physical results changed.'}
    info={'applied':ok,'checkedLevel':level,'sourcePatchSha256':digest(REVIEW/name/'display-patch.json'),'physical':physical_info,
          'currentTouchingObjects':{k:sum(x.values()) for k,x in now.items()},'touchingObjectChanges':deltas}
    if conflicts:
        info['changedObjects']={k:{'new':list((now[k]-past[k]).keys()),'old':list((past[k]-now[k]).keys())} for k in past if deltas[k]['added'] or deltas[k]['removed']}
    result.update(datasetSha256=current['datasetSha256'],runtimeSha256=current['runtimeSha256'],rebind=info)
    write(out/name/'display-patch.json',result)
    return info


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit',type=Path,default=HERE.parent/'audit')
    parser.add_argument('--baseline',type=Path,default=DEFAULT_OLD)
    parser.add_argument('--app',type=Path,default=DEFAULT_APP)
    parser.add_argument('--output',type=Path,default=HERE)
    parser.add_argument('--physical-only',action='store_true')
    a=parser.parse_args()
    new=a.audit.resolve();old=a.baseline.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
    assert out not in (REVIEW,old,new)
    receipt=read(new/'installed-receipt.json');prior=read(old/'installed-receipt.json')
    assert receipt['source']==prior['source']
    assert receipt['datasetSha256']==prior['datasetSha256']==digest(new/'browser-route-data.json')==digest(old/'browser-route-data.json')
    app=a.app.resolve()
    # A committed tree, immutable installed asset, exact inputs and proof bytes let a cold
    # map audit reuse the independent physical replay performed while its worker warmed.
    revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=app,text=True).strip()
    clean=not subprocess.check_output(['git','status','--porcelain'],cwd=app)
    source_files=[REVIEW/'building08/check.mts',REVIEW/'building08/proposals.json',REVIEW/'building08/physical-checks.json',
                  REVIEW/'junction/physical-checks.mts',REVIEW/'junction/candidates.json',REVIEW/'junction/physical-checks.json']
    cache_sha=digest(app/'public'/receipt['url'].lstrip('/'))
    assert cache_sha==receipt['compressedSha256']
    bindings={'treeRevision':revision,'receipt':digest(new/'installed-receipt.json'),'installedCache':cache_sha,
              'replayScript':digest(Path(__file__)),'inputs':{str(f.relative_to(REVIEW)):digest(f) for f in source_files}}
    stamp=out/'physical-bindings.json';proof_path=out/'physical-replay.json'
    reuse=clean and stamp.is_file() and proof_path.is_file() and read(stamp)==bindings
    if reuse:
        physical_info=read(proof_path)
        reuse=all((out/n/'physical-checks.json').is_file() and digest(out/n/'physical-checks.json')==physical_info[n]['recomputedProof']
                  and (out/n/'verify-physical.mts').is_file() and digest(out/n/'verify-physical.mts')==physical_info[n]['actualScript']
                  for n in ('building08','junction'))
    if not reuse:
        physical_info={n:physical(n,new,app,out) for n in ('building08','junction')}
        write(proof_path,physical_info)
        if clean:write(stamp,bindings)
    if a.physical_only:return
    old_map,new_map=(graphic(x) for x in (old,new))
    for audit in (old,new):
        bound=read(audit/'visitor-display-proof.json')
        assert all(bound[k]==read(audit/'installed-receipt.json')[k] for k in ('datasetSha256','runtimeSha256'))
    local={n:rebind_local(n,old,new,out,physical_info[n],old_map,new_map) for n in physical_info}
    subprocess.run([sys.executable,str(REVIEW/'thresholds/build.py'),'--audit',str(new),'--output',str(out/'thresholds')],check=True)
    threshold=read(out/'thresholds/proof.json')
    info={'sourceDataset':receipt['datasetSha256'],'baselineRuntime':prior['runtimeSha256'],'runtimeSha256':receipt['runtimeSha256'],
          'compressedSha256':receipt['compressedSha256'],'local':local,'thresholds':threshold['classification']}
    write(out/'rebind-proof.json',info)
    print(json.dumps(info,indent=2))

if __name__=='__main__':
    main()
