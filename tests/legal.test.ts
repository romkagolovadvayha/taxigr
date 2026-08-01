import { describe, expect, it } from 'vitest';

import {
  driverLegalAcceptanceSchema,
  initialLegalAcceptanceSchema,
  initialLegalQuerySchema,
} from '../server/legal';
import {
  currentDriverLegalAcceptance,
  currentInitialLegalAcceptance,
  legalDocuments,
} from '../src/legal/documents';

describe('legal documents and consent versions', () => {
  it('keeps document types and public paths unique', () => {
    const documents = Object.values(legalDocuments);
    expect(new Set(documents.map((document) => document.type)).size).toBe(documents.length);
    expect(new Set(documents.map((document) => document.path)).size).toBe(documents.length);
  });

  it('accepts only the current initial consent set', () => {
    expect(initialLegalAcceptanceSchema.safeParse(currentInitialLegalAcceptance()).success).toBe(true);
    expect(
      initialLegalAcceptanceSchema.safeParse({
        ...currentInitialLegalAcceptance(),
        termsVersion: 'old-version',
      }).success,
    ).toBe(false);
    expect(
      initialLegalAcceptanceSchema.safeParse({
        ...currentInitialLegalAcceptance(),
        personalDataAccepted: false,
      }).success,
    ).toBe(false);
  });

  it('accepts the explicit OAuth consent query', () => {
    const acceptance = currentInitialLegalAcceptance();
    expect(
      initialLegalQuerySchema.safeParse({
        terms_accepted: '1',
        personal_data_accepted: '1',
        terms_version: acceptance.termsVersion,
        passenger_rules_version: acceptance.passengerRulesVersion,
        privacy_version: acceptance.privacyVersion,
        personal_data_consent_version: acceptance.personalDataConsentVersion,
      }).success,
    ).toBe(true);
  });

  it('requires separate current driver consents', () => {
    expect(driverLegalAcceptanceSchema.safeParse(currentDriverLegalAcceptance()).success).toBe(true);
    expect(
      driverLegalAcceptanceSchema.safeParse({
        ...currentDriverLegalAcceptance(),
        driverTermsAccepted: false,
      }).success,
    ).toBe(false);
  });
});
