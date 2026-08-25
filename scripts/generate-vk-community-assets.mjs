import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets', 'vk-community');
const brand = path.join(root, 'assets', 'brand');
const store = path.join(root, 'assets', 'store');

const esc = (value) => value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);

function svg(width, height, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      .title { font-family: Arial, 'Segoe UI', sans-serif; font-weight: 800; fill: #181818; }
      .body { font-family: Arial, 'Segoe UI', sans-serif; font-weight: 500; fill: #181818; }
      .muted { font-family: Arial, 'Segoe UI', sans-serif; font-weight: 600; fill: #5d5d57; }
    </style>
    ${body}
  </svg>`);
}

async function renderCover() {
  const logo = await sharp(path.join(brand, 'logo-monochrome.svg')).resize(92, 92).png().toBuffer();
  const overlay = svg(1590, 400, `
    <defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#FFD600" stop-opacity=".98"/><stop offset=".52" stop-color="#FFD600" stop-opacity=".86"/><stop offset=".78" stop-color="#FFD600" stop-opacity="0"/></linearGradient></defs>
    <rect width="1080" height="400" fill="url(#fade)"/>
    <rect x="54" y="58" width="112" height="112" rx="28" fill="#FFD600" stroke="#181818" stroke-width="4"/>
    <text class="title" x="194" y="122" font-size="68">Такси Грахово</text>
    <text class="body" x="194" y="174" font-size="31">Быстро. Рядом. Для вас.</text>
    <rect x="194" y="221" width="370" height="62" rx="31" fill="#181818"/>
    <text x="379" y="261" text-anchor="middle" font-family="Arial, 'Segoe UI', sans-serif" font-size="25" font-weight="700" fill="#fff">Заказать на taxigr.ru</text>
  `);
  await sharp(path.join(out, 'cover-background.png'))
    .resize(1590, 400, { fit: 'cover' })
    .composite([{ input: overlay }, { input: logo, left: 64, top: 68 }])
    .png()
    .toFile(path.join(out, 'vk-cover.png'));
}

async function renderAvatar() {
  await sharp(path.join(brand, 'icon.png')).resize(800, 800).png().toFile(path.join(out, 'vk-avatar.png'));
}

async function renderWelcome() {
  const feature = await sharp(path.join(store, 'play-feature-graphic.png')).resize(984, 480, { fit: 'cover' }).png().toBuffer();
  const layer = svg(1080, 1080, `
    <rect width="1080" height="1080" fill="#F4F4F2"/>
    <rect x="48" y="48" width="984" height="480" rx="38" fill="#FFD600"/>
    <text class="title" x="64" y="640" font-size="70">Добро пожаловать!</text>
    <text class="body" x="64" y="708" font-size="34">Официальное сообщество сервиса</text>
    <text class="body" x="64" y="754" font-size="34">«Такси Грахово»</text>
    <rect x="64" y="828" width="952" height="142" rx="36" fill="#FFD600"/>
    <text class="title" x="540" y="888" text-anchor="middle" font-size="37">Заказ онлайн — taxigr.ru</text>
    <text class="muted" x="540" y="935" text-anchor="middle" font-size="25">Цена видна до оформления поездки</text>
  `);
  await sharp(layer).composite([{ input: feature, left: 48, top: 48 }]).png().toFile(path.join(out, 'post-welcome.png'));
}

async function renderHowToOrder() {
  const screen = await sharp(path.join(store, 'phone-home.png')).resize(410, 328, { fit: 'cover' }).png().toBuffer();
  const layer = svg(1080, 1080, `
    <rect width="1080" height="1080" fill="#FFD600"/>
    <text class="title" x="64" y="116" font-size="67">Как заказать такси</text>
    <text class="body" x="64" y="172" font-size="29">Три простых шага в приложении</text>
    <rect x="56" y="230" width="968" height="760" rx="42" fill="#F4F4F2"/>
    <circle cx="126" cy="350" r="34" fill="#181818"/><text x="126" y="362" text-anchor="middle" font-family="Arial" font-size="29" font-weight="700" fill="#FFD600">1</text>
    <text class="title" x="180" y="340" font-size="31">Укажите маршрут</text><text class="muted" x="180" y="378" font-size="22">Откуда и куда</text>
    <circle cx="126" cy="488" r="34" fill="#181818"/><text x="126" y="500" text-anchor="middle" font-family="Arial" font-size="29" font-weight="700" fill="#FFD600">2</text>
    <text class="title" x="180" y="478" font-size="31">Выберите тариф</text><text class="muted" x="180" y="516" font-size="22">Эконом или Детский</text>
    <circle cx="126" cy="626" r="34" fill="#181818"/><text x="126" y="638" text-anchor="middle" font-family="Arial" font-size="29" font-weight="700" fill="#FFD600">3</text>
    <text class="title" x="180" y="616" font-size="31">Подтвердите</text><text class="muted" x="180" y="654" font-size="22">Следите за статусом</text>
    <rect x="554" y="310" width="410" height="328" rx="28" fill="#fff"/>
    <rect x="92" y="804" width="896" height="104" rx="30" fill="#181818"/>
    <text x="540" y="868" text-anchor="middle" font-family="Arial" font-size="35" font-weight="700" fill="#fff">taxigr.ru</text>
  `);
  await sharp(layer).composite([{ input: screen, left: 554, top: 310 }]).png().toFile(path.join(out, 'post-how-to-order.png'));
}

async function renderBenefits() {
  const layer = svg(1080, 1080, `
    <rect width="1080" height="1080" fill="#181818"/>
    <rect x="48" y="48" width="984" height="984" rx="52" fill="#FFD600"/>
    <text class="title" x="96" y="154" font-size="72">Всё понятно</text>
    <text class="title" x="96" y="229" font-size="72">до поездки</text>
    ${[
      ['01', 'Цена заранее', 'Оценка стоимости до заказа'],
      ['02', 'Машина на карте', 'Статус водителя на экране'],
      ['03', 'Детский тариф', 'Поездка с подходящим креслом'],
      ['04', 'История поездок', 'Все завершённые заказы в профиле'],
    ].map(([n, title, text], i) => {
      const y = 352 + i * 154;
      return `<circle cx="142" cy="${y}" r="44" fill="#181818"/><text x="142" y="${y + 11}" text-anchor="middle" font-family="Arial" font-size="25" font-weight="700" fill="#FFD600">${n}</text><text class="title" x="218" y="${y - 4}" font-size="36">${esc(title)}</text><text class="body" x="218" y="${y + 38}" font-size="25">${esc(text)}</text>`;
    }).join('')}
    <text class="title" x="96" y="970" font-size="35">Такси Грахово · taxigr.ru</text>
  `);
  await sharp(layer).png().toFile(path.join(out, 'post-benefits.png'));
}

async function renderArticleCover() {
  const car = await sharp(path.join(root, 'assets', 'hero', 'taxi-car.webp')).resize({ width: 590, height: 330, fit: 'inside' }).png().toBuffer();
  const layer = svg(1200, 630, `
    <rect width="1200" height="630" fill="#FFD600"/>
    <text class="title" x="62" y="118" font-size="59">Первый заказ:</text>
    <text class="title" x="62" y="184" font-size="59">пошаговая инструкция</text>
    <text class="body" x="64" y="250" font-size="29">От входа до встречи с водителем</text>
    <rect x="62" y="338" width="384" height="82" rx="28" fill="#181818"/>
    <text x="254" y="389" text-anchor="middle" font-family="Arial" font-size="29" font-weight="700" fill="#fff">taxigr.ru</text>
  `);
  await sharp(layer).composite([{ input: car, left: 610, top: 278 }]).png().toFile(path.join(out, 'article-first-order.png'));
}

await Promise.all([renderCover(), renderAvatar(), renderWelcome(), renderHowToOrder(), renderBenefits(), renderArticleCover()]);
console.log(`VK community assets generated in ${out}`);
