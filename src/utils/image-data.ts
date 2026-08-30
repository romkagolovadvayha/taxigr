import type { RideChatImageMimeType } from '@/domain/models';

export type ImageResizeToFit = { width: number } | { height: number };

export function imageResizeToFit(
  width: number,
  height: number,
  maxDimension: number,
): ImageResizeToFit | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxDimension) ||
    width <= 0 ||
    height <= 0 ||
    maxDimension <= 0 ||
    Math.max(width, height) <= maxDimension
  ) {
    return null;
  }

  return width >= height ? { width: maxDimension } : { height: maxDimension };
}

export function imageMimeTypeFromBase64(base64: string): RideChatImageMimeType | null {
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;

  if (payload.startsWith('/9j/')) return 'image/jpeg';
  if (payload.startsWith('iVBORw0KGgo')) return 'image/png';
  if (payload.startsWith('UklGR')) return 'image/webp';

  return null;
}

export function base64ByteLength(base64: string): number {
  const payload = (base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64)
    .replace(/\s/gu, '');
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}
