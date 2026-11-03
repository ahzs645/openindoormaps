"""Download and verify the October 21 recompile inputs (inputs.json) into OUT,
without placing the prelanding snapshot under /workspace (the archive itself
is verified and kept). Resumable: verified files are skipped.
usage: fetch-regen-inputs.py OUT"""
import hashlib, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
INPUTS = os.path.join(HERE, "../../../unbc-20261021/recompile/inputs.json")
URL = "https://drive.usercontent.google.com/download?id={}&export=download&confirm=t"
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()
ok = lambda p, e: os.path.exists(p) and os.path.getsize(p) == e["bytes"] and sha(p) == e["sha256"]
def get(e, p):
    if ok(p, e): return
    for attempt in range(4):
        with urllib.request.urlopen(URL.format(e["driveId"]), timeout=300) as r, open(p + ".tmp", "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
        if ok(p + ".tmp", e): os.replace(p + ".tmp", p); print("ok", os.path.basename(p), flush=True); return
    sys.exit("could not verify " + p)
out = os.path.abspath(sys.argv[1]); parts = os.path.join(out, "parts"); os.makedirs(parts, exist_ok=True)
M = json.load(open(INPUTS))
jobs = [(f, os.path.join(out, f["name"])) for f in M["files"]]
for j in M["joined"]:
    if not ok(os.path.join(out, j["name"]), j):
        jobs += [(p, os.path.join(parts, f"{j['name']}.part-{i:05d}")) for i, p in enumerate(j["parts"], 1)]
jobs.append((M["prelandingSnapshot"]["archive"], os.path.join(out, M["prelandingSnapshot"]["archive"]["name"])))
with ThreadPoolExecutor(4) as pool: list(pool.map(lambda j: get(*j), jobs))
for j in M["joined"]:
    t = os.path.join(out, j["name"])
    if ok(t, j): continue
    with open(t + ".join", "wb") as f:
        for i in range(1, len(j["parts"]) + 1):
            with open(os.path.join(parts, f"{j['name']}.part-{i:05d}"), "rb") as s:
                while True:
                    b = s.read(1 << 20)
                    if not b: break
                    f.write(b)
    if not ok(t + ".join", j): sys.exit("joined digest mismatch " + j["name"])
    os.replace(t + ".join", t); print("joined", j["name"], flush=True)
import shutil; shutil.rmtree(parts)
print("ALL_INPUTS_VERIFIED", flush=True)
