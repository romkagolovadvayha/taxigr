import type { RideChatMessage, RideChatThread, RideStatus } from '@/domain/models';

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

export function mergeRideChatSnapshot(
  snapshot: RideChatThread,
  current: RideChatThread | null,
  received: RideChatMessage[],
  liveStatus?: RideStatus,
): RideChatThread {
  const messages = new Map(snapshot.messages.map((message) => [message.id, message]));
  // HTTP can finish after a newer socket event, including on the first load.
  for (const message of [...(current?.orderId === snapshot.orderId ? current.messages : []), ...received]) {
    if (message.orderId === snapshot.orderId) messages.set(message.id, message);
  }
  const orderStatus = liveStatus ?? snapshot.orderStatus;
  return {
    ...snapshot,
    orderStatus,
    canSend: liveStatus === undefined
      ? snapshot.canSend
      : snapshot.viewerRole !== 'admin' && canSendRideChatMessage(orderStatus),
    messages: [...messages.values()].sort((left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id)),
  };
}

export function formatRideChatTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
