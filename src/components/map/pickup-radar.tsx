import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useThemeColors } from '@/theme/theme-provider';

const pulse = {
  from: { opacity: 0.55, transform: [{ scale: 0.15 }] },
  to: { opacity: 0, transform: [{ scale: 1 }] },
};

export function PickupRadar() {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  return <View pointerEvents="none" accessible={false} style={{ width: 160, height: 160 }}>
    {[0, 800, 1600].map(delay => <Animated.View key={delay} style={{
      position: 'absolute', inset: 0, borderRadius: 80, borderWidth: 2,
      borderColor: colors.brand, backgroundColor: colors.brand,
      ...(reducedMotion
        ? { opacity: 0.08, transform: [{ scale: 0.3 + delay / 2400 }] }
        : { animationName: pulse, animationDuration: 2400, animationDelay: -delay,
          animationTimingFunction: 'linear', animationIterationCount: 'infinite' }),
    }} />)}
  </View>;
}
