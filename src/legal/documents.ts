export const LEGAL_UPDATED_AT = '25 августа 2026 года';

export const legalDocuments = {
  terms: {
    type: 'terms',
    version: '2026-07-31',
    title: 'Пользовательское соглашение',
    path: '/terms',
  },
  passengerRules: {
    type: 'passenger_rules',
    version: '2026-07-31',
    title: 'Правила для пассажиров',
    path: '/passenger-rules',
  },
  privacy: {
    type: 'privacy',
    version: '2026-08-25',
    title: 'Политика обработки персональных данных',
    path: '/privacy',
  },
  personalDataConsent: {
    type: 'personal_data_consent',
    version: '2026-08-25',
    title: 'Согласие на обработку персональных данных',
    path: '/personal-data-consent',
  },
  driverTerms: {
    type: 'driver_terms',
    version: '2026-07-31',
    title: 'Условия работы водителя',
    path: '/driver-terms',
  },
  driverDataConsent: {
    type: 'driver_data_consent',
    version: '2026-07-31',
    title: 'Согласие кандидата в водители',
    path: '/driver-data-consent',
  },
  safety: {
    type: 'safety',
    version: '2026-07-30',
    title: 'Безопасность поездок',
    path: '/safety',
  },
} as const;

export type InitialLegalAcceptance = {
  termsAccepted: true;
  personalDataAccepted: true;
  termsVersion: typeof legalDocuments.terms.version;
  passengerRulesVersion: typeof legalDocuments.passengerRules.version;
  privacyVersion: typeof legalDocuments.privacy.version;
  personalDataConsentVersion: typeof legalDocuments.personalDataConsent.version;
};

export type DriverLegalAcceptance = {
  driverTermsAccepted: true;
  driverDataAccepted: true;
  driverTermsVersion: typeof legalDocuments.driverTerms.version;
  driverDataConsentVersion: typeof legalDocuments.driverDataConsent.version;
};

export function currentInitialLegalAcceptance(): InitialLegalAcceptance {
  return {
    termsAccepted: true,
    personalDataAccepted: true,
    termsVersion: legalDocuments.terms.version,
    passengerRulesVersion: legalDocuments.passengerRules.version,
    privacyVersion: legalDocuments.privacy.version,
    personalDataConsentVersion: legalDocuments.personalDataConsent.version,
  };
}

export function currentDriverLegalAcceptance(): DriverLegalAcceptance {
  return {
    driverTermsAccepted: true,
    driverDataAccepted: true,
    driverTermsVersion: legalDocuments.driverTerms.version,
    driverDataConsentVersion: legalDocuments.driverDataConsent.version,
  };
}
