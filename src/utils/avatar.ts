import { imageMimeTypeFromBase64 } from './image-data';

export type AvatarMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export function detectAvatarMimeType(base64: string): AvatarMimeType | null {
  return imageMimeTypeFromBase64(base64);
}
