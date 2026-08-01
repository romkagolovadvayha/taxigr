import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { getDemoDriverSnapshot, getDemoPassengerProgression } from '@/domain/demo-flow';
import type { Coordinates, RideOrder } from '@/domain/models';
import {
  headingBetweenCoordinates,
  routePositionAtProgress,
  type RoutePosition,
} from '@/domain/route-tracking';

const FRAME_INTERVAL_MS = 250;
const LIVE_ANIMATION_MS = 800;

const emptyPosition: RoutePosition = {
  coordinates: { latitude: 0, longitude: 0 },
  heading: null,
};

export function usePassengerDriverTracking(
  ride: RideOrder | null,
  demo: boolean,
): { coordinates: Coordinates | null; heading: number | null } {
  const rawCoordinates = ride?.driver?.coordinates ?? null;
  const currentRef = useRef<RoutePosition | null>(null);
  const [rendered, setRendered] = useState<{
    rideId: string;
    position: RoutePosition;
  } | null>(null);

  useEffect(() => {
    if (!ride?.driver || !rawCoordinates) {
      currentRef.current = null;
      return;
    }

    if (demo) {
      const statusDuration = getDemoPassengerProgression(ride.status)?.delay ?? 0;
      const statusStartedAt = Date.parse(ride.updatedAt);
      const update = () => {
        const progress =
          statusDuration > 0 && Number.isFinite(statusStartedAt)
            ? Math.max(0, Math.min(1, (Date.now() - statusStartedAt) / statusDuration))
            : 1;
        const next = getDemoDriverSnapshot(ride, progress);
        currentRef.current = next;
        setRendered({ rideId: ride.id, position: next });
      };
      const startTimer = setTimeout(update, 0);
      if (!['driver_arriving', 'in_progress'].includes(ride.status)) {
        return () => clearTimeout(startTimer);
      }
      const timer = setInterval(update, FRAME_INTERVAL_MS);
      return () => {
        clearTimeout(startTimer);
        clearInterval(timer);
      };
    }

    if (Platform.OS === 'web') {
      const origin = currentRef.current?.coordinates ?? rawCoordinates;
      const position = {
        coordinates: rawCoordinates,
        heading:
          headingBetweenCoordinates(origin, rawCoordinates) ??
          currentRef.current?.heading ??
          null,
      };
      currentRef.current = position;
      const timer = setTimeout(() => {
        setRendered({ rideId: ride.id, position });
      }, 0);
      return () => clearTimeout(timer);
    }

    const origin = currentRef.current?.coordinates ?? rawCoordinates;
    const heading =
      headingBetweenCoordinates(origin, rawCoordinates) ??
      currentRef.current?.heading ??
      null;
    const startedAt = Date.now();
    const update = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / LIVE_ANIMATION_MS);
      const next =
        routePositionAtProgress([origin, rawCoordinates], progress) ?? emptyPosition;
      const rendered = { coordinates: next.coordinates, heading };
      currentRef.current = rendered;
      setRendered({ rideId: ride.id, position: rendered });
    };
    const startTimer = setTimeout(update, 0);
    if (
      origin.latitude === rawCoordinates.latitude &&
      origin.longitude === rawCoordinates.longitude
    ) {
      return () => clearTimeout(startTimer);
    }
    const timer = setInterval(update, FRAME_INTERVAL_MS);
    const stopTimer = setTimeout(() => {
      clearInterval(timer);
      const rendered = { coordinates: rawCoordinates, heading };
      currentRef.current = rendered;
      setRendered({ rideId: ride.id, position: rendered });
    }, LIVE_ANIMATION_MS + FRAME_INTERVAL_MS);
    return () => {
      clearTimeout(startTimer);
      clearInterval(timer);
      clearTimeout(stopTimer);
    };
  }, [demo, rawCoordinates, ride]);

  return {
    coordinates:
      rawCoordinates && rendered && rendered.rideId === ride?.id
        ? rendered.position.coordinates
        : rawCoordinates,
    heading:
      rawCoordinates && rendered && rendered.rideId === ride?.id
        ? rendered.position.heading
        : null,
  };
}
