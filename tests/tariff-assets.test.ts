import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const assets = [
  { name: 'economy car', file: 'economy-car.webp', width: 384, height: 256, maxBytes: 15_000 },
  { name: 'child seat', file: 'child-seat.webp', width: 384, height: 256, maxBytes: 10_000 },
  { name: 'inline economy car', file: 'economy-car-compact.webp', width: 192, height: 128, maxBytes: 6_000 },
  { name: 'inline child seat', file: 'child-seat-compact.webp', width: 192, height: 128, maxBytes: 4_000 },
] as const;

describe('tariff illustrations', () => {
  for (const asset of assets) {
    it(`keeps the runtime ${asset.name} sharp, lightweight and on a clean card background`, async () => {
      const path = resolve(process.cwd(), 'assets', 'tariffs', asset.file);
      const file = await stat(path);
      const metadata = await sharp(path).metadata();
      const { data, info } = await sharp(path)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      expect(file.size).toBeLessThan(asset.maxBytes);
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(asset.width);
      expect(metadata.height).toBe(asset.height);
      for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
        const offset = (y! * info.width + x!) * info.channels;
        expect(Math.min(...data.subarray(offset, offset + 3))).toBeGreaterThan(245);
        expect(data[offset + 3]).toBe(255);
      }
    });
  }
});
