import * as Linking from 'expo-linking';

export function phoneCallUrl(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/gu, '');
  if (!digits) return null;

  const dialable = `${trimmed.startsWith('+') ? '+' : ''}${digits}`;
  return `tel:${dialable}`;
}

export async function openPhoneCall(phone: string): Promise<void> {
  const url = phoneCallUrl(phone);
  if (!url) throw new Error('Phone number is unavailable');

  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('Phone calls are unavailable');

  await Linking.openURL(url);
}
