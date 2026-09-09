import { View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { useThemeColors } from '@/theme/theme-provider';

// Decorative town blocks, not a geolocation or an available route. No network
// or image decoding is needed while Android prepares the real map.
export function MapPlaceholder() {
  const colors = useThemeColors();
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.mapFallback }}>
      <Svg width="100%" height="100%" viewBox="0 0 420 700" preserveAspectRatio="xMidYMid slice">
        <G fill={colors.surfaceSecondary}>
          <Rect x="14" y="30" width="107" height="90" rx="18" />
          <Rect x="146" y="28" width="116" height="91" rx="18" />
          <Rect x="287" y="25" width="123" height="95" rx="18" />
          <Rect x="13" y="145" width="108" height="132" rx="18" />
          <Rect x="150" y="145" width="112" height="78" rx="18" />
          <Rect x="286" y="145" width="125" height="130" rx="18" />
          <Rect x="20" y="310" width="95" height="101" rx="18" />
          <Rect x="292" y="310" width="117" height="111" rx="18" />
          <Rect x="18" y="460" width="108" height="100" rx="18" />
          <Rect x="155" y="465" width="117" height="98" rx="18" />
          <Rect x="298" y="454" width="103" height="108" rx="18" />
          <Rect x="18" y="590" width="112" height="100" rx="18" />
          <Rect x="156" y="590" width="115" height="102" rx="18" />
          <Rect x="298" y="592" width="110" height="100" rx="18" />
        </G>
        <Path d="M-30 300C70 340 65 460 170 437S290 355 450 426" fill="none" stroke={colors.successSoft} strokeWidth="56" />
        <G fill="none" stroke={colors.surface} strokeWidth="12" strokeLinecap="round" opacity={0.7}>
          <Path d="M-20 132H440M-20 289H440M-20 576H440M135-20V260Q140 289 138 320V720M275-20V230Q263 298 282 352V720" />
          <Path d="M-20 444Q185 447 275 438L440 432M207 145V218M20 209H118M296 212H440M20 640H120M160 640H268" strokeWidth="7" />
        </G>
        <Path d="M-20 290H186Q210 290 210 315V369Q210 441 282 439L440 432" fill="none" stroke={colors.brand} strokeWidth="13" opacity={0.28} />
      </Svg>
    </View>
  );
}
