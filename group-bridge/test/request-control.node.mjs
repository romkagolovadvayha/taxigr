import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Backoff, RequestGate, retryAfterMs } from '../request-control.mjs';

test('a burst of messages and manual retries makes only one request; successful sends are paced', async () => {
  let now = 0, calls = 0, finish;
  const gate = new RequestGate({ now: () => now });
  const first = gate.run(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  await Promise.all(Array.from({ length: 100 }, () => assert.rejects(gate.run(() => { calls++; }), { paused: true })));
  finish('ok'); assert.equal(await first, 'ok');
  await assert.rejects(gate.run(() => { calls++; }, { recovery: true }), { paused: true });
  now = 1500;
  await gate.run(() => { calls++; });
  assert.equal(calls, 2);
});

test('an outage backs off to five minutes and incoming events cannot reset it', async () => {
  let now = 0;
  const gate = new RequestGate({ now: () => now, random: () => 0 });
  for (const delay of [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
    await assert.rejects(gate.run(() => { throw new Error('offline'); }));
    assert.equal(gate.nextAt, now + delay);
    await assert.rejects(gate.run(() => assert.fail('must not send'), { recovery: true }), { paused: true });
    now = gate.nextAt;
  }
  await gate.run(() => 'recovered'); now = gate.nextAt;
  await assert.rejects(gate.run(() => { throw new Error('offline'); }));
  assert.equal(gate.nextAt - now, 15_000);
});

test('Retry-After is honored across health checks, sends and manual actions', async () => {
  let now = 0;
  const gate = new RequestGate({ now: () => now, random: () => 0 });
  await assert.rejects(gate.run(() => { throw Object.assign(new Error(), { status: 429, retryAfterMs: 600_000 }); }));
  now = 599_999;
  await assert.rejects(gate.run(() => assert.fail(), { recovery: true }), { paused: true });
  now++;
  assert.equal(await gate.run(() => 'ok'), 'ok');
  assert.equal(retryAfterMs('120'), 120_000);
  assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:10:00 GMT', 0), 600_000);
  assert.equal(retryAfterMs('bad'), 0);
});

test('revoked or forbidden access stops automatic traffic until explicit recovery', async () => {
  for (const status of [401, 403]) {
    let now = 0;
    const gate = new RequestGate({ now: () => now });
    await assert.rejects(gate.run(() => { throw Object.assign(new Error(), { status }); }));
    now = 86_400_000;
    await assert.rejects(gate.run(() => assert.fail()), { paused: true });
    await gate.run(() => 'new credentials', { recovery: true });
    now = gate.nextAt;
    assert.equal(await gate.run(() => 'event'), 'event');
  }
});

test('invalid payload does not impose an outage cooldown; missing API is retried slowly', async () => {
  const gate = new RequestGate({ now: () => 0 });
  await assert.rejects(gate.run(() => { throw Object.assign(new Error(), { status: 400 }); }));
  assert.equal(gate.nextAt, 1500);
  const missing = new RequestGate({ now: () => 0 });
  await assert.rejects(missing.run(() => { throw Object.assign(new Error(), { status: 404 }); }));
  assert.equal(missing.nextAt, 300_000);
});

test('reconnect delay is bounded and resets only when requested after a stable session', () => {
  const backoff = new Backoff({ random: () => 0 });
  assert.deepEqual(Array.from({ length: 7 }, () => backoff.next()), [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
  backoff.reset(); assert.equal(backoff.next(), 15_000);
});
