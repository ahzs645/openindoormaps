#!/usr/bin/env python3
"""Verify every payload in an extracted UNBC local handoff against its manifest."""
import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    root = args.directory.resolve()
    entries = json.loads((root / 'SHA256SUMS.json').read_text())
    seen = set()
    for entry in entries:
        relative = Path(entry['path'])
        target = (root / relative).resolve()
        if relative.is_absolute() or not target.is_relative_to(root) or str(relative) in seen:
            raise ValueError('Invalid or duplicate manifest path: ' + str(relative))
        seen.add(str(relative))
        digest = hashlib.sha256()
        size = 0
        with target.open('rb') as source:
            for block in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(block)
                size += len(block)
        if size != entry['bytes'] or digest.hexdigest() != entry['sha256']:
            raise ValueError('Payload changed: ' + str(relative))
    print('Verified', len(entries), 'handoff payload files.')


if __name__ == '__main__':
    main()
