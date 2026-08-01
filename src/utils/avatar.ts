export type AvatarMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export function detectAvatarMimeType(base64: string): AvatarMimeType | null {
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;

  if (payload.startsWith('/9j/')) return 'image/jpeg';
  if (payload.startsWith('iVBORw0KGgo')) return 'image/png';
  if (payload.startsWith('UklGR')) return 'image/webp';

  return null;
}
