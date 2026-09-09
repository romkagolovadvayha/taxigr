import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { spacing, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

export default function NotFoundRoute() {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x4, backgroundColor: colors.canvas }}>
      <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
        Страница не найдена
      </Text>
      <Link href="/" asChild>
        <AppButton accessibilityRole="link" fullWidth={false}>На главную</AppButton>
      </Link>
    </View>
  );
}
