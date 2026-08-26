import {Easing} from 'remotion';

export const C = {
  brand: '#FFD600',
  brandPressed: '#E9C400',
  ink: '#181818',
  ink2: '#6F706F',
  muted: '#A8AAA8',
  canvas: '#F4F4F2',
  surface: '#FFFFFF',
  surface2: '#ECEDEB',
  success: '#18A957',
  route: '#16B96B',
  danger: '#E5484D',
} as const;

export const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const EASE = Easing.bezier(0.25, 0.46, 0.45, 0.94);
export const POP = Easing.bezier(0.2, 1.18, 0.3, 1);

export const clamp = (value: number) => Math.max(0, Math.min(1, value));

