import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'vk-community');
const avatar = path.join(dir, 'vk-avatar.png');

const items = [
  ['menu-order-source.png', 'menu-order.png', 'Заказать такси'],
  ['menu-how-source.png', 'menu-how.png', 'Как заказать'],
  ['menu-tariffs-source.png', 'menu-tariffs.png', 'Тарифы'],
  ['menu-support-source.png', 'menu-support.png', 'Поддержка'],
  ['menu-safety-source.png', 'menu-safety.png', 'Безопасность'],
  ['menu-drivers-source.png', 'menu-drivers.png', 'Водителям'],
];

const logo = await sharp(avatar).resize(70, 70).png().toBuffer();

for (const [source, output] of items) {
  const badge = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="752" height="512">
      <rect x="24" y="24" width="86" height="86" rx="24" fill="#ffffff" fill-opacity=".94"/>
    </svg>`);
  const price = output === 'menu-tariffs.png'
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="752" height="512"><text x="410" y="282" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="82" font-weight="900" fill="#111">от 150 ₽</text></svg>`)
    : null;
  await sharp(path.join(dir, source))
    .resize(752, 512, { fit: 'cover', position: 'centre' })
    .composite([
      { input: badge },
      { input: logo, left: 32, top: 32 },
      ...(price ? [{ input: price }] : []),
    ])
    .png({ compressionLevel: 9, quality: 95 })
    .toFile(path.join(dir, output));
}

const tileWidth = 360;
const tileHeight = 245;
const preview = sharp({
  create: { width: 1200, height: 790, channels: 3, background: '#f5f4ef' },
});
const composites = [];
const positions = [
  [30, 30], [420, 30], [810, 30],
  [30, 400], [420, 400], [810, 400],
];
for (let index = 0; index < items.length; index += 1) {
  const [, output, title] = items[index];
  const [left, top] = positions[index];
  const tile = await sharp(path.join(dir, output)).resize(tileWidth, tileHeight).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="70"><text x="180" y="46" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="28" font-weight="800" fill="#111">${title}</text></svg>`);
  composites.push({ input: tile, left, top });
  composites.push({ input: label, left, top: top + tileHeight });
}
await preview.composite(composites).jpeg({ quality: 92 }).toFile(path.join(dir, 'menu-preview.jpg'));

console.log(`Built ${items.length} VK menu tiles at 752x512.`);
