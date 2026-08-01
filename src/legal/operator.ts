function publicValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized || fallback;
}

export const operatorDetails = {
  legalName: publicValue(
    process.env.EXPO_PUBLIC_OPERATOR_LEGAL_NAME,
    'Реквизиты оператора не заполнены',
  ),
  status: publicValue(process.env.EXPO_PUBLIC_OPERATOR_STATUS, 'ИП или юридическое лицо'),
  inn: publicValue(process.env.EXPO_PUBLIC_OPERATOR_INN, 'не указан'),
  registrationNumber: publicValue(
    process.env.EXPO_PUBLIC_OPERATOR_REGISTRATION_NUMBER,
    'не указан',
  ),
  address: publicValue(process.env.EXPO_PUBLIC_OPERATOR_ADDRESS, 'не указан'),
  email: publicValue(process.env.EXPO_PUBLIC_OPERATOR_EMAIL, 'support@taxigr.ru'),
  phone: publicValue(process.env.EXPO_PUBLIC_OPERATOR_PHONE, 'не указан'),
  taxiRegistryNumber: publicValue(
    process.env.EXPO_PUBLIC_TAXI_REGISTRY_NUMBER,
    'не указан',
  ),
} as const;

export const operatorDetailsReady = [
  process.env.EXPO_PUBLIC_OPERATOR_LEGAL_NAME,
  process.env.EXPO_PUBLIC_OPERATOR_INN,
  process.env.EXPO_PUBLIC_OPERATOR_REGISTRATION_NUMBER,
  process.env.EXPO_PUBLIC_OPERATOR_ADDRESS,
  process.env.EXPO_PUBLIC_OPERATOR_PHONE,
  process.env.EXPO_PUBLIC_TAXI_REGISTRY_NUMBER,
].every((value) => Boolean(value?.trim()));
