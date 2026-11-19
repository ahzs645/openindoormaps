"""Start the main-based rebuild in the background on Colab (D10, D12).

Same inputs and reviews as the November 17 "A" run, so the result can be
compared with A-UNBC.master.reviter.zip (e5d6ca92...). Only the code differs:
both repositories at branch claude/exciting-brown-u1petk (main plus the
door-owner review and the faster exact arithmetic).
Run with: python3 -I launch.py
"""
import argparse, os, subprocess, time
parser = argparse.ArgumentParser()
parser.add_argument("--optimized", action="store_true", help="Apply the reviewed link before exporting and use two map workers")
args = parser.parse_args()
W = '/content/unbc'; U = '/content/upload'
OIM = f'{W}/openindoormaps'
G = f'{OIM}/docs/continuation/unbc-20261103/gap-patches'
V = f'{OIM}/docs/continuation/unbc-20261116/vestibules/reviews'
env = dict(os.environ, TZ='UTC', NATIVE_WORKERS='1', LANDING_WORKERS='1', PARENT_HEAP_MIB='8192',
           BOUNDARY_PATCH_REVIEW=f'{G}/OWNER-GAP-PATCHES.native-boundary-patches.json',
           BOUNDARY_PATCH_SUPERSESSIONS=f'{G}/CONTACT-REPAIR-SUPERSESSIONS.json',
           APPLIED_BOUNDARY_PATCH_MASTER=f'{U}/applied-gap-patches-73a765e9.zip',
           REVIEW=f'{V}/DOOR-APERTURE-REVIEW.vestibules-c.json',
           NATIVE_DOOR_OWNER_REVIEW=f'{V}/NATIVE-DOOR-OWNER-REVIEW.vestibules.json')
if args.optimized:
    env['EXPLORE_WORKERS'] = os.environ.get('EXPLORE_WORKERS', '2')
    env['REVIEWED_CIRCULATION_LINKS'] = f'{OIM}/docs/continuation/unbc-20261117/main-rebuild/REVIEWED-UNBC-CONNECTIONS.json'
    env['OFFICE_PERMISSION_REVIEW'] = f'{OIM}/docs/continuation/unbc-20261117/main-rebuild/REVIEWED-OFFICE-PERMISSION.json'
    env['INTERDOOR_PASSAGE_REVIEW'] = f'{OIM}/docs/continuation/unbc-20261117/main-rebuild/REVIEWED-SUITE-PASSAGE.json'
    env['ACCESS_DECISION_REVIEW'] = f'{OIM}/docs/continuation/unbc-20261117/main-rebuild/REVIEWED-BOOTH-ACCESS.json'
    env['NATIVE_DOOR_OWNER_REVIEW'] = f'{OIM}/docs/continuation/unbc-20261117/main-rebuild/REVIEWED-PUBLIC-DOOR-OWNERS.json'
p = subprocess.Popen(['bash', f'{OIM}/docs/continuation/unbc-20261021/recompile/run.sh', W],
                     stdout=open(f'{W}/run.out', 'a'), stderr=subprocess.STDOUT, env=env, start_new_session=True)
print('started', p.pid)
time.sleep(30)
print(open(f'{W}/run.out').read()[-1500:])
