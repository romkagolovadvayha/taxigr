import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { colors, spacing, typography } from '@/theme/tokens';

export default function NotFoundRoute() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x4, backgroundColor: colors.canvas }}>
      <Text selectable style={{ ...typography.pageTitle, color: colors.ink }}>Страница не найдена</Text>
      <Link href="/" asChild><AppButton fullWidth={false}>На главную</AppButton></Link>
    </View>
  );
}

