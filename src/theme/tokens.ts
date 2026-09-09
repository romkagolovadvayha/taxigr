import type { TextStyle, ViewStyle } from 'react-native';

export type AppColorScheme = 'light' | 'dark';

// The identity stays cobalt in both themes; controls use the adaptive palette.
export const brandIdentity = { blue: '#315DD5', white: '#FFFFFF' } as const;

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
  callHover: string;
  callPressed: string;
  callBorder: string;
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
  vehicleGlass: string;
  vehicleGlassHighlight: string;
  vehicleOutline: string;
  vehicleTire: string;
  vehicleWheel: string;
  vehiclePlateSurface: string;
  vehiclePlateInk: string;
  overlay: string;
  transparent: string;
};

export const lightColors: ColorPalette = {
  brand: '#315DD5',
  brandSoft: '#E4EBFC',
  brandPressed: '#254AB5',
  brandInk: '#FFFFFF',
  brandInkSecondary: '#DBE5FF',
  ink: '#172642',
  inkSecondary: '#5F6C83',
  inkMuted: '#748198',
  canvas: '#F3F5FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#EDF1F8',
  surfaceRaised: 'rgba(255,255,255,0.94)',
  border: '#DCE3F0',
  borderStrong: '#B9C6DE',
  success: '#18A957',
  successSoft: '#E7F7EE',
  successText: '#107C41',
  call: '#ECF8F1',
  callHover: '#E5F4EB',
  callPressed: '#DDF1E6',
  callBorder: '#B7DFC7',
  callInk: '#0F6F3B',
  warning: '#F59E0B',
  warningSoft: '#FFF4D6',
  warningText: '#855700',
  danger: '#C73543',
  dangerSoft: '#FDEBEC',
  dangerText: '#B3262B',
  dangerInk: '#FFFFFF',
  dangerPanelInk: '#F7F7F5',
  info: '#315DD5',
  infoSoft: '#E4EBFC',
  infoText: '#304B87',
  route: '#476DCF',
  mapFallback: '#E7ECF3',
  vehicleGlass: '#AFC7D8',
  vehicleGlassHighlight: '#EAF6FC',
  vehicleOutline: '#24272B',
  vehicleTire: '#202225',
  vehicleWheel: '#AEB4BC',
  vehiclePlateSurface: '#FFFFFF',
  vehiclePlateInk: '#111111',
  overlay: 'rgba(16,23,37,0.40)',
  transparent: 'transparent',
};

export const darkColors: ColorPalette = {
  brand: '#A6BDFF',
  brandSoft: '#263959',
  brandPressed: '#8EABF5',
  brandInk: '#152750',
  brandInkSecondary: '#304B87',
  ink: '#F0F4FC',
  inkSecondary: '#B2BDD1',
  inkMuted: '#95A4BE',
  canvas: '#101725',
  surface: '#192336',
  surfaceSecondary: '#232E44',
  surfaceRaised: 'rgba(25,35,54,0.96)',
  border: '#354259',
  borderStrong: '#566684',
  success: '#35C878',
  successSoft: '#173B29',
  successText: '#7CE5AA',
  call: '#193B29',
  callHover: '#1D432F',
  callPressed: '#214B35',
  callBorder: '#2B6847',
  callInk: '#91E6B4',
  warning: '#F7B84B',
  warningSoft: '#443412',
  warningText: '#FFD27A',
  danger: '#FF6B70',
  dangerSoft: '#4A2225',
  dangerText: '#FF9EA2',
  dangerInk: '#33131D',
  dangerPanelInk: '#F7F7F5',
  info: '#A6BDFF',
  infoSoft: '#263959',
  infoText: '#CDDAFA',
  route: '#AFC7FF',
  mapFallback: '#253244',
  vehicleGlass: '#7895A8',
  vehicleGlassHighlight: '#C6D9E4',
  vehicleOutline: '#17191B',
  vehicleTire: '#111315',
  vehicleWheel: '#9299A1',
  vehiclePlateSurface: '#FFFFFF',
  vehiclePlateInk: '#111111',
  overlay: 'rgba(0,0,0,0.66)',
  transparent: 'transparent',
};

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
  md: 14,
  lg: 18,
  card: 18,
  sheet: 26,
  pill: 999,
} as const;

export const motion = {
  duration: {
    pressIn: 120,
    pressOut: 160,
    quick: 140,
    standard: 230,
    sheet: 280,
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
    fontFamily: 'Manrope',
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '600',
    letterSpacing: -1.2,
  },
  pageTitle: {
    fontFamily: 'Manrope',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '600',
    letterSpacing: -0.6,
  },
  sectionTitle: {
    fontFamily: 'Manrope',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  bodyStrong: {
    fontFamily: 'Manrope',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontFamily: 'Manrope',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  caption: {
    fontFamily: 'Manrope',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
  },
  micro: {
    fontFamily: 'Manrope',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },
  money: {
    fontFamily: 'Manrope',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

export const shadows = {
  floating: {
    boxShadow: '0 8px 28px rgba(24,42,80,0.09)',
  },
  subtle: {
    boxShadow: '0 2px 12px rgba(24,42,80,0.05)',
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
  stopRowHeight: 76,
} as const;

export const componentSizing = {
  addressFieldAction: {
    touchTarget: 44,
    rowTopInset: 2,
    visualScale: 0.6,
    addIcon: 22,
    locationIcon: 20,
  },
} as const;
