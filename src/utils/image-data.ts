import type { RideChatImageMimeType } from '@/domain/models';

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
