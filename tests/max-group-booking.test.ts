import { describe, expect, it, vi } from 'vitest';
import { isFreshMaxTaxiRequest } from '../src/domain/group-alerts';
import type { Address, RideOrder } from '../src/domain/models';
import { advanceMaxGroupBooking, maxGroupDriverMessage, type GroupBookingDraft } from '../server/max-group-booking-flow';

const address = (id: string, label: string): Address => ({ id, label, coordinates: { latitude: 56, longitude: 51 } });
const pickup = address('1', 'с. Грахово, Советская, 10');
const otherPickup = address('2', 'с. Грахово, Советская, 12');
const city = address('3', 'г. Можга');
const local = address('4', 'с. Грахово, Пятёрочка');

function fixture() {
  const draft: GroupBookingDraft = { id: 'test', stage: 'pickup', raw: {} };
  const deps = {
    resolve: vi.fn(async (raw: string) => raw === 'Советская' ? { address: null, candidates: [pickup, otherPickup] } :
      { address: ({ 'Совецкая 10': pickup, 'Советская 10': pickup, 'Можгу': city, 'Пятёрочка': local } as Record<string, Address>)[raw] ?? null, candidates: [] }),
    interpretRoute: vi.fn().mockResolvedValue({ pickup: 'Совецкая 10', destination: 'Можгу' }),
    pickupTiming: (text: string) => /завтра/iu.test(text) ? 'завтра' : undefined,
    quote: vi.fn(async (pickup: Address, destination: Address) => ({ passengerId: 'passenger', quote: {
      pickup, destination, token: 'test-token', priceMinor: destination === city ? 95_000 : 20_000,
    } })),
    submit: vi.fn().mockResolvedValue('ride-id'),
    cancel: vi.fn().mockResolvedValue(undefined),
    verificationText: 'Подтвердите номер.',
  };
  return { draft, deps, say: (text: string) => advanceMaxGroupBooking(draft, text, deps) };
}

describe('MAX group booking', () => {
  it.each(['КТО?', 'Ищу такси в Можгу', 'Кто может забрать?', 'Такси есть?', 'Нужно срочно такси'])(
    'starts from a fresh request %s', text => expect(isFreshMaxTaxiRequest(text, 1_000_000, 1_000_000)).toBe(true),
  );
  it.each(['Кто знает расписание?', 'Не нужно такси, нашли', 'Таксую', 'Кто таксует? Уже уехали', 'Спасибо', 'Где мой заказ?'])(
    'does not contact the author of %s', text => expect(isFreshMaxTaxiRequest(text, 1_000_000, 1_000_000)).toBe(false),
  );
  it('ignores stale messages and timestamps too far in the future', () => {
    expect(isFreshMaxTaxiRequest('Кто?', 1_000_000, 1_181_000)).toBe(false);
    expect(isFreshMaxTaxiRequest('Кто?', 1_040_000, 1_000_000)).toBe(false);
  });
  it('quotes a corrected intercity address and stays silent after consent until assignment', async () => {
    const f = fixture();
    expect(await f.say('Да')).toContain('Откуда забрать');
    expect(await f.say('Совецкая 10')).toContain('Куда едем');
    expect(await f.say('Можгу')).toContain('г. Можга. 950 ₽');
    expect(await f.say('да?')).toContain('Подходит?');
    expect(f.deps.submit).not.toHaveBeenCalled();
    expect(await f.say('Да, давайте')).toBeNull();
    expect(await f.say('Где машина?')).toBeNull();
    expect(f.draft.orderId).toBe('ride-id');
    expect(f.deps.submit).toHaveBeenCalledTimes(1);
  });
  it('accepts both addresses at once and reprices after a changed destination', async () => {
    const f = fixture();
    expect(await f.say('Заберите с Советской 10, дальше хотелось бы в Можгу')).toContain('950 ₽');
    expect(f.deps.interpretRoute).toHaveBeenCalledOnce();
    expect(await f.say('Куда: Пятёрочка')).toContain('200 ₽');
    expect(f.deps.submit).not.toHaveBeenCalled();
  });
  it('asks for a specific address or a numbered choice', async () => {
    const f = fixture();
    expect(await f.say('где-то там')).toContain('Не разобрал');
    expect(await f.say('Советская')).toContain('2. с. Грахово, Советская, 12');
    expect(await f.say('9')).toContain('номер из списка');
    expect(await f.say('2')).toContain('Куда едем');
    expect(await f.say('Можгу')).toContain('Советская, 12');
  });
  it('does not turn a future time or decline into consent', async () => {
    const f = fixture();
    await f.say('Советская 10 → Можгу');
    expect(await f.say('Завтра')).toContain('ближайшую подачу');
    expect(await f.say('нет, спасибо')).toBe('Хорошо, отменили.');
    expect(await f.say('да')).toBeNull();
    expect(f.deps.submit).not.toHaveBeenCalled();
  });
  it('reconfirms an expired quote and supports cancelling while waiting', async () => {
    const f = fixture();
    await f.say('Советская 10 → Можгу');
    f.deps.submit.mockRejectedValueOnce({ code: 'QUOTE_EXPIRED_OR_INVALID' });
    expect(await f.say('да')).toContain('Подходит?');
    expect(f.draft.stage).toBe('confirm');
    expect(await f.say('да')).toBeNull();
    expect(await f.say('отбой')).toBe('Хорошо, отменили.');
    expect(f.deps.cancel).toHaveBeenCalledTimes(1);
  });
  it('keeps a request to stop messages silent without cancelling the ride', async () => {
    const f = fixture();
    await f.say('Советская 10 → Можгу');
    await f.say('поехали');
    expect(await f.say('Больше не пишите')).toBeNull();
    expect(f.draft.optOut).toBe(true);
    expect(f.deps.cancel).not.toHaveBeenCalled();
  });
  it('gives time only when there is an active approach with coordinates', () => {
    const order = { status: 'driver_arriving', pickup, driver: { phone: '+79990000000', coordinates: { latitude: 56.001, longitude: 51 },
      vehicle: { color: 'Белая', make: 'Lada', model: 'Granta', plate: 'А123АА18' } } } as RideOrder;
    expect(maxGroupDriverMessage(order, true, true)).toMatch(/через \d+ мин.*А123АА18.*\+79990000000/u);
    expect(maxGroupDriverMessage(order, true, false)).toContain('уточнить у водителя');
    expect(maxGroupDriverMessage(order, false, true)).toContain('после текущей поездки');
    expect(maxGroupDriverMessage({ ...order, status: 'driver_waiting' }, true, false)).toContain('уже на месте');
    expect(maxGroupDriverMessage({ ...order, driver: undefined }, false, false)).toBeNull();
  });
});
