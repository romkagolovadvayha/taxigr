import { describe, expect, it } from 'vitest';

import type { RideChatMessage } from '../src/domain/models';
import {
  canSendRideChatMessage,
  formatRideChatTime,
  upsertRideChatMessage,
} from '../src/domain/ride-chat';
import {
  decodeRideChatImage,
  MAX_RIDE_CHAT_IMAGE_BYTES,
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
      attachment_mime: 'image/png',
      attachment_size_bytes: 68,
      attachment_width: 1,
      attachment_height: 1,
      attachment_file_name: 'pickup.png',
      attachment_sha256: 'hash',
    } as RideChatMessageRow);

    expect(presented.sender.avatarUrl).toContain('/v1/users/00000000-0000-4000-8000-000000000020/avatar?v=');
    expect(presented.createdAt).toBe('2026-08-30T12:00:00.000Z');
    expect(presented.attachment).toEqual({
      type: 'image',
      url: `/v1/orders/${presented.orderId}/messages/${presented.id}/image`,
      mimeType: 'image/png',
      sizeBytes: 68,
      width: 1,
      height: 1,
      fileName: 'pickup.png',
    });
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

  it('accepts real image bytes, rejects disguised files and describes photo-only pushes', () => {
    expect(MAX_RIDE_CHAT_IMAGE_BYTES).toBe(5_000_000);
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    expect(decodeRideChatImage(pngBase64, 'image/png').subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );

    try {
      decodeRideChatImage(Buffer.from('not an image').toString('base64'), 'image/png');
      throw new Error('Expected disguised file to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400, code: 'RIDE_CHAT_IMAGE_INVALID' });
    }

    const jpegAtLimit = Buffer.alloc(MAX_RIDE_CHAT_IMAGE_BYTES);
    jpegAtLimit[0] = 0xff;
    jpegAtLimit[1] = 0xd8;
    expect(decodeRideChatImage(jpegAtLimit.toString('base64'), 'image/jpeg')).toHaveLength(
      MAX_RIDE_CHAT_IMAGE_BYTES,
    );

    const oversizedJpeg = Buffer.alloc(MAX_RIDE_CHAT_IMAGE_BYTES + 1);
    oversizedJpeg[0] = 0xff;
    oversizedJpeg[1] = 0xd8;
    try {
      decodeRideChatImage(oversizedJpeg.toString('base64'), 'image/jpeg');
      throw new Error('Expected oversized image to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 413, code: 'RIDE_CHAT_IMAGE_TOO_LARGE' });
    }

    expect(rideChatPush({
      ...message('photo', '2026-08-30T12:00:00.000Z', ''),
      attachment: {
        type: 'image',
        url: '/protected/photo',
        mimeType: 'image/png',
        sizeBytes: 68,
      },
    }, 'driver').body).toBe('Фотография');
  });
});
