#!/usr/bin/env python3
"""Preserve a CAD folder, compare named sheets with a master, and stage review only.
No source/model/access/routing mutation. See docs/dwg-floorplan-folder.md.
"""
import argparse
from datetime import datetime, timezone
from collections import Counter, defaultdict
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

import ezdxf
from shapely.geometry import box
from shapely.strtree import STRtree
from registration import recover_registration, transform

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def load_helper(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


recovery = load_helper('recover-room-polygons')


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def normalize(number):
    return re.sub(r'\s+', '', number).upper()


def path_data(rings):
    return ' '.join('M' + ' L'.join(f'{x:.3f},{-y:.3f}' for x, y in ring) + ' Z' for ring in rings)


def build_review(args):
    folder, out, master = args.folder.resolve(), args.out.resolve(), args.master.resolve()
    out.mkdir(parents=True, exist_ok=True)
    source = out / 'source'
    source.mkdir(exist_ok=True)
    dwgs = sorted(p for p in folder.iterdir() if p.suffix.lower() in ('.dwg', '.dxf'))
    plans = [p for p in dwgs if 'floor' in p.stem.lower()]
    if len(plans) != 1:
        raise ValueError('Expected one floor-plan drawing. Use a folder with one floor-plan DWG/DXF and its campus reference.')
    plan = plans[0]
    original_sha = digest(plan)
    master_sha = digest(master)
    originals = []
    for item in dwgs:
        dest = source / item.name
        if item.resolve() != dest.resolve():
            shutil.copy2(item, dest)
        originals.append(dict(name=item.name, sha256=digest(item), sizeBytes=item.stat().st_size))
    stage = out / 'stage'
    stage.mkdir(exist_ok=True)
    converted = stage / 'floorplans.dxf'
    conversion_binding = stage / 'conversion.json'
    binding = dict(sourceSha256=original_sha, decoder='LibreDWG dwgread')
    cached = json.loads(conversion_binding.read_text()) if conversion_binding.exists() else {}
    if not converted.exists() or any(cached.get(k) != v for k, v in binding.items()) or cached.get('convertedSha256') != digest(converted):
        if plan.suffix.lower() == '.dxf':
            shutil.copy2(plan, converted)
        else:
            with (stage / 'conversion.log').open('w') as log:
                subprocess.run(['dwgread', '-O', 'DXF', '-o', str(converted), str(plan)], check=True, stdout=log, stderr=log)
        write_json(conversion_binding, {**binding, 'convertedSha256': digest(converted)})
    config = json.loads((HERE / 'config.unbc.json').read_text())
    # Composite sheets are independently positioned. No global GIS bbox fit.
    config['transform'] = dict(mode='identity')
    config['campus']['enabled'] = False
    config['conversion'] = {}
    config['layouts']['allowMissingViewportStatus'] = True
    config_path = stage / 'config.json'
    write_json(config_path, config)
    imported = stage / 'import'
    if not args.reuse_stage or not (imported / 'recovered-room-polygons.json').exists():
        with (stage / 'import.log').open('w') as log:
            env = {**os.environ, 'PATH': str(Path(sys.executable).parent) + os.pathsep + os.environ.get('PATH', '')}
            subprocess.run(['node', str(HERE / 'cli.mjs'), '--input', str(converted), '--config', str(config_path), '--outdir', str(imported)], cwd=ROOT, env=env, check=True, stdout=log, stderr=log)
    request = json.loads((imported / 'wall-recovery-request.json').read_text())
    recovered = json.loads((imported / 'recovered-room-polygons.json').read_text())
    recovered_by_id = {r['anchorId']: r for r in recovered['recoveredPolygons']}
    with zipfile.ZipFile(master) as archive:
        rooms = json.loads(archive.read('floors/rooms.json'))
        dataset = json.loads(archive.read('viewer/indoor.json'))
    annotations = rooms['annotations']
    groups = defaultdict(list)
    for room in annotations:
        section = room.get('dwg', {}).get('sectionId')
        if section:
            groups[section].append(room)
    registrations = {name: fit for name, values in groups.items()
                     if (fit := recover_registration(values, original_sha)) is not None}
    omitted = {s['sectionId']: s for s in rooms.get('sourceCoverage', {}).get('omittedSheets', [])}
    buildings = {r['building'] for r in dataset['records'] if r.get('building')}
    by_sheet = defaultdict(list)
    unassigned = []
    for anchor in request['roomAnchors']:
        if anchor['layoutWindowId']:
            by_sheet[anchor['layoutWindowId']].append(anchor)
        else:
            unassigned.append(anchor)
    doc = ezdxf.readfile(converted)
    lines = []
    boxes = []
    reviter_entities = []
    for entity in doc.modelspace():
        if not re.search('wall', entity.dxf.layer, re.I):
            continue
        points = recovery.flatten_entity_points(entity, 100)
        if len(points) < 2:
            continue
        bbox = recovery.entity_bbox(entity)
        if bbox is None:
            continue
        lines.append(points)
        boxes.append(box(*bbox))
        record = dict(type=entity.dxftype(), layer=entity.dxf.layer, points=points, closed=recovery.entity_is_closed(entity))
        if entity.dxftype() == 'ARC':
            # Reviter's registration reader uses analytic swings as door evidence.
            import math
            record.update(centre=[entity.dxf.center.x, entity.dxf.center.y], radius=entity.dxf.radius,
                          startAngle=math.radians(entity.dxf.start_angle), endAngle=math.radians(entity.dxf.end_angle))
            record.pop('points', None)
        reviter_entities.append(record)
    tree = STRtree(boxes)
    (out / 'plans').mkdir(exist_ok=True)
    sheets = []
    all_candidates = []
    for i, sheet in enumerate(request['layoutWindows']):
        if sheet.get('isOverview'):
            continue
        name = sheet['name']
        anchors = by_sheet[name]
        registered = [s for s in registrations if s == name or re.sub(r' #\d+$', '', s) == name]
        present_by_number = defaultdict(list)
        for room in annotations:
            dwg = room.get('dwg', {})
            # North/south sheets overlap. A renamed/merged room retains rawText;
            # neither a crop choice nor a reviewed label makes it newly missing.
            anchor = dwg.get('anchorDwg')
            in_crop = isinstance(anchor, list) and len(anchor) == 2 and recovery.point_inside_bbox(anchor, sheet['bbox'])
            if dwg.get('sha256') == original_sha and (in_crop or re.sub(r' #\d+$', '', dwg.get('sectionId', '')) == name):
                for number in {normalize(room.get('number', '')), normalize(dwg.get('rawText', ''))}:
                    present_by_number[number].append(room)
        candidates = []
        for anchor in anchors:
            match = recovered_by_id.get(anchor['id'])
            known = present_by_number.get(normalize(anchor['roomNumber']), [])
            fits = [(s, registrations[s]) for s in registered]
            fit = fits[0][1] if len(fits) == 1 else None
            # Multi-level sheets cannot inherit one arbitrary native elevation.
            status = 'existing' if known else 'missing-room' if fit else 'unregistered'
            candidate = dict(id=f"cad:{original_sha[:16]}:{anchor['id']}", number=anchor['roomNumber'],
                             name=anchor['roomUse'], building=anchor['buildingCode'], sheet=name,
                             anchor=anchor['cadPosition'], status=status,
                             existingKeys=[r['key'] for r in known],
                             sourceHandle=anchor['id'], sourceSha256=original_sha,
                             roomNumberFloor=anchor['floor'], sheetFloors=sheet.get('floors', []),
                             floorAssignment='saved native registration' if fit else 'drawing sheet; native floor unassigned',
                             matchMode=match['matchMode'] if match else None,
                             rings=match.get('cadRings', [match['cadPoints']]) if match else [],
                             registrationSection=fits[0][0] if fit else None,
                             levelId=fit['levelId'] if fit else None,
                             routingEligible=False, enclosureVerified=False)
            if fit:
                candidate['anchorFeet'] = transform(anchor['cadPosition'], fit)
                candidate['ringsFeet'] = [[transform(p, fit) for p in ring] for ring in candidate['rings']]
            candidates.append(candidate)
        bbox = sheet['bbox']
        width, height = bbox[2]-bbox[0], bbox[3]-bbox[1]
        paths = []
        for index in tree.query(box(*bbox)):
            points = lines[int(index)]
            paths.append('M' + ' L'.join(f'{x:.3f},{-y:.3f}' for x, y in points))
        original_paths = []
        # Overlay actual prepared current geometry in the saved registration.
        for section in registered:
            fit = registrations[section]
            keys = {r['key'] for r in groups[section]} | {r['key'] for values in present_by_number.values() for r in values if r['levelId'] == fit['levelId']}
            for record in dataset['records']:
                if record['key'] not in keys:
                    continue
                rings = [[transform(p, fit, inverse=True) for p in ring] for ring in record['ringsFeet']]
                original_paths.append(f'<path d="{path_data(rings)}"><title>{html.escape(record["number"]+" · "+record["name"])}</title></path>')
        fills, labels = [], []
        font = max(width, height) / 135
        for candidate in candidates:
            if candidate['rings']:
                mode = 'contains' if candidate['matchMode'] == 'contains' else 'buffer'
                fills.append(f'<path class="{mode}" data-id="{html.escape(candidate["id"])}" d="{path_data(candidate["rings"])}"><title>{html.escape(candidate["number"]+" · "+candidate["name"])}</title></path>')
            x, y = candidate['anchor']
            labels.append(f'<g data-id="{html.escape(candidate["id"])}"><circle cx="{x}" cy="{-y}" r="{font*.32}"/><text x="{x+font*.45}" y="{-y}" font-size="{font}">{html.escape(candidate["number"])}</text></g>')
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{bbox[0]} {-bbox[3]} {width} {height}" width="1400" height="1000"><style>path{{vector-effect:non-scaling-stroke}} #linework{{fill:none;stroke:#515d65;stroke-width:.65}} #current{{fill:#368bb733;stroke:#2685b3;stroke-width:1;fill-rule:evenodd}} #candidates{{fill:#2bab7733;stroke:#23875d;stroke-width:1;fill-rule:evenodd}} #candidates .buffer{{fill:#e7911420;stroke:#ad681a;stroke-dasharray:4 3}} #labels{{fill:#344a63;font-family:system-ui}} [data-id]{{cursor:pointer}} #candidates path.selected{{fill:#f9ce6980!important;stroke:#d17500!important;stroke-width:3!important}} #labels .selected{{fill:#713b07}} </style><g id="current">{''.join(original_paths)}</g><g id="candidates">{''.join(fills)}</g><path id="linework" d="{' '.join(paths)}"/><g id="labels">{''.join(labels)}</g></svg>'''
        filename = f'plans/{i:02d}.svg'
        (out / filename).write_text(svg)
        reason = omitted.get(name, {}).get('reason')
        row = dict(id=name, name=name, building=sheet.get('buildingCode'), drawingFloors=sheet.get('floors', []),
                   viewportEvidence={k:sheet.get(k) for k in ('viewportHandle','status','statusInferred','viewTwistRadians','boundsEncloseRotatedWindow')},
                   bounds=bbox, svg=filename, roomAnchorCount=len(candidates),
                   uniqueRoomNumbers=len({normalize(c['number']) for c in candidates}),
                   existingAnchors=sum(c['status']=='existing' for c in candidates),
                   missingAnchors=sum(c['status']!='existing' for c in candidates),
                   closedCandidates=sum(c['matchMode']=='contains' for c in candidates),
                   nearbyCandidates=sum(c['matchMode']=='buffer' for c in candidates),
                   registrationSections=registered, omissionReason=reason,
                   status='missing-building' if sheet.get('buildingCode') not in buildings else 'registered' if registered else 'needs-registration',
                   candidates=candidates)
        sheets.append(row)
        all_candidates.extend(candidates)
    campus = []
    campus_census = {}
    campus_preview = None
    for drawing in dwgs:
        if 'campus' not in drawing.stem.lower():
            continue
        target = stage / 'campus.dxf'
        if drawing.suffix.lower() == '.dxf':
            shutil.copy2(drawing, target)
        else:
            with (stage/'campus-conversion.log').open('w') as log:
                subprocess.run(['dwgread','-O','DXF','-o',str(target),str(drawing)], check=True, stdout=log, stderr=log)
        campus_doc = ezdxf.readfile(target)
        campus_census = dict(Counter(e.dxf.layer for e in campus_doc.modelspace()))
        campus_paths = []
        campus_points = []
        for entity in campus_doc.modelspace():
            points = recovery.flatten_entity_points(entity, 100)
            if len(points) >= 2:
                campus_points.extend(points)
                color = '#216b89' if 'sidewalk' in entity.dxf.layer else '#856134' if 'trail' in entity.dxf.layer else '#71808a'
                campus_paths.append(f'<path stroke="{color}" d="M' + ' L'.join(f'{x:.3f},{-y:.3f}' for x,y in points) + '"/>')
                if re.search('sidewalk|trail', entity.dxf.layer, re.I):
                    campus.append(dict(id=entity.dxf.handle, layer=entity.dxf.layer, points=points,
                                       evidence='path-edge linework; not a route centreline', routingEligible=False))
        if campus_points:
            xs, ys = zip(*campus_points)
            min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
            (out/'plans/campus.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000" viewBox="{min_x} {-max_y} {max_x-min_x} {max_y-min_y}"><style>path{{vector-effect:non-scaling-stroke}}</style><g fill="none" stroke-width="1">' + ''.join(campus_paths) + '</g></svg>')
            campus_preview = dict(id='campus-reference', name='Campus · sidewalk and trail edges',
                                  svg='plans/campus.svg', candidates=[], roomAnchorCount=0,
                                  existingAnchors=0, missingAnchors=0, status='reference',
                                  omissionReason='Campus drawing coordinates; no indoor/outdoor routing graph is created.')
    write_json(out/'campus-path-edges.json', dict(coordinateSystem='campus-drawing-units', linework=campus, graphEdges=[]))
    report = dict(format='openindoormaps-cad-review', version=1,
                  createdAt=datetime.now(timezone.utc).isoformat(),
                  coordinateSystem='drawing-units', sourceFiles=originals,
                  sourceSha256=original_sha, masterSha256=master_sha,
                  datasetRevision=dataset.get('datasetRevision'),
                  missingBuildings=sorted({s['building'] for s in sheets if s['status']=='missing-building'}),
                  sourceCoverage=rooms.get('sourceCoverage'), registrations=registrations,
                  summary=dict(sheetCount=len(sheets), roomAnchorCount=len(all_candidates),
                               missingAnchors=sum(c['status']!='existing' for c in all_candidates),
                               registeredMissingAnchors=sum(c['status']=='missing-room' for c in all_candidates),
                               closedCandidates=sum(c['matchMode']=='contains' for c in all_candidates),
                               nearbyCandidates=sum(c['matchMode']=='buffer' for c in all_candidates),
                               unassignedAnchors=len(unassigned)),
                  pathwayEvidence=dict(campusLayers=campus_census, edgeLineworkCount=len(campus),
                                       certifiedRouteEdges=0, reason='Sidewalk/trail edges require registration, walkable polygons, door/connector and access review.'),
                  warnings=['Drawing candidates do not certify native walls, floor support, elevations, access or routes.',
                            'Orange nearby matches do not contain their room label; review before importing.',
                            'Mixed-level sheets retain their panel identity; room-number digits are not native floor proof.',
                            'Original source and canonical master unchanged.'],
                  sheets=sheets, campusPreview=campus_preview, unassignedAnchors=unassigned)
    report['evidenceSha256'] = hashlib.sha256(json.dumps(dict(candidates=all_candidates, registrations=registrations), sort_keys=True).encode()).hexdigest()
    write_json(out/'review.json', report)
    write_json(out/'reviter.entities.json', reviter_entities)
    write_json(out/'reviter.catalog.json', dict(sha256=original_sha, sheets=[dict(name=s['name'], bounds=dict(zip(('minX','minY','maxX','maxY'),s['bounds']))) for s in sheets]))
    write_json(out/'room-candidates.json', dict(format='cad-room-candidates', version=1, sourceSha256=original_sha, masterSha256=master_sha, records=all_candidates))
    shutil.copy2(HERE/'floorplan-review.html', out/'index.html')
    (out/'README.txt').write_text('Open index.html through a local web server. Review CAD linework, current geometry and tentative recovered areas per sheet. Export decisions for this chat. No CAD candidate is a repaired Revit enclosure or a certified route.\n\nUse reviter.entities.json and reviter.catalog.json with the sibling register-room-boundaries.ts CLI, against the preserved rooms.json, to reconstruct registered wall references. New buildings still need campus registration and native floor/elevation assignment.\n')
    portable_files = [p for p in out.rglob('*') if p.is_file() and 'stage' not in p.relative_to(out).parts and p.suffix != '.zip' and p.name != 'checksums.json']
    write_json(out/'checksums.json', {str(p.relative_to(out)):digest(p) for p in portable_files})
    bundle = out/'UNBC.floorplan-candidates.zip'
    with zipfile.ZipFile(bundle, 'w', zipfile.ZIP_DEFLATED) as archive:
        for p in [*portable_files,out/'checksums.json']:
            archive.write(p, str(p.relative_to(out)))
    if digest(master) != master_sha or digest(plan) != original_sha:
        raise RuntimeError('An input changed during the scan; discard this comparison and rerun.')
    print(json.dumps(dict(summary=report['summary'], missingBuildings=report['missingBuildings'], bundle=str(bundle)),indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', required=True, type=Path)
    parser.add_argument('--master', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--reuse-stage', action='store_true', help='Reuse recovery produced by this output directory; for local iteration only.')
    build_review(parser.parse_args())
