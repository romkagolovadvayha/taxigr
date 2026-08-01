export function russianNationalPhoneDigits(value: string): string {
  const digits = value.replace(/\D/gu, '');
  const withoutCountryCode =
    digits.length > 10 && (digits.startsWith('7') || digits.startsWith('8'))
      ? digits.slice(1)
      : digits;
  return withoutCountryCode.slice(0, 10);
}

export function formatRussianNationalPhone(value: string): string {
  const digits = russianNationalPhoneDigits(value);
  if (!digits) return '';

  const area = digits.slice(0, 3);
  const first = digits.slice(3, 6);
  const second = digits.slice(6, 8);
  const third = digits.slice(8, 10);

  let formatted = `(${area}`;
  if (area.length === 3) formatted += ')';
  if (first) formatted += ` ${first}`;
  if (second) formatted += `-${second}`;
  if (third) formatted += `-${third}`;
  return formatted;
}

export function isCompleteRussianMobilePhone(value: string): boolean {
  return /^9\d{9}$/u.test(russianNationalPhoneDigits(value));
}

export function russianPhoneE164(value: string): string | null {
  const digits = russianNationalPhoneDigits(value);
  return isCompleteRussianMobilePhone(digits) ? `+7${digits}` : null;
}

export function formatRussianPhone(value: string): string {
  const national = formatRussianNationalPhone(value);
  return national ? `+7 ${national}` : '+7';
}
