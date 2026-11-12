"""Exercise release contents and upload recovery without contacting a server."""
import os
import importlib.util
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parent.parent
BASH = os.environ.get('TAXIGR_TEST_BASH', 'bash')


def shell_path(path):
    value = Path(path).resolve().as_posix()
    return '/' + value[0].lower() + value[2:] if os.name == 'nt' else value


class ReleaseToolsTests(unittest.TestCase):
    def test_nginx_keeps_existing_tls_gateway_and_owned_proxy_identity(self):
        spec = importlib.util.spec_from_file_location('prepare_nginx', ROOT / 'deploy/prepare-nginx.py')
        helper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(helper)
        template = (ROOT / 'deploy/nginx.taxigr.conf').read_text()
        previous = template.replace('listen 443 ssl http2;', 'listen 127.0.0.1:18444 ssl http2 proxy_protocol;').replace('listen [::]:443 ssl http2;', 'listen [::1]:18444 ssl http2 proxy_protocol;')
        prepared = helper.prepare(template, previous, True)
        self.assertEqual(prepared.count('listen 127.0.0.1:18444 ssl http2 proxy_protocol;'), 2)
        self.assertEqual(prepared.count('listen [::1]:18444 ssl http2 proxy_protocol;'), 2)
        self.assertNotIn('listen 443 ', prepared)
        self.assertIn('proxy_set_header X-Real-IP $taxigr_request_client_ip;', prepared)
        self.assertIn('proxy_set_header X-Taxigr-Proxy-Key "";', prepared)
        self.assertEqual(helper.prepare(template), template)
        with self.assertRaises(ValueError):
            helper.prepare(template, previous.replace('listen [::1]:18444 ssl http2 proxy_protocol;', ''), True)

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='taxigr-release-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def run_script(self, script, *args, env=None):
        return subprocess.run([BASH, shell_path(script), *args], env=env,
                              text=True, capture_output=True, timeout=15)

    def test_archive_keeps_web_assets_and_shared_api_sources(self):
        required = ['dist/index.html', 'dist/assets/map.webp', 'dist/assets/voice.mp3',
                    'server/index.ts', 'server/package-lock.json', 'server/scripts/check-runtime.ts', 'server/migrations/001.sql',
                    'src/domain/models.ts', 'src/domain/app-updates.ts', 'package.json',
                    'package-lock.json', 'tsconfig.json', 'app.json',
                    'dist/vendor/maplibre/6.9.0/entry.mjs',
                    'dist/vendor/maplibre/6.9.0/maplibre-gl-worker.mjs',
                    'dist/vendor/maplibre/6.9.0/compat-1/entry.js',
                    'dist/vendor/maplibre/6.9.0/compat-1/maplibre-gl-worker.cjs',
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

    def test_deploy_preserves_rustore_push_credentials_in_generated_environment(self):
        workflow = (ROOT / '.github/workflows/deploy-production.yml').read_text(encoding='utf-8')
        global_env = workflow.split('    env:\n', 1)[1].split('\n    steps:', 1)[0]
        step = workflow.split('      - name: Create server environment file\n', 1)[1].split('\n      - name:', 1)[0]
        step_env = step.split('        env:\n', 1)[1].split('        run:', 1)[0]
        # Supply only variables actually in scope in this workflow step.
        names = re.findall(r'^\s+([A-Z_]+):', global_env + step_env, re.MULTILINE)
        env = {name: 'fixture-' + name.lower() for name in names}
        script = textwrap.dedent(step.split("python3 - <<'PY'\n", 1)[1].split('\n          PY', 1)[0])
        result = subprocess.run([sys.executable, '-c', script], env=env, cwd=self.root,
                                text=True, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        generated = dict(line.split('=', 1) for line in (self.root / '.taxigr.env').read_text().splitlines())
        for name in ['RUSTORE_PUSH_PROJECT_ID', 'RUSTORE_PUSH_SERVICE_TOKEN',
                     'MAX_RELAY_ENABLED', 'MAX_RELAY_CHANNEL', 'MAX_RELAY_CHAT_ID',
                     'MAX_RELAY_SERVICE_USER_ID', 'MAX_RELAY_BOT_TOKEN', 'MAX_RELAY_SECRET_KEY',
                     'VK_RELAY_ENABLED', 'VK_RELAY_CHANNEL', 'VK_RELAY_GROUP_ID',
                     'VK_RELAY_SERVICE_USER_ID', 'VK_RELAY_BOT_TOKEN', 'VK_RELAY_SECRET_KEY']:
            self.assertEqual(shlex.split(generated[name]), ['fixture-' + name.lower()])

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
