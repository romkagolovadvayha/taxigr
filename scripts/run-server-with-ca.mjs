import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const certificatePath = resolve('certs/russian-trusted-root-ca.pem');
const tsxCliPath = resolve('node_modules/tsx/dist/cli.mjs');
const child = spawn(process.execPath, [tsxCliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || certificatePath,
  },
  stdio: 'inherit',
  windowsHide: true,
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  console.error('Failed to start the API server:', error);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
