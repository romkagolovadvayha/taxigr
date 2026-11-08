import { randomUUID } from 'node:crypto';
import mysql, { type Connection } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminDriverDetail, RideOrder, Tariff } from '../src/domain/models';
import { confirmAddressPoint } from '../src/domain/route-stops';
import { currentInitialLegalAcceptance } from '../src/legal/documents';
import { signSession } from '../server/security';
import { defaultFirstOrderPromotionSettings, type FirstOrderPromotionSettings } from '../src/domain/first-order-discount';
import type { PromotionSettingsUpdate } from '../server/promotion-settings';
import type { PricingRules } from '../src/domain/pricing';
import type { GatewaySettingsView } from '../src/domain/gateway';
import type { OperatorDetails } from '../src/domain/operator-details';

const enabled = process.env.RUN_API_INTEGRATION === '1';
const apiUrl = process.env.INTEGRATION_API_URL ?? 'http://127.0.0.1:4110';
const databaseUrl = process.env.MYSQL_URL ?? '';
let connection: Connection;
let adminToken = '', passengerToken = '';
const adminId = randomUUID(), passengerId = randomUUID();
const driverId = randomUUID(), driverUserId = randomUUID();
let original: FirstOrderPromotionSettings;
let originalBooking: unknown;
const pickup = confirmAddressPoint({ id: 'promotion-qa-g', label: 'с. Грахово, ул. Ачинцева, 5', houseNumber: '5', coordinates: { latitude: 56.04758, longitude: 51.95842 } }, { latitude: 56.04758, longitude: 51.95842 });
const destination = confirmAddressPoint({ id: 'promotion-qa-d', label: 'с. Грахово, ул. Колпакова, 1Б', houseNumber: '1Б', coordinates: { latitude: 56.04576, longitude: 51.96165 } }, { latitude: 56.04576, longitude: 51.96165 });
async function api<T>(path: string, token: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${apiUrl}${path}`, { method, signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, ...await response.json() as { data: T; error?: unknown } };
}
const settingsPath = '/v1/admin/promotion-settings';
const save = (settings: PromotionSettingsUpdate) => api<FirstOrderPromotionSettings>(settingsPath, adminToken, 'PUT', settings);
const quote = () => api<{ tariffs: Tariff[]; quoteToken: string }>('/v1/quotes', passengerToken, 'POST', { pickup, destination });

describe.runIf(enabled)('promotion settings persisted through the real API and database', () => {
  beforeAll(async () => {
    const target = new URL(databaseUrl);
    if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname) || !/^\/taxi_(qa|test)_/u.test(target.pathname)) throw new Error('Isolated local QA database required');
    connection = await mysql.createConnection(databaseUrl);
    for (const [id, phone, role] of [[adminId, '+79090928801', 'admin'], [passengerId, '+79090928802', 'passenger'], [driverUserId, '+79090928804', 'driver']] as const) {
      await connection.execute("INSERT INTO users (id,name,phone,phone_verified_at,gender,profile_completed_at) VALUES (?, 'Promotion QA', ?, UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3))", [id, phone]);
      await connection.execute('INSERT INTO user_roles (user_id,role) VALUES (?,?)', [id, role]);
    }
    await connection.execute("INSERT INTO drivers (id,user_id,status) VALUES (?,?,'offline')", [driverId, driverUserId]);
    adminToken = await signSession({ id: adminId, roles: ['admin'] });
    passengerToken = await signSession({ id: passengerId, roles: ['passenger'] });
    original = (await api<FirstOrderPromotionSettings>(settingsPath, adminToken)).data;
    originalBooking = (await api('/v1/admin/booking-settings', adminToken)).data;
    expect((await api('/v1/admin/booking-settings', adminToken, 'PUT', { enabled: true })).status).toBe(200);
  });
  afterAll(async () => {
    if (!connection) return;
    if (original) await save(original);
    if (originalBooking) await api('/v1/admin/booking-settings', adminToken, 'PUT', originalBooking);
    await connection.execute('DELETE FROM orders WHERE passenger_id = ?', [passengerId]);
    await connection.execute('DELETE FROM drivers WHERE id = ?', [driverId]);
    await connection.query('DELETE FROM users WHERE id IN (?,?,?)', [adminId, passengerId, driverUserId]);
    await connection.end();
  });
  it('saves all tariff and dispatch fields, reads them again and restores their original values', async () => {
    const path = '/v1/admin/tariffs';
    const previous = (await api<PricingRules>(path, adminToken)).data;
    const changes = { ...previous, grahovoFare07To22Minor: 21000, grahovoFare22To02Minor: 31000, grahovoFare02To07Minor: 41000,
      districtPerKilometer07To22Minor: 6100, districtPerKilometer22To02Minor: 11100, districtPerKilometer02To07Minor: 16100,
      intercityPerKilometerMinor: 5100, intercityPerKilometer07To22Minor: 5100, intercityPerKilometer22To02Minor: 7100, intercityPerKilometer02To07Minor: 10100,
      childSurchargeMinor: 8000, additionalStopGrahovoSurchargeBps: 6500, waitingFreeMinutes: 4, waitingPerMinuteMinor: 500,
      searchPriceIncreaseIntervalMinutes: 5, searchPriceIncreaseStepMinor: 4000, serviceCommissionBps: 500,
      passengerCancellationLimit: 4, passengerCancellationWindowHours: 25, passengerCancellationBlockHours: 25 };
    try {
      expect((await api(path, adminToken, 'PUT', changes)).status).toBe(200);
      expect((await api(path, adminToken)).data).toEqual(changes);
    } finally { await api(path, adminToken, 'PUT', previous); }
    const dispatchPath = '/v1/admin/driver-dispatch-settings';
    const dispatch = (await api(dispatchPath, adminToken)).data;
    try {
      const changed = { grahovo: 2, district: 3, intercity: 4 };
      expect((await api(dispatchPath, adminToken, 'PUT', changed)).status).toBe(200);
      expect((await api(dispatchPath, adminToken)).data).toEqual(changed);
    } finally { await api(dispatchPath, adminToken, 'PUT', dispatch); }
  });
  it('saves templates with repeated, moved, absent and empty tags and uses the actual percentage', async () => {
    for (const [template, rendered] of [['Ваша скидка {discount}% — {discount}% сегодня', 'Ваша скидка 20% — 20% сегодня'], ['Первый заказ по акции', 'Первый заказ по акции'], ['', '']]) {
      const next = { ...defaultFirstOrderPromotionSettings, discountPercent: 20, messageTemplate: template! };
      expect((await save(next)).status).toBe(200);
      expect((await api<FirstOrderPromotionSettings>(settingsPath, adminToken)).data).toEqual(next);
      const result = await quote();
      expect(result.status, JSON.stringify(result.error)).toBe(200);
      for (const tariff of result.data.tariffs) {
        expect(tariff.discountPercent).toBe(20);
        expect(tariff.promotionText).toBe(rendered);
        expect(tariff.tariffPromotionText).toBe('Первый заказ −20%');
        expect(tariff.priceMinor).toBe(Math.round(tariff.originalPriceMinor! * 0.8 / 1000) * 1000);
      }
    }
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT after_json FROM audit_logs WHERE actor_user_id = ? AND action = 'promotion_settings.update' ORDER BY id DESC LIMIT 1", [adminId]);
    const audit = rows[0]!.after_json;
    expect(typeof audit === 'string' ? JSON.parse(audit) : audit).toEqual({ ...defaultFirstOrderPromotionSettings, discountPercent: 20, messageTemplate: '' });
  });
  it('persists both messages independently and keeps an empty caption on saves from older clients', async () => {
    for (const [tariffMessageTemplate, expected] of [['Ваша выгода {discount}%', 'Ваша выгода 20%'], ['', ''], ['   ', '']]) {
      const next = { discountPercent: 20, messageTemplate: 'Скидка {discount}% уже учтена', tariffMessageTemplate: tariffMessageTemplate! };
      expect((await save(next)).status).toBe(200);
      expect((await api<FirstOrderPromotionSettings>(settingsPath, adminToken)).data).toEqual(next);
      const result = await quote();
      expect(result.status).toBe(200);
      expect(result.data.tariffs.every(tariff => tariff.tariffPromotionText === expected && tariff.promotionText === 'Скидка 20% уже учтена')).toBe(true);
    }
    await save({ discountPercent: 20, messageTemplate: '', tariffMessageTemplate: '' });
    const legacy = await save({ discountPercent: 25, messageTemplate: 'Из старой админки' });
    expect(legacy.data.tariffMessageTemplate).toBe('');
    expect((await api<FirstOrderPromotionSettings>(settingsPath, adminToken)).data.tariffMessageTemplate).toBe('');
    const final = await quote();
    expect(final.data.tariffs[0]).toMatchObject({ discountPercent: 25, tariffPromotionText: '', promotionText: 'Из старой админки' });
  });
  it('persists operator details and proxy settings through fresh reads', async () => {
    const operatorPath = '/v1/admin/operator-details';
    const previous = (await api<OperatorDetails>(operatorPath, adminToken)).data;
    try {
      const next = { ...previous, legalName: 'ИП Проверка сохранения', inn: '012345678901', registrationNumber: '012345678901234', email: 'qa@example.com' };
      expect((await api(operatorPath, adminToken, 'PUT', next)).status).toBe(200);
      expect((await api(operatorPath, adminToken)).data).toEqual(next);
      expect((await api('/v1/operator-details', adminToken)).data).toEqual(next);
    } finally { await api(operatorPath, adminToken, 'PUT', previous); }
    const gatewayPath = '/v1/admin/gateway-settings';
    const initial = (await api<GatewaySettingsView>(gatewayPath, adminToken)).data;
    const { hasProxyPassword: _password, hasWebhookSecret: _secret, ...values } = initial;
    const input = { ...values, proxyEnabled: false, webhooksEnabled: false, proxyUsername: 'qa_save', project: 'qa-save', apiPublicUrl: 'https://example.com' };
    try {
      const saved = await api<GatewaySettingsView>(gatewayPath, adminToken, 'PUT', input);
      expect(saved.status, JSON.stringify(saved.error)).toBe(200);
      const read = (await api<GatewaySettingsView>(gatewayPath, adminToken)).data;
      expect(read).toEqual(saved.data);
      expect(read).toMatchObject({ ...input, revision: input.revision + 1 });
    } finally {
      const current = (await api<GatewaySettingsView>(gatewayPath, adminToken)).data;
      await api(gatewayPath, adminToken, 'PUT', { ...values, revision: current.revision });
    }
  });
  it('disables the promotion at zero and excludes intercity from configured discounts', async () => {
    await save({ discountPercent: 0, messageTemplate: '{discount}%' });
    const result = await quote();
    expect(result.data.tariffs[0]).not.toHaveProperty('discountPercent');
    expect(result.data.tariffs[0]).not.toHaveProperty('originalPriceMinor');
    await save({ discountPercent: 20, messageTemplate: '{discount}%' });
    const intercity = confirmAddressPoint({ ...destination, id: 'promotion-qa-intercity', label: 'г. Можга, дом 1', coordinates: { latitude: 56.4439, longitude: 52.2274 } }, { latitude: 56.4439, longitude: 52.2274 });
    const external = await api<{ tariffs: Tariff[] }>('/v1/quotes', passengerToken, 'POST', { pickup, destination: intercity });
    expect(external.status).toBe(200);
    expect(external.data.tariffs[0]).not.toHaveProperty('discountPercent');
  });
  it('persists driver profile, commission, priority and status changes through fresh reads', async () => {
    const path = `/v1/admin/drivers/${driverId}`;
    const profile = { name: 'Водитель после правки', hasSezPass: true, hasChildSeat: true, licenseNumber: '18 QA 123456' };
    const edited = await api(`${path}/profile`, adminToken, 'PATCH', profile);
    expect(edited.status, JSON.stringify(edited.error)).toBe(200);
    const priorities = { grahovo: true, district: false, intercity: true };
    expect((await api(path, adminToken, 'PATCH', { commissionBps: 350, priorities, status: 'suspended' })).status).toBe(200);
    const detail = (await api<AdminDriverDetail>(path, adminToken)).data;
    expect(detail.user.name).toBe(profile.name);
    expect(detail.driver).toMatchObject({ hasSezPass: true, hasChildSeat: true, licenseNumber: profile.licenseNumber,
      commissionBps: 350, priorities, status: 'suspended' });
    for (const commissionBps of [null, 0]) {
      expect((await api(path, adminToken, 'PATCH', { commissionBps, status: 'offline' })).status).toBe(200);
      const updated = (await api<AdminDriverDetail>(path, adminToken)).data;
      expect(updated.driver.commissionBps ?? null).toBe(commissionBps);
      expect(updated.driver.status).toBe('offline');
      expect(updated.driver.priorities).toEqual(priorities);
    }
  });
  it('rejects a stale percentage before creating an order and preserves the accepted order rates', async () => {
    await save({ discountPercent: 30, messageTemplate: 'Скидка {discount}%' });
    const stale = (await quote()).data;
    await save({ discountPercent: 20, messageTemplate: 'Скидка {discount}%' });
    const body = (quoteToken: string) => ({ pickup, destination, quoteToken, tariff: 'economy', paymentMethod: 'cash',
      idempotencyKey: randomUUID(), deviceId: `promotion-${passengerId}`, legalAcceptance: currentInitialLegalAcceptance() });
    const rejected = await api('/v1/orders', passengerToken, 'POST', body(stale.quoteToken));
    expect(rejected.status).toBe(409);
    expect(rejected.error).toMatchObject({ code: 'PROMOTION_QUOTE_CHANGED' });
    const current = (await quote()).data;
    const created = await api<RideOrder>('/v1/orders', passengerToken, 'POST', body(current.quoteToken));
    expect(created.status, JSON.stringify(created.error)).toBe(201);
    expect(created.data.priceMinor).toBe(current.tariffs[0]!.priceMinor);
    expect(created.data.promotionCode).toBe('first-local-order-20');
    const before = (await api<RideOrder>(`/v1/orders/${created.data.id}`, passengerToken)).data;
    await save({ discountPercent: 40, messageTemplate: '{discount}%' });
    const after = (await api<RideOrder>(`/v1/orders/${created.data.id}`, passengerToken)).data;
    expect(after.basePriceMinor).toBe(before.basePriceMinor);
    expect(after.waitingPerMinuteMinor).toBe(before.waitingPerMinuteMinor);
    expect(after.searchPriceIncreaseStepMinor).toBe(before.searchPriceIncreaseStepMinor);
  });
});
