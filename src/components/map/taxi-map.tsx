import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildNativeMapHtml, serializeNativeMapState } from '@/components/map/native-map-html';
import type { TaxiMapProps } from '@/components/map/types';
import { remainingRouteCoordinates } from '@/domain/route-tracking';
import { useAppTheme } from '@/theme/theme-provider';
import { colors, spacing, typography } from '@/theme/tokens';

export const TaxiMap = memo(function TaxiMap(props: TaxiMapProps) {
  const { colorScheme } = useAppTheme();
  const webViewRef = useRef<WebView>(null);
  const [canMountWebView, setCanMountWebView] = useState(false);
  const [ready, setReady] = useState(false);
  const apiKey = process.env.EXPO_PUBLIC_YANDEX_MAPS_API_KEY;
  const html = useMemo(
    () => (canMountWebView && apiKey ? buildNativeMapHtml(apiKey, colorScheme) : ''),
    [apiKey, canMountWebView, colorScheme],
  );
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
      colorScheme,
    ],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => setCanMountWebView(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const pushState = useCallback(() => {
    if (!ready) return;
    webViewRef.current?.postMessage(state);
  }, [ready, state]);

  useEffect(() => {
    pushState();
  }, [pushState]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type: string; message?: string };
      if (message.type === 'ready') {
        setReady(true);
        props.onMapReady?.();
      }
      if (message.type === 'error') props.onMapError?.(message.message ?? 'Карта недоступна');
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

  if (!canMountWebView) {
    return <View style={{ flex: 1, backgroundColor: colors.mapFallback }} />;
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ html, baseUrl: 'https://taxigr.ru/' }}
      style={{ flex: 1, backgroundColor: colors.mapFallback }}
      onMessage={onMessage}
      onLoadEnd={pushState}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      cacheEnabled
      setSupportMultipleWindows={false}
      androidLayerType="hardware"
    />
  );
});
