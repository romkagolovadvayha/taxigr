import { createHmac, timingSafeEqual } from 'node:crypto';

export function normalizeRussianPhone(value: string): string | null {
  const digits = value.replace(/\D/gu, '');
  const national =
    digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;

  if (!national || !national.startsWith('9')) return null;
  return `+7${national}`;
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 2)} ${phone.slice(2, 5)} ***-**-${phone.slice(-2)}`;
}

export function phoneCodeHash(userId: string, phone: string, code: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`phone-code:${userId}:${phone}:${code}`)
    .digest('hex');
}

export function deviceFingerprint(deviceId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`device:${deviceId}`)
    .digest('hex');
}

export function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
