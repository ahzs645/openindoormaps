#!/usr/bin/env python3
"""Pair a published visitor with both exact source trees and honest completeness.
No geometry compilation, tokens, dependency folders or private Git config.
"""
import argparse, datetime, hashlib, json, lzma, os, shutil, subprocess, tarfile, tempfile
from pathlib import Path

PART = 20 * 1024 * 1024
BUDGET = 256 * 1024 * 1024

def sha(data): return hashlib.sha256(data).hexdigest()
def file_sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()
def git(root, *args): return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()
def write_json(path, value): path.write_text(json.dumps(value, indent=2) + '\n')
def canonical_sha(value): return sha(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())

def verify(site, roots):
    for name, source in roots.items():
        assert not git(source, 'status', '--porcelain'), f'Uncommitted {name} source changes; recreate the snapshot'
    root = site / 'dist'; d = json.loads((root / 'data/unbc-development/manifest.json').read_text()); v = json.loads((root / 'data/unbc-full/project.json').read_text())
    assert d['viewer']['sha256'] == v['sha256'] and d['viewer']['bytes'] == v['bytes'], 'Development/viewer release mismatch'
    viewer = hashlib.sha256(); size = 0
    for part in v['parts']:
        path = root / 'data/unbc-full' / part['path']; assert part['path'] == 'parts/' + part['sha256'] + '.bin'
        assert path.stat().st_size == part['bytes'] and file_sha(path) == part['sha256']; viewer.update(path.read_bytes()); size += part['bytes']
    assert viewer.hexdigest() == v['sha256'] and size == v['bytes']
    assert not d['nativeRebuildReady'] and d['missingInputs'], 'Missing native evidence must be declared'
    for repo in d['repositories']:
        assert git(roots[repo['name']], 'rev-parse', 'HEAD') == repo['commit'], 'Source HEAD changed after development snapshot'
        digest = hashlib.sha256(); total = 0
        for part in repo['parts']:
            assert part['path'] == 'parts/' + part['sha256'] + '.bin'
            path = root / 'data/unbc-development' / part['path']; assert path.stat().st_size == part['bytes'] and file_sha(path) == part['sha256']
            digest.update(path.read_bytes()); total += part['bytes']
        assert digest.hexdigest() == repo['sha256'] and total == repo['bytes']
    total = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
    assert total <= BUDGET, f'Static hosting budget exceeded: {total} > {BUDGET}'
    assert all(p.stat().st_size <= 25*1024*1024 for p in root.rglob('*') if p.is_file()), 'Static file exceeds hosting limit'
    return {'status':'paired-release-verified','releaseId':d['releaseId'],'staticBytes':total,'nativeRebuildReady':False,'viewerSha256':v['sha256'],'repositories':{r['name']:r['commit'] for r in d['repositories']}}

def main():
    a = argparse.ArgumentParser(); a.add_argument('--site-root',type=Path,required=True); a.add_argument('--openindoormaps-root',type=Path,default=Path(__file__).resolve().parents[2]); a.add_argument('--reviter-root',type=Path,required=True); a.add_argument('--cache',type=Path,required=True); a.add_argument('--verify-only',action='store_true'); a.add_argument('--gzip-only-progressive',action='store_true'); a.add_argument('--archive',type=Path)
    args=a.parse_args(); site=args.site_root.resolve(); roots={'openindoormaps':args.openindoormaps_root.resolve(),'reviter':args.reviter_root.resolve()}
    if not args.verify_only:
        for name,root in roots.items():
            assert not git(root,'status','--porcelain'), f'Commit {name} changes before making a development snapshot'
        dest=site/'dist/data/unbc-development'; dest.mkdir(parents=True,exist_ok=True); (dest/'parts').mkdir(exist_ok=True); args.cache.mkdir(parents=True,exist_ok=True)
        viewer=json.loads((site/'dist/data/unbc-full/project.json').read_text()); repos=[]; used=set()
        for name,root in roots.items():
            commit=git(root,'rev-parse','HEAD'); cached=args.cache/f'{name}.{commit}.source.tar.xz'
            # Tracked source only: Git config, credential files outside the tree,
            # node_modules and scratch caches cannot enter this archive.
            tracked=git(root,'ls-files').splitlines()
            assert not any(Path(x).name in {'.env','id_rsa','credentials.json'} for x in tracked), 'Unexpected credential file tracked in source'
            if not cached.exists():
                temporary=cached.with_suffix('.tmp'); proc=subprocess.Popen(['git','-C',str(root),'archive','--format=tar',commit],stdout=subprocess.PIPE)
                with lzma.open(temporary,'wb',preset=8) as out: shutil.copyfileobj(proc.stdout,out,1024*1024)
                proc.stdout.close(); assert proc.wait()==0; temporary.replace(cached)
            parts=[]
            with cached.open('rb') as f:
                for block in iter(lambda:f.read(PART),b''):
                    digest=sha(block); path='parts/'+digest+'.bin'; target=dest/path
                    if not target.exists():target.write_bytes(block)
                    else:assert file_sha(target)==digest
                    used.add(path);parts.append({'path':path,'sha256':digest,'bytes':len(block)})
            repos.append({'name':name,'commit':commit,'branch':git(root,'branch','--show-current'),'repositoryUrl':f'https://github.com/ahzs645/{name}','sha256':file_sha(cached),'bytes':cached.stat().st_size,'parts':parts})
        release=repos[0]['commit'][:12]
        missing=[
          {'name':'Latest reviewed authoring archive','sha256':'24119b663b78afc8250ceeefd13f5a0854a3c94a29f0d566d97961bd5f375253','reason':'UNBC-data-handoff-20261017.tar.gz (1,271,906,669 bytes) was created previously but is absent from this workspace. Its newer master/review evidence is not in the visitor ZIP.'},
          {'name':'Original UNBC RVT','sha256':'8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178','reason':'The current visitor ZIP names this model but does not contain its bytes. The historical October 14 authoring master in Drive is a recovery reference, not the latest reviewed master.'},
          {'name':'Enriched native cache and failed-build checkpoints','sha256':'5bf0e31bf51bcf72fc05ccd7ba3c344027f39098c6c422a8d89ee7f7243d5339','reason':'The 407,909,023-byte enriched native cache and nine physical checkpoints are absent. Restore the failed-run context or regenerate supported evidence from the original model; preserve the two lost-arrival guard failures.'}
        ]
        readme='''# UNBC portable development snapshot

This snapshot contains both complete tracked source trees, the exact published visitor ZIP, checksums and restore.py. It supports viewer/application development in another workspace. It is NOT a complete native-authoring/rebuild backup: see missingInputs in RELEASE.json.

Restore with Python 3.12+: `python3 restore.py`. It verifies both source archives and the visitor before extracting adjacent `workspace/openindoormaps` and `workspace/reviter` folders. Install Node >=20.19, run `npm ci` in both repositories, then use the OpenIndoorMaps dev server and import `workspace/data/UNBC.campus-viewer.zip`. Dependency downloads require network access. Source archives include committed code, tests, documentation and checked-in assets, but not Git history, node_modules, credentials or scratch caches.

Read workspace/openindoormaps/AGENTS.md and docs/continuation/unbc-20261017/pathway-repairs/README.md. Source branches and exact commits are in RELEASE.json; current development is not merged main. To restore Git history, clone the public repositories and check out those commits instead of using the source-tree extraction.

Original data recovery reference: https://drive.google.com/file/d/11I2soDO6XbFvtKPtJ_OYvv6sxhd4FPUv/view . This is the historical October 14 authoring master (289,031,229 bytes, SHA-256 13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520), not the missing newer handoff archive. Do not substitute it silently for the failed source rebuild. The current visitor is a derived four-entry package; it omits the RVT, canonical authoring rooms and review companions.

All 28 full stair links remain held. Display geometry and source-topology reports do not approve physical clearance, access or step-free routes. Continue the targeted repair loop; preserve both lost admitted arrivals rather than waiving their assertion.
'''
        restore='''import hashlib,json,tarfile,shutil
from pathlib import Path
root=Path(__file__).resolve().parent
release=json.loads((root/'RELEASE.json').read_text())
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
if not hasattr(tarfile,'data_filter'):raise RuntimeError('Use Python 3.12 or newer.')
for repo in release['repositories']:
 p=root/'sources'/(repo['name']+'.source.tar.xz')
 assert p.stat().st_size==repo['bytes'] and digest(p)==repo['sha256'],'Source checksum mismatch'
viewer=root/'data/UNBC.campus-viewer.zip'
assert viewer.stat().st_size==release['viewer']['bytes'] and digest(viewer)==release['viewer']['sha256'],'Visitor checksum mismatch'
work=root/'workspace'
assert not work.exists(),'Use a fresh directory; workspace already exists'
work.mkdir()
for repo in release['repositories']:
 dest=work/repo['name'];dest.mkdir()
 with tarfile.open(root/'sources'/(repo['name']+'.source.tar.xz'),'r:xz') as archive:archive.extractall(dest,filter='data')
(work/'data').mkdir();shutil.copyfile(viewer,work/'data/UNBC.campus-viewer.zip')
(work/'RELEASE.json').write_text(json.dumps(release,indent=2))
print('Source trees and published visitor restored. Native authoring inputs remain incomplete; read README.md.')
'''
        snapshot={'format':'openindoormaps-development-v1','version':1,'releaseId':release,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'fileName':f'UNBC.development-{release}.zip','viewer':{'manifestPath':'/data/unbc-full/project.json','sha256':viewer['sha256'],'bytes':viewer['bytes']},'repositories':repos,'nativeRebuildReady':False,'missingInputs':missing,'readme':readme,'restoreScript':restore}
        write_json(dest/'manifest.json',snapshot)
        for p in (dest/'parts').glob('*.bin'):
            if 'parts/'+p.name not in used:p.unlink()
        viewer['developmentSnapshot']='/data/unbc-development/manifest.json';write_json(site/'dist/data/unbc-full/project.json',viewer)
        if args.gzip_only_progressive:
            path=site/'dist/data/unbc/manifest.json'
            if path.exists():
                old=json.loads(path.read_text()); before=json.dumps(old['provenance'],sort_keys=True); removed=0
                for asset in old['assets'].values():
                    assert any(x['encoding']=='gzip' for x in asset['representations'])
                    keep=[]
                    for rep in asset['representations']:
                        if rep['encoding']!='br':keep.append(rep);continue
                        p=path.parent/rep['path'];assert p.stat().st_size==rep['bytes'] and file_sha(p)==rep['sha256'];removed+=p.stat().st_size;p.unlink()
                    asset['representations']=keep
                old.pop('revisionSha256');old['revisionSha256']=canonical_sha(old);assert json.dumps(old['provenance'],sort_keys=True)==before;write_json(path,old)
                write_json(dest/'compression-report.json',{'removedRawBrotliBytes':removed,'logicalAssetsUnchanged':True,'provenanceUnchanged':True,'note':'Retain gzip alternatives; original historical engine identity is not relabeled.'})
    result=verify(site,roots)
    if args.archive:
        with tarfile.open(args.archive,'w') as tar:
            tar.add(site/'.openai/hosting.json',arcname='.openai/hosting.json');tar.add(site/'dist',arcname='dist')
        result['archive']=str(args.archive.resolve())
    print(json.dumps(result))
if __name__=='__main__':main()
