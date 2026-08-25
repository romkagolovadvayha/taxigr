import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const token = process.env.VK_BOT_TOKEN;
const groupId = process.env.VK_COMMUNITY_ID ?? '193790756';
const version = process.env.VK_API_VERSION ?? '5.199';
const coverName = process.argv[2] || 'vk-cover-v4.png';
const coverPath = path.join(root, 'assets', 'vk-community', coverName);

if (!token) throw new Error('VK_BOT_TOKEN is not configured.');

async function vk(method, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token, v: version });
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    body,
  });
  const payload = await response.json();
  if (payload.error) throw new Error(`${method}: ${payload.error.error_msg}`);
  return payload.response;
}

const server = await vk('photos.getOwnerCoverPhotoUploadServer', {
  group_id: groupId,
  crop_x: '0',
  crop_y: '0',
  crop_x2: '1920',
  crop_y2: '768',
});

const form = new FormData();
form.append('photo', new Blob([await fs.readFile(coverPath)], { type: 'image/png' }), coverName);
const uploadResponse = await fetch(server.upload_url, { method: 'POST', body: form });
const uploaded = await uploadResponse.json();

if (!uploaded.hash || !uploaded.photo) throw new Error('VK did not accept the cover upload.');

const saved = await vk('photos.saveOwnerCoverPhoto', {
  hash: uploaded.hash,
  photo: uploaded.photo,
});

const largest = saved.images?.at(-1);
console.log(`VK cover updated${largest ? `: ${largest.width}x${largest.height}` : ''}.`);
