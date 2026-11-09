import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent, selectGroup, phoneUriFromJid, whatsappReplyTarget, isGroupBookingRequest } from '../core.mjs';
import { EventQueue } from '../queue.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const now = Date.now();
const group = { provider: 'whatsapp', id: 'chosen@g.us', title: 'Грахово такси' };
const message = { id: 'm1', groupId: group.id, text: 'Кто?', sentAt: now, senderJid: '79990000000@s.whatsapp.net' };
test('only selected group, new inbound requests are captured', () => {
  assert.ok(makeEvent(message, group, now - 1000, now));
  for (const override of [{ groupId: 'private@s.whatsapp.net' }, { fromMe: true }, { sentAt: now - 2000 }, { text: 'Спасибо' }, { sentAt: now + 120000 }]) {
    assert.equal(makeEvent({ ...message, ...override }, group, now - 1000, now), null);
  }
});
test('opaque LID and message telephone are not attributed to sender', () => {
  assert.equal(phoneUriFromJid('12345678900@lid'), undefined);
  assert.equal(makeEvent({ ...message, senderJid: '12345678900@lid', text: 'Кто? +79990000000' }, group, now - 1000, now).senderUri, undefined);
  assert.equal(phoneUriFromJid('79990000000:3@s.whatsapp.net'), 'tel:+79990000000');
});
test('private WhatsApp replies use the participant address and never a group address', () => {
  assert.equal(whatsappReplyTarget('12345678900:2@lid', '79990000000:3@s.whatsapp.net'), '79990000000@s.whatsapp.net');
  assert.equal(whatsappReplyTarget('12345678900:2@lid'), '12345678900@lid');
  assert.equal(whatsappReplyTarget('79990000000@g.us', '+79990000000'), undefined);
});
test('general groups only get replies to explicit ride requests', () => {
  assert.equal(isGroupBookingRequest('Кто?', now, now, true), true);
  assert.equal(isGroupBookingRequest('Кто?', now, now, false), false);
  assert.equal(isGroupBookingRequest('Кто таксует?', now, now, false), true);
  assert.equal(isGroupBookingRequest('Нашли такси, отбой', now, now, false), false);
  assert.equal(isGroupBookingRequest('Нужно такси', now - 180_001, now, false), false);
});
test('a WhatsApp recipient can receive at most one reply in 15 minutes', () => {
  const queue = new EventQueue(':memory:');
  try {
    assert.equal(queue.claimWhatsAppReply('recipient', now), true);
    assert.equal(queue.claimWhatsAppReply('recipient', now + 899_999), false);
    assert.equal(queue.claimWhatsAppReply('recipient', now + 900_000), true);
  } finally { queue.close(); }
});
test('duplicate titles fail closed, pinned ID survives a rename', () => {
  assert.equal(selectGroup([group, { ...group, id: 'other@g.us' }], group.title), null);
  assert.equal(selectGroup([{ ...group, title: 'Новое имя' }], group.title, group.id).id, group.id);
});
test('durable queue deduplicates and removes delivered message content', () => {
  const queue = new EventQueue(':memory:');
  const event = makeEvent(message, group, now - 1000, now);
  assert.equal(queue.add(event), true);
  assert.equal(queue.add(event), false);
  assert.equal(queue.pendingCount(), 1);
  queue.done(event.eventId);
  assert.equal(queue.pendingCount(), 0);
  assert.equal(queue.add(event), false);
  assert.equal(queue.db.prepare('SELECT payload FROM events').get().payload, null);
  queue.close();
});
test('stale retry payload expires without being sent as a new request', () => {
  const queue = new EventQueue(':memory:');
  const event = makeEvent(message, group, now - 1000, now);
  queue.add(event); queue.prune(now + 3_600_001);
  assert.equal(queue.pendingCount(), 0);
  queue.close();
});

test('permanently rejected payload is removed and cannot be queued again', () => {
  const queue = new EventQueue(':memory:');
  const event = makeEvent(message, group, now - 1000, now);
  queue.add(event); queue.discard(event.eventId);
  assert.equal(queue.pendingCount(), 0);
  assert.equal(queue.add(event), false);
  queue.close();
});
test('queue and duplicate protection survive a process restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'taxigr-bridge-test-'));
  const path = join(directory, 'queue.sqlite');
  let queue = new EventQueue(path);
  const event = makeEvent(message, group, now - 1000, now);
  try {
    queue.add(event); queue.close(); queue = new EventQueue(path);
    assert.equal(queue.pendingCount(), 1);
    assert.equal(queue.add(event), false);
    queue.done(event.eventId); queue.close(); queue = new EventQueue(path);
    assert.equal(queue.pendingCount(), 0);
    assert.equal(queue.add(event), false);
  } finally { queue.close(); rmSync(directory, { recursive: true }); }
});
