import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const communityDir = path.join(root, 'assets', 'vk-community');
const background = path.join(communityDir, 'vk-cover-v5-background.png');
const avatar = path.join(communityDir, 'vk-avatar.png');
const phoneSource = path.join(root, 'assets', 'store', 'phone-order-v2.png');

const playMark = `
  <g transform="translate(15 13) scale(.58)">
    <path d="M0 2 L28 23 L0 46 Z" fill="#00c3ff"/>
    <path d="M0 2 L17 16 L28 23 L38 14 L8 0 Z" fill="#45d35f"/>
    <path d="M0 46 L17 30 L28 23 L38 32 L8 48 Z" fill="#ffcf32"/>
    <path d="M28 23 L38 14 L50 21 Q54 24 50 27 L38 32 Z" fill="#ff4b55"/>
  </g>`;

const rustoreMark = `
  <g transform="translate(15 12) scale(.58)">
    <path d="M4 4 Q4 0 8 2 L31 16 L20 26 L4 16 Z" fill="#8b5cf6"/>
    <path d="M31 16 L47 26 Q51 29 47 32 L31 42 L20 26 Z" fill="#18b7f1"/>
    <path d="M4 16 L20 26 L31 42 L8 50 Q4 52 4 47 Z" fill="#ff4ca0"/>
    <circle cx="25" cy="26" r="7" fill="#ffd600"/>
  </g>`;

const overlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="768">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#5b4936" flood-opacity=".16"/>
    </filter>
    <linearGradient id="glass" x1="0" x2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".94"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity=".76"/>
    </linearGradient>
  </defs>

  <rect x="492" y="142" width="718" height="570" rx="42" fill="url(#glass)" stroke="#ffffff" stroke-opacity=".92"/>

  <text x="608" y="206" font-family="Arial, Segoe UI, sans-serif" font-size="28" font-weight="800" fill="#171717">ТАКСИ ГРАХОВО</text>
  <text x="536" y="302" font-family="Arial, Segoe UI, sans-serif" font-size="62" font-weight="900" fill="#111111">Закажите такси</text>
  <rect x="528" y="328" width="538" height="82" rx="23" fill="#ffd600"/>
  <text x="564" y="386" font-family="Arial, Segoe UI, sans-serif" font-size="53" font-weight="900" fill="#111111">за пару минут</text>
  <text x="536" y="458" font-family="Arial, Segoe UI, sans-serif" font-size="27" font-weight="600" fill="#3c3c3c">Маршрут и цена видны заранее</text>

  <rect x="536" y="489" width="348" height="76" rx="22" fill="#ffd600" filter="url(#shadow)"/>
  <text x="581" y="538" font-family="Arial, Segoe UI, sans-serif" font-size="29" font-weight="900" fill="#111111">Заказать такси  →</text>

  <g transform="translate(536 594)">
    <rect width="190" height="58" rx="17" fill="#ffffff" stroke="#dedede" stroke-width="2"/>
    <circle cx="31" cy="29" r="15" fill="#ffd600"/>
    <path d="M25 22a4 4 0 1 1 6 6l-3 3-6-6 3-3m12 8a4 4 0 1 1 6 6l-3 3-6-6 3-3m-6-1 7 7" fill="none" stroke="#111" stroke-width="3.3" stroke-linecap="round"/>
    <text x="55" y="37" font-family="Arial, Segoe UI, sans-serif" font-size="23" font-weight="800" fill="#111111">taxigr.ru</text>
  </g>
  <g transform="translate(742 594)">
    <rect width="222" height="58" rx="17" fill="#ffffff" stroke="#dedede" stroke-width="2"/>
    ${playMark}
    <text x="57" y="37" font-family="Arial, Segoe UI, sans-serif" font-size="21" font-weight="800" fill="#111111">Google Play</text>
  </g>
  <g transform="translate(980 594)">
    <rect width="190" height="58" rx="17" fill="#ffffff" stroke="#dedede" stroke-width="2"/>
    ${rustoreMark}
    <text x="57" y="37" font-family="Arial, Segoe UI, sans-serif" font-size="21" font-weight="800" fill="#111111">RuStore</text>
  </g>

  <g filter="url(#shadow)">
    <rect x="1260" y="136" width="320" height="620" rx="53" fill="#111111"/>
    <rect x="1273" y="149" width="294" height="594" rx="42" fill="#ffffff"/>
  </g>
</svg>`);

const phoneTop = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="768">
  <rect x="1340" y="158" width="160" height="34" rx="17" fill="#111111"/>
  <path d="M1292 203 Q1310 175 1335 163" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="7" stroke-linecap="round"/>
</svg>`);

const safeZonePreview = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="768">
  <rect width="1920" height="128" fill="#ff3b30" fill-opacity=".18"/>
  <path d="M0 128 H1920" stroke="#ff3b30" stroke-width="4" stroke-dasharray="18 12"/>
  <text x="28" y="76" font-family="Arial, sans-serif" font-size="30" font-weight="800" fill="#9b1510">НЕ ВИДНО НА КОМПЬЮТЕРЕ</text>
  <circle cx="258" cy="768" r="258" fill="#ffffff" fill-opacity=".15" stroke="#1683ff" stroke-width="4" stroke-dasharray="18 12"/>
  <text x="75" y="640" font-family="Arial, sans-serif" font-size="28" font-weight="800" fill="#075ebd">ОБЛАСТЬ АВАТАРА</text>
</svg>`);

async function roundedPhoneScreen() {
  const mask = Buffer.from(
    '<svg width="282" height="566" xmlns="http://www.w3.org/2000/svg"><rect width="282" height="566" rx="36" fill="#fff"/></svg>',
  );
  return sharp(phoneSource)
    .resize(282, 566, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

const brandMark = await sharp(avatar).resize(60, 60).png().toBuffer();
const phoneScreen = await roundedPhoneScreen();

const cover = await sharp(background)
  .resize(1920, 768, { fit: 'cover', position: 'centre' })
  .composite([
    { input: overlay },
    { input: brandMark, left: 536, top: 158 },
    { input: phoneScreen, left: 1279, top: 170 },
    { input: phoneTop },
  ])
  .png({ compressionLevel: 9, quality: 95 })
  .toBuffer();

await sharp(cover).toFile(path.join(communityDir, 'vk-cover-v5.png'));
await sharp(cover)
  .composite([{ input: safeZonePreview }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(communityDir, 'vk-cover-v5-safe-zone.png'));

console.log('Built VK community cover v5: 1920x768 plus safe-zone preview.');
