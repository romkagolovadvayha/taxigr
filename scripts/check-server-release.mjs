import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'taxigr-api-runtime-')));
const base = realpathSync(tmpdir());
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: temporary, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, NODE_ENV: 'test', MYSQL_URL: 'mysql://root@127.0.0.1:1/runtime_check', JWT_SECRET: 'isolated-runtime-check-session-secret-2026' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Isolated runtime check failed (${result.status}).`);
}
try {
  for (const dir of ['server', 'src']) cpSync(resolve(dir), join(temporary, dir), {
    recursive: true,
    filter: file => !/(?:^|[\\/])(?:node_modules|uploads|__tests__)(?:[\\/]|$)|(?:^|[\\/])\.env(?:\.|$)|\.test\./.test(file),
  });
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) cpSync(resolve(file), join(temporary, file));
  const npmCli = process.env.npm_execpath;
  if (npmCli && existsSync(npmCli)) run(process.execPath, [npmCli, 'ci', '--omit=dev', '--prefix', 'server', '--no-audit', '--no-fund']);
  else if (process.platform === 'win32') run(process.execPath, [join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'ci', '--omit=dev', '--prefix', 'server', '--no-audit', '--no-fund']);
  else run('npm', ['ci', '--omit=dev', '--prefix', 'server', '--no-audit', '--no-fund']);
  symlinkSync(join(temporary, 'server/node_modules'), join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  run(process.execPath, ['server/node_modules/tsx/dist/cli.mjs', 'server/scripts/check-runtime.ts']);
  console.log('Clean production dependency layout passed.');
} finally {
  if (dirname(temporary) !== base || !basename(temporary).startsWith('taxigr-api-runtime-')) throw new Error('Unexpected runtime-check directory');
  rmSync(temporary, { recursive: true, force: true });
}
