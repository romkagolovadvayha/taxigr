export type GroupAlertProvider = 'max' | 'whatsapp';
export type WatchedGroup = { provider: GroupAlertProvider; title: string };

export function normalizeGroupTitle(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('ru');
}

export function isTaxiRequest(text: string): boolean {
  const value = text.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return /(?:^| )(?:кто (?:сейчас )?таксует|(?:нужно|нужна|ищу|ищем|есть) (?:срочно )?такси|такси есть|кто (?:может )?(?:отвезти|подвезти|довезти|забрать))(?: |$)/u.test(value);
}

/** Only an explicit sender identity from the messenger, never a display name/body. */
export function senderPhone(uri: string | undefined): string | null {
  if (!uri?.startsWith('tel:+')) return null;
  const phone = uri.slice(4).replace(/[ ()-]/gu, '');
  return /^\+[1-9]\d{7,14}$/u.test(phone) ? phone : null;
}

export function groupAllowed(groups: WatchedGroup[], provider: GroupAlertProvider, title: string): boolean {
  return groups.some(group => group.provider === provider && normalizeGroupTitle(group.title) === normalizeGroupTitle(title));
}
