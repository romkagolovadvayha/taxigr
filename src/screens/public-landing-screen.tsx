import { Link, router } from 'expo-router';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Path, Text as SvgText, TextPath } from 'react-native-svg';

import { webHeadingLevel } from '@/accessibility/heading';
import { BrandGlyph, BrandMark } from '@/components/brand-mark';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
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

const footerLinks = [
  { href: '/legal', label: 'Все правовые документы' },
  { href: '/privacy', label: 'Персональные данные' },
  { href: '/terms', label: 'Пользовательское соглашение' },
  { href: '/safety', label: 'Безопасность' },
] as const;

function CommissionVerification({ compact }: { compact: boolean }) {
  const sealSize = compact ? 84 : 116;

  return (
    <View
      accessible
      accessibilityLabel="Ноль процентов комиссии для пассажиров. Проверено Такси Грахово."
      style={{
        minHeight: sealSize,
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.x4,
        zIndex: 2,
      }}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0,
          paddingRight: compact ? sealSize + spacing.x3 : 0,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Text
            selectable
            style={{
              color: colors.brandInk,
              fontSize: compact ? 68 : 104,
              lineHeight: compact ? 70 : 101,
              fontWeight: '900',
              letterSpacing: compact ? -3.2 : -5.4,
            }}
          >
            0%
          </Text>
          <Text
            selectable
            style={{
              color: colors.brandInk,
              fontSize: compact ? 23 : 34,
              lineHeight: compact ? 30 : 42,
              fontWeight: '800',
              letterSpacing: -0.8,
              marginLeft: compact ? 0 : spacing.x2,
              marginBottom: compact ? spacing.x2 : spacing.x3,
            }}
          >
            комиссий
          </Text>
        </View>
        <Text
          selectable
          style={{
            ...typography.micro,
            color: colors.brandInkSecondary,
            textTransform: 'uppercase',
            letterSpacing: 1.4,
          }}
        >
          для пассажиров
        </Text>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: sealSize,
          height: sealSize,
          flexShrink: 0,
          ...(compact
            ? {
                position: 'absolute',
                right: 0,
                top: 0,
              }
            : {}),
          opacity: 0.78,
          transform: [{ rotate: '-9deg' }],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 120 120">
          <Defs>
            <Path id="verification-seal-top" d="M 14 63 A 47 47 0 0 1 106 63" />
            <Path id="verification-seal-bottom" d="M 18 73 A 45 45 0 0 0 102 73" />
          </Defs>
          <Circle
            cx="60"
            cy="60"
            r="57"
            fill={colors.brand}
            stroke={colors.brandInk}
            strokeWidth="2.4"
            strokeDasharray="4 3"
          />
          <Circle
            cx="60"
            cy="60"
            r="49"
            fill="none"
            stroke={colors.brandInk}
            strokeWidth="1.6"
          />
          <SvgText
            fill={colors.brandInk}
            fontSize="12"
            fontWeight="900"
            letterSpacing="1.5"
            textAnchor="middle"
          >
            <TextPath href="#verification-seal-top" startOffset="50%">
              ПРОВЕРЕНО
            </TextPath>
          </SvgText>
          <SvgText
            fill={colors.brandInk}
            fontSize="8.5"
            fontWeight="800"
            letterSpacing="1.1"
            textAnchor="middle"
          >
            <TextPath href="#verification-seal-bottom" startOffset="50%">
              ТАКСИ ГРАХОВО
            </TextPath>
          </SvgText>
        </Svg>
        <View
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon
            name="check"
            size={compact ? 27 : 38}
            color={colors.brandInk}
            strokeWidth={compact ? 3 : 3.2}
          />
        </View>
      </View>
    </View>
  );
}

export function PublicLandingScreen() {
  const { isPhone, isDesktop } = useResponsiveLayout();
  return (
    <Screen contentStyle={{ maxWidth: 1180, gap: spacing.x10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.x4 }}>
        <BrandMark size={48} />
        <AppButton
          fullWidth={false}
          variant="secondary"
          accessibilityLabel="Войти по телефону"
          onPress={() => router.push('/sign-in')}
        >
          {isPhone ? 'Войти' : 'Войти по телефону'}
        </AppButton>
      </View>

      <View
        style={{
          minHeight: isPhone ? 516 : 570,
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
        <CommissionVerification compact={isPhone} />
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
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
          Поездка начинается в приложении
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.x4 }}>
          {features.map((feature) => (
            <SurfaceCard key={feature.title} style={{ flexGrow: 1, flexBasis: 280 }}>
              <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                <AppIcon name={feature.icon} color={colors.brandInk} />
              </View>
              <Text {...webHeadingLevel(3)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>{feature.title}</Text>
              <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>{feature.text}</Text>
            </SurfaceCard>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: isPhone ? 'column' : 'row', gap: spacing.x6 }}>
        <View style={{ flex: 1, gap: spacing.x3 }}>
          <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>
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
          <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.sectionTitle, color: colors.ink }}>Для местных водителей</Text>
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
        <Text {...webHeadingLevel(2)} accessibilityRole="header" selectable style={{ ...typography.pageTitle, color: colors.ink }}>Почему сервис локальный</Text>
        <Text selectable style={{ ...typography.body, color: colors.inkSecondary }}>
          Большие городские агрегаторы не всегда учитывают особенности небольших населённых пунктов. «Такси Грахово» сосредоточено на местных пассажирах и водителях: короткие адреса внутри села, поездки между деревнями, связь с районными и республиканскими центрами. При этом приложение использует привычный современный сценарий — карта, понятный выбор тарифа, история поездок и прозрачные статусы. Интерфейс одинаково работает на телефоне, планшете и компьютере, поэтому заказать машину можно с любого доступного устройства.
        </Text>
        <Text selectable style={{ ...typography.caption, color: colors.inkMuted }}>
          Такси Грахово — цифровая платформа заказа поездок. Перевозку выполняет одобренный независимый водитель. Фактическое время подачи зависит от местоположения и доступности машин.
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.x4, flexWrap: 'wrap' }}>
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} asChild>
              <AnimatedPressable
                feedback="subtle"
                accessibilityRole="link"
                contentStyle={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  opacity: pressed ? 0.68 : 1,
                })}
              >
                <Text style={{ ...typography.caption, color: colors.info }}>
                  {item.label}
                </Text>
              </AnimatedPressable>
            </Link>
          ))}
        </View>
      </View>
    </Screen>
  );
}
