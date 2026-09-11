import { Camera, GeoJSONSource, Images, Layer, Map as MapLibreMap, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useIsFocused } from 'expo-router';
import { memo, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { grahovoCenter } from '@/data/demo';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { motion } from '@/theme/tokens';
import { MapLoadingOverlay } from './map-loading-overlay';
import { lngLat, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM, MAP_SELECTION_ZOOM, mapBearing, taxiMapFit, taxiMapPadding, validMapCoordinate } from './map-scene';
import { taxiMapStyle } from './map-style';
import type { TaxiMapProps } from './types';
import { useMapScene } from './use-map-scene';

const driverImages = { 'taxi-driver': require('../../../assets/vehicles/driver-map-car.png') };

const ActiveTaxiMap = memo(function ActiveTaxiMap(props: TaxiMapProps & { retry: () => void }) {
  'use no memo';
  const colors = useThemeColors();
  const { colorScheme } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const camera = useRef<CameraRef>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [following, setFollowing] = useState(true);
  const readyRef = useRef(false);
  const fitted = useRef('');
  const scene = useMapScene(props);
  const style = useMemo(() => JSON.stringify(taxiMapStyle(colors, colorScheme)), [colors, colorScheme]);
  // Adding the first selection pin must not change padding and reset a panned camera.
  const hasCallouts = !props.selectionCenter && scene.points.length > 0;
  const padding = useMemo(() => taxiMapPadding(size.width, size.height, props.viewportInsets, hasCallouts),
    [size, props.viewportInsets, hasCallouts]);
  const onReady = useEffectEvent(() => props.onMapReady?.());
  const onError = useEffectEvent((message: string) => props.onMapError?.(message));
  const [initialView] = useState(() => ({
    center: lngLat(validMapCoordinate(props.selectionCenter) ? props.selectionCenter : grahovoCenter),
    zoom: props.selectionCenter ? MAP_SELECTION_ZOOM : MAP_DEFAULT_ZOOM,
    pitch: props.selectionCenter ? 0 : 25,
  }));

  useEffect(() => {
    if (ready) return;
    const slowTimer = setTimeout(() => setSlow(true), 8_000);
    const timeout = setTimeout(() => {
      const message = 'Карта не загрузилась. Проверьте соединение и нажмите «Повторить».';
      setError(message); onError(message);
    }, 30_000);
    return () => { clearTimeout(slowTimer); clearTimeout(timeout); };
  }, [ready]);

  useEffect(() => { setFollowing(true); }, [props.followDriver, props.followRequestId]);

  const selectionLatitude = props.selectionCenter?.latitude, selectionLongitude = props.selectionCenter?.longitude;
  useEffect(() => {
    if (!initialized || selectionLatitude == null || selectionLongitude == null) return;
    const point = { latitude: selectionLatitude, longitude: selectionLongitude };
    if (validMapCoordinate(point)) camera.current?.jumpTo({ center: lngLat(point), zoom: MAP_SELECTION_ZOOM, pitch: 0, bearing: 0, padding });
  }, [initialized, selectionLatitude, selectionLongitude, padding]);

  useEffect(() => {
    if (!initialized || !size.width || !size.height || props.selectionCenter) return;
    if (props.followDriver && following && validMapCoordinate(props.driver)) {
      camera.current?.easeTo({ center: lngLat(props.driver),
        zoom: props.followZoom ?? (props.navigationMode ? 16.5 : 15),
        pitch: props.navigationMode ? 40 : 25,
        bearing: props.navigationMode ? mapBearing(props.driverHeading) : 0,
        padding, duration: reducedMotion ? 0 : motion.duration.tracking, easing: 'linear' });
      fitted.current = '';
      return;
    }
    if (props.followDriver) return;
    const key = JSON.stringify([scene.fitCoordinates, size, padding, props.followRequestId]);
    if (key === fitted.current) return;
    const location = taxiMapFit(scene.fitCoordinates, size.width, size.height, padding);
    if (location) {
      fitted.current = key;
      camera.current?.easeTo({ ...location, padding, pitch: 0, bearing: 0, duration: reducedMotion ? 0 : motion.duration.tracking });
    }
  }, [initialized, size, props.selectionCenter, props.followDriver, props.followRequestId, props.driver, props.driverHeading,
    props.followZoom, props.navigationMode, following, scene.fitCoordinates, padding, reducedMotion]);

  const driverData = useMemo(() => ({ type: 'FeatureCollection' as const, features: validMapCoordinate(props.driver) ? [{
    type: 'Feature' as const, properties: { heading: mapBearing(props.driverHeading) },
    geometry: { type: 'Point' as const, coordinates: lngLat(props.driver) },
  }] : [] }), [props.driver, props.driverHeading]);
  const passengerData = useMemo(() => ({ type: 'FeatureCollection' as const, features: validMapCoordinate(props.passenger) ? [{
    type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: lngLat(props.passenger) },
  }] : [] }), [props.passenger]);

  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.mapFallback }}
    onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize(current => current.width === width && current.height === height ? current : { width, height }); }}>
    <MapLibreMap mapStyle={style} style={{ flex: 1 }} attribution logo={false} compass dragPan touchZoom
      attributionPosition={{ bottom: (props.viewportInsets?.bottom ?? 0) + 8, right: 8 }}
      compassPosition={{ top: (props.viewportInsets?.top ?? 0) + 8, right: 8 }}
      onDidFinishLoadingStyle={() => { setInitialized(true); fitted.current = ''; }}
      onDidFinishRenderingMapFully={() => {
        setError(null);
        if (readyRef.current) return;
        readyRef.current = true; setReady(true); onReady();
      }}
      onDidFailLoadingMap={() => { const message = 'Не удалось загрузить карту. Проверьте соединение и повторите.'; setError(message); onError(message); }}
      onRegionWillChange={event => { if (event.nativeEvent.userInteraction) setFollowing(false); }}
      onPress={event => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        if (validMapCoordinate({ latitude, longitude })) props.onCoordinateSelect?.({ latitude, longitude });
      }}>
      <Camera ref={camera} initialViewState={initialView} minZoom={5} maxZoom={MAP_MAX_ZOOM} />
      <GeoJSONSource id="taxi-route" data={scene.route} tolerance={0}>
        <Layer id="taxi-route-outline" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.surface, 'line-width': 10 }} />
        <Layer id="taxi-route-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.route, 'line-width': 7 }} />
      </GeoJSONSource>
      <GeoJSONSource id="taxi-passenger" data={passengerData}>
        <Layer id="taxi-passenger-dot" type="circle" paint={{ 'circle-radius': 8, 'circle-color': colors.info,
          'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' }} />
      </GeoJSONSource>
      <Images images={driverImages} />
      <GeoJSONSource id="taxi-driver" data={driverData}>
        <Layer id="taxi-driver-icon" type="symbol" layout={{ 'icon-image': 'taxi-driver', 'icon-size': 1 / 3,
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'viewport' }} />
      </GeoJSONSource>
      {scene.points.map(point => <Marker key={point.id} id={point.id} lngLat={point.coordinates} anchor="bottom" offset={[0, 8]}>
        <View collapsable={false} pointerEvents="none" style={{ alignItems: 'center' }} accessibilityLabel={point.label}>
          <Text numberOfLines={1} style={{ maxWidth: 200, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
            fontSize: 14, fontWeight: '600', color: point.kind === 'destination' ? colors.surface : colors.ink,
            backgroundColor: point.kind === 'pickup' ? colors.brand : point.kind === 'destination' ? colors.ink : colors.surface }}>{point.label}</Text>
          <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF',
            backgroundColor: point.kind === 'pickup' ? colors.brand : point.kind === 'stop' ? colors.surface : colors.ink }} />
        </View>
      </Marker>)}
    </MapLibreMap>
    {(!ready || error) && <MapLoadingOverlay error={error} slow={slow} onRetry={props.retry} insets={props.viewportInsets} />}
  </View>;
});

export const TaxiMap = memo(function TaxiMap(props: TaxiMapProps) {
  const focused = useIsFocused();
  const [attempt, setAttempt] = useState(0);
  return focused ? <ActiveTaxiMap key={attempt} {...props} retry={() => setAttempt(value => value + 1)} /> : null;
});
