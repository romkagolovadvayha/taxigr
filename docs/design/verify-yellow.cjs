const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const out = path.resolve('docs/design/yellow-2026');
  await fs.mkdir(out, { recursive: true });
  const report = [];
  try {
    for (const theme of ['light', 'dark']) {
      for (const [role, label, route] of [
        ['passenger', 'Пассажир', '/'],
        ['driver', 'Водитель', '/driver'],
        ['admin', 'Суперадмин', '/admin'],
      ]) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
          reducedMotion: 'reduce',
        });
        await context.addInitScript((scheme) => {
          localStorage.setItem('taxi_grahovo_color_scheme', scheme);
        }, theme);
        // These are local demo sessions; no API mutations leave the browser.
        await context.route((url) => ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/v1/'), (request) => request.fulfill({
          status: 200, json: { data: { channels: [] } },
        }));
        const page = await context.newPage();
        const errors = [];
        const cancelledMapRequests = [];
        page.on('pageerror', (error) => {
          // Yandex reports cancelled coverage requests during viewport updates.
          if (/^Failed to parse coverage response https:\/\/api-maps\.yandex\.ru\/.*The user aborted a request\./.test(error.message)) {
            cancelledMapRequests.push(error.message);
          } else errors.push(error.message);
        });
        await page.goto('http://localhost:8082/sign-in');
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.getByRole('button', { name: 'Принять и продолжить', exact: true }).click();
        await page.waitForURL((url) => url.pathname === route);
        if (role === 'passenger') {
          await page.getByRole('radio', { name: 'Эконом', exact: true }).waitFor();
          assert.equal(await page.getByRole('tablist').count(), 0);
          await page.getByRole('button', { name: 'Открыть Яндекс Карты', exact: true }).waitFor();
          await page.getByRole('radio', { name: 'Детский, с креслом', exact: true }).click();
          await page.getByRole('radio', { name: 'Эконом', exact: true }).click();
          await page.getByRole('button', { name: 'Открыть Яндекс Карты', exact: true }).waitFor();
        } else {
          await page.getByRole('tablist').waitFor();
        }
        await page.locator('img').evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
        await page.waitForTimeout(1000);
        const metrics = await page.evaluate(() => {
          const styles = [...document.querySelectorAll('div,span,button,svg')]
            .map((el) => getComputedStyle(el));
          const colors = [...new Set(styles.flatMap((s) => [s.color, s.backgroundColor]))];
          return {
            theme: document.documentElement.dataset.appTheme,
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            oldAccent: colors.includes('rgb(49, 93, 213)'),
            yellow: colors.some((c) => c === 'rgb(246, 201, 69)' || c === 'rgb(247, 212, 106)'),
            themedText: colors.includes(document.documentElement.dataset.appTheme === 'dark'
              ? 'rgb(247, 243, 232)' : 'rgb(37, 35, 30)'),
          };
        });
        assert.equal(metrics.theme, theme);
        assert.ok(metrics.scrollWidth <= metrics.width + 1);
        assert.equal(metrics.oldAccent, false);
        assert.equal(metrics.themedText, true);
        if (role !== 'admin') assert.equal(metrics.yellow, true);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(out, `${role}-${theme}.png`) });
        if (role === 'passenger') {
          await page.goto('http://localhost:8082/settings');
          const toggle = page.getByRole('switch', { name: 'Тёмная тема', exact: true });
          await toggle.waitFor();
          await toggle.click();
          await page.waitForFunction((current) => document.documentElement.dataset.appTheme !== current, theme);
          await toggle.focus();
          await page.keyboard.press('Space');
          await page.waitForFunction((current) => document.documentElement.dataset.appTheme === current, theme);
          await page.screenshot({ path: path.join(out, `settings-${theme}.png`) });
        }
        assert.deepEqual(errors, []);
        report.push({ role, ...metrics, errors, cancelledMapRequests });
        console.log(`PASS ${role} ${theme}`);
        await context.close();
      }
    }
    await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
