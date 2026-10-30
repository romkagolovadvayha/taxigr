import { describe, expect, it, vi } from 'vitest';
import type { PoolConnection } from 'mysql2/promise';
import { groupAllowed, isTaxiRequest, normalizeGroupTitle, senderPhone } from '../src/domain/group-alerts';
import { groupEventSchema, matchGroupAuthor } from '../server/group-alerts';

describe('group request filtering and sender identity', () => {
  it.each(['КТО ТАКСУЕТ???', 'Кто сейчас таксует', 'Ребята, нужно такси!', 'Кто может отвезти в Грахово?', 'ищу такси', 'Таксует кто??', 'Кто', 'кто?', 'КТО!', 'Кто-нибудь едет?', 'А кто в деревне?'])('recognizes a request: %s', text => expect(isTaxiRequest(text)).toBe(true));
  it.each(['Я таксую до вечера', 'таксует Иван', 'Спасибо за поездку', 'Александр', 'Таксист уже приехал', 'Никто', 'трактор', 'КТОТО'])('ignores unrelated messages: %s', text => expect(isTaxiRequest(text)).toBe(false));
  it('pins groups by provider and immutable ID even after a title change', () => {
    const groups = [{ provider: 'max' as const, title: 'Такси', id: '123' }];
    expect(groupAllowed(groups, 'max', 'Новое имя', '123')).toBe(true);
    expect(groupAllowed(groups, 'max', 'Такси', '456')).toBe(false);
    expect(groupAllowed(groups, 'whatsapp', 'Такси', '123')).toBe(false);
    expect(groupAllowed(groups, 'max', 'Такси')).toBe(false);
  });
  it('matches MAX only to an active verified messenger identity, never a conflicting phone', async () => {
    const query = vi.fn().mockResolvedValue([[{ id: 'max-user' }]]);
    const connection = { query } as unknown as PoolConnection;
    expect(await matchGroupAuthor(connection, 'tel:+79998887766', 'max', '42')).toBe('max-user');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("a.provider = 'max'"), ['42']);
    query.mockResolvedValue([[]]);
    expect(await matchGroupAuthor(connection, 'tel:+79998887766', 'max', '42')).toBeNull();
  });
  it('limits collection to the configured provider and exact normalized title', () => {
    const groups = [{ provider: 'max' as const, title: 'Кто таксует?' }];
    expect(groupAllowed(groups, 'max', ' КТО  таксует? ')).toBe(true);
    expect(groupAllowed(groups, 'whatsapp', 'Кто таксует?')).toBe(false);
    expect(groupAllowed(groups, 'max', 'Кто таксует? объявления')).toBe(false);
    expect(normalizeGroupTitle(' Грахово\nТакси ')).toBe('грахово такси');
  });
  it('uses only an explicit sender phone URI, not a nickname or message', () => {
    expect(senderPhone('tel:+7 (999) 888-77-66')).toBe('+79998887766');
    for (const value of [undefined, 'Иван', '+79998887766', 'Иван tel:+79998887766', 'content://contacts/42', 'max://user/42']) expect(senderPhone(value)).toBeNull();
  });
  it('requires exactly one existing, verified account and never queries names', async () => {
    const query = vi.fn().mockResolvedValue([[{ id: 'known-user' }]]);
    const connection = { query } as unknown as PoolConnection;
    expect(await matchGroupAuthor(connection, 'Иван')).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(await matchGroupAuthor(connection, 'tel:+79998887766')).toBe('known-user');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('phone_verified_at IS NOT NULL'), ['+79998887766']);
    query.mockResolvedValue([[{ id: 'one' }, { id: 'two' }]]);
    expect(await matchGroupAuthor(connection, 'tel:+79998887766')).toBeNull();
  });
  it('rejects client-supplied database identities or recipients', () => {
    const event = { eventId: 'a'.repeat(64), provider: 'max', groupTitle: 'Кто таксует?', text: 'Кто таксует?', sentAt: Date.now() };
    expect(groupEventSchema.safeParse(event).success).toBe(true);
    expect(groupEventSchema.safeParse({ ...event, recipient: 'all-drivers' }).success).toBe(false);
    expect(groupEventSchema.safeParse({ ...event, matchedUserId: 'someone' }).success).toBe(false);
    expect(groupEventSchema.safeParse({ ...event, senderId: '42', provider: 'whatsapp' }).success).toBe(false);
  });
});
