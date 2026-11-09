import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddressFields } from '@/components/passenger/address-fields';
import { BookingSubmitButton } from '@/components/passenger/booking-submit-button';
import { ScheduledPickupControl } from '@/components/passenger/scheduled-pickup-control';
import { ConsentCheckbox } from '@/components/legal/consent-checkbox';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { usePassengerPickupLocation } from '@/hooks/use-passenger-pickup-location';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useRide } from '@/state/ride-provider';
import {
  isDestinationAddressBookable,
  isPickupAddressBookable,
} from '@/domain/address-precision';
import { useSession } from '@/auth/session-provider';
import { getOrderPromotionText } from '@/domain/first-order-discount';
import { currentInitialLegalAcceptance, legalDocuments } from '@/legal/documents';
import { goBackOrReplace } from '@/navigation/back';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

export function OrderConfirmationScreen() {
  const colors = useThemeColors();
  const { height } = useResponsiveLayout();
  const dense = height < 560;
  const gap = dense ? spacing.x1 : spacing.x2;
  const insets = useSafeAreaInsets();
  const {
    pickup,
    destinations,
    destination,
    bookingFare,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    scheduledAt,
    quoteStatus,
    requestQuote,
    createRide,
    busy,
    error,
  } = useRide();
  const { locationError, locationLoading, selectCurrentLocation } = usePassengerPickupLocation();
  const { initialLegalConsentRequired } = useSession();
  const [comment, setComment] = useState('');
  const [promotionVisible, setPromotionVisible] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const promotionText = getOrderPromotionText(bookingFare);
  const addressesAreBookable =
    isPickupAddressBookable(pickup) &&
    destinations.length > 0 &&
    destinations.every(isDestinationAddressBookable);
  const quotePending =
    addressesAreBookable && (quoteStatus === 'idle' || quoteStatus === 'loading');
  const routeReady = addressesAreBookable && quoteStatus === 'ready';
  const canSubmit =
    !!pickup &&
    !!destination &&
    routeReady &&
    !busy;
  const routeGuidance = error ?? (pickup && destination && !addressesAreBookable
    ? 'Уточните место подачи или назначения.'
    : quoteStatus === 'error' ? 'Не удалось рассчитать маршрут. Попробуйте ещё раз.' : locationError);

  const confirm = async () => {
    if (!canSubmit) return;
    if (initialLegalConsentRequired) {
      setConsentVisible(true);
      return;
    }
    const ride = await createRide(comment.trim() || undefined);
    if (ride) router.dismissTo('/');
  };

  const acceptAndConfirm = async () => {
    if (!canSubmit || !legalAccepted) return;
    const ride = await createRide(
      comment.trim() || undefined,
      currentInitialLegalAcceptance(),
    );
    if (!ride) return;
    setConsentVisible(false);
    router.dismissTo('/');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
    >
      <Screen scroll={false} style={{ backgroundColor: colors.surface }} contentStyle={{ maxWidth: 560, paddingHorizontal: spacing.x4, paddingVertical: gap, gap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <IconButton icon="back" size={44} label="Назад к заказу" onPress={() => goBackOrReplace('/')} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
              Подтверждение
            </Text>
          </View>
          {destinations.length < 5 && (
            <IconButton icon="plus" size={44} label="Добавить ещё одну точку назначения"
              onPress={() => router.push({ pathname: '/address-search', params: { field: 'destination', append: '1' } })} />
          )}
        </View>

        <View style={{ gap: spacing.x2 }}>
          <AddressFields
            pickup={pickup}
            destinations={destinations}
            destination={destination}
            compact
            hideAddDestination
            onUseLocation={() => void selectCurrentLocation()}
            locationLoading={locationLoading}
          />
        </View>

        <View style={{ gap }}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Способ оплаты" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x1 }}>
            {([
              ['cash', 'Наличными'],
              ['transfer', 'Переводом'],
            ] as const).map(([method, label]) => {
              const selectedMethod = selectedPaymentMethod === method;
              return (
                <AnimatedPressable
                  key={method}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedMethod }}
                  aria-checked={selectedMethod}
                  onPress={() => setSelectedPaymentMethod(method)}
                  style={{
                    minHeight: 44,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.x3,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: selectedMethod ? colors.ink : colors.border,
                    backgroundColor: selectedMethod ? colors.brandSoft : colors.surface,
                  }}
                >
                  <Text style={{ ...typography.caption, color: colors.ink }}>{label}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="Комментарий водителю"
            placeholder="Комментарий водителю"
            placeholderTextColor={colors.inkMuted}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
            style={{
              ...typography.caption,
              color: colors.ink,
              height: 48,
              textAlignVertical: 'top',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.x3,
              paddingVertical: spacing.x1,
            }}
          />
        </View>

        {!!routeGuidance && (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              gap: spacing.x3,
              padding: spacing.x2,
              borderRadius: radius.md,
              backgroundColor: colors.warningSoft,
            }}
          >
            <Text selectable numberOfLines={dense ? 1 : 2} style={{ ...typography.caption, color: error ? colors.danger : colors.warningText, flex: 1 }}>
              {routeGuidance}
            </Text>
          </View>
        )}

        {routeReady && !scheduledAt && (
          <Text style={{ ...typography.caption, color: colors.inkSecondary }}>Подача около {bookingFare.etaMinutes} мин</Text>
        )}
        {routeReady && !!promotionText && (
          <Text selectable testID="order-promotion-message" numberOfLines={dense ? 1 : 2}
            onPress={() => setPromotionVisible(true)} style={{ ...typography.caption, color: colors.ink }}>{promotionText}</Text>
        )}
        <ScheduledPickupControl disabled={busy} />
      </Screen>
      <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.x4,
        paddingTop: gap, paddingBottom: Math.max(dense ? spacing.x2 : spacing.x4, insets.bottom), backgroundColor: colors.surface }}>
          <BookingSubmitButton
              checkAvailability={false}
              compact={dense}
              priceMinor={bookingFare.priceMinor}
              etaMinutes={bookingFare.etaMinutes}
              label={scheduledAt ? 'Заказать ко времени' : 'Заказать сейчас'}
              loadingLabel={busy ? 'Создаём заказ…' : 'Рассчитываем…'}
              disabled={!addressesAreBookable || quotePending || busy}
              loading={busy || quotePending}
              estimateAvailable={routeReady}
              canRetry={addressesAreBookable && quoteStatus === 'error'}
              onPress={() => {
                if (routeReady) {
                  void confirm();
                  return;
                }
                void requestQuote();
              }}
              accessibilityLabel={
                busy
                  ? 'Создаём заказ'
                  : quotePending
                    ? 'Рассчитываем стоимость и время подачи'
                    : routeReady
                      ? `Подтвердить заказ за ${bookingFare.priceMinor / 100} рублей`
                      : addressesAreBookable
                        ? 'Повторить расчёт стоимости поездки'
                        : 'Подтвердить заказ, сначала укажите маршрут'
              }
          />
      </View>
      <AppModal visible={promotionVisible} title="Скидка на первый заказ" onClose={() => setPromotionVisible(false)}>
        <ScrollView style={{ flexGrow: 0, maxHeight: height * 0.55 }}>
          <Text selectable style={{ ...typography.body, color: colors.ink }}>{promotionText}</Text>
        </ScrollView>
      </AppModal>
      <AppModal
        visible={consentVisible}
        title="Перед первым заказом"
        onClose={() => setConsentVisible(false)}
      >
        <View style={{ gap: spacing.x2 }}>
          <ConsentCheckbox
            checked={legalAccepted}
            onChange={setLegalAccepted}
            compactLinks
            label="Принимаю условия сервиса и даю согласие на обработку данных."
            links={[
              { label: 'Условия', href: legalDocuments.terms.path },
              { label: 'Правила', href: legalDocuments.passengerRules.path },
              { label: 'Согласие', href: legalDocuments.personalDataConsent.path },
              { label: 'Политика', href: legalDocuments.privacy.path },
            ]}
          />
          {!!error && (
            <Text accessibilityRole="alert" numberOfLines={2} style={{ ...typography.caption, color: colors.danger }}>
              {error}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: spacing.x2 }}>
            <AppButton compact fullWidth={false} variant="quiet" style={{ flex: 1 }} disabled={busy}
              onPress={() => setConsentVisible(false)}>Отмена</AppButton>
            <AppButton compact fullWidth={false} style={{ flex: 2 }} disabled={!legalAccepted || !canSubmit} loading={busy}
              accessibilityLabel="Согласен и заказать" onPress={() => void acceptAndConfirm()}>Заказать</AppButton>
          </View>
        </View>
      </AppModal>
    </KeyboardAvoidingView>
  );
}
