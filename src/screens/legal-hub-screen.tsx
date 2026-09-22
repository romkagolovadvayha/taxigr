import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { webHeadingLevel } from '@/accessibility/heading';
import { BrandMark } from '@/components/brand-mark';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { legalDocuments } from '@/legal/documents';
import { useOperatorDetails } from '@/legal/use-operator-details';
import { goBackOrReplace } from '@/navigation/back';
import { radius, spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

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
  const colors = useThemeColors();
  const { operatorDetails } = useOperatorDetails();
  return (
    <Screen contentStyle={{ maxWidth: 920 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/')} />
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

      {groups.map((group) => (
        <View key={group.title} style={{ gap: spacing.x3 }}>
          <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
            {group.title}
          </Text>
          <View style={{ gap: spacing.x2 }}>
            {group.documents.map((document) => (
              <Link
                key={document.type}
                href={document.path}
                asChild
              >
                <AnimatedPressable
                  feedback="subtle"
                  accessibilityRole="link"
                  contentStyle={({ pressed }) => ({
                    minHeight: 56,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.x3,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.md,
                    paddingHorizontal: spacing.x4,
                    paddingVertical: spacing.x3,
                    opacity: pressed ? 0.72 : 1,
                  })}
                >
                  <Text style={{ ...typography.bodyStrong, color: colors.ink, flex: 1 }}>
                    {document.title}
                  </Text>
                  <AppIcon name="chevron" size={18} color={colors.inkMuted} />
                </AnimatedPressable>
              </Link>
            ))}
          </View>
        </View>
      ))}

      <View style={{ gap: spacing.x3 }}>
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Управление данными
        </Text>
        <Link href="/account-deletion" asChild>
          <AnimatedPressable
            feedback="subtle"
            accessibilityRole="link"
            contentStyle={({ pressed }) => ({
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.x3,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.x4,
              paddingVertical: spacing.x3,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Text style={{ ...typography.bodyStrong, color: colors.ink, flex: 1 }}>
              Запросить удаление аккаунта и данных
            </Text>
            <AppIcon name="chevron" size={18} color={colors.inkMuted} />
          </AnimatedPressable>
        </Link>
      </View>

      <View style={{ gap: spacing.x2, padding: spacing.x4, borderRadius: radius.lg, backgroundColor: colors.surface }}>
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Оператор сервиса
        </Text>
        {!!operatorDetails.legalName && (
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            {operatorDetails.legalName}
          </Text>
        )}
        {([
          ['ИНН', operatorDetails.inn],
          ['Регистрационный номер', operatorDetails.registrationNumber],
          ['Адрес', operatorDetails.address],
          ['Реестр служб заказа такси', operatorDetails.taxiRegistryNumber],
        ] as const).filter(([, value]) => value).map(([label, value]) => (
          <Text key={label} selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            {label}: {value}
          </Text>
        ))}
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Поддержка: {[operatorDetails.email, operatorDetails.phone].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Screen>
  );
}
