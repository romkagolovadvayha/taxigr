import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const directory = path.resolve(import.meta.dirname, '../assets/vk-community/yellow-2026');
const source = path.join(directory, 'sources/cover-desktop-safe.png');
const file = 'cover-desktop-safe.jpg';
const buffer = await sharp(source).resize(1920, 768, { fit: 'fill' }).png().toBuffer();
await sharp(buffer).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(path.join(directory, file));
await sharp(buffer).extract({ left: 0, top: 129, width: 1920, height: 639 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(directory, 'cover-desktop-safe-pc-preview.jpg'));

const writeJson = (name, data) => fs.writeFile(path.join(directory, name), JSON.stringify(data, null, 2) + '\n');
const sources = JSON.parse(await fs.readFile(path.join(directory, 'sources.json'), 'utf8'));
sources.images = sources.images.filter(item => item.key !== 'cover-desktop-safe');
sources.images.push({ key: 'cover-desktop-safe', source: 'sources/cover-desktop-safe.png', file,
  width: 1920, height: 768, generationId: 'exec-1486b9a3-b323-455d-960f-85e4ab0d825f' });
await writeJson('sources.json', sources);
const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
manifest.files = manifest.files.filter(item => item.file !== file);
manifest.files.push({ file, width: 1920, height: 768, aiGenerated: true });
await writeJson('manifest.json', manifest);
const bytes = await fs.readFile(path.join(directory, file));
await writeJson('cover-safe-report.json', {
  preparedAt: new Date().toISOString(), community: 'https://vk.ru/taxigr', file,
  width: 1920, height: 768, bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  liveUpdate: 'NOT_APPLIED',
  reason: 'Browser site-safety policy blocks access to vk.ru/taxigr. No permission prompt or Auto-review was attempted. No API workaround was used.',
  desktopPreview: { top: 129, left: 0, width: 1920, height: 639 },
  layoutReference: 'https://ohvat.top/vk-cover-size',
  evidence: 'Published cover layout reference, consistent with the crop boundary in the user-provided VK editor screenshot. Local crop preview only; live VK display not verified.',
  originalLiveArtworkPreserved: 'cover-desktop.jpg',
});

await fs.writeFile(path.join(directory, 'cover-safe-preview.html'), `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Обложка VK — исправленная обрезка</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f8f6ef;color:#28251e;font:16px/1.6 system-ui,sans-serif}main{max-width:1280px;margin:auto;padding:36px 24px 64px}h1{font-size:clamp(28px,4vw,44px);line-height:1.15;letter-spacing:-1px;margin:0 0 14px}p{max-width:860px;margin:0 0 20px}.tag{color:#79612e;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.download,button{font:inherit;border:1px solid #d9d2c0;border-radius:12px;padding:10px 18px;background:white;color:inherit;cursor:pointer;text-decoration:none}button[aria-pressed=true],.download{background:#ffdb49;border-color:#ffdb49;font-weight:650}.note{padding:16px 20px;border-radius:16px;background:#fff1c3;margin-bottom:24px}.frame{position:relative;aspect-ratio:1920/639;overflow:hidden;border-radius:16px;background:#eae5d8;box-shadow:0 8px 28px #40320b12}.frame img{display:block;width:100%;height:auto;position:absolute;left:0;top:0;transform:translateY(-16.796875%)}.full .frame{aspect-ratio:1920/768}.full .frame img{transform:none}.guide{display:none;position:absolute;inset:0 0 auto;height:16.796875%;border-bottom:2px dashed #bc4934;background:#38210c3b;color:#fff;padding:10px 16px;font-size:clamp(10px,1.3vw,16px)}.full .guide{display:block}h2{font-size:22px;line-height:1.25;margin:32px 0 14px}.caption{font-size:14px;color:#6a6457;margin-top:12px}a{color:#755b18;text-underline-offset:4px}footer{margin-top:30px;font-size:14px}.old{opacity:.85}@media(max-width:600px){main{padding:24px 14px 40px}.actions{gap:8px}button,.download{font-size:14px;padding:9px 12px}.guide{padding:4px 8px}.note{font-size:14px}}
</style><main><div class="tag">Такси Грахово · оформление VK</div>
<h1>Логотип больше не попадает под обрезку</h1>
<p>Размер файла — 1920 × 768. Логотип, заголовок и адрес сайта перенесены ниже верхней полосы. Нижняя левая часть оставлена под аватар.</p>
<div class="note"><strong>Готово к ручной загрузке.</strong> В группе обложка пока не заменена: доступ агента к VK заблокирован политикой безопасности браузера.</div>
<div class="actions"><a class="download" href="cover-desktop-safe.jpg" download>Скачать обложку 1920 × 768</a><button id="pc" aria-pressed="true">Обрезка на ПК</button><button id="full" aria-pressed="false">Полный файл и разметка</button></div>
<section id="comparison"><h2>Исправленная обложка</h2><div class="frame"><img src="cover-desktop-safe.jpg" alt="Исправленная жёлтая обложка Такси Грахово"><div class="guide">Верхние 129 px скрываются на ПК</div></div>
<p class="caption">Локальная проверка по разметке. Фактический вид в VK после загрузки ещё не проверен.</p>
<h2>Прежняя обложка — для сравнения</h2><div class="frame old"><img src="cover-desktop.jpg" alt="Прежняя обложка: верх логотипа попадает под обрезку"><div class="guide">Верхние 129 px скрываются на ПК</div></div></section>
<footer><p>В редактор VK загрузите <strong>cover-desktop-safe.jpg</strong> целиком, без дополнительной обрезки. Изображение с суффиксом <strong>pc-preview</strong> служит только для проверки.</p><a href="https://ohvat.top/vk-cover-size">Источник размеров и разметки</a> · <a href="cover-safe-report.json">Статус подготовки</a> · <a href="index.html">Все материалы VK</a></footer>
<script>const area=document.getElementById('comparison'),pc=document.getElementById('pc'),full=document.getElementById('full');function view(isFull){area.classList.toggle('full',isFull);pc.setAttribute('aria-pressed',String(!isFull));full.setAttribute('aria-pressed',String(isFull))}pc.addEventListener('click',()=>view(false));full.addEventListener('click',()=>view(true));</script></main></html>`);
console.log(JSON.stringify({ file, width: 1920, height: 768, bytes: bytes.length, liveUpdate: 'NOT_APPLIED' }));
