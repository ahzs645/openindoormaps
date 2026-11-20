"""Small, offline recovery tests. No production archives or network required."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest


HELPER = Path(__file__).with_name("restore-continuation.py")
SPEC = importlib.util.spec_from_file_location("restore_continuation", HELPER)
assert SPEC is not None and SPEC.loader is not None
restore = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(restore)
COMMIT = "a" * 40  # Explicit synthetic fixture identity, not a release commit.


class RestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.parts = self.base / "downloaded"
        self.parts.mkdir()
        self.destination = self.base / "restored"
        self.archive = self.parts / "fixture.tar.gz"
        self.write_archive()
        self.entry = restore.describe(argparse.Namespace(archive=str(self.archive), root="fixture", commit=COMMIT, id="fixture", repository="https://example.invalid/fixture", part=None, without_inventory=False))
        self.manifest = self.base / "manifest.json"
        self.save_manifest()

    def write_archive(self, extra=None):
        with tarfile.open(self.archive, "w:gz", format=tarfile.PAX_FORMAT, pax_headers={"comment": COMMIT}) as archive:
            directory = tarfile.TarInfo("fixture/")
            directory.type = tarfile.DIRTYPE
            directory.mode = 0o775
            archive.addfile(directory)
            for name, content, mode in (("fixture/README.md", b"A complete small source fixture.\n", 0o664), ("fixture/run.sh", b"#!/bin/sh\nprintf 'fixture\\n'\n", 0o775)):
                member = tarfile.TarInfo(name)
                member.size, member.mode = len(content), mode
                archive.addfile(member, io.BytesIO(content))
            if extra is not None:
                member, content = extra
                archive.addfile(member, io.BytesIO(content) if content is not None else None)

    def save_manifest(self):
        self.manifest.write_text(json.dumps({"format": restore.FORMAT, "archives": [self.entry], "references": [{"id": "original-master", "url": "https://example.invalid/reference-only", "download_automatically": False}]}), encoding="utf-8")

    def use_current_archive_without_inventory(self):
        size, digest = restore.file_digest(self.archive)
        self.entry.update(bytes=size, sha256=digest, parts=[{"name": self.archive.name, "bytes": size, "sha256": digest}])
        self.entry.pop("inventory", None)
        self.save_manifest()

    def split(self):
        data = self.archive.read_bytes()
        boundary = max(1, len(data) // 3)
        self.entry["parts"] = []
        for i, offset in enumerate(range(0, len(data), boundary), 1):
            chunk = data[offset:offset + boundary]
            path = self.parts / f"fixture.tar.gz.part{i:03d}"
            path.write_bytes(chunk)
            self.entry["parts"].append({"name": path.name, "bytes": len(chunk), "sha256": hashlib.sha256(chunk).hexdigest()})
        self.archive.unlink()
        self.save_manifest()

    def run_restore(self, success=True):
        result = subprocess.run([sys.executable, str(HELPER), "restore", "--manifest", str(self.manifest), "--parts-dir", str(self.parts), "--destination", str(self.destination)], capture_output=True, text=True, timeout=15)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result

    def test_unsplit_restore_and_exact_file_modes(self):
        before = self.archive.read_bytes()
        result = json.loads(self.run_restore().stdout)
        self.assertEqual(result["regular_files_verified"], 2)
        self.assertTrue(result["archives"][0]["publisher_inventory_verified"])
        self.assertFalse(result["references_downloaded"])
        self.assertEqual(self.archive.read_bytes(), before)
        self.assertEqual(stat.S_IMODE((self.destination / "fixture/README.md").stat().st_mode), 0o644)
        self.assertEqual(stat.S_IMODE((self.destination / "fixture/run.sh").stat().st_mode), 0o755)
        restore.compare_inventory(restore.extracted_inventory(self.destination), self.entry["inventory"]["files"], "test")

    def test_split_restore_reconstructs_exact_archive(self):
        expected = self.archive.read_bytes()
        self.split()
        self.run_restore()
        self.assertEqual(self.archive.read_bytes(), expected)
        self.assertFalse(list(self.parts.glob("*.assembling")))

    def test_same_size_corrupt_part_is_rejected_without_extraction(self):
        self.split()
        path = self.parts / self.entry["parts"][0]["name"]
        content = bytearray(path.read_bytes())
        content[-1] ^= 1
        path.write_bytes(content)
        result = self.run_restore(False)
        self.assertIn("Part fixture.tar.gz.part001: SHA-256 differs", result.stderr)
        self.assertFalse(self.destination.exists())
        self.assertFalse(self.archive.exists())

    def test_valid_parts_with_wrong_whole_hash_are_rejected(self):
        self.split()
        self.entry["sha256"] = "0" * 64
        self.save_manifest()
        result = self.run_restore(False)
        self.assertIn("Whole archive fixture.tar.gz: SHA-256 differs", result.stderr)
        self.assertFalse(self.destination.exists())
        self.assertFalse(self.archive.exists())

    def test_existing_different_archive_is_never_overwritten(self):
        self.split()
        content = b"Pre-existing different input; preserve me."
        self.archive.write_bytes(content)
        result = self.run_restore(False)
        self.assertIn("refusing to overwrite different content", result.stderr)
        self.assertEqual(self.archive.read_bytes(), content)
        self.assertFalse(self.destination.exists())

    def test_existing_nonempty_destination_is_never_modified(self):
        self.destination.mkdir()
        sentinel = self.destination / "existing.txt"
        sentinel.write_text("preserve this", encoding="utf-8")
        result = self.run_restore(False)
        self.assertIn("Destination is not empty", result.stderr)
        self.assertEqual(list(self.destination.iterdir()), [sentinel])
        self.assertEqual(sentinel.read_text(), "preserve this")

    def test_existing_empty_destination_is_supported(self):
        self.destination.mkdir()
        self.run_restore()
        self.assertTrue((self.destination / "fixture/README.md").is_file())

    def test_parent_path_traversal_is_rejected(self):
        member = tarfile.TarInfo("../escaped.txt")
        member.size = 6
        self.write_archive((member, b"escape"))
        self.use_current_archive_without_inventory()
        result = self.run_restore(False)
        self.assertIn("Unsafe archive path", result.stderr)
        self.assertFalse((self.base / "escaped.txt").exists())
        self.assertFalse(self.destination.exists())

    def test_links_and_special_files_are_rejected(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE):
            with self.subTest(kind=kind):
                member = tarfile.TarInfo("fixture/link")
                member.type, member.linkname = kind, "../../escaped.txt"
                self.write_archive((member, None))
                self.use_current_archive_without_inventory()
                result = self.run_restore(False)
                self.assertIn("Only regular files and directories", result.stderr)
                self.assertFalse(self.destination.exists())

    def test_git_metadata_is_rejected(self):
        member = tarfile.TarInfo("fixture/.git/config")
        member.size = 3
        self.write_archive((member, b"bad"))
        self.use_current_archive_without_inventory()
        result = self.run_restore(False)
        self.assertIn("Git metadata", result.stderr)
        self.assertFalse(self.destination.exists())

    def test_inventory_content_mode_and_exact_set_are_enforced(self):
        original = json.loads(json.dumps(self.entry))
        for alteration in ("hash", "mode", "missing"):
            with self.subTest(alteration=alteration):
                self.entry = json.loads(json.dumps(original))
                files = self.entry["inventory"]["files"]
                if alteration == "hash":
                    files[0]["sha256"] = "0" * 64
                elif alteration == "mode":
                    files[0]["mode"] = "0600"
                else:
                    files.pop()
                self.save_manifest()
                result = self.run_restore(False)
                self.assertIn("Archive inventory fixture", result.stderr)
                self.assertFalse(self.destination.exists())

    def test_commit_header_must_match_manifest_identity(self):
        self.entry["source"]["commit"] = "b" * 40
        self.save_manifest()
        result = self.run_restore(False)
        self.assertIn("Git archive commit header does not match", result.stderr)
        self.assertFalse(self.destination.exists())

    def test_placeholder_manifest_cannot_be_restored(self):
        self.entry["sha256"] = "REPLACE_WITH_REAL_SHA256"
        self.save_manifest()
        result = self.run_restore(False)
        self.assertIn("placeholders are not accepted", result.stderr)
        self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()
