import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { BrandGlyph, BrandMark } from '@/components/brand-mark';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { Screen } from '@/components/ui/screen';
import { SurfaceCard } from '@/components/ui/surface-card';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const features = [
  {
    icon: 'location' as const,
    title: 'Заказ без звонка',
    text: 'Укажите место подачи и адрес назначения. До подтверждения вы увидите ориентировочную цену и время в пути.',
  },
  {
    icon: 'child-seat' as const,
    title: 'Детский тариф',
    text: 'Приедет местный водитель с подходящим детским креслом. Выбирать модель или группу кресла в приложении не требуется.',
  },
  {
    icon: 'car' as const,
    title: 'Водители из Грахово',
    text: 'Сервис рассчитан на небольшое село: заказы получают одобренные водители, которые работают в Грахово и рядом.',
  },
];

export function PublicLandingScreen() {
  const { isPhone, isDesktop } = useResponsiveLayout();
  return (
    <Screen contentStyle={{ maxWidth: 1180, gap: spacing.x10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x4 }}>
        <BrandMark size={48} />
        <AppButton fullWidth={false} variant="secondary" onPress={() => router.push('/sign-in')}>
          Войти по телефону
        </AppButton>
      </View>

      <View
        style={{
          minHeight: isPhone ? 432 : 520,
          borderRadius: radius.sheet,
          backgroundColor: colors.brand,
          padding: isPhone ? spacing.x5 : spacing.x10,
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {!isDesktop && (
          <View
            style={{
              position: 'absolute',
              right: isPhone ? -42 : -108,
              bottom: isPhone ? 58 : -112,
              opacity: 0.055,
              pointerEvents: 'none',
              transform: [{ rotate: '10deg' }],
            }}
          >
            <BrandGlyph
              size={isPhone ? 200 : 560}
              color={colors.brandInk}
              pinColor={colors.brandInk}
            />
          </View>
        )}
        <Image
          source={require('../../assets/hero/taxi-car.webp')}
          contentFit="contain"
          accessible={false}
          style={{
            position: 'absolute',
            width: isPhone ? 190 : isDesktop ? 531 : 392,
            aspectRatio: 1200 / 584,
            right: isPhone ? -13 : isDesktop ? -22 : -21,
            bottom: isPhone ? 70 : isDesktop ? -28 : -16,
            opacity: isPhone ? 0.84 : 0.92,
          }}
        />
        <View
          style={{
            maxWidth: isPhone ? undefined : isDesktop ? 610 : 540,
            gap: isPhone ? spacing.x3 : spacing.x5,
            zIndex: 2,
          }}
        >
          <Text accessibilityRole="header" selectable style={{ ...typography.display, color: colors.brandInk, fontSize: isPhone ? 32 : 62, lineHeight: isPhone ? 35 : 66, letterSpacing: isPhone ? -0.8 : typography.display.letterSpacing }}>
            Такси для Грахово и поездок дальше
          </Text>
          <Text
            selectable
            numberOfLines={isPhone ? 3 : undefined}
            style={{
              ...typography.body,
              color: colors.brandInk,
              fontSize: isPhone ? 15 : 21,
              lineHeight: isPhone ? 20 : 29,
              maxWidth: isPhone ? 280 : 650,
            }}
          >
            {isPhone
              ? 'Закажите машину онлайн. Сразу видны маршрут, стоимость и статус водителя.'
              : 'Закажите машину через веб‑приложение, Android или iPhone. Сразу видны маршрут, фиксированная оценка стоимости и статус водителя.'}
          </Text>
        </View>
        <AppButton
          fullWidth={false}
          style={{
            minWidth: 250,
            minHeight: isPhone ? 52 : 56,
            backgroundColor: colors.ink,
            zIndex: 2,
            alignSelf: isPhone ? 'stretch' : 'flex-start',
          }}
          onPress={() => router.push('/sign-in')}
        >
          <Text style={{ color: colors.surface }}>Заказать такси</Text>
        </AppButton>
      </View>

      <View style={{ gap: spacing.x5 }}>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Поездка начинается в приложении
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x4 }}>
          {features.map((feature) => (
            <SurfaceCard key={feature.title} style={{ flexGrow: 1, flexBasis: 280 }}>
              <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                <AppIcon name={feature.icon} color={colors.brandInk} />
              </View>
              <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>{feature.title}</Text>
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{feature.text}</Text>
            </SurfaceCard>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: spacing.x6 }}>
        <View style={{ flex: 1, gap: spacing.x3 }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
            Как заказать такси в Грахово
          </Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            Войдите по одноразовому коду из SMS — отдельный пароль придумывать не нужно. Разрешите геолокацию или выберите адрес вручную. Приложение рассчитает маршрут и покажет два понятных тарифа: «Эконом» для обычной поездки и «Детский» для поездки с ребёнком. После нажатия кнопки заказ увидят свободные водители. Когда один из них примет поездку, в приложении появятся имя, рейтинг, автомобиль и государственный номер. Статус меняется в реальном времени: водитель едет к месту подачи, ожидает пассажира, выполняет или завершает поездку. Важные изменения дублируются уведомлениями на телефоне.
          </Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            Место подачи может находиться в селе Грахово, в деревнях Граховского района или в другой доступной точке. Адрес назначения не ограничен селом: можно договориться о поездке в Можгу, Ижевск, соседний населённый пункт или обратно в Грахово. Итоговая возможность поездки зависит от свободных водителей, дорожной обстановки и доступности маршрута. До создания заказа отображается расчётная фиксированная оценка. Оплата в текущей версии производится наличными водителю после поездки.
          </Text>
        </View>
        <SurfaceCard style={{ flex: 0.72, alignSelf: 'stretch' }}>
          <Text accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Для местных водителей</Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            Житель Грахово может подать заявку прямо из профиля. Суперадмин проверяет водительское удостоверение и сведения об автомобиле, а затем открывает доступ к кабинету. Водитель самостоятельно включает статус «На линии», видит новые предложения и принимает подходящий заказ. Для детского тарифа допускаются только водители, подтвердившие наличие кресла.
          </Text>
          <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
            В кабинете отдельно показаны выручка, комиссия сервиса и чистый доход. Комиссия фиксируется в момент принятия поездки, поэтому последующее изменение общего тарифа не меняет уже выполненные заказы. Суперадмин может приостановить доступ, назначить водителю индивидуальную комиссию и просмотреть операционную сводку.
          </Text>
          <AppButton onPress={() => router.push('/sign-in')}>Войти и подать заявку</AppButton>
        </SurfaceCard>
      </View>

      <View style={{ gap: spacing.x3, paddingBottom: spacing.x8 }}>
        <Text accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Почему сервис локальный</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Большие городские агрегаторы не всегда учитывают особенности небольших населённых пунктов. «Такси Грахово» сосредоточено на местных пассажирах и водителях: короткие адреса внутри села, поездки между деревнями, связь с районными и республиканскими центрами. При этом приложение использует привычный современный сценарий — карта, понятный выбор тарифа, история поездок и прозрачные статусы. Интерфейс одинаково работает на телефоне, планшете и компьютере, поэтому заказать машину можно с любого доступного устройства.
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Такси Грахово — цифровая платформа заказа поездок. Перевозку выполняет одобренный независимый водитель. Фактическое время подачи зависит от местоположения и доступности машин.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          <Text accessibilityRole="link" onPress={() => router.push('/legal')} style={{ ...typography.caption, color: colors.info }}>
            Все правовые документы
          </Text>
          <Text accessibilityRole="link" onPress={() => router.push('/privacy')} style={{ ...typography.caption, color: colors.info }}>
            Персональные данные
          </Text>
          <Text accessibilityRole="link" onPress={() => router.push('/terms')} style={{ ...typography.caption, color: colors.info }}>
            Пользовательское соглашение
          </Text>
          <Text accessibilityRole="link" onPress={() => router.push('/safety')} style={{ ...typography.caption, color: colors.info }}>
            Безопасность
          </Text>
        </View>
      </View>
    </Screen>
  );
}
