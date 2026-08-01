import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { driverTermsSections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function DriverTermsRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.driverTerms.title}
      lead="Условия определяют требования к водителю и автомобилю, порядок принятия заказов, комиссию и основания ограничения доступа."
      sections={driverTermsSections}
    />
  );
}
