import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { ROUTE_CALLOUT_GAP, ROUTE_CALLOUT_HEIGHT, ROUTE_CALLOUT_SIDE_PADDING, ROUTE_PIN_SIZE, ROUTE_PIN_STEM_HEIGHT } from './map-scene';

export function RoutePointCallout({ badge, title, pickup, editable }: {
  badge: string;
  title: string;
  pickup: boolean;
  editable?: boolean;
}) {
  const colors = useThemeColors();
  return <View style={{ alignItems: 'center' }}>
    <View style={{ height: ROUTE_CALLOUT_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: ROUTE_CALLOUT_GAP,
      paddingHorizontal: ROUTE_CALLOUT_SIDE_PADDING, borderRadius: 14, backgroundColor: colors.surface,
      boxShadow: '0 2px 8px rgba(0,0,0,.16)' }}>
      <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 9,
        backgroundColor: pickup ? colors.brand : colors.surfaceSecondary }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: pickup ? colors.brandInk : colors.ink }}>{badge}</Text>
      </View>
      <View>
        <Text numberOfLines={1} style={{ maxWidth: 125, fontSize: 11, lineHeight: 14, color: colors.ink }}>{title}</Text>
        {editable && <Text style={{ fontSize: 12, lineHeight: 14, fontWeight: '700', color: colors.ink }}>Изменить ›</Text>}
      </View>
    </View>
    <View style={{ width: 2, height: ROUTE_PIN_STEM_HEIGHT, backgroundColor: colors.inkSecondary, opacity: 0.6 }} />
    <View style={{ width: ROUTE_PIN_SIZE, height: ROUTE_PIN_SIZE, borderRadius: ROUTE_PIN_SIZE / 2, borderWidth: 3,
      borderColor: colors.inkSecondary, backgroundColor: colors.surface }} />
  </View>;
}
