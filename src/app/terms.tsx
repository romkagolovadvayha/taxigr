import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { termsSections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function TermsRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.terms.title}
      lead="Соглашение регулирует использование приложения, оформление заказа и отношения пассажира, оператора и перевозчика."
      sections={termsSections}
    />
  );
}
