import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { demoAddresses } from '@/data/demo';
import type { DestinationHistoryItem } from '@/domain/address-history';
import { hasHouseNumber, queryHasHouseNumber } from '@/domain/address-precision';
import { buildStreetSuggestions } from '@/domain/address-suggestions';
import type { Address } from '@/domain/models';
import { useRide } from '@/state/ride-provider';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function addressKey(address: Address): string {
  return `${address.coordinates.latitude.toFixed(5)}:${address.coordinates.longitude.toFixed(5)}:${address.houseNumber?.toLocaleLowerCase('ru') ?? 'street'}`;
}

function matchesAddress(address: Address, normalizedQuery: string): boolean {
  return (
    !normalizedQuery ||
    address.label.toLocaleLowerCase('ru').includes(normalizedQuery) ||
    !!address.details?.toLocaleLowerCase('ru').includes(normalizedQuery)
  );
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
  history,
  onPress,
}: {
  address: Address;
  history?: DestinationHistoryItem;
  onPress: () => void;
}) {
  const precise = hasHouseNumber(address);
  const refinement = !precise && !history;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${address.label}${history ? `, ${historyMeta(history)}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.x4,
        padding: spacing.x4,
        borderRadius: radius.lg,
        backgroundColor: precise || refinement ? colors.surface : colors.warningSoft,
        borderWidth: 1,
        borderColor: precise || refinement ? colors.border : colors.warning,
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
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text selectable numberOfLines={1} style={{ ...typography.bodyStrong, color: colors.ink }}>
          {address.label}
        </Text>
        {!!address.details && (
          <Text
            selectable
            numberOfLines={1}
            style={{ ...typography.caption, color: colors.inkSecondary }}
          >
            {address.details}
          </Text>
        )}
      </View>
      {refinement ? (
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
  const { field, initialQuery } = useLocalSearchParams<{
    field?: 'pickup' | 'destination';
    initialQuery?: string | string[];
  }>();
  const initialQueryValue = Array.isArray(initialQuery) ? initialQuery[0] ?? '' : initialQuery ?? '';
  const [query, setQuery] = useState(initialQueryValue);
  const [edited, setEdited] = useState(false);
  const [selectedStreet, setSelectedStreet] = useState<Address | null>(null);
  const [remoteResults, setRemoteResults] = useState<typeof demoAddresses>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestId = useRef(0);
  const searchAbortController = useRef<AbortController | null>(null);
  const inputRef = useRef<TextInput>(null);
  const { token } = useSession();
  const { setPickup, setDestination, destinationHistory } = useRide();
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const localResults = useMemo(() => {
    return mergeAddresses(buildStreetSuggestions(demoAddresses), demoAddresses).filter((address) =>
      matchesAddress(address, normalizedQuery),
    );
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
  const results = mergeAddresses(
    matchingHistory.map((item) => item.address),
    baseResults,
  ).filter((address) => !selectedStreet || hasHouseNumber(address));

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
    void apiRequest<typeof demoAddresses>(
      `${endpoint}?query=${encodeURIComponent(normalized)}`,
      { token: demoSession ? undefined : token, signal: controller.signal },
    )
      .then((items) => {
        if (requestId !== searchRequestId.current) return;
        setRemoteResults(items);
        setSearchError(items.length ? null : 'Ничего не найдено');
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

  const selectAddress = (address: Address) => {
    if (!hasHouseNumber(address)) {
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
    if (field === 'pickup') setPickup(address);
    else setDestination(address);
    router.back();
  };

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <View>
          <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>
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
          autoFocus
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
          placeholder="Адрес или место"
          placeholderTextColor={colors.inkMuted}
          style={{ ...typography.body, color: colors.ink, flex: 1, minHeight: 56 }}
          returnKeyType="search"
          onSubmitEditing={runRemoteSearch}
          accessibilityLabel="Поиск адреса"
        />
        {searching ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <Pressable
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
          </Pressable>
        )}
      </View>
      {edited && query.trim().length >= 2 && !queryHasHouseNumber(query) && (
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
              : 'Выберите улицу, затем укажите номер дома'}
          </Text>
        </View>
      )}
      {!!searchError && (
        <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.warning }}>
          {searchError}. Можно выбрать адрес из списка ниже.
        </Text>
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
                  history={item}
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
                history={historyByKey.get(addressKey(address))}
                onPress={() => selectAddress(address)}
              />
            ))}
          </View>
        </View>
      )}
      {!!remoteResults.length && (
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
          Адресные данные © участники OpenStreetMap
        </Text>
      )}
    </Screen>
  );
}
