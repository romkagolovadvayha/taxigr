import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createContext, runInContext, Script } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { version } from 'maplibre-gl/package.json';
import { revision } from '../src/components/map/maplibre-assets.json';

const require = createRequire(import.meta.url);
const shim = readFileSync(resolve('scripts/maplibre-compat.js'), 'utf8');
const assets = resolve('public/vendor/maplibre', version, revision);

describe('mobile MapLibre bundles', () => {
  beforeAll(() => require('../scripts/prepare-maplibre-web.cjs').prepareMapLibreWeb());

  it.each(['entry.js', 'maplibre-gl-worker.cjs'])('can parse %s as a classic script without module-worker support', file => {
    const bundle = readFileSync(resolve(assets, file), 'utf8');
    expect(() => new Script(bundle)).not.toThrow();
    expect(bundle.startsWith(shim)).toBe(true);
  });

  it('restores required built-ins independently in the window and worker realms', () => {
    for (let realm = 0; realm < 2; realm += 1) {
      const context = createContext({});
      runInContext('delete Object.hasOwn; delete Array.prototype.at;', context);
      runInContext(shim, context);
      expect(runInContext(`Object.hasOwn(Object.create({ inherited: 1 }), 'inherited')`, context)).toBe(false);
      expect(runInContext(`Object.hasOwn({ own: undefined }, 'own')`, context)).toBe(true);
      expect(runInContext(`Object.hasOwn(Object.assign(Object.create(null), { own: 1 }), 'own')`, context)).toBe(true);
      expect(runInContext(`[10, 20].at(-1)`, context)).toBe(20);
      expect(runInContext(`[10, 20].at(0)`, context)).toBe(10);
      expect(runInContext(`[10, 20].at(-3)`, context)).toBeUndefined();
      expect(runInContext(`[10, 20].at(Infinity)`, context)).toBeUndefined();
      expect(runInContext(`[10, 20].at(NaN)`, context)).toBe(10);
      expect(runInContext(`Object.getOwnPropertyDescriptor(Array.prototype, 'at').enumerable`, context)).toBe(false);
      expect(() => runInContext(`Array.prototype.at.call(null, 0)`, context)).toThrow();
    }
  });

  it('preserves existing native built-ins in current browsers', () => {
    const context = createContext({});
    runInContext('var originalHasOwn = Object.hasOwn; var originalAt = Array.prototype.at;', context);
    runInContext(shim, context);
    expect(runInContext('Object.hasOwn === originalHasOwn && Array.prototype.at === originalAt', context)).toBe(true);
  });

  it.each(['nginx.conf', 'nginx.taxigr.conf'])('serves the classic worker as JavaScript in %s', file => {
    const config = readFileSync(resolve('deploy', file), 'utf8');
    expect(config).toContain('\\.(?:mjs|cjs)$');
    expect(config).toContain('application/javascript mjs cjs;');
  });
});
