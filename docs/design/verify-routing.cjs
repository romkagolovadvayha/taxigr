const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const out = path.resolve('docs/design/routing-2026');
  await fs.mkdir(out, { recursive: true });
  const errors = [];
  const cancelledMapRequests = [];
  const routes = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  // Demo journeys remain local; only map tiles and public road routing are live.
  await context.route((url) => ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/v1/'),
    (route) => route.fulfill({ status: 200, json: { data: { channels: [] } } }));
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    if (/^Failed to parse coverage response https:\/\/api-maps\.yandex\.ru\/.*The user aborted a request\./.test(error.message)) {
      cancelledMapRequests.push(error.message);
    } else errors.push(error.message);
  });
  page.on('response', async (response) => {
    if (new URL(response.url()).hostname !== 'router.project-osrm.org') return;
    const body = await response.json().catch(() => null);
    if (body?.code === 'Ok') routes.push({ url: response.url(), ...body.routes[0] });
  });
  const signIn = async (role) => {
    await page.goto('http://localhost:8082/sign-in');
    await page.getByRole('button', { name: role, exact: true }).click();
    await page.getByRole('button', { name: 'Принять и продолжить', exact: true }).click();
  };
  const selectAddress = async (name) => {
    await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill(name);
    await page.getByText(name, { exact: false }).first().click();
  };
  const instrumentMap = async () => {
    await page.waitForFunction(() => window.ymaps3?.YMapFeature);
    await page.evaluate(() => {
      window.__roadFeatures = [];
      const Feature = window.ymaps3.YMapFeature;
      window.ymaps3.YMapFeature = new Proxy(Feature, {
        construct(target, args) {
          if (args[0]?.geometry?.type === 'LineString') window.__roadFeatures.push(args[0].geometry.coordinates);
          return Reflect.construct(target, args);
        },
      });
    });
  };
  try {
    await signIn('Пассажир');
    await page.getByRole('button', { name: 'Открыть Яндекс Карты', exact: true }).waitFor();
    await instrumentMap();
    await page.getByRole('button', { name: 'Откуда: Где вы?', exact: true }).click();
    await selectAddress('Ачинцева, 5');
    await page.getByRole('button', { name: 'Куда: не указано', exact: true }).click();
    await selectAddress('Колпакова, 1Б');
    await page.getByRole('button', { name: /Перейти к подтверждению/ }).waitFor();
    await page.waitForFunction(() => window.__roadFeatures.some((points) => points.length > 2));
    const single = await page.evaluate(() => window.__roadFeatures.at(-1));
    assert.deepEqual(single, routes[0].geometry.coordinates, 'The map must draw the exact road geometry returned by OSRM');
    assert.ok(routes[0].distance > 300 && routes[0].distance < 700);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'passenger-road.png') });
    console.log(`PASS: passenger road drawn with ${single.length} vertices, ${routes[0].distance} m.`);

    await page.getByRole('button', { name: /Перейти к подтверждению/ }).click();
    await page.getByRole('button', { name: 'Добавить ещё одну точку назначения', exact: true }).click();
    await selectAddress('Благодатновская, 53А');
    await page.getByRole('button', { name: /Подтвердить заказ за/ }).waitFor();
    const multi = routes.find((route) => route.legs.length === 2);
    assert.ok(multi, 'Expected one route through both destinations');
    await page.screenshot({ path: path.join(out, 'confirmation-stops.png') });
    console.log(`PASS: two destinations in order, ${multi.geometry.coordinates.length} vertices, ${multi.distance} m.`);

    await page.getByRole('button', { name: /Подтвердить заказ за/ }).click();
    await page.getByRole('button', { name: 'Позвонить водителю', exact: true }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'driver-approach.png') });
    assert.ok(routes.length >= 3, 'Driver approach must also request a road route');
    console.log('PASS: assigned demo driver has a road route to pickup.');

    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await signIn('Водитель');
    await instrumentMap();
    await page.getByRole('button', { name: 'Создать демо-заказ', exact: true }).click();
    await page.getByRole('button', { name: 'Принять заказ', exact: true }).waitFor();
    const offerRoute = routes.at(-1);
    assert.ok(offerRoute.geometry.coordinates.length > 2);
    await page.getByRole('button', { name: 'Принять заказ', exact: true }).click();
    await page.waitForFunction(() => window.__roadFeatures.some((points) => points.length > 2));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, 'driver-offer.png') });
    console.log('PASS: demo offer uses road distance and the accepted driver ride draws a road route.');

    await page.evaluate(() => localStorage.clear());
    await signIn('Пассажир');
    await instrumentMap();
    const routerUnavailable = (url) => url.hostname === 'router.project-osrm.org';
    await page.route(routerUnavailable, (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Откуда: Где вы?', exact: true }).click();
    await selectAddress('Ачинцева, 5');
    await page.getByRole('button', { name: 'Куда: не указано', exact: true }).click();
    await selectAddress('Колпакова, 1Б');
    await page.getByRole('button', { name: 'Повторить расчёт стоимости поездки', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__roadFeatures.length), 0, 'An unavailable router must not produce a straight line');
    await page.unroute(routerUnavailable);
    await page.getByRole('button', { name: 'Повторить расчёт стоимости поездки', exact: true }).click();
    await page.getByRole('button', { name: /Перейти к подтверждению/ }).waitFor();
    await page.waitForFunction(() => window.__roadFeatures.some((points) => points.length > 2));
    console.log('PASS: network failure leaves the map without a fake line; retry restores the road route.');

    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'browser-verification.json'), JSON.stringify({ passed: true, routes, errors, cancelledMapRequests }, null, 2));
  } catch (error) {
    console.error(error);
    console.log(await page.locator('body').innerText());
    await page.screenshot({ path: path.join(out, 'failed-state.png') });
    process.exitCode = 1;
  } finally { await browser.close(); }
})();
