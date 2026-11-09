import type { Map as LibreMap, Marker, MapLibreEvent } from 'maplibre-gl';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';

import { grahovoCenter } from '@/data/service-area';
import { useForegroundScreen } from '@/hooks/use-foreground-screen';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { motion } from '@/theme/tokens';
import { driverMarkerPngMarkup } from './driver-marker';
import { MapLoadingOverlay } from './map-loading-overlay';
import { loadMapLibre } from './maplibre-loader.web';
import { watchBaseMapReady } from './map-readiness.web';
import { watchMapRecovery } from './map-recovery.web';
import { createRouteLayerSync } from './route-layer-sync';
import { lngLat, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM, MAP_SELECTION_ZOOM, mapBearing, taxiMapFit, taxiMapPadding, validMapCoordinate, type RouteMapPoint } from './map-scene';
import { taxiMapStyle } from './map-style';
import type { TaxiMapProps } from './types';
import { useMapScene } from './use-map-scene';

type MapApi = typeof import('maplibre-gl');
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ActiveTaxiMap = memo(function ActiveTaxiMap(props: TaxiMapProps & { retry: () => void; recover: () => void }) {
  // Imperative map updates must follow each committed route/position change.
  'use no memo';
  const colors = useThemeColors();
  const { colorScheme } = useAppTheme();
  const [offlineFallback, setOfflineFallback] = useState(false);
  const { isConnected } = useNetInfo();
  const offline = isConnected === false || offlineFallback;
  const scene = useMapScene(props);
  const latest = useRef({ props, scene, colors, colorScheme, offline });
  useLayoutEffect(() => { latest.current = { props, scene, colors, colorScheme, offline }; });
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const apiRef = useRef<MapApi | null>(null);
  const driverRef = useRef<Marker | null>(null);
  const passengerRef = useRef<Marker | null>(null);
  const pointsRef = useRef(new Map<string, Marker>());
  const pointValues = useRef(new Map<string, string>());
  const driverTarget = useRef('');
  const driverPositionTarget = useRef('');
  const passengerTarget = useRef('');
  const followTarget = useRef('');
  const insetStyle = useRef('');
  const [syncRoute] = useState(createRouteLayerSync);
  const fitted = useRef('');
  const fittedCoordinates = useRef<ReturnType<typeof useMapScene>['fitCoordinates'] | null>(null);
  const selectionKey = useRef('');
  const movingSelection = useRef(false);
  const followRef = useRef(true);
  const driverAnimation = useRef(0);
  const previousStyle = useRef(`${colorScheme}:${offline}`);
  const styleLoaded = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!error) return;
    return watchMapRecovery(() => latest.current.props.recover());
  }, [error]);
  const sync = useCallback(() => {
    const { props, scene, colors } = latest.current;
    const map = mapRef.current, api = apiRef.current, host = container.current;
    if (!map || !api || !host || !styleLoaded.current) return;
    syncRoute(map, scene.route, colors.surface, colors.route);
    const active = new Set(scene.points.map(point => point.id));
    for (const [id, marker] of pointsRef.current) if (!active.has(id)) { marker.remove(); pointsRef.current.delete(id); pointValues.current.delete(id); }
    const updatePoint = (point: RouteMapPoint) => {
      let marker = pointsRef.current.get(point.id);
      const searching = Boolean(props.searching && point.kind === 'pickup');
      const editable = !!props.onRoutePointEdit;
      const value = JSON.stringify([point, searching, editable, colors.brand, colors.ink, colors.surface, colors.brandInk]);
      if (marker && pointValues.current.get(point.id) === value) return;
      pointValues.current.set(point.id, value);
      if (!marker) {
        const element = document.createElement('div');
        Object.assign(element.style, { display: 'flex', flexDirection: 'column', alignItems: 'center' });
        const edit = () => latest.current.props.onRoutePointEdit?.(point.destinationIndex);
        element.addEventListener('click', edit);
        element.addEventListener('keydown', event => {
          if (latest.current.props.onRoutePointEdit && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            edit();
          }
        });
        const label = document.createElement('div');
        Object.assign(label.style, { whiteSpace: 'nowrap', padding: '5px 9px', marginBottom: '3px', borderRadius: '16px',
          fontFamily: 'Manrope, system-ui, sans-serif', fontSize: '12px', fontWeight: '700', lineHeight: '18px',
          boxShadow: '0 2px 7px rgba(0,0,0,.14)' });
        const dot = document.createElement('div');
        Object.assign(dot.style, { position: 'relative', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid', boxSizing: 'border-box' });
        element.append(label, dot);
        marker = new api.Marker({ element, anchor: 'bottom', offset: [0, 6] }).setLngLat(point.coordinates).addTo(map);
        pointsRef.current.set(point.id, marker);
      }
      const element = marker.getElement();
      element.setAttribute('role', editable ? 'button' : 'img');
      element.setAttribute('aria-label', `${editable ? 'Изменить точку ' + point.badge + ' · ' : ''}${point.label}${searching ? ' · Ищем водителя' : ''}`);
      element.tabIndex = editable ? 0 : -1;
      element.style.pointerEvents = editable ? 'auto' : 'none';
      element.style.cursor = editable ? 'pointer' : '';
      const label = element.children[0] as HTMLDivElement, dot = element.children[1] as HTMLDivElement;
      label.textContent = `${point.badge} · ${point.label}${editable ? ' ›' : ''}`;
      label.style.background = point.kind === 'pickup' ? colors.brand : colors.surface;
      label.style.color = point.kind === 'pickup' ? colors.brandInk : colors.ink;
      dot.style.background = colors.surface;
      dot.style.borderColor = colors.ink;
      label.style.zIndex = '1';
      dot.style.setProperty('--pickup-radar-color', colors.brand);
      if (searching && !dot.firstChild) {
        const radar = document.createElement('div');
        radar.className = 'taxi-pickup-radar';
        radar.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < 3; index += 1) {
          const ring = document.createElement('span');
          ring.style.animationDelay = `${-index * 800}ms`;
          ring.style.setProperty('--radar-static-scale', String(0.3 + index / 3));
          radar.append(ring);
        }
        dot.append(radar);
      } else if (!searching) dot.replaceChildren();
      const currentPosition = marker.getLngLat();
      if (currentPosition.lng !== point.coordinates[0] || currentPosition.lat !== point.coordinates[1]) marker.setLngLat(point.coordinates);
    };
    scene.points.forEach(updatePoint);
    const nextDriverTarget = validMapCoordinate(props.driver) ? JSON.stringify([props.driver.latitude, props.driver.longitude, mapBearing(props.driverHeading)]) : '';
    if (validMapCoordinate(props.driver) && nextDriverTarget !== driverTarget.current) {
      driverTarget.current = nextDriverTarget;
      const destination = lngLat(props.driver);
      if (!driverRef.current) {
        const element = document.createElement('div');
        element.setAttribute('role', 'img'); element.setAttribute('aria-label', 'Водитель');
        element.innerHTML = driverMarkerPngMarkup();
        driverRef.current = new api.Marker({ element, rotationAlignment: 'map', pitchAlignment: 'viewport' }).setLngLat(destination).addTo(map);
      }
      const marker = driverRef.current;
      const heading = mapBearing(props.driverHeading);
      if (marker.getRotation() !== heading) marker.setRotation(heading);
      const positionTarget = JSON.stringify(destination);
      if (driverPositionTarget.current !== positionTarget) {
        driverPositionTarget.current = positionTarget;
        cancelAnimationFrame(driverAnimation.current);
        const start = marker.getLngLat(), started = performance.now();
        const animate = (now: number) => {
          const t = reduceMotion ? 1 : Math.min(1, (now - started) / motion.duration.tracking);
          marker.setLngLat([start.lng + (destination[0] - start.lng) * t, start.lat + (destination[1] - start.lat) * t]);
          if (t < 1) driverAnimation.current = requestAnimationFrame(animate);
        };
        if (start.lng !== destination[0] || start.lat !== destination[1]) driverAnimation.current = requestAnimationFrame(animate);
      }
    } else if (!nextDriverTarget) { driverTarget.current = ''; driverPositionTarget.current = ''; cancelAnimationFrame(driverAnimation.current); driverRef.current?.remove(); driverRef.current = null; }
    const nextPassengerTarget = validMapCoordinate(props.passenger) ? JSON.stringify([props.passenger.latitude, props.passenger.longitude, colors.info]) : '';
    if (validMapCoordinate(props.passenger) && nextPassengerTarget !== passengerTarget.current) {
      passengerTarget.current = nextPassengerTarget;
      if (!passengerRef.current) {
        const element = document.createElement('div');
        element.setAttribute('role', 'img'); element.setAttribute('aria-label', 'Пассажир');
        Object.assign(element.style, { width: '22px', height: '22px', borderRadius: '50%', border: '3px solid white', boxSizing: 'border-box' });
        passengerRef.current = new api.Marker({ element }).setLngLat(lngLat(props.passenger)).addTo(map);
      }
      passengerRef.current.getElement().style.background = colors.info;
      const currentPosition = passengerRef.current.getLngLat();
      if (currentPosition.lng !== props.passenger.longitude || currentPosition.lat !== props.passenger.latitude) passengerRef.current.setLngLat(lngLat(props.passenger));
    } else if (!nextPassengerTarget) { passengerTarget.current = ''; passengerRef.current?.remove(); passengerRef.current = null; }
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    // Keep the viewport stable when the user places the first selection pin.
    const padding = taxiMapPadding(width, height, props.viewportInsets, !props.selectionCenter && scene.points.length > 0);
    const nextInsetStyle = `${props.viewportInsets?.bottom ?? 0}:${props.viewportInsets?.top ?? 0}`;
    if (nextInsetStyle !== insetStyle.current) {
      insetStyle.current = nextInsetStyle;
      host.style.setProperty('--taxi-map-attribution-bottom', String((props.viewportInsets?.bottom ?? 0) + 4) + 'px');
    }
    if (validMapCoordinate(props.selectionCenter)) {
      followTarget.current = '';
      const key = JSON.stringify([props.selectionCenter, padding]);
      if (selectionKey.current !== key) {
        selectionKey.current = key;
        map.jumpTo({ center: lngLat(props.selectionCenter), zoom: MAP_SELECTION_ZOOM, pitch: 0, bearing: 0, padding });
      }
      return;
    }
    if (props.followDriver && followRef.current && validMapCoordinate(props.driver)) {
      const nextFollowTarget = JSON.stringify([props.driver.latitude, props.driver.longitude,
        props.navigationMode ? mapBearing(props.driverHeading) : 0, props.followZoom, props.navigationMode, padding, props.followRequestId]);
      if (nextFollowTarget === followTarget.current) return;
      followTarget.current = nextFollowTarget;
      fitted.current = '';
      map.easeTo({ center: lngLat(props.driver), zoom: props.followZoom ?? (props.navigationMode ? 16.5 : 15),
        pitch: props.navigationMode ? 40 : 25, bearing: props.navigationMode ? mapBearing(props.driverHeading) : 0,
        padding, duration: reduceMotion ? 0 : motion.duration.tracking, easing: t => t });
    } else if (!props.followDriver) {
      const key = JSON.stringify([width, height, padding, props.followRequestId]);
      if (key === fitted.current && fittedCoordinates.current === scene.fitCoordinates) return;
      const location = taxiMapFit(scene.fitCoordinates, width, height, padding);
      if (location) {
        fitted.current = key;
        fittedCoordinates.current = scene.fitCoordinates;
        map.easeTo({ ...location, pitch: 0, bearing: 0, padding, duration: reduceMotion ? 0 : motion.duration.tracking });
      }
    }
  }, [syncRoute]);

  useEffect(() => {
    let active = true, rendered = false;
    const pointMarkers = pointsRef.current;
    const cachedPointValues = pointValues.current;
    const onError = (message: string) => latest.current.props.onMapError?.(message);
    let observer: ResizeObserver | undefined;
    let stopWatchingReadiness: (() => void) | undefined;
    const slowTimer = setTimeout(() => {
      if (!active || rendered) return;
      if (!latest.current.offline && mapRef.current) setOfflineFallback(true);
      else setSlow(true);
    }, 8_000);
    const timeout = setTimeout(() => {
      if (!active || rendered) return;
      const message = 'Не удалось загрузить данные карты. Нажмите «Повторить».';
      setError(message); onError(message);
    }, 30_000);
    const contextLost = (event: Event) => { event.preventDefault(); const message = 'Карта была остановлена браузером. Нажмите «Повторить».'; setError(message); onError(message); };
    void loadMapLibre().then(api => {
      if (!active || !container.current) return;
      apiRef.current = api;
      const current = latest.current;
      const selection = current.props.selectionCenter;
      const map = new api.Map({ container: container.current, style: taxiMapStyle(current.colors, current.colorScheme, current.offline),
        center: lngLat(validMapCoordinate(selection) ? selection : grahovoCenter),
        zoom: selection ? MAP_SELECTION_ZOOM : MAP_DEFAULT_ZOOM, pitch: selection ? 0 : 25, minZoom: 5, maxZoom: MAP_MAX_ZOOM,
        attributionControl: false, locale: { 'AttributionControl.ToggleAttribution': 'Источники карты' },
        canvasContextAttributes: { antialias: true }, renderWorldCopies: false });
      mapRef.current = map;
      map.addControl(new api.AttributionControl({ compact: false }), 'bottom-right');
      map.getCanvas().setAttribute('aria-label', 'Карта поездки');
      map.getCanvas().addEventListener('webglcontextlost', contextLost);
      const markReady = () => {
        if (!active || rendered) return;
        clearTimeout(slowTimer); clearTimeout(timeout);
        rendered = true; setReady(true); setError(null); latest.current.props.onMapReady?.();
      };
      map.on('style.load', () => {
        if (!active) return;
        styleLoaded.current = true; fitted.current = ''; setInitialized(true); sync();
        if (latest.current.offline) map.once('render', markReady);
      });
      stopWatchingReadiness = watchBaseMapReady(map, markReady);
      map.on('error', event => {
        if (!active) return;
        // A failed tile must not tear down an already usable map.
        if (!rendered && latest.current.offline) {
          setError('Не удалось открыть карту. Нажмите «Повторить».'); onError(event.error.message);
        }
      });
      map.on('click', event => {
        const point = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
        if (!validMapCoordinate(point) || !latest.current.props.selectionCenter) return;
        latest.current.props.onSelectionInteraction?.();
        map.jumpTo({ center: lngLat(point) });
        latest.current.props.onCoordinateSelect?.(point);
      });
      const stopFollowing = (event: MapLibreEvent) => {
        if (event.originalEvent) {
          followRef.current = false;
          if (latest.current.props.selectionCenter) movingSelection.current = true;
          latest.current.props.onSelectionInteraction?.();
        }
      };
      map.on('dragstart', stopFollowing); map.on('rotatestart', stopFollowing); map.on('zoomstart', stopFollowing);
      map.on('moveend', () => {
        if (!movingSelection.current) return;
        movingSelection.current = false;
        const { lat, lng } = map.getCenter();
        const point = { latitude: lat, longitude: lng };
        if (latest.current.props.selectionCenter && validMapCoordinate(point)) latest.current.props.onCoordinateSelect?.(point);
      });
      observer = new ResizeObserver(() => { map.resize(); fitted.current = ''; sync(); });
      observer.observe(container.current);
    }).catch((reason: unknown) => {
      if (!active) return;
      const message = reason instanceof Error ? reason.message : 'Карта недоступна';
      setError('Не удалось открыть карту. Проверьте поддержку WebGL и повторите.'); onError(message);
    });
    return () => {
      active = false; clearTimeout(slowTimer); clearTimeout(timeout); cancelAnimationFrame(driverAnimation.current);
      stopWatchingReadiness?.();
      observer?.disconnect();
      driverRef.current?.remove(); passengerRef.current?.remove();
      driverRef.current = null; passengerRef.current = null;
      driverTarget.current = ''; driverPositionTarget.current = ''; passengerTarget.current = '';
      followTarget.current = ''; insetStyle.current = ''; selectionKey.current = ''; fitted.current = '';
      cachedPointValues.clear(); styleLoaded.current = false;
      pointMarkers.forEach(marker => marker.remove()); pointMarkers.clear();
      mapRef.current?.getCanvas().removeEventListener('webglcontextlost', contextLost);
      mapRef.current?.remove(); mapRef.current = null; apiRef.current = null;
    };
  }, [sync]);

  useEffect(() => {
    const key = `${colorScheme}:${offline}`;
    if (previousStyle.current === key) return;
    previousStyle.current = key;
    styleLoaded.current = false;
    mapRef.current?.setStyle(taxiMapStyle(colors, colorScheme, offline));
  }, [colors, colorScheme, offline]);

  useEffect(() => { followRef.current = true; followTarget.current = ''; }, [props.followDriver, props.followRequestId]);
  useEffect(() => { sync(); }, [initialized, scene, colors, props.driver, props.driverHeading, props.passenger,
    props.followDriver, props.followZoom, props.followRequestId, props.navigationMode, props.viewportInsets, props.selectionCenter, props.searching, props.onRoutePointEdit, sync]);

  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.mapFallback }}>
    <div ref={container} style={{ flex: 1, minHeight: 0 }} data-taxi-map="maplibre" />
    {offline && ready && <div style={{ position: 'absolute', top: 8 + (props.viewportInsets?.top ?? 0), left: 8, padding: 4,
      fontFamily: 'Manrope, system-ui, sans-serif', fontSize: 11, color: colors.inkSecondary, background: colors.surface }}>Карта района офлайн</div>}
    <style>{'[data-taxi-map="maplibre"] .maplibregl-ctrl-bottom-right{bottom:var(--taxi-map-attribution-bottom,4px)}[data-taxi-map="maplibre"] .maplibregl-ctrl-attrib{font-size:9px;line-height:14px}'}</style>
    <style>{`
      .taxi-pickup-radar{position:absolute;left:50%;top:50%;width:160px;height:160px;transform:translate(-50%,-50%);pointer-events:none}
      .taxi-pickup-radar span{position:absolute;inset:0;border-radius:50%;border:2px solid var(--pickup-radar-color);background:var(--pickup-radar-color);box-sizing:border-box;animation:taxi-pickup-pulse 2400ms linear infinite}
      @keyframes taxi-pickup-pulse{from{transform:scale(.15);opacity:.55}to{transform:scale(1);opacity:0}}
      @media(prefers-reduced-motion:reduce){.taxi-pickup-radar span{animation:none;transform:scale(var(--radar-static-scale));opacity:.08}}
    `}</style>
    {(!ready || error) && <MapLoadingOverlay error={error} slow={slow} mapVisible={initialized} onRetry={props.retry} insets={props.viewportInsets} />}
  </View>;
});

export const TaxiMap = memo(function TaxiMap(props: TaxiMapProps) {
  const [attempt, setAttempt] = useState(0);
  const recoveryUsed = useRef(false);
  const retry = useCallback(() => {
    recoveryUsed.current = false;
    setAttempt(value => value + 1);
  }, []);
  const recover = useCallback(() => {
    if (recoveryUsed.current) return;
    recoveryUsed.current = true;
    setAttempt(value => value + 1);
  }, []);
  const visible = useForegroundScreen();
  if (!visible) return <View style={{ flex: 1, minHeight: 0 }} />;
  return <ActiveTaxiMap key={attempt} {...props} retry={retry} recover={recover} onMapReady={() => {
    recoveryUsed.current = false;
    props.onMapReady?.();
  }} />;
});
