import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', 'tests/api.integration.test.ts', '--reporter=verbose'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      RUN_API_INTEGRATION: '1',
      SMS_PROVIDER: 'console',
      NOTIFICORE_BEARER_TOKEN: '',
    },
  },
);

process.exit(result.status ?? 1);
