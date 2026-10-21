#!/usr/bin/env python3
"""Download the attempt 006 compiler inputs from Google Drive and check them.

    python3 -I fetch-inputs.py INPUT-DIRECTORY

Reads inputs.json beside this script. Every part, joined file and review is
checked against its recorded SHA-256; a file already present with the right
digest is kept, anything else is downloaded again. The prelanding snapshot is
taken from the Stage 4 archive and placed at the absolute path the door
boundary review records (see README.md). Needs `zstd` or Node 22.15+ to read
the Stage 4 archive. Standard library only.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://drive.usercontent.google.com/download?id={}&export=download&confirm=t"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def matches(path, entry):
    return (
        os.path.exists(path)
        and os.path.getsize(path) == entry["bytes"]
        and sha256(path) == entry["sha256"]
    )


def download(entry, path):
    if matches(path, entry):
        return path
    for attempt in range(6):
        temporary = path + ".download"
        try:
            with urllib.request.urlopen(URL.format(entry["driveId"]), timeout=300) as r, open(temporary, "wb") as f:
                shutil.copyfileobj(r, f, 1 << 20)
            if matches(temporary, entry):
                os.replace(temporary, path)
                return path
            print(f"  {os.path.basename(path)}: wrong size or digest, retrying", flush=True)
        except OSError as error:
            print(f"  {os.path.basename(path)}: {error}, retrying", flush=True)
        time.sleep(2 ** attempt)
    sys.exit(f"Could not download {path} (Drive id {entry['driveId']}). Is the file shared with your account or by link?")


def zstd_decompress(source, target):
    if shutil.which("zstd"):
        subprocess.run(["zstd", "-q", "-d", "-f", source, "-o", target], check=True)
        return
    script = "const z=require('zlib'),fs=require('fs');if(!z.zstdDecompressSync)throw Error('Node 22.15+ or zstd is required');fs.writeFileSync(process.argv[2],z.zstdDecompressSync(fs.readFileSync(process.argv[1])))"
    subprocess.run(["node", "-e", script, source, target], check=True)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = os.path.abspath(sys.argv[1])
    parts_dir = os.path.join(out, "parts")
    os.makedirs(parts_dir, exist_ok=True)
    manifest = json.load(open(os.path.join(HERE, "inputs.json")))

    jobs = [(f, os.path.join(out, f["name"])) for f in manifest["files"]]
    for joined in manifest["joined"]:
        if not matches(os.path.join(out, joined["name"]), joined):
            jobs += [
                (p, os.path.join(parts_dir, f"{joined['name']}.part-{i:05d}"))
                for i, p in enumerate(joined["parts"], 1)
            ]
    snapshot = manifest["prelandingSnapshot"]
    if not matches(snapshot["requiredPath"], snapshot):
        jobs.append((snapshot["archive"], os.path.join(parts_dir, snapshot["archive"]["name"])))
    print(f"Checking {len(jobs)} downloads…", flush=True)
    with ThreadPoolExecutor(6) as pool:
        list(pool.map(lambda job: download(*job), jobs))

    for joined in manifest["joined"]:
        target = os.path.join(out, joined["name"])
        if matches(target, joined):
            continue
        with open(target + ".join", "wb") as f:
            for i in range(1, len(joined["parts"]) + 1):
                with open(os.path.join(parts_dir, f"{joined['name']}.part-{i:05d}"), "rb") as part:
                    shutil.copyfileobj(part, f, 1 << 20)
        if not matches(target + ".join", joined):
            sys.exit(f"Joined {joined['name']} does not match its recorded digest.")
        os.replace(target + ".join", target)
        print(f"Joined {joined['name']}", flush=True)

    if not matches(snapshot["requiredPath"], snapshot):
        try:
            os.makedirs(os.path.dirname(snapshot["requiredPath"]), exist_ok=True)
        except PermissionError:
            sys.exit(
                f"Cannot create {os.path.dirname(snapshot['requiredPath'])}. Run once:\n"
                f"  sudo mkdir -p /workspace/scratch && sudo chown \"$USER\" /workspace/scratch\n"
                "then run this script again (README.md has the macOS note)."
            )
        with tempfile.TemporaryDirectory(dir=out) as scratch:
            tar = os.path.join(scratch, "stage-04.tar")
            zstd_decompress(os.path.join(parts_dir, snapshot["archive"]["name"]), tar)
            with tarfile.open(tar) as archive:
                member = archive.getmember(snapshot["member"])
                with archive.extractfile(member) as source, open(snapshot["requiredPath"] + ".tmp", "wb") as f:
                    shutil.copyfileobj(source, f, 1 << 20)
        if not matches(snapshot["requiredPath"] + ".tmp", snapshot):
            sys.exit("Prelanding snapshot does not match its recorded digest.")
        os.replace(snapshot["requiredPath"] + ".tmp", snapshot["requiredPath"])
        print(f"Placed prelanding snapshot at {snapshot['requiredPath']}", flush=True)

    shutil.rmtree(parts_dir)
    print("All inputs present and verified.", flush=True)


if __name__ == "__main__":
    main()
