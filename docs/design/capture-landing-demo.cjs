const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || "playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const out = path.resolve("docs/design/landing-2026");
  await fs.mkdir(out, { recursive: true });
  await page.route((url) => ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/v1/"),
    (route) => route.fulfill({ status: 200, json: { data: { channels: [] } } }));
  try {
    await page.goto("http://localhost:8082/sign-in");
    await page.getByRole("button", { name: "Пассажир", exact: true }).click();
    await page
      .getByRole("button", { name: "Принять и продолжить", exact: true })
      .click();
    await page.getByRole("radio", { name: "Эконом", exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Открыть Яндекс Карты", exact: true })
      .waitFor();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(out, "app-home.png") });
    await page
      .getByRole("button", { name: "Откуда: Где вы?", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Поиск адреса или места" })
      .fill("Ачинцева, 5");
    await page.getByText("Ачинцева, 5", { exact: false }).first().click();
    await page
      .getByRole("button", { name: "Куда: не указано", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Поиск адреса или места" })
      .fill("Колпакова, 1Б");
    await page.getByText("Колпакова, 1Б", { exact: false }).first().click();
    await page
      .getByRole("button", { name: /Перейти к подтверждению|Продолжить/ })
      .waitFor({ timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(out, "app-route.png") });
    await page.getByRole("button", { name: /Перейти к подтверждению/ }).click();
    await page.getByRole("button", { name: /Подтвердить заказ за/ }).click();
    await page
      .getByRole("button", { name: "Позвонить водителю", exact: true })
      .waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, "app-driver.png") });
    console.log("Saved current demo screens: home, route, driver.");
  } catch (error) {
    console.log(String(error));
    console.log(await page.locator("body").innerText());
    await page.screenshot({ path: path.join(out, "capture-state.png") });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
