import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const assets = [
  { name: 'economy car', file: 'economy-car.png', width: 288, height: 144 },
  { name: 'child seat', file: 'child-seat.png', width: 160, height: 160 },
] as const;

describe('tariff illustrations', () => {
  for (const asset of assets) {
    it(`keeps the ${asset.name} transparent, sharp and lightweight`, async () => {
      const path = resolve(process.cwd(), 'assets', 'tariffs', asset.file);
      const file = await stat(path);
      const metadata = await sharp(path).metadata();
      const trimmed = await sharp(path)
        .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
        .toBuffer({ resolveWithObject: true });
      const { data, info } = await sharp(path)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      expect(file.size).toBeLessThan(50_000);
      expect(metadata.format).toBe('png');
      expect(metadata.hasAlpha).toBe(true);
      expect(metadata.width).toBe(asset.width);
      expect(metadata.height).toBe(asset.height);
      expect((trimmed.info.width * trimmed.info.height) / (asset.width * asset.height)).toBeGreaterThan(0.65);

      const alphaAt = (x: number, y: number) =>
        data[(y * info.width + x) * info.channels + 3];
      expect([
        alphaAt(0, 0),
        alphaAt(info.width - 1, 0),
        alphaAt(0, info.height - 1),
        alphaAt(info.width - 1, info.height - 1),
      ]).toEqual([0, 0, 0, 0]);
    });
  }
});
