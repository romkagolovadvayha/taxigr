import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme/theme-provider';
import { OPEN_MAP_TILES_URL, OPEN_STREET_MAP_COPYRIGHT_URL } from './map-style';

export function MapCredits({ bottom = 4 }: { bottom?: number }) {
  const colors = useThemeColors();
  const linkStyle = { fontSize: 11, lineHeight: 15, color: colors.inkSecondary, textDecorationLine: 'underline' as const };
  return (
    <View testID="map-credits" style={{ position: 'absolute', right: 12, bottom,
      flexDirection: 'row', alignItems: 'center', columnGap: 4 }}>
      <Link href={OPEN_MAP_TILES_URL} accessibilityLabel="© OpenMapTiles" style={linkStyle}>© OMT</Link>
      <Text style={{ ...linkStyle, textDecorationLine: 'none' }}>&amp;</Text>
      <Link href={OPEN_STREET_MAP_COPYRIGHT_URL} accessibilityLabel="OpenStreetMap" style={linkStyle}>OSM</Link>
    </View>
  );
}
