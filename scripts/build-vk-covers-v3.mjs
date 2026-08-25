import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'vk-community');

const wideBackground = path.join(dir, 'vk-cover-v3-background.png');
const mobileBackground = path.join(dir, 'vk-live-cover-v3-background.png');
const avatar = path.join(dir, 'vk-avatar.png');

const playMark = `
  <g transform="translate(22 16) scale(.78)">
    <path d="M0 2 L28 23 L0 46 Z" fill="#00c3ff"/>
    <path d="M0 2 L17 16 L28 23 L38 14 L8 0 Z" fill="#45d35f"/>
    <path d="M0 46 L17 30 L28 23 L38 32 L8 48 Z" fill="#ffcf32"/>
    <path d="M28 23 L38 14 L50 21 Q54 24 50 27 L38 32 Z" fill="#ff4b55"/>
  </g>`;

const rustoreMark = `
  <g transform="translate(22 14) scale(.78)">
    <path d="M4 4 Q4 0 8 2 L31 16 L20 26 L4 16 Z" fill="#8b5cf6"/>
    <path d="M31 16 L47 26 Q51 29 47 32 L31 42 L20 26 Z" fill="#18b7f1"/>
    <path d="M4 16 L20 26 L31 42 L8 50 Q4 52 4 47 Z" fill="#ff4ca0"/>
    <circle cx="25" cy="26" r="7" fill="#ffd600"/>
  </g>`;

const wideOverlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="768" viewBox="0 0 1920 768">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#101010" stop-opacity=".30"/>
      <stop offset=".22" stop-color="#101010" stop-opacity=".92"/>
      <stop offset=".62" stop-color="#101010" stop-opacity=".82"/>
      <stop offset=".82" stop-color="#101010" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1350" height="768" fill="url(#shade)"/>

  <text x="410" y="105" font-family="Arial, Segoe UI, sans-serif" font-size="34" font-weight="800" fill="#ffffff">ТАКСИ ГРАХОВО</text>
  <text x="300" y="215" font-family="Arial, Segoe UI, sans-serif" font-size="72" font-weight="900" fill="#ffffff">Закажите такси</text>
  <rect x="292" y="235" width="610" height="92" rx="20" fill="#ffd600"/>
  <text x="320" y="303" font-family="Arial, Segoe UI, sans-serif" font-size="72" font-weight="900" fill="#111111">за пару минут</text>
  <text x="300" y="370" font-family="Arial, Segoe UI, sans-serif" font-size="29" font-weight="600" fill="#f4f4f4">По Грахово и району  •  поездки от 150 ₽</text>

  <rect x="300" y="412" width="420" height="86" rx="24" fill="#ffd600"/>
  <text x="348" y="468" font-family="Arial, Segoe UI, sans-serif" font-size="34" font-weight="900" fill="#111111">Заказать такси  →</text>

  <g transform="translate(300 544)">
    <rect width="250" height="68" rx="18" fill="#ffffff"/>
    <circle cx="39" cy="34" r="18" fill="#ffd600"/>
    <path d="M33 27a5 5 0 1 1 7 7l-3 3-7-7 3-3m14 9a5 5 0 1 1 7 7l-3 3-7-7 3-3m-8-1 8 8" fill="none" stroke="#111" stroke-width="4" stroke-linecap="round"/>
    <text x="70" y="44" font-family="Arial, Segoe UI, sans-serif" font-size="28" font-weight="800" fill="#111111">taxigr.ru</text>
  </g>
  <g transform="translate(570 544)">
    <rect width="292" height="68" rx="18" fill="#ffffff"/>
    ${playMark}
    <text x="72" y="44" font-family="Arial, Segoe UI, sans-serif" font-size="26" font-weight="800" fill="#111111">Google Play</text>
  </g>
  <g transform="translate(882 544)">
    <rect width="250" height="68" rx="18" fill="#ffffff"/>
    ${rustoreMark}
    <text x="72" y="44" font-family="Arial, Segoe UI, sans-serif" font-size="27" font-weight="800" fill="#111111">RuStore</text>
  </g>
</svg>`);

const mobileOverlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".10" stop-color="#111111" stop-opacity=".10"/>
      <stop offset=".24" stop-color="#111111" stop-opacity=".92"/>
      <stop offset=".62" stop-color="#111111" stop-opacity=".90"/>
      <stop offset=".78" stop-color="#111111" stop-opacity=".22"/>
    </linearGradient>
  </defs>
  <rect x="0" y="170" width="1080" height="1220" fill="url(#shade)"/>

  <text x="220" y="334" font-family="Arial, Segoe UI, sans-serif" font-size="48" font-weight="800" fill="#ffffff">ТАКСИ ГРАХОВО</text>
  <text x="100" y="500" font-family="Arial, Segoe UI, sans-serif" font-size="86" font-weight="900" fill="#ffffff">Закажите такси</text>
  <rect x="92" y="534" width="725" height="114" rx="25" fill="#ffd600"/>
  <text x="126" y="617" font-family="Arial, Segoe UI, sans-serif" font-size="86" font-weight="900" fill="#111111">за пару минут</text>
  <text x="100" y="710" font-family="Arial, Segoe UI, sans-serif" font-size="38" font-weight="600" fill="#ffffff">По Грахово и району</text>
  <text x="100" y="763" font-family="Arial, Segoe UI, sans-serif" font-size="38" font-weight="800" fill="#ffd600">Поездки от 150 ₽</text>

  <rect x="100" y="820" width="620" height="112" rx="30" fill="#ffd600"/>
  <text x="164" y="892" font-family="Arial, Segoe UI, sans-serif" font-size="45" font-weight="900" fill="#111111">Заказать такси  →</text>

  <g transform="translate(100 988)">
    <rect width="880" height="94" rx="25" fill="#ffffff"/>
    <circle cx="58" cy="47" r="26" fill="#ffd600"/>
    <path d="M49 36a7 7 0 1 1 10 10l-5 5-10-10 5-5m21 13a7 7 0 1 1 10 10l-5 5-10-10 5-5m-11-1 12 12" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>
    <text x="110" y="61" font-family="Arial, Segoe UI, sans-serif" font-size="39" font-weight="900" fill="#111111">taxigr.ru</text>
    <line x1="430" y1="20" x2="430" y2="74" stroke="#dedede" stroke-width="2"/>
    <text x="478" y="60" font-family="Arial, Segoe UI, sans-serif" font-size="32" font-weight="700" fill="#111111">Сайт приложения</text>
  </g>
  <g transform="translate(100 1105)">
    <rect width="425" height="94" rx="25" fill="#ffffff"/>
    <g transform="translate(12 10) scale(1.25)">${playMark}</g>
    <text x="115" y="60" font-family="Arial, Segoe UI, sans-serif" font-size="32" font-weight="800" fill="#111111">Google Play</text>
  </g>
  <g transform="translate(555 1105)">
    <rect width="425" height="94" rx="25" fill="#ffffff"/>
    <g transform="translate(12 10) scale(1.25)">${rustoreMark}</g>
    <text x="120" y="60" font-family="Arial, Segoe UI, sans-serif" font-size="34" font-weight="800" fill="#111111">RuStore</text>
  </g>
</svg>`);

async function build() {
  const logoWide = await sharp(avatar).resize(82, 82).png().toBuffer();
  const logoMobile = await sharp(avatar).resize(100, 100).png().toBuffer();

  await sharp(wideBackground)
    .resize(1920, 768, { fit: 'cover', position: 'centre' })
    .composite([
      { input: wideOverlay },
      { input: logoWide, left: 300, top: 47 },
    ])
    .png({ compressionLevel: 9, quality: 95 })
    .toFile(path.join(dir, 'vk-cover-v3.png'));

  await sharp(mobileBackground)
    .resize(1080, 1920, { fit: 'cover', position: 'centre' })
    .composite([
      { input: mobileOverlay },
      { input: logoMobile, left: 100, top: 260 },
    ])
    .png({ compressionLevel: 9, quality: 95 })
    .toFile(path.join(dir, 'vk-live-cover-v3.png'));

  console.log('Built VK cover v3: 1920x768 and 1080x1920.');
}

await build();
