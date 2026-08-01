import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { safetySections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function SafetyRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.safety.title}
      lead="Практические рекомендации пассажиру и водителю до, во время и после поездки."
      sections={safetySections}
      showOperatorWarning={false}
    />
  );
}
