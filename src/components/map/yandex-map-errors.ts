export const YANDEX_MAP_NETWORK_MESSAGE = 'Не удалось загрузить карту. Проверьте соединение и попробуйте ещё раз.';

/** SDK cancellation during map teardown is expected, not a failed map load. */
function preventYandexMapCancellation(event: Event): void {
  const reason: unknown = (event as PromiseRejectionEvent).reason;
  const message = reason && typeof reason === 'object' && 'message' in reason ? reason.message : reason;
  if (typeof message !== 'string') return;
  const match = /^Failed to parse coverage response (https:\/\/\S+): The user aborted a request\.$/.exec(message);
  if (!match?.[1]) return;
  try {
    const url = new URL(match[1]);
    if (url.origin !== 'https://api-maps.yandex.ru' || url.pathname !== '/services/coverage/v2') return;
  } catch { return; }
  event.preventDefault();
  event.stopImmediatePropagation();
}

const cancellationTargets = new WeakSet<EventTarget>();
export function installYandexMapCancellationHandler(target: EventTarget): void {
  if (cancellationTargets.has(target)) return;
  cancellationTargets.add(target);
  target.addEventListener('unhandledrejection', preventYandexMapCancellation, { capture: true });
}

// This must run in the document head before Expo installs its development overlay.
export const yandexMapCancellationScript = `window.addEventListener('unhandledrejection',${preventYandexMapCancellation.toString()},true);`;

/** Recognize the SDK's coverage request, without swallowing unrelated rejections. */
export function yandexMapNetworkResource(reason: unknown): string | null {
  const message = typeof reason === 'string'
    ? reason
    : reason && typeof reason === 'object' && 'message' in reason
      ? reason.message
      : null;
  if (typeof message !== 'string') return null;
  const match = /^Coverage fetch failed \[(https:\/\/[^\s\]]+)\]:\s*.+$/.exec(message);
  if (!match?.[1]) return null;
  try {
    const url = new URL(match[1]);
    if (url.origin !== 'https://api-maps.yandex.ru' || url.pathname !== '/services/coverage/v2') {
      return null;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function subscribeToYandexMapFailures(
  target: EventTarget,
  onFailure: (message: string) => void,
): () => void {
  const handleRejection = (event: Event) => {
    if (!yandexMapNetworkResource((event as PromiseRejectionEvent).reason)) return;
    onFailure(YANDEX_MAP_NETWORK_MESSAGE);
    // The active map shows recovery UI. The global monitor still records the resource failure.
    event.preventDefault();
  };
  target.addEventListener('unhandledrejection', handleRejection);
  return () => target.removeEventListener('unhandledrejection', handleRejection);
}
