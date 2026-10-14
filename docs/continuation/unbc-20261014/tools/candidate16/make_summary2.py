"""Compose RUN/candidate-floors-9/summary.json and PROGRESS.txt from the receipts (light)."""
import json, os, glob, hashlib, sys, collections
RUN = '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009'; C = RUN + '/candidate-floors-9'; D = C + '/data'; C1 = RUN + '/candidate-floors'
os.environ.setdefault('CF_DATA', D); os.environ.setdefault('CF_OUT', C)
sys.path.insert(0, C + '/scripts')
from cfrender import *
J = lambda p: json.load(open(p))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
ex = os.path.exists

comp = J(D + '/compiled-candidate.receipt.json')
der = J(D + '/candidate/receipt.json')
derb = J(D + '/candidate/receipt.upper.json') if ex(D + '/candidate/receipt.upper.json') else {'levels': {}}
rb = J(D + '/rebind-report.json') if ex(D + '/rebind-report.json') else der.get('rebind', {})
tri = J(C + '/triage/flags.json') if ex(C + '/triage/flags.json') else None
jn = J(C + '/junctions/junctions-all.json') if ex(C + '/junctions/junctions-all.json') else None
lv = J(D + '/summary-levels.json') if ex(D + '/summary-levels.json') else {'levels': []}

def mode_at(d):
    m = Mode.__new__(Mode); m.mode = 'x'; m.dir = d; m.rec = {r['key']: r for r in J(d + '/records.json')}; m._lv = {}; return m
modes = {'candidate2': mode_at(D + '/candidate'), 'candidate1': mode_at(C1 + '/data/candidate'), 'published73f7': mode_at(C1 + '/data/before')}
totals = []
for lid, _, name in LEVELS:
    row = {'levelId': lid, 'name': name}
    for k, M in modes.items():
        if M.has(lid): L = M.level(lid); row[k] = {'areas': len(L.regions), 'sqft': round(L.total(), 1), 'multiRoomAreas': sum(1 for g in L.regions if len(L.numbers(g)) >= 2)}
        else: row[k] = None
    totals.append(row)

levels_rec = {**der.get('levels', {}), **derb.get('levels', {})}
failures = {**(der.get('levelFailures') or {}), **(derb.get('levelFailures') or {})}
stacks = {**(der.get('levelFailureStacks') or {}), **(derb.get('levelFailureStacks') or {})}
runtime_refused = (der.get('runtimeRefusedContacts') or []) + (derb.get('runtimeRefusedContacts') or [])

refused = []
for r in comp.get('refusedContacts', []): refused.append({'stage': 'compile', 'input': 'contact repair ' + r['id'], 'levelId': r.get('levelId'), 'reason': r['reason'][:400], 'handling': 'removed after the production guard refused it (bisection), reported here'})
for i in comp.get('refusalIssues', []): refused.append({'stage': 'compile', 'input': i['code'], 'levelId': i.get('levelId'), 'reason': i['message'][:500]})
for r in runtime_refused: refused.append({'stage': 'derive', 'input': 'contact repair ' + r['id'], 'levelId': r.get('levelId'), 'reason': r['reason'][:400]})
for o in der.get('proposalsBound', []):
    if not o.get('applied'): refused.append({'stage': 'derive (partition proposals)', 'input': o['id'], 'levelId': o['levelId'], 'reason': o.get('error') or '; '.join(o.get('errors') or []) or o.get('applyError') or 'not applied'})
for r in rb.get('refusedChanges', []): refused.append({'stage': 'rebind (approved-change set)', 'input': r['id'], 'reason': r['reason']})
cc = comp.get('collectionCounts', {})

summary = {
    'format': 'unbc-candidate-floors-9-summary', 'version': 1, 'at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
    'code': {'heads': comp['heads'], 'clean': not comp['heads']['dirty']['openindoormaps'] and not comp['heads']['dirty']['reviter'], 'node': comp['node']},
    'inputs': {
        'rooms': comp['inputs']['rooms'], 'roomsReceipt': {'path': 'candidate-floors/integration/receipt.json', 'sha256': sha(C1 + '/integration/receipt.json')},
        'validation': {'path': 'candidate-floors/integration/validation.json', 'sha256': sha(C1 + '/integration/validation.json'), 'result': J(C1 + '/integration/validation.json').get('result')},
        'manifest': {'path': 'combined-build/manifest.json', 'sha256': sha(RUN + '/combined-build/manifest.json'), 'round3Pin': '3b4a1f5d'},
        'manifestIntegration': {'path': 'candidate-floors/integration/work/manifest.integration.json', 'sha256': sha(C1 + '/integration/work/manifest.integration.json')},
        'nativeCache': comp['inputs']['nativeCache'], 'physicalDoorSource': comp['inputs']['physicalDoorSource'],
        'before': {'path': 'candidate-floors/data/before', 'dataset': J(C1 + '/data/before/receipt.json')['dataset'], 'levelFailures': J(C1 + '/data/before/receipt.json').get('levelFailures')},
    },
    'compile': {'seconds': comp['seconds'], 'output': comp['output'], 'compileError': comp.get('compileError'), 'routingOff': comp['routingOff'],
                'materialSectionSupplementSha256': comp.get('materialSectionSupplementSha256'), 'collectionCounts': cc, 'issueCounts': comp['issueCounts']},
    'refused': refused,
    'rebind': {'manifest': rb.get('manifest'), 'manifestSha256': rb.get('manifestSha256'), 'approvedChanges': rb.get('approvedChanges'), 'stale': rb.get('stale'),
               'outcomes': [[o['id'], o['outcome']] + ([o.get('reason')] if o['outcome'] == 'needs-review' else []) for o in rb.get('outcomes', [])]},
    'labelAnchorParity': der.get('labelAnchorParity'),
    'proposalsBound': [{k: o.get(k) for k in ('id', 'levelId', 'bound', 'valid', 'applied')} for o in der.get('proposalsBound', [])],
    'derive': {'levels': levels_rec, 'encoderOrOtherFailures': failures, 'failureStacks': stacks, 'encodeTolerantCopyUsed': False},
    'levelTotals': totals,
    'leakAuditV2': None if tri is None else {'counts': tri['counts'], 'regressions': tri['regressions'], 'candidate1FlagsGone': len(tri['candidate1FlagsGone']), 'images': tri.get('images', [])},
    'junctions': None if jn is None else {'counts': jn['counts'], 'countsCandidate1': jn.get('countsCandidate1'), 'countsBefore': jn['countsBefore'],
                                           'byFloor': [{k: r.get(k) for k in ('junction', 'floor', 'status', 'candidate1', 'before', 'viaBuildings', 'evidence')} for r in jn['byFloor']]},
    'versusCandidate1': J(D + '/compare-vs-candidate1.json')['levels'] if ex(D + '/compare-vs-candidate1.json') else None,
    'levelsDetail': lv['levels'],
    'images': sorted(os.path.relpath(p, C) for p in glob.glob(C + '/*.png') + glob.glob(C + '/closeups/*.png')),
}
json.dump(summary, open(C + '/summary.json', 'w'), indent=1, default=str)
print('summary.json', os.path.getsize(C + '/summary.json'))
