// Metro selects the native or web implementation. Fail closed elsewhere.
export async function readLocationConsent(_purpose: string): Promise<boolean> { return false; }
export async function writeLocationConsent(_purpose: string): Promise<void> {}
