import type { TextStyle, ViewStyle } from 'react-native';

export type AppColorScheme = 'light' | 'dark';

// The route symbol stays graphite on warm taxi yellow in both themes.
export const brandIdentity = { background: '#F6C945', ink: '#25231E' } as const;

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
  brand: '#F6C945',
  brandSoft: '#FFF3CB',
  brandPressed: '#E5B82F',
  brandInk: '#25231E',
  brandInkSecondary: '#53451E',
  ink: '#25231E',
  inkSecondary: '#686153',
  inkMuted: '#716958',
  canvas: '#F7F4EB',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1EDDF',
  surfaceRaised: 'rgba(255,255,255,0.94)',
  border: '#E6DFCA',
  borderStrong: '#B9AE91',
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
  info: '#9B750A',
  infoSoft: '#FFF3CB',
  infoText: '#725714',
  route: '#C49413',
  mapFallback: '#ECE7D9',
  vehicleGlass: '#AFC7D8',
  vehicleGlassHighlight: '#EAF6FC',
  vehicleOutline: '#24272B',
  vehicleTire: '#202225',
  vehicleWheel: '#AEB4BC',
  vehiclePlateSurface: '#FFFFFF',
  vehiclePlateInk: '#111111',
  overlay: 'rgba(37,35,30,0.40)',
  transparent: 'transparent',
};

export const darkColors: ColorPalette = {
  brand: '#F7D46A',
  brandSoft: '#40351C',
  brandPressed: '#EAC453',
  brandInk: '#242119',
  brandInkSecondary: '#53461E',
  ink: '#F7F3E8',
  inkSecondary: '#C2BAA9',
  inkMuted: '#AAA08D',
  canvas: '#181714',
  surface: '#22211D',
  surfaceSecondary: '#2E2C25',
  surfaceRaised: 'rgba(34,33,29,0.96)',
  border: '#454136',
  borderStrong: '#706850',
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
  info: '#F7D46A',
  infoSoft: '#40351C',
  infoText: '#FFE7A0',
  route: '#F7D46A',
  mapFallback: '#302D24',
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
    boxShadow: '0 8px 28px rgba(54,44,20,0.09)',
  },
  subtle: {
    boxShadow: '0 2px 12px rgba(54,44,20,0.05)',
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
