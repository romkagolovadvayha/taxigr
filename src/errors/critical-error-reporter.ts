import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type ClientErrorSource =
  | 'react-error-boundary'
  | 'global-error'
  | 'unhandled-rejection'
  | 'resource-error';

type ReportOptions = {
  source: ClientErrorSource;
  route?: string;
  token?: string | null;
  fatal?: boolean;
  filename?: string;
  line?: number;
  column?: number;
  resource?: string;
};

const recentErrors = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 60_000;
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

function clientErrorEndpoint(): string | null {
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  ) {
    return 'http://localhost:4100/v1/client-errors';
  }
  return configuredApiUrl ? `${configuredApiUrl}/v1/client-errors` : null;
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Без сообщения',
      stack: error.stack,
    };
  }
  let message: string;
  try {
    message = typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    message = String(error);
  }
  return { name: 'UnknownError', message: message || 'Неизвестная ошибка' };
}

function platformName(): 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'unknown' {
  return ['android', 'ios', 'web', 'windows', 'macos'].includes(Platform.OS)
    ? Platform.OS as 'android' | 'ios' | 'web' | 'windows' | 'macos'
    : 'unknown';
}

function currentWebRoute(): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return window.location?.pathname;
}

export async function reportCriticalClientError(
  error: unknown,
  options: ReportOptions,
): Promise<void> {
  try {
    const endpoint = clientErrorEndpoint();
    if (!endpoint) return;
    const normalized = normalizeError(error);
    const fingerprint = [
      normalized.name,
      normalized.message,
      normalized.stack ?? '',
      options.resource ?? '',
    ].join('\n');
    const now = Date.now();
    const lastReportedAt = recentErrors.get(fingerprint) ?? 0;
    if (now - lastReportedAt < DEDUPLICATION_WINDOW_MS) return;
    recentErrors.set(fingerprint, now);
    if (recentErrors.size > 100) {
      for (const [key, timestamp] of recentErrors) {
        if (now - timestamp > DEDUPLICATION_WINDOW_MS) recentErrors.delete(key);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        keepalive: Platform.OS === 'web',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.token && !options.token.startsWith('demo:')
            ? { Authorization: `Bearer ${options.token}` }
            : {}),
        },
        body: JSON.stringify({
          ...normalized,
          source: options.source,
          route: options.route ?? currentWebRoute(),
          platform: platformName(),
          appVersion: Constants.expoConfig?.version,
          fatal: options.fatal,
          filename: options.filename,
          line: options.line,
          column: options.column,
          resource: options.resource,
          online:
            Platform.OS === 'web' && typeof navigator !== 'undefined'
              ? navigator.onLine
              : undefined,
          visibilityState:
            Platform.OS === 'web' && typeof document !== 'undefined'
              ? document.visibilityState
              : undefined,
          occurredAt: new Date().toISOString(),
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Reporting must never create another application error or crash loop.
  }
}
