export const readBatchPath = '/v1/transport/read-batch';
export const readBatchMaxRequests = 10;
export type BatchedRead = { id: string; path: string };
export type BatchedReadResult = { id: string; status: number; body: string };

export function isBatchableReadPath(path: string): boolean {
  if (typeof path !== 'string' || path.length > 2048 || !path.startsWith('/v1/') || path.includes('\\')) return false;
  try {
    const url = new URL(path, 'https://batch.invalid');
    const decoded = decodeURIComponent(url.pathname);
    return url.origin === 'https://batch.invalid' && !url.hash && decoded.startsWith('/v1/') &&
      !/^\/v1\/(auth|internal|webhooks|transport)(?:\/|$)/.test(decoded) && decoded !== '/v1/transport-health';
  } catch { return false; }
}
