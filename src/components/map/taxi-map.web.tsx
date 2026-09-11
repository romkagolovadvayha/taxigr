import type { GeoJSONSource, Map as LibreMap, Marker, MapLibreEvent } from 'maplibre-gl';
import { useIsFocused } from 'expo-router';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { grahovoCenter } from '@/data/demo';
import { useAppTheme, useThemeColors } from '@/theme/theme-provider';
import { motion } from '@/theme/tokens';
import { driverMarkerPngMarkup } from './driver-marker';
import { MapLoadingOverlay } from './map-loading-overlay';
import { loadMapLibre } from './maplibre-loader.web';
import { lngLat, MAP_DEFAULT_ZOOM, MAP_MAX_ZOOM, MAP_SELECTION_ZOOM, mapBearing, taxiMapFit, taxiMapPadding, validMapCoordinate, type RouteMapPoint } from './map-scene';
import { taxiMapStyle } from './map-style';
import type { TaxiMapProps } from './types';
import { useMapScene } from './use-map-scene';

type MapApi = typeof import('maplibre-gl');
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ActiveTaxiMap = memo(function ActiveTaxiMap(props: TaxiMapProps & { retry: () => void }) {
  // Imperative map updates must follow each committed route/position change.
  'use no memo';
  const colors = useThemeColors();
  const { colorScheme } = useAppTheme();
  const scene = useMapScene(props);
  const latest = useRef({ props, scene, colors, colorScheme });
  useLayoutEffect(() => { latest.current = { props, scene, colors, colorScheme }; });
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const apiRef = useRef<MapApi | null>(null);
  const driverRef = useRef<Marker | null>(null);
  const passengerRef = useRef<Marker | null>(null);
  const pointsRef = useRef(new Map<string, Marker>());
  const fitted = useRef('');
  const selectionKey = useRef('');
  const followRef = useRef(true);
  const driverAnimation = useRef(0);
  const previousStyle = useRef(colorScheme);
  const styleLoaded = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const sync = useCallback(() => {
    const { props, scene, colors } = latest.current;
    const map = mapRef.current, api = apiRef.current, host = container.current;
    if (!map || !api || !host || !styleLoaded.current) return;
    if (!map.getSource('taxi-route')) {
      map.addSource('taxi-route', { type: 'geojson', data: scene.route, tolerance: 0 });
      map.addLayer({ id: 'taxi-route-outline', type: 'line', source: 'taxi-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.surface, 'line-width': 10 } });
      map.addLayer({ id: 'taxi-route-line', type: 'line', source: 'taxi-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': colors.route, 'line-width': 7 } });
    } else {
      (map.getSource('taxi-route') as GeoJSONSource).setData(scene.route);
      map.setPaintProperty('taxi-route-outline', 'line-color', colors.surface);
      map.setPaintProperty('taxi-route-line', 'line-color', colors.route);
    }
    const active = new Set(scene.points.map(point => point.id));
    for (const [id, marker] of pointsRef.current) if (!active.has(id)) { marker.remove(); pointsRef.current.delete(id); }
    const updatePoint = (point: RouteMapPoint) => {
      let marker = pointsRef.current.get(point.id);
      if (!marker) {
        const element = document.createElement('div');
        element.setAttribute('role', 'img');
        Object.assign(element.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' });
        const label = document.createElement('div');
        Object.assign(label.style, { whiteSpace: 'nowrap', padding: '5px 10px', marginBottom: '6px', borderRadius: '12px',
          fontFamily: 'Manrope, system-ui, sans-serif', fontSize: '14px', fontWeight: '600', lineHeight: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,.16)' });
        const dot = document.createElement('div');
        Object.assign(dot.style, { width: '16px', height: '16px', borderRadius: '50%', border: '2px solid white', boxSizing: 'border-box' });
        element.append(label, dot);
        marker = new api.Marker({ element, anchor: 'bottom', offset: [0, 8] }).setLngLat(point.coordinates).addTo(map);
        pointsRef.current.set(point.id, marker);
      }
      const element = marker.getElement();
      element.setAttribute('aria-label', point.label);
      const label = element.children[0] as HTMLDivElement, dot = element.children[1] as HTMLDivElement;
      label.textContent = point.label;
      label.style.background = dot.style.background = point.kind === 'pickup' ? colors.brand : point.kind === 'destination' ? colors.ink : colors.surface;
      label.style.color = point.kind === 'destination' ? colors.surface : point.kind === 'pickup' ? colors.brandInk : colors.ink;
      marker.setLngLat(point.coordinates);
    };
    scene.points.forEach(updatePoint);
    if (validMapCoordinate(props.driver)) {
      const destination = lngLat(props.driver);
      if (!driverRef.current) {
        const element = document.createElement('div');
        element.setAttribute('role', 'img'); element.setAttribute('aria-label', 'Водитель');
        element.innerHTML = driverMarkerPngMarkup();
        driverRef.current = new api.Marker({ element, rotationAlignment: 'map', pitchAlignment: 'viewport' }).setLngLat(destination).addTo(map);
      }
      const marker = driverRef.current;
      marker.setRotation(mapBearing(props.driverHeading));
      cancelAnimationFrame(driverAnimation.current);
      const start = marker.getLngLat(), started = performance.now();
      const animate = (now: number) => {
        const t = reduceMotion ? 1 : Math.min(1, (now - started) / motion.duration.tracking);
        marker.setLngLat([start.lng + (destination[0] - start.lng) * t, start.lat + (destination[1] - start.lat) * t]);
        if (t < 1) driverAnimation.current = requestAnimationFrame(animate);
      };
      driverAnimation.current = requestAnimationFrame(animate);
    } else { cancelAnimationFrame(driverAnimation.current); driverRef.current?.remove(); driverRef.current = null; }
    if (validMapCoordinate(props.passenger)) {
      if (!passengerRef.current) {
        const element = document.createElement('div');
        element.setAttribute('role', 'img'); element.setAttribute('aria-label', 'Пассажир');
        Object.assign(element.style, { width: '22px', height: '22px', borderRadius: '50%', border: '3px solid white', boxSizing: 'border-box' });
        passengerRef.current = new api.Marker({ element }).setLngLat(lngLat(props.passenger)).addTo(map);
      }
      passengerRef.current.getElement().style.background = colors.info;
      passengerRef.current.setLngLat(lngLat(props.passenger));
    } else { passengerRef.current?.remove(); passengerRef.current = null; }
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    // Keep the viewport stable when the user places the first selection pin.
    const padding = taxiMapPadding(width, height, props.viewportInsets, !props.selectionCenter && scene.points.length > 0);
    host.style.setProperty('--taxi-map-attribution-bottom', String((props.viewportInsets?.bottom ?? 0) + 4) + 'px');
    host.style.setProperty('--taxi-map-control-top', String((props.viewportInsets?.top ?? 0) + 8) + 'px');
    if (validMapCoordinate(props.selectionCenter)) {
      const key = JSON.stringify([props.selectionCenter, padding]);
      if (selectionKey.current !== key) {
        selectionKey.current = key;
        map.jumpTo({ center: lngLat(props.selectionCenter), zoom: MAP_SELECTION_ZOOM, pitch: 0, bearing: 0, padding });
      }
      return;
    }
    if (props.followDriver && followRef.current && validMapCoordinate(props.driver)) {
      fitted.current = '';
      map.easeTo({ center: lngLat(props.driver), zoom: props.followZoom ?? (props.navigationMode ? 16.5 : 15),
        pitch: props.navigationMode ? 40 : 25, bearing: props.navigationMode ? mapBearing(props.driverHeading) : 0,
        padding, duration: reduceMotion ? 0 : motion.duration.tracking, easing: t => t });
    } else if (!props.followDriver) {
      const key = JSON.stringify([scene.fitCoordinates, width, height, padding, props.followRequestId]);
      if (key === fitted.current) return;
      const location = taxiMapFit(scene.fitCoordinates, width, height, padding);
      if (location) {
        fitted.current = key;
        map.easeTo({ ...location, pitch: 0, bearing: 0, padding, duration: reduceMotion ? 0 : motion.duration.tracking });
      }
    }
  }, []);

  useEffect(() => {
    let active = true, rendered = false, baseMapFailed = false;
    const pointMarkers = pointsRef.current;
    const onError = (message: string) => latest.current.props.onMapError?.(message);
    let observer: ResizeObserver | undefined;
    let attribution: HTMLDetailsElement | null = null;
    const collapseAttribution = () => {
      // Set compact before source metadata arrives so MapLibre cannot auto-expand it.
      attribution?.classList.add('maplibregl-compact');
      attribution?.classList.remove('maplibregl-compact-show');
      attribution?.removeAttribute('open');
    };
    const slowTimer = setTimeout(() => { if (active && !rendered) setSlow(true); }, 8_000);
    const timeout = setTimeout(() => {
      if (!active || rendered) return;
      const message = 'Карта не загрузилась. Проверьте соединение и нажмите «Повторить».';
      setError(message); onError(message);
    }, 30_000);
    const contextLost = (event: Event) => { event.preventDefault(); const message = 'Карта была остановлена браузером. Нажмите «Повторить».'; setError(message); onError(message); };
    void loadMapLibre().then(api => {
      if (!active || !container.current) return;
      apiRef.current = api;
      const current = latest.current;
      const selection = current.props.selectionCenter;
      const map = new api.Map({ container: container.current, style: taxiMapStyle(current.colors, current.colorScheme),
        center: lngLat(validMapCoordinate(selection) ? selection : grahovoCenter),
        zoom: selection ? MAP_SELECTION_ZOOM : MAP_DEFAULT_ZOOM, pitch: selection ? 0 : 25, minZoom: 5, maxZoom: MAP_MAX_ZOOM,
        attributionControl: false, locale: { 'AttributionControl.ToggleAttribution': 'Источники карты' },
        canvasContextAttributes: { antialias: true }, renderWorldCopies: false });
      mapRef.current = map;
      map.addControl(new api.AttributionControl({ compact: true }), 'bottom-right');
      attribution = container.current.querySelector<HTMLDetailsElement>('.maplibregl-ctrl-attrib');
      collapseAttribution();
      map.addControl(new api.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true }), 'top-right');
      map.getCanvas().setAttribute('aria-label', 'Карта поездки');
      map.getCanvas().addEventListener('webglcontextlost', contextLost);
      map.on('style.load', () => { if (!active) return; styleLoaded.current = true; fitted.current = ''; setInitialized(true); sync(); });
      const loaded = () => {
        if (!active || rendered || baseMapFailed) return;
        rendered = true; setReady(true); setError(null); latest.current.props.onMapReady?.();
      };
      map.on('load', loaded);
      map.on('sourcedata', event => {
        if (event.sourceId === 'openmaptiles' && event.sourceDataType === 'content' && event.coord) {
          baseMapFailed = false;
          if (map.loaded()) loaded();
        }
      });
      map.on('error', event => {
        if (!active) return;
        // A failed tile must not tear down an already usable map.
        if (!rendered) {
          baseMapFailed = true;
          setError('Не удалось открыть карту. Нажмите «Повторить».'); onError(event.error.message);
        }
      });
      map.on('click', event => {
        const point = { latitude: event.lngLat.lat, longitude: event.lngLat.lng };
        if (validMapCoordinate(point)) latest.current.props.onCoordinateSelect?.(point);
      });
      const stopFollowing = (event: MapLibreEvent) => {
        if (event.originalEvent) { followRef.current = false; collapseAttribution(); }
      };
      map.on('dragstart', stopFollowing); map.on('rotatestart', stopFollowing); map.on('zoomstart', stopFollowing);
      observer = new ResizeObserver(() => { map.resize(); fitted.current = ''; sync(); });
      observer.observe(container.current);
    }).catch((reason: unknown) => {
      if (!active) return;
      const message = reason instanceof Error ? reason.message : 'Карта недоступна';
      setError('Не удалось открыть карту. Проверьте поддержку WebGL и повторите.'); onError(message);
    });
    return () => {
      active = false; clearTimeout(slowTimer); clearTimeout(timeout); cancelAnimationFrame(driverAnimation.current);
      observer?.disconnect();
      driverRef.current?.remove(); passengerRef.current?.remove();
      pointMarkers.forEach(marker => marker.remove()); pointMarkers.clear();
      mapRef.current?.getCanvas().removeEventListener('webglcontextlost', contextLost);
      mapRef.current?.remove(); mapRef.current = null; apiRef.current = null;
    };
  }, [sync]);

  useEffect(() => {
    if (previousStyle.current === colorScheme) return;
    previousStyle.current = colorScheme;
    styleLoaded.current = false;
    mapRef.current?.setStyle(taxiMapStyle(colors, colorScheme));
  }, [colors, colorScheme]);

  useEffect(() => { followRef.current = true; sync(); }, [props.followDriver, props.followRequestId, sync]);
  useEffect(() => { sync(); }, [initialized, scene, colors, props.driver, props.driverHeading, props.passenger,
    props.followDriver, props.followZoom, props.followRequestId, props.navigationMode, props.viewportInsets, props.selectionCenter, sync]);

  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.mapFallback }}>
    <div ref={container} style={{ flex: 1, minHeight: 0 }} data-taxi-map="maplibre" />
    <style>{'[data-taxi-map="maplibre"] .maplibregl-ctrl-bottom-right{bottom:var(--taxi-map-attribution-bottom,4px)}[data-taxi-map="maplibre"] .maplibregl-ctrl-top-right{top:var(--taxi-map-control-top,8px)}'}</style>
    {(!ready || error) && <MapLoadingOverlay error={error} slow={slow} onRetry={props.retry} insets={props.viewportInsets} />}
  </View>;
});

export const TaxiMap = memo(function TaxiMap(props: TaxiMapProps) {
  const focused = useIsFocused();
  const [attempt, setAttempt] = useState(0);
  return focused ? <ActiveTaxiMap key={attempt} {...props} retry={() => setAttempt(value => value + 1)} /> : null;
});
