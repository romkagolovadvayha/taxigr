const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || "playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const out = path.resolve("docs/design/landing-2026");
  await fs.mkdir(out, { recursive: true });
  try {
    await page.goto(process.env.TAXI_LANDING_URL || "http://localhost:8082/");
    await page
      .getByRole("heading", { name: /Свои дороги.*Своё такси/ })
      .waitFor();
    await page
      .locator(".lp-phone-screen")
      .first()
      .evaluate((img) => img.decode());
    await page.screenshot({ path: path.join(out, "desktop-hero.png") });
    const sizes = [];
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const metrics = await page
        .locator(".lp")
        .evaluate((el) => ({
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          height: el.clientHeight,
          scrollHeight: el.scrollHeight,
        }));
      assert.ok(
        metrics.scrollWidth <= metrics.clientWidth + 1,
        `Horizontal overflow at ${width}: ${JSON.stringify(metrics)}`,
      );
      assert.ok(metrics.scrollHeight > metrics.height, "Landing must scroll");
      sizes.push({ width, ...metrics });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, "mobile-hero.png") });
    await page.getByRole("button", { name: /Встречайте свою машину/ }).click();
    assert.equal(
      await page.locator("#trip-preview .lp-phone-screen").getAttribute("src"),
      "/landing/app-driver.webp",
    );
    await page.getByRole("button", { name: /Скажите, куда едем/ }).click();
    assert.equal(
      await page.locator("#trip-preview .lp-phone-screen").getAttribute("src"),
      "/landing/app-home.webp",
    );
    await page.getByRole("button", { name: /Посмотрите стоимость/ }).click();
    await page.getByRole("button", { name: "Детский", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Детский", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page
      .getByRole("heading", { name: "Для маленьких пассажиров" })
      .waitFor();
    await page.getByRole("button", { name: "Эконом", exact: true }).click();
    await page
      .locator("summary")
      .filter({ hasText: "Нужно устанавливать приложение?" })
      .click();
    assert.equal(
      await page.locator("details").first().getAttribute("open"),
      "",
    );
    await page
      .locator("summary")
      .filter({ hasText: "Нужно устанавливать приложение?" })
      .click();
    const images = await page
      .locator("main img")
      .evaluateAll(async (images) => {
        await Promise.all(images.map((img) => img.decode()));
        return images.map((img) => ({
          src: img.getAttribute("src"),
          loaded: img.complete && img.naturalWidth > 0,
        }));
      });
    assert.ok(
      images.every((image) => image.loaded),
      "All images should load",
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("button", { name: "Остановить анимацию" }).click();
    assert.equal(await page.locator(".lp").getAttribute("data-paused"), "true");
    assert.equal(
      await page
        .locator(".lp-phone-float")
        .evaluate((el) => getComputedStyle(el).animationPlayState),
      "paused",
    );
    await page.getByRole("button", { name: "Включить анимацию" }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".lp-phone-float")
        .evaluate((el) => getComputedStyle(el).animationName),
      "none",
    );
    await page.locator(".lp").evaluate((el) => el.scrollTo(0, 0));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator(".lp").evaluate((el) => {
      el.style.height = "auto";
      el.style.overflow = "visible";
    });
    await page.screenshot({
      path: path.join(out, "desktop-full.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(out, "mobile-full.png"),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Заказать такси", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", {
        name: "Войти через MAX",
      })
      .waitFor();
    assert.equal(errors.length, 0, `Runtime errors: ${errors.join("; ")}`);
    await fs.writeFile(
      path.join(out, "verification.json"),
      JSON.stringify(
        {
          sizes,
          images,
          runtimeErrors: errors,
          checks: [
            "step switching",
            "tariff switching",
            "FAQ disclosure",
            "animation pause/resume",
            "reduced motion",
            "booking link to sign-in",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: responsive widths, image loading, interactions, motion preferences, booking link, runtime errors.",
    );
  } catch (error) {
    console.log(String(error));
    console.log((await page.locator("body").innerText()).slice(0, 3000));
    await page.screenshot({ path: path.join(out, "verify-state.png") });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
