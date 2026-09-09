const { chromium } = require(process.env.TAXI_PLAYWRIGHT_PATH || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const measurements = [];
  let providerStatus = "pending";
  const out = path.resolve(
    process.env.TAXI_AUTH_OUTPUT || "docs/design/auth-2026",
  );
  await fs.mkdir(out, { recursive: true });
  page.on("pageerror", (error) => errors.push(String(error)));
  await context.addInitScript(() => {
    Object.defineProperty(window.visualViewport, "height", {
      get: () => window.__testAuthViewportHeight ?? window.innerHeight,
    });
    window.__authPopupCount = 0;
    window.open = () => {
      window.__authPopupCount += 1;
      return {
        closed: false,
        document: {},
        opener: null,
        location: {
          replace: (url) => {
            window.__authProviderUrl = url;
          },
        },
        close() {
          this.closed = true;
        },
        focus() {},
      };
    };
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/v1/")) {
      const body = route.request().postDataJSON();
      requests.push({ path: url.pathname, body });
      let data = {};
      let status = 200;
      if (/auth\/(max|vk|telegram)\/start$/.test(url.pathname)) {
        data = {
          challengeId: "123e4567-e89b-42d3-a456-426614174000",
          exchangeToken: "isolated-test-exchange-token-long-enough",
          botUrl: "https://example.test/bot",
          appUrl: "https://example.test/app",
          authorizationUrl: "https://example.test/vk",
          expiresInSeconds: 600,
        };
      } else if (/auth\/(max|vk|telegram)\/status$/.test(url.pathname)) {
        data = { status: providerStatus, errorCode: "PHONE_NOT_SHARED" };
      } else if (url.pathname === "/v1/auth/phone/start") {
        data = { phone: "+7 999 ***-00-00", retryAfterSeconds: 1 };
      } else if (url.pathname === "/v1/auth/phone/verify") {
        if (body.code !== "1234") {
          status = 400;
          return route.fulfill({
            status,
            json: {
              error: {
                code: "CODE_INVALID",
                message: "Неверный код. Попробуйте ещё раз.",
              },
            },
          });
        }
        data = {
          token: "isolated-preview-token",
          user: {
            id: "test-user",
            phone: "+79990000000",
            roles: ["passenger"],
            profileComplete: false,
          },
        };
      }
      return route.fulfill({ status, json: { data } });
    }
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      return route.abort();
    return route.continue();
  });

  const visibleFit = async (name) => {
    const result = await page.locator(".auth-shell").evaluate((el) => {
      const form = el.querySelector('[data-testid="auth-form-content"]');
      const rect = form.getBoundingClientRect();
      const controls = [
        ...form.querySelectorAll(
          '[role="button"], [role="checkbox"], input, a',
        ),
      ].map((node) => {
        const r = node.getBoundingClientRect();
        return {
          label: node.getAttribute("aria-label") || node.textContent,
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
        };
      });
      return {
        width: innerWidth,
        height: window.visualViewport.height,
        top: rect.top,
        bottom: rect.bottom,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        controls,
      };
    });
    assert.ok(
      result.top >= -1 && result.bottom <= result.height + 1,
      `${name}: clipped form ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.scrollHeight <= result.clientHeight + 1 &&
        result.scrollWidth <= result.clientWidth + 1,
      `${name}: scrolling`,
    );
    for (const control of result.controls)
      assert.ok(
        control.x >= -1 &&
          control.right <= result.width + 1 &&
          control.y >= -1 &&
          control.bottom <= result.height + 1,
        `${name}: clipped control ${JSON.stringify(control)}`,
      );
    measurements.push({ name, ...result });
  };
  const waitLayout = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  const acceptConsent = page.getByRole("button", {
    name: "Принять и продолжить",
    exact: true,
  });
  try {
    await page.goto(
      (process.env.TAXI_AUTH_URL || "http://127.0.0.1:8090") + "/sign-in",
    );
    await page
      .getByRole("button", { name: "Войти через MAX", exact: true })
      .waitFor();
    await waitLayout();
    assert.equal(
      await page.getByRole("textbox").count(),
      0,
      "Initial screen should not ask for a phone",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Войти через MAX", exact: true })
        .isDisabled(),
      false,
    );
    assert.equal(await page.getByRole("checkbox").count(), 0);
    assert.equal(
      await page.getByRole("link", { name: /Открыть документ/ }).count(),
      0,
    );
    assert.equal(await acceptConsent.count(), 0);
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [320, 568],
      [375, 667],
      [844, 390],
      [320, 430],
    ]) {
      await page.setViewportSize({ width, height });
      await waitLayout();
      await visibleFit(`methods-${width}x${height}`);
      if (width === 1440 || width === 390)
        await page.screenshot({ path: path.join(out, `methods-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await waitLayout();
    for (const method of [
      "Войти через MAX",
      "Войти через VK",
      "Войти через Telegram",
      "Войти по SMS",
    ]) {
      const requestCount = requests.length;
      await page.getByRole("button", { name: method, exact: true }).click();
      await page
        .getByRole("heading", { name: "Перед входом", exact: true })
        .waitFor();
      assert.equal(await page.getByRole("checkbox").count(), 0);
      for (const [label, href] of [
        ["Условия", "/terms"],
        ["Правила", "/passenger-rules"],
        ["Согласие", "/personal-data-consent"],
        ["Политика", "/privacy"],
      ]) {
        const link = page.getByRole("link", {
          name: `Открыть документ «${label}»`,
        });
        assert.equal(await link.getAttribute("href"), href);
        assert.equal(await link.getAttribute("target"), "_blank");
      }
      assert.equal(
        requests.length,
        requestCount,
        "Choosing a method must not start auth before acceptance",
      );
      assert.equal(
        await page.evaluate(() => window.__authPopupCount),
        0,
        "Consent must precede the external popup",
      );
      if (method === "Войти через MAX") {
        const documentOpened = context.waitForEvent("page");
        await page
          .getByRole("link", { name: "Открыть документ «Условия»" })
          .click();
        const documentPage = await documentOpened;
        await documentPage.waitForURL("**/terms");
        await documentPage.close();
        await acceptConsent.waitFor();
        for (const [width, height] of [
          [1440, 900],
          [390, 844],
          [320, 568],
          [844, 390],
          [320, 430],
        ]) {
          await page.setViewportSize({ width, height });
          await waitLayout();
          await visibleFit(`consent-${width}x${height}`);
          if (width === 390)
            await page.screenshot({ path: path.join(out, "consent-390.png") });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await waitLayout();
      }
      await page
        .getByRole("button", { name: "Другой способ входа", exact: true })
        .click();
      assert.equal(await acceptConsent.count(), 0);
    }
    for (const provider of ["MAX", "VK", "Telegram"]) {
      await page
        .getByRole("button", { name: "Войти через " + provider, exact: true })
        .click();
      if (provider === "MAX") {
        await acceptConsent.click();
      } else {
        assert.equal(
          await acceptConsent.count(),
          0,
          "Do not ask again within the same accepted flow",
        );
      }
      await page
        .getByRole("heading", { name: "Подтвердите вход", exact: true })
        .waitFor();
      await visibleFit("waiting-" + provider);
      const start = requests
        .filter((request) => request.path.endsWith("/start"))
        .at(-1);
      assert.equal(Object.hasOwn(start.body, "phone"), false);
      assert.equal(start.body.legalAcceptance.termsAccepted, true);
      assert.ok(start.body.installationId);
      if (provider === "VK") {
        providerStatus = "failed";
        await page.getByRole("alert").waitFor();
        await page
          .getByRole("button", { name: "Войти через VK", exact: true })
          .waitFor();
        await page.setViewportSize({ width: 320, height: 568 });
        await waitLayout();
        await visibleFit("methods-with-error");
        providerStatus = "pending";
      } else
        await page
          .getByRole("button", { name: "Другой способ входа", exact: true })
          .click();
    }
    await page.reload();
    await page
      .getByRole("button", { name: "Войти по SMS", exact: true })
      .click();
    await acceptConsent.click();
    assert.equal(
      requests.filter((request) => request.path === "/v1/auth/phone/start")
        .length,
      0,
    );
    assert.equal(await page.evaluate(() => window.__authPopupCount), 0);
    const phone = page.getByRole("textbox", {
      name: "Номер телефона, код страны плюс семь уже указан",
    });
    await phone.waitFor();
    const focusStyles = () =>
      phone.evaluate((el) =>
        [el, el.parentElement].map((node) => {
          const css = getComputedStyle(node);
          const r = node.getBoundingClientRect();
          return {
            outline: css.outline,
            shadow: css.boxShadow,
            border: css.border,
            background: css.backgroundColor,
            width: r.width,
            height: r.height,
          };
        }),
      );
    await waitLayout();
    const before = await focusStyles();
    await phone.focus();
    assert.deepEqual(
      await focusStyles(),
      before,
      "Phone focus must not alter the field",
    );
    for (const [width, height] of [
      [390, 844],
      [320, 568],
      [390, 340],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await waitLayout();
      await visibleFit(`sms-${width}x${height}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await waitLayout();
    await page.evaluate(() => {
      window.__testAuthViewportHeight = 340;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await waitLayout();
    await visibleFit("sms-keyboard-visual-viewport");
    assert.equal(
      await page.locator(".auth-shell").getAttribute("data-keyboard"),
      "true",
    );
    await page.evaluate(() => {
      delete window.__testAuthViewportHeight;
      window.visualViewport.dispatchEvent(new Event("resize"));
    });
    await waitLayout();
    await page.screenshot({ path: path.join(out, "sms-390.png") });
    assert.equal(
      await page
        .getByRole("button", { name: "Получить код по SMS", exact: true })
        .isDisabled(),
      true,
    );
    await phone.fill("9990000000");
    await page
      .getByRole("button", { name: "Получить код по SMS", exact: true })
      .click();
    const code = page.getByRole("textbox", { name: "Код из SMS", exact: true });
    await code.waitFor();
    assert.equal(
      requests.find((request) => request.path === "/v1/auth/phone/start").body
        .phone,
      "+79990000000",
    );
    await code.fill("1111");
    await page
      .getByRole("button", { name: "Подтвердить код", exact: true })
      .click();
    await page.getByRole("alert").waitFor();
    for (const [width, height] of [
      [390, 844],
      [320, 568],
      [390, 340],
    ]) {
      await page.setViewportSize({ width, height });
      await waitLayout();
      await visibleFit(`code-error-${width}x${height}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await waitLayout();
    await page.getByRole("button", { name: "Изменить номер телефона" }).click();
    await phone.waitFor();
    assert.ok((await phone.inputValue()).includes("999"));
    await page
      .getByRole("button", { name: "Другой способ входа", exact: true })
      .click();
    assert.equal(await page.getByRole("textbox").count(), 0);
    await page
      .getByRole("button", { name: "Войти по SMS", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Получить код по SMS", exact: true })
      .click();
    await code.fill("1234");
    await page
      .getByRole("button", { name: "Подтвердить код", exact: true })
      .click();
    await page.waitForURL("**/profile-setup");
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(out, "verification.json"),
      JSON.stringify(
        {
          measurements,
          runtimeErrors: errors,
          checks: [
            "provider-first screen without phone",
            "three provider payloads omit phone",
            "no initial checkbox or legal links",
            "consent button required after choosing each method",
            "cancel does not grant consent or start auth",
            "legal documents open separately",
            "provider failure and back navigation",
            "separate SMS form",
            "stable input focus",
            "wrong SMS code",
            "SMS success to profile setup",
            "no scroll or clipped controls",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        passed: true,
        viewportChecks: measurements.length,
        runtimeErrors: errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
