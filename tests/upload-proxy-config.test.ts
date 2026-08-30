import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

describe('upload proxy limits', () => {
  it.each(['deploy/nginx.conf', 'deploy/nginx.taxigr.conf'])(
    'allows a base64-encoded 5 MB chat image in %s',
    (relativePath) => {
      const config = readFileSync(`${projectRoot}${relativePath}`, 'utf8');
      expect(config).toContain('client_max_body_size 8m;');
    },
  );
});
