import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { personalDataConsentSections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function PersonalDataConsentRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.personalDataConsent.title}
      lead="Согласие предоставляется отдельно от пользовательского соглашения и может быть отозвано в предусмотренном законом порядке."
      sections={personalDataConsentSections}
    />
  );
}
