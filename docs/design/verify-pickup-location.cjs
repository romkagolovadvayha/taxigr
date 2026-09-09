const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
    geolocation: { latitude: 56.0477, longitude: 51.9586, accuracy: 10 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  const errors = [];
  const geocoderResults = [];
  await context.addInitScript(() => {
    window.__locationCalls = 0;
    const getCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args) => {
      window.__locationCalls++;
      return getCurrentPosition(...args);
    };
  });
  await context.route((url) => ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/v1/'),
    (route) => route.fulfill({ status: 200, json: { data: [] } }));
  page.on('pageerror', (error) => {
    if (!/^Failed to parse coverage response https:\/\/api-maps\.yandex\.ru\/.*The user aborted a request\./.test(error.message)) errors.push(error.message);
  });
  page.on('response', async (response) => {
    if (new URL(response.url()).hostname !== 'geocode-maps.yandex.ru') return;
    const body = await response.json().catch(() => null);
    geocoderResults.push({ status: response.status(), results: body?.response?.GeoObjectCollection?.featureMember?.map((member) => member.GeoObject?.name) ?? [] });
  });
  try {
    await page.goto('http://localhost:8082/sign-in');
    await page.getByRole('button', { name: 'Пассажир', exact: true }).click();
    await page.getByRole('button', { name: 'Принять и продолжить', exact: true }).click();
    await page.getByRole('button', { name: 'Откуда: Где вы?', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__locationCalls), 0, 'No automatic location request before the user action');
    await page.getByRole('button', { name: 'Моё местоположение', exact: true }).click();
    await page.getByRole('button', { name: /^Откуда: (?!Где вы\?|Моё местоположение)/ }).waitFor();
    const pickupLabel = await page.getByRole('button', { name: /^Откуда:/ }).getAttribute('aria-label');
    assert.ok(geocoderResults.some((result) => result.status === 200 && result.results.length));
    assert.ok(await page.evaluate(() => window.__locationCalls) > 0);
    console.log('PASS: real reverse geocoder, ' + pickupLabel);
    await page.evaluate(() => {
      void Promise.reject(new Error('Failed to parse coverage response https://api-maps.yandex.ru/services/coverage/v2?l=map: The user aborted a request.'));
    });

    let routeOrigin = null;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.hostname === 'router.project-osrm.org') routeOrigin = url.pathname.split('/').at(-1).split(';')[0];
    });
    await page.getByRole('button', { name: 'Куда: не указано', exact: true }).click();
    await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill('Колпакова, 1Б');
    await page.getByText('Колпакова, 1Б', { exact: false }).first().click();
    await page.getByRole('button', { name: /Перейти к подтверждению/ }).waitFor();
    assert.equal(routeOrigin, '51.9586,56.0477', 'Route origin must remain at the passenger GPS position');
    await page.getByRole('button', { name: /Перейти к подтверждению/ }).click();
    assert.equal(await page.getByRole('button', { name: /^Откуда:/ }).getAttribute('aria-label'), pickupLabel);
    console.log('PASS: exact GPS coordinates retained, concrete address carried to confirmation, SDK cancellation does not block clicks.');

    const geocoder = (url) => url.hostname === 'geocode-maps.yandex.ru';
    await page.route(geocoder, (route) => route.fulfill({ status: 503, json: {} }));
    await page.getByRole('button', { name: 'Использовать моё местоположение', exact: true }).click();
    await page.getByText('Геопозиция определена, но адрес найти не удалось. Выберите адрес вручную.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Откуда:/ }).getAttribute('aria-label'), pickupLabel);
    console.log('PASS: geocoder failure preserves the selected address and displays a useful error.');

    assert.deepEqual(errors, []);
    await fs.mkdir('docs/design/location-2026', { recursive: true });
    await fs.writeFile('docs/design/location-2026/browser-verification.json', JSON.stringify({ passed: true, pickupLabel, routeOrigin, geocoderResults, errors }, null, 2));
  } catch (error) {
    console.error(error);
    console.log(JSON.stringify({ geocoderResults, errors }));
    console.log(await page.locator('body').innerText());
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
