import { describe, expect, it } from 'vitest';

import { formatPersonalMessengerNotification } from '../server/messenger-notifications';

describe('personal messenger notifications', () => {
  it('formats a clear ride status message', () => {
    const message = formatPersonalMessengerNotification({
      icon: '📍',
      title: 'Машина приехала',
      body: 'Водитель ожидает вас в месте подачи.',
      details: [
        ['Госномер', 'А123ВС18'],
        ['Телефон', undefined],
      ],
    });

    expect(message).toContain('📍 Машина приехала');
    expect(message).toContain('Водитель ожидает вас в месте подачи.');
    expect(message).toContain('Госномер: А123ВС18');
    expect(message).not.toContain('undefined');
  });

  it('stays within the stricter MAX text limit', () => {
    const message = formatPersonalMessengerNotification({
      title: 'Событие',
      body: 'я'.repeat(10_000),
    });

    expect(message.length).toBeLessThanOrEqual(4_000);
  });
});
