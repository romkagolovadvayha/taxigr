import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest } from '@/api/client';
import { resolveStreetCenter } from '@/api/street-center';
import { resolveHouseAddress } from '@/api/house-address';
import { rememberAddressPoint } from '@/api/remember-address';
import { resolvePickupAddress } from '@/api/pickup-address';
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
import { grahovoAddressCatalog, grahovoAddressSuggestions, grahovoSettlement } from '@/data/grahovo-address-catalog';
import { searchIntercitySettlements } from '@/domain/intercity-search';
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
  isDestinationAddressBookable,
  isDirectoryHouseEstimate,
  queryHasHouseNumber,
} from '@/domain/address-precision';
import { formatAddressSuggestionLines } from '@/domain/address-suggestion-display';
import { addressSuggestionKey, mergeAddressSuggestions, selectUnambiguousAddress } from '@/domain/address-suggestions-selection';
import { toStreetSuggestion } from '@/domain/address-suggestions';
import { buildManualAddress, findBestAddressAnchor } from '@/domain/manual-address';
import { distanceBetweenCoordinates } from '@/domain/navigation';
import { confirmAddressPoint } from '@/domain/route-stops';
import { requestPickupPosition } from '@/location/pickup-position';
import type { Address, Coordinates } from '@/domain/models';
import { getPlaceOpenStatus } from '@/domain/place-directory';
import { isGrahovoDistrictAddress } from '@/domain/pricing';
import { goBackOrReplace } from '@/navigation/back';
import { useRideAddresses } from '@/state/ride-provider';
import { usePassengerPickupLocation } from '@/hooks/use-passenger-pickup-location';
import { useForegroundScreen } from '@/hooks/use-foreground-screen';
import { useScreenClock } from '@/hooks/use-screen-clock';
import { motion, radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

function addressKey(address: Address): string {
  return addressSuggestionKey(address);
}

function matchesAddress(address: Address, normalizedQuery: string): boolean {
  return !normalizedQuery || addressSearchScore(address, normalizedQuery) > 0;
}

function mergeAddresses(primary: Address[], secondary: Address[]): Address[] {
  return mergeAddressSuggestions(primary, secondary);
}

const localAddressDirectory = uniqueAddressesByLabel(grahovoAddressCatalog);
const localStreetDirectory = localAddressDirectory.filter(address => !hasHouseNumber(address));

function searchableAddress(address: Address): Address | null {
  if (address.kind === 'settlement' || isGrahovoDistrictAddress(address)) return address;
  return searchIntercitySettlements(address.label, 1)[0] ?? null;
}

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
  onRefinePoint,
}: {
  address: Address;
  directSelectionAllowed?: boolean;
  history?: DestinationHistoryItem;
  manual?: boolean;
  now: Date;
  onPress: () => void;
  onRefinePoint?: () => void;
}) {
  const colors = useThemeColors();
  const place = address.place;
  const placeStatus = place ? getPlaceOpenStatus(place.schedule, now) : null;
  const displayLines = formatAddressSuggestionLines(address);
  const needsMapPoint = hasHouseNumber(address) && hasApproximateCoordinates(address);
  const precise = hasHouseNumber(address) || Boolean(place) || directSelectionAllowed;
  const refinement = !precise && !history;
  const result = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${address.label}${history ? `, ${historyMeta(history)}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: onRefinePoint ? 1 : undefined,
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
        <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
          {displayLines.primary}
        </Text>
        {!!displayLines.secondary && (
          <Text
            style={{ ...typography.caption, color: colors.inkSecondary }}
          >
            {displayLines.secondary}
          </Text>
        )}
        {needsMapPoint && (
          <Text style={{ ...typography.caption, color: colors.warningText }}>
            {isDirectoryHouseEstimate(address)
              ? address.details?.includes('архивный адрес') ? 'Архивный адрес · приблизительная точка' : 'Приблизительная точка на карте'
              : 'Укажите точку дома на карте'}
          </Text>
        )}
        {address.id.startsWith('saved-') && (
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Точка запомнена</Text>
        )}
        {!!place?.description && (
          <Text style={{ ...typography.caption, color: colors.inkMuted }}>
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
  return onRefinePoint ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
      {result}
      <IconButton icon="location" label={`Уточнить на карте: ${address.label}`} onPress={onRefinePoint} />
    </View>
  ) : result;
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
  const { field, initialQuery, destinationIndex, append, mapEdit } = useLocalSearchParams<{
    field?: 'pickup' | 'destination';
    initialQuery?: string | string[];
    destinationIndex?: string;
    append?: string;
    mapEdit?: string;
  }>();
  const { pickup, destinations, setPickup, setDestination, setDestinationAt, addDestination,
    destinationHistory: storedDestinationHistory } = useRideAddresses();
  const currentAddress = append === '1' ? null : field === 'pickup' ? pickup
    : destinationIndex != null ? destinations[Number(destinationIndex)] : destinations[destinations.length - 1];
  const stopNumber = destinationIndex != null && Number(destinationIndex) < destinations.length - 1
    ? Number(destinationIndex) + 1 : null;
  const pointBadge = field === 'pickup' ? 'А' : stopNumber ?? 'Б';
  const initialPoint = mapEdit === '1' ? currentAddress ?? null : null;
  const initialQueryValue = Array.isArray(initialQuery) ? initialQuery[0] ?? '' : initialQuery ?? '';
  const [query, setQuery] = useState(initialQueryValue);
  const [edited, setEdited] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<Address | null>(null);
  const [pendingAddress, setPendingAddress] = useState<Address | null>(initialPoint);
  const [editingPoint, setEditingPoint] = useState(!!initialPoint);
  const [selectedPoint, setSelectedPoint] = useState<Coordinates | null>(initialPoint?.coordinates ?? null);
  const [pointMapReady, setPointMapReady] = useState(false);
  const [centeringPoint, setCenteringPoint] = useState(false);
  const pointLocationRequest = useRef<AbortController | null>(null);
  const [savedPointAlternative, setSavedPointAlternative] = useState<Address | null>(null);
  const [pointMapError, setPointMapError] = useState<string | null>(null);
  const [pointMapCenter, setPointMapCenter] = useState<{
    address: Address;
    coordinates: Coordinates;
  } | null>(null);
  const [remoteResults, setRemoteResults] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNeedsSubmit, setSearchNeedsSubmit] = useState(false);
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
  const destinationHistory = useMemo(() => storedDestinationHistory.flatMap(item => {
    const address = searchableAddress(item.address);
    return address ? [{ ...item, address }] : [];
  }), [storedDestinationHistory]);

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
    if (!normalizedQuery) return grahovoAddressSuggestions;
    const directory = queryHasHouseNumber(normalizedQuery) ? addressDirectory
      : selectedStreet ? addressDirectory.filter(address => address.label.startsWith(`${selectedStreet.label},`))
        : localStreetDirectory;
    const local = rankAddressSearchResults(directory, normalizedQuery);
    return local.length && (selectedStreet || queryHasHouseNumber(normalizedQuery))
      ? local : mergeAddresses(local, searchIntercitySettlements(normalizedQuery));
  }, [addressDirectory, normalizedQuery, selectedStreet]);
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
  const showHouseSuggestions =
    !!selectedStreet || queryHasHouseNumber(query);
  const results = useMemo(() => {
    const overlaidResults = overlayRememberedAddresses(
      mergeAddresses(localResults, canSearchRemote && edited ? remoteResults : []), rememberedAddresses,
    ).flatMap(address => { const searchable = searchableAddress(address); return searchable ? [searchable] : []; });
    const baseResults = filterRequestedHouse(normalizedQuery ? rankAddressSearchResults(overlaidResults, normalizedQuery) : overlaidResults, query);
    return mergeAddresses(
      overlayRememberedAddresses(matchingHistory.map((item) => item.address), rememberedAddresses)
        .filter(address => matchesAddress(address, normalizedQuery)),
      baseResults,
    ).filter(address => (!selectedStreet || hasHouseNumber(address)) &&
      (Boolean(address.place) || showHouseSuggestions || !hasHouseNumber(address)));
  }, [localResults, canSearchRemote, edited, remoteResults, rememberedAddresses, normalizedQuery, query, matchingHistory, selectedStreet, showHouseSuggestions]);
  const hasPlaceResults = results.some((address) => Boolean(address.place));
  const clock = useScreenClock(30_000, hasPlaceResults && !pendingAddress);
  const now = useMemo(() => new Date(clock), [clock]);
  const hasCompleteDestinationResult =
    field === 'destination' && results.some(isDestinationAddressBookable);
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
      grahovoSettlement,
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
  const usingSavedPoint = !!savedPointAlternative &&
    selectedPoint?.latitude === savedPointAlternative.coordinates.latitude &&
    selectedPoint?.longitude === savedPointAlternative.coordinates.longitude;

  const cancelSearch = useCallback(() => {
    searchRequestId.current += 1;
    searchAbortController.current?.abort();
    searchAbortController.current = null;
    lastSearchQuery.current = '';
    setSearching(false);
    setSearchNeedsSubmit(false);
    setSearchError(null);
    setEdited(false);
  }, []);

  const applyAddress = useCallback((address: Address) => {
    cancelSearch();
    Keyboard.dismiss();
    if (field === 'pickup') setPickup(address);
    else if (append === '1') addDestination(address);
    else {
      const index = destinationIndex?.trim() ? Number(destinationIndex) : NaN;
      if (Number.isInteger(index) && index >= 0) setDestinationAt(index, address);
      else setDestination(address);
    }
    goBackOrReplace((append === '1' || destinationIndex != null ? '/stops' : '/') as never);
  }, [cancelSearch, field, append, destinationIndex, setPickup, addDestination, setDestinationAt, setDestination]);

  useEffect(() => {
    if (!pendingAddress || editingPoint) return;
    let active = true;
    const controller = new AbortController();
    // A verified house needs no second confirmation. Respect a point the
    // passenger has already picked/panned to while the lookup was running.
    let houseResolved = false;
    void resolveHouseAddress(pendingAddress, { token, signal: controller.signal }).then(address => {
      if (!active || pointInteraction.current || !address) return;
      houseResolved = true;
      setPendingAddress(null);
      applyAddress(address);
    }).finally(() => { if (active) setResolvingHouse(false); });
    void (pendingStreet && !isDirectoryHouseEstimate(pendingAddress)
      ? resolveStreetCenter(pendingStreet, {
          token,
          signal: controller.signal,
        })
      : Promise.resolve(null)
    ).then((coordinates) => {
      if (active && !houseResolved && !pointInteraction.current && coordinates) {
        setPointMapCenter({ address: pendingAddress, coordinates });
        setSelectedPoint(coordinates);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [pendingAddress, pendingStreet, token, applyAddress, editingPoint]);

  const runRemoteSearch = useCallback((selectAfterSearch = false) => {
    const normalized = query.trim();
    if (normalized.length < 2 || !token) return;
    if (normalized.length > 180) {
      setSearchError('Сократите запрос до населённого пункта, улицы и номера дома');
      return;
    }
    lastSearchQuery.current = `${token}:${normalized}`;
    setEdited(true);
    const requestId = ++searchRequestId.current;
    searchAbortController.current?.abort();
    const controller = new AbortController();
    searchAbortController.current = controller;
    setSearching(true);
    const endpoint = demoSession ? '/v1/addresses/preview' : '/v1/addresses/search';
    void apiRequest<Address[]>(
      `${endpoint}?query=${encodeURIComponent(normalized)}${selectAfterSearch ? '' : '&mode=suggest'}`,
      { token: demoSession ? undefined : token, signal: controller.signal, timeoutMs: 12_000 },
    )
      .then((items) => {
        if (requestId !== searchRequestId.current) return;
        setRemoteResults(items);
        setSearchError(selectAfterSearch && !items.length && !localResults.length ? 'Точного совпадения нет' : null);
        setSearchNeedsSubmit(!selectAfterSearch && !items.length && !localResults.length);
        if (selectAfterSearch) {
          const candidates = overlayRememberedAddresses(mergeAddresses(localResults, items), rememberedAddresses)
            .flatMap(address => { const candidate = searchableAddress(address); return candidate ? [candidate] : []; });
          const selected = selectUnambiguousAddress(normalized, candidates, field === 'pickup');
          if (selected) applyAddress(selected);
        }
      })
      .catch((reason: unknown) => {
        if (requestId !== searchRequestId.current) return;
        if (reason instanceof ApiError && reason.code === 'REQUEST_ABORTED') return;
        setSearchError(reason instanceof ApiError && reason.code === 'GEOCODER_ERROR'
          ? 'Внешний поиск адресов временно недоступен'
          : reason instanceof Error ? reason.message : 'Не удалось найти адрес');
      })
      .finally(() => {
        if (requestId === searchRequestId.current) {
          setSearching(false);
          searchAbortController.current = null;
        }
      });
  }, [applyAddress, demoSession, field, localResults, query, rememberedAddresses, token]);

  const submitSearch = () => {
    const selected = selectUnambiguousAddress(query, results, field === 'pickup');
    if (selected) applyAddress(selected);
    else runRemoteSearch(true);
  };

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

  const openPointEditor = (address: Address, edit = false) => {
    cancelSearch();
    Keyboard.dismiss();
    setResolvingHouse(!edit);
    setEditingPoint(edit);
    pointInteraction.current = false;
    setPendingAddress(address);
    setSavedPointAlternative(null);
    setPointMapCenter(null);
    setSelectedPoint(edit ? address.coordinates : null);
    setPointMapReady(false);
    setPointMapError(null);
    setSavePointError(null);
  };

  const selectAddress = (address: Address) => {
    if (hasApproximateCoordinates(address) && !isDirectoryHouseEstimate(address) &&
      (hasHouseNumber(address) || address.placeId) &&
      !(field === 'destination' && address.kind === 'settlement')) {
      openPointEditor(address);
      return;
    }
    cancelSearch();
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
    applyAddress(address);
  };

  const saveSelectedPoint = async () => {
    if (!pendingAddress || !selectedPoint || pointSaveInFlight.current) return;
    pointInteraction.current = true;
    if (editingPoint) {
      const distance = distanceBetweenCoordinates(pendingAddress.coordinates, selectedPoint);
      if (distance < 1 && !hasApproximateCoordinates(pendingAddress)) {
        applyAddress(pendingAddress);
        return;
      }
      if (distance > 350) {
        pointSaveInFlight.current = true;
        setSavingPoint(true);
        setSavePointError(null);
        try {
          const resolved = await resolvePickupAddress(selectedPoint, { token });
          if (!mounted.current) return;
          if (!resolved || resolved.label === 'Точка на карте') {
            setSavePointError('Рядом с меткой не найден адрес. Уточните его в поиске.');
            return;
          }
          applyAddress({ ...resolved, details: resolved.details?.replace('Точка определена по геопозиции устройства', 'Точка выбрана на карте') });
        } finally {
          pointSaveInFlight.current = false;
          if (mounted.current) setSavingPoint(false);
        }
        return;
      }
      const address = confirmAddressPoint(pendingAddress, selectedPoint);
      if (pendingAddress.placeId || pendingAddress.id.startsWith('location:')) {
        // A moved point is a waypoint for this order. A catalog ID would make
        // the server snap it back to the original place.
        applyAddress({ ...address, placeId: undefined, kind: 'place', id: address.id.replace('map:', 'location:') });
      } else applyAddress(address);
      return;
    }
    if (savedPointAlternative && usingSavedPoint) {
      applyAddress(savedPointAlternative);
      return;
    }
    pointSaveInFlight.current = true;
    setSavingPoint(true);
    setSavePointError(null);
    try {
      const saved = await rememberAddressPoint(pendingAddress, selectedPoint, token);
      if (mounted.current) await selectAddress(saved);
    } catch (error) {
      if (!mounted.current) return;
      const saved = error instanceof ApiError && ['ADDRESS_POINT_CONFLICT', 'ADDRESS_POINT_KNOWN'].includes(error.code ?? '')
        ? (error.details as { savedAddress?: Address } | undefined)?.savedAddress : undefined;
      if (saved?.coordinates) {
        pointInteraction.current = true;
        setSavedPointAlternative(saved);
        setSelectedPoint(saved.coordinates);
        setPointMapCenter({ address: pendingAddress, coordinates: saved.coordinates });
        setSavePointError('Для этого дома уже есть точка. Проверьте её на карте и подтвердите.');
      } else {
        setSavePointError(error instanceof Error ? error.message : 'Не удалось сохранить адрес. Повторите попытку.');
      }
    } finally {
      pointSaveInFlight.current = false;
      if (mounted.current) setSavingPoint(false);
    }
  };

  useEffect(() => () => pointLocationRequest.current?.abort(), []);

  const centerOnLocation = async () => {
    if (!pendingAddress || pointLocationRequest.current) return;
    const controller = new AbortController();
    pointLocationRequest.current = controller;
    setCenteringPoint(true);
    pointInteraction.current = true;
    setSavePointError(null);
    try {
      const point = await requestPickupPosition(controller.signal);
      if (controller.signal.aborted) return;
      if (typeof point === 'string') {
        setSavePointError('Геопозиция недоступна. Передвиньте карту вручную.');
        return;
      }
      setSelectedPoint(point);
      setPointMapCenter({ address: pendingAddress, coordinates: point });
    } catch {
      if (!controller.signal.aborted) setSavePointError('Не удалось определить геопозицию.');
    } finally {
      if (pointLocationRequest.current === controller) {
        pointLocationRequest.current = null;
        setCenteringPoint(false);
      }
    }
  };

  if (pendingAddress) {
    return (
      <Screen scroll={false} contentStyle={{ maxWidth: 760, paddingVertical: spacing.x3, gap: spacing.x3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <IconButton icon="back" label="Назад к адресам" disabled={savingPoint} onPress={() => {
            pointLocationRequest.current?.abort();
            setPendingAddress(null);
          }} />
          <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink, flex: 1 }}>
            {field === 'pickup' ? 'Точка А · подача' : stopNumber ? `Остановка ${stopNumber}` : 'Точка Б · назначение'}
          </Text>
        </View>
        <View style={{ gap: spacing.x1 }}>
          <Text selectable numberOfLines={2} style={{ ...typography.bodyStrong, color: colors.ink }}>{pendingAddress.label}</Text>
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
            {resolvingHouse ? 'Уточняем адрес. Карту уже можно передвинуть.' : 'Передвиньте карту, чтобы поставить метку в нужном месте.'}
          </Text>
        </View>
        <View style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: radius.lg }}>
          {pendingCenter ? <TaxiMap
            selectionCenter={pendingCenter}
            onSelectionInteraction={() => {
              pointInteraction.current = true;
              pointLocationRequest.current?.abort();
            }}
            onCoordinateSelect={point => {
              pointInteraction.current = true;
              if (!pointSaveInFlight.current) {
                setSelectedPoint(point);
                setSavePointError(null);
              }
            }}
            onMapError={setPointMapError}
            onMapReady={() => {
              setPointMapReady(true);
              setPointMapError(null);
              setSelectedPoint(current => current ?? pendingCenter);
            }}
          /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x3 }}>
            <ActivityIndicator color={colors.infoText} />
            <Text style={{ ...typography.body, color: colors.inkSecondary }}>Находим улицу на карте…</Text>
          </View>}
          {pointMapReady && <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%',
            alignItems: 'center', transform: [{ translateX: -18 }, { translateY: -35 }] }}>
            <Text style={{ ...typography.bodyStrong, textAlign: 'center', textAlignVertical: 'center', width: 36, height: 30,
              paddingTop: Platform.OS === 'web' ? 4 : 0, borderRadius: radius.md, overflow: 'hidden', color: colors.brandInk,
              backgroundColor: colors.brand }}>{pointBadge}</Text>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.surface, borderColor: colors.ink, borderWidth: 2 }} />
          </View>}
          <View style={{ position: 'absolute', bottom: 24, right: 12 }}>
            <IconButton icon="recenter" label="Использовать моё местоположение" disabled={centeringPoint || savingPoint}
              onPress={() => { void centerOnLocation(); }} />
          </View>
        </View>
        {!!(pointMapError || savePointError) && <Text accessibilityRole="alert" numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>{pointMapError ?? savePointError}</Text>}
        <AppButton compact disabled={!pointMapReady || !selectedPoint || Boolean(pointMapError)} loading={savingPoint} onPress={() => { void saveSelectedPoint(); }}>
          {savingPoint ? 'Сохраняем адрес…' : usingSavedPoint ? 'Подтвердить сохранённую точку'
            : editingPoint || pendingAddress.placeId ? 'Подтвердить точку' : 'Подтвердить и запомнить'}
        </AppButton>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
    <Screen scroll={false} contentStyle={{ maxWidth: 760, paddingVertical: spacing.x2, gap: spacing.x2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/')} />
        {!!currentAddress && <IconButton icon="location" label="Изменить точку на карте"
          onPress={() => openPointEditor(currentAddress, true)} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
            {field === 'pickup' ? 'Место подачи' : 'Куда поедем?'}
          </Text>
        </View>
      </View>
      <View
        style={{
          minHeight: 48,
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
            lastSearchQuery.current = '';
            setSearchNeedsSubmit(false);
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
            minHeight: 46,
            outlineColor: colors.transparent,
            outlineWidth: 0,
          }}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
          accessibilityLabel="Поиск адреса или места"
        />
        {searching && !results.length && <ActivityIndicator color={colors.ink} accessibilityLabel="Ищем адрес" />}
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Найти адрес"
            disabled={!canSearchRemote}
            onPress={submitSearch}
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
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={showPersonalSuggestions ? [] : results}
        keyExtractor={addressKey}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={false}
        contentContainerStyle={{ gap: spacing.x2 }}
        renderItem={({ item: address }) => <AddressResult
          address={address}
          directSelectionAllowed={field === 'destination' && address.kind === 'settlement'}
          history={historyByKey.get(addressKey(address))}
          now={now}
          onPress={() => selectAddress(address)}
          onRefinePoint={isDirectoryHouseEstimate(address) ? () => openPointEditor(address) : undefined}
        />}
        ListHeaderComponent={<View style={{ gap: spacing.x2 }}>
      {field === 'pickup' && !query.trim() && (
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
      {searchNeedsSubmit && !results.length && !searching && (
        <AnimatedPressable accessibilityRole="button" onPress={submitSearch} style={{ padding: spacing.x3 }}>
          <Text style={{ ...typography.bodyStrong, color: colors.ink }}>Найти на карте</Text>
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>В подсказках адреса нет. Нажмите, чтобы продолжить поиск.</Text>
        </AnimatedPressable>
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
                  onRefinePoint={isDirectoryHouseEstimate(item.address) ? () => openPointEditor(item.address) : undefined}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: spacing.x3 }}>
            <SectionTitle>Улицы Грахово</SectionTitle>
            <View style={{ gap: spacing.x2 }}>
              {grahovoAddressSuggestions
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
          Места из справочника сервиса · адресные данные © участники OpenStreetMap · GeoNames (CC BY 4.0)
        </Text>
      )}
      {!remoteResults.length && edited && !!results.length && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
          ГАР/ФИАС · OpenStreetMap · GeoNames (CC BY 4.0) · сохранённые точки
        </Text>
      )}
      </>}
      />
    </Screen>
    </KeyboardAvoidingView>
  );
}
