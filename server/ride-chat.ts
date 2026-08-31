import type { RowDataPacket } from 'mysql2/promise';

import type {
  RideChatImageMimeType,
  RideChatMessage,
  RideChatRole,
} from '../src/domain/models';
import type { PersonalMessengerNotification } from './messenger-notifications';
import type { PushMessage } from './push';
import { RIDE_CHAT_IMAGE_MAX_BYTES } from '../src/domain/ride-chat';

export const MAX_RIDE_CHAT_IMAGE_BYTES = RIDE_CHAT_IMAGE_MAX_BYTES;
export const RIDE_CHAT_UPLOAD_BODY_MAX_BYTES = 8 * 1024 * 1024;

export type RideChatMessageRow = RowDataPacket & {
  id: string;
  order_id: string;
  sender_user_id: string;
  body: string;
  created_at: Date | string;
  sender_name: string;
  sender_role: RideChatRole;
  avatar_url: string | null;
  avatar_mime: string | null;
  sender_updated_at: Date | string;
  attachment_mime: RideChatImageMimeType | null;
  attachment_size_bytes: number | null;
  attachment_width: number | null;
  attachment_height: number | null;
  attachment_file_name: string | null;
  attachment_sha256: string | null;
};

export const rideChatMessageSelect = `
  SELECT message.id, message.order_id, message.sender_user_id, message.body,
    message.attachment_mime, message.attachment_size_bytes,
    message.attachment_width, message.attachment_height,
    message.attachment_file_name, message.attachment_sha256,
    message.created_at, sender.name AS sender_name,
    CASE
      WHEN message.sender_user_id = orders.passenger_id THEN 'passenger'
      ELSE 'driver'
    END AS sender_role,
    sender.avatar_url, sender.avatar_mime,
    sender.updated_at AS sender_updated_at
  FROM ride_chat_messages message
  JOIN orders ON orders.id = message.order_id
  JOIN users sender ON sender.id = message.sender_user_id
`;

export function rideChatAvatarUrl(
  userId: string,
  avatarUrl: string | null,
  avatarMime: string | null,
  updatedAt: Date | string,
): string | undefined {
  if (avatarMime) {
    return `/v1/users/${userId}/avatar?v=${new Date(updatedAt).getTime()}`;
  }
  return avatarUrl ?? undefined;
}

export function presentRideChatMessage(row: RideChatMessageRow): RideChatMessage {
  return {
    id: row.id,
    orderId: row.order_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    sender: {
      id: row.sender_user_id,
      name: row.sender_name,
      role: row.sender_role,
      avatarUrl: rideChatAvatarUrl(
        row.sender_user_id,
        row.avatar_url,
        row.avatar_mime,
        row.sender_updated_at,
      ),
    },
    ...(row.attachment_mime && row.attachment_size_bytes
      ? {
          attachment: {
            type: 'image' as const,
            url: `/v1/orders/${row.order_id}/messages/${row.id}/image`,
            mimeType: row.attachment_mime,
            sizeBytes: Number(row.attachment_size_bytes),
            ...(row.attachment_width ? { width: Number(row.attachment_width) } : {}),
            ...(row.attachment_height ? { height: Number(row.attachment_height) } : {}),
            ...(row.attachment_file_name ? { fileName: row.attachment_file_name } : {}),
          },
        }
      : {}),
  };
}

export function decodeRideChatImage(
  base64: string,
  mimeType: RideChatImageMimeType,
): Buffer {
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const bytes = Buffer.from(payload, 'base64');
  if (!bytes.length || bytes.length > MAX_RIDE_CHAT_IMAGE_BYTES) {
    throw Object.assign(new Error('Фотография должна быть не больше 5 МБ'), {
      statusCode: 413,
      code: 'RIDE_CHAT_IMAGE_TOO_LARGE',
    });
  }
  const validMagic =
    (mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (mimeType === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mimeType === 'image/webp' &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!validMagic) {
    throw Object.assign(new Error('Выбранный файл не похож на фотографию'), {
      statusCode: 400,
      code: 'RIDE_CHAT_IMAGE_INVALID',
    });
  }
  return bytes;
}

export function rideChatPush(
  message: RideChatMessage,
  recipientRole: RideChatRole,
): PushMessage {
  return {
    title: `Сообщение от ${message.sender.name}`,
    body: message.body || (message.attachment ? 'Фотография' : 'Новое сообщение'),
    data: {
      orderId: message.orderId,
      role: recipientRole,
      chat: 'true',
    },
    sound: 'taxi_found.wav',
    channelId: 'ride-chat-v1',
  };
}

export function rideChatMessengerNotification(
  message: RideChatMessage,
  chatUrl: string,
): PersonalMessengerNotification {
  return {
    icon: '💬',
    title: `Сообщение от ${message.sender.name}`,
    body: message.body || (message.attachment ? 'Фотография' : 'Новое сообщение'),
    action: {
      label: 'Открыть чат',
      url: chatUrl,
    },
  };
}
