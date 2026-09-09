const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const out = path.resolve('docs/design/voice-2026');
  await fs.mkdir(out, { recursive: true });
  const instrumentAudio = () => {
    window.__voiceEvents = [];
    const RealAudioContext = window.AudioContext;
    window.AudioContext = class extends RealAudioContext {
      createBufferSource() {
        const node = super.createBufferSource();
        const start = node.start.bind(node);
        const stop = node.stop.bind(node);
        node.start = (...args) => {
          window.__voiceEvents.push({ type: 'start', duration: node.buffer?.duration, at: performance.now() });
          return start(...args);
        };
        node.stop = (...args) => {
          window.__voiceEvents.push({ type: 'stop', at: performance.now() });
          return stop(...args);
        };
        node.addEventListener('ended', () => window.__voiceEvents.push({ type: 'ended', at: performance.now() }));
        return node;
      }
    };
  };
  await context.addInitScript(instrumentAudio);
  await context.route((url) => ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/v1/'), (route) => route.fulfill({ status: 200, json: { data: { channels: [] } } }));
  const page = await context.newPage();
  const errors = [];
  const cancelledMapRequests = [];
  const clips = [];
  const trackError = (error) => {
    if (/^Failed to parse coverage response https:\/\/api-maps\.yandex\.ru\/.*The user aborted a request\./.test(error.message)) {
      cancelledMapRequests.push(error.message);
    } else errors.push(error.message);
  };
  page.on('pageerror', trackError);
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.href.includes('.mp3')) clips.push({ url: url.pathname + url.search, status: response.status() });
  });
  try {
    await page.goto('http://localhost:8082/sign-in', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Пассажир', exact: true }).click();
    await page.getByRole('button', { name: 'Принять и продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Открыть профиль', exact: true }).click();
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    const sound = page.getByRole('switch', { name: 'Голосовые уведомления', exact: true });
    const vibration = page.getByRole('switch', { name: 'Вибрация', exact: true });
    const preview = page.getByRole('button', { name: 'Послушать голос и проверить вибрацию', exact: true });
    await vibration.click();
    assert.equal(await vibration.getAttribute('aria-checked'), 'false');
    assert.equal(await page.evaluate(() => window.__voiceEvents.length), 0);
    await preview.click();
    await page.waitForFunction(() => window.__voiceEvents.some((event) => event.type === 'start'));
    await page.waitForFunction(() => window.__voiceEvents.some((event) => event.type === 'ended'));
    const first = await page.evaluate(() => window.__voiceEvents.find((event) => event.type === 'start'));
    assert.ok(first.duration > 2 && first.duration < 6);
    await preview.click();
    await page.waitForFunction(() => window.__voiceEvents.filter((event) => event.type === 'start').length === 2);
    await sound.click();
    await page.waitForFunction(() => window.__voiceEvents.some((event) => event.type === 'stop'));
    assert.equal(await preview.getAttribute('aria-disabled'), 'true');
    await sound.click();
    await preview.click();
    await page.waitForFunction(() => window.__voiceEvents.filter((event) => event.type === 'start').length === 3);
    assert.equal(clips.filter((clip) => clip.url.includes('voice_preview')).length, 1, 'Decoded preview should be reused');
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'settings.png') });
    await page.waitForFunction(() => window.__voiceEvents.filter((event) => event.type === 'ended').length === 3);
    assert.deepEqual(errors, []);
    const previewEvents = await page.evaluate(() => window.__voiceEvents);
    console.log('PASS: real voice decoding/playback, completion, immediate mute, disabled preview, replay from cache.');

    await page.goto('http://localhost:8082/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Откуда: Где вы?', exact: true }).click();
    await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill('Ачинцева, 5');
    await page.getByText('Ачинцева, 5', { exact: false }).first().click();
    await page.getByRole('button', { name: 'Куда: не указано', exact: true }).click();
    await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill('Колпакова, 1Б');
    await page.getByText('Колпакова, 1Б', { exact: false }).first().click();
    await page.getByRole('button', { name: /Перейти к подтверждению/ }).click();
    await page.getByRole('button', { name: /Подтвердить заказ за/ }).click();
    await page.waitForFunction(() => window.__voiceEvents.filter((event) => event.type === 'ended').length >= 6, null, { timeout: 40000 });
    const tripEvents = await page.evaluate(() => window.__voiceEvents);
    assert.equal(tripEvents.filter((event) => event.type === 'start').length, 6);
    for (const name of ['searching', 'taxi_found', 'driver_arriving', 'driver_arrived', 'ride_started', 'ride_complete_cash']) {
      assert.equal(clips.filter((clip) => clip.url.includes(`${name}.mp3`)).length, 1, `Expected one ${name} announcement`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: six automatic passenger announcements, cash payment and rating prompt.');

    const driverContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await driverContext.addInitScript(instrumentAudio);
    await driverContext.route((url) => ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/v1/'), (route) => route.fulfill({ status: 200, json: { data: { channels: [] } } }));
    const driver = await driverContext.newPage();
    driver.on('pageerror', trackError);
    await driver.goto('http://localhost:8082/sign-in', { waitUntil: 'domcontentloaded' });
    await driver.getByRole('button', { name: 'Водитель', exact: true }).click();
    await driver.getByRole('button', { name: 'Принять и продолжить', exact: true }).click();
    await driver.getByRole('button', { name: 'Создать демо-заказ', exact: true }).click();
    await driver.waitForFunction(() => window.__voiceEvents.some((event) => event.type === 'ended'));
    const driverEvents = await driver.evaluate(() => window.__voiceEvents);
    assert.equal(driverEvents.filter((event) => event.type === 'start').length, 1, 'The same offer in two state subscriptions must speak once');
    assert.deepEqual(errors, []);
    console.log('PASS: driver offer is spoken once, without duplicate playback.');
    await fs.writeFile(path.join(out, 'browser-verification.json'), JSON.stringify({ passed: true, clips, previewEvents, tripEvents, driverEvents, errors, cancelledMapRequests }, null, 2));
    await driverContext.close();
  } catch (error) {
    console.error(error);
    console.log(JSON.stringify({ clips, events: await page.evaluate(() => window.__voiceEvents), errors }));
    console.log(await page.locator('body').innerText());
    await page.screenshot({ path: path.join(out, 'failed-state.png') });
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
