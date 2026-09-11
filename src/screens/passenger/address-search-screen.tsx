import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest } from '@/api/client';
import { resolveStreetCenter } from '@/api/street-center';
import { resolveHouseAddress } from '@/api/house-address';
import { rememberAddressPoint } from '@/api/remember-address';
import { readDemoAddressPoints } from '@/storage/demo-address-points';
import { overlayRememberedAddresses } from '@/domain/remembered-address';
import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { TaxiMap } from '@/components/map/taxi-map';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { demoAddresses } from '@/data/demo';
import { grahovoAddressCatalog } from '@/data/grahovo-address-catalog';
import type { DestinationHistoryItem } from '@/domain/address-history';
import {
  addressSearchScore,
  filterRequestedHouse,
  rankAddressSearchResults,
  uniqueAddressesByLabel,
} from '@/domain/address-search';
import {
  extractHouseNumber,
  extractQueryHouseNumber,
  hasHouseNumber,
  hasApproximateCoordinates,
  isDestinationAddressComplete,
  queryHasHouseNumber,
} from '@/domain/address-precision';
import { formatAddressSuggestionLines } from '@/domain/address-suggestion-display';
import { buildStreetSuggestions, toStreetSuggestion } from '@/domain/address-suggestions';
import { buildManualAddress, findBestAddressAnchor } from '@/domain/manual-address';
import type { Address, Coordinates } from '@/domain/models';
import { getPlaceOpenStatus } from '@/domain/place-directory';
import { goBackOrReplace } from '@/navigation/back';
import { useRideAddresses } from '@/state/ride-provider';
import { usePassengerPickupLocation } from '@/hooks/use-passenger-pickup-location';
import { useForegroundScreen } from '@/hooks/use-foreground-screen';
import { useScreenClock } from '@/hooks/use-screen-clock';
import { motion, radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

function addressKey(address: Address): string {
  return `${address.placeId ?? address.label.toLocaleLowerCase('ru')}:${address.houseNumber?.toLocaleLowerCase('ru') ?? 'place'}:${address.coordinates.latitude.toFixed(5)}:${address.coordinates.longitude.toFixed(5)}`;
}

function matchesAddress(address: Address, normalizedQuery: string): boolean {
  return !normalizedQuery || addressSearchScore(address, normalizedQuery) > 0;
}

function mergeAddresses(primary: Address[], secondary: Address[]): Address[] {
  const seen = new Set<string>();
  return [...primary, ...secondary].filter((address) => {
    const key = addressKey(address);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const localAddressDirectory = uniqueAddressesByLabel([
  ...demoAddresses,
  ...grahovoAddressCatalog,
  // GAR already includes streets; expanding every house here recompiles thousands
  // of label expressions while Expo Router loads the screen module at startup.
  ...buildStreetSuggestions(demoAddresses),
]);

function searchTokens(value: string): string[] {
  return value
    .toLocaleLowerCase('ru')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 1);
}

function collectKnownStreetTokens(addresses: readonly Address[]): Set<string> {
  const result = new Set<string>();
  for (const address of addresses) {
    if (!address.details?.includes('улица') || hasHouseNumber(address)) continue;
    const addressParts = address.label.split(',');
    const streetPart = addressParts[addressParts.length - 1] ?? address.label;
    for (const token of searchTokens(streetPart)) {
      if (!['ул', 'улица', 'пер', 'переулок'].includes(token)) result.add(token);
    }
  }
  return result;
}

const knownStreetTokens = collectKnownStreetTokens(localAddressDirectory);
const emptySearchSuggestions = mergeAddresses(buildStreetSuggestions(demoAddresses), demoAddresses);

function relativeDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startToday - startDate) / 86_400_000);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
}

function historyMeta(item: DestinationHistoryItem): string {
  if (item.isLastDestination) return `последняя · ${relativeDate(item.lastUsedAt)}`;
  const suffix =
    item.tripCount % 10 === 1 && item.tripCount % 100 !== 11
      ? 'поездка'
      : [2, 3, 4].includes(item.tripCount % 10) &&
          ![12, 13, 14].includes(item.tripCount % 100)
        ? 'поездки'
        : 'поездок';
  return `${item.tripCount} ${suffix}`;
}

function SectionTitle({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      selectable
      style={{
        ...typography.micro,
        color: colors.inkMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        paddingHorizontal: spacing.x1,
      }}
    >
      {children}
    </Text>
  );
}

function AddressResult({
  address,
  directSelectionAllowed = false,
  history,
  manual = false,
  now,
  onPress,
}: {
  address: Address;
  directSelectionAllowed?: boolean;
  history?: DestinationHistoryItem;
  manual?: boolean;
  now: Date;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const place = address.place;
  const placeStatus = place ? getPlaceOpenStatus(place.schedule, now) : null;
  const displayLines = formatAddressSuggestionLines(address);
  const needsMapPoint = hasHouseNumber(address) && hasApproximateCoordinates(address);
  const precise = hasHouseNumber(address) || Boolean(place) || directSelectionAllowed;
  const refinement = !precise && !history;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${address.label}${history ? `, ${historyMeta(history)}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: place ? 104 : 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.x4,
        padding: spacing.x4,
        borderRadius: radius.lg,
        backgroundColor: manual ? colors.warningSoft : precise || refinement ? colors.surface : colors.warningSoft,
        borderWidth: 1,
        borderColor: manual ? colors.warning : precise || refinement ? colors.border : colors.warning,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceSecondary,
        }}
      >
        {place?.photoUrls[0] ? (
          <Image
            source={{ uri: place.photoUrls[0] }}
            contentFit="cover"
            accessibilityLabel={`Фото: ${place.name}`}
            style={{ width: 42, height: 42, borderRadius: radius.md }}
          />
        ) : (
          <AppIcon
            name={history?.isLastDestination ? 'clock' : 'location'}
            color={
              precise || refinement
                ? history?.isLastDestination
                  ? colors.ink
                  : colors.inkSecondary
                : colors.warningText
            }
            size={21}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          {displayLines.primary}
        </Text>
        {!!displayLines.secondary && (
          <Text
            selectable
            style={{ ...typography.caption, color: colors.inkSecondary }}
          >
            {displayLines.secondary}
          </Text>
        )}
        {needsMapPoint && (
          <Text style={{ ...typography.caption, color: colors.warningText }}>
            Укажите точку дома на карте
          </Text>
        )}
        {address.id.startsWith('saved-') && (
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Точка запомнена</Text>
        )}
        {!!place?.description && (
          <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
            {place.description}
          </Text>
        )}
        {!!placeStatus && (
          <View style={{ marginTop: spacing.x2 }}>
            <StatusChip
              label={placeStatus.label}
              tone={placeStatus.kind === 'open' ? 'success' : placeStatus.kind === 'closed' ? 'neutral' : 'warning'}
            />
          </View>
        )}
      </View>
      {manual ? (
        <Text
          selectable
          numberOfLines={2}
          style={{
            ...typography.caption,
            color: colors.warningText,
            maxWidth: 94,
            textAlign: 'right',
          }}
        >
          Использовать
        </Text>
      ) : refinement ? (
        <AppIcon name="chevron" color={colors.inkMuted} size={20} />
      ) : !precise ? (
        <Text
          selectable
          numberOfLines={2}
          style={{
            ...typography.caption,
            color: colors.warningText,
            maxWidth: 94,
            textAlign: 'right',
          }}
        >
          Укажите номер дома
        </Text>
      ) : history ? (
        <Text
          selectable
          numberOfLines={2}
          style={{
            ...typography.caption,
            color: colors.inkMuted,
            maxWidth: 92,
            textAlign: 'right',
          }}
        >
          {historyMeta(history)}
        </Text>
      ) : (
        <AppIcon name="chevron" color={colors.inkMuted} size={20} />
      )}
    </Pressable>
  );
}

export function AddressSearchScreen() {
  const [rememberedAddresses, setRememberedAddresses] = useState<Address[]>([]);
  const [savingPoint, setSavingPoint] = useState(false);
  const [savePointError, setSavePointError] = useState<string | null>(null);
  const pointSaveInFlight = useRef(false);
  const mounted = useRef(true);
  const [resolvingHouse, setResolvingHouse] = useState(false);
  const pointInteraction = useRef(false);
  const colors = useThemeColors();
  const { field, initialQuery, destinationIndex, append } = useLocalSearchParams<{
    field?: 'pickup' | 'destination';
    initialQuery?: string | string[];
    destinationIndex?: string;
    append?: string;
  }>();
  const initialQueryValue = Array.isArray(initialQuery) ? initialQuery[0] ?? '' : initialQuery ?? '';
  const [query, setQuery] = useState(initialQueryValue);
  const [edited, setEdited] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<Address | null>(null);
  const [pendingAddress, setPendingAddress] = useState<Address | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<Coordinates | null>(null);
  const [pointMapError, setPointMapError] = useState<string | null>(null);
  const [pointMapCenter, setPointMapCenter] = useState<{
    address: Address;
    coordinates: Coordinates;
  } | null>(null);
  const [remoteResults, setRemoteResults] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const isFocused = useForegroundScreen();
  const lastSearchQuery = useRef('');
  const searchRequestId = useRef(0);
  const searchAbortController = useRef<AbortController | null>(null);
  const inputRef = useRef<TextInput>(null);
  const { token } = useSession();
  useEffect(() => {
    let active = true;
    if (token?.startsWith('demo:')) {
      void readDemoAddressPoints().then(points => {
        if (active) setRememberedAddresses(points);
      }).catch(() => {
        if (active) setSearchError('Не удалось прочитать сохранённые адреса');
      });
    }
    return () => { active = false; };
  }, [token]);
  const addressDirectory = useMemo(() => rememberedAddresses.length
    ? overlayRememberedAddresses(localAddressDirectory, rememberedAddresses)
    : localAddressDirectory, [rememberedAddresses]);
  const { locationError, locationLoading, selectCurrentLocation } = usePassengerPickupLocation();
  const {
    setPickup,
    setDestination,
    setDestinationAt,
    addDestination,
    destinationHistory,
  } = useRideAddresses();

  useFocusEffect(
    useCallback(() => {
      const focusTimer = setTimeout(() => inputRef.current?.focus(), motion.duration.pressIn);
      return () => {
        clearTimeout(focusTimer);
        if (searchAbortController.current) lastSearchQuery.current = '';
        searchAbortController.current?.abort();
      };
    }, []),
  );

  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const localResults = useMemo(() => {
    if (!normalizedQuery) return emptySearchSuggestions;
    return filterRequestedHouse(rankAddressSearchResults(addressDirectory, normalizedQuery), normalizedQuery);
  }, [addressDirectory, normalizedQuery]);
  const matchingHistory = useMemo(
    () =>
      field === 'destination'
        ? destinationHistory.filter((item) => matchesAddress(item.address, normalizedQuery))
        : [],
    [destinationHistory, field, normalizedQuery],
  );
  const historyByKey = useMemo(
    () => new Map(destinationHistory.map((item) => [addressKey(item.address), item])),
    [destinationHistory],
  );
  const demoSession = token?.startsWith('demo:') ?? false;
  const canSearchRemote = query.trim().length >= 2 && !!token;
  const showPersonalSuggestions =
    field === 'destination' && destinationHistory.length > 0 && (!edited || !normalizedQuery);
  const overlaidResults = overlayRememberedAddresses(
    mergeAddresses(localResults, canSearchRemote && edited ? remoteResults : []), rememberedAddresses,
  );
  const baseResults = filterRequestedHouse(normalizedQuery ? rankAddressSearchResults(overlaidResults, normalizedQuery) : overlaidResults, query);
  const queryTokens = searchTokens(query);
  const queryMatchesKnownStreetName = queryTokens.some((token) => knownStreetTokens.has(token));
  const showHouseSuggestions =
    !!selectedStreet || queryHasHouseNumber(query) || queryMatchesKnownStreetName;
  const results = mergeAddresses(
    overlayRememberedAddresses(matchingHistory.map((item) => item.address), rememberedAddresses)
      .filter(address => matchesAddress(address, normalizedQuery)),
    baseResults,
  ).filter(
    (address) =>
      (!selectedStreet || hasHouseNumber(address)) &&
      (Boolean(address.place) || showHouseSuggestions || !hasHouseNumber(address)),
  );
  const hasPlaceResults = results.some((address) => Boolean(address.place));
  const clock = useScreenClock(30_000, hasPlaceResults && !pendingAddress);
  const now = useMemo(() => new Date(clock), [clock]);
  const hasCompleteDestinationResult =
    field === 'destination' && results.some(isDestinationAddressComplete);
  const requestedHouseNumber = extractQueryHouseNumber(query);
  const hasExactHouseResult =
    !!requestedHouseNumber &&
    results.some(
      (address) =>
        extractHouseNumber(address)?.toLocaleLowerCase('ru') ===
        requestedHouseNumber.toLocaleLowerCase('ru'),
    );
  const manualAnchorDirectory = useMemo(
    () =>
      remoteResults.length
        ? mergeAddresses(remoteResults, localAddressDirectory)
        : localAddressDirectory,
    [remoteResults],
  );
  const manualAnchor = useMemo(
    () =>
      selectedStreet ??
      (queryHasHouseNumber(query) && !hasExactHouseResult ? findBestAddressAnchor(query, manualAnchorDirectory) : null) ??
      demoAddresses[0]!,
    [hasExactHouseResult, manualAnchorDirectory, query, selectedStreet],
  );
  const manualAddress = hasExactHouseResult ? null : buildManualAddress(query, manualAnchor);
  const pendingStreet = useMemo(() => {
    if (!pendingAddress) return null;
    if (selectedStreet && addressSearchScore(pendingAddress, selectedStreet.label) > 0) {
      return selectedStreet;
    }
    return toStreetSuggestion(pendingAddress);
  }, [pendingAddress, selectedStreet]);
  const pendingCenter = pointMapCenter?.address === pendingAddress
    ? pointMapCenter.coordinates
    : pendingAddress?.coordinates;

  useEffect(() => {
    if (!pendingAddress) return;
    let active = true;
    const controller = new AbortController();
    // The map is already visible. Refinement may improve its initial point,
    // but must never move it after the passenger pans or picks a point.
    let houseResolved = false;
    void resolveHouseAddress(pendingAddress, { token, signal: controller.signal }).then(address => {
      if (!active || pointInteraction.current || !address) return;
      houseResolved = true;
      setPointMapCenter({ address: pendingAddress, coordinates: address.coordinates });
      setSelectedPoint(address.coordinates);
    }).finally(() => { if (active) setResolvingHouse(false); });
    void (pendingStreet
      ? resolveStreetCenter(pendingStreet, {
          token,
          signal: controller.signal,
        })
      : Promise.resolve(null)
    ).then((coordinates) => {
      if (active && !houseResolved && !pointInteraction.current && coordinates) {
        setPointMapCenter({ address: pendingAddress, coordinates });
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [pendingAddress, pendingStreet, token]);

  const runRemoteSearch = useCallback(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || !token) return;
    lastSearchQuery.current = `${token}:${normalized}`;
    setEdited(true);
    const requestId = ++searchRequestId.current;
    searchAbortController.current?.abort();
    const controller = new AbortController();
    searchAbortController.current = controller;
    setSearching(true);
    const endpoint = demoSession ? '/v1/addresses/preview' : '/v1/addresses/search';
    void apiRequest<Address[]>(
      `${endpoint}?query=${encodeURIComponent(normalized)}`,
      { token: demoSession ? undefined : token, signal: controller.signal, timeoutMs: 5_000 },
    )
      .then((items) => {
        if (requestId !== searchRequestId.current) return;
        setRemoteResults(items);
        setSearchError(items.length ? null : 'Точного совпадения нет');
      })
      .catch((reason: unknown) => {
        if (requestId !== searchRequestId.current) return;
        if (reason instanceof ApiError && reason.code === 'REQUEST_ABORTED') return;
        setRemoteResults([]);
        setSearchError(reason instanceof Error ? reason.message : 'Не удалось найти адрес');
      })
      .finally(() => {
        if (requestId === searchRequestId.current) {
          setSearching(false);
          searchAbortController.current = null;
        }
      });
  }, [demoSession, query, token]);

  useEffect(() => {
    if (!canSearchRemote || !edited || !isFocused || pendingAddress) return;
    const timer = setTimeout(() => {
      if (lastSearchQuery.current !== `${token}:${query.trim()}`) runRemoteSearch();
    }, 300);
    return () => clearTimeout(timer);
  }, [canSearchRemote, edited, isFocused, pendingAddress, query, runRemoteSearch, token]);

  useEffect(
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        searchAbortController.current?.abort();
      };
    },
    [],
  );

  const selectAddress = async (address: Address) => {
    if (searchAbortController.current) lastSearchQuery.current = '';
    searchAbortController.current?.abort();
    if (hasApproximateCoordinates(address) &&
      (hasHouseNumber(address) || address.placeId) &&
      !(field === 'destination' && address.kind === 'settlement')) {
      Keyboard.dismiss();
      setResolvingHouse(true);
      pointInteraction.current = false;
      setPendingAddress(address);
      setPointMapCenter(null);
      setSelectedPoint(null);
      setPointMapError(null);
      setSavePointError(null);
      return;
    }
    setResolvingHouse(false);
    if (
      !hasHouseNumber(address) &&
      !address.placeId &&
      !(field === 'destination' && address.kind === 'settlement')
    ) {
      const street = { ...address, label: address.label.replace(/[,\s]+$/u, '') };
      const refinedQuery = `${street.label}, `;
      searchRequestId.current += 1;
      searchAbortController.current?.abort();
      setSearching(false);
      setSelectedStreet(street);
      setQuery(refinedQuery);
      setEdited(true);
      setRemoteResults([]);
      setSearchError(null);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (typeof inputRef.current?.setNativeProps === 'function') {
          inputRef.current.setNativeProps({
            selection: { start: refinedQuery.length, end: refinedQuery.length },
          });
        }
      });
      return;
    }
    if (field === 'pickup') {
      setPickup(address);
    } else if (append === '1') {
      addDestination(address);
    } else {
      const index = destinationIndex?.trim() ? Number(destinationIndex) : NaN;
      if (Number.isInteger(index) && index >= 0) setDestinationAt(index, address);
      else setDestination(address);
    }
    goBackOrReplace((append === '1' || destinationIndex != null ? '/stops' : '/') as never);
  };

  const saveSelectedPoint = async () => {
    if (!pendingAddress || !selectedPoint || pointSaveInFlight.current) return;
    pointSaveInFlight.current = true;
    setSavingPoint(true);
    setSavePointError(null);
    try {
      const saved = await rememberAddressPoint(pendingAddress, selectedPoint, token);
      if (mounted.current) await selectAddress(saved);
    } catch (error) {
      if (mounted.current) setSavePointError(error instanceof Error ? error.message : 'Не удалось сохранить адрес. Повторите попытку.');
    } finally {
      pointSaveInFlight.current = false;
      if (mounted.current) setSavingPoint(false);
    }
  };

  if (pendingAddress) {
    return (
      <Screen scroll={false} contentStyle={{ maxWidth: 760, paddingVertical: spacing.x3, gap: spacing.x3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <IconButton icon="back" label="Назад к адресам" disabled={savingPoint} onPress={() => setPendingAddress(null)} />
          <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink, flex: 1 }}>
            Укажите точку дома
          </Text>
        </View>
        <ScrollView style={{ flexGrow: 0, maxHeight: '25%' }} contentContainerStyle={{ gap: spacing.x2 }}>
          <Text style={{ ...typography.bodyStrong, color: colors.ink }}>{pendingAddress.label}</Text>
          <Text style={{ ...typography.body, color: colors.inkSecondary }}>
            Двигайте и приближайте карту, затем нажмите на дом или удобный подъезд к нему.
            {!pendingAddress.placeId && ` После подтверждения запомним этот адрес${demoSession ? ' на этом устройстве' : ''}.`}
          </Text>
        </ScrollView>
        <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: radius.lg }}>
          {pendingCenter ? <TaxiMap
            selectionCenter={pendingCenter}
            pickup={selectedPoint ? { ...pendingAddress, coordinates: selectedPoint } : null}
            onSelectionInteraction={() => { pointInteraction.current = true; }}
            onCoordinateSelect={point => {
              pointInteraction.current = true;
              if (!pointSaveInFlight.current) setSelectedPoint(point);
            }}
            onMapError={setPointMapError}
            onMapReady={() => setPointMapError(null)}
          /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x3 }}>
            <ActivityIndicator color={colors.infoText} />
            <Text style={{ ...typography.body, color: colors.inkSecondary }}>Находим улицу на карте…</Text>
          </View>}
        </View>
        {resolvingHouse && <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
          Уточняем дом. Точку на карте уже можно выбрать.
        </Text>}
        {pointMapError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{pointMapError}</Text>}
        {savePointError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{savePointError}</Text>}
        <AppButton disabled={!selectedPoint || Boolean(pointMapError)} loading={savingPoint} onPress={() => { void saveSelectedPoint(); }}>
          {savingPoint ? 'Сохраняем адрес…' : pendingAddress.placeId ? 'Подтвердить точку' : 'Подтвердить и запомнить'}
        </AppButton>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={{ maxWidth: 760, paddingVertical: 0 }}>
      <FlatList
        style={{ flex: 1 }}
        data={showPersonalSuggestions ? [] : results}
        keyExtractor={addressKey}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={false}
        contentContainerStyle={{ paddingVertical: spacing.x5, gap: spacing.x2 }}
        renderItem={({ item: address }) => <AddressResult
          address={address}
          directSelectionAllowed={field === 'destination' && address.kind === 'settlement'}
          history={historyByKey.get(addressKey(address))}
          now={now}
          onPress={() => { void selectAddress(address); }}
        />}
        ListHeaderComponent={<View style={{ gap: spacing.x5, marginBottom: spacing.x3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/')} />
        <View>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            {field === 'pickup' ? 'Место подачи' : 'Куда поедем?'}
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Ищем по Граховскому району и всей России
          </Text>
        </View>
      </View>
      <View
        style={{
          minHeight: 58,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.x3,
          paddingHorizontal: spacing.x4,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <AppIcon name="location" color={colors.inkSecondary} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={(value) => {
            setResolvingHouse(false);
            searchRequestId.current += 1;
            searchAbortController.current?.abort();
            setEdited(true);
            if (
              selectedStreet &&
              !value.toLocaleLowerCase('ru').startsWith(`${selectedStreet.label.toLocaleLowerCase('ru')},`)
            ) {
              setSelectedStreet(null);
            }
            setQuery(value);
            setRemoteResults([]);
            setSearchError(null);
            setSearching(false);
          }}
          placeholder="Адрес, магазин, кафе или место"
          placeholderTextColor={colors.inkMuted}
          underlineColorAndroid={colors.transparent}
          style={{
            ...typography.body,
            color: colors.ink,
            flex: 1,
            minHeight: 56,
            outlineColor: colors.transparent,
            outlineWidth: 0,
          }}
          returnKeyType="search"
          onSubmitEditing={runRemoteSearch}
          accessibilityLabel="Поиск адреса или места"
        />
        {searching ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Найти адрес"
            disabled={!canSearchRemote}
            onPress={runRemoteSearch}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: canSearchRemote ? colors.brand : colors.surfaceSecondary,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <AppIcon name="search" color={canSearchRemote ? colors.brandInk : colors.inkMuted} />
          </AnimatedPressable>
        )}
      </View>
      {field === 'pickup' && (
        <AnimatedPressable
          feedback="subtle"
          accessibilityRole="button"
          accessibilityLabel="Моё местоположение"
          aria-busy={locationLoading}
          aria-disabled={locationLoading}
          disabled={locationLoading}
          onPress={() => {
            void selectCurrentLocation().then((address) => {
              if (address) goBackOrReplace('/');
            });
          }}
          style={({ pressed }) => ({
            minHeight: 58,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            paddingHorizontal: spacing.x4,
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed || locationLoading ? 0.6 : 1,
          })}
        >
          {locationLoading ? (
            <ActivityIndicator color={colors.infoText} />
          ) : (
            <AppIcon name="recenter" color={colors.infoText} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
              {locationLoading ? 'Определяем местоположение…' : 'Моё местоположение'}
            </Text>
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
              Определить автоматически
            </Text>
          </View>
          {!locationLoading && <AppIcon name="chevron" color={colors.inkMuted} size={20} />}
        </AnimatedPressable>
      )}
      {!!locationError && field === 'pickup' && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.warningText }}>
          {locationError}
        </Text>
      )}
      {edited &&
        query.trim().length >= 2 &&
        !queryHasHouseNumber(query) &&
        !hasPlaceResults &&
        !hasCompleteDestinationResult && (
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x2,
            paddingHorizontal: spacing.x1,
          }}
        >
          <AppIcon name="location" size={16} color={colors.warningText} />
          <Text selectable style={{ ...typography.caption, color: colors.warningText, flex: 1 }}>
            {selectedStreet
              ? 'Теперь укажите номер дома'
              : 'Выберите улицу или введите полный адрес с номером дома'}
          </Text>
        </View>
      )}
      {!!searchError && !(searchError === 'Точного совпадения нет' && hasExactHouseResult) && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.warning }}>
          {searchError}.{results.length ? ' Можно выбрать адрес из подсказок.' : ' Полный адрес с номером дома можно использовать вручную.'}
        </Text>
      )}
      {!!manualAddress && (
        <View style={{ gap: spacing.x3 }}>
          <SectionTitle>Ввести вручную</SectionTitle>
          <AddressResult
            address={manualAddress}
            manual
            now={now}
            onPress={() => selectAddress(manualAddress)}
          />
        </View>
      )}
      {showPersonalSuggestions ? (
        <View style={{ gap: spacing.x6 }}>
          <View style={{ gap: spacing.x3 }}>
            <SectionTitle>Ваши адреса</SectionTitle>
            <View style={{ gap: spacing.x2 }}>
              {destinationHistory.slice(0, 5).map((item) => (
                <AddressResult
                  key={addressKey(item.address)}
                  address={item.address}
                  directSelectionAllowed={item.address.kind === 'settlement'}
                  history={item}
                  now={now}
                  onPress={() => selectAddress(item.address)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: spacing.x3 }}>
            <SectionTitle>Рядом в Грахово</SectionTitle>
            <View style={{ gap: spacing.x2 }}>
              {mergeAddresses([], demoAddresses)
                .filter((address) => !historyByKey.has(addressKey(address)))
                .map((address) => (
                  <AddressResult
                    key={address.id}
                    address={address}
                    directSelectionAllowed={address.kind === 'settlement'}
                    now={now}
                    onPress={() => selectAddress(address)}
                  />
                ))}
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing.x3 }}>
          {!!results.length && (
            <SectionTitle>{selectedStreet ? 'Дома на улице' : 'Подсказки'}</SectionTitle>
          )}
        </View>
      )}
      </View>}
      ListFooterComponent={<>
      {!!remoteResults.length && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
          Места из справочника сервиса · адресные данные © участники OpenStreetMap
        </Text>
      )}
      {!remoteResults.length && edited && !!results.length && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
          ГАР/ФИАС · OpenStreetMap · сохранённые точки
        </Text>
      )}
      </>}
      />
    </Screen>
  );
}
