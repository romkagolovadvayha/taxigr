import type { LegalSection } from '@/legal/content';
import { LEGAL_UPDATED_AT } from '@/legal/documents';
import { LegalScreen } from '@/screens/legal-screen';

type Props = {
  title: string;
  lead: string;
  sections: LegalSection[];
  showOperatorWarning?: boolean;
};

export function LegalDocumentRoute({
  title,
  lead,
  sections,
  showOperatorWarning,
}: Props) {
  return (
    <LegalScreen
      title={title}
      updated={LEGAL_UPDATED_AT}
      lead={lead}
      sections={sections}
      showOperatorWarning={showOperatorWarning}
    />
  );
}
