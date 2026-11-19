"""Run the linked UNBC master through guides, both route suites, preview and visitor export."""
import argparse
import fcntl
import hashlib
import json
import os
import shutil
from pathlib import Path
import subprocess
import tarfile
import time
from uuid import uuid4
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SCRIPTS = ROOT / "scripts/indoor"
SUITES = [
    ROOT / "docs/continuation/unbc-20261031/ROUTE-CASES-CAMPUS-0388.json",
    ROOT / "docs/continuation/unbc-20261116/vestibules/ROUTE-CASES-VESTIBULES-A.json",
]

def digest(path):
    with path.open("rb") as stream:
        h = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
        return h.hexdigest()

def save(path, value):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temp.replace(path)

def source_version(repo, output):
    git = ["git", "-C", str(repo)]
    modified = subprocess.check_output(git + ["diff", "--name-only", "-z", "HEAD"])
    new = subprocess.check_output(git + ["ls-files", "--others", "--exclude-standard", "-z"])
    files = sorted({os.fsdecode(f) for f in (modified + new).split(b"\0") if f and not (repo / os.fsdecode(f)).is_relative_to(output)})
    return {
        "commit": subprocess.check_output(git + ["rev-parse", "HEAD"], text=True).strip(),
        "localFiles": {f: digest(repo / f) if (repo / f).is_file() else None for f in files},
    }

def verify_linked_master(master):
    review = json.loads((HERE / "REVIEWED-LINK-06-388.json").read_text())
    with ZipFile(master) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        if manifest["format"] != "reviter-project" or manifest["model"]["sha256"] != review["sourceModelSha256"]:
            raise ValueError("Expected the reviewed UNBC authoring master")
        entry = manifest["floors"]
        raw = archive.read(entry["path"])
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ValueError("Master rooms checksum mismatch")
        source_rooms = json.loads(raw)
        links = source_rooms.get("reviewedCirculationLinks", {})
        if links.get("sourceModelSha256") != review["sourceModelSha256"] or not all(
                link in links.get("links", []) for link in review["links"]):
            raise ValueError("This master needs the reviewed 06-388 link before the optimized postbuild")
        # Select the acceptance contract from the explicit source decision.
        bay_review = json.loads((HERE / "REVIEWED-UNBC-CONNECTIONS.json").read_text())
        expected = {link["id"]: link for link in bay_review["links"]}
        supplied = {link["id"]: link for link in links.get("links", [])}
        first_bay = "confirmed-open-bay-06-207-to-06-210"
        second_bay = "drawn-open-bay-06-220-to-06-244"
        if first_bay in supplied or second_bay in supplied:
            required = [*review["links"], expected[first_bay]]
            suites = [SUITES[0], HERE / "ROUTE-CASES-CONNECTIONS.json"]
            if second_bay in supplied:
                required.append(expected[second_bay])
                suites.append(HERE / "ROUTE-CASES-BAY-06-220.json")
            if any(supplied.get(link["id"]) != link for link in required):
                raise ValueError("Incomplete connection review in authoring master")
            permission = json.loads((HERE / "REVIEWED-OFFICE-PERMISSION.json").read_text())
            saved = source_rooms.get("indoorReviews", {}).get("edges", {}).get(permission["edgeId"], {})
            if saved.get("enabled") is False:
                binding = [permission["sourceModelSha256"], permission["fromNodeId"], permission["toNodeId"],
                           permission["roomKeys"], permission["pointsFeet"]]
                if json.loads(saved.get("geometryKey", "null")) != binding or saved.get("notes") != permission["notes"]:
                    raise ValueError("Office permission review differs from its source-bound crossing")
                suites.append(HERE / "ROUTE-CASES-OFFICE-PERMISSION.json")
                if second_bay in supplied:
                    suites.extend([HERE / "ROUTE-CASES-VISITOR-UI.json", HERE / "ROUTE-CASES-SHARED-PATHWAY.json"])
            return suites
        return SUITES

def inventory(directory):
    return {p.relative_to(directory).as_posix(): digest(p)
            for p in sorted(directory.rglob("*")) if p.is_file()}

def verify_equivalent_master(candidate, reference):
    """Choose the original bytes for reuse only when every source member matches."""
    def stream_hash(stream):
        h = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
        return h.digest()
    def unique_object(pairs):
        obj = dict(pairs)
        if len(obj) != len(pairs):
            raise ValueError("Duplicate master manifest field")
        return obj

    def comparable_manifest(archive):
        manifest = json.loads(archive.read("manifest.json"), object_pairs_hook=unique_object)
        if not isinstance(manifest, dict) or manifest.get("format") != "reviter-project":
            raise ValueError("Expected two authoring masters")
        if not isinstance(manifest.pop("createdAt", None), str):
            raise ValueError("Missing master creation time")
        return json.dumps(manifest, sort_keys=True, allow_nan=False)

    with ZipFile(candidate) as new, ZipFile(reference) as old:
        names = set(old.namelist())
        if (len(names) != len(old.namelist()) or len(names) != len(new.namelist())
                or names != set(new.namelist())):
            raise ValueError("Master member inventories differ")
        if comparable_manifest(old) != comparable_manifest(new):
            raise ValueError("Master manifests differ beyond their creation time")
        for name in sorted(names - {"manifest.json"}):
            if old.getinfo(name).file_size != new.getinfo(name).file_size:
                raise ValueError(f"Master member size differs: {name}")
            with old.open(name) as a, new.open(name) as b:
                if stream_hash(a) != stream_hash(b):
                    raise ValueError(f"Master member contents differ: {name}")


def restore_guide_cells(previous, folder):
    saved = previous / "data"
    if not (saved / "binding.json").is_file() or not (saved / "cells").is_dir():
        return
    target = folder / "data"
    (target / "cells").mkdir(parents=True)
    shutil.copy2(saved / "binding.json", target / "binding.json")
    for path in (saved / "cells").glob("*.json"):
        shutil.copy2(path, target / "cells" / path.name)


def replay_saved_guides(job, master_sha, folder):
    """Use the exact atlas under test, including its original compiler provenance."""
    receipt = json.loads((job / "completed-stages.json").read_text())["guides"]["files"]
    saved = job / "guides"
    if inventory(saved) != receipt:
        raise ValueError("The saved guide stage differs from its file receipt")
    inputs = json.loads((job / "inputs.json").read_text())
    binding = json.loads((saved / "data/binding.json").read_text())["binding"]
    report = json.loads((saved / "data/report.json").read_text())
    if inputs["masterSha256"] != master_sha or binding["inputZipSha256"] != master_sha:
        raise ValueError("Saved hallway guides belong to a different master")
    if (report["requestedWalkingEdges"] != report["eligibleWalkingEdges"] or
            report["compiledWalkingEdges"] != report["completeCompiledWalkingEdges"] or
            not report["sourceGraphAndGeometryUnchanged"]):
        raise ValueError("Expected a complete saved guide run")
    shutil.copytree(saved / "data", folder / "data")
    if any(digest(folder / name) != sha for name, sha in receipt.items() if name.startswith("data/")):
        raise ValueError("Copied hallway atlas differs from its compilation")
    save(folder / "saved-atlas.json", {"compilerBinding": binding["compilerBinding"],
         "sourceMasterSha256": master_sha, "preparedRoutingSha256": receipt["data/prepared-routing.json"]})

def run(master, out, lock_fd, guide_source=None, replay_job=None):
    suites = verify_linked_master(master)
    permission_suite = HERE / "ROUTE-CASES-OFFICE-PERMISSION.json"
    cases = [row for suite in suites if suite != permission_suite for row in json.loads(suite.read_text())]
    if permission_suite in suites:
        changes = json.loads(permission_suite.read_text())
        replaced = {r["id"]: r for r in changes["replace"]}
        if not replaced.keys() <= {row["id"] for row in cases}:
            raise ValueError("Unknown route case in the office permission review")
        cases = [replaced.get(row["id"], row) for row in cases] + changes["add"]
    if len({row["id"] for row in cases}) != len(cases):
        raise ValueError("Duplicate route case IDs across input suites")
    binding = {
        "masterSha256": digest(master),
        "suites": {p.name: digest(p) for p in suites},
        "node": subprocess.check_output(["node", "--version"], text=True).strip(),
        "openindoormaps": source_version(ROOT, out), "reviter": source_version(ROOT.parent / "reviter", out),
    }
    if replay_job:
        binding["savedGuideReceiptSha256"] = digest(replay_job / "guides/data/prepared-routing.json")
    binding_file = out / "inputs.json"
    if not binding_file.exists() and any(p.name != ".lock" for p in out.iterdir()):
        raise ValueError("Use an empty directory for a new job or the matching previous job directory")
    if binding_file.exists() and json.loads(binding_file.read_text()) != binding:
        raise ValueError("This output belongs to different inputs or code. Choose a new output directory.")
    save(binding_file, binding)
    cases_path = out / "combined-cases.json"
    save(cases_path, cases)
    receipt = out / "completed-stages.json"
    completed = json.loads(receipt.read_text()) if receipt.exists() else {}
    def stage(name, execute):
        folder = out / name
        if name in completed:
            if inventory(folder) != completed[name]["files"]:
                raise ValueError(f"Saved {name} files no longer match their receipt")
            print(f"Verified completed {name}", flush=True)
            return
        previous = None
        if folder.exists():
            previous = folder.rename(out / f"{name}.incomplete-{uuid4().hex[:10]}")
        folder.mkdir()
        if name == "guides" and previous is not None:
            restore_guide_cells(previous, folder)
        started = time.monotonic()
        print(f"Starting {name}", flush=True)
        execute(folder)
        completed[name] = {"seconds": time.monotonic() - started, "files": inventory(folder)}
        save(receipt, completed)

    def node(folder, script, *args):
        with (folder / "run.log").open("w") as log:
            subprocess.run(["node", "--max-old-space-size=8192", "--expose-gc", "--import", "tsx",
                            SCRIPTS / script, *args], cwd=ROOT, env={**os.environ, "TZ": "UTC"},
                           stdout=log, stderr=subprocess.STDOUT, pass_fds=(lock_fd,), check=True)
    guides = out / "guides/data/prepared-routing.json"
    candidate = out / "accept/data/UNBC.shared-pathways.candidate.reviter.zip"
    def make_guides(folder):
        if replay_job:
            replay_saved_guides(replay_job, binding["masterSha256"], folder)
            return
        data = folder / "data"
        if (data / "binding.json").is_file():
            options = ["--resume"]
        elif guide_source:
            options = ["--merge", guide_source]
        else:
            options = []
        node(folder, "compile-corridor-candidates.ts", master, data, *options)
        if not guides.is_file():
            raise ValueError("Guide compiler did not produce prepared routes")
    def accept(folder):
        node(folder, "verify-shared-corridor-candidate.ts", master, guides, cases_path, folder / "data")
        report = json.loads((folder / "data/report.json").read_text())
        ids = [row["id"] for row in cases]
        if (report["status"] != "PASS" or report["failures"] or
                report["sourceMasterSha256"] != binding["masterSha256"] or
                report["guideSha256"] != digest(guides) or report["casesSha256"] != digest(cases_path) or
                not report["productionWorkerSerializedReplay"] or report["archiveSha256"] != digest(candidate) or
                any([row["id"] for row in report[k]] != ids for k in ["normalCases", "productionWorkerCases"])):
            raise ValueError("Combined acceptance failed its input or coverage checks")
    def preview(folder):
        node(folder, "export-pathway-preview.ts", master, folder / "data", "--guides", guides)
        with tarfile.open(folder / "preview.tgz", "w:gz") as tar:
            tar.add(folder / "data", arcname="preview")
    def visitor(folder):
        node(folder, "export-progressive-viewer.ts", candidate, folder / "data", "--visitor", "--prepare",
             "--checkpoints", "--priority-scope=1450417,311,1487816")
        report = json.loads((folder / "data/export-report.json").read_text())
        if (not report["complete"] or report["unavailableScopes"] or not report["sourcePackageUnchanged"]
                or report["authoringPackageSha256"] != digest(candidate)
                or not (folder / "data/complete-map.offline.zip").is_file()):
            raise ValueError("Incomplete visitor export")
    stage("guides", make_guides)
    stage("accept", accept)
    stage("preview", preview)
    stage("visitor", visitor)
    print(f"Completed {len(cases)} route cases in both routers. Offline map: {out}/visitor/data/complete-map.offline.zip")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("master", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--equivalent-master", type=Path, help="Use an existing linked master as the postbuild input after comparing all members with the new export")
    guides = parser.add_mutually_exclusive_group()
    guides.add_argument("--replay-guide-job", type=Path, help="Test a previous complete saved hallway atlas against the current visitor on the identical source master")
    guides.add_argument("--guide-source", type=Path, help="Recheck and reuse guide cells from a compatible candidate directory")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        master = args.master.resolve()
        if args.equivalent_master:
            reference = args.equivalent_master.resolve()
            verify_equivalent_master(master, reference)
            print(f"Equivalent master members verified. New export {digest(master)}. "
                  f"Postbuild receipts use the original archive {digest(reference)}.", flush=True)
            master = reference
        run(master, output, lock.fileno(), args.guide_source.resolve() if args.guide_source else None,
            args.replay_guide_job.resolve() if args.replay_guide_job else None)
