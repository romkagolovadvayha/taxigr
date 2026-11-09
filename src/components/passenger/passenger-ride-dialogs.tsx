import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import type { RideOrder } from '@/domain/models';
import { canTransitionRide, rideCancellationWarning } from '@/domain/ride-state';
import {
  searchPriceIncreaseAvailableAt,
  searchPriceIncreaseChoices,
  searchPriceIncreaseOfferSlot,
  searchPriceIncreaseSlotAt,
} from '@/domain/search-price-increase';
import { useRideFeedback } from '@/feedback/ride-feedback-provider';
import { useRide } from '@/state/ride-provider';
import { spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';
import { formatMoney } from '@/utils/format';

const RideCancellationContext = createContext<(orderId: string) => void>(() => undefined);

export function useRequestRideCancellation() {
  return useContext(RideCancellationContext);
}

export function PassengerRideDialogs({ children }: { children: ReactNode }) {
  const { currentRide } = useRide();
  const [cancellationOrderId, setCancellationOrderId] = useState<string | null>(null);
  return (
    <RideCancellationContext.Provider value={setCancellationOrderId}>
      {children}
      {currentRide && (
        <PassengerRideDialog
          key={currentRide.id}
          ride={currentRide}
          cancelRequested={cancellationOrderId === currentRide.id}
          onCloseCancellation={() => setCancellationOrderId(null)}
        />
      )}
    </RideCancellationContext.Provider>
  );
}

function PassengerRideDialog({ ride, cancelRequested, onCloseCancellation }: {
  ride: RideOrder;
  cancelRequested: boolean;
  onCloseCancellation: () => void;
}) {
  const colors = useThemeColors();
  const { cancelRide, confirmSearchPriceIncrease, busy, error } = useRide();
  const { announceSearchPriceIncrease } = useRideFeedback();
  const [now, setNow] = useState(Date.now);
  const [dismissedOfferKey, setDismissedOfferKey] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState<{ priceMinor: number; increaseMinor: number } | null>(null);
  const searching = ride.status === 'searching' && !ride.driverId;
  const intervalMinutes = ride.searchPriceIncreaseIntervalMinutes ?? 4;
  const offerSlot = searchPriceIncreaseOfferSlot(ride, now);
  const offerKey = offerSlot == null ? null : `${ride.id}:${offerSlot}`;
  const choices = searchPriceIncreaseOfferSlot(ride, now, 'manual') == null
    ? [] : searchPriceIncreaseChoices(ride.priceMinor);
  const showCancellation = cancelRequested && canTransitionRide(ride.status, 'cancelled');
  const showOffer = !cancelRequested && offerKey != null && dismissedOfferKey !== offerKey && choices.length > 0;
  const showChoices = choosing && choices.length > 0;
  const selectedIncrease = choice?.priceMinor === ride.priceMinor && choices.includes(choice.increaseMinor)
    ? choice.increaseMinor : 0;

  useEffect(() => {
    if (!searching) return;
    const currentSlot = searchPriceIncreaseSlotAt(ride.createdAt, now, intervalMinutes);
    const availableAt = searchPriceIncreaseAvailableAt(ride.createdAt, currentSlot, intervalMinutes);
    if (availableAt == null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, availableAt - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [intervalMinutes, now, ride.createdAt, searching]);

  useEffect(() => {
    if (!searching) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, [searching]);

  useEffect(() => {
    if (!showOffer || offerSlot == null) return;
    let stopAnnouncement: (() => void) | undefined;
    const timer = setTimeout(() => { stopAnnouncement = announceSearchPriceIncrease(ride.id, offerSlot); }, 0);
    return () => {
      clearTimeout(timer);
      stopAnnouncement?.();
    };
  }, [announceSearchPriceIncrease, offerSlot, ride.id, showOffer]);

  const close = () => {
    if (offerKey) setDismissedOfferKey(offerKey);
    setChoosing(false);
    setChoice(null);
    if (cancelRequested) onCloseCancellation();
  };
  const select = (increaseMinor: number) => {
    setChoice(increaseMinor ? { priceMinor: ride.priceMinor, increaseMinor } : null);
    setChoosing(false);
  };
  const continueLabel = selectedIncrease > 0
    ? `Повысить до ${formatMoney(ride.priceMinor + selectedIncrease)}`
    : showCancellation ? (searching ? 'Продолжить поиск' : 'Продолжить поездку') : 'Оставить текущую цену';

  return (
    <AppModal
      visible={showCancellation || showOffer}
      compact
      title={showChoices ? 'Выберите сумму' : showCancellation ? 'Отменить заказ?' : 'Водитель пока не найден'}
      onClose={() => {
        if (busy) return;
        if (showChoices) setChoosing(false);
        else close();
      }}
    >
      {showChoices ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="Повышение цены" style={{ gap: spacing.x1 }}>
          {[0, ...choices].map(increase => (
            <AppButton key={increase} compact accessibilityRole="radio" aria-checked={increase === selectedIncrease}
              variant={increase === selectedIncrease ? 'primary' : 'secondary'} onPress={() => select(increase)}>
              {increase ? `+${formatMoney(increase)} · итого ${formatMoney(ride.priceMinor + increase)}` : 'Оставить текущую цену'}
            </AppButton>
          ))}
        </View>
      ) : (
        <>
          <Text style={{ ...typography.body, color: colors.inkSecondary }}>
            {showCancellation ? rideCancellationWarning(searching) : 'Подождите ещё немного. Возможно, водители заняты.'}
          </Text>
          {choices.length > 0 && (
            <View style={{ gap: spacing.x1 }}>
              <Text style={{ ...typography.caption, color: colors.inkSecondary }}>
                {`Текущая цена ${formatMoney(ride.priceMinor)}. Можно повысить, чтобы ускорить поиск.`}
              </Text>
              <AppButton compact variant="secondary" accessibilityLabel="Выбрать повышение цены"
                accessibilityState={{ expanded: false }} disabled={busy} onPress={() => setChoosing(true)}>
                {selectedIncrease ? `+${formatMoney(selectedIncrease)} ▾` : 'Оставить текущую цену ▾'}
              </AppButton>
            </View>
          )}
          {!!error && <Text accessibilityRole="alert" selectable numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>{error}</Text>}
          <AppButton compact disabled={busy} onPress={async () => {
            if (!selectedIncrease || await confirmSearchPriceIncrease(ride.priceMinor, selectedIncrease)) close();
          }}>
            {continueLabel}
          </AppButton>
          {showCancellation && (
            <AppButton compact variant="danger" disabled={busy} onPress={async () => {
              if (await cancelRide()) close();
            }}>
              Да, отменить заказ
            </AppButton>
          )}
        </>
      )}
    </AppModal>
  );
}
