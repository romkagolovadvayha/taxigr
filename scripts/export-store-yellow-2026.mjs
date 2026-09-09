import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Exports finished artwork; the original interface and logo are preserved in the sources.
const directory = path.resolve('assets/store/1.0.10');
const sources = JSON.parse(await fs.readFile(path.join(directory, 'sources.json'), 'utf8'));
const files = [];
for (const [name, source] of Object.entries(sources)) {
  const feature = name === 'feature-graphic';
  const width = feature ? 1024 : 1080;
  const height = feature ? 500 : 1920;
  const file = name + (feature ? '.png' : '.jpg');
  const input = path.resolve(directory, source);
  const output = path.join(directory, file);
  const pipeline = sharp(input).rotate().resize(width, height, { fit: 'cover', position: 'centre' }).flatten({ background: '#FAF8F2' }).toColourspace('srgb');
  await (feature ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 94, chromaSubsampling: '4:4:4' })).toFile(output);
  const data = await fs.readFile(output);
  files.push({ file, width, height, bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') });
}
await sharp('public/pwa-512.png').resize(512, 512).flatten({ background: '#F6C945' }).png().toFile(path.join(directory, 'icon.png'));
const icon = await fs.readFile(path.join(directory, 'icon.png'));
files.push({ file: 'icon.png', width: 512, height: 512, bytes: icon.length, sha256: crypto.createHash('sha256').update(icon).digest('hex') });
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: '1.0.10', files }, null, 2) + '\n');
console.log(JSON.stringify(files.map(({ file, width, height, bytes }) => ({ file, width, height, bytes })), null, 2));
