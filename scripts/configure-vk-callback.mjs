import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const token = process.env.VK_USER_TOKEN;
const groupId = process.env.VK_COMMUNITY_ID;
const secret = process.env.VK_CALLBACK_SECRET;
const version = process.env.VK_API_VERSION || '5.199';
const callbackUrl = process.env.VK_CALLBACK_URL || 'https://api.taxigr.ru/v1/webhooks/vk';
const title = process.env.VK_CALLBACK_TITLE || 'Такси Грахово';

if (!token) throw new Error('VK_USER_TOKEN must be configured in .env.local.');
if (!groupId || !/^\d+$/u.test(groupId)) throw new Error('VK_COMMUNITY_ID is not configured.');
if (!secret) throw new Error('VK_CALLBACK_SECRET is not configured.');

async function vk(method, params = {}) {
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, access_token: token, v: version }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error || payload.response === undefined) {
    throw new Error(`${method}: ${payload.error?.error_msg ?? `HTTP ${response.status}`}`);
  }
  return payload.response;
}

const listed = await vk('groups.getCallbackServers', { group_id: groupId });
const servers = Array.isArray(listed?.items) ? listed.items : [];
const existing = servers.find((server) => server.url === callbackUrl);

let serverId;
if (existing) {
  serverId = existing.id;
  await vk('groups.editCallbackServer', {
    group_id: groupId,
    server_id: String(serverId),
    url: callbackUrl,
    title,
    secret_key: secret,
  });
  console.log(`Updated VK Callback API server ${serverId}.`);
} else {
  const added = await vk('groups.addCallbackServer', {
    group_id: groupId,
    url: callbackUrl,
    title,
    secret_key: secret,
  });
  serverId = typeof added === 'object' && added !== null ? added.server_id : added;
  console.log(`Added VK Callback API server ${serverId}.`);
}

if (!Number.isInteger(Number(serverId))) {
  throw new Error('VK Callback API did not return a valid server_id.');
}

await vk('groups.setCallbackSettings', {
  group_id: groupId,
  server_id: String(serverId),
  api_version: version,
  message_new: '1',
  message_event: '1',
  message_allow: '1',
  message_deny: '1',
});

console.log(`Enabled message_new, message_event, message_allow and message_deny for ${callbackUrl}.`);
