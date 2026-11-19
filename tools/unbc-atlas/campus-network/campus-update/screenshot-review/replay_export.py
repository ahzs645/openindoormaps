"""Replay the archived public graph and atlas rendering rules using a hash-checked source dataset and walking cache."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--dataset', required=True, type=Path)
    cli.add_argument('--cache', required=True, type=Path)
    args = cli.parse_args()
    root = Path(__file__).resolve().parent
    manifest = json.loads((root/'reproduction.json').read_bytes())
    for name, checksum in manifest['files'].items():
        if sha(root/name) != checksum:
            raise ValueError(f'Source or evidence checksum mismatch for {name}')
    sources = {'dataset':args.dataset, 'cache':args.cache}
    for name, source in sources.items():
        expected = manifest['external'][name]
        if sha(source) != expected['sha256']:
            raise ValueError(f'Expected {name} SHA-256 {expected["sha256"]}')
        target = root/expected['location']
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            try:
                target.symlink_to(source.resolve())
            except OSError:
                shutil.copyfile(source, target)
        elif sha(target) != expected['sha256']:
            raise ValueError(f'Conflicting existing input at {target}')
    campus = root/'campus-network'
    update = campus/'campus-update'
    review = update/'screenshot-review'
    release = review/manifest['release']
    out = review/'atlas'
    env = dict(os.environ, UNBC_CAMPUS_OUTPUT_DIR=str(out), UNBC_CAMPUS_AUDIT_DIR=str(release/'audit'),
               UNBC_CAMPUS_PATCH_DIR=str(out/'display'), UNBC_CAMPUS_PREVIOUS_ATLAS=str(update/'final-atlas/campus-network.html'),
               UNBC_CAMPUS_ATLAS_EVIDENCE=str(out/'evidence.json'), UNBC_ATLAS_RECHECK_LOOPS='1',
               UNBC_SCREEN_RELEASE_DIR=release.name, UNBC_ATLAS_OUTPUT=str(out))
    for script, arguments in ((campus/'build.py',()), (update/'atlas/check-traces.py',(release,)), (review/'atlas_screens.py',('attach',))):
        subprocess.run([sys.executable, str(script), *map(str, arguments)], env=env, check=True)
    result = sha(out/'campus-network.html')
    if result != manifest['expectedAtlasSha256']:
        raise ValueError(f'Reproduced map SHA-256 {result} differs from published HTML')
    for name, checksum in manifest.get('stairReportHashes',{}).items():
        if sha(out/name) != checksum:
            raise ValueError(f'Rebuilt stair report differs from distribution: {name}')
    print(f'Exact HTML match: {result}')


if __name__ == '__main__':
    main()
