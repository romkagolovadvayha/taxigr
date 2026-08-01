import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { privacySections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function PrivacyRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.privacy.title}
      lead="Политика объясняет, какие данные обрабатывает сервис, зачем они нужны и как пользователь может реализовать свои права."
      sections={privacySections}
    />
  );
}
