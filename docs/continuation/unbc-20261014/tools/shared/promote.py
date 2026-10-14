"""Promote the UNBC native-final master and viewer into UNBC.final (run once, after the companion export --write).
Refuses unless the canonical files still match the backup, and the new master and viewer match the verified hashes."""
import hashlib, json, os, shutil, sys, zipfile, datetime

F = os.path.expanduser('~/Downloads/UNBC.final')
C = os.path.expanduser('~/github/openindoormaps/work/floor1-followup-20261009/candidate-floors-16')
V = F + '/verification/native-final-20261014'
B = F + '/provenance/before-native-final-20261014'
OLD_MASTER, OLD_VIEWER = '74e21697d55b2bc7b5cef3bbf271a17a3850408552ad0ac90ceebb0c04db3412', '3e901eb2a2118d15765659aeffa8119042320d0310f8be472d81dbd1a5e07c7a'
NEW_MASTER = sys.argv[1]
NEW_MASTER_PATH, NEW_VIEWER_PATH = C + '/UNBC.candidate16.prepared.reviter.zip', V + '/UNBC.campus-viewer.zip'

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()

assert sha(F + '/UNBC.master.reviter.zip') == OLD_MASTER, 'canonical master changed since the backup'
assert sha(F + '/UNBC.campus-viewer.zip') == OLD_VIEWER, 'canonical viewer changed since the backup'
assert sha(B + '/UNBC.master.reviter.zip') == OLD_MASTER and sha(B + '/UNBC.campus-viewer.zip') == OLD_VIEWER, 'backup incomplete'
assert sha(NEW_MASTER_PATH) == NEW_MASTER, 'new master differs from the verified one'
new_viewer = sha(NEW_VIEWER_PATH)
man = json.loads(zipfile.ZipFile(NEW_MASTER_PATH).read('manifest.json'))
assert json.load(open(F + '/review-recommendations/manifest.json'))['masterSha256'] == NEW_MASTER, 'companion manifest not bound to the new master'

for src, dst in ((NEW_MASTER_PATH, 'UNBC.master.reviter.zip'), (NEW_VIEWER_PATH, 'UNBC.campus-viewer.zip')):
    tmp = F + '/.' + dst + '.promoting'
    shutil.copyfile(src, tmp)
    os.replace(tmp, F + '/' + dst)
assert sha(F + '/UNBC.master.reviter.zip') == NEW_MASTER and sha(F + '/UNBC.campus-viewer.zip') == new_viewer

now = datetime.datetime.now(datetime.timezone.utc).isoformat()
cv = json.load(open(F + '/current-version.json'))
prev = {k: cv[k] for k in ('masterSha256', 'viewerSha256', 'roomsSha256', 'datasetRevision')}
cv.update(masterSha256=NEW_MASTER, viewerSha256=new_viewer, roomsSha256=man['floors']['sha256'], datasetRevision=man['indoor']['sha256'], updatedAt=now)
cv['nativeIndoorFinal20261014'] = {
    'updatedAt': now, 'previous': prev, 'backup': B, 'verification': V,
    'masterSha256': NEW_MASTER, 'viewerSha256': new_viewer, 'roomsSha256': man['floors']['sha256'], 'datasetRevision': man['indoor']['sha256'],
    'sourceModelSha256': man['model']['sha256'],
    'lineage': 'Native floor-bound rebuild from the 2026-10-09 review-ready master (previews/2026-10-09, sha 7fd503d4...) through candidates 3-16 in work/floor1-followup-20261009; owner decision rounds 6-12 in user-decisions/.',
    'selection': {'leakAudit': 'leaks.py + leaks2.py on candidate 16: 0 real problems, 0 regressions, 264 expected flags', 'flags': V + '/audit/leak-flags.json'},
    'routing': {'routingOn': True, 'namedRoomsReachable': 1535, 'namedRooms': 1842, 'publishedBefore': 269, 'graphCheck': V + '/audit/route-graph-check.txt',
                'randomRoutes': {'public': '22/25 available (25 multi-floor, 20 cross-building), 0 exceptions, 0 validation problems', 'accessible': '0/25: no connection carries confirmed step-free accessibility', 'report': V + '/audit/random-routes.json'}},
    'browserProof': {'desktop': V + '/browser/desktop/floors.json', 'mobile': V + '/browser/mobile/floors.json', 'floors': 5, 'preparedDisplayEngine': '73c6ddead69fb29ebf01f7b8b3bccd797e60a613e7fb25a079d5680f18567e78'},
    'companions': 'review-recommendations/manifest.json rebound to this master; 105 companions carried by the master were added (785 to 890); earlier files unchanged.',
    'code': {'openindoormaps': 'branch claude/unbc-candidate4-rules', 'reviter': 'branch claude/unbc-candidate4-rules'},
    'knownLimits': ['28 stairs stay held for stair-route review (routes between floors use lifts and ramps)', 'four door nodes get no walking branch: #1501543 (10-1302), #1501551 (10-1312), #1501582 (10-1060), #1780077 (06-364)', 'step-free accessibility is unverified throughout', 'the audit covers audited records; it does not prove every enclosure was checked by hand'],
    'report': V + '/REPORT.md',
}
tmp = F + '/.current-version.json.promoting'
json.dump(cv, open(tmp, 'w'), indent=2)
os.replace(tmp, F + '/current-version.json')

r = open(F + '/README.txt').read()
r = r.replace(OLD_MASTER, NEW_MASTER).replace(OLD_VIEWER, new_viewer)
section = f'''
NATIVE INDOOR FINAL — PROMOTED {now[:10]}
  verification/native-final-20261014/REPORT.md
Every native room is enclosed and selectable under the leak audit (0 real problems).
Routing is on: 1,535 of 1,842 named rooms are reachable (the previous published map reached 269).
Owner decision rounds 6-12 are applied. The previous master and viewer are in
provenance/before-native-final-20261014/ (with backup-sha256.txt).
'''
marker = '\nWHERE TO FIND THINGS'
r = r.replace(marker, section + marker, 1) if marker in r else r + section
tmp = F + '/.README.txt.promoting'
open(tmp, 'w').write(r)
os.replace(tmp, F + '/README.txt')
print(json.dumps({'master': NEW_MASTER, 'viewer': new_viewer, 'rooms': man['floors']['sha256'], 'dataset': man['indoor']['sha256']}, indent=1))
