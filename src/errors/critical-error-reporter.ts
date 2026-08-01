import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getApiUrl } from '@/api/client';

export type ClientErrorSource =
  | 'react-error-boundary'
  | 'global-error'
  | 'unhandled-rejection';

type ReportOptions = {
  source: ClientErrorSource;
  route?: string;
  token?: string | null;
  fatal?: boolean;
};

const recentErrors = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 5_000;

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

export async function reportCriticalClientError(
  error: unknown,
  options: ReportOptions,
): Promise<void> {
  try {
    const normalized = normalizeError(error);
    const fingerprint = `${normalized.name}\n${normalized.message}\n${normalized.stack ?? ''}`;
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
      await fetch(`${getApiUrl()}/v1/client-errors`, {
        method: 'POST',
        signal: controller.signal,
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
          route: options.route,
          platform: platformName(),
          appVersion: Constants.expoConfig?.version,
          fatal: options.fatal,
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
