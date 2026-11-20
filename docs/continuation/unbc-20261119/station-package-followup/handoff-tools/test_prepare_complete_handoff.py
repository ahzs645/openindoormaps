"""Tiny verifier/splitting tests; never package a production checkout."""

import hashlib
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("prepare-complete-handoff.py")
SPEC = importlib.util.spec_from_file_location("prepare_complete_handoff", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
publisher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publisher)


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.expected = {}
        for name, content, mode in [("README.md", b"source\n", 0o644), ("run.sh", b"#!/bin/sh\nexit 0\n", 0o755)]:
            path = self.root / name
            path.write_bytes(content)
            path.chmod(mode)
            # Git itself computes the independent expected identity. No object
            # is written and no repository or commit is created.
            blob = subprocess.check_output(["git", "hash-object", "--stdin"], input=content).decode().strip()
            self.expected[name] = {"git_blob_sha1": blob, "git_mode": "100755" if mode == 0o755 else "100644"}

    def test_verifier_matches_real_git_hash_object_and_modes(self):
        report = publisher.compare_restored_git_tree(self.root, self.expected)
        self.assertTrue(report["passed"])
        self.assertEqual(report["expected_file_count"], 2)
        self.assertEqual(report["compared_file_count"], 2)
        self.assertEqual(report["expected_executable_count"], 1)
        self.assertEqual(report["restored_executable_count"], 1)

    def test_same_size_changed_content_fails_independent_blob_check(self):
        (self.root / "README.md").write_bytes(b"SOURCE\n")
        report = publisher.compare_restored_git_tree(self.root, self.expected)
        self.assertFalse(report["passed"])
        row = next(row for row in report["files"] if row["path"] == "README.md")
        self.assertNotEqual(row["expected_git_blob_sha1"], row["restored_git_blob_sha1"])

    def test_executable_mode_change_fails_even_with_same_content(self):
        (self.root / "run.sh").chmod(0o644)
        report = publisher.compare_restored_git_tree(self.root, self.expected)
        self.assertFalse(report["passed"])
        row = next(row for row in report["files"] if row["path"] == "run.sh")
        self.assertEqual(row["expected_git_blob_sha1"], row["restored_git_blob_sha1"])
        self.assertEqual(row["restored_mode"], "0644")

    def test_missing_extra_and_forbidden_paths_fail(self):
        (self.root / "README.md").unlink()
        (self.root / "extra.txt").write_text("extra")
        (self.root / "node_modules").mkdir()
        report = publisher.compare_restored_git_tree(self.root, self.expected)
        self.assertFalse(report["passed"])
        self.assertEqual(report["missing"], ["README.md"])
        self.assertEqual(report["extra"], ["extra.txt"])
        self.assertEqual(report["forbidden_paths"], ["node_modules"])

    def test_ls_tree_parser_rejects_dependency_tree_before_packaging(self):
        commit = "a" * 40  # Explicit synthetic parser fixture, not a release ID.
        blob = hashlib.sha1(b"blob 0\0", usedforsecurity=False).hexdigest()

        def git_output(repository, *arguments):
            if arguments[:2] == ("rev-parse", "--show-object-format"):
                return b"sha1\n"
            if arguments[0] == "cat-file":
                return b"commit\n"
            if arguments[0] == "rev-parse":
                return (commit + "\n").encode()
            return f"100644 blob {blob}\tnode_modules/example/index.js\0".encode()

        with patch.object(publisher, "run_git", side_effect=git_output):
            with self.assertRaisesRegex(publisher.PackageError, "Forbidden or unsupported"):
                publisher.read_git_tree(self.root, commit)

    def test_split_threshold_is_strict_and_reassembly_is_exact(self):
        with patch.object(publisher, "PART_BYTES", 17):
            for size, expected_parts in [(17, 1), (18, 2)]:
                with self.subTest(size=size):
                    archive = self.root / f"fixture-{size}.tar.gz"
                    content = bytes(range(size))
                    archive.write_bytes(content)
                    parts = publisher.split_if_needed(archive)
                    self.assertEqual(len(parts), expected_parts)
                    self.assertEqual(b"".join(part.read_bytes() for part in parts), content)
                    if size == 17:
                        self.assertEqual(parts, [archive])
                    else:
                        self.assertEqual([part.stat().st_size for part in parts], [17, 1])


if __name__ == "__main__":
    unittest.main()
