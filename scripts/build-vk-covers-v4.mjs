import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'assets', 'vk-community');
const store = path.join(root, 'assets', 'store');
const avatar = path.join(dir, 'vk-avatar.png');
const phoneSource = path.join(store, 'phone-order-v2.png');

const playMark = `
  <g transform="translate(17 15) scale(.68)">
    <path d="M0 2 L28 23 L0 46 Z" fill="#00c3ff"/>
    <path d="M0 2 L17 16 L28 23 L38 14 L8 0 Z" fill="#45d35f"/>
    <path d="M0 46 L17 30 L28 23 L38 32 L8 48 Z" fill="#ffcf32"/>
    <path d="M28 23 L38 14 L50 21 Q54 24 50 27 L38 32 Z" fill="#ff4b55"/>
  </g>`;

const rustoreMark = `
  <g transform="translate(17 13) scale(.68)">
    <path d="M4 4 Q4 0 8 2 L31 16 L20 26 L4 16 Z" fill="#8b5cf6"/>
    <path d="M31 16 L47 26 Q51 29 47 32 L31 42 L20 26 Z" fill="#18b7f1"/>
    <path d="M4 16 L20 26 L31 42 L8 50 Q4 52 4 47 Z" fill="#ff4ca0"/>
    <circle cx="25" cy="26" r="7" fill="#ffd600"/>
  </g>`;

const wideOverlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="768">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#111111" flood-opacity=".17"/>
    </filter>
  </defs>

  <text x="486" y="116" font-family="Arial, Segoe UI, sans-serif" font-size="31" font-weight="800" fill="#171717">ТАКСИ ГРАХОВО</text>
  <text x="390" y="218" font-family="Arial, Segoe UI, sans-serif" font-size="69" font-weight="900" fill="#111111">Заказ такси</text>
  <rect x="382" y="242" width="518" height="88" rx="22" fill="#ffd600"/>
  <text x="414" y="306" font-family="Arial, Segoe UI, sans-serif" font-size="62" font-weight="900" fill="#111111">за пару минут</text>
  <text x="390" y="376" font-family="Arial, Segoe UI, sans-serif" font-size="28" font-weight="600" fill="#383838">Маршрут и цена видны до заказа</text>

  <rect x="390" y="416" width="380" height="78" rx="22" fill="#ffd600" filter="url(#shadow)"/>
  <text x="438" y="466" font-family="Arial, Segoe UI, sans-serif" font-size="31" font-weight="900" fill="#111111">Заказать такси  →</text>

  <g transform="translate(390 542)">
    <rect width="205" height="64" rx="18" fill="#ffffff" stroke="#e5e5e5" stroke-width="2"/>
    <circle cx="35" cy="32" r="16" fill="#ffd600"/>
    <path d="M29 25a4 4 0 1 1 6 6l-3 3-6-6 3-3m13 8a4 4 0 1 1 6 6l-3 3-6-6 3-3m-7-1 7 7" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round"/>
    <text x="62" y="41" font-family="Arial, Segoe UI, sans-serif" font-size="25" font-weight="800" fill="#111111">taxigr.ru</text>
  </g>
  <g transform="translate(613 542)">
    <rect width="250" height="64" rx="18" fill="#ffffff" stroke="#e5e5e5" stroke-width="2"/>
    ${playMark}
    <text x="67" y="41" font-family="Arial, Segoe UI, sans-serif" font-size="23" font-weight="800" fill="#111111">Google Play</text>
  </g>
  <g transform="translate(881 542)">
    <rect width="208" height="64" rx="18" fill="#ffffff" stroke="#e5e5e5" stroke-width="2"/>
    ${rustoreMark}
    <text x="67" y="41" font-family="Arial, Segoe UI, sans-serif" font-size="24" font-weight="800" fill="#111111">RuStore</text>
  </g>

  <g filter="url(#shadow)">
    <rect x="1194" y="6" width="410" height="756" rx="60" fill="#111111"/>
    <rect x="1208" y="20" width="382" height="728" rx="48" fill="#ffffff"/>
  </g>
</svg>`);

const wideTop = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="768">
  <rect x="1324" y="32" width="150" height="34" rx="17" fill="#111111"/>
  <path d="M1233 72 Q1260 40 1300 28" fill="none" stroke="#ffffff" stroke-opacity=".30" stroke-width="8" stroke-linecap="round"/>
</svg>`);

const mobileOverlay = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#111111" flood-opacity=".16"/>
    </filter>
  </defs>
  <rect x="68" y="230" width="944" height="630" rx="46" fill="#ffffff" fill-opacity=".88"/>
  <text x="220" y="335" font-family="Arial, Segoe UI, sans-serif" font-size="43" font-weight="800" fill="#171717">ТАКСИ ГРАХОВО</text>
  <text x="105" y="482" font-family="Arial, Segoe UI, sans-serif" font-size="80" font-weight="900" fill="#111111">Заказ такси</text>
  <rect x="97" y="521" width="690" height="112" rx="27" fill="#ffd600"/>
  <text x="136" y="602" font-family="Arial, Segoe UI, sans-serif" font-size="78" font-weight="900" fill="#111111">за пару минут</text>
  <text x="105" y="691" font-family="Arial, Segoe UI, sans-serif" font-size="35" font-weight="600" fill="#383838">Маршрут и цена видны заранее</text>
  <rect x="105" y="738" width="560" height="102" rx="28" fill="#ffd600" filter="url(#shadow)"/>
  <text x="172" y="803" font-family="Arial, Segoe UI, sans-serif" font-size="40" font-weight="900" fill="#111111">Заказать такси  →</text>

  <g transform="translate(105 885)">
    <rect width="270" height="76" rx="21" fill="#ffffff" stroke="#e3e3e3" stroke-width="2"/>
    <circle cx="42" cy="38" r="19" fill="#ffd600"/>
    <path d="M35 30a5 5 0 1 1 7 7l-3 3-7-7 3-3m15 10a5 5 0 1 1 7 7l-3 3-7-7 3-3m-8-2 9 9" fill="none" stroke="#111" stroke-width="4" stroke-linecap="round"/>
    <text x="75" y="49" font-family="Arial, Segoe UI, sans-serif" font-size="31" font-weight="800" fill="#111111">taxigr.ru</text>
  </g>
  <g transform="translate(395 885)">
    <rect width="300" height="76" rx="21" fill="#ffffff" stroke="#e3e3e3" stroke-width="2"/>
    <g transform="translate(3 6) scale(1.08)">${playMark}</g>
    <text x="82" y="49" font-family="Arial, Segoe UI, sans-serif" font-size="28" font-weight="800" fill="#111111">Google Play</text>
  </g>
  <g transform="translate(715 885)">
    <rect width="260" height="76" rx="21" fill="#ffffff" stroke="#e3e3e3" stroke-width="2"/>
    <g transform="translate(3 6) scale(1.08)">${rustoreMark}</g>
    <text x="82" y="49" font-family="Arial, Segoe UI, sans-serif" font-size="29" font-weight="800" fill="#111111">RuStore</text>
  </g>

  <g filter="url(#shadow)">
    <rect x="310" y="1000" width="460" height="902" rx="66" fill="#111111"/>
    <rect x="325" y="1015" width="430" height="872" rx="52" fill="#ffffff"/>
  </g>
</svg>`);

const mobileTop = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect x="462" y="1028" width="156" height="38" rx="19" fill="#111111"/>
  <path d="M352 1080 Q380 1040 425 1024" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="9" stroke-linecap="round"/>
</svg>`);

async function roundedScreen(width, height, radius) {
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`);
  return sharp(phoneSource)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

const logoWide = await sharp(avatar).resize(76, 76).png().toBuffer();
const logoMobile = await sharp(avatar).resize(94, 94).png().toBuffer();
const wideScreen = await roundedScreen(366, 714, 42);
const mobileScreen = await roundedScreen(416, 858, 46);

await sharp(path.join(dir, 'vk-cover-v4-background.png'))
  .resize(1920, 768, { fit: 'cover' })
  .composite([
    { input: wideOverlay },
    { input: logoWide, left: 390, top: 58 },
    { input: wideScreen, left: 1216, top: 27 },
    { input: wideTop },
  ])
  .png({ compressionLevel: 9, quality: 95 })
  .toFile(path.join(dir, 'vk-cover-v4.png'));

await sharp(path.join(dir, 'vk-live-cover-v4-background.png'))
  .resize(1080, 1920, { fit: 'cover' })
  .composite([
    { input: mobileOverlay },
    { input: logoMobile, left: 105, top: 265 },
    { input: mobileScreen, left: 332, top: 1022 },
    { input: mobileTop },
  ])
  .png({ compressionLevel: 9, quality: 95 })
  .toFile(path.join(dir, 'vk-live-cover-v4.png'));

console.log('Built VK app-style covers v4: 1920x768 and 1080x1920.');
