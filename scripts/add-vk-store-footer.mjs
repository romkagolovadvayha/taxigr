import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'vk-community');

const jobs = [
  ['post-welcome-v2.png', 'post-welcome-v3.png'],
  ['post-how-to-order-v2-route150.png', 'post-how-to-order-v3.png'],
  ['post-benefits-v2-route150.png', 'post-benefits-v3.png'],
  ['post-first-order-v2-route150.png', 'post-first-order-v3.png'],
  ['post-safety-v2-route150.png', 'post-safety-v3.png'],
  ['post-drivers-v2.png', 'post-drivers-v3.png'],
];

const footer = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <rect x="0" y="1076" width="1200" height="124" fill="#151515"/>
    <text x="54" y="1153" font-family="Arial, Segoe UI, sans-serif" font-size="39" font-weight="800" fill="#ffffff">taxigr.ru</text>
    <line x1="320" y1="1101" x2="320" y2="1174" stroke="#3a3a3a" stroke-width="2"/>

    <g transform="translate(354 1098)">
      <rect width="342" height="80" rx="22" fill="#ffffff"/>
      <g transform="translate(22 17)">
        <path d="M0 2 L28 23 L0 46 Z" fill="#00c3ff"/>
        <path d="M0 2 L17 16 L28 23 L38 14 L8 0 Z" fill="#45d35f"/>
        <path d="M0 46 L17 30 L28 23 L38 32 L8 48 Z" fill="#ffcf32"/>
        <path d="M28 23 L38 14 L50 21 Q54 24 50 27 L38 32 Z" fill="#ff4b55"/>
      </g>
      <text x="88" y="51" font-family="Arial, Segoe UI, sans-serif" font-size="30" font-weight="700" fill="#151515">Google Play</text>
    </g>

    <g transform="translate(724 1098)">
      <rect width="422" height="80" rx="22" fill="#ffffff"/>
      <g transform="translate(22 15)">
        <path d="M4 4 Q4 0 8 2 L31 16 L20 26 L4 16 Z" fill="#8b5cf6"/>
        <path d="M31 16 L47 26 Q51 29 47 32 L31 42 L20 26 Z" fill="#18b7f1"/>
        <path d="M4 16 L20 26 L31 42 L8 50 Q4 52 4 47 Z" fill="#ff4ca0"/>
        <circle cx="25" cy="26" r="7" fill="#ffd600"/>
      </g>
      <text x="89" y="51" font-family="Arial, Segoe UI, sans-serif" font-size="31" font-weight="700" fill="#151515">RuStore</text>
    </g>
  </svg>
`);

await Promise.all(jobs.map(async ([input, output]) => {
  await sharp(path.join(dir, input))
    .resize(1200, 1200, { fit: 'cover' })
    .composite([{ input: footer }])
    .png({ compressionLevel: 9, quality: 95 })
    .toFile(path.join(dir, output));
}));

console.log(`Added taxigr.ru, Google Play and RuStore footer to ${jobs.length} VK creatives.`);
