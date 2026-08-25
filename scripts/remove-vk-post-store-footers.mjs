import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets', 'vk-community');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const token = process.env.VK_USER_TOKEN ?? process.env.VK_BOT_TOKEN;
const groupId = process.env.VK_COMMUNITY_ID ?? '193790756';
const ownerId = `-${groupId}`;
const version = process.env.VK_API_VERSION ?? '5.199';

if (!token) throw new Error('VK_USER_TOKEN or VK_BOT_TOKEN is not configured.');

const allJobs = [
  { postId: 982, source: 'post-welcome-v2.png', output: 'post-welcome-v4.png' },
  { postId: 981, source: 'post-how-to-order-v2-route150.png', output: 'post-how-to-order-v4.png' },
  { postId: 980, source: 'post-benefits-v2-route150.png', output: 'post-benefits-v4.png' },
  { postId: 979, source: 'post-first-order-v2-route150.png', output: 'post-first-order-v4.png' },
  { postId: 977, source: 'post-safety-v2-route150.png', output: 'post-safety-v4.png' },
  { postId: 978, source: 'post-drivers-v2.png', output: 'post-drivers-v4.png' },
];
const requestedPostIds = new Set(process.argv.slice(2).map(Number).filter(Number.isInteger));
const jobs = requestedPostIds.size > 0
  ? allJobs.filter((job) => requestedPostIds.has(job.postId))
  : allJobs;

async function vk(method, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token, v: version });
  const response = await fetch(`https://api.vk.com/method/${method}`, { method: 'POST', body });
  const payload = await response.json();
  if (payload.error) throw new Error(`${method}: ${payload.error.error_msg}`);
  return payload.response;
}

async function uploadWallPhoto(filePath) {
  const server = await vk('photos.getWallUploadServer', { group_id: groupId });
  const form = new FormData();
  form.append('photo', new Blob([await fs.readFile(filePath)], { type: 'image/png' }), path.basename(filePath));
  const uploadResponse = await fetch(server.upload_url, { method: 'POST', body: form });
  const uploadText = await uploadResponse.text();
  let uploaded;
  try {
    uploaded = JSON.parse(uploadText);
  } catch {
    throw new Error(`VK photo upload returned HTTP ${uploadResponse.status} instead of JSON.`);
  }
  if (!uploaded.server || !uploaded.photo || !uploaded.hash) throw new Error(`Photo upload failed: ${path.basename(filePath)}`);
  const saved = await vk('photos.saveWallPhoto', {
    group_id: groupId,
    server: String(uploaded.server),
    photo: uploaded.photo,
    hash: uploaded.hash,
  });
  return saved[0];
}

for (const job of jobs) {
  const sourcePath = path.join(assets, job.source);
  const outputPath = path.join(assets, job.output);
  await fs.copyFile(sourcePath, outputPath);

  const photo = await uploadWallPhoto(outputPath);
  await vk('wall.edit', {
    owner_id: ownerId,
    post_id: String(job.postId),
    attachments: `photo${photo.owner_id}_${photo.id}`,
  });
  console.log(`Updated VK post ${job.postId}: ${job.output}`);
}

console.log(`Removed store footers from ${jobs.length} existing VK posts.`);
