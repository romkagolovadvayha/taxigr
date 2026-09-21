import { LegalDocumentRoute } from '@/components/legal/legal-document-route';
import { privacySections } from '@/legal/content';
import { legalDocuments } from '@/legal/documents';

export default function PrivacyRoute() {
  return (
    <LegalDocumentRoute
      title={legalDocuments.privacy.title}
      lead="Политика конфиденциальности приложения «Такси Грахово» (ru.grahovo.taxi). Разработчик в Google Play — Roman Mescheryakov. Здесь описано, какие данные мы собираем, зачем используем, кому передаём и как их удалить."
      sections={privacySections}
      showOperatorWarning={false}
    />
  );
}
