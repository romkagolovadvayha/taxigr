import Fastify from "fastify";
import { createHmac } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { currentInitialLegalAcceptance } from "../src/legal/documents";
import { registerRoutes } from "../server/routes";
import { sha256 } from "../server/security";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  firstRow: vi.fn(),
  findOrCreatePhoneUser: vi.fn(),
  findUserWithRoles: vi.fn(),
  linkMessengerIdentity: vi.fn(),
  recordInitialConsents: vi.fn(),
  exchangeVkAuthorizationCode: vi.fn(),
  authenticate: vi.fn(),
}));

// No real database, credentials or provider requests are used by these API tests.
vi.mock("../server/config", () => ({
  config: {
    JWT_SECRET: "isolated-messenger-login-test-secret",
    PHONE_CODE_TTL_MINUTES: 10,
    MAX_BOT_USERNAME: "test_bot",
    MAX_BOT_TOKEN: "test",
    MAX_WEBHOOK_SECRET: "test",
    TELEGRAM_BOT_USERNAME: "test_bot",
    TELEGRAM_BOT_TOKEN: "test",
    TELEGRAM_WEBHOOK_SECRET: "test",
    VK_APP_ID: "1",
    VK_REDIRECT_URI: "https://example.test/callback",
    VK_MINI_APP_ID: "54638428",
    VK_MINI_APP_SECRET: "test-mini-app-secret",
    VK_MINI_APP_MAX_AGE_SECONDS: 900,
    VK_COMMUNITY_ID: "1",
    VK_BOT_TOKEN: "test",
    VK_CALLBACK_SECRET: "test",
    VK_CALLBACK_CONFIRMATION: "test",
  },
}));
vi.mock("../server/security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/security")>()),
  authenticate: mocks.authenticate,
}));
vi.mock("../server/db", () => ({
  db: { execute: mocks.execute },
  firstRow: mocks.firstRow,
  withTransaction: (callback: (connection: unknown) => unknown) =>
    callback({ query: mocks.query, execute: mocks.execute }),
}));
vi.mock("../server/auth-abuse", () => ({
  buildAuthIdentity: () => ({ ipAddress: "127.0.0.1" }),
  createAuthAttempt: vi.fn().mockResolvedValue("test-attempt"),
  finishAuthAttempt: vi.fn().mockResolvedValue(undefined),
  consumeAuthRateLimits: vi.fn(),
  refundAuthRateLimits: vi.fn(),
}));
vi.mock("../server/repositories", () => ({
  findOrCreatePhoneUser: mocks.findOrCreatePhoneUser,
  findUserWithRoles: mocks.findUserWithRoles,
  linkMessengerIdentity: mocks.linkMessengerIdentity,
}));
vi.mock("../server/legal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/legal")>()),
  recordInitialConsents: mocks.recordInitialConsents,
}));
vi.mock("../server/social-avatar", () => ({
  userHasNoAvatar: vi.fn().mockResolvedValue(false),
  syncUserAvatarFromRemoteUrlIfEmpty: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../server/vk-bot", () => ({
  isVkMessagesAllowed: vi.fn().mockResolvedValue(true),
}));
vi.mock("../server/vk-auth", () => ({
  vkAuthorizationUrl: () => "https://example.test/auth",
  vkCommunityMessageUrl: () => "https://example.test/community",
  exchangeVkAuthorizationCode: mocks.exchangeVkAuthorizationCode,
  vkCallbackHtml: (success: boolean) => String(success),
}));

const app = Fastify();
const legalAcceptance = currentInitialLegalAcceptance();
const installationId = "isolated-test-installation";
const exchangeToken = "test-exchange-token-with-at-least-32-characters";
const challengeId = "123e4567-e89b-42d3-a456-426614174000";
const providers = ["max", "vk", "telegram"] as const;

beforeAll(async () => {
  await registerRoutes(app, vi.fn(), { disconnectUser: vi.fn() });
});
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ id: "test-user", roles: ["passenger"] });
  mocks.firstRow.mockResolvedValue({ blocked_at: null });
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
  mocks.findOrCreatePhoneUser.mockResolvedValue("test-user");
  mocks.findUserWithRoles.mockResolvedValue({
    id: "test-user",
    roles: ["passenger"],
    phone: "+79990000000",
  });
});

describe.each(providers)("%s login without manual phone entry", (provider) => {
  it("starts with consent and installation ID only", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/auth/${provider}/start`,
      payload: { legalAcceptance, installationId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.exchangeToken).toHaveLength(43);
    const insert = mocks.execute.mock.calls.find(([sql]) =>
      sql.includes(`INSERT INTO ${provider}_auth_challenges`),
    );
    expect(insert).toBeDefined();
    expect(insert![1][provider === "vk" ? 4 : 3]).toBeNull();
  });

  it("preserves the phone constraint for older clients", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/auth/${provider}/start`,
      payload: { legalAcceptance, installationId, phone: "+79990000000" },
    });
    expect(response.statusCode).toBe(200);
    const insert = mocks.execute.mock.calls.find(([sql]) =>
      sql.includes(`INSERT INTO ${provider}_auth_challenges`),
    );
    expect(insert![1][provider === "vk" ? 4 : 3]).toBe("+79990000000");
  });

  it.each([
    { installationId },
    { installationId, legalAcceptance, phone: "+12025550123" },
    { installationId, legalAcceptance, phone: null },
  ])("rejects invalid input without creating a challenge", async (payload) => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/auth/${provider}/start`,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    { expected: null, verified: "+79990000000", status: "verified" },
    { expected: "+79990000000", verified: "+79990000000", status: "verified" },
    { expected: "+79990000001", verified: "+79990000000", status: "failed" },
    { expected: null, verified: null, status: "pending" },
  ])(
    "exchanges only a verified matching phone: $status / $expected",
    async ({ expected, verified, status }) => {
      const row = {
        exchange_secret_hash: sha256(exchangeToken),
        expected_phone: expected,
        verified_phone: verified,
        expires_at: new Date(Date.now() + 60_000),
        failure_code: null,
        legal_acceptance: legalAcceptance,
        consent_ip: null,
        consent_user_agent: null,
        [`${provider}_user_id`]: "42",
        [`${provider}_chat_id`]: "42",
      };
      mocks.firstRow.mockResolvedValue(row);
      mocks.query.mockResolvedValue([[row]]);
      const response = await app.inject({
        method: "POST",
        url: `/v1/auth/${provider}/status`,
        payload: { challengeId, exchangeToken, installationId },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.status).toBe(status);
      if (status === "verified") {
        expect(mocks.findOrCreatePhoneUser).toHaveBeenCalledWith(
          expect.anything(),
          verified,
        );
        expect(response.json().data.token).toBeTypeOf("string");
        expect(mocks.recordInitialConsents).toHaveBeenCalledOnce();
      } else {
        expect(mocks.findOrCreatePhoneUser).not.toHaveBeenCalled();
        expect(response.json().data.token).toBeUndefined();
      }
    },
  );

  it("rejects a wrong exchange token", async () => {
    const row = {
      exchange_secret_hash: sha256("different-token"),
      verified_phone: "+79990000000",
    };
    mocks.firstRow.mockResolvedValue(row);
    mocks.query.mockResolvedValue([[row]]);
    const response = await app.inject({
      method: "POST",
      url: `/v1/auth/${provider}/status`,
      payload: { challengeId, exchangeToken, installationId },
    });
    expect(response.statusCode).toBe(404);
    expect(mocks.findOrCreatePhoneUser).not.toHaveBeenCalled();
  });
});

it.each([undefined, 'web', 'ios', 'android'])("VK start chooses the launch for platform %s", async (platform) => {
  const response = await app.inject({
    method: 'POST', url: '/v1/auth/vk/start',
    payload: { legalAcceptance, installationId, platform },
  });
  expect(response.statusCode).toBe(200);
  const data = response.json().data;
  if (platform === 'android') {
    const state = mocks.execute.mock.calls[0]![1][1];
    expect(data.appUrl).toBe(`https://vk.com/app54638428#native_auth=${state}`);
    expect(data.nativeLoginCode).toBe(state.slice(0, 6).toUpperCase());
    expect(data.appUrl).not.toContain(data.exchangeToken);
  } else {
    expect(data.appUrl).toBeUndefined();
    expect(data.nativeLoginCode).toBeUndefined();
  }
  expect(data.authorizationUrl).toBe('https://example.test/auth');
});

function signedNativeLaunch(): string {
  const query = new URLSearchParams({
    vk_app_id: '54638428', vk_ts: String(Math.floor(Date.now() / 1000)), vk_user_id: '42',
  }).toString();
  const sign = createHmac('sha256', 'test-mini-app-secret').update(query).digest('base64url');
  return `${query}&sign=${sign}`;
}

describe('VK native confirmation API', () => {
  const state = 'x'.repeat(43);
  const pending = () => ({
    id: challengeId, expected_phone: null, vk_user_id: null, verified_at: null,
    completed_at: null, failure_code: null, expires_at: new Date(Date.now() + 60_000),
  });

  it('requires signed VK launch and a matching authenticated taxi account', async () => {
    mocks.query.mockResolvedValueOnce([[pending()]])
      .mockResolvedValueOnce([[{ phone: '+79990000000', first_name: 'Test', last_name: null }]]);
    const response = await app.inject({
      method: 'POST', url: '/v1/auth/vk/native/confirm',
      payload: { state, launchParams: signedNativeLaunch() },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ confirmed: true });
    expect(mocks.query).toHaveBeenNthCalledWith(2, expect.stringContaining('account.external_user_id = ?'), ['test-user', '42']);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE vk_auth_challenges'),
      ['+79990000000', '42', 'Test', null, challengeId]);
  });

  it('rejects forged VK identity before looking up a challenge', async () => {
    const response = await app.inject({
      method: 'POST', url: '/v1/auth/vk/native/confirm',
      payload: { state, launchParams: signedNativeLaunch().replace('vk_user_id=42', 'vk_user_id=43') },
    });
    expect(response.statusCode).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects approval without an authenticated taxi session', async () => {
    mocks.authenticate.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    const response = await app.inject({
      method: 'POST', url: '/v1/auth/vk/native/confirm',
      payload: { state, launchParams: signedNativeLaunch() },
    });
    expect(response.statusCode).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a signed VK identity linked to a different taxi account', async () => {
    mocks.query.mockResolvedValueOnce([[pending()]]).mockResolvedValueOnce([[]]);
    const response = await app.inject({
      method: 'POST', url: '/v1/auth/vk/native/confirm',
      payload: { state, launchParams: signedNativeLaunch() },
    });
    expect(response.statusCode).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

it("still requires a phone for SMS", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/phone/start",
    payload: { legalAcceptance, installationId },
  });
  expect(response.statusCode).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it.each([
  ["+79990000000", true],
  [null, false],
] as const)(
  "VK callback uses the provider phone %s when no phone was entered",
  async (phone, matches) => {
    mocks.firstRow.mockResolvedValue({
      id: challengeId,
      expected_phone: null,
      code_verifier: "test-verifier",
      expires_at: new Date(Date.now() + 60_000),
    });
    mocks.exchangeVkAuthorizationCode.mockResolvedValue({
      phone,
      userId: "42",
      firstName: "Test",
      lastName: null,
      avatarUrl: null,
    });
    const response = await app.inject({
      url: "/v1/auth/vk/callback?state=test-state-at-least-20-characters&code=test-code&device_id=test-device",
    });
    expect(response.body).toBe(String(matches));
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE vk_auth_challenges"),
      [
        phone,
        "42",
        "Test",
        null,
        null,
        matches ? null : "PHONE_NOT_SHARED",
        matches,
        challengeId,
      ],
    );
  },
);
