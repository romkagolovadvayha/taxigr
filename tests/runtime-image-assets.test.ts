import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const brandAssets = [
  { file: 'icon.png', width: 1024, height: 1024, maxBytes: 80_000 },
  { file: 'android-foreground.png', width: 432, height: 432, maxBytes: 30_000 },
  { file: 'android-monochrome.png', width: 432, height: 432, maxBytes: 20_000 },
  { file: 'favicon.png', width: 196, height: 196, maxBytes: 15_000 },
  { file: 'splash-icon.png', width: 512, height: 512, maxBytes: 30_000 },
] as const;

describe('runtime image assets', () => {
  for (const asset of brandAssets) {
    it(`keeps ${asset.file} at its platform-safe dimensions`, async () => {
      const path = resolve(process.cwd(), 'assets', 'brand', asset.file);
      const file = await stat(path);
      const metadata = await sharp(path).metadata();

      expect(file.size).toBeLessThan(asset.maxBytes);
      expect(metadata.format).toBe('png');
      expect(metadata.width).toBe(asset.width);
      expect(metadata.height).toBe(asset.height);
    });
  }

  it('keeps the landing taxi tightly cropped and web-optimized', async () => {
    const path = resolve(process.cwd(), 'assets', 'hero', 'taxi-car.webp');
    const file = await stat(path);
    const metadata = await sharp(path).metadata();
    const trimmed = await sharp(path)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
      .toBuffer({ resolveWithObject: true });

    expect(file.size).toBeLessThan(70_000);
    expect(metadata.format).toBe('webp');
    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(584);
    expect((trimmed.info.width * trimmed.info.height) / (1200 * 584)).toBeGreaterThan(0.8);
  });
});
