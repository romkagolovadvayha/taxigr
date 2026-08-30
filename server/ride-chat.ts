import type { RowDataPacket } from 'mysql2/promise';

import type {
  RideChatMessage,
  RideChatRole,
} from '../src/domain/models';
import type { PushMessage } from './push';

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
};

export const rideChatMessageSelect = `
  SELECT message.id, message.order_id, message.sender_user_id, message.body,
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
  };
}

export function rideChatPush(
  message: RideChatMessage,
  recipientRole: RideChatRole,
): PushMessage {
  return {
    title: `Сообщение от ${message.sender.name}`,
    body: message.body,
    data: {
      orderId: message.orderId,
      role: recipientRole,
      chat: 'true',
    },
    sound: 'taxi_found.wav',
    channelId: 'ride-chat-v1',
  };
}
