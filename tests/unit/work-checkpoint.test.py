"""Portable source recovery: binary changes, file modes and all-before-write guards."""
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/indoor/package-work-checkpoint.py"


class WorkCheckpointTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repos = {}
        self.commits = {}
        for name in ["openindoormaps", "reviter"]:
            repo = self.root / name
            repo.mkdir()
            self.repos[name] = repo
            def git(*args):
                return subprocess.check_output(["git", "-C", str(repo), *args])
            git("init", "-q")
            git("config", "user.email", "checkpoint@example.invalid")
            git("config", "user.name", "Checkpoint fixture")
            (repo / "edit.txt").write_text("original\n")
            (repo / "delete.txt").write_text("delete\n")
            (repo / "binary.bin").write_bytes(bytes(range(256)))
            git("add", ".")
            git("commit", "-qm", "baseline")
            self.commits[name] = git("rev-parse", "HEAD").decode().strip()
            git("archive", "--format=tar", "-o", str(self.root / (name + ".tar")), "HEAD")
            (repo / "edit.txt").write_text("changed\n")
            (repo / "delete.txt").unlink()
            (repo / "binary.bin").write_bytes(b"\x00\xffnew binary")
            (repo / "new.sh").write_text("#!/bin/sh\ntrue\n")
            (repo / "new.sh").chmod(0o755)
            (repo / "new-link").symlink_to("edit.txt")
        (self.root / "baseline.json").write_text(json.dumps({
            "baselineSourceCommits": self.commits,
            "baselineArchives": [{"name": "baseline.zip", "sha256": "a" * 64}],
        }))
        self.capture_command = [
            "python3", str(SCRIPT),
            "--openindoormaps-root", str(self.repos["openindoormaps"]),
            "--reviter-root", str(self.repos["reviter"]),
            "--baseline-manifest", str(self.root / "baseline.json"),
            "--out", str(self.root / "checkpoint.tar.gz"),
            "--checkpoint-id", "test-checkpoint",
        ]

    def capture(self):
        subprocess.run(self.capture_command, check=True, capture_output=True)
        extracted = self.root / "checkpoint"
        extracted.mkdir()
        with tarfile.open(self.root / "checkpoint.tar.gz") as archive:
            archive.extractall(extracted, filter="data")
        self.restore_script = extracted / "RESTORE-CHECKPOINT.py"
        return extracted

    def fresh(self, name):
        work = self.root / name
        work.mkdir()
        (work / "RELEASE.json").write_text(json.dumps({"repositories": [
            {"name": n, "commit": c} for n, c in self.commits.items()
        ]}))
        for repo in self.repos:
            (work / repo).mkdir()
            with tarfile.open(self.root / (repo + ".tar")) as archive:
                archive.extractall(work / repo, filter="data")
        return work

    def restore(self, work):
        return subprocess.run(["python3", str(self.restore_script), str(work)], capture_output=True, text=True)

    def assert_unchanged(self, work):
        for name in self.repos:
            self.assertEqual((work / name / "edit.txt").read_text(), "original\n")
            self.assertTrue((work / name / "delete.txt").is_file())

    def test_binary_text_deleted_untracked_mode_and_symlink_round_trip(self):
        self.capture()
        work = self.fresh("fresh")
        result = self.restore(work)
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in self.repos:
            for rel in ["edit.txt", "binary.bin", "new.sh"]:
                self.assertEqual((work / name / rel).read_bytes(), (self.repos[name] / rel).read_bytes())
            self.assertFalse((work / name / "delete.txt").exists())
            self.assertEqual(os.readlink(work / name / "new-link"), "edit.txt")
            self.assertTrue(os.access(work / name / "new.sh", os.X_OK))
        self.assertNotEqual(self.restore(work).returncode, 0)

    def test_tamper_is_refused_before_either_tree_changes(self):
        extracted = self.capture()
        work = self.fresh("tamper")
        (extracted / "patches/openindoormaps.patch").write_bytes(b"tampered")
        result = self.restore(work)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum mismatch", result.stderr)
        self.assert_unchanged(work)

    def test_modified_second_baseline_does_not_partially_patch_first(self):
        self.capture()
        work = self.fresh("modified")
        (work / "reviter/edit.txt").write_text("user edit\n")
        result = self.restore(work)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("differs from clean baseline", result.stderr)
        self.assertEqual((work / "openindoormaps/edit.txt").read_text(), "original\n")
        self.assertEqual((work / "reviter/edit.txt").read_text(), "user edit\n")

    def test_wrong_baseline_and_unsafe_payload_path_are_refused(self):
        extracted = self.capture()
        work = self.fresh("wrong")
        release = json.loads((work / "RELEASE.json").read_text())
        release["repositories"][0]["commit"] = "0" * 40
        (work / "RELEASE.json").write_text(json.dumps(release))
        self.assertIn("Wrong baseline", self.restore(work).stderr)
        self.assert_unchanged(work)
        work = self.fresh("unsafe")
        manifest = json.loads((extracted / "CHECKPOINT.json").read_text())
        manifest["payloads"]["../outside"] = {"bytes": 0, "sha256": "0" * 64}
        (extracted / "CHECKPOINT.json").write_text(json.dumps(manifest))
        self.assertIn("Unsafe checkpoint path", self.restore(work).stderr)
        self.assert_unchanged(work)

    def test_capture_refuses_credential_like_files(self):
        (self.repos["reviter"] / ".env.production").write_text("synthetic fixture only")
        result = subprocess.run(self.capture_command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("credential-like", result.stderr)
        self.assertFalse((self.root / "checkpoint.tar.gz").exists())


if __name__ == "__main__":
    unittest.main()
