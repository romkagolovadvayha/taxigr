import { Link, router } from 'expo-router';
import { Text, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { legalDocuments } from '@/legal/documents';
import { operatorDetails, operatorDetailsReady } from '@/legal/operator';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const groups = [
  {
    title: 'Пассажирам',
    documents: [
      legalDocuments.terms,
      legalDocuments.passengerRules,
      legalDocuments.personalDataConsent,
      legalDocuments.privacy,
      legalDocuments.safety,
    ],
  },
  {
    title: 'Водителям',
    documents: [legalDocuments.driverTerms, legalDocuments.driverDataConsent, legalDocuments.safety],
  },
];

export function LegalHubScreen() {
  return (
    <Screen contentStyle={{ maxWidth: 920 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => router.back()} />
        <BrandMark compact size={40} />
      </View>
      <View style={{ gap: spacing.x2 }}>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Правовая информация
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Здесь собраны действующие правила сервиса, отдельные согласия на обработку данных и
          рекомендации по безопасности.
        </Text>
      </View>

      {!operatorDetailsReady && (
        <View
          accessibilityRole="alert"
          style={{ padding: spacing.x4, borderRadius: radius.lg, backgroundColor: colors.brandSoft, gap: spacing.x2 }}
        >
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            Реквизиты оператора требуют заполнения
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Эта dev-версия не должна публиковаться как коммерческий сервис до заполнения реквизитов и
            регистрационных сведений службы заказа такси.
          </Text>
        </View>
      )}

      {groups.map((group) => (
        <View key={group.title} style={{ gap: spacing.x3 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
            {group.title}
          </Text>
          <View style={{ gap: spacing.x2 }}>
            {group.documents.map((document) => (
              <Link
                key={document.type}
                href={document.path}
                style={{
                  ...typography.bodyStrong,
                  color: colors.ink,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.x4,
                  paddingVertical: spacing.x4,
                }}
              >
                {document.title} →
              </Link>
            ))}
          </View>
        </View>
      ))}

      <View style={{ gap: spacing.x3 }}>
        <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Управление данными
        </Text>
        <Link
          href="/account-deletion"
          style={{
            ...typography.bodyStrong,
            color: colors.ink,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.x4,
            paddingVertical: spacing.x4,
          }}
        >
          Запросить удаление аккаунта и данных →
        </Link>
      </View>

      <View style={{ gap: spacing.x2, padding: spacing.x4, borderRadius: radius.lg, backgroundColor: colors.surface }}>
        <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Оператор сервиса
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          {operatorDetails.legalName} · {operatorDetails.status}
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          ИНН: {operatorDetails.inn} · регистрационный номер: {operatorDetails.registrationNumber}
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Адрес: {operatorDetails.address}
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Реестр служб заказа такси: {operatorDetails.taxiRegistryNumber}
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Поддержка: {operatorDetails.email} · {operatorDetails.phone}
        </Text>
      </View>
    </Screen>
  );
}
