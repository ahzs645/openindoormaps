#!/usr/bin/env python3
"""Save a dirty two-repository work checkpoint against a verified source backup.

This is an in-progress recovery artifact, never a native or visitor release.
It captures binary Git patches, untracked source, exact baseline/target inventories
and a standalone restore script. Concurrent source edits make capture refuse.
"""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def file_fact(data, mode, link=False):
    return {"sha256": digest(data), "bytes": len(data), "executable": bool(mode & 0o111), "symlink": link}


def checked_path(name):
    path = Path(name)
    if path.is_absolute() or ".." in path.parts or ".git" in path.parts:
        raise ValueError(f"Unsafe source path: {name}")
    if path.name in {".env", "id_rsa", "id_ed25519", "credentials.json"} or (
        path.name.startswith(".env.") and path.name not in {".env.example", ".env.sample"}
    ):
        raise ValueError(f"Refuse credential-like source path: {name}")
    return path.as_posix()


def baseline_inventory(root, commit):
    process = subprocess.Popen(["git", "-C", str(root), "archive", "--format=tar", commit], stdout=subprocess.PIPE)
    result = {}
    with tarfile.open(fileobj=process.stdout, mode="r|") as archive:
        for member in archive:
            if member.isdir():
                continue
            name = checked_path(member.name)
            if member.issym():
                result[name] = file_fact(member.linkname.encode(), member.mode, True)
            elif member.isfile():
                result[name] = file_fact(archive.extractfile(member).read(), member.mode)
            else:
                raise ValueError(f"Unsupported baseline entry: {name}")
    process.stdout.close()
    if process.wait() != 0:
        raise RuntimeError("Baseline git archive failed")
    return result


def working_inventory(root):
    names = set(filter(None, git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")))
    result = {}
    for raw in sorted(names):
        name = checked_path(raw)
        path = root / name
        if path.is_symlink():
            if not path.resolve().is_relative_to(root):
                raise ValueError(f"Source symlink escapes repository: {name}")
            result[name] = file_fact(os.readlink(path).encode(), path.lstat().st_mode, True)
        elif path.is_file():
            result[name] = file_fact(path.read_bytes(), path.stat().st_mode)
        elif path.exists():
            raise ValueError(f"Unsupported source entry: {name}")
    return result


RESTORE = r'''"""Apply this checkpoint only to a fresh verified baseline development restore."""
import hashlib,json,os,stat,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent
manifest=json.loads((root/'CHECKPOINT.json').read_text())
workspace=Path(sys.argv[1]).resolve()
assert set(manifest['repositories'])=={'openindoormaps','reviter'},'Unexpected repository names'
assert not (workspace/'COMPLETION-CHECKPOINT.json').exists(),'Refuse an already restored checkpoint'
release=json.loads((workspace/'RELEASE.json').read_text())
commits={r['name']:r['commit'] for r in release['repositories']}
assert commits==manifest['baselineCommits'],'Wrong baseline development restore'
def safe_path(directory,name):
 rel=Path(name)
 assert not rel.is_absolute() and '..' not in rel.parts and '.git' not in rel.parts,'Unsafe checkpoint path'
 path=directory/rel
 assert path.resolve().is_relative_to(directory),'Checkpoint path escapes its directory'
 return path
def inventory(directory):
 result={}
 for path in directory.rglob('*'):
  rel=path.relative_to(directory)
  if '.git' in rel.parts:continue
  if path.is_symlink():data=os.readlink(path).encode();mode=path.lstat().st_mode;link=True
  elif path.is_file():data=path.read_bytes();mode=path.stat().st_mode;link=False
  else:continue
  result[rel.as_posix()]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'executable':bool(mode&0o111),'symlink':link}
 return result
def verified_payload(name,fact):
 path=safe_path(root,name)
 assert path.is_file() and not path.is_symlink(),'Missing or unsafe checkpoint payload'
 data=path.read_bytes()
 assert len(data)==fact['bytes'] and hashlib.sha256(data).hexdigest()==fact['sha256'],'Checkpoint payload checksum mismatch'
 return data
payload={name:verified_payload(name,fact) for name,fact in manifest['payloads'].items()}
for name,repo in manifest['repositories'].items():
 directory=workspace/name
 assert inventory(directory)==repo['baselineInventory'],'Source differs from clean baseline; use fresh restore'
 patch=safe_path(root,repo['patch'])
 subprocess.run(['git','apply','--check','--binary',str(patch)],cwd=directory,check=True) if patch.stat().st_size else None
# Both baselines and all payloads are verified before either tree is changed.
for name,repo in manifest['repositories'].items():
 directory=workspace/name;patch=safe_path(root,repo['patch'])
 subprocess.run(['git','apply','--binary',str(patch)],cwd=directory,check=True) if patch.stat().st_size else None
 for rel,source in repo['untracked'].items():
  target=safe_path(directory,rel);fact=repo['targetInventory'][rel]
  assert not target.exists() and not target.is_symlink(),'Refuse existing untracked destination'
  target.parent.mkdir(parents=True,exist_ok=True)
  if fact['symlink']:target.symlink_to(payload[source].decode())
  else:target.write_bytes(payload[source]);target.chmod(0o755 if fact['executable'] else 0o644)
 assert inventory(directory)==repo['targetInventory'],'Restored source inventory mismatch'
(workspace/'COMPLETION-CHECKPOINT.json').write_text(json.dumps({'checkpointId':manifest['checkpointId'],'status':manifest['status'],'releaseApproved':False},indent=2)+'\n')
print('Exact work checkpoint restored; this is not a release or native qualification.')
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--openindoormaps-root", type=Path, required=True)
    parser.add_argument("--reviter-root", type=Path, required=True)
    parser.add_argument("--baseline-manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--checkpoint-id", required=True)
    parser.add_argument("--note", default="")
    args = parser.parse_args()
    if args.out.exists():
        raise FileExistsError("Refuse overwriting an existing checkpoint")
    baseline = json.loads(args.baseline_manifest.read_text())
    commits = baseline["baselineSourceCommits"]
    roots = {"openindoormaps": args.openindoormaps_root.resolve(), "reviter": args.reviter_root.resolve()}
    if set(commits) != set(roots):
        raise ValueError("Baseline must bind exactly both repositories")
    if not all(re.fullmatch(r"[a-f0-9]{40}", value) for value in commits.values()):
        raise ValueError("Baseline must use exact Git commit identities")
    manifest = {
        "format": "openindoormaps-work-checkpoint-v1",
        "checkpointId": args.checkpoint_id,
        "status": "in-progress; no release approval",
        "note": args.note,
        "baselineCommits": commits,
        "baselineDevelopmentArchives": [a for a in baseline["baselineArchives"] if a["name"].endswith(".zip")],
        "repositories": {},
        "payloads": {},
    }
    payloads = {}
    # Immutable Git commits can be inspected before the live capture window.
    # Keep the window short while other workers continue long source replays.
    baselines = {name: baseline_inventory(root, commits[name]) for name, root in roots.items()}
    before = {name: working_inventory(root) for name, root in roots.items()}
    for name, root in roots.items():
        patch_name = f"patches/{name}.patch"
        payloads[patch_name] = git(root, "diff", "--binary", "--full-index", commits[name], "--", ".")
        untracked = {}
        names = filter(None, git(root, "ls-files", "--others", "--exclude-standard", "-z").decode().split("\0"))
        for raw in names:
            rel = checked_path(raw)
            path = root / rel
            data = os.readlink(path).encode() if path.is_symlink() else path.read_bytes()
            source = f"untracked/{name}/{rel}"
            payloads[source] = data
            untracked[rel] = source
        manifest["repositories"][name] = {
            "headAtCapture": git(root, "rev-parse", "HEAD").decode().strip(),
            "patch": patch_name,
            "untracked": untracked,
            "baselineInventory": baselines[name],
            "targetInventory": before[name],
        }
    after = {name: working_inventory(root) for name, root in roots.items()}
    if before != after:
        raise RuntimeError("Concurrent source edit during checkpoint; retry at a stable boundary")
    for name, data in payloads.items():
        manifest["payloads"][name] = {"bytes": len(data), "sha256": digest(data)}
    payloads["CHECKPOINT.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    payloads["RESTORE-CHECKPOINT.py"] = RESTORE.encode()
    payloads["README.md"] = (
        "# In-progress work checkpoint\n\nRestore the exact baseline development ZIP first in a fresh folder "
        "with Python 3.12+ and Git installed, then extract this checkpoint beside its own manifest and run "
        "`python3 RESTORE-CHECKPOINT.py /absolute/path/to/baseline/workspace`. "
        "The restore checks both clean baseline trees and every payload before applying, "
        "then compares every target source file. Keep original native inputs separately. "
        "This checkpoint makes no geometry, route, access or release approval.\n"
    ).encode()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(args.out, "w:gz") as archive:
        for name, data in sorted(payloads.items()):
            member = tarfile.TarInfo(name)
            member.size = len(data)
            member.mode = 0o644
            archive.addfile(member, io.BytesIO(data))
    print(json.dumps({"checkpointId": args.checkpoint_id, "file": str(args.out.resolve()), "bytes": args.out.stat().st_size, "sha256": digest(args.out.read_bytes()), "releaseApproved": False}))


if __name__ == "__main__":
    main()
