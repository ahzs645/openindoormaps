#!/usr/bin/env python3
"""Package exact committed source, restore it, and compare every file to Git.

Run only after the supplied OpenIndoorMaps commit has been published. This tool
uses local Git objects and never pushes, fetches, uploads or edits a repository.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time


REVITER_COMMIT = "4a8fe6a8bd6b085e7725bb4ea18bb32d519e00a4"
PART_BYTES = 75 * 1024 * 1024
CHUNK = 1024 * 1024
FORMAT = "unbc-continuation-source-v1"
FULL_COMMIT = re.compile(r"[0-9a-f]{40}\Z")


class PackageError(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise PackageError(message)


def utc_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write_json(path: Path, value: object) -> None:
    with path.open("x", encoding="utf-8") as output:
        json.dump(value, output, indent=2, ensure_ascii=False)
        output.write("\n")


def update_status(path: Path, value: object) -> None:
    temporary = path.with_name(path.name + ".tmp")
    write_json(temporary, value)
    os.replace(temporary, path)


def run_git(repository: Path, *arguments: str) -> bytes:
    result = subprocess.run(["git", "-C", str(repository), *arguments], capture_output=True)
    require(result.returncode == 0, f"git {' '.join(arguments)} failed: {result.stderr.decode('utf-8', errors='replace').strip()}")
    return result.stdout


def validate_commit(repository: Path, commit: str) -> None:
    require(FULL_COMMIT.fullmatch(commit) is not None, "A full lowercase 40-character commit ID is required; HEAD and abbreviated IDs are not accepted")
    require(run_git(repository, "rev-parse", "--show-object-format").strip() == b"sha1", "Independent verification requires this repository's SHA-1 Git object format")
    require(run_git(repository, "cat-file", "-t", commit).strip() == b"commit", f"Requested object is not a commit: {commit}")
    require(run_git(repository, "rev-parse", "--verify", commit + "^{commit}").decode().strip() == commit, f"Commit resolution differs from the supplied identity: {commit}")


def read_git_tree(repository: Path, commit: str) -> dict[str, dict]:
    """Read the authoritative blob IDs independently of the archive manifest."""
    validate_commit(repository, commit)
    output = run_git(repository, "ls-tree", "-r", "-z", "--full-tree", commit)
    records = {}
    for item in output.split(b"\0"):
        if not item:
            continue
        metadata, raw_path = item.split(b"\t", 1)
        mode, kind, blob = metadata.decode("ascii").split(" ")
        path = raw_path.decode("utf-8", errors="strict")
        components = path.split("/")
        require(all(p not in {"", ".", "..", ".git", "node_modules"} for p in components) and "\\" not in path and not any(ord(c) < 32 for c in path), f"Forbidden or unsupported committed source path: {path!r}")
        require(kind == "blob" and mode in {"100644", "100755"}, f"Only committed regular source files are supported; {path}: {mode} {kind}")
        require(FULL_COMMIT.fullmatch(blob) is not None and path not in records, f"Invalid or duplicate Git tree row: {path}")
        records[path] = {"git_blob_sha1": blob, "git_mode": mode}
    require(bool(records), f"No regular source files found at {commit}")
    return records


def sha256_file(path: Path) -> dict:
    require(path.is_file() and not path.is_symlink(), f"Expected a regular file: {path}")
    digest, size = hashlib.sha256(), 0
    with path.open("rb") as source:
        while chunk := source.read(CHUNK):
            digest.update(chunk)
            size += len(chunk)
    return {"name": path.name, "bytes": size, "sha256": digest.hexdigest()}


def blob_sha1(path: Path) -> tuple[int, str, str]:
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode), f"Restored path is not a regular file: {path}")
    digest = hashlib.sha1(usedforsecurity=False)
    digest.update(f"blob {info.st_size}\0".encode("ascii"))
    size = 0
    with path.open("rb") as source:
        while chunk := source.read(CHUNK):
            size += len(chunk)
            digest.update(chunk)
    require(size == info.st_size, f"Restored file changed while hashing: {path}")
    return size, digest.hexdigest(), f"{stat.S_IMODE(info.st_mode):04o}"


def compare_restored_git_tree(root: Path, expected: dict[str, dict]) -> dict:
    """Hash restored bytes with Git's blob header, without using manifest hashes."""
    actual = {}
    forbidden = []
    for current, directories, files in os.walk(root, followlinks=False):
        for name in directories:
            path = Path(current) / name
            if name in {".git", "node_modules"} or path.is_symlink():
                forbidden.append(path.relative_to(root).as_posix())
        for name in files:
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            if name in {".git", "node_modules"} or not stat.S_ISREG(path.lstat().st_mode):
                forbidden.append(relative)
            else:
                actual[relative] = path
    missing, extra = sorted(expected.keys() - actual.keys()), sorted(actual.keys() - expected.keys())
    records = []
    for path in sorted(expected.keys() & actual.keys()):
        size, observed_hash, observed_mode = blob_sha1(actual[path])
        expected_mode = "0755" if expected[path]["git_mode"] == "100755" else "0644"
        record = {"path": path, "bytes": size, "git_mode": expected[path]["git_mode"], "expected_restored_mode": expected_mode, "restored_mode": observed_mode, "expected_git_blob_sha1": expected[path]["git_blob_sha1"], "restored_git_blob_sha1": observed_hash, "passed": observed_hash == expected[path]["git_blob_sha1"] and observed_mode == expected_mode}
        records.append(record)
    return {"passed": not missing and not extra and not forbidden and all(row["passed"] for row in records), "expected_file_count": len(expected), "restored_file_count": len(actual), "compared_file_count": len(records), "expected_executable_count": sum(row["git_mode"] == "100755" for row in expected.values()), "restored_executable_count": sum(bool(int(row["restored_mode"], 8) & 0o111) for row in records), "restored_bytes": sum(row["bytes"] for row in records), "missing": missing, "extra": extra, "forbidden_paths": sorted(forbidden), "files": records}


def create_archive(repository: Path, name: str, commit: str, output: Path) -> Path:
    path = output / f"{name}-{commit}.tar.gz"
    git_log, gzip_log = output / f"{name}-git-archive.log", output / f"{name}-gzip.log"
    command = ["git", "-C", str(repository), "-c", "tar.umask=0002", "archive", "--format=tar", f"--prefix={name}/", commit]
    with path.open("xb") as compressed, git_log.open("xb") as git_error, gzip_log.open("xb") as gzip_error:
        archive = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=git_error)
        assert archive.stdout is not None
        try:
            gzip = subprocess.Popen(["gzip", "-n"], stdin=archive.stdout, stdout=compressed, stderr=gzip_error)
        except BaseException:
            archive.stdout.close()
            archive.terminate()
            archive.wait()
            raise
        archive.stdout.close()
        gzip_status = gzip.wait()
        git_status = archive.wait()
    require(git_status == 0 and gzip_status == 0, f"Source archive pipeline failed for {name}; inspect {git_log.name} and {gzip_log.name}")
    return path


def split_if_needed(archive: Path) -> list[Path]:
    remaining = archive.stat().st_size
    if remaining <= PART_BYTES:
        return [archive]
    parts = []
    with archive.open("rb") as source:
        index = 1
        while remaining:
            part = archive.with_name(f"{archive.name}.part{index:03d}")
            to_write = min(PART_BYTES, remaining)
            with part.open("xb") as target:
                while to_write:
                    chunk = source.read(min(CHUNK, to_write))
                    require(bool(chunk), "Archive ended while splitting")
                    target.write(chunk)
                    to_write -= len(chunk)
                    remaining -= len(chunk)
            parts.append(part)
            index += 1
        require(source.read(1) == b"", "Archive grew while splitting")
    return parts


def copy_tools(tools_dir: Path, output: Path) -> list[str]:
    names = ["restore-continuation.py", "prepare-complete-handoff.py", "continuation-manifest.schema.json", "continuation-manifest.example.json", "README.md", "PUBLISH-COMPLETE-SOURCE.md", "test_restore_continuation.py", "test_prepare_complete_handoff.py", "helper-tests.txt", "helper-test-receipt.json", "publisher-tests.txt", "publisher-test-receipt.json"]
    for name in names:
        source = tools_dir / name
        require(source.is_file() and not source.is_symlink(), f"Required handoff tool is missing: {source}")
        with source.open("rb") as incoming, (output / name).open("xb") as outgoing:
            shutil.copyfileobj(incoming, outgoing, CHUNK)
    return names


def prepare(args: argparse.Namespace) -> dict:
    started = time.monotonic()
    created_utc = utc_now()
    require(sys.version_info >= (3, 12), "Python 3.12 or later is required")
    require(shutil.which("git") is not None and shutil.which("gzip") is not None, "git and gzip must be available on PATH")
    require(args.reviter_commit == REVITER_COMMIT, f"This continuation must preserve unchanged Reviter commit {REVITER_COMMIT}")
    tools_dir = Path(__file__).resolve().parent
    output = Path(args.output_dir).absolute()
    require(not output.exists() and not output.is_symlink(), "--output-dir must not exist; use a new directory for each packaging attempt")
    require(output.parent.is_dir(), "The output directory's parent must already exist")
    sources = [
        {"id": "openindoormaps", "repository": Path(args.openindoormaps_repo).resolve(strict=True), "commit": args.openindoormaps_commit},
        {"id": "reviter", "repository": Path(args.reviter_repo).resolve(strict=True), "commit": args.reviter_commit},
    ]
    for source in sources:
        source["tree"] = read_git_tree(source["repository"], source["commit"])
    output.mkdir()
    status_path = output / "package-status.json"
    phase = "copying recovery tools"
    update_status(status_path, {"status": "running", "started_utc": created_utc, "phase": phase})
    try:
        tool_names = copy_tools(tools_dir, output)
        helper = output / "restore-continuation.py"
        entries, source_upload_names, archive_names = [], [], []
        for source in sources:
            phase = f"packaging {source['id']}"
            print(phase, flush=True)
            update_status(status_path, {"status": "running", "started_utc": created_utc, "phase": phase})
            archive = create_archive(source["repository"], source["id"], source["commit"], output)
            archive_names.append(archive.name)
            parts = split_if_needed(archive)
            source_upload_names.extend(part.name for part in parts)
            command = [sys.executable, str(helper), "describe", "--archive", str(archive), "--id", source["id"], "--root", source["id"], "--repository", f"https://github.com/ahzs645/{source['id']}", "--commit", source["commit"]]
            for part in parts:
                command.extend(["--part", str(part)])
            result = subprocess.run(command, capture_output=True, text=True)
            (output / f"{source['id']}-describe.log").write_text(result.stderr, encoding="utf-8")
            require(result.returncode == 0, f"Archive description failed for {source['id']}: {result.stderr.strip()}")
            entries.append(json.loads(result.stdout))
        manifest = {"format": FORMAT, "created_utc": created_utc, "notes": "Complete tracked source snapshots of the exact stated commits. Restore receipt and independent Git blob/mode verification are separate; source recovery does not assert new routing/runtime qualification.", "archives": entries, "references": [{"id": "original-master-and-viewer", "url": "https://drive.google.com/drive/folders/1PdyETAWsVOPcPPC-RAOUSaJmqXEh-rWU", "download_automatically": False, "description": "Original master/model and historical viewer parts are preserved in the original handoff and are not duplicated here.", "restore_note": "Use original archive-parts.json, restore_archives.py and the recovery input guide. No automatic download or original-model restoration is performed by this source helper."}]}
        write_json(output / "continuation-manifest.json", manifest)
        phase = "full clean restore"
        print(phase, flush=True)
        update_status(status_path, {"status": "running", "started_utc": created_utc, "phase": phase})
        restore_dir = output / "restored-source"
        command = [sys.executable, str(helper), "restore", "--manifest", str(output / "continuation-manifest.json"), "--parts-dir", str(output), "--archives-dir", str(output / "reconstructed-archives"), "--destination", str(restore_dir)]
        result = subprocess.run(command, capture_output=True, text=True)
        (output / "restore-verification.log").write_text(result.stderr, encoding="utf-8")
        (output / "restore-helper.stdout.json").write_text(result.stdout, encoding="utf-8")
        require(result.returncode == 0, f"Full source restore failed; inspect restore-verification.log: {result.stderr.strip()}")
        restore_receipt = json.loads(result.stdout)
        require(restore_receipt.get("status") == "restored" and all(row.get("publisher_inventory_verified") is True for row in restore_receipt["archives"]), "Restore helper did not report complete publisher-inventory verification")
        write_json(output / "restore-receipt.json", {"created_utc": utc_now(), "command": command, "exit_code": result.returncode, "result": restore_receipt})
        phase = "independent Git blob and mode verification"
        print(phase, flush=True)
        update_status(status_path, {"status": "running", "started_utc": created_utc, "phase": phase})
        git_reports = []
        for source in sources:
            report = compare_restored_git_tree(restore_dir / source["id"], source["tree"])
            git_reports.append({"id": source["id"], "source_commit": source["commit"], "git_tree_command": ["git", "-C", str(source["repository"]), "ls-tree", "-r", "-z", "--full-tree", source["commit"]], **report})
        git_verification = {"created_utc": utc_now(), "method": "Independent SHA-1 of b'blob ' + ASCII byte count + NUL + restored file bytes; exact file-set and restored 0644/0755 mode comparison against git ls-tree. Does not use the archive manifest's file hashes.", "passed": all(report["passed"] for report in git_reports), "repositories": git_reports}
        write_json(output / "git-blob-verification.json", git_verification)
        require(git_verification["passed"], "Restored source differs from Git; inspect git-blob-verification.json. Do not publish this package.")
        require(restore_receipt["regular_files_verified"] == sum(report["expected_file_count"] for report in git_reports), "Restore and independent Git tree file counts disagree")
        metadata_names = [*tool_names, "continuation-manifest.json", "restore-receipt.json", "restore-verification.log", "restore-helper.stdout.json", "git-blob-verification.json"]
        metadata_names.extend(f"{source['id']}-{kind}.log" for source in sources for kind in ("git-archive", "gzip", "describe"))
        version = {"python": sys.version.split()[0], "git": subprocess.check_output(["git", "--version"], text=True).strip(), "gzip": subprocess.check_output(["gzip", "--version"], text=True).splitlines()[0]}
        receipt = {"status": "complete", "started_utc": created_utc, "completed_utc": utc_now(), "elapsed_seconds": round(time.monotonic() - started, 3), "tools": version, "source_commits": {source["id"]: source["commit"] for source in sources}, "part_limit_bytes": PART_BYTES, "split_rule": "Split only when compressed archive bytes are greater than part_limit_bytes.", "complete_source_archives": [{**sha256_file(output / name), "uploaded_whole": name in source_upload_names} for name in archive_names], "restored_source_directory": str(restore_dir), "verification": [{"id": report["id"], "source_commit": report["source_commit"], "passed": report["passed"], "file_count": report["expected_file_count"], "executable_count": report["expected_executable_count"], "restored_bytes": report["restored_bytes"]} for report in git_reports], "metadata_files": [sha256_file(output / name) for name in metadata_names], "scope": "Complete source recovery verified. No dependency installation, production build, runtime replay, model restore, GitHub operation or Drive upload was performed.", "hash_dependency_note": "The continuation manifest hashes source archives/parts and source files only; it never hashes itself or receipts. This receipt hashes earlier metadata files, not itself or the later upload index."}
        write_json(output / "package-receipt.json", receipt)
        update_status(status_path, {"status": "complete", "started_utc": created_utc, "completed_utc": utc_now(), "phase": "verified", "package_receipt_sha256": sha256_file(output / "package-receipt.json")["sha256"]})
        upload_names = [*source_upload_names, *metadata_names, "package-receipt.json", "package-status.json"]
        require(len(upload_names) == len(set(upload_names)), "Duplicate upload filename")
        upload_index = {"created_utc": utc_now(), "files": [sha256_file(output / name) for name in upload_names], "also_upload": ["upload-files.json"], "index_self_hash": None, "note": "This index intentionally does not hash itself. Verify its raw uploaded bytes separately. Do not upload restored-source/, reconstructed-archives/, or a split archive's redundant whole tar.gz."}
        write_json(output / "upload-files.json", upload_index)
        return {"status": "complete", "output_directory": str(output), "source_commits": receipt["source_commits"], "verification": receipt["verification"], "upload_files": len(upload_names) + 1, "upload_index": str(output / "upload-files.json"), "package_receipt": str(output / "package-receipt.json")}
    except BaseException as error:
        update_status(status_path, {"status": "failed", "started_utc": created_utc, "failed_utc": utc_now(), "phase": phase, "error": str(error), "publish": False})
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--openindoormaps-repo", required=True)
    parser.add_argument("--openindoormaps-commit", required=True, help="Exact full commit ID, after publication to GitHub")
    parser.add_argument("--reviter-repo", required=True)
    parser.add_argument("--reviter-commit", default=REVITER_COMMIT, help="Must remain the unchanged handoff commit")
    parser.add_argument("--output-dir", required=True, help="New directory; must not already exist")
    args = parser.parse_args()
    try:
        result = prepare(args)
    except (PackageError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
