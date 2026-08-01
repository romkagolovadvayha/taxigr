import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { driverDataConsentSections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function DriverDataConsentRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.driverDataConsent.title}
      lead="Согласие охватывает сведения, необходимые для проверки заявки, подключения водителя и исполнения требований к службе заказа."
      sections={driverDataConsentSections}
    />
  );
}
