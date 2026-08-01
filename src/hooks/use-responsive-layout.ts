import { useWindowDimensions } from 'react-native';

import { breakpoints } from '@/theme/tokens';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const isTablet = shortestSide >= breakpoints.tablet || width >= breakpoints.tablet;
  const isDesktop = width >= breakpoints.desktop;

  return {
    width,
    height,
    isPhone: !isTablet,
    isTablet,
    isDesktop,
    contentInset: isDesktop ? 32 : isTablet ? 24 : 16,
  };
}

