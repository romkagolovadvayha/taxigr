import { createHash } from 'node:crypto';
import { isTaxiRequest, normalizeGroupTitle } from '../src/domain/group-alerts.ts';

export const TARGETS = [
  { provider: 'whatsapp', title: 'Грахово такси' },
  { provider: 'max', title: 'Такси 🚖 Грахово' },
];

// First pairing requires a unique exact title. Subsequent starts use the pinned ID.
export function selectGroup(groups, target, pinnedId) {
  const found = groups.filter(group => pinnedId ? group.id === pinnedId : normalizeGroupTitle(group.title) === normalizeGroupTitle(target));
  return found.length === 1 ? found[0] : null;
}

export function phoneUriFromJid(jid) {
  // An opaque WhatsApp LID must never be treated as a telephone number.
  const match = /^(\d{8,15})(?::\d+)?@s\.whatsapp\.net$/u.exec(jid || '');
  return match && /^[1-9]/u.test(match[1]) ? `tel:+${match[1]}` : undefined;
}

export function makeEvent(message, group, since, now = Date.now()) {
  if (!group || message.groupId !== group.id || message.fromMe || !message.id || typeof message.text !== 'string') return null;
  if (!Number.isSafeInteger(message.sentAt) || message.sentAt < since || message.sentAt < now - 3_600_000 || message.sentAt > now + 60_000) return null;
  if (!isTaxiRequest(message.text) || !message.text.trim() || message.text.length > 2000) return null;
  return {
    eventId: createHash('sha256').update(JSON.stringify([group.provider, group.id, message.id])).digest('hex'),
    provider: group.provider, groupId: group.id, groupTitle: group.title,
    text: message.text.trim(), sentAt: message.sentAt,
    ...(message.senderName ? { senderName: String(message.senderName).slice(0, 200) } : {}),
    ...(group.provider === 'whatsapp' && phoneUriFromJid(message.senderJid) ? { senderUri: phoneUriFromJid(message.senderJid) } : {}),
    ...(group.provider === 'max' && /^[1-9]\d{0,19}$/u.test(message.senderId || '') ? { senderId: message.senderId } : {}),
  };
}
