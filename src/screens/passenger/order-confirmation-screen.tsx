import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';

import { AddressFields } from '@/components/passenger/address-fields';
import { BookingSubmitButton } from '@/components/passenger/booking-submit-button';
import { ConsentCheckbox } from '@/components/legal/consent-checkbox';
import { TariffSelector } from '@/components/passenger/tariff-selector';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { AppIcon } from '@/components/ui/app-icon';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { usePassengerPickupLocation } from '@/hooks/use-passenger-pickup-location';
import { useRide } from '@/state/ride-provider';
import {
  isDestinationAddressComplete,
  isPickupAddressComplete,
} from '@/domain/address-precision';
import { useSession } from '@/auth/session-provider';
import { currentInitialLegalAcceptance, legalDocuments } from '@/legal/documents';
import { goBackOrReplace } from '@/navigation/back';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

export function OrderConfirmationScreen() {
  const colors = useThemeColors();
  const {
    pickup,
    destinations,
    destination,
    tariffs,
    selectedTariff,
    setSelectedTariff,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    quoteStatus,
    requestQuote,
    createRide,
    busy,
    error,
  } = useRide();
  const { locationError, locationLoading, selectCurrentLocation } = usePassengerPickupLocation();
  const { initialLegalConsentRequired } = useSession();
  const [comment, setComment] = useState('');
  const [consentVisible, setConsentVisible] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const selected = tariffs.find((tariff) => tariff.code === selectedTariff);
  const addressesArePrecise =
    isPickupAddressComplete(pickup) &&
    destinations.length > 0 &&
    destinations.every(isDestinationAddressComplete);
  const quotePending =
    addressesArePrecise && (quoteStatus === 'idle' || quoteStatus === 'loading');
  const routeReady = addressesArePrecise && quoteStatus === 'ready';
  const canSubmit =
    !!pickup &&
    !!destination &&
    !!selected &&
    routeReady &&
    !busy;
  const routeGuidance =
    !pickup || !destination
      ? null
      : !addressesArePrecise
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
    if (ride) router.replace('/');
  };

  const acceptAndConfirm = async () => {
    if (!canSubmit || !legalAccepted) return;
    const ride = await createRide(
      comment.trim() || undefined,
      currentInitialLegalAcceptance(),
    );
    if (!ride) return;
    setConsentVisible(false);
    router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen style={{ backgroundColor: colors.surface }} contentStyle={{ maxWidth: 560, alignSelf: 'center', paddingHorizontal: spacing.x4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <IconButton icon="back" size={44} label="Назад к заказу" onPress={() => goBackOrReplace('/')} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
              Подтверждение
            </Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Проверьте детали перед поиском водителя
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.x2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}>
            <Text style={{ ...typography.bodyStrong, color: colors.ink, flex: 1 }}>Маршрут</Text>
            <IconButton
              icon="recenter"
              size={44}
              label={locationLoading ? 'Определяем местоположение' : 'Использовать моё местоположение'}
              disabled={locationLoading}
              onPress={() => void selectCurrentLocation()}
            />
            {destinations.length < 5 && (
              <IconButton
                icon="plus"
                size={44}
                label="Добавить ещё одну точку назначения"
                onPress={() => router.push({ pathname: '/address-search', params: { field: 'destination', append: '1' } })}
              />
            )}
          </View>
          <AddressFields
            pickup={pickup}
            destinations={destinations}
            destination={destination}
            compact
            hideAddDestination
            locationLoading={locationLoading}
          />
          {!!locationError && (
            <Text accessibilityRole="alert" style={{ ...typography.caption, color: colors.warningText }}>
              {locationError}
            </Text>
          )}
        </View>

        <View style={{ gap: spacing.x2 }} accessibilityRole="radiogroup">
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            Способ оплаты
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x2 }}>
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
        </View>

        {!!routeGuidance && (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: 'row',
              gap: spacing.x3,
              padding: spacing.x3,
              borderRadius: radius.md,
              backgroundColor: colors.warningSoft,
            }}
          >
            <AppIcon name="location" size={21} color={colors.warningText} />
            <Text selectable style={{ ...typography.caption, color: colors.warningText, flex: 1 }}>
              {routeGuidance}
            </Text>
          </View>
        )}

        {selected && (
          <>
            <View style={{ gap: spacing.x3 }}>
              <TariffSelector
                tariffs={tariffs}
                selected={selectedTariff}
                onSelect={setSelectedTariff}
                compact
                loading={quotePending}
                estimateAvailable={routeReady}
              />
              {selectedTariff === 'child' && (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: spacing.x3,
                    padding: spacing.x3,
                    borderRadius: radius.md,
                    backgroundColor: colors.brandSoft,
                  }}
                >
                  <AppIcon name="child-seat" size={21} />
                  <Text selectable style={{ ...typography.caption, color: colors.ink, flex: 1 }}>
                    Приедет машина с подходящим детским креслом; выбирать его тип не нужно.
                  </Text>
                </View>
              )}
            </View>

            <View style={{ gap: spacing.x2 }}>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                Комментарий водителю
              </Text>
              <TextInput
                value={comment}
                onChangeText={(value) => setComment(value.slice(0, 500))}
                placeholder="Например: вход со стороны магазина"
                placeholderTextColor={colors.inkMuted}
                multiline
                maxLength={500}
                accessibilityLabel="Комментарий водителю"
                style={{
                  ...typography.body,
                  minHeight: 96,
                  paddingHorizontal: spacing.x4,
                  paddingVertical: spacing.x3,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  color: colors.ink,
                  textAlignVertical: 'top',
                }}
              />
              <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
                Необязательно · {comment.length}/500
              </Text>
            </View>

            {!!error && (
              <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
                {error}
              </Text>
            )}

            <BookingSubmitButton
              priceMinor={selected.priceMinor}
              etaMinutes={selected.etaMinutes}
              label="Подтвердить"
              loadingLabel={busy ? 'Создаём заказ…' : 'Рассчитываем…'}
              disabled={!addressesArePrecise || quotePending || busy}
              loading={busy || quotePending}
              estimateAvailable={routeReady}
              canRetry={addressesArePrecise && quoteStatus === 'error'}
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
                      : addressesArePrecise
                        ? 'Повторить расчёт стоимости поездки'
                        : 'Подтвердить заказ, сначала укажите маршрут'
              }
            />
          </>
        )}
      </Screen>
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
