import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../setup.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const connected = { max: { state: 'connected' }, whatsapp: { state: 'connected' }, delivery: 'connected', paired: true, pending: 0 };

function windowFixture() {
  const timers = new Map(), nodes = new Map(), requests = [], listeners = {};
  let nextTimer = 0;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { removeAttribute() {} });
    return nodes.get(id);
  };
  const document = { hidden: false, getElementById: node, querySelectorAll: () => [node('retry')],
    addEventListener: (event, fn) => { listeners[event] = fn; } };
  runInNewContext(source, {
    document, location: { hash: '#test' }, sessionStorage: { getItem() {}, setItem() {} }, history: { replaceState() {} },
    AbortSignal, Date, setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (path, options) => new Promise(resolve => requests.push({ path, options, resolve })),
  });
  return { timers, nodes, requests, document, listeners,
    resolve: async (index, status = 200, value = connected) => { requests[index].resolve({ ok: status === 200, status, json: async () => value }); await flush(); },
    tick: async () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); await flush(); },
  };
}

test('local window has no overlapping polls and stops polling in the background', async () => {
  const page = windowFixture();
  assert.equal(page.requests.length, 1); assert.equal(page.timers.size, 0);
  page.listeners.visibilitychange();
  assert.equal(page.requests.length, 1);
  await page.resolve(0);
  assert.equal([...page.timers.values()][0].delay, 10_000);
  page.document.hidden = true; page.listeners.visibilitychange();
  assert.equal(page.timers.size, 0);
  page.document.hidden = false; page.listeners.visibilitychange();
  assert.equal(page.requests.length, 2); assert.equal(page.timers.size, 0);
  await page.resolve(1);
  assert.equal(page.timers.size, 1);
});

test('local window backs off failed polling and stops when its setup key expires', async () => {
  const page = windowFixture();
  await page.resolve(0, 503, {});
  assert.equal([...page.timers.values()][0].delay, 15_000);
  await page.tick(); await page.resolve(1, 503, {});
  assert.equal([...page.timers.values()][0].delay, 30_000);
  await page.tick(); await page.resolve(2, 401, {});
  assert.equal(page.timers.size, 0);
  page.listeners.visibilitychange(); assert.equal(page.requests.length, 3);
});

test('repeated clicks submit only one action while a request is in progress', async () => {
  const page = windowFixture(); await page.resolve(0);
  for (let i = 0; i < 50; i++) page.nodes.get('retry').onclick();
  assert.equal(page.requests.filter(request => request.path === '/retry').length, 1);
  assert.equal(page.nodes.get('retry').disabled, true);
  await page.resolve(1, 200, { ok: true });
  await page.resolve(2);
  assert.equal(page.nodes.get('retry').disabled, false);
});
