import { describe, expect, it } from 'vitest';

import { driverDataConsentSections, personalDataConsentSections, privacySections, safetySections, termsSections } from '../src/legal/content';
import { areOperatorDetailsReady, defaultOperatorDetails, presentOperatorDetails } from '../src/legal/operator';

describe('operator details in legal documents', () => {
  const details = { ...defaultOperatorDetails, legalName: 'ИП Новый Оператор', inn: '012345678901',
    registrationNumber: '012345678901234', address: 'Адрес оператора', phone: '+7 999 000-00-00',
    email: 'new-operator@example.test', taxiRegistryNumber: '12345' };

  it('uses the current name and identifiers in all documents naming the operator', () => {
    for (const build of [termsSections, privacySections, personalDataConsentSections]) {
      const document = JSON.stringify(build(details));
      expect(document).toContain(details.legalName);
      expect(document).toContain(details.inn);
      expect(document).toContain(details.registrationNumber);
      expect(document).toContain(details.address);
      expect(JSON.stringify(build({ ...details, legalName: 'ИП После изменения' }))).not.toContain(details.legalName);
    }
  });

  it('updates every contact reference when settings change', () => {
    for (const build of [termsSections, privacySections, personalDataConsentSections, driverDataConsentSections, safetySections]) {
      const document = JSON.stringify(build(details));
      expect(document).toContain(details.email);
      expect(document).not.toContain('support@taxigr.ru');
    }
  });

  it('bases completeness on current settings and keeps placeholders out of editable values', () => {
    expect(areOperatorDetailsReady(details)).toBe(true);
    const incomplete = { ...details, legalName: '', inn: '', taxiRegistryNumber: '' };
    expect(areOperatorDetailsReady(incomplete)).toBe(false);
    expect(presentOperatorDetails(incomplete).inn).toBe('не указан');
    expect(incomplete.inn).toBe('');
  });
});
