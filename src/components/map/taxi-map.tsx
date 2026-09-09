import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildNativeMapHtml, serializeNativeMapState } from '@/components/map/native-map-html';
import type { TaxiMapProps } from '@/components/map/types';
import { remainingRouteCoordinates } from '@/domain/route-tracking';
import { useThemeColors, useAppTheme } from '@/theme/theme-provider';
import { spacing, typography } from '@/theme/tokens';
import { MapLoadingOverlay } from './map-loading-overlay';
import { prepareMapWebView } from './webview-startup';

export const TaxiMap = memo(function TaxiMap(props: TaxiMapProps) {
  const colors = useThemeColors();
  const { colorScheme } = useAppTheme();
  const [initialColorScheme] = useState(colorScheme);
  const [initialSelectionCenter] = useState(props.selectionCenter);
  const webViewRef = useRef<WebView>(null);
  const [canMountWebView, setCanMountWebView] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reportMapError = useEffectEvent((message: string) => props.onMapError?.(message));
  const apiKey = process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY;
  const html = useMemo(
    () => (canMountWebView && apiKey ? buildNativeMapHtml(apiKey, initialColorScheme, initialSelectionCenter) : ''),
    [apiKey, canMountWebView, initialColorScheme, initialSelectionCenter],
  );
  const source = useMemo(() => ({ html, baseUrl: 'https://taxigr.ru/' }), [html]);
  const state = useMemo(
    () =>
      canMountWebView
        ? serializeNativeMapState({
            pickup: props.pickup,
            destinations: props.destinations,
            destination: props.destination,
            routeCoordinates: props.trimCompletedRoute
              ? remainingRouteCoordinates(props.routeCoordinates, props.driver)
              : props.routeCoordinates,
            pickupEtaMinutes: props.pickupEtaMinutes,
            destinationArrivalLabel: props.destinationArrivalLabel,
            driver: props.driver,
            driverHeading: props.driverHeading,
            passenger: props.passenger,
            followDriver: props.followDriver,
            followZoom: props.followZoom,
            navigationMode: props.navigationMode,
            routeTarget: props.routeTarget,
            viewportInsets: props.viewportInsets,
            colorScheme,
            selectionCenter: props.selectionCenter,
            coordinateSelectionEnabled: Boolean(props.onCoordinateSelect),
          })
        : '',
    [
      canMountWebView,
      props.destination,
      props.destinations,
      props.destinationArrivalLabel,
      props.driver,
      props.driverHeading,
      props.followDriver,
      props.followZoom,
      props.navigationMode,
      props.passenger,
      props.pickup,
      props.pickupEtaMinutes,
      props.routeCoordinates,
      props.routeTarget,
      props.trimCompletedRoute,
      props.viewportInsets,
      props.selectionCenter,
      props.onCoordinateSelect,
      colorScheme,
    ],
  );

  useEffect(() => {
    if (!apiKey) return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      void prepareMapWebView().then(() => {
        if (active) setCanMountWebView(true);
      }).catch(() => {
        if (!active) return;
        const message = 'Не удалось открыть карту. Перезапустите приложение.';
        setLoadError(message);
        reportMapError(message);
      });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [attempt, apiKey]);

  useEffect(() => {
    if (ready || !apiKey) return;
    const slowTimer = setTimeout(() => setSlow(true), 8_000);
    const errorTimer = setTimeout(() => {
      const message = 'Карта не ответила. Проверьте соединение и попробуйте ещё раз.';
      setLoadError((current) => current ?? message);
      reportMapError(message);
    }, 30_000);
    return () => { clearTimeout(slowTimer); clearTimeout(errorTimer); };
  }, [ready, attempt, apiKey]);

  const retry = () => {
    setCanMountWebView(false);
    setInitialized(false);
    setReady(false);
    setLoadError(null);
    setSlow(false);
    setAttempt((value) => value + 1);
  };

  const pushState = useCallback(() => {
    if (!initialized) return;
    webViewRef.current?.postMessage(state);
  }, [initialized, state]);

  useEffect(() => {
    pushState();
  }, [pushState]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; message?: string; coordinates?: {latitude: number; longitude: number} };
      if (message.type === 'coordinate' && message.coordinates &&
        Number.isFinite(message.coordinates.latitude) && Math.abs(message.coordinates.latitude) <= 90 &&
        Number.isFinite(message.coordinates.longitude) && Math.abs(message.coordinates.longitude) <= 180) {
        props.onCoordinateSelect?.(message.coordinates);
      }
      if (message.type === 'initialized') setInitialized(true);
      if (message.type === 'ready') {
        setLoadError(null);
        setReady(true);
        props.onMapReady?.();
      }
      if (message.type === 'error') {
        setLoadError('Не удалось загрузить карту. Проверьте соединение и попробуйте ещё раз.');
        props.onMapError?.(message.message ?? 'Карта недоступна');
      }
    } catch {
      props.onMapError?.('Некорректный ответ карты');
    }
  };

  if (!apiKey) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.x6 }}>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
          Не настроен ключ Яндекс Карт
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.mapFallback }}>
    {canMountWebView && <WebView
      key={attempt}
      ref={webViewRef}
      source={source}
      style={{ flex: 1, backgroundColor: colors.mapFallback }}
      onMessage={onMessage}
      onLoadEnd={pushState}
      onError={() => {
        setReady(false);
        setLoadError('Не удалось загрузить карту. Проверьте соединение и попробуйте ещё раз.');
      }}
      onRenderProcessGone={() => {
        setCanMountWebView(false);
        setInitialized(false);
        setReady(false);
        setLoadError('Карта была закрыта системой. Нажмите «Повторить».');
      }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      setSupportMultipleWindows={false}
      androidLayerType="hardware"
    />}
    {(!ready || loadError) && <MapLoadingOverlay error={loadError} slow={slow} onRetry={retry} insets={props.viewportInsets} />}
    </View>
  );
});
