import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');

it('loads operator validation with dependencies installed only under server, as in production', () => {
  const temporaryRoot = realpathSync(tmpdir());
  const release = mkdtempSync(join(temporaryRoot, 'taxigr-operator-runtime-'));
  try {
    mkdirSync(join(release, 'src', 'domain'), { recursive: true });
    mkdirSync(join(release, 'server'));
    cpSync(join(project, 'src/domain/operator-details.ts'), join(release, 'src/domain/operator-details.ts'));
    symlinkSync(join(project, 'node_modules'), join(release, 'server/node_modules'), 'junction');
    // Ensure the fixture cannot accidentally resolve packages from the checkout.
    const sharedRequire = createRequire(join(release, 'src/domain/operator-details.ts'));
    expect(() => sharedRequire.resolve('zod')).toThrow();
    writeFileSync(join(release, 'server/probe.ts'), `
      import { strict as assert } from 'node:assert';
      import { z } from 'zod';
      import { createOperatorDetailsSchema } from '../src/domain/operator-details';
      const schema = createOperatorDetailsSchema(z);
      const input = { legalName: 'ИП Тест', status: 'ИП', inn: '012345678901',
        registrationNumber: '', address: '', email: '', phone: '', taxiRegistryNumber: '' };
      assert.equal(schema.parse(input).inn, input.inn);
      assert.equal(schema.safeParse({ ...input, inn: '123' }).success, false);
      console.log('operator runtime ready');
    `);
    const output = execFileSync(process.execPath, [join(project, 'node_modules/tsx/dist/cli.mjs'),
      join(release, 'server/probe.ts')], {
      cwd: release, encoding: 'utf8', timeout: 20_000, windowsHide: true,
      env: { ...process.env, NODE_PATH: '' },
    });
    expect(output).toContain('operator runtime ready');
  } finally {
    const resolvedRelease = resolve(release);
    if (resolvedRelease.startsWith(temporaryRoot + sep) && dirname(resolvedRelease) === temporaryRoot) {
      rmSync(resolvedRelease, { recursive: true, force: true });
    }
  }
}, 30_000);
