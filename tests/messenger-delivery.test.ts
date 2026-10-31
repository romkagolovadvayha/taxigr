import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  deleteMaxMessage: vi.fn(),
  deleteTelegramMessage: vi.fn(),
  editMaxMessage: vi.fn(),
  editTelegramMessage: vi.fn(),
  sendMaxLocation: vi.fn(),
  sendMaxMessage: vi.fn(),
  sendTelegramMessage: vi.fn(),
  sendTelegramContact: vi.fn(),
  sendTelegramVenue: vi.fn(),
  sendVkMessage: vi.fn(),
}));

vi.mock('../server/config', () => ({
  config: {
    MAX_BOT_TOKEN: 'max-token',
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    VK_BOT_TOKEN: 'vk-token',
    PUBLIC_URL: 'https://taxi.example',
  },
}));

vi.mock('../server/db', () => ({
  db: { query: mocks.query, execute: mocks.execute },
  firstRow: vi.fn(),
}));

vi.mock('../server/max-bot', () => ({
  deleteMaxMessage: mocks.deleteMaxMessage,
  editMaxMessage: mocks.editMaxMessage,
  sendMaxLocation: mocks.sendMaxLocation,
  sendMaxMessage: mocks.sendMaxMessage,
}));

vi.mock('../server/telegram-bot', () => ({
  deleteTelegramMessage: mocks.deleteTelegramMessage,
  editTelegramMessage: mocks.editTelegramMessage,
  sendTelegramMessage: mocks.sendTelegramMessage,
  sendTelegramContact: mocks.sendTelegramContact,
  sendTelegramVenue: mocks.sendTelegramVenue,
}));

vi.mock('../server/vk-bot', async original => ({
  ...await original<typeof import('../server/vk-bot')>(),
  sendVkMessage: mocks.sendVkMessage,
}));

import { notifyUsersInMessengers } from '../server/messenger-notifications';
import { passengerRideNotification, driverRideNotification } from '../server/ride-messenger';
import type { RideOrder } from '../src/domain/models';

const notification = {
  icon: '🚕',
  title: 'Заказ',
  body: 'ул. Юбилейная, 5 → ул. Ачинцева, 2а',
  buttons: [
    [{ type: 'callback' as const, label: '✅ Принять', data: 'r:a:id', intent: 'positive' as const }],
    [{ type: 'callback' as const, label: '✖️ Отменить', data: 'r:c:id', intent: 'negative' as const }],
  ],
  locations: [{
    title: 'Место подачи',
    address: 'ул. Юбилейная, 5',
    latitude: 56.05,
    longitude: 52.99,
  }],
};

describe('messenger platform delivery', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(['max', 'telegram', 'vk'] as const)('delivers both directions of contact controls in %s', async provider => {
    mocks.query.mockResolvedValueOnce([[{ provider, external_user_id: 'user', chat_id: 'chat' }]]);
    const ride: RideOrder = {
      id: '123e4567-e89b-12d3-a456-426614174000', status: 'accepted', driverId: 'driver',
      pickup: {id: 'pickup', label: 'Откуда', coordinates: {latitude: 56, longitude: 52}},
      destination: {id: 'destination', label: 'Куда', coordinates: {latitude: 56.01, longitude: 52}},
      priceMinor: 25000, passengerId: 'passenger', tariff: 'economy', paymentMethod: 'cash',
      serviceCommissionMinor: 2500, distanceMeters: 1000, durationSeconds: 300,
      createdAt: '2026-10-30T20:30:00Z', updatedAt: '2026-10-30T20:31:00Z',
      driver: {id: 'driver', name: 'Водитель', phone: '+79994445566', rating: 5,
        vehicle: {color: 'Белый', colorHex: '#ffffff', make: 'Lada', model: 'Vesta', plate: 'А123АА'}},
      passenger: {id: 'passenger', name: 'Пассажир', phone: '+79991112233', rating: 5, ratingCount: 0},
    };
    for (const makeNotification of [passengerRideNotification, driverRideNotification]) {
      mocks.query.mockResolvedValueOnce([[]]);
      await notifyUsersInMessengers(['user'], makeNotification(ride));
      const send = provider === 'max' ? mocks.sendMaxMessage : provider === 'telegram' ? mocks.sendTelegramMessage : mocks.sendVkMessage;
      const body = send.mock.calls.at(-1)?.[1];
      expect(JSON.stringify(body)).toContain(`r:contact:${ride.id}`);
      expect(JSON.stringify(body)).toContain(`https://taxi.example/chat/${ride.id}`);
      expect(JSON.stringify(body)).toContain('Позвонить');
      expect(JSON.stringify(body)).toContain('Написать');
      if (makeNotification === passengerRideNotification) {
        mocks.query.mockResolvedValueOnce([[{ provider, external_user_id: 'user', chat_id: 'chat' }]]);
      }
    }
  });

  it('sends one native Telegram contact with the chat button and no extra message', async () => {
    mocks.query.mockResolvedValueOnce([[{ provider: 'telegram', external_user_id: 'tg-user', chat_id: 'tg-chat' }]]);
    await notifyUsersInMessengers(['user-1'], {
      title: 'Связаться с водителем', body: 'Водитель\n+79994445566',
      contact: { name: 'Иван\nВодитель', phone: '+7 999 444-55-66' },
      buttons: [[{ type: 'link', label: 'Написать', url: 'https://taxi.example/chat/order-1' }]],
    });
    expect(mocks.sendTelegramContact).toHaveBeenCalledExactlyOnceWith('tg-chat', {
      phone_number: '+79994445566', first_name: 'Иван Водитель',
      reply_markup: { inline_keyboard: [[{ text: 'Написать', style: 'primary', url: 'https://taxi.example/chat/order-1' }]] },
    });
    expect(mocks.sendTelegramMessage).not.toHaveBeenCalled();
  });

  it('sends the VK phone number and order-chat button in one message', async () => {
    mocks.query.mockResolvedValueOnce([[{ provider: 'vk', external_user_id: 'vk-user', chat_id: 'vk-chat' }]]);
    await notifyUsersInMessengers(['user-1'], {
      title: 'Связаться с пассажиром', body: 'Пассажир\n+79991112233\nНажмите на номер телефона для звонка.',
      contact: { name: 'Пассажир', phone: '+79991112233' },
      buttons: [[{ type: 'link', label: 'Написать', url: 'https://taxi.example/chat/order-1' }]],
    });
    expect(mocks.sendVkMessage).toHaveBeenCalledExactlyOnceWith('vk-chat', {
      message: expect.stringContaining('+79991112233'),
      keyboard: { inline: true, buttons: [[{ action: { type: 'open_link', label: 'Написать', link: 'https://taxi.example/chat/order-1' } }]] },
    });
  });

  it('sends a native MAX contact card with a safe vCard and the order-chat link', async () => {
    mocks.query.mockResolvedValueOnce([[{ provider: 'max', external_user_id: 'max-user', chat_id: 'max-chat' }]]);
    await notifyUsersInMessengers(['user-1'], {
      title: 'Связаться с водителем', body: 'Контакт водителя',
      contact: { name: 'Иван; Петров,\nВодитель', phone: '+7 999 444-55-66' },
      buttons: [[{ type: 'link', label: 'Написать', url: 'https://taxi.example/chat/order-1' }]],
    });
    const body = mocks.sendMaxMessage.mock.calls[0]?.[1];
    expect(body.attachments).toHaveLength(2);
    expect(body.attachments[0]).toEqual({ type: 'contact', payload: {
      name: 'Иван; Петров, Водитель',
      vcf_info: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Иван\\; Петров\\, Водитель\r\nTEL;TYPE=CELL:+79994445566\r\nEND:VCARD\r\n',
    } });
    expect(body.attachments[1].payload.buttons).toEqual([[{ type: 'link', text: 'Написать', url: 'https://taxi.example/chat/order-1' }]]);
    expect(mocks.sendMaxMessage).toHaveBeenCalledOnce();
  });

  it('maps semantic actions and location to native MAX attachments', async () => {
    mocks.query.mockResolvedValueOnce([[
      { provider: 'max', external_user_id: 'max-user', chat_id: 'max-chat' },
    ]]);

    await notifyUsersInMessengers(['user-1'], notification);

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('notifications_enabled = TRUE'),
      ['user-1'],
    );

    expect(mocks.sendMaxMessage).toHaveBeenCalledWith(
      'max-user',
      expect.objectContaining({
        attachments: [{
          type: 'inline_keyboard',
          payload: {
            buttons: [
              [expect.objectContaining({ type: 'callback', intent: 'positive' })],
              [expect.objectContaining({ type: 'callback', intent: 'negative' })],
            ],
          },
        }],
      }),
    );
    expect(mocks.sendMaxLocation).toHaveBeenCalledWith(
      'max-user',
      notification.locations[0],
    );
  });

  it('maps semantic actions and coordinates to native Telegram controls', async () => {
    mocks.query.mockResolvedValueOnce([[
      { provider: 'telegram', external_user_id: 'tg-user', chat_id: 'tg-chat' },
    ]]);

    await notifyUsersInMessengers(['user-1'], notification);

    expect(mocks.sendTelegramMessage).toHaveBeenCalledWith(
      'tg-chat',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [
            [expect.objectContaining({ callback_data: 'r:a:id', style: 'success' })],
            [expect.objectContaining({ callback_data: 'r:c:id', style: 'danger' })],
          ],
        },
      }),
    );
    expect(mocks.sendTelegramVenue).toHaveBeenCalledWith(
      'tg-chat',
      notification.locations[0],
    );
  });

  it('sends the new status and removes every earlier order card', async () => {
    mocks.query
      .mockResolvedValueOnce([[
        {
          id: 7,
          user_id: 'user-1',
          provider: 'telegram',
          external_user_id: 'tg-user',
          chat_id: 'tg-chat',
        },
      ]])
      .mockResolvedValueOnce([[
        { message_id: '10' },
        { message_id: '11' },
      ]]);
    mocks.sendTelegramMessage.mockResolvedValueOnce('12');

    await notifyUsersInMessengers(['user-1'], {
      ...notification,
      orderId: '123e4567-e89b-12d3-a456-426614174000',
      audience: 'passenger',
      title: 'Поездка завершена',
      buttons: [[{
        type: 'link',
        label: '🏁 Поездка завершена',
        url: 'https://taxi.example/orders',
      }]],
    });

    expect(mocks.sendTelegramMessage).toHaveBeenCalledBefore(mocks.deleteTelegramMessage);
    expect(mocks.deleteTelegramMessage).toHaveBeenCalledTimes(2);
    expect(mocks.deleteTelegramMessage).toHaveBeenCalledWith('tg-chat', '10');
    expect(mocks.deleteTelegramMessage).toHaveBeenCalledWith('tg-chat', '11');
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO messenger_order_messages'),
      expect.arrayContaining(['12']),
    );
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM messenger_order_messages'),
      expect.arrayContaining(['10', '11']),
    );
  });

  it('does not track a temporary confirmation card as the current ride status', async () => {
    mocks.query.mockResolvedValueOnce([[
      {
        id: 7,
        user_id: 'user-1',
        provider: 'telegram',
        external_user_id: 'tg-user',
        chat_id: 'tg-chat',
      },
    ]]);
    mocks.sendTelegramMessage.mockResolvedValueOnce('13');

    await notifyUsersInMessengers(['user-1'], {
      ...notification,
      orderId: '123e4567-e89b-12d3-a456-426614174000',
      audience: 'passenger',
      syncExistingOrderMessages: false,
      title: 'Отменить заказ?',
    });

    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
