import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'assets/vk-community/yellow-2026');
const sources = path.join(output, 'sources');
await fs.mkdir(sources, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(output, 'sources.json'), 'utf8'));
const sourcePath = file => path.resolve(output, file);
const exported = [];
for (const item of manifest.images) {
  const original = path.join(sources, `${item.key}.png`);
  if (sourcePath(item.source) !== original) await fs.copyFile(sourcePath(item.source), original);
  await sharp(original).resize(item.width, item.height, { fit: 'fill' })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(path.join(output, item.file));
  exported.push({ file: item.file, width: item.width, height: item.height, aiGenerated: true });
}
const atlas = path.join(sources, 'menu-atlas.png');
if (sourcePath(manifest.menuAtlas) !== atlas) await fs.copyFile(sourcePath(manifest.menuAtlas), atlas);
const meta = await sharp(atlas).metadata();
for (const [index, key] of ['order', 'how', 'tariffs', 'support', 'safety', 'drivers'].entries()) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  const left = Math.round(meta.width * col / 2);
  const top = Math.round(meta.height * row / 3);
  const width = Math.round(meta.width * (col + 1) / 2) - left;
  const height = Math.round(meta.height * (row + 1) / 3) - top;
  const file = `menu-${key}.jpg`;
  await sharp(atlas).extract({ left, top, width, height }).resize(752, 512, { fit: 'fill' })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(path.join(output, file));
  exported.push({ file, width: 752, height: 512, aiGenerated: true });
}
await fs.copyFile(path.join(root, 'public/pwa-512.png'), path.join(output, 'avatar.png'));
exported.push({ file: 'avatar.png', width: 512, height: 512, source: 'Existing approved TaxiGR brand mark' });
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: exported }, null, 2) + '\n');
console.log(`Exported ${exported.length} VK artwork files.`);
