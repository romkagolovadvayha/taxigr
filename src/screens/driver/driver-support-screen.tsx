import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { webHeadingLevel } from '@/accessibility/heading';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { Screen } from '@/components/ui/screen';
import { SurfaceCard } from '@/components/ui/surface-card';
import { operatorDetails } from '@/legal/operator';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export function DriverSupportScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const supportPhoneAvailable = operatorDetails.phone !== 'не указан';

  const openUrl = async (url: string, failureMessage: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('Unsupported link');
      await Linking.openURL(url);
      setMessage(null);
    } catch {
      setMessage(failureMessage);
    }
  };

  return (
    <Screen contentStyle={{ maxWidth: 900 }}>
      <View>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Помощь водителю
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Поддержка, безопасность и правила работы
        </Text>
      </View>

      <SurfaceCard style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger }}>
        <View style={{ flexDirection: 'row', gap: spacing.x3, alignItems: 'center' }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
            }}
          >
            <AppIcon name="shield" color={colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.dangerText }}>
              Экстренная ситуация
            </Text>
            <Text selectable style={{ ...typography.caption, color: colors.dangerText }}>
              При угрозе жизни или здоровью сначала звоните 112.
            </Text>
          </View>
        </View>
        <AppButton
          variant="danger"
          accessibilityLabel="Позвонить в экстренную службу 112"
          onPress={() => void openUrl('tel:112', 'Не удалось открыть приложение для звонка.')}
        >
          Позвонить 112
        </AppButton>
      </SurfaceCard>

      <SurfaceCard>
        <View style={{ flexDirection: 'row', gap: spacing.x3, alignItems: 'center' }}>
          <AppIcon name="phone" />
          <View style={{ flex: 1 }}>
            <Text selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Поддержка сервиса</Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Укажите номер заказа и кратко опишите ситуацию.
            </Text>
          </View>
        </View>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          {operatorDetails.email}
        </Text>
        {supportPhoneAvailable && (
          <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
            {operatorDetails.phone}
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x3 }}>
          <AppButton
            fullWidth={false}
            style={{ flexGrow: 1 }}
            onPress={() =>
              void openUrl(
                `mailto:${operatorDetails.email}?subject=${encodeURIComponent('Помощь водителю')}`,
                'Не удалось открыть почтовое приложение.',
              )
            }
          >
            Написать
          </AppButton>
          {supportPhoneAvailable && (
            <AppButton
              fullWidth={false}
              variant="secondary"
              style={{ flexGrow: 1 }}
              onPress={() =>
                void openUrl(
                  `tel:${operatorDetails.phone.replace(/[^\d+]/gu, '')}`,
                  'Не удалось открыть приложение для звонка.',
                )
              }
            >
              Позвонить
            </AppButton>
          )}
        </View>
        {!!message && (
          <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.danger }}>
            {message}
          </Text>
        )}
      </SurfaceCard>

      <View style={{ gap: spacing.x3 }}>
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Полезные разделы
        </Text>
        {[
          {
            title: 'Безопасность поездок',
            description: 'Что делать до поездки, в пути и после происшествия',
            icon: 'shield' as const,
            route: '/safety' as const,
          },
          {
            title: 'Условия для водителей',
            description: 'Заказы, расчёты, документы и ответственность',
            icon: 'document' as const,
            route: '/driver-terms' as const,
          },
          {
            title: 'Обработка данных водителя',
            description: 'Какие сведения используются сервисом и зачем',
            icon: 'profile' as const,
            route: '/driver-data-consent' as const,
          },
          {
            title: 'Все документы сервиса',
            description: 'Реквизиты оператора и правовые документы',
            icon: 'document' as const,
            route: '/legal' as const,
          },
        ].map((item) => (
          <AppButton
            key={item.title}
            variant="secondary"
            accessibilityLabel={`${item.title}. ${item.description}`}
            onPress={() => router.push(item.route)}
            style={{ minHeight: 64 }}
          >
            <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
              <AppIcon name={item.icon} size={22} />
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <Text style={{ ...typography.bodyStrong, color: colors.ink }}>{item.title}</Text>
                <Text style={{ ...typography.caption, color: colors.inkSecondary }}>{item.description}</Text>
              </View>
              <AppIcon name="chevron" size={18} color={colors.inkMuted} />
            </View>
          </AppButton>
        ))}
      </View>
    </Screen>
  );
}
