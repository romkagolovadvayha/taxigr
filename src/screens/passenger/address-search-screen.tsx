import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { demoAddresses } from '@/data/demo';
import { grahovoDirectoryAddresses } from '@/data/grahovo-address-directory';
import type { DestinationHistoryItem } from '@/domain/address-history';
import {
  addressSearchScore,
  rankAddressSearchResults,
  uniqueAddressesByLabel,
} from '@/domain/address-search';
import {
  extractHouseNumber,
  extractQueryHouseNumber,
  hasHouseNumber,
  isDestinationAddressComplete,
  queryHasHouseNumber,
} from '@/domain/address-precision';
import { formatAddressSuggestionLines } from '@/domain/address-suggestion-display';
import { buildStreetSuggestions } from '@/domain/address-suggestions';
import { buildManualAddress, findBestAddressAnchor } from '@/domain/manual-address';
import type { Address } from '@/domain/models';
import { getPlaceOpenStatus } from '@/domain/place-directory';
import { goBackOrReplace } from '@/navigation/back';
import { useRide } from '@/state/ride-provider';
import { colors, motion, radius, spacing, typography } from '@/theme/tokens';

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
  ...grahovoDirectoryAddresses,
  ...buildStreetSuggestions(grahovoDirectoryAddresses),
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
    const streetPart = address.label.split(',').at(-1) ?? address.label;
    for (const token of searchTokens(streetPart)) {
      if (!['ул', 'улица', 'пер', 'переулок'].includes(token)) result.add(token);
    }
  }
  return result;
}

const knownStreetTokens = collectKnownStreetTokens(localAddressDirectory);

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
  const place = address.place;
  const placeStatus = place ? getPlaceOpenStatus(place.schedule, now) : null;
  const displayLines = formatAddressSuggestionLines(address);
  const precise = hasHouseNumber(address) || Boolean(place) || directSelectionAllowed;
  const refinement = !precise && !history;
  return (
    <AnimatedPressable
      feedback="subtle"
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
    </AnimatedPressable>
  );
}

export function AddressSearchScreen() {
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
  const [remoteResults, setRemoteResults] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const searchRequestId = useRef(0);
  const searchAbortController = useRef<AbortController | null>(null);
  const inputRef = useRef<TextInput>(null);
  const { token } = useSession();
  const {
    setPickup,
    setDestination,
    setDestinationAt,
    addDestination,
    destinationHistory,
  } = useRide();

  useFocusEffect(
    useCallback(() => {
      const focusTimer = setTimeout(() => inputRef.current?.focus(), motion.duration.pressIn);
      return () => clearTimeout(focusTimer);
    }, []),
  );

  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const localResults = useMemo(() => {
    if (!normalizedQuery) return mergeAddresses(buildStreetSuggestions(demoAddresses), demoAddresses);
    return rankAddressSearchResults(localAddressDirectory, normalizedQuery);
  }, [normalizedQuery]);
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
  const baseResults = canSearchRemote && edited && remoteResults.length ? remoteResults : localResults;
  const queryTokens = searchTokens(query);
  const queryMatchesKnownStreetName = queryTokens.some((token) => knownStreetTokens.has(token));
  const showHouseSuggestions =
    !!selectedStreet || queryHasHouseNumber(query) || queryMatchesKnownStreetName;
  const results = mergeAddresses(
    matchingHistory.map((item) => item.address),
    baseResults,
  ).filter(
    (address) =>
      (!selectedStreet || hasHouseNumber(address)) &&
      (Boolean(address.place) || showHouseSuggestions || !hasHouseNumber(address)),
  );
  const hasPlaceResults = results.some((address) => Boolean(address.place));
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
      findBestAddressAnchor(query, manualAnchorDirectory) ??
      demoAddresses[0]!,
    [manualAnchorDirectory, query, selectedStreet],
  );
  const manualAddress = hasExactHouseResult ? null : buildManualAddress(query, manualAnchor);

  const runRemoteSearch = useCallback(() => {
    const normalized = query.trim();
    if (normalized.length < 2 || !token) return;
    setEdited(true);
    const requestId = ++searchRequestId.current;
    searchAbortController.current?.abort();
    const controller = new AbortController();
    searchAbortController.current = controller;
    setSearching(true);
    const endpoint = demoSession ? '/v1/addresses/preview' : '/v1/addresses/search';
    void apiRequest<Address[]>(
      `${endpoint}?query=${encodeURIComponent(normalized)}`,
      { token: demoSession ? undefined : token, signal: controller.signal },
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
    if (!canSearchRemote || !edited) return;
    const timer = setTimeout(runRemoteSearch, 300);
    return () => clearTimeout(timer);
  }, [canSearchRemote, edited, runRemoteSearch]);

  useEffect(
    () => () => {
      searchAbortController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const selectAddress = (address: Address) => {
    if (
      !hasHouseNumber(address) &&
      !address.placeId &&
      !(field === 'destination' && address.kind === 'settlement')
    ) {
      const street = { ...address, label: address.label.replace(/[,\s]+$/u, '') };
      const refinedQuery = `${street.label}, `;
      searchAbortController.current?.abort();
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
      const index = Number(destinationIndex);
      if (Number.isInteger(index) && index >= 0) setDestinationAt(index, address);
      else setDestination(address);
    }
    goBackOrReplace((append === '1' || destinationIndex != null ? '/stops' : '/') as never);
  };

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
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
            <AppIcon name="search" color={canSearchRemote ? colors.ink : colors.inkMuted} />
          </AnimatedPressable>
        )}
      </View>
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
      {!!searchError && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.warning }}>
          {searchError}. Полный адрес с номером дома можно использовать вручную.
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
          <View style={{ gap: spacing.x2 }}>
            {results.map((address) => (
              <AddressResult
                key={addressKey(address)}
                address={address}
                directSelectionAllowed={field === 'destination' && address.kind === 'settlement'}
                history={historyByKey.get(addressKey(address))}
                now={now}
                onPress={() => selectAddress(address)}
              />
            ))}
          </View>
        </View>
      )}
      {!!remoteResults.length && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
          Места из справочника сервиса · адресные данные © участники OpenStreetMap
        </Text>
      )}
      {!remoteResults.length && edited && !!results.length && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
          Адресный справочник ГАР/ФИАС · координаты OpenStreetMap
        </Text>
      )}
    </Screen>
  );
}
