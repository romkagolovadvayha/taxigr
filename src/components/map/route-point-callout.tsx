import { Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/app-icon';
import { useThemeColors } from '@/theme/theme-provider';
import { ROUTE_CALLOUT_GAP, ROUTE_CALLOUT_HEIGHT, ROUTE_CALLOUT_SIDE_PADDING, ROUTE_PIN_SIZE, ROUTE_PIN_STEM_HEIGHT, type RouteMapPoint } from './map-scene';

export function RoutePointCallout({ point, editable }: {
  point: Pick<RouteMapPoint, 'kind' | 'label' | 'badge' | 'etaMinutes'>;
  editable?: boolean;
}) {
  const colors = useThemeColors();
  const pickup = point.kind === 'pickup';
  const badgeColor = pickup ? colors.brandInk : colors.ink;
  return <View style={{ alignItems: 'center' }}>
    <View style={{ height: ROUTE_CALLOUT_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: ROUTE_CALLOUT_GAP,
      paddingHorizontal: ROUTE_CALLOUT_SIDE_PADDING, borderRadius: 14, backgroundColor: colors.surface,
      boxShadow: '0 2px 8px rgba(0,0,0,.16)' }}>
      <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9,
        backgroundColor: pickup ? colors.brand : colors.surfaceSecondary }}>
        {point.etaMinutes ? <>
          <Text style={{ fontSize: 14, lineHeight: 15, fontWeight: '700', color: badgeColor }}>{point.etaMinutes}</Text>
          <Text style={{ fontSize: 9, lineHeight: 10, color: badgeColor }}>мин</Text>
        </> : point.kind !== 'stop' ? <AppIcon name={pickup ? 'location' : 'flag'} size={18} color={badgeColor} /> :
          <Text style={{ fontSize: 14, fontWeight: '700', color: badgeColor }}>{point.badge}</Text>}
      </View>
      <View>
        <Text numberOfLines={1} style={{ maxWidth: 125, fontSize: 11, lineHeight: 14, color: colors.ink }}>{point.label}</Text>
        {editable && <Text style={{ fontSize: 10, lineHeight: 12, color: colors.inkSecondary }}>Изменить ›</Text>}
      </View>
    </View>
    <View style={{ width: 2, height: ROUTE_PIN_STEM_HEIGHT, backgroundColor: colors.inkSecondary, opacity: 0.6 }} />
    <View style={{ width: ROUTE_PIN_SIZE, height: ROUTE_PIN_SIZE, borderRadius: ROUTE_PIN_SIZE / 2, borderWidth: 3,
      borderColor: colors.inkSecondary, backgroundColor: colors.surface }} />
  </View>;
}
