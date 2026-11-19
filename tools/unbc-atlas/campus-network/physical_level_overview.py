"""Place public walks between transfer landings on their measured native floor."""
from collections import defaultdict
import gzip
import json
from pathlib import Path

from landing_overview import digest, line, segments, shape, source_face


def _entry(row):
    group, a, b = row
    return (group, *sorted((tuple(a),tuple(b))))


def apply_physical_levels(payload, audit, dataset=None, arcs=None):
    """Add two-way same-elevation landing walks omitted by directory-level grouping.

    A drawing must already contain an incident segment of the same source walk.
    This preserves its mapped district. The original previous layer remains
    available even when both editions used the same incomplete directory levels.
    """
    audit = Path(audit)
    receipt = json.loads((audit/'installed-receipt.json').read_bytes())
    if (payload['summary']['source'], payload['summary']['runtime']) != (receipt['datasetSha256'],receipt['runtimeSha256']):
        raise ValueError('Campus overview and published routing receipt do not match')
    arcs = arcs if arcs is not None else json.loads((audit/'arcs.json').read_bytes())
    candidates = [r for r in arcs if r['k']=='walk' and r['e'].startswith('native-cell:')
                  and len(set(r['levels']))>1 and len(r['p'])>=2
                  and len({p[2] for p in r['p']})==1]
    proof = dict(dataset=receipt['datasetSha256'],runtime=receipt['runtimeSha256'],cache=receipt['compressedSha256'],
                 mixedLevelArcs=len(candidates),walks=[],addedSegments=0)
    if not candidates: return proof
    data = dataset if dataset is not None else json.loads((audit/'browser-route-data.json').read_bytes())
    candidate_ids = {r['e'] for r in candidates}
    sources = {e['id']:e for e in data['edges'] if e['id'] in candidate_ids}
    levels = {row['id']:row['elevationFeet'] for row in data['nativeLevels']}
    landings = defaultdict(set)
    for transfer in payload['transfers']:
        if transfer['status']=='Public':
            for end in transfer['ends']:
                landings[end['node']].add(end['l'])
    cache = audit.parent/'openindoormaps/public'/receipt['url'].lstrip('/')
    if digest(cache)!=receipt['compressedSha256']: raise ValueError('Published physical topology checksum mismatch')
    with gzip.open(cache) as stream: bundle=json.load(stream)
    if bundle['datasetSha256']!=receipt['datasetSha256'] or bundle['hydration']['runtimeSha256']!=receipt['runtimeSha256']:
        raise ValueError('Physical topology belongs to a different routing release')
    topology=bundle['topology']
    if topology['sourceModelSha256']!=data['source']['modelSha256']:raise ValueError('Native cell model mismatch')
    index=defaultdict(list)
    for r in arcs:
        if r['e'] in sources:index[r['e']].append(r)
    new_by_level=defaultdict(set)
    faces={}
    for edge_id,edge in sorted(sources.items()):
        if edge['kind']!='walk' or not edge.get('enabled') or not edge.get('nativeCellId'):continue
        common=landings.get(edge['from'],set()) & landings.get(edge['to'],set())
        if not common:continue
        source_arcs=index[edge_id]
        directions={(r['f'],r['t'],tuple(map(tuple,r['p']))) for r in source_arcs}
        for r in source_arcs:
            if len(set(r['levels']))<2 or len(r['p'])<2:continue
            pts=r['p'];floor=pts[0][2]
            native_levels=[lv for lv,z in levels.items() if abs(floor-z)<1e-6]
            if len(native_levels)!=1 or native_levels[0] not in common or any(q[2]!=floor for q in pts):continue
            lv=native_levels[0]
            if (r['t'],r['f'],tuple(map(tuple,reversed(pts)))) not in directions or r['f']>=r['t']:continue
            if any(abs(q[2]-floor)>1e-6 for q in edge['pointsFeet']):continue
            cell=edge['nativeCellId']
            if cell not in faces:faces[cell]=source_face(topology,cell)
            face=faces[cell]
            if not face.covers(line(r)) or not all(face.covers(shape(seg)) for seg in segments(pts)):continue
            geo=payload['geo'].get(lv) or payload['geo'][str(lv)]
            existing={_entry(s) for s in geo['network']}
            old_only={_entry(s) for s in geo.get('previousExtra',[])}
            # Match an existing drawing edge from this very source at one of
            # the mixed arc's vertices. A spatially nearby parallel guide
            # does not establish district ownership.
            anchors=set()
            for other in source_arcs:
                if other['levels']!=[lv,lv] or not {r['f'],r['t']}.intersection((other['f'],other['t'])):continue
                anchors.update(segments(other['p']))
            groups={group for group,a,b in existing if (a,b) in anchors}
            if len(groups)!=1:continue
            group=next(iter(groups)); draws={(group,*seg) for seg in segments(pts)}
            if old_only & draws:continue
            new_by_level[lv].update(draws-existing)
            proof['walks'].append(dict(source=edge_id,level=lv,elevationFeet=floor,district=group,cell=cell,
                                      segments=sorted(draws),vertices=[r['f'],r['t']]))
    for lv,members in new_by_level.items():
        if not members:continue
        geo=payload['geo'].get(lv) or payload['geo'][str(lv)]
        now={_entry(s) for s in geo['network']}
        before=(now-{_entry(s) for s in geo.get('currentExtra',[])})|{_entry(s) for s in geo.get('previousExtra',[])}
        now.update(members)
        geo.update(network=sorted(now),previousExtra=sorted(before-now),currentExtra=sorted(now-before))
        proof['addedSegments']+=len(members)
    return proof
