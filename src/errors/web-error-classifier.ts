export type WebResourceFailure = {
  fatal: boolean;
  label: 'изображение' | 'медиафайл' | 'ресурс' | 'скрипт' | 'стиль';
  url: string;
};

export type ClassifiedWebError =
  | { kind: 'resource'; resource: WebResourceFailure }
  | { kind: 'runtime'; error: unknown };

type ResourceTarget = EventTarget & {
  currentSrc?: unknown;
  data?: unknown;
  href?: unknown;
  src?: unknown;
  tagName?: unknown;
};

function firstUrl(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function classifyResourceTarget(target: EventTarget): WebResourceFailure | null {
  const resourceTarget = target as ResourceTarget;
  const tagName = typeof resourceTarget.tagName === 'string'
    ? resourceTarget.tagName.toLowerCase()
    : '';
  const url = firstUrl(
    resourceTarget.currentSrc,
    tagName === 'link' ? resourceTarget.href : resourceTarget.src,
    resourceTarget.href,
    resourceTarget.data,
  );
  if (!url) return null;

  if (tagName === 'script') return { fatal: true, label: 'скрипт', url };
  if (tagName === 'link') return { fatal: false, label: 'стиль', url };
  if (tagName === 'img' || tagName === 'image') {
    return { fatal: false, label: 'изображение', url };
  }
  if (['audio', 'source', 'track', 'video'].includes(tagName)) {
    return { fatal: false, label: 'медиафайл', url };
  }
  return { fatal: false, label: 'ресурс', url };
}

export function classifyWebErrorEvent(
  event: Pick<ErrorEvent, 'error' | 'message' | 'target'>,
  globalTarget: EventTarget,
): ClassifiedWebError | null {
  if (event.target && event.target !== globalTarget) {
    const resource = classifyResourceTarget(event.target);
    return resource ? { kind: 'resource', resource } : null;
  }

  if (event.error !== undefined && event.error !== null) {
    return { kind: 'runtime', error: event.error };
  }
  if (event.message) return { kind: 'runtime', error: new Error(event.message) };
  return null;
}
