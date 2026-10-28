import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { PLAY_REVIEW_CODE, PLAY_REVIEW_PHONE } from '../play-review-auth';
import { checkStoreReviewAuth } from '../store-review-check';

const root = new URL('../../', import.meta.url);
const app = JSON.parse(await readFile(new URL('app.json', root), 'utf8'));
const version: string = app.expo.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
const directory = new URL(`tmp/store-release-${version}/`, root);

// Write fresh instructions only after the real account passes all login checks.
const checks = await checkStoreReviewAuth('https://api.taxigr.ru');
const verifiedAt = new Date().toISOString();
const moderInfo = `Тестовый вход: «Войти по SMS» → ${PLAY_REVIEW_PHONE} → «Получить код по SMS» → код ${PLAY_REVIEW_CODE}. SMS не требуется. Пассажир. Проверено ${verifiedAt.slice(0, 10)}.`;
if (moderInfo.length > 180) throw new Error('RuStore moderator comment exceeds 180 characters');

await mkdir(directory, { recursive: true });
await writeFile(new URL('rustore-review.json', directory), JSON.stringify({
  version,
  versionCode: app.expo.android.versionCode,
  apiOrigin: 'https://api.taxigr.ru',
  verifiedAt,
  checks,
  moderInfo,
}, null, 2) + '\n');
await writeFile(new URL('moderator-comment.txt', directory), moderInfo + '\n');
console.log(`Production reviewer login verified. Comment: ${fileURLToPath(new URL('moderator-comment.txt', directory))}`);
