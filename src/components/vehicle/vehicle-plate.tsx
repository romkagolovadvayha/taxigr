import { Text, View } from 'react-native';

import { parseVehiclePlate } from '@/domain/vehicle-plate';

const ink = '#17212B';

export function VehiclePlate({ plate }: { plate: string }) {
  const parsed = parseVehiclePlate(plate);
  const numberStyle = { color: ink, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] };
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`Государственный номер ${plate}`}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', minHeight: 38,
        borderWidth: 1.5, borderColor: ink, borderRadius: 5, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
      {parsed ? <>
        <View style={{ width: 12, alignItems: 'center' }}><View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: ink }} /></View>
        <Text selectable style={{ ...numberStyle, fontSize: 21, lineHeight: 34, paddingRight: 7 }}>
          {parsed.prefix}<Text style={{ fontSize: 28, letterSpacing: 0.4 }}>{parsed.digits}</Text>{parsed.suffix}
        </Text>
        <View style={{ alignSelf: 'stretch', borderLeftWidth: 1.5, borderLeftColor: ink, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center' }}>
          <Text selectable style={{ ...numberStyle, fontSize: 20, lineHeight: 23 }}>{parsed.region}</Text>
          <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', paddingBottom: 2 }}>
            <Text style={{ color: ink, fontSize: 6, lineHeight: 8, fontWeight: '600' }}>RUS</Text>
            <View style={{ width: 13, height: 8, borderWidth: 0.5, borderColor: '#A9B2BF', overflow: 'hidden' }}>
              {['#FFFFFF', '#2457B7', '#D52D37'].map((color) => <View key={color} style={{ flex: 1, backgroundColor: color }} />)}
            </View>
          </View>
        </View>
      </> : <Text selectable style={{ ...numberStyle, fontSize: 18, paddingHorizontal: 10, paddingVertical: 5 }}>{plate.toLocaleUpperCase('ru-RU')}</Text>}
    </View>
  );
}
