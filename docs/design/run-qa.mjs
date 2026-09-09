import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('tmp/qa-20260909');
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'empty.env'), '');
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(EXPO_|MYSQL|JWT_|MAX_|TELEGRAM_|VK_|VAPID_|NOTIFICORE_|RUSTORE_|SUPERADMIN_|SMS_|PUBLIC_URL|CORS_|ROUTER_|NOMINATIM_|NODE_ENV)/.test(key)) delete env[key];
}
Object.assign(env, {
  DOTENV_CONFIG_PATH: resolve(directory, 'empty.env'),
  EXPO_NO_DOTENV: '1',
  MYSQL_URL: 'mysql://root@127.0.0.1:13316/taxi_qa_20260909',
  JWT_SECRET: 'isolated-local-qa-session-secret-20260909',
  PORT: '4110', HOST: '127.0.0.1', NODE_ENV: 'development',
  PUBLIC_URL: 'http://localhost:8090',
  CORS_ORIGINS: 'http://localhost:8090,http://127.0.0.1:8090,http://localhost:8082',
  SMS_PROVIDER: 'console',
  ROUTER_BASE_URL: 'https://router.project-osrm.org',
  RUN_API_INTEGRATION: '1', INTEGRATION_API_URL: 'http://127.0.0.1:4110',
  NODE_EXTRA_CA_CERTS: resolve('certs/russian-trusted-root-ca.pem'),
});
const child = spawn(process.execPath, process.argv.slice(2), { env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => { process.exitCode = code ?? 1; });
