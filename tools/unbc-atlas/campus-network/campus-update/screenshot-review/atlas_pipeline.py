"""Build and validate the five-screenshot atlas against the preceding distributed release."""
from pathlib import Path
import argparse,os,json,subprocess,sys,time
here=Path(__file__).resolve().parent;update=here.parent;campus=update.parent
release=here/os.environ.get('UNBC_SCREEN_RELEASE_DIR','final-release'); audit=release/'audit'; previous=update/'final-checked/audit';old_atlas=update/'final-atlas'
out=here/'atlas';out.mkdir(exist_ok=True);patch=out/'display';shared=update/'atlas'
controls=campus/'hallway-review/release/display'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--physical-only',action='store_true')
parser.add_argument('--watch',action='store_true')
args=parser.parse_args()
env=dict(os.environ,UNBC_ATLAS_RELEASE=release.name,UNBC_ATLAS_RECHECK_LOOPS='1',UNBC_ATLAS_OUTPUT=str(out),
         UNBC_ATLAS_COMPARISON_DIR=str(old_atlas),UNBC_ATLAS_PREVIOUS_AUDIT=str(previous),
         UNBC_CAMPUS_OUTPUT_DIR=str(out),UNBC_CAMPUS_AUDIT_DIR=str(audit),UNBC_CAMPUS_PATCH_DIR=str(patch),
         UNBC_CAMPUS_PREVIOUS_ATLAS=str(old_atlas/'campus-network.html'),UNBC_CAMPUS_ATLAS_EVIDENCE=str(out/'evidence.json'),
         UNBC_ATLAS_EXTRA_FILES='native-stair-caps.csv,native-stair-caps.json,stair-connections.csv,stair-connections.json,screenshot-panel-checks.json,landing-overview-checks.json,physical-level-overview-checks.json,agora-parallel-check.json')
def run(log,cmd):
    print(log,flush=True)
    with (out/log).open('w') as stream:
        subprocess.run(list(map(str,cmd)),cwd=out,env=env,stdout=stream,stderr=subprocess.STDOUT,check=True)
def py(log,script,*args):run(log,[sys.executable,script,*args])
def until(files):
    while not all((release/p).is_file() for p in files):time.sleep(5)
rebind=[controls/'rebind.py','--audit',audit,'--app',release/'openindoormaps','--output',patch]
if args.physical_only or args.watch:
    if args.watch:until(['audit/installed-receipt.json','audit/browser-route-data.json'])
    py('physical.log',*rebind,'--physical-only')
    if args.physical_only:sys.exit(0)
if args.watch:
    until(['map-ready'])
    os.execv(sys.executable,[sys.executable,str(Path(__file__).resolve())])
assert (release/'map-ready').read_text().strip()==json.loads((audit/'installed-receipt.json').read_bytes())['runtimeSha256']
py('rebind.log',*rebind)
py('check-tip.log',shared/'verify-tip.py')
py('agora-parallel.log',here/'check_parallel.py',audit,out/'agora-parallel-check.json')
py('evidence.log',here/'atlas_screens.py','evidence')
py('build.log',campus/'build.py')
py('check-traces.log',shared/'check-traces.py',release)
py('bind-screens.log',here/'atlas_screens.py','attach')
py('check-new-uses.log',controls/'verify-new.py','--audit',audit,'--baseline',previous,'--proof',patch/'rebind-proof.json','--map',out/'campus-network.html','--output',patch/'new-uses-verification.json')
py('check-thresholds.log',controls/'verify-thresholds.py','--audit',audit,'--display',patch,'--map',out/'campus-network.html','--out',patch/'verified-thresholds.json')
run('browser.log',['node',campus/'check-map.cjs',out])
run('stair-map-browser.log',['node',here/'landing-followup/check-stair-map.cjs',out])
run('focus-images.log',['node',here/'capture-screens.cjs'])
py('screenshot-locations.log',here/'contact-sheet.py')
env['UNBC_ATLAS_EXTRA_FILES']+=',screenshot-locations.png,'+','.join(str(p.relative_to(out)) for p in sorted((out/'focus-images').glob('*.png')))
py('overview.log',campus/'overview.py',out)
py('generator.log',here/'generator_archive.py')
env['UNBC_ATLAS_EXTRA_FILES']+=',atlas-generator.zip,source-replay.json'
py('archive.log',shared/'package.py')
print((out/'archive.log').read_text(),end='')
