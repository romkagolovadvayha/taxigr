"""Exercise release contents and upload recovery without contacting a server."""
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
BASH = os.environ.get('TAXIGR_TEST_BASH', 'bash')


def shell_path(path):
    value = Path(path).resolve().as_posix()
    return '/' + value[0].lower() + value[2:] if os.name == 'nt' else value


class ReleaseToolsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='taxigr-release-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def run_script(self, script, *args, env=None):
        return subprocess.run([BASH, shell_path(script), *args], env=env,
                              text=True, capture_output=True, timeout=15)

    def test_archive_keeps_web_assets_and_shared_api_sources(self):
        required = ['dist/index.html', 'dist/assets/map.webp', 'dist/assets/voice.mp3',
                    'server/index.ts', 'server/package-lock.json', 'server/migrations/001.sql',
                    'src/domain/models.ts', 'src/domain/app-updates.ts', 'package.json',
                    'package-lock.json', 'tsconfig.json', 'app.json',
                    'dist/vendor/maplibre/6.9.0/entry.mjs',
                    'dist/vendor/maplibre/6.9.0/maplibre-gl-worker.mjs',
                    'src/data/grahovo-house-points.json',
                    'server/scripts/import-address-directory.ts',
                    'server/migrations/047_remembered_address_points.sql']
        unwanted = ['video-promo/film.mp4', 'assets/vk-community/design.zip',
                    'credentials/secret.json', 'docs/private.md', 'server/.env.local',
                    'server/node_modules/dependency/index.js', 'src/domain/models.test.ts',
                    'deploy/osrm/data/region.osrm']
        for name in required + unwanted:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(name, encoding='utf-8')
        script = self.root / 'deploy/package-release.sh'
        shutil.copyfile(ROOT / 'deploy/package-release.sh', script)
        archive = self.root / 'release.tar.gz'
        result = self.run_script(script, shell_path(archive))
        self.assertEqual(result.returncode, 0, result.stderr)
        with tarfile.open(archive) as bundle:
            files = {member.name for member in bundle.getmembers() if member.isfile()}
            self.assertTrue(set(required).issubset(files))
            self.assertFalse(set(unwanted).intersection(files))
            for name in required:
                self.assertEqual(bundle.extractfile(name).read(), name.encode())

    def upload(self, mode):
        bin_dir = self.root / 'bin'
        bin_dir.mkdir()
        mock = bin_dir / 'scp'
        mock.write_text('#!/usr/bin/env bash\n'
                        'echo "$*" >> "$UPLOAD_TEST_LOG"\n'
                        'case "$UPLOAD_TEST_MODE" in\n'
                        '  success) exit 0;;\n'
                        '  fallback) [[ "$1" == -O ]] && exit 0; exit 1;;\n'
                        '  timeout) [[ "$1" == -O ]] && exit 0; sleep 5; exit 1;;\n'
                        '  failure) exit 1;;\n'
                        'esac\n', encoding='utf-8', newline='\n')
        mock.chmod(0o755)
        source = self.root / 'payload.tar.gz'
        source.write_bytes(b'release')
        log = self.root / 'calls.txt'
        env = dict(os.environ, UPLOAD_TEST_MODE=mode, UPLOAD_TEST_LOG=shell_path(log),
                   UPLOAD_TIMEOUT_SECONDS='1')
        # Set PATH inside bash so Windows drive separators are not treated as colons.
        launcher = self.root / 'launch.sh'
        launcher.write_text('#!/usr/bin/env bash\n'
                            f'export PATH="{shell_path(bin_dir)}:$PATH"\n'
                            f'bash "{shell_path(ROOT / "deploy/upload-file.sh")}" '
                            f'"{shell_path(source)}" "test-host:/release.tar.gz"\n',
                            encoding='utf-8', newline='\n')
        result = self.run_script(launcher, env=env)
        calls = log.read_text().splitlines()
        return result, calls

    def test_success_does_not_retry(self):
        result, calls = self.upload('success')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 1)

    def test_sftp_failure_recovers_using_scp(self):
        result, calls = self.upload('fallback')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[1].startswith('-O '))

    def test_stalled_transfer_is_terminated_before_retry(self):
        result, calls = self.upload('timeout')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('exit 124', result.stdout)
        self.assertEqual(len(calls), 2)

    def test_failed_retries_do_not_report_success(self):
        result, calls = self.upload('failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 2)
        self.assertNotIn('Upload completed', result.stdout)


if __name__ == '__main__':
    unittest.main()
