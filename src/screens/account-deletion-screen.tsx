import { Link, router } from 'expo-router';
import { Linking, Text, View } from 'react-native';

import { webHeadingLevel } from '@/accessibility/heading';
import { BrandMark } from '@/components/brand-mark';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { operatorDetails } from '@/legal/operator';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const requestSteps = [
  {
    title: 'Отправьте запрос',
    text: `Напишите на ${operatorDetails.email} с темой «Удаление аккаунта — Такси Грахово».`,
  },
  {
    title: 'Укажите данные аккаунта',
    text: 'Укажите имя и номер телефона, с которым вы входили в приложение. Если нужно удалить только отдельные данные, перечислите их.',
  },
  {
    title: 'Подтвердите номер',
    text: 'Поддержка может попросить подтвердить, что номер принадлежит вам. Никому не сообщайте коды из SMS или мессенджера.',
  },
  {
    title: 'Получите подтверждение',
    text: 'После проверки мы отключим аккаунт и ответим на исходное письмо. Удаление из рабочих систем занимает до 30 календарных дней.',
  },
] as const;

const deletedData = [
  'профиль: имя, пол, фотография и номер телефона в активном аккаунте;',
  'данные входа, активные сессии, push-токены и привязки мессенджеров;',
  'текущие координаты и другие данные, для хранения которых больше нет цели или законного основания.',
] as const;

const retainedData = [
  'заказы, маршруты и расчёты — 3 года после завершения поездки или дольше, если этого требует закон;',
  'согласия с правовыми документами — 3 года после прекращения обработки;',
  'журналы безопасности — до 1 года, если инцидент или закон не требует большего срока;',
  'отклонённая заявка водителя — 1 год; данные одобренного водителя — в течение отношений и 3 года после их окончания.',
] as const;

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <View style={{ gap: spacing.x2 }}>
      {items.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: spacing.x2 }}>
          <Text selectable style={{ ...typography.body, color: colors.ink }}>
            •
          </Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary, flex: 1 }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AccountDeletionScreen() {
  const subject = 'Удаление аккаунта — Такси Грахово';
  const body = [
    'Здравствуйте!',
    '',
    'Прошу удалить мой аккаунт и связанные с ним персональные данные в приложении «Такси Грахово».',
    '',
    'Имя:',
    'Номер телефона аккаунта: +7',
    '',
    'Я понимаю, что отдельные сведения могут сохраняться в сроки, указанные на странице запроса.',
  ].join('\n');
  const mailtoUrl = `mailto:${operatorDetails.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  return (
    <Screen contentStyle={{ maxWidth: 900 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
        <IconButton icon="back" label="Назад" onPress={goBack} />
        <BrandMark compact size={40} />
      </View>

      <View
        style={{
          gap: spacing.x3,
          padding: spacing.x6,
          borderRadius: radius.card,
          backgroundColor: colors.brandSoft,
        }}
      >
        <Text selectable style={{ ...typography.caption, color: colors.brandInkSecondary }}>
          ТАКСИ ГРАХОВО · УПРАВЛЕНИЕ ДАННЫМИ
        </Text>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Удаление аккаунта и связанных данных
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary, maxWidth: 720 }}>
          На этой странице пользователь приложения «Такси Грахово» может запросить полное удаление
          аккаунта или отдельных персональных данных. Вход в приложение для отправки запроса не нужен.
        </Text>
      </View>

      <View style={{ gap: spacing.x3 }}>
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Как запросить удаление
        </Text>
        {requestSteps.map((step, index) => (
          <View
            key={step.title}
            style={{
              flexDirection: 'row',
              gap: spacing.x4,
              padding: spacing.x4,
              borderRadius: radius.lg,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.brand,
              }}
            >
              <Text selectable style={{ ...typography.bodyStrong, color: colors.brandInk }}>
                {index + 1}
              </Text>
            </View>
            <View style={{ flex: 1, gap: spacing.x1 }}>
              <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
                {step.title}
              </Text>
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
                {step.text}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View
        style={{
          gap: spacing.x3,
          padding: spacing.x5,
          borderRadius: radius.card,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.borderStrong,
        }}
      >
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Отправить запрос
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Откроется ваше почтовое приложение с готовым текстом. Проверьте и дополните имя и номер
          телефона аккаунта перед отправкой.
        </Text>
        <AppButton
          accessibilityLabel="Запросить удаление аккаунта по электронной почте"
          onPress={() => void Linking.openURL(mailtoUrl)}
        >
          Запросить удаление по email
        </AppButton>
        <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
          Адрес: {operatorDetails.email} · Тема: «{subject}»
        </Text>
      </View>

      <View style={{ gap: spacing.x3 }}>
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Какие данные будут удалены
        </Text>
        <View
          style={{
            gap: spacing.x3,
            padding: spacing.x5,
            borderRadius: radius.lg,
            backgroundColor: colors.successSoft,
          }}
        >
          <BulletList items={deletedData} />
          <Text selectable style={{ ...typography.caption, color: colors.successText }}>
            Аккаунт отключается после проверки запроса. Удаление из рабочих систем завершается в
            срок до 30 календарных дней.
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.x3 }}>
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>
          Какие данные могут быть сохранены
        </Text>
        <View
          style={{
            gap: spacing.x3,
            padding: spacing.x5,
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            Данные ниже отделяются от активного профиля, ограничиваются в использовании и хранятся
            только для исполнения закона, разрешения споров и подтверждения безопасности:
          </Text>
          <BulletList items={retainedData} />
          <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
            По окончании соответствующего срока сведения удаляются или обезличиваются, если нет иного
            законного основания для хранения.
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.x2 }}>
        <Text selectable style={{ ...typography.bodyStrong, color: colors.ink }}>
          Важно
        </Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Удаление аккаунта необратимо: доступ к профилю и связанным функциям будет закрыт. Если у вас
          идёт активная поездка или рассматривается спор, выполнение запроса может начаться после их
          завершения.
        </Text>
        <Link href="/privacy" asChild>
          <AnimatedPressable
            feedback="subtle"
            accessibilityRole="link"
            contentStyle={({ pressed }) => ({
              minHeight: 44,
              alignSelf: 'flex-start',
              justifyContent: 'center',
              opacity: pressed ? 0.68 : 1,
            })}
          >
            <Text style={{ ...typography.bodyStrong, color: colors.ink }}>
              Политика обработки персональных данных →
            </Text>
          </AnimatedPressable>
        </Link>
      </View>
    </Screen>
  );
}
