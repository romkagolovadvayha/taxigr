import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';

import { AddressFields } from '@/components/passenger/address-fields';
import { TariffSelector } from '@/components/passenger/tariff-selector';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { usePassengerPickupLocation } from '@/hooks/use-passenger-pickup-location';
import { useRide } from '@/state/ride-provider';
import { hasHouseNumber } from '@/domain/address-precision';
import { goBackOrReplace } from '@/navigation/back';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export function OrderConfirmationScreen() {
  const {
    pickup,
    destination,
    tariffs,
    selectedTariff,
    setSelectedTariff,
    quoteStatus,
    createRide,
    busy,
    error,
  } = useRide();
  const { locationLoading, selectCurrentLocation } = usePassengerPickupLocation();
  const [comment, setComment] = useState('');
  const selected = tariffs.find((tariff) => tariff.code === selectedTariff);
  const addressesArePrecise = hasHouseNumber(pickup) && hasHouseNumber(destination);
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
        ? 'Для места подачи и назначения обязательно укажите номер дома.'
        : quoteStatus === 'loading'
          ? 'Рассчитываем маршрут, стоимость и время подачи…'
          : quoteStatus === 'error'
            ? 'Не удалось рассчитать маршрут. Проверьте адреса и попробуйте ещё раз.'
            : null;

  const confirm = async () => {
    if (!canSubmit) return;
    const ride = await createRide(comment.trim() || undefined);
    if (ride) router.replace('/');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentStyle={{ maxWidth: 560, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
          <IconButton icon="back" label="Назад к заказу" onPress={() => goBackOrReplace('/')} />
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
              Подтверждение
            </Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Проверьте детали перед поиском водителя
            </Text>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: spacing.x4,
            borderRadius: radius.card,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <AddressFields
            pickup={pickup}
            destination={destination}
            compact
            onUseLocation={() => void selectCurrentLocation()}
            locationLoading={locationLoading}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: spacing.x3,
            padding: spacing.x3,
            borderRadius: radius.md,
            backgroundColor: colors.brandSoft,
          }}
        >
          <AppIcon name="wallet" size={21} />
          <Text selectable style={{ ...typography.caption, color: colors.ink, flex: 1 }}>
            Оплата наличными или переводом водителю.
          </Text>
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
                loading={quoteStatus === 'loading'}
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

            <AppButton
              disabled={!canSubmit}
              loading={busy}
              onPress={() => void confirm()}
              accessibilityLabel={
                routeReady
                  ? `Подтвердить заказ за ${selected.priceMinor / 100} рублей`
                  : 'Подтвердить заказ, сначала укажите маршрут'
              }
            >
              {routeReady ? `Подтвердить · ${selected.priceMinor / 100} ₽` : 'Укажите маршрут'}
            </AppButton>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
