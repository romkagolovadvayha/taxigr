import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { MapViewportInsets, TaxiMapProps } from '@/components/map/types';
import {
  DRIVER_MARKER_HEIGHT,
  DRIVER_MARKER_WIDTH,
  driverMarkerSvgMarkup,
} from '@/components/map/driver-marker';
import { smoothRouteCoordinates } from '@/components/map/route-geometry';
import { remainingRouteCoordinates } from '@/domain/route-tracking';
import {
  fitRouteLocation,
  routePointSizeForZoom,
} from '@/components/map/route-viewport';
import { loadYandexMap, type YandexMap } from '@/components/map/yandex-map-loader';
import { grahovoCenter } from '@/data/demo';
import { useAppTheme } from '@/theme/theme-provider';
import { colors, spacing, typography } from '@/theme/tokens';

type YandexEntity = unknown;
type MapMargin = [number, number, number, number];

const ROUTE_PADDING = 18;

function mapMargin(insets?: MapViewportInsets, hasPreviewCallouts = false): MapMargin {
  const horizontalPadding = hasPreviewCallouts ? 86 : ROUTE_PADDING;
  return [
    Math.max(0, insets?.top ?? 0) + ROUTE_PADDING,
    Math.max(0, insets?.right ?? 0) + horizontalPadding,
    Math.max(0, insets?.bottom ?? 0) + ROUTE_PADDING,
    Math.max(0, insets?.left ?? 0) + horizontalPadding,
  ];
}

function setRoutePointZoom(element: HTMLDivElement, zoom: number): void {
  const size = routePointSizeForZoom(zoom);
  const dot = element.querySelector<HTMLDivElement>('[data-route-dot]');
  const callout = element.querySelector<HTMLDivElement>('[data-route-callout]');
  if (dot) {
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
  }
  if (callout) callout.style.bottom = `${Math.round(size / 2) + 8}px`;
}

function routePointElement(
  kind: 'pickup' | 'destination',
  calloutLabel: string | undefined,
  zoom: number,
): HTMLDivElement {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', kind === 'pickup' ? 'Место подачи' : 'Место назначения');
  element.style.position = 'relative';
  element.style.width = '1px';
  element.style.height = '1px';
  element.style.pointerEvents = 'none';

  const dot = document.createElement('div');
  dot.dataset.routeDot = 'true';
  dot.style.position = 'absolute';
  dot.style.left = '0';
  dot.style.top = '0';
  dot.style.borderRadius = '999px';
  dot.style.background = colors.brandInk;
  dot.style.border = '2px solid white';
  dot.style.boxSizing = 'border-box';
  dot.style.boxShadow = '0 1px 5px rgba(0,0,0,.24)';
  dot.style.transform = 'translate(-50%, -50%)';
  dot.style.transition = 'width 140ms ease, height 140ms ease';
  element.appendChild(dot);

  if (calloutLabel) {
    const background = kind === 'pickup' ? colors.brand : colors.surface;
    const callout = document.createElement('div');
    callout.dataset.routeCallout = 'true';
    callout.textContent = calloutLabel;
    callout.style.position = 'absolute';
    callout.style.left = '0';
    callout.style.transform = 'translateX(-50%)';
    callout.style.whiteSpace = 'nowrap';
    callout.style.padding = '5px 11px';
    callout.style.borderRadius = '12px';
    callout.style.background = background;
    callout.style.color = colors.brandInk;
    callout.style.boxShadow = '0 2px 10px rgba(0,0,0,.16)';
    callout.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    callout.style.fontSize = '15px';
    callout.style.fontWeight = '650';
    callout.style.lineHeight = '20px';
    callout.style.letterSpacing = '-0.15px';
    callout.style.zIndex = '2';

    const pointer = document.createElement('div');
    pointer.style.position = 'absolute';
    pointer.style.left = '50%';
    pointer.style.bottom = '-5px';
    pointer.style.transform = 'translateX(-50%)';
    pointer.style.width = '0';
    pointer.style.height = '0';
    pointer.style.borderLeft = '5px solid transparent';
    pointer.style.borderRight = '5px solid transparent';
    pointer.style.borderTop = `6px solid ${background}`;
    callout.appendChild(pointer);
    element.appendChild(callout);
  }

  setRoutePointZoom(element, zoom);
  return element;
}

function markerElement(
  kind: 'driver' | 'passenger',
  heading?: number | null,
  navigationMode = false,
): HTMLDivElement {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', kind === 'passenger' ? 'Пассажир' : 'Водитель');
  element.style.width = kind === 'driver' ? `${DRIVER_MARKER_WIDTH}px` : '22px';
  element.style.height = kind === 'driver' ? `${DRIVER_MARKER_HEIGHT}px` : '22px';
  element.style.boxSizing = 'border-box';
  element.style.transform = 'translate(-50%, -50%)';
  if (kind === 'driver') {
    element.style.background = 'transparent';
    element.style.border = '0';
    element.style.boxShadow = 'none';
    element.innerHTML = driverMarkerSvgMarkup(colors.brand, colors.brandInk);
    const rotation = navigationMode ? 0 : (heading ?? 0);
    element.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    element.style.transition = 'transform 280ms linear';
  } else {
    element.style.borderRadius = '999px';
    element.style.background = colors.info;
    element.style.border = '4px solid white';
    element.style.boxShadow = '0 3px 12px rgba(0,0,0,.25)';
  }
  return element;
}

export function TaxiMap({
  pickup,
  destination,
  routeCoordinates,
  pickupEtaMinutes,
  destinationArrivalLabel,
  driver,
  driverHeading,
  passenger,
  followDriver = false,
  followZoom,
  trimCompletedRoute = false,
  navigationMode = false,
  routeTarget,
  viewportInsets,
  onMapReady,
  onMapError,
}: TaxiMapProps) {
  const { colorScheme } = useAppTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YandexMap | null>(null);
  const entitiesRef = useRef<YandexEntity[]>([]);
  const apiRef = useRef<Awaited<ReturnType<typeof loadYandexMap>> | null>(null);
  const routePointElementsRef = useRef<HTMLDivElement[]>([]);
  const zoomRef = useRef(14);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    let active = true;

    void loadYandexMap()
      .then((api) => {
        if (!active || !containerRef.current) return;
        apiRef.current = api;
        mapRef.current = new api.YMap(
          containerRef.current,
          {
            location: {
              center: [grahovoCenter.longitude, grahovoCenter.latitude],
              zoom: 14,
            },
            theme: colorScheme,
            zoomRange: { min: 6, max: 17 },
            showScaleInCopyrights: true,
          },
          [new api.YMapDefaultSchemeLayer({}), new api.YMapDefaultFeaturesLayer({})],
        );
        mapRef.current.addChild(
          new api.YMapListener({
            layer: 'any',
            onUpdate: ({ location }) => {
              zoomRef.current = location.zoom;
              routePointElementsRef.current.forEach((element) =>
                setRoutePointZoom(element, location.zoom),
              );
            },
          }),
        );
        setMapReady(true);
        onMapReady?.();
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : 'Карта недоступна';
        setError(message);
        onMapError?.(message);
      });

    return () => {
      active = false;
      mapRef.current?.destroy();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [colorScheme, onMapError, onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const api = apiRef.current;
    if (!map || !api) return;

    entitiesRef.current.forEach((entity) => map.removeChild(entity));
    entitiesRef.current = [];
    routePointElementsRef.current = [];

    const add = (entity: YandexEntity) => {
      map.addChild(entity);
      entitiesRef.current.push(entity);
    };
    const margin = mapMargin(
      viewportInsets,
      Boolean(pickupEtaMinutes || destinationArrivalLabel),
    );
    map.update({ margin });
    const renderedRouteCoordinates = smoothRouteCoordinates(
      trimCompletedRoute
        ? remainingRouteCoordinates(routeCoordinates, driver)
        : routeCoordinates,
    );
    const pickupMarkerCoordinates =
      (routeTarget === 'pickup'
        ? renderedRouteCoordinates.at(-1)
        : renderedRouteCoordinates[0]) ?? pickup?.coordinates;
    const destinationMarkerCoordinates =
      renderedRouteCoordinates.at(-1) ?? destination?.coordinates;

    if (pickup && pickupMarkerCoordinates) {
      const pickupElement = routePointElement(
        'pickup',
        pickupEtaMinutes ? `${pickupEtaMinutes} мин` : undefined,
        zoomRef.current,
      );
      routePointElementsRef.current.push(pickupElement);
      add(
        new api.YMapMarker(
          {
            coordinates: [
              pickupMarkerCoordinates.longitude,
              pickupMarkerCoordinates.latitude,
            ],
            zIndex: 1100,
          },
          pickupElement,
        ),
      );
    }
    if (destination && destinationMarkerCoordinates) {
      const destinationElement = routePointElement(
        'destination',
        destinationArrivalLabel ?? undefined,
        zoomRef.current,
      );
      routePointElementsRef.current.push(destinationElement);
      add(
        new api.YMapMarker(
          {
            coordinates: [
              destinationMarkerCoordinates.longitude,
              destinationMarkerCoordinates.latitude,
            ],
            zIndex: 1100,
          },
          destinationElement,
        ),
      );
    }
    const visibleCoordinates =
      renderedRouteCoordinates.length >= 2
        ? renderedRouteCoordinates
        : pickup && destination
          ? [pickup.coordinates, destination.coordinates]
          : [];
    if (visibleCoordinates.length >= 2) {
      if (renderedRouteCoordinates.length >= 2) {
        add(
          new api.YMapFeature({
            geometry: {
              type: 'LineString',
              coordinates: renderedRouteCoordinates.map((point) => [
                point.longitude,
                point.latitude,
              ]),
            },
            style: {
              simplificationRate: 0,
              zIndex: 1000,
              stroke: [{ width: 7, color: colors.route }],
            },
          }),
        );
      }
      if (!followDriver) {
        const container = containerRef.current;
        const location = container
          ? fitRouteLocation(
              visibleCoordinates,
              container.clientWidth,
              container.clientHeight,
              margin,
            )
          : null;
        if (location) map.update({ margin, location: { ...location, duration: 500 } });
      }
    }
    if (driver) {
      add(
        new api.YMapMarker(
          { coordinates: [driver.longitude, driver.latitude], zIndex: 1200 },
          markerElement('driver', driverHeading, navigationMode),
        ),
      );
      if (followDriver) {
        map.update({
          margin,
          location: {
            center: [driver.longitude, driver.latitude],
            zoom: followZoom ?? (navigationMode ? 17 : 16),
            duration: 350,
            easing: 'linear',
          },
          camera: navigationMode
            ? {
                tilt: (35 * Math.PI) / 180,
                azimuth: ((driverHeading ?? 0) * Math.PI) / 180,
                duration: 350,
                easing: 'linear',
              }
            : { tilt: 0, azimuth: 0, duration: 350 },
        });
      }
    }
    if (passenger) {
      add(
        new api.YMapMarker(
          { coordinates: [passenger.longitude, passenger.latitude], zIndex: 32 },
          markerElement('passenger'),
        ),
      );
    }
  }, [
    colorScheme,
    destination,
    destinationArrivalLabel,
    driver,
    driverHeading,
    followDriver,
    followZoom,
    mapReady,
    navigationMode,
    passenger,
    pickup,
    pickupEtaMinutes,
    routeCoordinates,
    routeTarget,
    trimCompletedRoute,
    viewportInsets,
  ]);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.x6 }}>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View
      ref={containerRef as never}
      style={{ flex: 1, minHeight: 260, backgroundColor: colors.mapFallback }}
      accessibilityLabel="Карта поездки"
    />
  );
}
