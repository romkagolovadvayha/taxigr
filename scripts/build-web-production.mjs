import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { parse } from 'dotenv';

const productionFile = resolve(process.cwd(), '.env.production');
const production = existsSync(productionFile)
  ? parse(readFileSync(productionFile, 'utf8'))
  : {};

const publicUrl = process.env.PUBLIC_URL || production.PUBLIC_URL;
if (!publicUrl) {
  throw new Error('PUBLIC_URL is required for a production web build.');
}

const environment = {
  ...process.env,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || publicUrl,
  EXPO_PUBLIC_SOCKET_URL: process.env.EXPO_PUBLIC_SOCKET_URL || publicUrl,
  EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL || publicUrl,
  EXPO_PUBLIC_YANDEX_MAPS_API_KEY:
    process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY ||
    process.env.YANDEX_MAPS_API_KEY ||
    production.YANDEX_MAPS_API_KEY ||
    '',
  EXPO_PUBLIC_DEMO_MODE: 'false',
};

const expoCli = resolve(process.cwd(), 'node_modules', 'expo', 'bin', 'cli');
const result = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web'], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
