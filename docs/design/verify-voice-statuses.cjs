const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

function instrument() {
  window.__speech = [];
  const names = new WeakMap();
  const buffers = new WeakMap();
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = String(args[0]);
    if (url.includes('.mp3')) {
      const originalBuffer = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => { const bytes = await originalBuffer(); names.set(bytes, url.match(/([a-z_]+)\.mp3/)?.[1]); return bytes; };
    }
    return response;
  };
  const OriginalContext = window.AudioContext;
  window.AudioContext = class extends OriginalContext {
    async decodeAudioData(bytes) {
      const buffer = await super.decodeAudioData(bytes); buffers.set(buffer, names.get(bytes)); return buffer;
    }
    createBufferSource() {
      const node = super.createBufferSource(); const start = node.start.bind(node);
      node.start = (...args) => { window.__speech.push({ type: 'start', clip: buffers.get(node.buffer), at: performance.now(), duration: node.buffer.duration }); return start(...args); };
      node.addEventListener('ended', () => window.__speech.push({ type: 'ended', clip: buffers.get(node.buffer), at: performance.now() }));
      return node;
    }
  };
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const out = 'docs/design/voice-2026';
  const results = [];
  const setup = async role => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(instrument);
    await context.route(url => ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/v1/'),
      route => route.fulfill({ status: 200, json: { data: { channels: [] } } }));
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:8082/sign-in', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: role, exact: true }).click();
    await page.getByRole('button', { name: 'Принять и продолжить', exact: true }).click();
    return { context, page, errors };
  };
  const finished = (page, clip, count = 1) => page.waitForFunction(({ clip, count }) =>
    window.__speech.filter(event => event.type === 'ended' && event.clip === clip).length >= count,
  { clip, count }, { timeout: 45000 });
  const driverScenario = async () => {
    const { context, page, errors } = await setup('Водитель');
    const action = async (label, clip, count) => {
      await page.getByRole('button', { name: label, exact: true }).click();
      await finished(page, clip, count); console.log(`Driver: ${clip}`);
    };
    try {
      await action('Создать демо-заказ', 'new_order');
      await action('Принять заказ', 'order_accepted');
      await action('Выехать к пассажиру', 'driver_departed');
      await action('Я на месте', 'driver_waiting');
      await action('Начать поездку', 'ride_started');
      await action('Создать следующий демо-заказ', 'new_order', 2);
      await action('Взять следующим', 'order_accepted_queued');
      await page.getByRole('button', { name: 'Завершить поездку', exact: true }).click();
      await page.getByRole('button', { name: 'Оплата получена, завершить', exact: true }).click();
      await finished(page, 'next_order_ready');
      const events = await page.evaluate(() => window.__speech);
      const completedEnd = events.find(event => event.type === 'ended' && event.clip === 'driver_complete_cash');
      const nextStart = events.find(event => event.type === 'start' && event.clip === 'next_order_ready');
      assert.ok(completedEnd && nextStart && nextStart.at >= completedEnd.at - 2, 'Finish and next order must both speak, in sequence');
      await page.getByRole('button', { name: 'Отменить', exact: true }).click();
      await page.getByRole('textbox', { name: 'Причина отказа от заказа' }).fill('Демо-проверка озвучки');
      await action('Отказаться и продолжить поиск', 'order_released');
      const all = await page.evaluate(() => window.__speech);
      assert.equal(all.filter(event => event.type === 'start').length, 10);
      assert.deepEqual(errors, []);
      results.push({ role: 'driver', scenarios: ['accept', 'depart', 'arrive', 'start', 'accept-next', 'complete-and-promote', 'release'], events: all, errors });
    } catch (error) { console.error('Driver state:', await page.locator('body').innerText(), await page.evaluate(() => window.__speech)); throw error; }
    finally { await context.close(); }
  };
  const passengerScenario = async () => {
    const { context, page, errors } = await setup('Пассажир');
    try {
      await page.getByRole('button', { name: 'Откуда: Где вы?', exact: true }).click();
      await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill('Ачинцева, 5');
      await page.getByText('Ачинцева, 5', { exact: false }).first().click();
      await page.getByRole('button', { name: 'Куда: не указано', exact: true }).click();
      await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill('Колпакова, 1Б');
      await page.getByText('Колпакова, 1Б', { exact: false }).first().click();
      await page.getByRole('button', { name: /Перейти к подтверждению/ }).click();
      await page.getByText('Переводом', { exact: true }).click();
      await page.getByRole('button', { name: /Подтвердить заказ за/ }).click();
      await finished(page, 'ride_complete_transfer');
      const events = await page.evaluate(() => window.__speech);
      assert.deepEqual(events.filter(event => event.type === 'start').map(event => event.clip),
        ['searching', 'taxi_found', 'driver_arriving', 'driver_arrived', 'ride_started', 'ride_complete_transfer']);
      assert.deepEqual(errors, []);
      results.push({ role: 'passenger', scenarios: ['full-trip', 'transfer-payment', 'rating-prompt'], events, errors });
      console.log('Passenger: full ride with transfer payment');
    } catch (error) { console.error('Passenger state:', await page.locator('body').innerText(), await page.evaluate(() => window.__speech)); throw error; }
    finally { await context.close(); }
  };
  try {
    const outcomes = await Promise.allSettled([driverScenario(), passengerScenario()]);
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
    await fs.writeFile(`${out}/status-verification.json`, JSON.stringify({ passed: true, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
