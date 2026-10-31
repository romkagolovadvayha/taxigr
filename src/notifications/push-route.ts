export function pushRoute(data?: Record<string, unknown>): string {
  const orderId = typeof data?.orderId === 'string' && data.orderId
    ? encodeURIComponent(data.orderId)
    : null;
  if (orderId && data?.chat === 'true') return `/chat/${orderId}`;
  // An offer is not assigned yet: drivers cannot open its private trip details.
  // The workspace shows available offers as well as their current assigned trip.
  if (data?.role === 'driver') return '/driver';
  return orderId ? `/orders/${orderId}` : '/';
}
