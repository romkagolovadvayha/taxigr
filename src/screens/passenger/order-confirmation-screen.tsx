import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddressFields } from '@/components/passenger/address-fields';
import { BookingSubmitButton } from '@/components/passenger/booking-submit-button';
import { ScheduledPickupControl } from '@/components/passenger/scheduled-pickup-control';
import { ConsentCheckbox } from '@/components/legal/consent-checkbox';
import { TariffSelector } from '@/components/passenger/tariff-selector';
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
  const { width } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const {
    pickup,
    destinations,
    destination,
    tariffs,
    selectedTariff,
    setSelectedTariff,
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
  const [commentDraft, setCommentDraft] = useState('');
  const [commentVisible, setCommentVisible] = useState(false);
  const [promotionVisible, setPromotionVisible] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const selected = tariffs.find((tariff) => tariff.code === selectedTariff);
  const promotionText = selected ? getOrderPromotionText(selected) : '';
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
    !!selected &&
    routeReady &&
    !busy;
  const routeGuidance =
    !pickup || !destination
      ? null
      : !addressesAreBookable
        ? 'Для места подачи укажите номер дома. Назначением может быть точный адрес или населённый пункт.'
        : quotePending
          ? 'Рассчитываем маршрут, стоимость и время подачи…'
          : quoteStatus === 'error'
            ? 'Не удалось рассчитать маршрут. Проверьте адреса и попробуйте ещё раз.'
            : null;

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
      <Screen style={{ backgroundColor: colors.surface }} contentStyle={{ maxWidth: 560, paddingHorizontal: spacing.x4, paddingVertical: spacing.x2, gap: spacing.x2 }}>
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
          {!!locationError && (
            <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.warningText }}>
              {locationError}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.x2 }}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Способ оплаты" style={{ flexDirection: 'row', gap: spacing.x1 }}>
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
          <IconButton icon="chat" size={44} label="Комментарий водителю"
            onPress={() => { setCommentDraft(comment); setCommentVisible(true); }} />
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
            <Text selectable style={{ ...typography.caption, color: colors.warningText, flex: 1 }}>
              {routeGuidance}
            </Text>
          </View>
        )}

        {selected && (
          <>
            <View style={{ gap: spacing.x2 }}>
              <TariffSelector
                tariffs={tariffs}
                selected={selectedTariff}
                onSelect={setSelectedTariff}
                compact
                showIllustrations={width >= 360}
                scheduled={!!scheduledAt}
                loading={quotePending}
                estimateAvailable={routeReady}
              />
              {!quotePending && routeReady && !!promotionText && (
                <Text selectable testID="order-promotion-message" numberOfLines={2}
                  onPress={() => setPromotionVisible(true)} style={{ ...typography.caption, color: colors.ink }}>{promotionText}</Text>
              )}
              <ScheduledPickupControl disabled={busy} />
            </View>

            {!!error && (
              <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
                {error}
              </Text>
            )}

          </>
        )}
      </Screen>
      {selected && <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.x4,
        paddingTop: spacing.x2, paddingBottom: Math.max(spacing.x4, insets.bottom), backgroundColor: colors.surface }}>
          <BookingSubmitButton
              checkAvailability={false}
              priceMinor={selected.priceMinor}
              etaMinutes={selected.etaMinutes}
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
                      ? `Подтвердить заказ за ${selected.priceMinor / 100} рублей`
                      : addressesAreBookable
                        ? 'Повторить расчёт стоимости поездки'
                        : 'Подтвердить заказ, сначала укажите маршрут'
              }
          />
      </View>}
      <AppModal visible={commentVisible} title="Комментарий водителю" onClose={() => setCommentVisible(false)}>
        <TextInput value={commentDraft} onChangeText={setCommentDraft} maxLength={500} multiline
          accessibilityLabel="Комментарий водителю" placeholder="Например: вход со стороны магазина"
          placeholderTextColor={colors.inkMuted} style={{ ...typography.body, color: colors.ink, minHeight: 88,
            textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.x3 }} />
        <AppButton compact onPress={() => { setComment(commentDraft); setCommentVisible(false); }}>Сохранить комментарий</AppButton>
      </AppModal>
      <AppModal visible={promotionVisible} title="Скидка на первый заказ" onClose={() => setPromotionVisible(false)}>
        <Text selectable style={{ ...typography.body, color: colors.ink }}>{promotionText}</Text>
      </AppModal>
      <AppModal
        visible={consentVisible}
        title="Перед первым заказом"
        description="Подтвердите условия сервиса и согласие на обработку данных. Повторно спрашивать не будем, пока документы не изменятся."
        onClose={() => setConsentVisible(false)}
      >
        <View style={{ gap: spacing.x3 }}>
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
            <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.danger }}>
              {error}
            </Text>
          )}
          <AppButton
            disabled={!legalAccepted || !canSubmit}
            loading={busy}
            onPress={() => void acceptAndConfirm()}
          >
            Согласен и заказать
          </AppButton>
          <AppButton variant="quiet" onPress={() => setConsentVisible(false)}>
            Отмена
          </AppButton>
        </View>
      </AppModal>
    </KeyboardAvoidingView>
  );
}
