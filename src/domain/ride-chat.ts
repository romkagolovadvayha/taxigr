import type { RideChatMessage, RideStatus } from '@/domain/models';

export const RIDE_CHAT_IMAGE_MAX_BYTES = 5_000_000;

const writableStatuses = new Set<RideStatus>([
  'accepted',
  'driver_arriving',
  'driver_waiting',
  'in_progress',
]);

export function canSendRideChatMessage(status: RideStatus): boolean {
  return writableStatuses.has(status);
}

export function upsertRideChatMessage(
  messages: RideChatMessage[],
  incoming: RideChatMessage,
): RideChatMessage[] {
  const existingIndex = messages.findIndex((message) => message.id === incoming.id);
  const next = existingIndex >= 0
    ? messages.map((message, index) => (index === existingIndex ? incoming : message))
    : [...messages, incoming];

  return next.sort((left, right) => {
    const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return timeDifference || left.id.localeCompare(right.id);
  });
}

export function formatRideChatTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
