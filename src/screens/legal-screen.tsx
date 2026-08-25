import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { webHeadingLevel } from '@/accessibility/heading';
import { BrandMark } from '@/components/brand-mark';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import type { LegalSection } from '@/legal/content';
import { goBackOrReplace } from '@/navigation/back';
import { operatorDetailsReady } from '@/legal/operator';
import { colors, spacing, typography } from '@/theme/tokens';

type Props = {
  title: string;
  updated: string;
  lead: string;
  sections: LegalSection[];
  showOperatorWarning?: boolean;
};

export function LegalScreen({ title, updated, lead, sections, showOperatorWarning = true }: Props) {
  return (
    <Screen contentStyle={{ maxWidth: 860 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={() => goBackOrReplace('/legal')} />
        <BrandMark compact size={40} />
      </View>
      <View style={{ gap: spacing.x2 }}>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>{title}</Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>Редакция от {updated}</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{lead}</Text>
      </View>
      {showOperatorWarning && !operatorDetailsReady && (
        <View
          accessibilityRole="alert"
          style={{
            gap: spacing.x2,
            padding: spacing.x4,
            borderRadius: 18,
            backgroundColor: colors.brandSoft,
          }}
        >
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            Документ ещё не готов к публикации
          </Text>
          <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
            Перед коммерческим запуском заполните юридические реквизиты оператора и номер записи в
            реестре служб заказа легкового такси.
          </Text>
        </View>
      )}
      {sections.map((section) => (
        <View key={section.title} style={{ gap: spacing.x2 }}>
          <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>{section.title}</Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} selectable style={{ ...typography.body, color: colors.inkSecondary }}>
              {paragraph}
            </Text>
          ))}
          {section.bullets?.map((bullet) => (
            <View key={bullet} style={{ flexDirection: 'row', gap: spacing.x2 }}>
              <Text selectable style={{ ...typography.body, color: colors.ink }}>•</Text>
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary, flex: 1 }}>
                {bullet}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Link href="/legal" asChild>
        <AnimatedPressable
          feedback="subtle"
          accessibilityRole="link"
          contentStyle={({ pressed }) => ({
            minHeight: 44,
            alignSelf: 'flex-start',
            justifyContent: 'center',
            marginTop: spacing.x3,
            opacity: pressed ? 0.68 : 1,
          })}
        >
          <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
            Все правовые документы →
          </Text>
        </AnimatedPressable>
      </Link>
    </Screen>
  );
}
