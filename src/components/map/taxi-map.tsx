import { Camera, GeoJSONSource, Images, Layer, Map as MapLibreMap, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { memo, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useNetInfo } from '@react-native-community/netinfo';

import { grahovoCenter } from '@/data/service-area';
import { useForegroundScreen } from '@/hooks/use-foreground-screen';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { motion } from '@/theme/tokens';
import { driverMarkerKey } from './driver-marker';
import { driverMarkerAssets } from './driver-marker-assets';
import { MapLoadingOverlay } from './map-loading-overlay';
import { PickupRadar } from './pickup-radar';
import { RoutePointCallout } from './route-point-callout';
import { configureNativeMapCache } from './map-cache.native';
import { lngLat, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_SELECTION_ZOOM, mapBearing, ROUTE_PIN_SIZE, taxiMapFit, taxiMapPadding, validMapCoordinate } from './map-scene';
import { taxiMapStyle } from './map-style';
import type { TaxiMapProps } from './types';
import { useMapScene } from './use-map-scene';

const ActiveTaxiMap = memo(function ActiveTaxiMap(props: TaxiMapProps & { retry: () => void }) {
  'use no memo';
  const colors = useThemeColors();
  const { colorScheme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const camera = useRef<CameraRef>(null);
  const movingSelection = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [following, setFollowing] = useState(true);
  const [offlineFallback, setOfflineFallback] = useState(false);
  const { isConnected } = useNetInfo();
  const offline = isConnected === false || offlineFallback;
  const readyRef = useRef(false);
  const followTarget = useRef('');
  const scene = useMapScene(props);
  const fitted = useRef<{ layout: string; coordinates: typeof scene.fitCoordinates; target: string } | null>(null);
  const style = useMemo(() => JSON.stringify(taxiMapStyle(colors, colorScheme, offline)), [colors, colorScheme, offline]);
  // Adding the first selection pin must not change padding and reset a panned camera.
  const hasCallouts = !props.selectionCenter && scene.points.length > 0;
  const padding = useMemo(() => taxiMapPadding(size.width, size.height, props.viewportInsets, hasCallouts),
    [size, props.viewportInsets, hasCallouts]);
  const onReady = useEffectEvent(() => props.onMapReady?.());
  const onError = useEffectEvent((message: string) => props.onMapError?.(message));
  const [initialView] = useState(() => ({
    center: lngLat(validMapCoordinate(props.selectionCenter) ? props.selectionCenter : grahovoCenter),
    zoom: props.selectionCenter ? MAP_SELECTION_ZOOM : MAP_DEFAULT_ZOOM,
    pitch: 0,
  }));

  useEffect(() => {
    // Configure asynchronously once per process; never clear or await the tile
    // cache before showing a map, including after signing out or switching roles.
    void configureNativeMapCache();
  }, []);

  useEffect(() => {
    if (ready) return;
    const slowTimer = setTimeout(() => {
      if (!offline) setOfflineFallback(true);
      else setSlow(true);
    }, 8_000);
    const timeout = setTimeout(() => {
      const message = 'Карта не загрузилась. Проверьте соединение и нажмите «Повторить».';
      setError(message); onError(message);
    }, 30_000);
    return () => { clearTimeout(slowTimer); clearTimeout(timeout); };
  }, [ready, offline]);

  useEffect(() => { followTarget.current = ''; setFollowing(true); }, [props.followDriver, props.followRequestId]);

  const selectionLatitude = props.selectionCenter?.latitude, selectionLongitude = props.selectionCenter?.longitude;
  useEffect(() => {
    if (!initialized || selectionLatitude == null || selectionLongitude == null) return;
    followTarget.current = '';
    fitted.current = null;
    const point = { latitude: selectionLatitude, longitude: selectionLongitude };
    if (validMapCoordinate(point)) camera.current?.jumpTo({ center: lngLat(point), zoom: MAP_SELECTION_ZOOM, pitch: 0, bearing: 0, padding });
  }, [initialized, selectionLatitude, selectionLongitude, padding]);

  useEffect(() => {
    if (!initialized || !size.width || !size.height || props.selectionCenter) return;
    if (props.followDriver && following && validMapCoordinate(props.driver)) {
      const target = JSON.stringify([props.driver.latitude, props.driver.longitude, props.navigationMode ? mapBearing(props.driverHeading) : 0,
        props.followZoom, props.navigationMode, padding, props.followRequestId]);
      if (followTarget.current === target) return;
      followTarget.current = target;
      camera.current?.easeTo({ center: lngLat(props.driver),
        zoom: props.followZoom ?? (props.navigationMode ? 16.5 : 15),
        pitch: props.navigationMode ? 40 : 25,
        bearing: props.navigationMode ? mapBearing(props.driverHeading) : 0,
        padding, duration: reducedMotion ? 0 : motion.duration.tracking, easing: 'linear' });
      fitted.current = null;
      return;
    }
    if (props.followDriver) return;
    const layout = JSON.stringify([size, padding, props.followRequestId]);
    const previous = fitted.current;
    if (previous?.layout === layout && previous.coordinates === scene.fitCoordinates) return;
    const location = taxiMapFit(scene.fitCoordinates, size.width, size.height, padding);
    if (location) {
      const target = JSON.stringify(location);
      fitted.current = { layout, coordinates: scene.fitCoordinates, target };
      if (previous?.layout === layout && previous.target === target) return;
      camera.current?.easeTo({ ...location, padding, pitch: 0, bearing: 0, duration: reducedMotion ? 0 : motion.duration.tracking });
    }
  }, [initialized, size, props.selectionCenter, props.followDriver, props.followRequestId, props.driver, props.driverHeading,
    props.followZoom, props.navigationMode, following, scene.fitCoordinates, padding, reducedMotion]);

  const driverData = useMemo(() => ({ type: 'FeatureCollection' as const, features: validMapCoordinate(props.driver) ? [{
    type: 'Feature' as const, properties: { heading: mapBearing(props.driverHeading), image: driverMarkerKey(props.driverColorHex) },
    geometry: { type: 'Point' as const, coordinates: lngLat(props.driver) },
  }] : [] }), [props.driver, props.driverHeading, props.driverColorHex]);
  const passengerData = useMemo(() => ({ type: 'FeatureCollection' as const, features: validMapCoordinate(props.passenger) ? [{
    type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: lngLat(props.passenger) },
  }] : [] }), [props.passenger]);

  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.mapFallback }}
    onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize(current => current.width === width && current.height === height ? current : { width, height }); }}>
    <MapLibreMap mapStyle={style} style={{ flex: 1 }} attribution={false} logo={false} compass={false} dragPan touchZoom
      onDidFinishLoadingStyle={() => setInitialized(true)}
      onDidFinishRenderingMapFully={() => {
        setError(null);
        if (readyRef.current) return;
        readyRef.current = true; setReady(true); onReady();
      }}
      onDidFailLoadingMap={() => {
        if (!offline) { setOfflineFallback(true); return; }
        const message = 'Не удалось загрузить карту. Проверьте соединение и повторите.';
        setError(message); onError(message);
      }}
      onRegionWillChange={event => {
        if (event.nativeEvent.userInteraction) {
          setFollowing(false);
          movingSelection.current = !!props.selectionCenter;
          props.onSelectionInteraction?.();
        }
      }}
      onRegionDidChange={event => {
        if (!movingSelection.current || !props.selectionCenter) return;
        movingSelection.current = false;
        const [longitude, latitude] = event.nativeEvent.center;
        if (validMapCoordinate({ latitude, longitude })) props.onCoordinateSelect?.({ latitude, longitude });
      }}
      onPress={event => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        if (props.selectionCenter && validMapCoordinate({ latitude, longitude })) {
          props.onSelectionInteraction?.();
          camera.current?.jumpTo({ center: [longitude, latitude] });
          props.onCoordinateSelect?.({ latitude, longitude });
        }
      }}>
      <Camera ref={camera} initialViewState={initialView} minZoom={MAP_MIN_ZOOM} maxZoom={MAP_MAX_ZOOM} />
      <GeoJSONSource id="taxi-route" data={scene.route} tolerance={0}>
        <Layer id="taxi-route-outline" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.surface, 'line-width': 7 }} />
        <Layer id="taxi-route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.route, 'line-width': 4 }} />
      </GeoJSONSource>
      <GeoJSONSource id="taxi-passenger" data={passengerData}>
        <Layer id="taxi-passenger-dot" type="circle" paint={{ 'circle-radius': 8, 'circle-color': colors.info,
          'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' }} />
      </GeoJSONSource>
      <Images images={driverMarkerAssets} />
      <GeoJSONSource id="taxi-driver" data={driverData}>
        <Layer id="taxi-driver-icon" type="symbol" layout={{ 'icon-image': ['get', 'image'], 'icon-size': 1 / 3,
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'viewport' }} />
      </GeoJSONSource>
      {props.searching && scene.points.filter(point => point.kind === 'pickup').map(point => (
        <Marker key={`radar-${point.id}`} id={`radar-${point.id}`} lngLat={point.coordinates} anchor="center">
          <PickupRadar />
        </Marker>
      ))}
      {scene.points.map(point => <Marker key={point.id} id={point.id} lngLat={point.coordinates} anchor="bottom" offset={[0, ROUTE_PIN_SIZE / 2]}
        onPress={props.onRoutePointEdit ? () => props.onRoutePointEdit?.(point.destinationIndex) : undefined}>
        <View collapsable={false} pointerEvents="none"
          style={{ alignItems: 'center' }} accessibilityRole={props.onRoutePointEdit ? 'button' : 'image'}
          accessibilityLabel={props.onRoutePointEdit ? `Изменить точку ${point.badge} · ${point.label}` : point.label}>
          <RoutePointCallout badge={point.badge} title={point.label} pickup={point.kind === 'pickup'} editable={!!props.onRoutePointEdit} />
        </View>
      </Marker>)}
    </MapLibreMap>
    {offline && ready && <Text style={{ position: 'absolute', left: 8, top: (props.viewportInsets?.top ?? 0) + 8,
      fontSize: 11, color: colors.inkSecondary, backgroundColor: colors.surface, padding: 4 }}>Карта района офлайн</Text>}
    {(!ready || error) && <MapLoadingOverlay error={error} slow={slow} mapVisible={initialized} onRetry={props.retry} insets={props.viewportInsets} />}
  </View>;
});

export const TaxiMap = memo(function TaxiMap(props: TaxiMapProps) {
  const [attempt, setAttempt] = useState(0);
  const visible = useForegroundScreen();
  if (!visible) return <View style={{ flex: 1, minHeight: 0 }} />;
  return <ActiveTaxiMap key={attempt} {...props} retry={() => setAttempt(value => value + 1)} />;
});
