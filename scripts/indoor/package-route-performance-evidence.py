#!/usr/bin/env python3
"""Archive a completed normal/actual-worker experiment, never release approval.

Both closure manifests must be computed in the immutable tested source tree.
The publisher closure is optional only for historical evidence; its absence is
recorded explicitly. The full portable application/native backup is separate.
"""
import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def check(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-root', required=True, type=Path)
    p.add_argument('--normal', required=True, type=Path)
    p.add_argument('--worker', required=True, type=Path)
    p.add_argument('--progressive-worker', type=Path)
    p.add_argument('--publisher-closure', type=Path)
    p.add_argument('--output', required=True, type=Path)
    args = p.parse_args()
    root, normal, worker, output = (v.resolve() for v in
        (args.source_root, args.normal, args.worker, args.output))
    if output.exists():
        raise ValueError('Refusing to replace frozen evidence')
    proof = json.loads((normal / 'proof.json').read_bytes())
    report = json.loads((worker / 'report.json').read_bytes())
    closure = json.loads((normal / 'runtime-closure.json').read_bytes())
    receipt = proof['receipt']
    check(proof['passed'] and proof['normalPhysicalValidationRepeated'], 'Normal validation did not pass')
    check(proof['sourceDatasetUnchanged'] and not proof['published'], 'Source changed or proof is not inert')
    check(report['passed'] and not report['published'], 'Actual worker parity did not pass')
    check(len(report['results']) >= proof['freshNormalRouteCases'], 'Incomplete actual worker cases')
    check(all(row['exactPreviousNormalRouteMatches'] for row in report['results']), 'A worker result differs')
    check(report['proofSha256'] == sha(normal / 'proof.json'), 'Worker used a different normal proof')
    check(report['receipt'] == receipt, 'Worker used a different carrier receipt')
    check(closure['sha256'] == receipt['runtimeSha256'], 'Normal runtime closure differs')
    check(hashlib.sha256(json.dumps(
        ['published-route-runtime-v1', closure['modules']],
        separators=(',', ':'), ensure_ascii=False,
    ).encode()).hexdigest() == closure['sha256'], 'Runtime closure checksum differs')
    check(report['bundleSha256'] == sha(worker / 'production-route-worker.mjs'), 'Worker bundle changed')
    for name, key in (
        ('route-cases.json', 'routeCasesSha256'),
        ('normal-route-results.json', 'normalRouteResultsSha256'),
        ('normal-progressive-route-results.json', 'normalProgressiveRouteResultsSha256'),
    ):
        if key in proof:
            check(sha(normal / name) == proof[key], f'Normal reference changed: {name}')
    progressive = None
    if args.progressive_worker:
        progressive = args.progressive_worker.resolve()
        delivered = json.loads((progressive / 'report.json').read_bytes())
        check(delivered['passed'] and not delivered['published'], 'Delivered visitor worker failed')
        check(delivered['kind'] == 'actual-progressive-worker-checked-delivery-v1', 'Wrong delivered worker')
        check(delivered['proofSha256'] == sha(normal / 'proof.json'), 'Delivered worker used a different normal proof')
        check(delivered['receipt'] == receipt, 'Delivered worker used a different carrier receipt')
        check(len(delivered['results']) == proof['freshNormalRouteCases'], 'Incomplete delivered worker cases')
        check(all(row['exactNormalRouteSummaryInstructions'] for row in delivered['results']), 'Delivered route or instructions differ')
        check(delivered['bundleSha256'] == sha(progressive / 'production-route-worker.mjs'), 'Delivered worker bundle changed')
    carrier = normal / Path(receipt['url']).name
    check(sha(carrier) == receipt['compressedSha256'], 'Compressed carrier changed')
    check(carrier.stat().st_size == receipt['compressedBytes'], 'Compressed carrier length differs')
    logical = gzip.decompress(carrier.read_bytes())
    check(len(logical) == receipt['logicalBytes'], 'Logical carrier length differs')
    check(hashlib.sha256(logical).hexdigest() == receipt['logicalSha256'], 'Logical carrier changed')
    del logical
    files = {}

    def add(path, name):
        if path.is_symlink() or not path.is_file():
            raise ValueError(f'Not an ordinary evidence file: {path}')
        previous = files.get(name)
        if previous and previous != path:
            raise ValueError(f'Archive name collision: {name}')
        files[name] = path

    def tree(directory, prefix):
        for path in sorted(directory.rglob('*')):
            if path.is_symlink():
                raise ValueError(f'Symlink in evidence directory: {path}')
            if path.is_file():
                add(path, prefix + '/' + path.relative_to(directory).as_posix())

    tree(normal, 'normal')
    tree(worker, 'worker')
    if progressive:
        tree(progressive, 'progressive-worker')
    add(Path(__file__).resolve(), 'metadata/package-route-performance-evidence.py')
    harnesses = {}
    for name in (
        'benchmark-published-route-hydration.ts',
        'benchmark-progressive-route-hydration.ts',
        'candidate-route-worker-bundle.ts',
    ):
        source = root / 'scripts/indoor' / name
        if source.is_file():
            relative = 'scripts/indoor/' + name
            add(source, 'source/openindoormaps/' + relative)
            harnesses[relative] = sha(source)
    closures = [closure]
    if args.publisher_closure:
        publisher = args.publisher_closure.resolve()
        closures.append(json.loads(publisher.read_bytes()))
        add(publisher, 'publisher-closure.json')
    for manifest in closures:
        for relative, expected in manifest['modules']:
            path = (root / relative).resolve()
            if path.is_relative_to(root):
                name = 'source/openindoormaps/' + path.relative_to(root).as_posix()
            elif path.is_relative_to(root.parent / 'reviter'):
                name = 'source/reviter/' + path.relative_to(root.parent / 'reviter').as_posix()
            else:
                raise ValueError(f'Closure escapes frozen repositories: {relative}')
            check(sha(path) == expected, f'Source changed: {relative}')
            add(path, name)
    for repository in (root, root.parent / 'reviter'):
        for name in ('package.json', 'package-lock.json', 'tsconfig.json'):
            path = repository / name
            if path.is_file():
                add(path, 'source/' + repository.name + '/' + name)
    inventory = {name: {'bytes': path.stat().st_size, 'sha256': sha(path)}
                 for name, path in sorted(files.items())}
    manifest_bytes = json.dumps({
        'format': 'source-bound-route-performance-evidence-v1',
        'published': False, 'releaseApproval': False,
        'completeApplicationOrNativeBackup': False,
        'runtimeSha256': closure['sha256'],
        'publisherClosureIncluded': bool(args.publisher_closure),
        'normalProofSha256': sha(normal / 'proof.json'),
        'actualWorkerReportSha256': sha(worker / 'report.json'),
        'actualProgressiveWorkerReportSha256': sha(progressive / 'report.json') if progressive else None,
        'experimentHarnessSourceSha256': harnesses,
        'files': inventory,
    }, indent=2).encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=output.name + '.', dir=output.parent)
    os.close(handle)
    temporary = Path(temporary)
    try:
        with tarfile.open(temporary, 'w:gz') as archive:
            info = tarfile.TarInfo('evidence-manifest.json')
            info.size = len(manifest_bytes)
            archive.addfile(info, io.BytesIO(manifest_bytes))
            for name, path in sorted(files.items()):
                archive.add(path, arcname=name, recursive=False)
        # The gzip footer and all buffers are closed before hashing/readback.
        with tarfile.open(temporary, 'r:gz') as archive:
            check(set(archive.getnames()) == set(files) | {'evidence-manifest.json'}, 'Archive inventory differs')
            for name, expected in inventory.items():
                f = archive.extractfile(name)
                check(f is not None, f'Archive member is missing: {name}')
                data = f.read()
                check(len(data) == expected['bytes'], f'Archive member length differs: {name}')
                check(hashlib.sha256(data).hexdigest() == expected['sha256'], f'Archive member changed: {name}')
        receipt = {'archive': str(output), 'bytes': temporary.stat().st_size,
                   'sha256': sha(temporary), 'members': len(files) + 1,
                   'readbackVerified': True, 'published': False, 'releaseApproval': False}
        os.chmod(temporary, 0o444)
        # Link within the same directory to fail atomically if another writer
        # created the output after our initial check; never replace evidence.
        os.link(temporary, output)
        temporary.unlink()
        output.with_suffix(output.suffix + '.verification.json').write_text(json.dumps(receipt, indent=2))
        print(json.dumps(receipt))
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
