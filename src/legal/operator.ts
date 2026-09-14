import type { OperatorDetails } from '../domain/operator-details';

// Keep existing deployment values until the administrator saves the settings.
export const defaultOperatorDetails: OperatorDetails = {
  legalName: process.env.EXPO_PUBLIC_OPERATOR_LEGAL_NAME?.trim() ?? '',
  status: process.env.EXPO_PUBLIC_OPERATOR_STATUS?.trim() || 'ИП',
  inn: process.env.EXPO_PUBLIC_OPERATOR_INN?.trim() ?? '',
  registrationNumber: process.env.EXPO_PUBLIC_OPERATOR_REGISTRATION_NUMBER?.trim() ?? '',
  address: process.env.EXPO_PUBLIC_OPERATOR_ADDRESS?.trim() ?? '',
  email: process.env.EXPO_PUBLIC_OPERATOR_EMAIL?.trim() || 'support@taxigr.ru',
  phone: process.env.EXPO_PUBLIC_OPERATOR_PHONE?.trim() ?? '',
  taxiRegistryNumber: process.env.EXPO_PUBLIC_TAXI_REGISTRY_NUMBER?.trim() ?? '',
};

export function presentOperatorDetails(details: OperatorDetails): OperatorDetails {
  return {
    legalName: details.legalName || 'Реквизиты оператора не заполнены',
    status: details.status || 'ИП или юридическое лицо',
    inn: details.inn || 'не указан',
    registrationNumber: details.registrationNumber || 'не указан',
    address: details.address || 'не указан',
    email: details.email || 'support@taxigr.ru',
    phone: details.phone || 'не указан',
    taxiRegistryNumber: details.taxiRegistryNumber || 'не указан',
  };
}

export function areOperatorDetailsReady(details: OperatorDetails): boolean {
  return [details.legalName, details.inn, details.registrationNumber, details.address,
    details.phone, details.taxiRegistryNumber].every((value) => Boolean(value.trim()));
}
