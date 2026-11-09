import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { isDestinationAddressBookable } from '@/domain/address-precision';
import { formatAddressSuggestionLines } from '@/domain/address-suggestion-display';
import type { Address, RideOrder } from '@/domain/models';
import { ridePriceLabel } from '@/domain/ride-price';
import type { DriverRoutePointKind } from '@/domain/route-stops';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';

export function DriverRouteEditor({ visible, onClose, onSave, busy }: {
  visible: boolean;
  onClose: () => void;
  onSave: (kind: DriverRoutePointKind, address: Address) => Promise<RideOrder>;
  busy: boolean;
}) {
  const colors = useThemeColors();
  const { token } = useSession();
  const [kind, setKind] = useState<DriverRoutePointKind | null>(null);
  const [query, setQuery] = useState('');
  const [address, setAddress] = useState<Address | null>(null);
  const [suggestions, setSuggestions] = useState<Address[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RideOrder | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);

  useEffect(() => {
    const text = query.trim();
    if (!visible || !kind || !token || address || text.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const endpoint = token.startsWith('demo:') ? '/v1/addresses/preview' : '/v1/addresses/search';
      const suffix = searchAttempt === 0 ? '&mode=suggest' : '';
      void apiRequest<Address[]>(`${endpoint}?query=${encodeURIComponent(text)}${suffix}`, { token, signal: controller.signal })
        .then(results => { if (!controller.signal.aborted) setSuggestions(results.filter(isDestinationAddressBookable).slice(0, 3)); })
        .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Поиск недоступен'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [visible, kind, token, address, query, searchAttempt]);

  const close = () => {
    if (busy) return;
    setKind(null); setQuery(''); setAddress(null); setSuggestions([]); setSearching(false); setError(null); setSaved(null); setSearchAttempt(0);
    onClose();
  };

  return <AppModal compact visible={visible} title={saved ? 'Маршрут обновлён' :
    kind === 'stop' ? 'Добавить остановку' : kind === 'destination' ? 'Добавить точку назначения' : 'Добавить точку'} onClose={close}>
    {saved ? <>
      <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: colors.ink }}>Стоимость: {ridePriceLabel(saved)}. Пассажир получит уведомление.</Text>
      <AppButton compact onPress={close}>Готово</AppButton>
    </> : !kind ? <>
      <AppButton compact variant="secondary" onPress={() => setKind('stop')}>Добавить остановку</AppButton>
      <AppButton compact variant="secondary" onPress={() => setKind('destination')}>Добавить точку назначения</AppButton>
    </> : <>
      <TextInput value={address?.label ?? query} editable={!busy} autoFocus
        onChangeText={value => {
          setAddress(null); setQuery(value); setSuggestions([]); setError(null); setSearchAttempt(0);
          setSearching(value.trim().length >= 2);
        }}
        placeholder="Улица, дом или населённый пункт" placeholderTextColor={colors.inkMuted} maxLength={180}
        accessibilityLabel="Адрес новой точки" style={{ ...typography.body, color: colors.ink, minHeight: 48,
          borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.x3 }} />
      {!address && suggestions.length > 0 && <View style={{ gap: spacing.x1 }}>
        {suggestions.map((result, index) => {
          const { primary, secondary } = formatAddressSuggestionLines(result);
          return <AppButton key={`${result.id}:${index}`} variant="secondary" compact accessibilityLabel={[primary, secondary].filter(Boolean).join(', ')}
            onPress={() => { setAddress(result); setError(null); }}>{primary}</AppButton>;
        })}
      </View>}
      {!address && searching && <Text accessibilityLiveRegion="polite" style={{ ...typography.caption, color: colors.inkSecondary }}>Ищем адрес…</Text>}
      {!address && !searching && !suggestions.length && !error && query.trim().length >= 2 &&
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Ничего не нашли. Уточните адрес или расширьте поиск.</Text>}
      {!address && !searching && !suggestions.length && query.trim().length >= 2 &&
        <AppButton compact variant="quiet" onPress={() => { setError(null); setSearching(true); setSearchAttempt(value => value + 1); }}>Искать ещё</AppButton>}
      {error && <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.danger }}>{error}</Text>}
      <AppButton compact disabled={!address} loading={busy} onPress={() => {
        if (!address) return;
        setError(null);
        void onSave(kind, address).then(setSaved).catch(reason => setError(reason instanceof Error ? reason.message : 'Не удалось обновить маршрут'));
      }}>Сохранить маршрут</AppButton>
    </>}
  </AppModal>;
}
