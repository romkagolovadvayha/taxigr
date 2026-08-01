import { describe, expect, it } from 'vitest';

import {
  formatAdminTelegramAction,
  formatMoney,
} from '../server/admin-telegram';

describe('Telegram admin notifications', () => {
  it('formats an operational action as readable plain text', () => {
    const message = formatAdminTelegramAction({
      icon: '🚕',
      title: 'Создан новый заказ',
      actor: {
        role: 'пассажир',
        id: 'user-1',
        name: 'Иван',
        phone: '+79990000000',
      },
      entity: { label: 'Заказ', id: 'order-1' },
      details: [
        ['Маршрут', 'Грахово → Можга'],
        ['Комментарий', undefined],
      ],
    });

    expect(message).toContain('🚕 Создан новый заказ');
    expect(message).toContain('Кто: пассажир — Иван · +79990000000');
    expect(message).toContain('Заказ: order-1');
    expect(message).toContain('Маршрут: Грахово → Можга');
    expect(message).not.toContain('undefined');
  });

  it('keeps messages within the Telegram sendMessage limit', () => {
    const message = formatAdminTelegramAction({
      title: 'Длинное событие',
      details: Array.from({ length: 20 }, (_, index) => [`Поле ${index}`, 'я'.repeat(1_000)]),
    });

    expect(message.length).toBeLessThanOrEqual(4_096);
  });

  it('formats minor currency units as rubles', () => {
    expect(formatMoney(12_550)).toBe('125,5 ₽');
  });
});
