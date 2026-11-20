#!/usr/bin/env python3
"""Verify and safely restore the complete, versioned UNBC source handoff.

Python 3.12+, standard library only. No network access or Git installation is used.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import stat
import sys
import tarfile
import tempfile
from typing import BinaryIO


FORMAT = "unbc-continuation-source-v1"
CHUNK = 1024 * 1024
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")
MODE = re.compile(r"0[0-7]{3}\Z")


class RestoreError(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RestoreError(message)


def keys(value: object, required: set[str], optional: set[str], label: str) -> dict:
    require(isinstance(value, dict), f"{label} must be an object")
    assert isinstance(value, dict)
    require(required <= value.keys(), f"{label} is missing {sorted(required - value.keys())}")
    require(not (value.keys() - required - optional), f"{label} has unknown fields {sorted(value.keys() - required - optional)}")
    return value


def integer(value: object, minimum: int, label: str) -> None:
    require(type(value) is int and value >= minimum, f"{label} must be an integer >= {minimum}")


def digest_field(value: object, label: str) -> None:
    require(isinstance(value, str) and SHA256.fullmatch(value) is not None, f"{label} must be a lowercase SHA-256; placeholders are not accepted")


def basename(value: object, label: str) -> str:
    require(isinstance(value, str) and bool(value), f"{label} must be a filename")
    assert isinstance(value, str)
    require(value not in {".", ".."} and "/" not in value and "\\" not in value and not PureWindowsPath(value).drive and not any(ord(c) < 32 for c in value), f"Unsafe {label}: {value!r}")
    return value


def safe_member_path(name: object, root: str, *, directory: bool = False) -> str:
    require(isinstance(name, str), "Archive member path must be text")
    assert isinstance(name, str)
    path = name[:-1] if directory and name.endswith("/") else name
    require(bool(path) and not path.startswith("/") and "\\" not in path and not PureWindowsPath(path).drive and not any(ord(c) < 32 for c in path), f"Unsafe archive path: {name!r}")
    parts = path.split("/")
    require(all(p not in {"", ".", "..", ".git"} for p in parts), f"Unsafe archive path or Git metadata: {name!r}")
    require(parts[0] == root and (len(parts) > 1 or directory), f"Archive member is outside expected root {root!r}: {name!r}")
    return path


def no_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key!r}")
        result[key] = value
    return result


def validate_manifest(value: object) -> dict:
    manifest = keys(value, {"format", "archives"}, {"created_utc", "notes", "references"}, "manifest")
    require(manifest["format"] == FORMAT, f"Expected manifest format {FORMAT!r}")
    for field in ("created_utc", "notes"):
        if field in manifest:
            require(isinstance(manifest[field], str), f"manifest.{field} must be text")
    archives = manifest["archives"]
    require(isinstance(archives, list) and bool(archives), "manifest.archives must be a nonempty array")
    seen_ids, seen_roots, seen_names, seen_parts = set(), set(), set(), set()
    for i, entry in enumerate(archives):
        label = f"archives[{i}]"
        archive = keys(entry, {"id", "filename", "root", "bytes", "sha256", "source", "parts"}, {"inventory"}, label)
        require(isinstance(archive["id"], str) and re.fullmatch(r"[a-z0-9][a-z0-9-]*", archive["id"]) is not None, f"{label}.id is invalid")
        filename = basename(archive["filename"], f"{label}.filename")
        require(filename.endswith(".tar.gz"), f"{label}.filename must end in .tar.gz")
        root = basename(archive["root"], f"{label}.root")
        require(root != ".git", "A source root cannot be .git")
        for item, seen, what in ((archive["id"], seen_ids, "id"), (root, seen_roots, "root"), (filename, seen_names, "filename")):
            require(item not in seen, f"Duplicate archive {what}: {item}")
            seen.add(item)
        integer(archive["bytes"], 1, f"{label}.bytes")
        digest_field(archive["sha256"], f"{label}.sha256")
        source = keys(archive["source"], {"repository", "commit"}, set(), f"{label}.source")
        require(isinstance(source["repository"], str) and source["repository"].startswith("https://"), f"{label}.source.repository must be an HTTPS URL")
        require(isinstance(source["commit"], str) and COMMIT.fullmatch(source["commit"]) is not None, f"{label}.source.commit must be a full lowercase Git commit ID")
        parts = archive["parts"]
        require(isinstance(parts, list) and bool(parts), f"{label}.parts must be a nonempty ordered array")
        for j, value in enumerate(parts):
            part = keys(value, {"name", "bytes", "sha256"}, set(), f"{label}.parts[{j}]")
            name = basename(part["name"], f"{label}.parts[{j}].name")
            require(name not in seen_parts, f"Part filename is reused: {name}")
            seen_parts.add(name)
            integer(part["bytes"], 1, f"{label}.parts[{j}].bytes")
            digest_field(part["sha256"], f"{label}.parts[{j}].sha256")
        require(sum(p["bytes"] for p in parts) == archive["bytes"], f"{label}: part sizes do not sum to the whole archive size")
        if "inventory" in archive:
            inventory = keys(archive["inventory"], {"files"}, set(), f"{label}.inventory")
            require(isinstance(inventory["files"], list), f"{label}.inventory.files must be an array")
            paths = set()
            for j, value in enumerate(inventory["files"]):
                record = keys(value, {"path", "bytes", "sha256", "mode"}, set(), f"{label}.inventory.files[{j}]")
                path = safe_member_path(record["path"], root)
                require(path not in paths, f"Duplicate inventory path: {path}")
                paths.add(path)
                integer(record["bytes"], 0, f"{path}.bytes")
                digest_field(record["sha256"], f"{path}.sha256")
                require(isinstance(record["mode"], str) and MODE.fullmatch(record["mode"]) is not None, f"{path}.mode must be four octal digits with no special bits")
    # A reconstructed whole archive must never overwrite a different input part.
    for archive in archives:
        for part in archive["parts"]:
            if part["name"] in seen_names:
                require(len(archive["parts"]) == 1 and part["name"] == archive["filename"] and part["bytes"] == archive["bytes"] and part["sha256"] == archive["sha256"], f"Part name conflicts with an archive output: {part['name']}")
    references = manifest.get("references", [])
    require(isinstance(references, list), "manifest.references must be an array")
    for i, value in enumerate(references):
        ref = keys(value, {"id", "url", "download_automatically"}, {"description", "filename", "bytes", "sha256", "restore_note"}, f"references[{i}]")
        require(isinstance(ref["id"], str) and bool(ref["id"]), "Reference id must be text")
        require(isinstance(ref["url"], str) and ref["url"].startswith("https://"), "Reference URL must use HTTPS")
        require(ref["download_automatically"] is False, "References must remain reference-only; download_automatically must be false")
        for field in ("description", "filename", "restore_note"):
            if field in ref:
                require(isinstance(ref[field], str), f"Reference {field} must be text")
        if "bytes" in ref:
            integer(ref["bytes"], 1, "Reference bytes")
        if "sha256" in ref:
            digest_field(ref["sha256"], "Reference sha256")
    return manifest


def open_regular(path: Path) -> BinaryIO:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    require(not path.is_symlink(), f"Refusing symbolic-link input: {path}")
    descriptor = os.open(path, flags)
    try:
        require(stat.S_ISREG(os.fstat(descriptor).st_mode), f"Input must be a regular file: {path}")
        return os.fdopen(descriptor, "rb")
    except BaseException:
        os.close(descriptor)
        raise


def stream_digest(stream: BinaryIO, *, output: BinaryIO | None = None, combined=None) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    while chunk := stream.read(CHUNK):
        size += len(chunk)
        digest.update(chunk)
        if combined is not None:
            combined.update(chunk)
        if output is not None:
            output.write(chunk)
    return size, digest.hexdigest()


def file_digest(path: Path) -> tuple[int, str]:
    with open_regular(path) as stream:
        return stream_digest(stream)


def check_identity(actual: tuple[int, str], expected: dict, label: str) -> None:
    require(actual[0] == expected["bytes"], f"{label}: byte count differs (expected {expected['bytes']}, got {actual[0]})")
    require(actual[1] == expected["sha256"], f"{label}: SHA-256 differs (expected {expected['sha256']}, got {actual[1]})")


def prepare_archive(archive: dict, parts_dir: Path, archives_dir: Path) -> Path:
    """Publish an assembled archive atomically, without overwriting any input."""
    target = archives_dir / archive["filename"]
    if target.exists() or target.is_symlink():
        check_identity(file_digest(target), archive, f"Existing archive {target.name}; refusing to overwrite different content")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".assembling", dir=archives_dir)
    temporary = Path(temporary_name)
    try:
        whole = hashlib.sha256()
        whole_size = 0
        with os.fdopen(descriptor, "wb") as output:
            for part in archive["parts"]:
                with open_regular(parts_dir / part["name"]) as source:
                    require(os.fstat(source.fileno()).st_size == part["bytes"], f"Part {part['name']}: byte count differs before reading")
                    actual = stream_digest(source, output=output, combined=whole)
                check_identity(actual, part, f"Part {part['name']}")
                whole_size += actual[0]
            output.flush()
            os.fsync(output.fileno())
        check_identity((whole_size, whole.hexdigest()), archive, f"Whole archive {target.name}")
        try:
            # A same-filesystem hard link gives no-clobber publication even if a
            # second process creates the destination after our initial check.
            os.link(temporary, target)
        except FileExistsError:
            check_identity(file_digest(target), archive, f"Existing archive {target.name}; refusing to overwrite different content")
        return temporary
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def scan_archive(path: Path, root: str, commit: str, extraction_root: Path) -> list[dict]:
    records = []
    seen: dict[str, bool] = {}
    with open_regular(path) as stream, tarfile.open(fileobj=stream, mode="r|gz") as archive:
        for member in archive:
            require(member.isdir() or member.isfile(), f"Only regular files and directories are accepted; refused {member.name!r}")
            name = safe_member_path(member.name, root, directory=member.isdir())
            require(name not in seen, f"Duplicate archive member: {name}")
            seen[name] = member.isdir()
            filtered = tarfile.data_filter(member, str(extraction_root))
            require(filtered is not None, f"Archive member was rejected by the data filter: {name}")
            if member.isfile():
                content = archive.extractfile(member)
                require(content is not None, f"Cannot read archive file: {name}")
                assert content is not None
                with content:
                    size, digest = stream_digest(content)
                require(size == member.size, f"Truncated archive file: {name}")
                require(filtered.mode is not None, f"No restored mode for archive file: {name}")
                records.append({"path": name, "bytes": size, "sha256": digest, "mode": f"{filtered.mode:04o}"})
        require(archive.pax_headers.get("comment") == commit, f"Git archive commit header does not match source.commit {commit}")
    for name in seen:
        for parent in PurePosixPath(name).parents:
            if str(parent) in seen:
                require(seen[str(parent)], f"A regular file is also used as a parent directory: {parent}")
    return sorted(records, key=lambda record: record["path"])


def compare_inventory(actual: list[dict], expected: list[dict], label: str) -> None:
    actual_map = {record["path"]: record for record in actual}
    expected_map = {record["path"]: record for record in expected}
    require(actual_map.keys() == expected_map.keys(), f"{label}: file set differs; missing={sorted(expected_map.keys() - actual_map.keys())[:8]}, extra={sorted(actual_map.keys() - expected_map.keys())[:8]}")
    for path, record in expected_map.items():
        require(actual_map[path] == record, f"{label}: bytes, SHA-256 or mode differs for {path}")


def assert_empty_destination(destination: Path) -> None:
    require(not destination.is_symlink(), f"Destination cannot be a symbolic link: {destination}")
    if destination.exists():
        require(destination.is_dir(), f"Destination must be a directory: {destination}")
        require(not any(destination.iterdir()), f"Destination is not empty; nothing will be overwritten: {destination}")
    require(destination.parent.is_dir(), f"Destination parent must already exist: {destination.parent}")


def extracted_inventory(directory: Path) -> list[dict]:
    records = []
    for current, dirs, files in os.walk(directory, followlinks=False):
        for name in dirs:
            require(not (Path(current) / name).is_symlink(), f"Unexpected extracted symbolic link: {name}")
        for name in files:
            path = Path(current) / name
            size, digest = file_digest(path)
            records.append({"path": path.relative_to(directory).as_posix(), "bytes": size, "sha256": digest, "mode": f"{stat.S_IMODE(path.stat().st_mode):04o}"})
    return sorted(records, key=lambda record: record["path"])


def restore(args: argparse.Namespace) -> dict:
    with open_regular(Path(args.manifest)) as stream:
        manifest = validate_manifest(json.load(stream, object_pairs_hook=no_duplicate_keys))
    parts_dir = Path(args.parts_dir).resolve(strict=True)
    require(parts_dir.is_dir(), "--parts-dir must be a directory")
    destination = Path(os.path.abspath(args.destination))
    assert_empty_destination(destination)
    archives_dir = Path(args.archives_dir).resolve() if args.archives_dir else parts_dir
    require(not archives_dir.is_relative_to(destination.resolve()), "The archive output directory cannot be inside the extraction destination")
    archives_dir.mkdir(parents=True, exist_ok=True)
    require(archives_dir.is_dir(), "--archives-dir must be a directory")
    temporary_archives: list[Path] = []
    try:
        # Verify every part and whole archive before touching the destination.
        for archive in manifest["archives"]:
            print(f"Verifying {archive['filename']} ({len(archive['parts'])} part(s))", file=sys.stderr)
            temporary_archives.append(prepare_archive(archive, parts_dir, archives_dir))
        with tempfile.TemporaryDirectory(prefix=f".{destination.name}.restore-", dir=destination.parent) as stage_name:
            stage = Path(stage_name)
            expected = []
            for archive, path in zip(manifest["archives"], temporary_archives, strict=True):
                records = scan_archive(path, archive["root"], archive["source"]["commit"], stage)
                if "inventory" in archive:
                    compare_inventory(records, archive["inventory"]["files"], f"Archive inventory {archive['id']}")
                expected.extend(records)
            for archive, path in zip(manifest["archives"], temporary_archives, strict=True):
                with open_regular(path) as stream, tarfile.open(fileobj=stream, mode="r|gz") as source:
                    source.errorlevel = 2
                    for member in source:
                        safe_member_path(member.name, archive["root"], directory=member.isdir())
                        require(member.isdir() or member.isfile(), f"Refused archive member: {member.name}")
                        source.extract(member, path=stage, filter="data")
            compare_inventory(extracted_inventory(stage), expected, "Restored file inventory")
            assert_empty_destination(destination)
            if destination.exists():
                destination.rmdir()  # Fails safely if another process added anything.
            os.rename(stage, destination)
        return {"status": "restored", "destination": str(destination), "archives": [{"id": archive["id"], "filename": archive["filename"], "source_commit": archive["source"]["commit"], "publisher_inventory_verified": "inventory" in archive} for archive in manifest["archives"]], "regular_files_verified": len(expected), "references_downloaded": False}
    finally:
        for path in temporary_archives:
            path.unlink(missing_ok=True)


def describe(args: argparse.Namespace) -> dict:
    path = Path(args.archive).resolve(strict=True)
    root = basename(args.root, "root")
    require(COMMIT.fullmatch(args.commit) is not None, "--commit must be the complete lowercase Git commit ID")
    size, digest = file_digest(path)
    part_paths = [Path(name).resolve(strict=True) for name in args.part] if args.part else [path]
    parts, combined, combined_size = [], hashlib.sha256(), 0
    for part_path in part_paths:
        with open_regular(part_path) as stream:
            part_size, part_digest = stream_digest(stream, combined=combined)
        parts.append({"name": part_path.name, "bytes": part_size, "sha256": part_digest})
        combined_size += part_size
    require((combined_size, combined.hexdigest()) == (size, digest), "Ordered parts do not reconstruct the named archive exactly")
    with tempfile.TemporaryDirectory(prefix="continuation-inspect-") as directory:
        records = scan_archive(path, root, args.commit, Path(directory))
    result = {"id": args.id, "filename": path.name, "root": root, "bytes": size, "sha256": digest, "source": {"repository": args.repository, "commit": args.commit}, "parts": parts}
    if not args.without_inventory:
        result["inventory"] = {"files": records}
    validate_manifest({"format": FORMAT, "archives": [result]})
    return result


def main() -> int:
    if sys.version_info < (3, 12):
        print("ERROR: Python 3.12 or later is required (tar extraction filter='data').", file=sys.stderr)
        return 2
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    restore_parser = sub.add_parser("restore", help="Verify all parts and restore to a missing or empty directory")
    restore_parser.add_argument("--manifest", required=True)
    restore_parser.add_argument("--parts-dir", required=True, help="Directory containing exactly named downloaded parts")
    restore_parser.add_argument("--archives-dir", help="Reconstructed archive directory; defaults to --parts-dir")
    restore_parser.add_argument("--destination", required=True, help="Explicit missing or empty directory; its parent must exist")
    describe_parser = sub.add_parser("describe", help="Generate an archive manifest entry from actual bytes")
    describe_parser.add_argument("--archive", required=True)
    describe_parser.add_argument("--id", required=True)
    describe_parser.add_argument("--root", required=True)
    describe_parser.add_argument("--repository", required=True)
    describe_parser.add_argument("--commit", required=True)
    describe_parser.add_argument("--part", action="append", help="Part path, repeated in concatenation order; default is the unsplit archive")
    describe_parser.add_argument("--without-inventory", action="store_true", help="Omit the optional independent publisher file inventory")
    args = parser.parse_args()
    try:
        result = restore(args) if args.command == "restore" else describe(args)
    except (RestoreError, OSError, ValueError, TypeError, tarfile.TarError, EOFError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
