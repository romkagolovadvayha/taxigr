// Tests and server rendering have no persistent device cache.
export async function readApiCache(): Promise<string | null> { return null; }
export async function writeApiCache(_value: string): Promise<void> {}
