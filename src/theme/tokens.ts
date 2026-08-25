import type { TextStyle, ViewStyle } from 'react-native';

export type AppColorScheme = 'light' | 'dark';

export type ColorPalette = {
  brand: string;
  brandSoft: string;
  brandPressed: string;
  brandInk: string;
  brandInkSecondary: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  canvas: string;
  surface: string;
  surfaceSecondary: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  success: string;
  successSoft: string;
  successText: string;
  call: string;
  callInk: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  danger: string;
  dangerSoft: string;
  dangerText: string;
  dangerInk: string;
  dangerPanelInk: string;
  info: string;
  infoSoft: string;
  infoText: string;
  route: string;
  mapFallback: string;
  overlay: string;
  transparent: string;
};

export const lightColors: ColorPalette = {
  brand: '#FFD600',
  brandSoft: '#FFF7CC',
  brandPressed: '#E9C400',
  brandInk: '#181818',
  brandInkSecondary: '#625600',
  ink: '#181818',
  inkSecondary: '#6F706F',
  inkMuted: '#A8AAA8',
  canvas: '#F4F4F2',
  surface: '#FFFFFF',
  surfaceSecondary: '#ECEDEB',
  surfaceRaised: 'rgba(255,255,255,0.94)',
  border: 'rgba(24,24,24,0.08)',
  borderStrong: 'rgba(24,24,24,0.18)',
  success: '#18A957',
  successSoft: '#E7F7EE',
  successText: '#107C41',
  call: '#18A957',
  callInk: '#181818',
  warning: '#F59E0B',
  warningSoft: '#FFF4D6',
  warningText: '#855700',
  danger: '#E5484D',
  dangerSoft: '#FDEBEC',
  dangerText: '#B3262B',
  dangerInk: '#181818',
  dangerPanelInk: '#F7F7F5',
  info: '#2684FF',
  infoSoft: '#E8F2FF',
  infoText: '#1E64B7',
  route: '#16B96B',
  mapFallback: '#E9EFE7',
  overlay: 'rgba(0,0,0,0.48)',
  transparent: 'transparent',
};

export const darkColors: ColorPalette = {
  brand: '#FFD600',
  brandSoft: '#463E00',
  brandPressed: '#E9C400',
  brandInk: '#181818',
  brandInkSecondary: '#625600',
  ink: '#F7F7F5',
  inkSecondary: '#B7B8B5',
  inkMuted: '#858681',
  canvas: '#121212',
  surface: '#1E1E1E',
  surfaceSecondary: '#2B2B2A',
  surfaceRaised: 'rgba(30,30,30,0.96)',
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.20)',
  success: '#35C878',
  successSoft: '#173B29',
  successText: '#7CE5AA',
  call: '#35C878',
  callInk: '#181818',
  warning: '#F7B84B',
  warningSoft: '#443412',
  warningText: '#FFD27A',
  danger: '#FF6B70',
  dangerSoft: '#4A2225',
  dangerText: '#FF9EA2',
  dangerInk: '#181818',
  dangerPanelInk: '#F7F7F5',
  info: '#65A7FF',
  infoSoft: '#173354',
  infoText: '#9AC6FF',
  route: '#31D17E',
  mapFallback: '#202522',
  overlay: 'rgba(0,0,0,0.66)',
  transparent: 'transparent',
};

/**
 * Existing UI components read this shared object while rendering. Mutating the
 * palette keeps the established token API intact; the theme provider remounts
 * the navigation subtree so every screen reads the new values immediately.
 */
export const colors: ColorPalette = { ...lightColors };

export function applyColorScheme(scheme: AppColorScheme): void {
  Object.assign(colors, scheme === 'dark' ? darkColors : lightColors);
}

export const spacing = {
  x1: 4,
  x2: 8,
  x2_5: 10,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x8: 32,
  x10: 40,
  x12: 48,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  card: 24,
  sheet: 30,
  pill: 999,
} as const;

export const motion = {
  duration: {
    pressIn: 120,
    pressOut: 160,
    quick: 140,
    standard: 180,
    sheet: 220,
    tracking: 280,
  },
  easing: {
    out: [0.23, 1, 0.32, 1] as const,
    inOut: [0.77, 0, 0.175, 1] as const,
    drawer: [0.32, 0.72, 0, 1] as const,
  },
  scale: {
    press: 0.97,
    subtlePress: 0.985,
  },
} as const;

export const opacity = {
  disabled: 0.42,
  pressed: 0.72,
  pressedSubtle: 0.76,
  visible: 1,
} as const;

export const typography = {
  display: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  bodyStrong: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  caption: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  money: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

export const shadows = {
  floating: {
    boxShadow: '0 8px 28px rgba(0,0,0,0.10)',
  },
  subtle: {
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
} satisfies Record<string, ViewStyle>;

export const breakpoints = {
  tablet: 768,
  desktop: 1100,
  adminTable: 900,
} as const;

export const layout = {
  modalWidth: 560,
  modalMaxHeight: '92%',
  chartHeight: 144,
  fullInset: 0,
} as const;
