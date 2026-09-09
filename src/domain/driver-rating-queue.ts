import type { RideOrder } from './models';

export type DriverRatingQueue = {
  pending: RideOrder[];
  handledIds: string[];
};

type Action = { type: 'updated'; ride: RideOrder } | { type: 'dismiss'; orderId: string };

export const emptyDriverRatingQueue: DriverRatingQueue = { pending: [], handledIds: [] };

// Completed rides live independently of the active order and its replacement from bootstrap.
export function driverRatingQueueReducer(state: DriverRatingQueue, action: Action): DriverRatingQueue {
  if (action.type === 'dismiss') {
    return {
      pending: state.pending.filter((ride) => ride.id !== action.orderId),
      handledIds: state.handledIds.includes(action.orderId)
        ? state.handledIds
        : [...state.handledIds, action.orderId],
    };
  }

  const { ride } = action;
  if (ride.status !== 'completed' || !ride.driverId || state.handledIds.includes(ride.id)) return state;
  const existing = state.pending.find((item) => item.id === ride.id);
  if (!existing && ride.ratings?.byDriver) {
    return { ...state, handledIds: [...state.handledIds, ride.id] };
  }
  // A delayed socket event must not remove an already submitted score.
  if (existing?.ratings?.byDriver && !ride.ratings?.byDriver) return state;
  return {
    ...state,
    pending: existing
      ? state.pending.map((item) => item.id === ride.id ? ride : item)
      : [...state.pending, ride],
  };
}
