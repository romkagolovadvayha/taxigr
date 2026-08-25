import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AppButton } from '@/components/ui/app-button';
import { AccessibleSwitch } from '@/components/ui/accessible-switch';
import { AppIcon } from '@/components/ui/app-icon';
import { Screen } from '@/components/ui/screen';
import { StatusChip } from '@/components/ui/status-chip';
import { SurfaceCard } from '@/components/ui/surface-card';
import { VehicleColorPicker } from '@/components/vehicle/vehicle-color-picker';
import { VehicleIllustration } from '@/components/vehicle/vehicle-illustration';
import { demoDriver } from '@/data/demo';
import type { VehicleChangeRequest } from '@/domain/models';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type DriverProfile = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  rating: number;
  hasChildSeat: boolean;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  colorHex: string | null;
  plate: string | null;
};

type VehicleForm = {
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  vehicleColorHex: string;
  plate: string;
  hasChildSeat: boolean;
};

const demoProfile: DriverProfile = {
  id: demoDriver.id,
  name: demoDriver.name,
  phone: demoDriver.phone,
  status: 'online',
  rating: demoDriver.rating,
  hasChildSeat: true,
  make: demoDriver.vehicle.make,
  model: demoDriver.vehicle.model,
  year: 2021,
  color: demoDriver.vehicle.color,
  colorHex: demoDriver.vehicle.colorHex,
  plate: demoDriver.vehicle.plate,
};

function formFromProfile(profile: DriverProfile): VehicleForm {
  return {
    vehicleMake: profile.make ?? '',
    vehicleModel: profile.model ?? '',
    vehicleYear: profile.year ? String(profile.year) : '',
    vehicleColor: profile.color ?? '',
    vehicleColorHex: profile.colorHex ?? '#777C84',
    plate: profile.plate ?? '',
    hasChildSeat: profile.hasChildSeat,
  };
}

export function DriverProfileScreen() {
  const { token, signOut } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [profile, setProfile] = useState<DriverProfile>(demoProfile);
  const [requests, setRequests] = useState<VehicleChangeRequest[]>([]);
  const [form, setForm] = useState<VehicleForm>(() => formFromProfile(demoProfile));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || demo) return;
    try {
      const [nextProfile, nextRequests] = await Promise.all([
        apiRequest<DriverProfile>('/v1/driver/profile', { token }),
        apiRequest<VehicleChangeRequest[]>('/v1/driver/vehicle-change-requests/me', { token }),
      ]);
      setProfile(nextProfile);
      setForm(formFromProfile(nextProfile));
      setRequests(nextRequests);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить профиль');
    }
  }, [demo, token]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const pendingRequest = useMemo(
    () => requests.find((request) => request.status === 'pending'),
    [requests],
  );
  const latestRejected = useMemo(
    () => requests.find((request) => request.status === 'rejected'),
    [requests],
  );
  const year = Number(form.vehicleYear);
  const valid =
    form.vehicleMake.trim().length >= 2 &&
    form.vehicleModel.trim().length >= 1 &&
    form.vehicleColor.trim().length >= 2 &&
    form.plate.trim().length >= 5 &&
    year >= 1980 &&
    year <= new Date().getFullYear() + 1;

  const submitChange = async () => {
    if (!valid || pendingRequest) return;
    setBusy(true);
    try {
      const payload = {
        ...form,
        vehicleYear: year,
        plate: form.plate.toUpperCase(),
      };
      if (demo || !token) {
        const request: VehicleChangeRequest = {
          id: `demo-change-${Date.now()}`,
          driverId: profile.id,
          currentVehicle: {
            make: profile.make ?? '',
            model: profile.model ?? '',
            year: profile.year ?? year,
            color: profile.color ?? '',
            colorHex: profile.colorHex ?? '#777C84',
            plate: profile.plate ?? '',
          },
          proposedVehicle: {
            make: payload.vehicleMake,
            model: payload.vehicleModel,
            year: payload.vehicleYear,
            color: payload.vehicleColor,
            colorHex: payload.vehicleColorHex,
            plate: payload.plate,
          },
          currentHasChildSeat: profile.hasChildSeat,
          hasChildSeat: payload.hasChildSeat,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        setRequests((current) => [request, ...current]);
      } else {
        const request = await apiRequest<VehicleChangeRequest>(
          '/v1/driver/vehicle-change-requests',
          {
            method: 'POST',
            token,
            body: JSON.stringify(payload),
          },
        );
        setRequests((current) => [request, ...current]);
      }
      setEditing(false);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить изменения');
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: 'vehicleMake' | 'vehicleModel' | 'vehicleYear' | 'plate',
    label: string,
    keyboardType: 'default' | 'number-pad' = 'default',
  ) => (
    <View style={{ flexGrow: 1, flexBasis: key === 'vehicleYear' || key === 'plate' ? 160 : 260, gap: spacing.x2 }}>
      <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
        {label}
      </Text>
      <TextInput
        value={form[key]}
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors.inkMuted}
        keyboardType={keyboardType}
        autoCapitalize={key === 'plate' ? 'characters' : 'sentences'}
        onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
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
  );

  return (
    <Screen contentStyle={{ maxWidth: 760 }}>
      <View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Водитель</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Документы, автомобиль и доступ к заказам
        </Text>
      </View>
      {!!error && (
        <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
      <SurfaceCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x4 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.lg,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name="profile" size={32} color={colors.brandInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
              {profile.name}
            </Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              {profile.phone} · рейтинг ★ {Number(profile.rating).toFixed(2)}
            </Text>
          </View>
          <StatusChip
            label={profile.status === 'suspended' ? 'Доступ приостановлен' : 'Допущен'}
            tone={profile.status === 'suspended' ? 'danger' : 'success'}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x4, flexWrap: 'wrap' }}>
          <VehicleIllustration colorHex={profile.colorHex} width={84} height={44} framed />
          <View style={{ flex: 1, minWidth: 190, gap: spacing.x1 }}>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
              Автомобиль
            </Text>
            <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
              {[profile.color, profile.make, profile.model].filter(Boolean).join(' ')}
            </Text>
            <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
              {[profile.year, profile.plate].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        <StatusChip
          label={profile.hasChildSeat ? 'Детское кресло подтверждено' : 'Детский тариф недоступен'}
          tone={profile.hasChildSeat ? 'info' : 'neutral'}
        />
        {!pendingRequest && (
          <AppButton
            variant={editing ? 'quiet' : 'secondary'}
            onPress={() => {
              setForm(formFromProfile(profile));
              setEditing((current) => !current);
            }}
          >
            {editing ? 'Отменить изменение' : 'Изменить данные автомобиля'}
          </AppButton>
        )}
      </SurfaceCard>

      {pendingRequest && (
        <SurfaceCard style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 }}>
            <StatusChip label="На проверке" tone="warning" />
            <Text selectable style={{ ...typography.micro, color: colors.warningText }}>
              Текущая машина остаётся активной
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 180, gap: spacing.x1, opacity: 0.72 }}>
              <Text selectable style={{ ...typography.micro, color: colors.warningText }}>СЕЙЧАС</Text>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                {pendingRequest.currentVehicle.make} {pendingRequest.currentVehicle.model}
              </Text>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                {pendingRequest.currentVehicle.color} · {pendingRequest.currentVehicle.plate}
              </Text>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                {pendingRequest.currentHasChildSeat ? 'С детским креслом' : 'Без детского кресла'}
              </Text>
            </View>
            <AppIcon name="chevron" color={colors.warningText} />
            <View style={{ flex: 1, minWidth: 180, gap: spacing.x1 }}>
              <Text selectable style={{ ...typography.micro, color: colors.warningText }}>
                ПОСЛЕ ОДОБРЕНИЯ
              </Text>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                {pendingRequest.proposedVehicle.make} {pendingRequest.proposedVehicle.model}
              </Text>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                {pendingRequest.proposedVehicle.color} · {pendingRequest.proposedVehicle.plate}
              </Text>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                {pendingRequest.hasChildSeat ? 'С детским креслом' : 'Без детского кресла'}
              </Text>
            </View>
          </View>
        </SurfaceCard>
      )}

      {editing && !pendingRequest && (
        <SurfaceCard>
          <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
            Новые данные
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
            {field('vehicleMake', 'Марка')}
            {field('vehicleModel', 'Модель')}
            {field('vehicleYear', 'Год выпуска', 'number-pad')}
            {field('plate', 'Госномер')}
          </View>
          <VehicleColorPicker
            name={form.vehicleColor}
            hex={form.vehicleColorHex}
            onChange={({ name, hex }) =>
              setForm((current) => ({
                ...current,
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
              backgroundColor: colors.surfaceSecondary,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                Детское кресло
              </Text>
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                После проверки станет доступен детский тариф
              </Text>
            </View>
            <AccessibleSwitch
              value={form.hasChildSeat}
              accessibilityLabel="Есть детское кресло"
              onValueChange={(value) => setForm((current) => ({ ...current, hasChildSeat: value }))}
              trackColor={{ false: colors.surfaceSecondary, true: colors.brand }}
            />
          </View>
          {!!latestRejected?.moderationComment && (
            <Text selectable style={{ ...typography.caption, color: colors.dangerText }}>
              Прошлая заявка: {latestRejected.moderationComment}
            </Text>
          )}
          <AppButton disabled={!valid} loading={busy} onPress={() => void submitChange()}>
            Отправить на проверку
          </AppButton>
          <Text selectable style={{ ...typography.caption, color: colors.inkMuted, textAlign: 'center' }}>
            Текущие данные продолжат действовать, пока суперадмин не одобрит заявку.
          </Text>
        </SurfaceCard>
      )}

      <AppButton variant="secondary" onPress={() => router.replace('/')}>
        Режим пассажира
      </AppButton>
      <AppButton variant="quiet" onPress={() => void signOut()}>
        Выйти
      </AppButton>
    </Screen>
  );
}
