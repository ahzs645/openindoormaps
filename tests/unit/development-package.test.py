"""Publication/restore invariants using tiny repositories, never native geometry."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/indoor/package-development-snapshot.py'

class DevelopmentPackageTest(unittest.TestCase):
    def test_paired_source_restore_and_drift_guards(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repos = {}
            for name in ('openindoormaps', 'reviter'):
                repo = root / name
                repo.mkdir()
                subprocess.run(['git', 'init', '-q', str(repo)], check=True)
                (repo / 'README.md').write_text(name + '\n')
                subprocess.run(['git', '-C', str(repo), 'add', '.'], check=True)
                subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture'], check=True)
                repos[name] = repo
            site = root / 'site'
            data = site / 'dist/data/unbc-full'
            (data / 'parts').mkdir(parents=True)
            payload = b'visitor fixture'
            digest = hashlib.sha256(payload).hexdigest()
            part = f'parts/{digest}.bin'
            (data / part).write_bytes(payload)
            manifest = {'format': 'openindoormaps-hosted-project-v1', 'version': 1, 'fileName': 'map.zip', 'sha256': digest, 'bytes': len(payload), 'parts': [{'path': part, 'sha256': digest, 'bytes': len(payload)}]}
            (data / 'project.json').write_text(json.dumps(manifest))
            cmd = ['python3', str(SCRIPT), '--site-root', str(site), '--openindoormaps-root', str(repos['openindoormaps']), '--reviter-root', str(repos['reviter']), '--cache', str(root / 'cache')]
            subprocess.run(cmd, check=True, capture_output=True)
            snapshot = json.loads((site / 'dist/data/unbc-development/manifest.json').read_text())
            self.assertFalse(snapshot['nativeRebuildReady'])
            self.assertTrue(snapshot['missingInputs'])
            restore = root / 'restore'
            (restore / 'sources').mkdir(parents=True)
            (restore / 'data').mkdir()
            (restore / 'data/UNBC.campus-viewer.zip').write_bytes(payload)
            for repo in snapshot['repositories']:
                content = b''.join((site / 'dist/data/unbc-development' / p['path']).read_bytes() for p in repo['parts'])
                (restore / 'sources' / (repo['name'] + '.source.tar.xz')).write_bytes(content)
            (restore / 'RELEASE.json').write_text(json.dumps(snapshot))
            (restore / 'restore.py').write_text(snapshot['restoreScript'])
            subprocess.run(['python3', str(restore / 'restore.py')], check=True, capture_output=True)
            for name in repos:
                self.assertEqual((restore / 'workspace' / name / 'README.md').read_text(), name + '\n')
            self.assertEqual((restore / 'workspace/data/UNBC.campus-viewer.zip').read_bytes(), payload)
            # A second restore must never overwrite an existing workspace.
            self.assertNotEqual(subprocess.run(['python3', str(restore / 'restore.py')], capture_output=True).returncode, 0)
            (repos['reviter'] / 'README.md').write_text('uncommitted change')
            self.assertNotEqual(subprocess.run(cmd + ['--verify-only'], capture_output=True).returncode, 0)
            subprocess.run(['git', '-C', str(repos['reviter']), 'checkout', '--', 'README.md'], check=True)
            (data / part).write_bytes(b'changed map')
            self.assertNotEqual(subprocess.run(cmd + ['--verify-only'], capture_output=True).returncode, 0)

if __name__ == '__main__':
    unittest.main()
