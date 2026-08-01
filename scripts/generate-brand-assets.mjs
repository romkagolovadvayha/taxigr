import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const brandDir = resolve(root, 'assets', 'brand');
const publicDir = resolve(root, 'public');
const logo = resolve(brandDir, 'logo.svg');
const monochrome = resolve(brandDir, 'logo-monochrome.svg');

await mkdir(brandDir, { recursive: true });
await mkdir(publicDir, { recursive: true });
const socialLogo = await sharp(logo).resize(320, 320).png().toBuffer();
const createOpaqueWebIcon = (size) =>
  sharp(logo)
    .resize(size, size)
    .flatten({ background: '#FFD600' });

const maskableInset = 51;
const maskableLogo = await sharp(logo)
  .resize(512 - maskableInset * 2, 512 - maskableInset * 2)
  .png()
  .toBuffer();

await Promise.all([
  sharp(logo).resize(1024, 1024).png().toFile(resolve(brandDir, 'icon.png')),
  sharp(logo).resize(512, 512).png().toFile(resolve(brandDir, 'splash-icon.png')),
  sharp(logo).resize(196, 196).png().toFile(resolve(brandDir, 'favicon.png')),
  sharp(logo).resize(432, 432, { fit: 'contain' }).png().toFile(resolve(brandDir, 'android-foreground.png')),
  sharp(monochrome).resize(432, 432, { fit: 'contain' }).png().toFile(resolve(brandDir, 'android-monochrome.png')),
  sharp({
    create: { width: 1200, height: 630, channels: 4, background: '#FFD600' },
  })
    .composite([{ input: socialLogo, gravity: 'centre' }])
    .png()
    .toFile(resolve(publicDir, 'og.png')),
  createOpaqueWebIcon(192).png().toFile(resolve(publicDir, 'pwa-192.png')),
  createOpaqueWebIcon(512).png().toFile(resolve(publicDir, 'pwa-512.png')),
  sharp({
    create: { width: 512, height: 512, channels: 4, background: '#FFD600' },
  })
    .composite([{ input: maskableLogo, gravity: 'centre' }])
    .png()
    .toFile(resolve(publicDir, 'pwa-maskable-512.png')),
  createOpaqueWebIcon(180).png().toFile(resolve(publicDir, 'apple-touch-icon.png')),
]);

console.log(`Generated brand assets in ${brandDir}`);
