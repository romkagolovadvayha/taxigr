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
  EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL || publicUrl,
  EXPO_PUBLIC_SOCKET_URL: process.env.EXPO_PUBLIC_SOCKET_URL || publicUrl,
  EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL || publicUrl,
  EXPO_PUBLIC_MAP_TILES_URL: process.env.EXPO_PUBLIC_MAP_TILES_URL || production.EXPO_PUBLIC_MAP_TILES_URL || '',
  EXPO_PUBLIC_MAP_GLYPHS_URL: process.env.EXPO_PUBLIC_MAP_GLYPHS_URL || production.EXPO_PUBLIC_MAP_GLYPHS_URL || '',
  EXPO_PUBLIC_DEMO_MODE: 'false',
  EXPO_PUBLIC_VK_COMMUNITY_ID:
    process.env.EXPO_PUBLIC_VK_COMMUNITY_ID ||
    process.env.VK_COMMUNITY_ID ||
    production.VK_COMMUNITY_ID ||
    '',
};

const expoCli = resolve(process.cwd(), 'node_modules', 'expo', 'bin', 'cli');
// Metro caches inlined public variables; a preceding demo export must not leak
// demo authentication into the production bundle.
const result = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web', '--clear'], {
  cwd: process.cwd(),
  env: environment,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
