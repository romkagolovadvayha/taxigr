import type { Address, RideOrder } from '@/domain/models';

type DestinationHistoryOrder = Pick<
  RideOrder,
  'passengerId' | 'status' | 'destination' | 'updatedAt'
>;

export type DestinationHistoryItem = {
  address: Address;
  tripCount: number;
  lastUsedAt: string;
  isLastDestination: boolean;
};

type DestinationHistory = {
  items: DestinationHistoryItem[];
  lastDestination: Address | null;
};

function destinationKey(address: Address): string {
  return [
    address.coordinates.latitude.toFixed(5),
    address.coordinates.longitude.toFixed(5),
  ].join(':');
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildDestinationHistory(
  orders: DestinationHistoryOrder[],
  passengerId: string | undefined,
): DestinationHistory {
  if (!passengerId) return { items: [], lastDestination: null };
  const completed = orders
    .filter((order) => order.passengerId === passengerId && order.status === 'completed')
    .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt));
  const lastOrder = completed[0];
  const lastKey = lastOrder ? destinationKey(lastOrder.destination) : null;
  const grouped = new Map<string, Omit<DestinationHistoryItem, 'isLastDestination'>>();

  for (const order of completed) {
    const key = destinationKey(order.destination);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        address: order.destination,
        tripCount: 1,
        lastUsedAt: order.updatedAt,
      });
      continue;
    }
    existing.tripCount += 1;
    if (timestamp(order.updatedAt) > timestamp(existing.lastUsedAt)) {
      existing.lastUsedAt = order.updatedAt;
      existing.address = order.destination;
    }
  }

  const items = [...grouped.entries()]
    .map(([key, item]) => ({
      ...item,
      isLastDestination: key === lastKey,
    }))
    .sort(
      (left, right) =>
        right.tripCount - left.tripCount ||
        timestamp(right.lastUsedAt) - timestamp(left.lastUsedAt),
    );

  return {
    items,
    lastDestination: lastOrder?.destination ?? null,
  };
}
