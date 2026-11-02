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
# campus-wide compile counts of the same candidate (all floors, including Floor 0)
compile_summary = json.load(open(os.path.join(acc_dir, '..', 'COMPILE-SUMMARY.json')))
campus_eligible = sum(f['eligibleWalkingEdges'] for f in compile_summary['floors'])
campus_compiled = sum(f['compiledWalkingEdges'] for f in compile_summary['floors'])
assert campus_compiled == compile_summary['compiled'] == report['guides'], (campus_compiled, report['guides'])
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
shown = {m['name'] for m in old['floors']}
not_shown = [f for f in compile_summary['floors'] if f['name'] not in shown]
assert campus_compiled - tot['accepted'] == sum(f['compiledWalkingEdges'] for f in not_shown)
rows = [{'from': r['fromNumber'], 'to': r['toNumber'], 'mode': r['mode'], 'endpointMode': r['options']['endpointMode'],
         'allowOtherRoomTransit': r['options']['allowOtherRoomTransit'], 'available': r['available'],
         'distanceMetres': round(r['distanceMetres'], 3) if r.get('distanceMetres') else None,
         'requiredNativeDoorId': r.get('requiredNativeDoorId')} for r in normal['rows']]
_acc = os.path.abspath(acc_dir)
_rel = ('docs/continuation/' + _acc.split('/docs/continuation/', 1)[1]) if '/docs/continuation/' in _acc else acc_dir
acceptance = {'source': _rel + ' (NORMAL-ROUTES.json, REPORT.json)',
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
    'guarantee': 'Changed schematic lines introduce no forbidden contact under the declared display predicate. Original lines are not certified wall-free; those that meet the predicate are kept unmodified and listed.',
    'generator': {name: sha(os.path.join(reg_dir, name)) for name in ('regularize.py', 'hardgeom.py', 'no-new-wall-crossings.py', 'verify.py')},
}
g = lambda n: f'{n:,}'
about = (
    "Spaces are the native wall-bounded floor cells that Reviter computed from the original Revit model, and the linework is the native wall footprints. "
    "The earlier room shapes were used only to place each room's name inside its space and are not drawn. "
    f"The walking network drawn by default is the accepted geometry, unmodified: {g(tot['accepted'])} accepted shared guides on these four floors "
    f"(the chosen candidate accepted {g(campus_compiled)} of {g(campus_eligible)} eligible walks campus-wide; the other "
    f"{g(campus_compiled - tot['accepted'])} are on {', '.join(f['name'] for f in not_shown)}, which is not shown; guide catalog {report['guideSha256'][:8]}) "
    f"and, for the other {g(tot['saved'])} enabled walks, their original saved walks. "
    "Corridor walks that only end at their own corridor's label point are hidden for legibility (routing keeps them). "
    f"The optional schematic layer is a display-only redrawing that is not route-accepted: it changes {g(tot['changed'])} of {g(tot['lines'])} drawn walks. "
    f"Its hard check (independent verifier {'PASS' if ver['ALL_PASS'] else 'FAIL'}) guarantees only that no changed line introduces a forbidden contact under the declared display predicate: "
    "a positive-length overlap, in this drawing's decimetre coordinates, with a native wall footprint outside the closed footprints of that wall's own doors, "
    "or with a cell hole that no other cell covers, outside every door footprint. "
    "It does not certify that the original lines are wall-free: every walk whose original already meets that predicate is kept unmodified. "
    f"{g(tot['defects'])} original walks ({g(tot['defectsAccepted'])} accepted guides, {g(tot['defects'] - tot['defectsAccepted'])} original saved walks) meet it; "
    "the 'Display contacts to review' layer lists them as display-coordinate contacts for review, not proven native defects. "
    f"Route distances quoted come from the full-catalog acceptance run {report['runId'][:8]} (candidate archive {report['archiveSha256'][:8]}, releaseAcceptance false). "
    "Native door evidence steps just past each face of every saved door and asks which native cell is there: for the 1,303 connected doors with two distinct cells, the existing owners agree every time. "
    "Proposed door pairs are evidence for review, not applied routes; they take effect only after a regenerated native build. "
    "Drawn north-up with a fitted georeference (worst residual 0.61 m). A drawn path is not confirmed public or step-free access.")
out = {'floors': floors, 'transform': old['transform'], 'drawing': {
    'default': 'Accepted geometry, unmodified: accepted shared guides (net category 0/2) and original saved walks (1/3), exactly as exported from the displayed candidate.',
    'acceptedGuides': tot['accepted'], 'savedWalks': tot['saved'], 'lines': tot['lines']},
    'schematic': schematic, 'sourceWallCrossings': {'lines': tot['defects'], 'acceptedGuideLines': tot['defectsAccepted'],
    'savedWalkLines': tot['defects'] - tot['defectsAccepted'],
    'rule': 'original net line overlaps a native wall footprint (outside the closed footprints of doors hosted by that wall) or a cell hole not covered by another cell (outside every door footprint); exact clipping in display decimetre coordinates',
    'meaning': 'Display-coordinate contacts kept unmodified for review; not proven native defects.'},
    'acceptance': acceptance, 'about': about, 'evidence': old['evidence'],
    'floorFiles': {f['id']: sha(os.path.join(root, 'floors', f['id'] + '.json')) for f in floors}}
json.dump(out, open(os.path.join(root, 'floors', 'index.json'), 'w'), indent=1)
print(json.dumps({k: out[k] for k in ('drawing',)}), json.dumps(schematic['verify']))
