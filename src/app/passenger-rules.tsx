import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { passengerRulesSections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function PassengerRulesRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.passengerRules.title}
      lead="Короткие обязательные правила, которые помогают сделать подачу и поездку безопасными для пассажира и водителя."
      sections={passengerRulesSections}
    />
  );
}
