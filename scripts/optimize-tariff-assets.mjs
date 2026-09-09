import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const directory = new URL('../assets/tariffs/', import.meta.url);

// Keep the approved PNG artwork as the source; never recompress a lossy WebP.
// 192 px covers the 44 px inline card at 4x; 384 px covers the 124 px card at 3x.
for (const name of ['economy-car', 'child-seat']) {
  for (const [suffix, width] of [['', 384], ['-compact', 192]]) {
    const output = fileURLToPath(new URL(`${name}${suffix}.webp`, directory));
    const result = await sharp(fileURLToPath(new URL(`${name}.png`, directory)))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
      .toFile(output);
    console.log(`${name}${suffix}.webp: ${result.width}×${result.height}, ${result.size} bytes`);
  }
}
