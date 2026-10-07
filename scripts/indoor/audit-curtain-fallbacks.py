#!/usr/bin/env python3
"""Read-only audit of exported curtain-host bounds versus persisted native members.

Requires Python 3.10+ and Shapely 2.x in a task-local environment.
Usage:
  python audit-curtain-fallbacks.py MASTER.zip NATIVE_CACHE.json REPORT.json \
    --markdown REPORT.md [--pins PINS.json]
Pin input is a JSON array of {id?, label?, levelId, pointFeet:[x,y]} objects.
No model-specific IDs, pins, buildings, floor limits or acceptance counts are baked in.
This measures fallback evidence; it neither repairs geometry nor admits routes.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import sys
import zipfile
try:
    from shapely.geometry import MultiPoint, Point, Polygon, box
    from shapely.ops import unary_union
    from shapely import make_valid
    from shapely.strtree import STRtree
except ImportError:
    sys.exit("Install Shapely 2.x in a task-local environment: python -m pip install 'shapely>=2,<3'")

PANEL_CATEGORY = -2000170
MULLION_CATEGORY = -2000171
DOOR_CATEGORY = -2000023


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def polygon(rings):
    if not rings or len(rings[0]) < 3:
        return Polygon()
    try:
        return make_valid(Polygon(rings[0], rings[1:]))
    except (TypeError, ValueError):
        return Polygon()


def bounds_rectangle(entry):
    b = entry.get('boundsFeet', {})
    mn, mx = b.get('min', {}), b.get('max', {})
    try:
        if not all(math.isfinite(v) for v in [mn['x'], mn['y'], mx['x'], mx['y']]):
            return Polygon()
        return box(mn['x'], mn['y'], mx['x'], mx['y'])
    except (KeyError, TypeError):
        return Polygon()


def is_native_bounds_rectangle(wall, entry, tolerance=0.001):
    """Require the actual exported polygon, approximate flag and native bounds match."""
    if not wall.get('approximate') or len(wall.get('ringsFeet', [])) != 1:
        return False
    ring = wall['ringsFeet'][0]
    vertices = {(round(p[0], 7), round(p[1], 7)) for p in ring}
    if len(vertices) != 4:
        return False
    native = bounds_rectangle(entry)
    exported = polygon(wall['ringsFeet'])
    if native.is_empty or exported.is_empty or native.area <= 0:
        return False
    if any(abs(a - b) > tolerance for a, b in zip(native.bounds, exported.bounds)):
        return False
    return native.symmetric_difference(exported).area <= max(.002, native.area * 1e-5)


def precise_member_geometry(entry):
    """Only persisted oriented boxes/native loops/solid vertices, never an AABB fallback.

    A convex plan hull is conservative for irregular solids: it can understate
    excess host material, but does not invent a more dramatic phantom rectangle.
    Oriented boxes preserve the exact plan hull for panel and mullion cuboids.
    """
    ob = entry.get('orientedBox')
    if ob and len(ob) >= 4:
        points = [p[:2] for p in ob if len(p) >= 3 and all(math.isfinite(v) for v in p[:3])]
        g = MultiPoint(points).convex_hull if points else Polygon()
        if g.geom_type == 'Polygon' and g.area > 1e-7:
            return g, 'persisted-oriented-box'
    loops = entry.get('loops') or []
    if loops and entry.get('renderGeometryProvenance') == 'native':
        points = [p[:2] for ring in loops for p in ring if len(p) >= 3]
        g = MultiPoint(points).convex_hull if points else Polygon()
        if g.geom_type == 'Polygon' and g.area > 1e-7:
            return g, 'persisted-native-loop-hull'
    points = []
    for solid in entry.get('solids') or []:
        if isinstance(solid, dict):
            vertices = solid.get('vertices') or solid.get('points') or []
            if isinstance(vertices, list):
                points.extend(p[:2] for p in vertices if isinstance(p, list) and len(p) >= 3)
    g = MultiPoint(points).convex_hull if points else Polygon()
    if g.geom_type == 'Polygon' and g.area > 1e-7:
        return g, 'persisted-native-solid-hull'
    return None, None


def bounded_measure(value):
    return round(value, 6) if value is not None and math.isfinite(value) else None


def oriented_measurement(geometry):
    if geometry is None or geometry.is_empty:
        return None
    hull = geometry.convex_hull
    if hull.geom_type != 'Polygon':
        return None
    # Every minimum rectangle is parallel to one convex-hull edge. Project local
    # coordinates on each edge rather than calling a version-sensitive GEOS
    # oriented-envelope routine on almost collinear multipart glazing.
    coordinates = list(hull.exterior.coords)[:-1]
    origin_x, origin_y = coordinates[0]
    points = [(x - origin_x, y - origin_y) for x, y in coordinates]
    best = None
    for a, b in zip(points, points[1:] + points[:1]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        edge_length = math.hypot(dx, dy)
        if edge_length < 1e-12:
            continue
        ux, uy = dx / edge_length, dy / edge_length
        along = [x * ux + y * uy for x, y in points]
        across = [-x * uy + y * ux for x, y in points]
        length = max(along) - min(along)
        width = max(across) - min(across)
        angle = math.degrees(math.atan2(uy, ux))
        if width > length:
            length, width = width, length
            angle += 90
        area = length * width
        if best is None or area < best[0]:
            best = (area, length, width, angle)
    if best is None:
        return None
    area, length, width, angle = best
    axis_angle = angle % 180
    skew = min(axis_angle % 90, 90 - axis_angle % 90)
    return {'longSideFeet': bounded_measure(length), 'shortSideFeet': bounded_measure(width),
            'longAxisDegrees': bounded_measure(axis_angle), 'axisSkewDegrees': bounded_measure(skew),
            'areaSquareFeet': bounded_measure(area)}


def geometry_classification(oriented, dimensions, host_area):
    if oriented is None:
        return 'ambiguous-no-precise-members'
    if min(dimensions) < 1:
        return 'narrow-exported-host'
    if oriented['shortSideFeet'] <= 1.5:
        if oriented['axisSkewDegrees'] >= 5 and host_area / oriented['areaSquareFeet'] >= 2:
            return 'broad-skewed-host-AABB-candidate'
        if oriented['axisSkewDegrees'] < 5:
            return 'aligned-host-thickness-versus-member-width'
    return 'mixed-or-bent-member-assembly-bounds-candidate'


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('master', type=Path)
    p.add_argument('cache', type=Path)
    p.add_argument('report', type=Path)
    p.add_argument('--markdown', type=Path, required=True)
    p.add_argument('--pins', type=Path)
    p.add_argument('--nearby-feet', type=float, default=6)
    args = p.parse_args()
    outputs = [args.report.resolve(), args.markdown.resolve()]
    inputs = [args.master.resolve(), args.cache.resolve()] + ([args.pins.resolve()] if args.pins else [])
    if len(set(outputs)) != 2 or set(outputs) & set(inputs):
        p.error('All output paths must differ from input paths and each other.')
    if not math.isfinite(args.nearby_feet) or args.nearby_feet < 0:
        p.error('--nearby-feet must be finite and nonnegative.')
    before = {str(path.resolve()): sha(path) for path in [args.master, args.cache]}
    with zipfile.ZipFile(args.master) as z:
        data_bytes = z.read('viewer/indoor.json')
        data = json.loads(data_bytes)
    cache = json.loads(args.cache.read_text())
    if cache.get('sourceModelSha256') != data.get('source', {}).get('modelSha256'):
        p.error('Native cache model hash does not match the ZIP; audit refused.')
    native = cache['nativeModel']
    # Bounds may have multiple extracted fragments. A host candidate must use the
    # curtain record; members retain every precise fragment rather than last-write wins.
    by_id = defaultdict(list)
    for e in native.get('elementBounds', []):
        by_id[e['elementId']].append(e)
    hosts = {}
    for e in native.get('elementBounds', []):
        if e.get('wallKind') == 'curtain':
            hosts.setdefault(e['elementId'], e)
    relations = defaultdict(dict)
    for r in native.get('nativeHostRelations', []):
        if r.get('evidence') == 'persisted' and r.get('kind') == 'host':
            relations[r['hostId']][r['elementId']] = r
    materials = {m['elementId']: m for m in native.get('nativeMaterialDefinitions', [])}
    material_ids = defaultdict(set)
    for assignment in native.get('nativeElementMaterialAssignments', []):
        material_ids[assignment['elementId']].add(assignment['materialId'])
    exports = defaultdict(list)
    for w in data.get('walls', []):
        exports[w['nativeElementId']].append(w)
    records = data.get('records', [])
    record_geometries = [polygon(r['ringsFeet']) for r in records]
    room_tree = STRtree(record_geometries)
    slabs = data.get('walkingSupport', {}).get('floors', [])
    slab_geometries = [polygon(f['ringsFeet']) for f in slabs]
    slab_tree = STRtree(slab_geometries)
    levels = {x['id']: x for x in data.get('nativeLevels', [])}
    floor_by_level = defaultdict(list)
    for f in data.get('floors', []):
        for lid in f['levelIds']:
            floor_by_level[lid].append({'id': f['id'], 'name': f['name']})
    rows = []
    for host_id, host in sorted(hosts.items()):
        exported = exports.get(host_id, [])
        matching = [w for w in exported if is_native_bounds_rectangle(w, host)]
        if not matching:
            continue
        host_g = bounds_rectangle(host)
        bounds = host['boundsFeet']
        dimensions = [bounds['max'][axis] - bounds['min'][axis] for axis in ['x', 'y']]
        members = []
        precise = []
        missing_bound_ids = []
        unrecognized_members = []
        for member_id, relation in sorted(relations.get(host_id, {}).items()):
            fragments = by_id.get(member_id, [])
            relevant = [e for e in fragments if e.get('categoryId') in [PANEL_CATEGORY, MULLION_CATEGORY, DOOR_CATEGORY]]
            if not relevant:
                if not fragments:
                    missing_bound_ids.append(member_id)
                else:
                    unrecognized_members.append({'nativeElementId': member_id,
                                                 'categories': sorted({e.get('categoryName') or 'unknown' for e in fragments})})
                continue
            member_parts = []
            origins = []
            for e in relevant:
                g, origin = precise_member_geometry(e)
                if g is not None:
                    member_parts.append(g)
                    origins.append(origin)
            e = relevant[0]
            member_g = unary_union(member_parts) if member_parts else None
            if member_g is not None:
                precise.append(member_g)
            member_materials = []
            for material_id in sorted(material_ids.get(member_id, [])):
                m = materials.get(material_id, {})
                member_materials.append({'id': material_id, 'name': m.get('name'),
                                         'transparency': m.get('appearance', {}).get('transparency'),
                                         'evidence': m.get('evidence')})
            if e.get('categoryId') == DOOR_CATEGORY:
                role = 'native-door'
            elif e.get('categoryId') == MULLION_CATEGORY:
                role = 'frame-mullion'
            elif any((m.get('transparency') or 0) >= .5 for m in member_materials):
                role = 'material-confirmed-transparent-panel'
            elif 'glazing' in (e.get('typeName') or '').lower():
                role = 'type-named-glazing-panel-material-unverified'
            elif member_materials:
                role = 'panel-without-transparent-material-evidence'
            else:
                role = 'panel-material-unknown'
            members.append({
                'nativeElementId': member_id, 'categoryId': e.get('categoryId'),
                'category': e.get('categoryName'), 'typeName': e.get('typeName'),
                'familySymbolId': e.get('familySymbolId'), 'memberRole': role, 'materials': member_materials,
                'hostRelationSource': relation.get('source'), 'hostRelationEvidence': 'persisted',
                'boundsFeet': e.get('boundsFeet'), 'preciseFootprintEvidence': sorted(set(origins)),
                'precisePlanAreaSquareFeet': bounded_measure(member_g.area) if member_g is not None else None,
                'precisePlanGeometry': member_g.__geo_interface__ if member_g is not None else None,
            })
        member_union = unary_union(precise) if precise else None
        member_area = member_union.area if member_union is not None else None
        excess = host_g.difference(member_union) if member_union is not None else None
        excessive_area = excess.area if excess is not None else None
        inflation = host_g.area / member_area if member_area and member_area > 1e-7 else None
        broad = min(dimensions) >= 1 and host_g.area >= 4
        measured_inflation = broad and member_union is not None and inflation >= 2 and excessive_area >= 1
        if measured_inflation:
            finding = 'measured-exported-curtain-host-area-inflation'
        elif not precise:
            finding = 'ambiguous-exported-host-rectangle-no-precise-members'
        elif broad:
            finding = 'exported-host-rectangle-member-discrepancy-below-threshold'
        else:
            finding = 'narrow-or-aligned-exported-host-rectangle'
        oriented = oriented_measurement(member_union)
        geometry_class = geometry_classification(oriented, dimensions, host_g.area)
        missing_precise_ids = [m['nativeElementId'] for m in members if not m['preciseFootprintEvidence']]
        member_complete = not missing_bound_ids and not unrecognized_members and not missing_precise_ids and bool(members)
        panel_bases = [m['boundsFeet']['min']['z'] for m in members if m['categoryId'] == PANEL_CATEGORY and m.get('boundsFeet')]
        door_count = sum(m['categoryId'] == DOOR_CATEGORY for m in members)
        panel_roles = sorted({m['memberRole'] for m in members if m['categoryId'] == PANEL_CATEGORY})
        occurrences = []
        occurrence_seen = set()
        nearby_unique = {}
        intersecting_walking_area = 0
        for wall in matching:
            signature = wall['levelId']
            if signature in occurrence_seen:
                continue
            occurrence_seen.add(signature)
            level = levels.get(wall['levelId'], {})
            elevation = level.get('elevationFeet')
            nearby = []
            for i in room_tree.query(host_g.buffer(args.nearby_feet)):
                r = records[i]
                if r['levelId'] != wall['levelId'] or record_geometries[i].distance(host_g) > args.nearby_feet:
                    continue
                g = record_geometries[i]
                overlap = g.intersection(host_g).area
                phantom_overlap = g.intersection(excess).area if excess is not None else None
                item = {'key': r['key'], 'number': r['number'], 'name': r['name'], 'building': r['building'],
                        'nativeLevelId': r['levelId'], 'elevationFeet': r.get('elevationFeet'),
                        'access': r.get('access'), 'walkable': r.get('walkable'), 'circulation': r.get('circulation'),
                        'sourceDistanceFeet': bounded_measure(g.distance(host_g)),
                        'hostRectangleOverlapSquareFeet': bounded_measure(overlap),
                        'excessHostOverlapSquareFeet': bounded_measure(phantom_overlap)}
                nearby.append(item)
                nearby_unique[r['key']] = item
                if r.get('walkable') and phantom_overlap:
                    intersecting_walking_area += phantom_overlap
            nearby.sort(key=lambda r: (-(r['excessHostOverlapSquareFeet'] or 0), r['sourceDistanceFeet'], r['key']))
            floor_support = []
            for i in slab_tree.query(host_g):
                f = slabs[i]
                if elevation is not None and abs(f['elevationFeet'] - elevation) > .5:
                    continue
                area = slab_geometries[i].intersection(host_g).area
                if area > .001:
                    floor_support.append({'nativeSlabId': f['nativeElementId'], 'elevationFeet': f['elevationFeet'],
                                          'hostRectangleSupportSquareFeet': bounded_measure(area),
                                          'nativeCacheBoundPresent': f['nativeElementId'] in by_id})
            panel_base = min(panel_bases) - elevation if panel_bases and elevation is not None else None
            height_role = 'unresolved-height' if panel_base is None else 'window-sill-above-level' if panel_base > 1 else 'assembly-at-level' if panel_base <= .5 else 'low-sill-assembly'
            occurrences.append({'nativeLevelId': wall['levelId'], 'nativeLevelName': level.get('name'),
                                'nativeElevationFeet': elevation, 'heightRole': height_role,
                                'lowestPanelBaseAboveNativeLevelFeet': bounded_measure(panel_base), 'campusFloors': floor_by_level[wall['levelId']],
                                'exportedKind': wall['kind'], 'exportedApproximate': wall.get('approximate'),
                                'hostBottomRelativeToLevelFeet': bounded_measure(bounds['min']['z'] - elevation) if elevation is not None else None,
                                'hostTopRelativeToLevelFeet': bounded_measure(bounds['max']['z'] - elevation) if elevation is not None else None,
                                'slabSupport': floor_support, 'nearbyRooms': nearby})
        # Severity is a transparent triage score; native cells/route effects need separate review.
        severity = 'high' if measured_inflation and geometry_class == 'broad-skewed-host-AABB-candidate' and excessive_area >= 25 and intersecting_walking_area > 1 else 'medium' if measured_inflation and geometry_class != 'aligned-host-thickness-versus-member-width' else 'needs-evidence' if broad and not member_complete else 'low'
        rows.append({'hostId': host_id, 'finding': finding, 'severity': severity,
                     'geometryClassification': geometry_class, 'memberMinimumRotatedRectangle': oriented,
                     'visibleArtifactIndependentlyVerified': False,
                     'hostHeightFeet': bounded_measure(bounds['max']['z'] - bounds['min']['z']),
                     'tallAssembly': bounds['max']['z'] - bounds['min']['z'] >= 12,
                     'nativeDoorMemberCount': door_count, 'panelRoles': panel_roles,
                     'category': host.get('categoryName'), 'wallKind': host.get('wallKind'), 'nativeTypeId': host.get('typeId'),
                     'nativeBoundsFeet': bounds, 'hostHasOrientedBox': bool(host.get('orientedBox')),
                     'hostHasDecodedSolids': bool(host.get('solids')),
                     'hostSolidRepresentations': sorted({'vertex-solid' if solid.get('vertices') or solid.get('points') else 'analytical-wall-envelope' if solid.get('start') and solid.get('end') else 'unclassified-solid' for solid in host.get('solids') or [] if isinstance(solid, dict)}), 'hostHasNativeLoops': bool(host.get('loops')),
                     'exportedRectanglePlanGeometry': host_g.__geo_interface__,
                     'rectangleDimensionsFeet': [bounded_measure(x) for x in dimensions],
                     'rectangleAreaSquareFeet': bounded_measure(host_g.area),
                     'persistedHostRelationCount': len(relations.get(host_id, {})),
                     'decodedMemberGeometryComplete': member_complete,
                     'automaticReplacementAllowed': False,
                     'missingMemberBoundsIds': missing_bound_ids, 'missingPreciseMemberIds': missing_precise_ids,
                     'unrecognizedMembers': unrecognized_members,
                     'persistedMemberCount': len(members), 'preciseMemberCount': sum(bool(m['preciseFootprintEvidence']) for m in members),
                     'memberCategoryCounts': dict(Counter(m['category'] or 'unknown' for m in members)),
                     'preciseMemberUnionAreaSquareFeet': bounded_measure(member_area),
                     'hostToMemberAreaRatio': bounded_measure(inflation),
                     'excessHostAreaSquareFeet': bounded_measure(excessive_area),
                     'excessHostPlanGeometry': excess.__geo_interface__ if excess is not None else None,
                     'preciseMemberUnionPlanGeometry': member_union.__geo_interface__ if member_union is not None else None,
                     'members': members, 'occurrences': occurrences,
                     'physicalHostCount': 1, 'uniqueNativeLevelOccurrenceCount': len(occurrences),
                     'allNearbyRoomKeys': sorted(nearby_unique),
                     'buildings': sorted({r['building'] for r in nearby_unique.values()}),
                     'proposal': 'For a broad skewed AABB candidate, inspect the actual source and cut-height members before rebuilding a host section. For an aligned thickness discrepancy, first resolve intended host thickness and physical assembly ownership. Preserve glazing/frame, material, sill and native door portals; incomplete membership vetoes automatic replacement.',
                     'caution': 'A host rectangle containing a room or pin is not proof of a door, public access or a traversable opening. This scanner never authorizes host deletion or route changes.'})
    rows.sort(key=lambda r: (0 if r['severity'] == 'high' else 1 if r['severity'] == 'medium' else 2,
                             -(r['excessHostAreaSquareFeet'] or 0), r['hostId']))
    pin_matches = []
    if args.pins:
        pins = json.loads(args.pins.read_text())
        if not isinstance(pins, list):
            p.error('--pins must contain a JSON array.')
        for pin in pins:
            point = pin.get('pointFeet')
            if not isinstance(point, list) or len(point) != 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in point):
                p.error('Each pin must have two finite pointFeet coordinates.')
            matches = [r['hostId'] for r in rows if polygon([list(r['exportedRectanglePlanGeometry']['coordinates'][0])]).covers(Point(point)) and any(o['nativeLevelId'] == pin.get('levelId') for o in r['occurrences'])]
            pin_matches.append({'id': pin.get('id'), 'label': pin.get('label'), 'levelId': pin.get('levelId'), 'pointFeet': point, 'hostIds': matches})
    after = {str(path.resolve()): sha(path) for path in [args.master, args.cache]}
    if after != before:
        sys.exit('Input hash changed during audit; output refused. Reconcile the changed source and rerun.')
    measured_rows = [r for r in rows if r['finding'] == 'measured-exported-curtain-host-area-inflation']
    summary = {'nativeCurtainHostCount': len(hosts), 'uniqueExportedBoundsRectangleHosts': len(rows),
               'measuredInflatedRectangleHosts': len(measured_rows),
               'measuredNativeLevelOccurrences': sum(r['uniqueNativeLevelOccurrenceCount'] for r in measured_rows),
               'geometryClasses': dict(Counter(r['geometryClassification'] for r in measured_rows)),
               'geometryClassesWithCompleteMembership': dict(Counter(r['geometryClassification'] for r in measured_rows if r['decodedMemberGeometryComplete'])),
               'measuredHeightRolePhysicalHostCounts': dict(Counter(role for r in measured_rows for role in {o['heightRole'] for o in r['occurrences']})),
               'measuredHostsWithNativeDoorMembers': sum(r['nativeDoorMemberCount'] > 0 for r in measured_rows),
               'measuredTallAssemblyHosts': sum(r['tallAssembly'] for r in measured_rows),
               'measuredHostsWithTransparentMaterialPanels': sum('material-confirmed-transparent-panel' in r['panelRoles'] for r in measured_rows),
               'membershipIncompleteMeasuredHosts': sum(not r['decodedMemberGeometryComplete'] for r in measured_rows),
               'measuredUnknownBuildingHosts': sum(not r['buildings'] for r in measured_rows),
               'measuredMultiBuildingHosts': sum(len(r['buildings']) > 1 for r in measured_rows),
               'findings': dict(Counter(r['finding'] for r in rows)), 'severity': dict(Counter(r['severity'] for r in rows)),
               'measuredByAttributedBuilding': dict(Counter(b for r in measured_rows for b in r['buildings'])),
               'measuredNativeLevels': sorted({o['nativeLevelId'] for r in measured_rows for o in r['occurrences']}),
               'measuredCampusFloors': sorted({f['name'] for r in measured_rows for o in r['occurrences'] for f in o['campusFloors']}),
               'physicalHostDeduplication': 'One hostId per row and one occurrence per native level; repeated exports never add physical hosts.',
               'summaryCountingNotes': 'Building attribution can overlap for a host near two buildings. Height-role counts can overlap because one tall assembly can start at one level and act as a window at another.',
               'pinsChecked': len(pin_matches), 'pinsMatched': sum(bool(p['hostIds']) for p in pin_matches)}
    report = {'format': 'openindoormaps-curtain-host-fallback-audit', 'version': 1,
              'input': str(args.master.resolve()), 'nativeCache': str(args.cache.resolve()),
              'sourceModelSha256': cache['sourceModelSha256'], 'archiveSha256': before[str(args.master.resolve())],
              'nativeCacheSha256': before[str(args.cache.resolve())], 'datasetBytesSha256': hashlib.sha256(data_bytes).hexdigest(),
              'thresholds': {'geometryClassificationSkewDegrees': 5, 'thinMemberOrientedEnvelopeFeet': 1.5, 'boundsMatchFeet': .001, 'minimumCoarseShortSideFeet': 1, 'minimumRectangleAreaSquareFeet': 4,
                             'minimumInflationRatio': 2, 'minimumExcessAreaSquareFeet': 1, 'nearbyFeet': args.nearby_feet},
              'summary': summary, 'unchanged': {'archive': True, 'nativeCache': True}, 'pins': pin_matches, 'hosts': rows,
              'limitations': ['Measurements are plan projections of persisted members over their full native heights, not a height-slice route certificate.',
                              'Precise footprint hulls conservatively include the complete oriented member; irregular solids can understate inflation.',
                              'Decoded persisted membership completeness does not certify that every original RVT member was extracted. Missing precise members veto automatic replacement.',
                              'Aligned nominal host thickness versus thinner glazing often yields a large area ratio without a skewed square/diamond artifact.',
                              'No finding is independently certified as a visible artifact by this plan scan. Source-model and visitor-mode inspection remains necessary.',
                              'Nearby room overlap measures current source/native record contours, not a reviewed access or enclosure boundary.']}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    md = ['# Curtain-host fallback audit', '',
          f"**{len(measured_rows)} physical curtain hosts have measured exported plan-area inflation versus their precise members**, across {summary['measuredNativeLevelOccurrences']} native-level occurrences. {len(rows)} unique exported host rectangles were examined; {len(hosts)} native curtain hosts were indexed.", '',
          'A measured inflation finding requires the actual approximate exported polygon to match the native host AABB and persisted precise member geometry to demonstrate at least 2× plan-area inflation. It does not authorize deleting the host, removing glazing, opening a route or changing access.', '',
          'These are measurements, not certified visible defects. Broad skewed AABB candidates are separated from aligned host thickness and mixed assemblies. Unknown building attribution is listed separately; nearby labels do not establish ownership.', '',
          'Physical hosts are deduplicated by native ID; repeated floors appear as occurrences. Nearby-room and native slab evidence remains in the JSON report.', '',
          f"Archive SHA-256: `{report['archiveSha256']}`. Native cache model hash: `{report['sourceModelSha256']}`. Both input hashes were checked before and after; no input changed.", '',
          '## Summary', '',
          '```json', json.dumps(summary, indent=2), '```', '',
          '## Measured inflated host rectangles', '',
          '| Host | Geometry class | Severity | Buildings | Native levels | Rectangle sq ft | Member union sq ft | Area ratio | Nearby rooms |',
          '|---|---|---|---|---|---|---|---|---|']
    for r in measured_rows:
        nearby = []
        for o in r['occurrences']:
            for room in o['nearbyRooms']:
                if room['number'] and room['number'] not in nearby:
                    nearby.append(room['number'])
        md.append(f"| {r['hostId']} | {r['geometryClassification']} | {r['severity']} | {', '.join(r['buildings']) or 'Unknown'} | {', '.join(str(o['nativeLevelId']) for o in r['occurrences'])} | {r['rectangleAreaSquareFeet']:.2f} | {r['preciseMemberUnionAreaSquareFeet']:.2f} | {r['hostToMemberAreaRatio']:.2f}× | {', '.join(nearby[:8])} |")
    md += ['', '## Other exported rectangles', '', '| Finding | Host count |', '|---|---|']
    for finding, count in summary['findings'].items():
        if finding != 'measured-exported-curtain-host-area-inflation':
            md.append(f'| {finding} | {count} |')
    if pin_matches:
        md += ['', '## Supplied pins', '', '| Pin | Native level | Host IDs |', '|---|---|---|']
        for pin in pin_matches:
            md.append(f"| {pin['label'] or pin['id'] or 'Pin'} | {pin['levelId']} | {', '.join(map(str, pin['hostIds'])) or 'None'} |")
    md += ['', '## Proposed correction and validation', '',
           'Recover host geometry from persisted panel/mullion/door relationships, category and height. Preserve real glass/frame barriers and native portals. Apply the same corrected host evidence in display and routing; do not hide a renderer rectangle while leaving a phantom navigation barrier.', '',
           'Review high-severity overlap against the source model, door/frame evidence, slab holes and restricted areas. A display/window classification is not permission to walk through a facade. Test affected room and corridor approaches, ordinary/native-height rooms and several desktop/mobile zooms before promoting a candidate master.', '',
           '## Repeat the audit', '', '```sh',
           "python -m venv /path/to/task-venv", "/path/to/task-venv/bin/pip install 'shapely>=2,<3'",
           '/path/to/task-venv/bin/python scripts/indoor/audit-curtain-fallbacks.py /path/to/master.zip /path/to/native-cache.json /path/to/report.json --markdown /path/to/report.md --pins /path/to/pins.json',
           '```', '',
           'Omit `--pins` for a whole-model scan without selected locations. The script has no model-specific acceptance targets or hardcoded pin/host IDs.', '',
           'Entry points for a source correction: sibling Reviter `native-architectural-geometry.ts`, curtain host/member recovery, `native-room-presentation.ts`, and shared circulation barrier generation. This audit itself changes no geometry.', '',
           '## Limits', '', *['- ' + l for l in report['limitations']]]
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.write_text('\n'.join(md) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
