import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { reportCriticalClientError } from '@/errors/critical-error-reporter';
import { classifyWebErrorEvent } from '@/errors/web-error-classifier';

type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilsApi = {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};

export function CriticalErrorMonitor() {
  const pathname = usePathname();
  const { token } = useSession();
  const context = useRef({ pathname, token });

  useEffect(() => {
    context.current = { pathname, token };
  }, [pathname, token]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleError = (event: ErrorEvent) => {
        const classified = classifyWebErrorEvent(event, window);
        if (!classified) return;
        if (classified.kind === 'resource') {
          const resourceUrl = new URL(classified.resource.url, window.location.href);
          void reportCriticalClientError(
            new Error(`Не удалось загрузить ${classified.resource.label}`),
            {
              source: 'resource-error',
              route: context.current.pathname,
              token: context.current.token,
              fatal: classified.resource.fatal,
              resource: `${resourceUrl.origin}${resourceUrl.pathname}`,
            },
          );
          return;
        }
        void reportCriticalClientError(classified.error, {
          source: 'global-error',
          route: context.current.pathname,
          token: context.current.token,
          fatal: true,
          filename: event.filename || undefined,
          line: event.lineno || undefined,
          column: event.colno || undefined,
        });
      };
      const handleRejection = (event: PromiseRejectionEvent) => {
        void reportCriticalClientError(event.reason, {
          source: 'unhandled-rejection',
          route: context.current.pathname,
          token: context.current.token,
        });
      };
      window.addEventListener('error', handleError, true);
      window.addEventListener('unhandledrejection', handleRejection);
      return () => {
        window.removeEventListener('error', handleError, true);
        window.removeEventListener('unhandledrejection', handleRejection);
      };
    }

    const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsApi }).ErrorUtils;
    const previousHandler = errorUtils?.getGlobalHandler?.();
    if (!errorUtils?.setGlobalHandler) return;
    const handler: GlobalErrorHandler = (error, isFatal) => {
      void reportCriticalClientError(error, {
        source: 'global-error',
        route: context.current.pathname,
        token: context.current.token,
        fatal: isFatal,
      });
      previousHandler?.(error, isFatal);
    };
    errorUtils.setGlobalHandler(handler);
    return () => {
      if (previousHandler) errorUtils.setGlobalHandler?.(previousHandler);
    };
  }, []);

  return null;
}
