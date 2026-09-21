const key = (purpose: string) => `taxigr_location_consent_20260922_${purpose}`;
const accepted = new Set<string>();

export async function readLocationConsent(purpose: string): Promise<boolean> {
  try { return accepted.has(purpose) || globalThis.localStorage?.getItem(key(purpose)) === 'accepted'; }
  catch { return accepted.has(purpose); }
}

export async function writeLocationConsent(purpose: string): Promise<void> {
  accepted.add(purpose);
  try { globalThis.localStorage?.setItem(key(purpose), 'accepted'); }
  catch { /* Keep this explicit consent for the current session only. */ }
}
