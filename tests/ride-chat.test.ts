import { describe, expect, it } from 'vitest';

import type { RideChatMessage } from '../src/domain/models';
import {
  canSendRideChatMessage,
  formatRideChatTime,
  upsertRideChatMessage,
} from '../src/domain/ride-chat';
import {
  presentRideChatMessage,
  rideChatPush,
  type RideChatMessageRow,
} from '../server/ride-chat';

function message(id: string, createdAt: string, body = id): RideChatMessage {
  return {
    id,
    orderId: 'order-1',
    body,
    createdAt,
    sender: { id: 'user-1', name: 'Анна', role: 'passenger' },
  };
}

describe('ride chat', () => {
  it('allows messages only while assigned participants are travelling', () => {
    expect(canSendRideChatMessage('searching')).toBe(false);
    expect(canSendRideChatMessage('accepted')).toBe(true);
    expect(canSendRideChatMessage('driver_arriving')).toBe(true);
    expect(canSendRideChatMessage('driver_waiting')).toBe(true);
    expect(canSendRideChatMessage('in_progress')).toBe(true);
    expect(canSendRideChatMessage('completed')).toBe(false);
    expect(canSendRideChatMessage('cancelled')).toBe(false);
  });

  it('deduplicates socket and HTTP copies while preserving chronological order', () => {
    const later = message('00000000-0000-4000-8000-000000000002', '2026-08-30T12:01:00.000Z');
    const earlier = message('00000000-0000-4000-8000-000000000001', '2026-08-30T12:00:00.000Z');
    const replaced = { ...later, body: 'Обновлённый текст' };

    const ordered = upsertRideChatMessage([later], earlier);
    expect(ordered.map((item) => item.id)).toEqual([earlier.id, later.id]);
    expect(upsertRideChatMessage(ordered, replaced)).toHaveLength(2);
    expect(upsertRideChatMessage(ordered, replaced)[1]?.body).toBe('Обновлённый текст');
  });

  it('presents avatar, timestamp and a chat-specific push deep link', () => {
    const presented = presentRideChatMessage({
      id: '00000000-0000-4000-8000-000000000001',
      order_id: '00000000-0000-4000-8000-000000000010',
      sender_user_id: '00000000-0000-4000-8000-000000000020',
      body: 'Я уже подъехал',
      created_at: new Date('2026-08-30T12:00:00.000Z'),
      sender_name: 'Иван',
      sender_role: 'driver',
      avatar_url: null,
      avatar_mime: 'image/jpeg',
      sender_updated_at: new Date('2026-08-30T11:00:00.000Z'),
    } as RideChatMessageRow);

    expect(presented.sender.avatarUrl).toContain('/v1/users/00000000-0000-4000-8000-000000000020/avatar?v=');
    expect(presented.createdAt).toBe('2026-08-30T12:00:00.000Z');
    expect(rideChatPush(presented, 'passenger')).toMatchObject({
      title: 'Сообщение от Иван',
      body: 'Я уже подъехал',
      channelId: 'ride-chat-v1',
      data: {
        orderId: presented.orderId,
        role: 'passenger',
        chat: 'true',
      },
    });
    expect(formatRideChatTime(presented.createdAt)).toMatch(/^\d{2}:\d{2}$/u);
  });
});
