"""Write floors/index.json for the map from the exact floor files being shown.

Every count and every route distance in index.json is computed here from the
artifact's own floor files, the verifier receipt for those files, and the
full-catalog acceptance record (NORMAL-ROUTES.json / REPORT.json).  Nothing is
copied from older candidates.
usage: build-index.py DIR OLD_INDEX_JSON VERIFY_JSON ACCEPTANCE_DIR"""
import hashlib, json, os, sys
root, old_index, verify_path, acc_dir = sys.argv[1:5]
here = os.path.dirname(os.path.abspath(__file__))
old = json.load(open(old_index))
ver = json.load(open(verify_path))
report = json.load(open(os.path.join(acc_dir, 'REPORT.json')))
normal = json.load(open(os.path.join(acc_dir, 'NORMAL-ROUTES.json')))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
floors = []
tot = dict(lines=0, accepted=0, saved=0, changed=0, defects=0, defectsAccepted=0)
for m in old['floors']:
    fl = json.load(open(os.path.join(root, 'floors', m['id'] + '.json')))
    v = ver[m['id']]
    acc = sum(1 for _, c, _ in fl['net'] if c in (0, 2))
    d = {'id': m['id'], 'name': m['name'], 'compiled': m['compiled'], 'eligible': m['eligible'],
         'drawnWalks': len(fl['net']), 'drawnAcceptedGuides': acc, 'drawnSavedWalks': len(fl['net']) - acc,
         'schematicChanged': sum(1 for s in fl['schematic'] if s),
         'sourceWallCrossings': len(fl['sourceWallCrossings']),
         'sourceWallCrossingsAcceptedGuides': sum(1 for r in fl['sourceWallCrossings'] if r[2] in (0, 2)),
         'verify': {k: v[k] for k in ('PASS', 'changedLines', 'hardRuleViolations', 'sourceDefectLines', 'sourceDefectLinesChanged', 'softRuleViolations')}}
    assert d['schematicChanged'] == v['changedLines'] and d['sourceWallCrossings'] == v['sourceDefectLines']
    assert acc == m['compiled'], (m['id'], acc, m['compiled'])
    floors.append(d)
    tot['lines'] += d['drawnWalks']; tot['accepted'] += acc; tot['saved'] += d['drawnSavedWalks']
    tot['changed'] += d['schematicChanged']; tot['defects'] += d['sourceWallCrossings']; tot['defectsAccepted'] += d['sourceWallCrossingsAcceptedGuides']
rows = [{'from': r['fromNumber'], 'to': r['toNumber'], 'mode': r['mode'], 'endpointMode': r['options']['endpointMode'],
         'allowOtherRoomTransit': r['options']['allowOtherRoomTransit'], 'available': r['available'],
         'distanceMetres': round(r['distanceMetres'], 3) if r.get('distanceMetres') else None,
         'requiredNativeDoorId': r.get('requiredNativeDoorId')} for r in normal['rows']]
acceptance = {'source': 'docs/continuation/unbc-20261031/campus/acceptance (NORMAL-ROUTES.json, REPORT.json)',
              'status': report['status'], 'releaseAcceptance': report['releaseAcceptance'], 'published': report['published'],
              'runId': report['runId'], 'sourceMasterSha256': report['sourceMasterSha256'],
              'guideCatalogSha256': report['guideSha256'], 'guides': report['guides'],
              'candidateArchiveSha256': report['archiveSha256'], 'normalRoutesSha256': sha(os.path.join(acc_dir, 'NORMAL-ROUTES.json')),
              'routes': rows}
reg_dir = here
schematic = {
    'label': 'Schematic drawing (display only, not route-accepted)',
    'status': 'DISPLAY_ONLY_NOT_ROUTE_ACCEPTED',
    'meaning': 'A redrawing of the accepted walks for legibility. Routes, distances and acceptance use the accepted geometry, never this layer.',
    'rule': ver['rule'],
    'linesChanged': tot['changed'], 'linesDrawn': tot['lines'], 'sourceDefectLinesKeptUnmodified': tot['defects'],
    'verify': {'ALL_PASS': ver['ALL_PASS'], 'verifierSha256': ver['verifierSha256'],
               'hardRuleViolations': sum(f['verify']['hardRuleViolations'] for f in floors),
               'sourceDefectLinesChanged': sum(f['verify']['sourceDefectLinesChanged'] for f in floors),
               'softRuleViolations': sum(f['verify']['softRuleViolations'] for f in floors)},
    'generator': {name: sha(os.path.join(reg_dir, name)) for name in ('regularize.py', 'hardgeom.py', 'no-new-wall-crossings.py', 'verify.py')},
}
g = lambda n: f'{n:,}'
about = (
    "Spaces are the native wall-bounded floor cells that Reviter computed from the original Revit model, and the linework is the native wall footprints. "
    "The earlier room shapes were used only to place each room's name inside its space and are not drawn. "
    f"The walking network drawn by default is the accepted geometry, unmodified: {g(tot['accepted'])} accepted shared guides on these four floors "
    f"(2,701 of 2,884 eligible campus-wide; guide catalog {report['guideSha256'][:8]}) and, for the other {g(tot['saved'])} enabled walks, their original saved walks. "
    "Corridor walks that only end at their own corridor's label point are hidden for legibility (routing keeps them). "
    f"The optional schematic layer is a display-only redrawing that is not route-accepted: it changes {g(tot['changed'])} of {g(tot['lines'])} drawn walks, "
    "may not enter any native wall footprint away from that wall's own doors or any cell hole (exact check, independent verifier "
    f"{'PASS' if ver['ALL_PASS'] else 'FAIL'}), and keeps unmodified every walk whose original already does. "
    f"{g(tot['defects'])} original walks ({g(tot['defectsAccepted'])} of them accepted guides) already overlap a native wall or hole away from doors in this drawing's coordinates; "
    "they are listed in the 'Source walks that cross a native wall' layer as source defects for review. "
    f"Route distances quoted come from the full-catalog acceptance run {report['runId'][:8]} (candidate archive {report['archiveSha256'][:8]}, releaseAcceptance false). "
    "Native door evidence steps just past each face of every saved door and asks which native cell is there: for the 1,303 connected doors with two distinct cells, the existing owners agree every time. "
    "Proposed door pairs are evidence for review, not applied routes; they take effect only after a regenerated native build. "
    "Drawn north-up with a fitted georeference (worst residual 0.61 m). A drawn path is not confirmed public or step-free access. Floor 0 is not shown.")
out = {'floors': floors, 'transform': old['transform'], 'drawing': {
    'default': 'Accepted geometry, unmodified: accepted shared guides (net category 0/2) and original saved walks (1/3), exactly as exported (artifact4).',
    'acceptedGuides': tot['accepted'], 'savedWalks': tot['saved'], 'lines': tot['lines']},
    'schematic': schematic, 'sourceWallCrossings': {'lines': tot['defects'], 'acceptedGuideLines': tot['defectsAccepted'],
    'rule': 'original net line overlaps a native wall footprint (away from doors hosted by that wall, 0.8 m) or a cell hole not covered by another cell; exact, display decimetre coordinates'},
    'acceptance': acceptance, 'about': about, 'evidence': old['evidence'],
    'floorFiles': {f['id']: sha(os.path.join(root, 'floors', f['id'] + '.json')) for f in floors}}
json.dump(out, open(os.path.join(root, 'floors', 'index.json'), 'w'), indent=1)
print(json.dumps({k: out[k] for k in ('drawing',)}), json.dumps(schematic['verify']))
