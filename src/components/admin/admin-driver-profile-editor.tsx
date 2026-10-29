import { Column, Host, Switch } from '@expo/ui';
import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { apiRequest } from '@/api/client';
import { AppButton } from '@/components/ui/app-button';
import { VehicleColorPicker } from '@/components/vehicle/vehicle-color-picker';
import type { AdminDriverDetail, AdminDriverProfileUpdate, VehicleDetails } from '@/domain/models';
import { useAppTheme } from '@/theme/theme-provider';
import { radius, spacing, typography } from '@/theme/tokens';
import { russianPhoneE164 } from '@/utils/phone';

function formFrom(detail: AdminDriverDetail) {
  return {
    name: detail.user.name, phone: detail.user.phone ?? '', licenseNumber: detail.driver.licenseNumber ?? '',
    make: detail.driver.vehicle?.make ?? '', model: detail.driver.vehicle?.model ?? '',
    year: detail.driver.vehicle ? String(detail.driver.vehicle.year) : '',
    color: detail.driver.vehicle?.color ?? '', colorHex: detail.driver.vehicle?.colorHex ?? '#777C84',
    plate: detail.driver.vehicle?.plate ?? '',
    hasChildSeat: detail.driver.hasChildSeat, hasSezPass: detail.driver.hasSezPass,
  };
}

export function AdminDriverProfileEditor({ detail, token, demo, disabled, onSaved }: {
  detail: AdminDriverDetail;
  token?: string | null;
  demo: boolean;
  disabled?: boolean;
  onSaved: (input: AdminDriverProfileUpdate) => Promise<void>;
}) {
  const { colors, colorScheme } = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => formFrom(detail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const phone = russianPhoneE164(form.phone);
  const hasVehicle = [form.make, form.model, form.year, form.color, form.plate].some(value => value.trim());
  const vehicle: VehicleDetails | undefined = hasVehicle ? {
    make: form.make.trim(), model: form.model.trim(), year: Number(form.year),
    color: form.color.trim(), colorHex: form.colorHex.toUpperCase(), plate: form.plate.trim().toUpperCase(),
  } : undefined;
  const valid = form.name.trim().length >= 2 &&
    ((!form.phone.trim() && !detail.user.phone) || (!!phone && form.phone.replace(/\D/gu, '').length <= 11)) &&
    (!form.licenseNumber.trim() || form.licenseNumber.trim().length >= 4) &&
    (!vehicle || (vehicle.make.length >= 2 && vehicle.model.length >= 1 && vehicle.color.length >= 2 &&
      vehicle.plate.length >= 5 && Number.isInteger(vehicle.year) && vehicle.year >= 1980 && vehicle.year <= new Date().getFullYear() + 1));

  const input: AdminDriverProfileUpdate = {};
  if (form.name.trim() !== detail.user.name) input.name = form.name.trim();
  if (phone && phone !== detail.user.phone) input.phone = phone;
  if ((form.licenseNumber.trim() || null) !== detail.driver.licenseNumber) input.licenseNumber = form.licenseNumber.trim() || null;
  if (form.hasChildSeat !== detail.driver.hasChildSeat) input.hasChildSeat = form.hasChildSeat;
  if (form.hasSezPass !== detail.driver.hasSezPass) input.hasSezPass = form.hasSezPass;
  if (vehicle && (!detail.driver.vehicle || Object.entries(vehicle).some(([key, value]) =>
    detail.driver.vehicle?.[key as keyof VehicleDetails] !== value))) input.vehicle = vehicle;

  const save = async () => {
    if (!valid || submitting.current || !Object.keys(input).length || (!demo && !token)) return;
    submitting.current = true;
    setBusy(true); setError(null);
    try {
      if (!demo) await apiRequest(`/v1/admin/drivers/${detail.driver.id}/profile`, {
        method: 'PATCH', token: token ?? undefined, body: JSON.stringify(input),
      });
      await onSaved(input);
      setEditing(false); setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить данные водителя');
    } finally { submitting.current = false; setBusy(false); }
  };

  const fields = [
    ['name', 'ФИО', 'default', 160], ['phone', 'Телефон', 'phone-pad', 32],
    ['licenseNumber', 'Водительское удостоверение', 'default', 64],
    ['make', 'Марка автомобиля', 'default', 80], ['model', 'Модель автомобиля', 'default', 80],
    ['year', 'Год выпуска', 'number-pad', 4], ['plate', 'Госномер', 'default', 24],
  ] as const;

  return <View style={{ gap: spacing.x3 }}>
    {!editing ? <>
      {saved && <Text accessibilityLiveRegion="polite" role="status" style={{ ...typography.caption, color: colors.inkSecondary }}>Данные водителя сохранены</Text>}
      <AppButton variant="secondary" disabled={disabled} onPress={() => {
        setForm(formFrom(detail)); setError(null); setSaved(false); setEditing(true);
      }}>Изменить данные водителя</AppButton>
    </> : <>
      <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>Редактирование водителя</Text>
      {fields.map(([key, label, keyboardType, maxLength]) => <View key={key} style={{ gap: spacing.x1 }}>
        <Text style={{ ...typography.caption, color: colors.inkSecondary }}>{label}</Text>
        <TextInput value={form[key]} onChangeText={value => setForm(previous => ({...previous, [key]: value}))}
          accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.inkMuted}
          keyboardType={keyboardType} maxLength={maxLength} editable={!busy} autoCapitalize={key === 'plate' ? 'characters' : 'words'}
          style={{ ...typography.body, color: colors.ink, borderColor: colors.border, borderWidth: 1,
            backgroundColor: colors.canvas, borderRadius: radius.md, minHeight: 52, paddingHorizontal: spacing.x3 }} />
      </View>)}
      <VehicleColorPicker name={form.color} hex={form.colorHex} onChange={({name, hex}) => {
        if (!busy) setForm(previous => ({...previous, color: name, colorHex: hex}));
      }} />
      <Host colorScheme={colorScheme} seedColor={colors.brand} matchContents={{vertical: true}} style={{width: '100%'}}>
        <Column spacing={spacing.x3}>
        <Switch label="Есть детское кресло" value={form.hasChildSeat} disabled={busy}
          onValueChange={value => setForm(previous => ({...previous, hasChildSeat: value}))} />
        <Switch label="Есть пропуск в ОЭЗ" value={form.hasSezPass} disabled={busy}
          onValueChange={value => setForm(previous => ({...previous, hasSezPass: value}))} />
        </Column>
      </Host>
      {input.phone && <Text style={{...typography.caption, color: colors.inkSecondary}}>После смены телефона новый номер потребуется подтвердить.</Text>}
      {error && <Text accessibilityRole="alert" style={{color: colors.danger}}>{error}</Text>}
      <AppButton loading={busy} disabled={disabled || !valid || !Object.keys(input).length} onPress={() => void save()}>Сохранить данные водителя</AppButton>
      <AppButton variant="quiet" disabled={busy} onPress={() => {setEditing(false); setError(null);}}>Отмена</AppButton>
    </>}
  </View>;
}
