# Shared layouts

## Root application layout

`src/app/_layout.tsx` wraps every route in `AppProviders`, applies the centralized
navigation theme, safe loading screen and role-protected Expo Router stacks.
Passenger `/` renders without a native header because the order screen owns its
map-led shell.

## Passenger order shell

The actual render branches live in `src/screens/passenger/order-screen.tsx`.

- Phone: full-screen map, floating brand/navigation row, rounded bottom sheet.
- Tablet: persistent 390 px booking panel at left, map at right.
- Desktop: 88 px navigation rail, 420 px booking panel, map fills the remainder.

The reusable navigation source is:

```tsx
function PassengerNav({ vertical = false }: { vertical?: boolean }) {
  return (
    <View
      style={{
        flexDirection: vertical ? 'column' : 'row',
        gap: spacing.x2,
        alignItems: 'center',
      }}
    >
      <IconButton icon="orders" label="Мои заказы" onPress={() => router.push('/orders')} />
      <IconButton icon="profile" label="Профиль" onPress={() => router.push('/profile')} />
    </View>
  );
}
```

## Brand mark

Full source from `src/components/brand-mark.tsx`:

```tsx
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, spacing, typography } from '@/theme/tokens';

type Props = { compact?: boolean; size?: number };
export function BrandMark({ compact = false, size = 40 }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x3 }}>
      <View style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
        borderCurve: 'continuous',
      }}>
        <Svg width={size * 0.74} height={size * 0.74} viewBox="0 0 32 32">
          <Path d="M9.5 16c1.5 3.3 5 3.3 6.1 1.5 1.5-2.5 3.9-3.4 6.6-2"
            stroke={colors.ink} strokeWidth="0.8" strokeLinecap="round"
            strokeDasharray="1.8 1.5" />
          <Path d="M9.5 3.8a5.3 5.3 0 00-5.3 5.3c0 4 5.3 8.2 5.3 8.2s5.3-4.2 5.3-8.2a5.3 5.3 0 00-5.3-5.3z"
            fill={colors.ink} />
          <Circle cx="9.5" cy="9.1" r="1.7" fill={colors.brand} />
          <Path d="M22.2 15.5a5.3 5.3 0 00-5.3 5.3c0 4 5.3 8.2 5.3 8.2s5.3-4.2 5.3-8.2a5.3 5.3 0 00-5.3-5.3z"
            fill={colors.ink} />
          <Circle cx="22.2" cy="20.8" r="1.7" fill={colors.brand} />
        </Svg>
      </View>
      {!compact && (
        <Text selectable style={{
          ...typography.bodyStrong,
          color: colors.ink,
          letterSpacing: -0.25,
        }}>
          Такси Грахово
        </Text>
      )}
    </View>
  );
}
```
