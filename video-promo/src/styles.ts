import {Easing} from 'remotion';

export const C = {
  brand: '#F6C945',
  brandPressed: '#E5B82F',
  ink: '#25231E',
  ink2: '#686153',
  muted: '#A8AAA8',
  canvas: '#F7F4EB',
  surface: '#FFFFFF',
  surface2: '#F1EDDF',
  success: '#18A957',
  route: '#C49413',
  danger: '#E5484D',
} as const;

export const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const EASE = Easing.bezier(0.25, 0.46, 0.45, 0.94);
export const POP = Easing.bezier(0.2, 1.18, 0.3, 1);

export const clamp = (value: number) => Math.max(0, Math.min(1, value));

