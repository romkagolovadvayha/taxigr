import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { createVehicleColorPalette, vehicleColorOptions } from '../src/domain/vehicle-colors.ts';

// Regenerate with node --import tsx scripts/generate-driver-map-icons.mjs.
const directory = new URL('../assets/vehicles/map/', import.meta.url);
await mkdir(directory, { recursive: true });

for (const { key, hex } of vehicleColorOptions) {
  const { body, highlight, shadow } = createVehicleColorPalette(hex);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="84" height="120" viewBox="0 0 28 40">
  <defs>
    <linearGradient id="body" x2="1" y2="1">
      <stop stop-color="${highlight}"/><stop offset=".46" stop-color="${body}"/><stop offset="1" stop-color="${shadow}"/>
    </linearGradient>
    <linearGradient id="glass" x2="0" y2="1">
      <stop stop-color="#35444E"/><stop offset="1" stop-color="#17222A"/>
    </linearGradient>
  </defs>
  <path d="M6 10C6 4 8 2 14 2s8 2 8 8v20c0 6-2 8-8 8s-8-2-8-8Z" fill="#18222B" opacity=".22" transform="translate(1 1.2)"/>
  <path d="M5.2 9.4v4.4m17.6-4.4v4.4M5.2 27.4v4.4m17.6-4.4v4.4" stroke="#222930" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M8.5 4.2C10.7 2.7 17.3 2.7 19.5 4.2c2 1.4 3 4.5 3 8.2l.5 15.7c0 4.2-1 6.9-3.4 8.1-2.5 1.3-8.7 1.3-11.2 0C6 35 5 32.3 5 28.1l.5-15.7c0-3.7 1-6.8 3-8.2Z" fill="url(#body)" stroke="#273039" stroke-width=".85"/>
  <path d="m5.7 13.6-2.2 1.3.2 1.4 2.3-.6m16.3-2.1 2.2 1.3-.2 1.4-2.3-.6" fill="${body}" stroke="#273039" stroke-width=".75" stroke-linejoin="round"/>
  <path d="M7.3 12.5c2.3-2.4 11.1-2.4 13.4 0l-2 4H9.3Z" fill="url(#glass)"/>
  <path d="m7.3 14.9 2 3.2v6.3l-2 2.7Zm13.4 0-2 3.2v6.3l2 2.7Z" fill="#222F39"/>
  <path d="M10 17.1h8v7.5h-8Z" fill="${highlight}" opacity=".65"/>
  <path d="M9.4 25.4h9.2l1.8 3.4c-2.4 1.8-10.4 1.8-12.8 0Z" fill="url(#glass)"/>
  <path d="M8.1 6.3c.8-.7 1.6-1 2.7-1.2m6.4 0c1.1.2 1.9.5 2.7 1.2" fill="none" stroke="#FFF8DF" stroke-width="1.45" stroke-linecap="round"/>
  <path d="m7.9 33.8 2 1m10.2-1-2 1" fill="none" stroke="#F3474D" stroke-width="1.35" stroke-linecap="round"/>
  <path d="M7.2 17.6v6.6m13.6-6.6v6.6" fill="none" stroke="#FFFFFF" stroke-opacity=".38" stroke-width=".6" stroke-linecap="round"/>
</svg>`;
  const output = key === 'yellow'
    ? new URL('../assets/vehicles/driver-map-car.png', import.meta.url)
    : new URL(`${key}.png`, directory);
  await sharp(Buffer.from(svg)).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(fileURLToPath(output));
}
