import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { ConsentCheckbox } from '@/components/legal/consent-checkbox';
import { AppButton } from '@/components/ui/app-button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { VehicleColorPicker } from '@/components/vehicle/vehicle-color-picker';
import type { DriverApplication } from '@/domain/models';
import { currentDriverLegalAcceptance, legalDocuments } from '@/legal/documents';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type Form = {
  applicantName: string;
  phone: string;
  licenseNumber: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  vehicleColorHex: string;
  plate: string;
};

const fields: { key: keyof Form; label: string; keyboard?: 'default' | 'phone-pad' | 'number-pad' }[] = [
  { key: 'applicantName', label: 'ФИО' },
  { key: 'phone', label: 'Телефон', keyboard: 'phone-pad' },
  { key: 'licenseNumber', label: 'Номер водительского удостоверения' },
  { key: 'vehicleMake', label: 'Марка автомобиля' },
  { key: 'vehicleModel', label: 'Модель автомобиля' },
  { key: 'vehicleYear', label: 'Год выпуска', keyboard: 'number-pad' },
  { key: 'plate', label: 'Госномер' },
];

export function DriverApplicationScreen() {
  const { token, user, refreshSession } = useSession();
  const [values, setValues] = useState<Form>({
    applicantName: user?.name ?? '',
    phone: user?.phone ?? '',
    licenseNumber: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleColor: '',
    vehicleColorHex: '#777C84',
    plate: '',
  });
  const [childSeat, setChildSeat] = useState(false);
  const [driverTermsAccepted, setDriverTermsAccepted] = useState(false);
  const [driverDataAccepted, setDriverDataAccepted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || token.startsWith('demo:')) return;
    const controller = new AbortController();
    void apiRequest<DriverApplication[]>('/v1/driver-applications/me', {
      token,
      signal: controller.signal,
    })
      .then((applications) => {
        const latest = applications[0];
        if (!latest) return;
        if (latest.status === 'pending') setSubmitted(true);
        if (latest.status === 'approved' && !user?.roles.includes('driver')) void refreshSession();
        if (latest.status === 'rejected') {
          setError(latest.moderationComment || 'Предыдущая заявка отклонена. Проверьте данные и отправьте новую.');
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить статус заявки');
        }
      });
    return () => controller.abort();
  }, [refreshSession, token, user?.roles]);

  const year = Number(values.vehicleYear);
  const valid =
    Object.values(values).every((value) => value.trim().length >= 2) &&
    year >= 1980 &&
    year <= new Date().getFullYear() + 1 &&
    driverTermsAccepted &&
    driverDataAccepted;

  const submit = async () => {
    if (!valid) return;
    if (!token || token.startsWith('demo:')) {
      setSubmitted(true);
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/v1/driver-applications', {
        method: 'POST',
        token,
        body: JSON.stringify({
          ...values,
          vehicleYear: year,
          hasChildSeat: childSeat,
          legalAcceptance: currentDriverLegalAcceptance(),
        }),
      });
      setSubmitted(true);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <Screen contentStyle={{ maxWidth: 760, justifyContent: 'center' }}>
        <StatusChip label="На проверке" tone="warning" />
        <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Заявка отправлена</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Суперадмин проверит данные автомобиля и водительского удостоверения. После одобрения в профиле появится кабинет водителя.
        </Text>
        <AppButton onPress={() => router.replace('/profile')}>Вернуться в профиль</AppButton>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <View>
          <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Стать водителем</Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Проверка обычно занимает до одного рабочего дня</Text>
        </View>
      </View>
      <View style={{ gap: spacing.x3 }}>
        {fields.map(({ key, label, keyboard }) => (
          <View key={key} style={{ gap: spacing.x2 }}>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
            <TextInput
              value={values[key]}
              onChangeText={(value) => setValues((previous) => ({ ...previous, [key]: value }))}
              placeholder={label}
              accessibilityLabel={label}
              autoCapitalize={key === 'plate' ? 'characters' : 'sentences'}
              keyboardType={keyboard}
              placeholderTextColor={colors.inkMuted}
              style={{
                ...typography.body,
                minHeight: 56,
                paddingHorizontal: spacing.x4,
                borderRadius: radius.md,
                backgroundColor: colors.surface,
                color: colors.ink,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>
        ))}
        <VehicleColorPicker
          name={values.vehicleColor}
          hex={values.vehicleColorHex}
          onChange={({ name, hex }) =>
            setValues((previous) => ({
              ...previous,
              vehicleColor: name,
              vehicleColorHex: hex,
            }))
          }
        />
        <View
          style={{
            minHeight: 68,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x4,
            paddingHorizontal: spacing.x4,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>Есть детское кресло</Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>Сможете брать детский тариф</Text>
          </View>
          <Switch
            value={childSeat}
            accessibilityLabel="Есть детское кресло"
            onValueChange={setChildSeat}
            trackColor={{ true: colors.brand }}
          />
        </View>
      </View>
      <View style={{ gap: spacing.x4 }}>
        <ConsentCheckbox
          checked={driverTermsAccepted}
          onChange={setDriverTermsAccepted}
          label="Я подтверждаю достоверность сведений, наличие обязательных документов и принимаю условия работы водителя."
          links={[{ label: legalDocuments.driverTerms.title, href: legalDocuments.driverTerms.path }]}
        />
        <ConsentCheckbox
          checked={driverDataAccepted}
          onChange={setDriverDataAccepted}
          label="Я отдельно согласен на обработку данных заявки, водительского удостоверения и автомобиля."
          links={[
            {
              label: legalDocuments.driverDataConsent.title,
              href: legalDocuments.driverDataConsent.path,
            },
            { label: legalDocuments.privacy.title, href: legalDocuments.privacy.path },
          ]}
        />
      </View>
      <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
        Суперадмин может запросить фото документов при ручной проверке. Не отправляйте их через
        неофициальные каналы.
      </Text>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      <AppButton disabled={!valid} loading={busy} onPress={() => void submit()}>Отправить заявку</AppButton>
    </Screen>
  );
}
