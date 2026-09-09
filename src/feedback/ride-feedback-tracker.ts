import type { RideOrder } from '@/domain/models';
import { feedbackForRideChange } from './ride-feedback';

export function createRideFeedbackTracker() {
  const rides = new Map<string, RideOrder>();
  let revision = 0;
  const remember = (ride: RideOrder) => {
    if (!rides.has(ride.id) && rides.size >= 128) rides.delete(rides.keys().next().value!);
    rides.set(ride.id, ride);
  };
  return {
    seed(orders: (RideOrder | null)[]) { orders.forEach(ride => { if (ride) remember(ride); }); },
    observe(ride: RideOrder, userId: string, isDriver: boolean) {
      const previous = rides.get(ride.id) ?? null;
      if (previous && ride.updatedAt < previous.updatedAt) return null;
      const feedback = feedbackForRideChange(previous, ride, userId, isDriver);
      remember(ride);
      return feedback ? { key: `ride:${ride.id}:${++revision}`, group: ride.id, feedback } : null;
    },
  };
}
