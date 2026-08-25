import { useEffect, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { StatusChip } from '@/components/ui/status-chip';
import { VehicleIllustration } from '@/components/vehicle/vehicle-illustration';
import { demoApplications } from '@/data/demo';
import type {
  DriverApplication,
  DriverApplicationStatus,
  VehicleChangeRequest,
} from '@/domain/models';
import { breakpoints, colors, radius, spacing, typography } from '@/theme/tokens';
import { formatDateTime } from '@/utils/format';

const statusLabels: Record<DriverApplicationStatus, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  approved: 'Одобрена',
  rejected: 'Отклонена',
};

const demoVehicleChanges: VehicleChangeRequest[] = [
  {
    id: 'demo-vehicle-change',
    driverId: 'demo-driver',
    driverName: 'Алексей Водитель',
    currentVehicle: {
      make: 'Lada',
      model: 'Vesta',
      year: 2021,
      color: 'Белая',
      colorHex: '#F7F7F2',
      plate: 'А123АА 18',
    },
    proposedVehicle: {
      make: 'Lada',
      model: 'Granta',
      year: 2023,
      color: 'Синяя',
      colorHex: '#2F6FED',
      plate: 'В456ВС 18',
    },
    currentHasChildSeat: false,
    hasChildSeat: true,
    status: 'pending',
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  },
];

type ModerationAction = {
  target: 'application' | 'vehicle-change';
  decision: 'approved' | 'rejected';
} | null;

export function ApplicationsScreen() {
  const { width } = useWindowDimensions();
  const { token } = useSession();
  const demo = token?.startsWith('demo:') ?? false;
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [selectedId, setSelectedId] = useState(applications[0]?.id);
  const [vehicleChanges, setVehicleChanges] = useState<VehicleChangeRequest[]>([]);
  const [selectedChangeId, setSelectedChangeId] = useState<string>();
  const [moderationAction, setModerationAction] = useState<ModerationAction>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = applications.find((item) => item.id === selectedId);
  const selectedChange = vehicleChanges.find((item) => item.id === selectedChangeId);
  const isTwoColumn = width >= breakpoints.adminTable;
  const isCompact = width < breakpoints.tablet;
  const moderationBusy = moderationAction !== null;

  useEffect(() => {
    if (demo) {
      const timer = setTimeout(() => {
        setApplications(demoApplications);
        setSelectedId(demoApplications[0]?.id);
        setVehicleChanges(demoVehicleChanges);
        setSelectedChangeId(demoVehicleChanges[0]?.id);
      }, 0);
      return () => clearTimeout(timer);
    }
    if (!token) return;
    const controller = new AbortController();
    void Promise.all([
      apiRequest<DriverApplication[]>('/v1/admin/applications', {
        token,
        signal: controller.signal,
      }),
      apiRequest<VehicleChangeRequest[]>('/v1/admin/vehicle-change-requests', {
        token,
        signal: controller.signal,
      }),
    ])
      .then(([items, changes]) => {
        setApplications(items);
        setVehicleChanges(changes);
        setSelectedId((current) => current ?? items[0]?.id);
        setSelectedChangeId((current) => current ?? changes[0]?.id);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Не удалось загрузить заявки');
        }
      });
    return () => controller.abort();
  }, [demo, token]);

  const moderate = async (status: 'approved' | 'rejected') => {
    if (!selected) return;
    setError(null);
    if (!demo && token) {
      setModerationAction({ target: 'application', decision: status });
      try {
        await apiRequest(`/v1/admin/applications/${selected.id}/moderate`, {
          method: 'POST',
          token,
          body: JSON.stringify({ decision: status }),
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Не удалось обработать заявку');
        return;
      } finally {
        setModerationAction(null);
      }
    }
    setApplications((previous) =>
      previous.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              status,
              moderationComment:
                status === 'approved' ? 'Документы и автомобиль проверены' : 'Нужны читаемые фото документов',
            }
          : item,
      ),
    );
  };

  const moderateVehicleChange = async (status: 'approved' | 'rejected') => {
    if (!selectedChange) return;
    setError(null);
    if (!demo && token) {
      setModerationAction({ target: 'vehicle-change', decision: status });
      try {
        await apiRequest(`/v1/admin/vehicle-change-requests/${selectedChange.id}/moderate`, {
          method: 'POST',
          token,
          body: JSON.stringify({ decision: status }),
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Не удалось обработать изменение');
        return;
      } finally {
        setModerationAction(null);
      }
    }
    setVehicleChanges((previous) =>
      previous.map((item) =>
        item.id === selectedChange.id
          ? {
              ...item,
              status,
              moderationComment:
                status === 'approved'
                  ? 'Новые данные автомобиля применены'
                  : 'Нужно уточнить сведения об автомобиле',
            }
          : item,
      ),
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: 1440,
        alignSelf: 'center',
        padding: isCompact ? spacing.x4 : spacing.x6,
        paddingBottom: spacing.x10,
        gap: spacing.x8,
      }}
    >
      <View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Заявки водителей</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>Проверка личности, документов и автомобиля</Text>
      </View>
      {!!error && <Text accessibilityRole="alert" selectable style={{ color: colors.danger }}>{error}</Text>}
      <View
        style={{
          flexDirection: isTwoColumn ? 'row' : 'column',
          alignItems: 'stretch',
          gap: spacing.x4,
        }}
      >
        <View style={{ flex: isTwoColumn ? 1 : undefined, minWidth: 0, gap: spacing.x2 }}>
          {applications.map((application) => {
            const active = application.id === selectedId;
            return (
              <AnimatedPressable
                feedback="subtle"
                key={application.id}
                accessibilityRole="button"
                aria-pressed={active}
                accessibilityLabel={`${application.applicantName}, ${statusLabels[application.status]}`}
                onPress={() => setSelectedId(application.id)}
                style={({ pressed }) => ({
                  padding: spacing.x4,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.brand : colors.border,
                  opacity: pressed ? 0.72 : 1,
                  gap: spacing.x2,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 }}>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink, flex: 1 }}>{application.applicantName}</Text>
                  <StatusChip
                    label={statusLabels[application.status]}
                    tone={application.status === 'approved' ? 'success' : application.status === 'rejected' ? 'danger' : 'warning'}
                  />
                </View>
                <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                  {application.vehicleMake} {application.vehicleModel} · {application.plate}
                </Text>
                <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>{formatDateTime(application.createdAt)}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
        {selected && (
          <View
            style={{
              flex: 1.3,
              minWidth: 0,
              padding: spacing.x5,
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              gap: spacing.x4,
            }}
          >
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>{selected.applicantName}</Text>
            {[
              ['Телефон', selected.phone],
              ['Права', selected.licenseNumber],
              ['Автомобиль', `${selected.vehicleMake} ${selected.vehicleModel}, ${selected.vehicleYear}`],
              ['Цвет и номер', `${selected.vehicleColor}, ${selected.plate}`],
              ['Детский тариф', selected.hasChildSeat ? 'Есть подтверждённое кресло' : 'Недоступен'],
            ].map(([label, value]) => (
              <View key={label} style={{ gap: spacing.x1 }}>
                <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>{label?.toUpperCase()}</Text>
                <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>{value}</Text>
              </View>
            ))}
            {!!selected.moderationComment && (
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>{selected.moderationComment}</Text>
            )}
            {selected.status === 'pending' && (
              <View style={{ flexDirection: 'row', gap: spacing.x3, marginTop: spacing.x2 }}>
                <AppButton
                  accessibilityLabel={`Отклонить заявку ${selected.applicantName}`}
                  variant="danger"
                  fullWidth={false}
                  disabled={moderationBusy}
                  loading={
                    moderationAction?.target === 'application' &&
                    moderationAction.decision === 'rejected'
                  }
                  style={{ flex: 1, minWidth: 0 }}
                  onPress={() => void moderate('rejected')}
                >
                  Отклонить
                </AppButton>
                <AppButton
                  accessibilityLabel={`Одобрить заявку ${selected.applicantName}`}
                  fullWidth={false}
                  disabled={moderationBusy}
                  loading={
                    moderationAction?.target === 'application' &&
                    moderationAction.decision === 'approved'
                  }
                  style={{ flex: 1, minWidth: 0 }}
                  onPress={() => void moderate('approved')}
                >
                  Одобрить
                </AppButton>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={{ gap: spacing.x2 }}>
        <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Изменения автомобилей
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Новая машина, цвет, госномер или детское кресло
        </Text>
      </View>
      <View
        style={{
          flexDirection: isTwoColumn ? 'row' : 'column',
          alignItems: 'stretch',
          gap: spacing.x4,
        }}
      >
        <View style={{ flex: isTwoColumn ? 1 : undefined, minWidth: 0, gap: spacing.x2 }}>
          {vehicleChanges.length === 0 && (
            <Text selectable style={{ ...typography.body, color: colors.inkMuted }}>
              Заявок на изменение пока нет
            </Text>
          )}
          {vehicleChanges.map((change) => {
            const active = change.id === selectedChangeId;
            return (
              <AnimatedPressable
                feedback="subtle"
                key={change.id}
                accessibilityRole="button"
                aria-pressed={active}
                accessibilityLabel={`${change.driverName ?? 'Водитель'}, ${statusLabels[change.status]}`}
                onPress={() => setSelectedChangeId(change.id)}
                style={({ pressed }) => ({
                  padding: spacing.x4,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surface,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.brand : colors.border,
                  opacity: pressed ? 0.72 : 1,
                  gap: spacing.x2,
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x3 }}>
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink, flex: 1 }}>
                    {change.driverName ?? 'Водитель'}
                  </Text>
                  <StatusChip
                    label={statusLabels[change.status]}
                    tone={
                      change.status === 'approved'
                        ? 'success'
                        : change.status === 'rejected'
                          ? 'danger'
                          : 'warning'
                    }
                  />
                </View>
                <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                  {change.proposedVehicle.color} {change.proposedVehicle.make}{' '}
                  {change.proposedVehicle.model} · {change.proposedVehicle.plate}
                </Text>
                <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
                  {formatDateTime(change.createdAt)}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
        {selectedChange && (
          <View
            style={{
              flex: 1.3,
              minWidth: 0,
              padding: spacing.x5,
              borderRadius: radius.card,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              gap: spacing.x4,
            }}
          >
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
              {selectedChange.driverName ?? 'Изменение автомобиля'}
            </Text>
            <View
              style={{
                flexDirection: isTwoColumn ? 'row' : 'column',
                alignItems: isTwoColumn ? 'center' : 'stretch',
                gap: spacing.x3,
              }}
            >
              <View style={{ flex: isTwoColumn ? 1 : undefined, minWidth: 0, gap: spacing.x2 }}>
                <Text selectable style={{ ...typography.micro, color: colors.inkMuted }}>
                  СЕЙЧАС
                </Text>
                <VehicleIllustration
                  colorHex={selectedChange.currentVehicle.colorHex}
                  width={84}
                  height={44}
                />
                <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                  {selectedChange.currentVehicle.color} {selectedChange.currentVehicle.make}{' '}
                  {selectedChange.currentVehicle.model}
                </Text>
                <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                  {selectedChange.currentVehicle.year} · {selectedChange.currentVehicle.plate} ·{' '}
                  {selectedChange.currentHasChildSeat ? 'с креслом' : 'без кресла'}
                </Text>
              </View>
              <Text accessibilityElementsHidden style={{ ...typography.sectionTitle, color: colors.inkMuted }}>
                {isTwoColumn ? '→' : '↓'}
              </Text>
              <View style={{ flex: isTwoColumn ? 1 : undefined, minWidth: 0, gap: spacing.x2 }}>
                <Text selectable style={{ ...typography.micro, color: colors.warningText }}>
                  ПОСЛЕ ОДОБРЕНИЯ
                </Text>
                <VehicleIllustration
                  colorHex={selectedChange.proposedVehicle.colorHex}
                  width={84}
                  height={44}
                />
                <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                  {selectedChange.proposedVehicle.color} {selectedChange.proposedVehicle.make}{' '}
                  {selectedChange.proposedVehicle.model}
                </Text>
                <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                  {selectedChange.proposedVehicle.year} · {selectedChange.proposedVehicle.plate} ·{' '}
                  {selectedChange.hasChildSeat ? 'с креслом' : 'без кресла'}
                </Text>
              </View>
            </View>
            {!!selectedChange.moderationComment && (
              <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                {selectedChange.moderationComment}
              </Text>
            )}
            {selectedChange.status === 'pending' && (
              <View style={{ flexDirection: 'row', gap: spacing.x3, marginTop: spacing.x2 }}>
                <AppButton
                  accessibilityLabel={`Отклонить изменение автомобиля ${selectedChange.driverName ?? 'водителя'}`}
                  variant="danger"
                  fullWidth={false}
                  disabled={moderationBusy}
                  loading={
                    moderationAction?.target === 'vehicle-change' &&
                    moderationAction.decision === 'rejected'
                  }
                  style={{ flex: 1, minWidth: 0 }}
                  onPress={() => void moderateVehicleChange('rejected')}
                >
                  Отклонить
                </AppButton>
                <AppButton
                  accessibilityLabel={`Одобрить изменение автомобиля ${selectedChange.driverName ?? 'водителя'}`}
                  fullWidth={false}
                  disabled={moderationBusy}
                  loading={
                    moderationAction?.target === 'vehicle-change' &&
                    moderationAction.decision === 'approved'
                  }
                  style={{ flex: 1, minWidth: 0 }}
                  onPress={() => void moderateVehicleChange('approved')}
                >
                  Одобрить
                </AppButton>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
