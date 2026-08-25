import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { MoneyValue } from '@/components/ui/money-value';
import type { RideOrder } from '@/domain/models';
import {
  searchPriceIncreaseAvailableAt,
  searchPriceIncreaseOfferSlot,
  searchPriceIncreaseSlotAt,
  SEARCH_PRICE_INCREASE_MINOR,
} from '@/domain/search-price-increase';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useRide } from '@/state/ride-provider';
import { formatMoney } from '@/utils/format';

type Props = {
  ride: RideOrder;
  onConfirm: () => Promise<void>;
  busy?: boolean;
};

function SearchPriceIncreasePrompt({ ride, onConfirm, busy }: Required<Props>) {
  const [now, setNow] = useState(() => Date.now());
  const [dismissedOfferKey, setDismissedOfferKey] = useState<string | null>(null);
  const intervalMinutes = ride.searchPriceIncreaseIntervalMinutes ?? 4;
  const increaseMinor = ride.searchPriceIncreaseStepMinor ?? SEARCH_PRICE_INCREASE_MINOR;
  const [closingOffer, setClosingOffer] = useState<{
    priceMinor: number;
    increaseMinor: number;
  } | null>(null);
  const offerSlot = searchPriceIncreaseOfferSlot(ride, now);
  const offerKey = offerSlot == null ? null : `${ride.id}:${offerSlot}`;

  useEffect(() => {
    if (ride.status !== 'searching' || ride.driverId) return;
    const currentSlot = searchPriceIncreaseSlotAt(
      ride.createdAt,
      now,
      intervalMinutes,
    );
    const availableAt = searchPriceIncreaseAvailableAt(
      ride.createdAt,
      currentSlot,
      intervalMinutes,
    );
    if (availableAt == null) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, availableAt - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [intervalMinutes, now, ride.createdAt, ride.driverId, ride.status]);

  useEffect(() => {
    if (ride.status !== 'searching' || ride.driverId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, [ride.driverId, ride.status]);

  const visible = offerKey != null && dismissedOfferKey !== offerKey;
  // React Native keeps modal children mounted during fade-out. Preserve the offer that the
  // passenger just confirmed so the next price step cannot flash before the modal disappears.
  const displayedOffer = visible || !closingOffer
    ? { priceMinor: ride.priceMinor, increaseMinor }
    : closingOffer;
  const increasedPriceMinor = displayedOffer.priceMinor + displayedOffer.increaseMinor;
  const dismiss = () => {
    if (offerKey) setDismissedOfferKey(offerKey);
  };
  const confirm = () => {
    setClosingOffer({ priceMinor: ride.priceMinor, increaseMinor });
    void onConfirm();
  };

  return (
    <AppModal
      visible={visible}
      title="Водитель пока не найден"
      description={`Повысить стоимость на ${formatMoney(displayedOffer.increaseMinor)}? Новая цена сразу появится у свободных водителей.`}
      onClose={dismiss}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.x3,
          minHeight: 72,
          paddingHorizontal: spacing.x4,
          borderRadius: radius.lg,
          backgroundColor: colors.warningSoft,
        }}
      >
        <MoneyValue valueMinor={displayedOffer.priceMinor} compact color={colors.inkSecondary} />
        <Text selectable style={{ ...typography.bodyStrong, color: colors.warningText }}>
          →
        </Text>
        <MoneyValue valueMinor={increasedPriceMinor} compact color={colors.warningText} />
      </View>
      <AppButton
        loading={busy}
        accessibilityLabel={`Подтвердить повышение стоимости до ${formatMoney(increasedPriceMinor)}`}
        onPress={confirm}
      >
        Повысить до {formatMoney(increasedPriceMinor)}
      </AppButton>
      <AppButton
        variant="quiet"
        disabled={busy}
        onPress={dismiss}
      >
        Оставить текущую цену
      </AppButton>
    </AppModal>
  );
}

export function SearchPriceIncreaseCard(props: Props) {
  return (
    <SearchPriceIncreasePrompt
      key={props.ride.id}
      {...props}
      busy={props.busy ?? false}
    />
  );
}

export function SearchPriceIncreaseModalHost() {
  const { currentRide, confirmSearchPriceIncrease, busy } = useRide();
  if (!currentRide) return null;
  return (
    <SearchPriceIncreaseCard
      ride={currentRide}
      onConfirm={confirmSearchPriceIncrease}
      busy={busy}
    />
  );
}
