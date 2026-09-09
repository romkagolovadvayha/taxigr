import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Export/crop generated finished artwork without redrawing it.
const root = process.cwd();
const source = process.argv[2];
if (!source) throw new Error('Pass the directory containing the generated PNG originals.');
const out = path.join(root, 'assets/vk-community/blue-2026');
await fs.mkdir(out, { recursive: true });
const specs = JSON.parse(await fs.readFile(path.join(out, 'sources.json'), 'utf8'));
const records = [];
for (const spec of specs.images) {
  const input = path.join(source, `exec-${spec.id}.png`);
  await sharp(input).resize(spec.width, spec.height, { fit: 'fill' })
    .flatten({ background: '#F2F6FF' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(path.join(out, spec.file));
  records.push({ file: spec.file, width: spec.width, height: spec.height, aiGenerated: true });
}
const atlas = path.join(source, `exec-${specs.menuAtlas}.png`);
const metadata = await sharp(atlas).metadata();
const menu = ['order', 'how', 'tariffs', 'support', 'safety', 'drivers'];
for (const [index, key] of menu.entries()) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const left = Math.round(metadata.width * column / 2);
  const top = Math.round(metadata.height * row / 3);
  const width = Math.round(metadata.width * (column + 1) / 2) - left;
  const height = Math.round(metadata.height * (row + 1) / 3) - top;
  const file = `menu-${key}.jpg`;
  await sharp(atlas).extract({ left, top, width, height }).resize(752, 512, { fit: 'fill' })
    .jpeg({ quality: 97, chromaSubsampling: '4:4:4' }).toFile(path.join(out, file));
  records.push({ file, width: 752, height: 512, aiGenerated: true });
}
await sharp(path.join(root, 'assets/brand/icon.png')).resize(1024, 1024)
  .flatten({ background: '#315DD5' }).png().toFile(path.join(out, 'avatar.png'));
records.push({ file: 'avatar.png', width: 1024, height: 1024, aiGenerated: false, source: 'Original blue brand icon, unchanged geometry' });
await fs.copyFile(path.join(root, 'assets/fonts/Manrope.ttf'), path.join(out, 'Manrope.ttf'));
await fs.copyFile(path.join(root, 'assets/fonts/OFL-Manrope.txt'), path.join(out, 'OFL-Manrope.txt'));
for (const record of records) {
  record.bytes = (await fs.stat(path.join(out, record.file))).size;
  const actual = await sharp(path.join(out, record.file)).metadata();
  if (actual.width !== record.width || actual.height !== record.height) throw new Error(`Invalid dimensions: ${record.file}`);
}
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify({ remoteApplied: false, files: records }, null, 2) + '\n');
console.log(JSON.stringify(records, null, 2));
