import { useRef, useState } from 'react';
import { FlatList, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { PhoneCallButton } from '@/components/ride/phone-call-button';
import { RideChatButton } from '@/components/ride/ride-chat-button';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import type { RideOrder } from '@/domain/models';
import { ridePriceLabel } from '@/domain/ride-price';
import { formatMultiStopRouteAddresses } from '@/domain/route-label';
import { formatScheduledPickup, preorderDepartureMinutes } from '@/domain/scheduled-ride';
import { useScreenClock } from '@/hooks/use-screen-clock';
import { useRide } from '@/state/ride-provider';
import { useThemeColors } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';

export function DriverPreorders({ online, activeTrip }: { online: boolean; activeTrip: boolean }) {
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const { token } = useSession();
  const { driverPreorders, refresh } = useRide();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<RideOrder | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const now = useScreenClock(10_000, Boolean(selected?.driverId));
  const scheduledAt = selected?.scheduledAt;
  const available = selected?.status === 'searching';
  const departureAllowed = !!scheduledAt && Date.parse(scheduledAt) - now <= preorderDepartureMinutes * 60_000;
  const departureHint = !departureAllowed ? `Выезд откроется за ${preorderDepartureMinutes} минут до подачи.`
    : !online ? 'Выйдите на линию, чтобы начать поездку.'
    : activeTrip ? 'Сначала завершите текущую поездку.' : null;
  const route = selected && formatMultiStopRouteAddresses(selected.pickup, selected.destinations ?? [selected.destination]);
  const count = driverPreorders.length;

  const close = () => {
    if (inFlight.current) return;
    setSelected(null);
    setVisible(false);
    setReleasing(false);
    setError(null);
  };
  const back = () => {
    if (releasing) setReleasing(false);
    else setSelected(null);
    setError(null);
  };
  const run = async (action: 'accept' | 'transition' | 'release') => {
    if (!token || !selected || !scheduledAt || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const updated = await apiRequest<RideOrder>(`/v1/driver/orders/${selected.id}/${action}`, {
        method: 'POST', token,
        body: JSON.stringify(action === 'accept' ? { confirmedScheduledAt: scheduledAt }
          : action === 'transition' ? { status: 'driver_arriving' } : { reason: reason.trim() }),
      });
      await refresh();
      setSelected(action === 'accept' ? updated : null);
      setReleasing(false);
      if (action === 'transition') setVisible(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось обновить предзаказ');
      await refresh();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return <>
    <AppButton compact fullWidth={false} variant="secondary" style={{ minHeight: 44, paddingHorizontal: spacing.x2 }} icon={<AppIcon name="clock" size={16} />}
      accessibilityLabel={count ? `Предзаказы · ${count}` : 'Предзаказы'}
      badge={count ? <Text style={{ ...typography.micro, position: 'absolute', top: -4, right: -4, paddingHorizontal: spacing.x1,
        backgroundColor: colors.brand, color: colors.brandInk, borderRadius: radius.pill }}>{count}</Text> : undefined}
      onPress={() => { setVisible(true); void refresh(); }}>
      Предзаказы
    </AppButton>
    <AppModal compact={height < 600} visible={visible}
      title={releasing ? 'Отказаться от предзаказа?' : selected ? available ? 'Подтвердите предзаказ' : 'Предзаказ принят' : 'Предзаказы'} onClose={close}>
      {!selected ? <FlatList
        data={driverPreorders}
        keyExtractor={item => item.id}
        style={{ flexGrow: 0, maxHeight: Math.max(180, height * 0.57) }}
        contentContainerStyle={{ gap: spacing.x2 }}
        ListEmptyComponent={<Text style={{ ...typography.body, color: colors.inkSecondary }}>Пока нет предзаказов.</Text>}
        renderItem={({ item }) => <View style={{ gap: spacing.x2, padding: spacing.x3, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary }}>
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{formatScheduledPickup(item.scheduledAt!)}</Text>
          <Text selectable numberOfLines={2} style={{ ...typography.caption, color: colors.inkSecondary }}>
            {item.pickup.label} → {item.destination.label}
          </Text>
          <AppButton compact variant={item.driverId ? 'secondary' : 'primary'} onPress={() => { setSelected(item); setError(null); }}>
            {`${item.driverId ? 'Открыть принятый' : 'Принять предзаказ'} · ${ridePriceLabel(item)}`}
          </AppButton>
        </View>}
      /> : <View style={{ gap: spacing.x2 }}>
        <Text selectable testID="driver-preorder-confirm-time" style={{ ...typography.sectionTitle, color: colors.danger, textAlign: 'center' }}>
          {formatScheduledPickup(scheduledAt!)}
        </Text>
        {!releasing && <>
          <Text selectable numberOfLines={2} style={{ ...typography.bodyStrong, color: colors.ink }}>Откуда: {route?.pickup}</Text>
          <Text selectable numberOfLines={2} style={{ ...typography.caption, color: colors.inkSecondary }}>Куда: {route?.destinations.join(' → ')}</Text>
          <Text selectable numberOfLines={1} style={{ ...typography.caption, color: colors.inkSecondary }}>
            {ridePriceLabel(selected)}{selected.comment ? ` · ${selected.comment}` : ''}
          </Text>
          {selected.tariff === 'child' && (
            <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Поездка с ребёнком</Text>
          )}
        </>}
        {!!error && <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>{error}</Text>}
        {available ? <AppButton compact loading={pending} onPress={() => void run('accept')}>Подтвердить предзаказ</AppButton> : releasing ? <>
          <TextInput value={reason} onChangeText={setReason} maxLength={500} multiline accessibilityLabel="Причина отказа"
            placeholder="Укажите причину отказа" placeholderTextColor={colors.inkMuted}
            style={{ ...typography.body, color: colors.ink, minHeight: 56, maxHeight: 92, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.x2 }} />
          <AppButton compact variant="danger" loading={pending} disabled={reason.trim().length < 3} onPress={() => void run('release')}>Отказаться от предзаказа</AppButton>
        </> : <>
          <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
            {!!selected.passenger?.phone && <PhoneCallButton phone={selected.passenger.phone} label="Позвонить" compact containerStyle={{ flex: 1 }} />}
            {selected.passenger && <RideChatButton orderId={selected.id} label="Написать" compact style={{ flex: 1 }} />}
          </View>
          {!!departureHint && <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{departureHint}</Text>}
          <AppButton compact loading={pending} disabled={!!departureHint} onPress={() => void run('transition')}>Выехать к пассажиру</AppButton>
          <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
            <AppButton compact fullWidth={false} style={{ flex: 1 }} variant="quiet" disabled={pending} onPress={back}
              accessibilityLabel="К списку предзаказов">К списку</AppButton>
            <AppButton compact fullWidth={false} style={{ flex: 1 }} variant="quiet" disabled={pending}
              onPress={() => { setReason(''); setReleasing(true); }}>Отказаться</AppButton>
          </View>
        </>}
        {(available || releasing) && <AppButton compact variant="quiet" disabled={pending} onPress={back}>
          {releasing ? 'Остаться на заказе' : 'К списку предзаказов'}
        </AppButton>}
      </View>}
    </AppModal>
  </>;
}
