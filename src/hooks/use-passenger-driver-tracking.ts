import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { getDemoRoadRoute } from '@/api/demo-routing';
import { getDemoDriverSnapshot, getDemoPassengerProgression } from '@/domain/demo-flow';
import type { Coordinates, RideOrder } from '@/domain/models';
import { useForegroundScreen } from './use-foreground-screen';
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
  const latitude = rawCoordinates?.latitude;
  const longitude = rawCoordinates?.longitude;
  const rideId = ride?.id;
  const demoRide = demo ? ride : null;
  const active = useForegroundScreen();
  const currentRef = useRef<RoutePosition | null>(null);
  const trackedRideId = useRef(rideId);
  const [rendered, setRendered] = useState<{
    rideId: string;
    position: RoutePosition;
  } | null>(null);

  useEffect(() => {
    if (!active) return;
    if (trackedRideId.current !== rideId) {
      trackedRideId.current = rideId;
      currentRef.current = null;
    }
    if (!rideId || latitude == null || longitude == null) {
      currentRef.current = null;
      return;
    }
    const rawCoordinates = { latitude, longitude };
    const commit = (position: RoutePosition) => {
      currentRef.current = position;
      setRendered(current => current?.rideId === rideId &&
        current.position.coordinates.latitude === position.coordinates.latitude &&
        current.position.coordinates.longitude === position.coordinates.longitude &&
        current.position.heading === position.heading ? current : { rideId, position });
    };

    if (demoRide) {
      const ride = demoRide;
      const controller = new AbortController();
      let approachRoute: Coordinates[] = [];
      const statusDuration = getDemoPassengerProgression(ride.status)?.delay ?? 0;
      const statusStartedAt = Date.parse(ride.updatedAt);
      const update = () => {
        const progress =
          statusDuration > 0 && Number.isFinite(statusStartedAt)
            ? Math.max(0, Math.min(1, (Date.now() - statusStartedAt) / statusDuration))
            : 1;
        const next = getDemoDriverSnapshot(ride, progress, approachRoute);
        commit(next);
      };
      const startTimer = setTimeout(update, 0);
      if (['accepted', 'driver_arriving'].includes(ride.status)) {
        void getDemoRoadRoute(rawCoordinates, [ride.pickup.coordinates], controller.signal)
          .then((route) => {
            if (controller.signal.aborted) return;
            approachRoute = route.coordinates;
            update();
          })
          .catch(() => {
            // Keep the last position while roads are unavailable; never animate
            // the car through buildings between the driver and the pickup.
          });
      }
      if (!['driver_arriving', 'in_progress'].includes(ride.status)) {
        return () => {
          controller.abort();
          clearTimeout(startTimer);
        };
      }
      const timer = setInterval(update, FRAME_INTERVAL_MS);
      return () => {
        controller.abort();
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
        commit(position);
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
      commit(rendered);
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
      commit(rendered);
    }, LIVE_ANIMATION_MS + FRAME_INTERVAL_MS);
    return () => {
      clearTimeout(startTimer);
      clearInterval(timer);
      clearTimeout(stopTimer);
    };
  }, [active, demoRide, latitude, longitude, rideId]);

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
