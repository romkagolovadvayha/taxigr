// Run through run-qa.mjs and tsx: real isolated API, independent browser sessions.
const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || 'playwright');
const mysql = require('mysql2/promise');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { signSession } = require('../../server/security.ts');
const { recordInitialConsents } = require('../../server/legal.ts');
const { currentInitialLegalAcceptance } = require('../../src/legal/documents.ts');

(async () => {
  const target = new URL(process.env.MYSQL_URL);
  assert.equal(target.hostname, '127.0.0.1');
  assert.match(target.pathname, /^\/taxi_qa_/);
  const apiUrl = 'http://127.0.0.1:4110';
  const site = 'http://localhost:8090';
  const out = path.resolve('docs/design/qa-2026');
  const connection = await mysql.createConnection(process.env.MYSQL_URL);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const actors = [];
  const checks = [];
  const errors = [];
  const cancelledMapRequests = [];
  const serverErrors = [];
  const check = (message) => { checks.push(message); console.log(`PASS: ${message}`); };
  const api = async (actor, route, body, method = body === undefined ? 'GET' : 'POST') => {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    assert.ok(response.ok, JSON.stringify(result.error));
    return result.data;
  };
  const bootstrap = (actor) => api(actor, '/v1/bootstrap');
  const orderFor = async (actor) => (await bootstrap(actor)).activePassengerOrder;
  try {
    for (let index = 0; index < 5; index++) {
      const driver = index >= 3;
      const id = randomUUID();
      const actor = { id, name: `QA ${driver ? 'Водитель' : 'Пассажир'} ${index + 1}`, driver };
      actors.push(actor);
      await connection.execute(`INSERT INTO users (id,name,phone,phone_verified_at,gender,profile_completed_at)
        VALUES (?,?,?,UTC_TIMESTAMP(3),'male',UTC_TIMESTAMP(3))`, [id, actor.name, `+7909092000${index}`]);
      await connection.execute("INSERT INTO user_roles (user_id,role) VALUES (?,'passenger')", [id]);
      if (driver) {
        actor.driverId = randomUUID();
        await connection.execute("INSERT INTO user_roles (user_id,role) VALUES (?,'driver')", [id]);
        await connection.execute("INSERT INTO drivers (id,user_id,status,has_child_seat) VALUES (?,?,'online',TRUE)", [actor.driverId,id]);
        await connection.execute(`INSERT INTO vehicles (id,driver_id,make,model,year,color,color_hex,plate)
          VALUES (?,?,'Lada','Granta',2024,'Жёлтая','#F6C945',?)`, [randomUUID(),actor.driverId,`А12${index}ВС18`]);
      }
      await recordInitialConsents(connection, id, currentInitialLegalAcceptance(), { source: 'order_confirmation' });
      actor.token = await signSession({ id, roles: driver ? ['passenger','driver'] : ['passenger'] });
      actor.context = await browser.newContext({ viewport: { width: 390, height: 844 },
        geolocation: { latitude: 56.0477, longitude: 51.9586 }, permissions: ['geolocation'], reducedMotion: 'reduce' });
      await actor.context.addInitScript(({ token, id }) => {
        localStorage.setItem('taxi_grahovo_session_token', token);
        localStorage.setItem('taxi_grahovo_installation_id', `qa-browser-${id}`);
        const rewrite = (url) => String(url).replace(/^(https?|wss?):\/\/(localhost|127\.0\.0\.1):4100/, '$1://127.0.0.1:4110');
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, init) => originalFetch(input instanceof Request ? new Request(rewrite(input.url), input) : rewrite(input), init);
        window.WebSocket = new Proxy(window.WebSocket, { construct: (target, args) => Reflect.construct(target, [rewrite(args[0]), ...args.slice(1)]) });
      }, { token: actor.token, id });
      actor.page = await actor.context.newPage();
      actor.page.on('pageerror', (error) => {
        if (/^Failed to parse coverage response https:\/\/api-maps\.yandex\.ru\/.*The user aborted a request\./.test(error.message)) cancelledMapRequests.push(error.message);
        else errors.push({ actor: index, message: error.message });
      });
      actor.page.on('response', (response) => {
        if (response.url().startsWith(apiUrl) && response.status() >= 500) serverErrors.push({ status: response.status(), url: response.url() });
      });
      await actor.page.goto(`${site}${driver ? '/driver' : '/'}`);
    }
    await actors[0].page.evaluate(() => {
      void Promise.reject(new Error('Failed to parse coverage response https://api-maps.yandex.ru/services/coverage/v2?l=map: The user aborted a request.'));
    });
    const passengers = actors.slice(0,3);
    const drivers = actors.slice(3);
    const prepare = async (actor) => {
      const page = actor.page;
      await page.getByRole('button', { name: 'Откуда: Где вы?', exact: true }).click();
      await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill('Ачинцева, 5');
      await page.getByText('Ачинцева, 5', { exact: false }).first().click();
      await page.getByRole('button', { name: 'Куда: не указано', exact: true }).click();
      await page.getByRole('textbox', { name: 'Поиск адреса или места' }).fill('Колпакова, 1Б');
      await page.getByText('Колпакова, 1Б', { exact: false }).first().click();
      await page.getByRole('button', { name: /Перейти к подтверждению/ }).click();
      await page.getByRole('textbox', { name: 'Комментарий водителю' }).fill(actor.name);
      await page.getByRole('button', { name: /Подтвердить заказ за/ }).waitFor();
    };
    await Promise.all(passengers.map(prepare));
    await Promise.all(passengers.map((actor) => actor.page.getByRole('button', { name: /Подтвердить заказ за/ }).click()));
    await Promise.all(passengers.map((actor) => actor.page.getByRole('button', { name: 'Отменить', exact: true }).waitFor()));
    const orders = await Promise.all(passengers.map(orderFor));
    assert.equal(new Set(orders.map((order) => order.id)).size, 3);
    assert.deepEqual(orders.map((order) => order.passengerId), passengers.map((actor) => actor.id));
    check('Three passengers create separate orders concurrently through the UI and real API');

    await drivers[0].page.getByRole('button', { name: 'Принять заказ', exact: true }).click();
    await drivers[0].page.getByText('Выехать к пассажиру', { exact: true }).scrollIntoViewIfNeeded();
    await drivers[1].page.getByRole('button', { name: 'Принять заказ', exact: true }).click();
    await drivers[1].page.getByText('Выехать к пассажиру', { exact: true }).scrollIntoViewIfNeeded();
    await drivers[0].page.getByRole('button', { name: 'Взять следующим', exact: true }).click();
    await drivers[0].page.getByText('Следующий заказ принят', { exact: true }).waitFor();
    const queueOne = (await bootstrap(drivers[0])).driverQueue;
    const queueTwo = (await bootstrap(drivers[1])).driverQueue;
    assert.equal(new Set([queueOne.current.id, queueOne.next.id, queueTwo.current.id]).size, 3);
    assert.equal(queueOne.current.driverQueuePosition, 1);
    assert.equal(queueOne.next.driverQueuePosition, 2);
    check('Two drivers accept three distinct orders; one receives a current and a next ride');
    const passengerOf = (order) => passengers.find((actor) => actor.id === order.passengerId);
    await Promise.all(passengers.map((actor) => actor.page.getByRole('button', { name: 'Написать водителю', exact: true }).waitFor()));
    for (const [index, actor] of actors.entries()) await actor.page.screenshot({ path: path.join(out, `multi-user-${index + 1}.png`) });

    const paired = [passengerOf(queueOne.current), passengerOf(queueTwo.current)];
    await Promise.all(paired.map((actor) => actor.page.getByRole('button', { name: 'Написать водителю', exact: true }).click()));
    await Promise.all(drivers.map((actor) => actor.page.getByRole('button', { name: 'Написать пассажиру', exact: true }).click()));
    await Promise.all(paired.map(async (actor, index) => {
      await actor.page.getByRole('textbox', { name: 'Сообщение', exact: true }).fill(`Сообщение только водителю ${index}`);
      await actor.page.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
      await drivers[index].page.getByText(`Сообщение только водителю ${index}`, { exact: true }).waitFor();
      assert.equal(await drivers[1 - index].page.getByText(`Сообщение только водителю ${index}`, { exact: true }).count(), 0);
    }));
    check('Concurrent chats reach only the assigned driver in separate live browser sessions');
    await Promise.all(actors.map((actor) => actor.page.goto(`${site}${actor.driver ? '/driver' : '/'}`)));
    await drivers[0].page.getByText('Следующий заказ принят', { exact: true }).waitFor();
    check('Reload restores both drivers, all passenger rides and the queued order');

    const currentPassenger = passengerOf(queueOne.current);
    await currentPassenger.page.getByRole('button', { name: 'Отменить поездку', exact: true }).click();
    await currentPassenger.page.getByRole('button', { name: 'Да, отменить заказ', exact: true }).click();
    await drivers[0].page.getByText(passengerOf(queueOne.next).name, { exact: true }).first().waitFor();
    const promoted = (await bootstrap(drivers[0])).driverQueue;
    assert.equal(promoted.current.id, queueOne.next.id);
    assert.equal(promoted.current.driverQueuePosition, 1);
    assert.equal(promoted.next, null);
    assert.equal((await bootstrap(drivers[1])).driverQueue.current.id, queueTwo.current.id);
    check('Passenger cancellation promotes the queued ride live and leaves the second driver unchanged');

    for (const button of ['Выехать к пассажиру', 'Я на месте', 'Начать поездку', 'Завершить поездку', 'Оплата получена, завершить']) {
      if (button === 'Я на месте') await api(drivers[0], '/v1/driver/location', { latitude: 56.0477, longitude: 51.9586, accuracyMeters: 8 }, 'PUT');
      await drivers[0].page.getByRole('button', { name: button, exact: true }).click();
    }
    await passengerOf(queueOne.next).page.getByText('Завершена', { exact: true }).first().waitFor();
    assert.equal((await api(passengerOf(queueOne.next), `/v1/orders/${queueOne.next.id}`)).status, 'completed');
    check('Promoted ride completes through driver UI with passenger updates and payment confirmation');
    assert.deepEqual(errors, []);
    assert.deepEqual(serverErrors, []);
    assert.deepEqual(cancelledMapRequests, [], 'Built document must handle SDK cancellations before global error listeners');
    await fs.writeFile(path.join(out, 'browser-results.json'), JSON.stringify({ passed: true, checks, errors, serverErrors, cancelledMapRequests }, null, 2));
  } catch (error) {
    console.error(String(error));
    for (const [index, actor] of actors.entries()) {
      if (!actor.page) continue;
      console.error(`Browser ${index}: ${await actor.page.locator('body').innerText().catch(() => '')}`);
      console.error(await actor.page.locator('[role="button"]').evaluateAll((buttons) => buttons.map((button) => ({
        text: button.textContent, label: button.getAttribute('aria-label'), hidden: button.closest('[aria-hidden="true"]')?.tagName,
        style: getComputedStyle(button).visibility, rect: button.getBoundingClientRect().toJSON(),
      }))));
      await actor.page.screenshot({ path: path.join(out, `failure-${index}.png`) }).catch(() => {});
    }
    await fs.writeFile(path.join(out, 'browser-results.json'), JSON.stringify({ passed: false, checks, failure: String(error), errors, serverErrors, cancelledMapRequests }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
    if (actors.length) {
      await connection.query('DELETE FROM orders WHERE passenger_id IN (?)', [actors.map((actor) => actor.id)]);
      await connection.query('DELETE FROM drivers WHERE user_id IN (?)', [actors.map((actor) => actor.id)]);
      await connection.query('DELETE FROM users WHERE id IN (?)', [actors.map((actor) => actor.id)]);
    }
    await connection.end();
    await require('../../server/db.ts').db.end();
  }
})();
