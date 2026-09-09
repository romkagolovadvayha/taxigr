import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { parse } from 'dotenv';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'assets/vk-community/yellow-2026');
const content = JSON.parse(await fs.readFile(path.join(directory, 'content.json'), 'utf8'));
const journalPath = path.join(root, 'tmp/vk-yellow/applied.json');
const environment = {};
for (const file of ['.env', '.env.local']) {
  Object.assign(environment, parse(await fs.readFile(path.join(root, file), 'utf8').catch(() => '')));
}
const groupId = String(content.communityId);
if (groupId !== '193790756' || environment.VK_COMMUNITY_ID !== groupId) throw new Error('Unexpected community.');
const part = process.argv.find(arg => arg.startsWith('--part='))?.slice(7) || 'all';
const apply = process.argv.includes('--apply');
const journal = JSON.parse(await fs.readFile(journalPath, 'utf8').catch(() => '{}'));
const saveJournal = async () => {
  await fs.mkdir(path.dirname(journalPath), { recursive: true });
  await fs.writeFile(journalPath, JSON.stringify(journal, null, 2) + '\n');
};
let lastRequest = 0;
async function vk(method, params = {}, kind = 'user') {
  await delay(Math.max(0, 650 - (Date.now() - lastRequest)));
  lastRequest = Date.now();
  const token = environment[kind === 'user' ? 'VK_USER_TOKEN' : 'VK_BOT_TOKEN'];
  if (!token) throw new Error(`Missing ${kind} token.`);
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST', signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({ ...params, access_token: token, v: environment.VK_API_VERSION || '5.199' }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.error_code} ${body.error.error_msg}`);
  if (!response.ok || body.response === undefined) throw new Error(`${method}: HTTP ${response.status}`);
  return body.response;
}
async function upload(url, filename) {
  const destination = new URL(url);
  if (destination.protocol !== 'https:' || !/(^|\.)(vk\.com|vk\.ru|userapi\.com)$/.test(destination.hostname)) throw new Error('Unexpected VK upload destination.');
  const file = await fs.readFile(path.join(directory, filename));
  const form = new FormData();
  form.append('photo', new Blob([file], { type: filename.endsWith('.png') ? 'image/png' : 'image/jpeg' }), filename);
  const response = await fetch(destination, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(`Upload ${filename}: HTTP ${response.status}, VK did not accept the image.`);
  if (!result.photo || !result.hash) {
    await fs.writeFile(path.join(root, 'tmp/vk-yellow/upload-response.json'), JSON.stringify(result));
    throw new Error(`Upload ${filename}: missing photo/hash; response fields: ${Object.keys(result).join(',')}.`);
  }
  return result;
}
async function once(key, fingerprint, operation) {
  if (journal[key]?.fingerprint === fingerprint) return journal[key].result;
  const result = await operation();
  journal[key] = { fingerprint, appliedAt: new Date().toISOString(), result };
  await saveJournal();
  console.log(`Applied: ${key}`);
  return result;
}
async function optionalSetting(key, operation) {
  try { await operation(); return true; }
  catch (error) {
    if (!/: (3|15|27) /.test(error.message)) throw error;
    journal.pendingSettings ??= {};
    journal.pendingSettings[key] = error.message;
    await saveJournal();
    console.log(`Pending setting ${key}: ${error.message}`);
    return false;
  }
}
const fingerprint = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
async function artwork(filename, operation) {
  return once(filename, fingerprint(await fs.readFile(path.join(directory, filename))), operation);
}
async function wallPhoto(filename) {
  return artwork(filename, async () => {
    const server = await vk('photos.getWallUploadServer', { group_id: groupId });
    const uploaded = await upload(server.upload_url, filename);
    const photos = await vk('photos.saveWallPhoto', { group_id: groupId, server: uploaded.server, hash: uploaded.hash, photo: uploaded.photo });
    // VK may keep an uploaded wall attachment under the uploading administrator.
    if (!photos?.[0]?.id || ![-Number(groupId), server.user_id].includes(photos[0].owner_id)) throw new Error('Unexpected saved photo owner.');
    return { ownerId: photos[0].owner_id, id: photos[0].id };
  });
}
async function cover(filename, width, height) {
  return artwork(filename, async () => {
    const params = { group_id: groupId, crop_x: '0', crop_y: '0', crop_x2: String(width), crop_y2: String(height) };
    const server = await vk('photos.getOwnerCoverPhotoUploadServer', params, 'group');
    const uploaded = await upload(server.upload_url, filename);
    const saved = await vk('photos.saveOwnerCoverPhoto', { hash: uploaded.hash, photo: uploaded.photo }, 'group');
    return { images: saved.images, saved: true };
  });
}
async function community() {
  const response = await vk('groups.getById', { group_ids: groupId, fields: 'description,status,site,cover,links,menu,photo_200,photo_max,action_button,live_covers' });
  const group = response.groups?.[0] ?? response[0];
  if (group?.id !== Number(groupId) || group?.admin_level !== 3) throw new Error('Administrator access to expected community was not confirmed.');
  return group;
}
if (!apply && part !== 'verify') {
  console.log(JSON.stringify({ dryRun: true, community: content.community, part, title: content.name, status: content.status, posts: content.posts.map(post => ({ id: post.id, file: post.file })) }, null, 2));
} else {
  let group = await community();
  if (['all', 'metadata'].includes(part)) {
    const metadata = { group_id: groupId, title: content.name, description: content.description, website: content.website };
    await once('metadata', fingerprint(metadata), () => vk('groups.edit', metadata, 'group'));
    await optionalSetting('status', () => once('status', fingerprint(content.status), () => vk('status.set', { group_id: groupId, text: content.status })));
    for (const link of content.links) {
      const normalize = value => value.replace('vk.com/', 'vk.ru/').replace(/\/$/, '');
      const existing = group.links?.find(item => normalize(item.url) === normalize(link.url));
      const supported = await optionalSetting('links', () => once(`link:${link.url}`, fingerprint(link), async () => {
        if (existing) return vk('groups.editLink', { group_id: groupId, link_id: String(existing.id), text: link.text });
        const added = await vk('groups.addLink', { group_id: groupId, link: link.url, text: link.text });
        return { id: added.id, url: added.url };
      }));
      if (!supported) break;
    }
  }
  if (['all', 'art'].includes(part)) {
    await artwork('avatar.png', async () => {
      const server = await vk('photos.getOwnerPhotoUploadServer', { owner_id: `-${groupId}` });
      const uploaded = await upload(server.upload_url, 'avatar.png');
      const saved = await vk('photos.saveOwnerPhoto', { server: uploaded.server, hash: uploaded.hash, photo: uploaded.photo });
      return { saved: true, photoSource: saved.photo_src, postId: saved.post_id };
    });
    await cover('cover-desktop.jpg', 1920, 768);
    // Uploading with is_video_cover does not enable a community live cover.
    // Keep the vertical asset for the community's live-cover settings in VK.
  }
  if (['all', 'posts'].includes(part)) {
    for (const post of content.posts) {
      const photo = await wallPhoto(post.file);
      const update = { owner_id: `-${groupId}`, post_id: String(post.id), message: post.text, attachments: `photo${photo.ownerId}_${photo.id}` };
      await once(`post:${post.id}`, fingerprint(update), () => vk('wall.edit', update));
      if (post.pinned) await once('pinned', String(post.id), () => vk('wall.pin', { owner_id: `-${groupId}`, post_id: String(post.id) }));
    }
  }
  if (part === 'publish') {
    // Explicit release publication for legacy posts whose VK editing window expired.
    for (const post of [...content.posts].reverse()) {
      const photo = await wallPhoto(post.file);
      const payload = { owner_id: `-${groupId}`, from_group: '1', signed: '0', message: post.text, attachments: `photo${photo.ownerId}_${photo.id}`, guid: `taxigr-yellow-20260909-${post.key}` };
      const saved = await once(`published:${post.key}`, fingerprint(payload), () => vk('wall.post', payload));
      if (!saved.post_id) throw new Error('VK did not return the new post ID.');
      if (post.pinned) await once('pinned', String(saved.post_id), () => vk('wall.pin', { owner_id: `-${groupId}`, post_id: String(saved.post_id) }));
    }
    const replacements = content.posts.map(post => [post.id, journal[`published:${post.key}`].result.post_id]);
    for (const post of content.posts) {
      post.previousId ??= post.id;
      post.id = journal[`published:${post.key}`].result.post_id;
    }
    for (const item of [...content.menu, ...content.links]) {
      for (const [oldId, newId] of replacements) item.url = item.url.replace(`wall-${groupId}_${oldId}`, `wall-${groupId}_${newId}`);
    }
    await fs.writeFile(path.join(directory, 'content.json'), JSON.stringify(content, null, 2) + '\n');
  }
  group = await community();
  const posts = await vk('wall.getById', { posts: content.posts.map(post => `-${groupId}_${post.id}`).join(',') });
  const snapshot = { checkedAt: new Date().toISOString(), group, posts };
  await fs.writeFile(path.join(root, 'tmp/vk-yellow/after.json'), JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify({ groupId: group.id, name: group.name, descriptionMatches: group.description === content.description, statusMatches: group.status === content.status, websiteMatches: group.site === content.website, coverEnabled: group.cover?.enabled, menu: group.menu?.items?.map(item => ({ id: item.id, title: item.title })), posts: (posts.items ?? posts).map(post => ({ id: post.id, textMatches: post.text === content.posts.find(item => item.id === post.id)?.text, photos: post.attachments?.filter(item => item.type === 'photo').map(item => item.photo.id) })) }, null, 2));
}
