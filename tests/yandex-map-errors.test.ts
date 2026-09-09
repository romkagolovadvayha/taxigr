import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

import {
  installYandexMapCancellationHandler,
  yandexMapCancellationScript,
  subscribeToYandexMapFailures,
  yandexMapNetworkResource,
  YANDEX_MAP_NETWORK_MESSAGE,
} from '../src/components/map/yandex-map-errors';

const coverageError = new Error('Coverage fetch failed [https://api-maps.yandex.ru/services/coverage/v2?l=map&ll=51.95%2C56.04&z=14&lang=ru_RU]: Load failed');

function rejection(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason });
}

describe('Yandex map network failures', () => {
  it('runs the document-head cancellation filter without bundled module dependencies', () => {
    const target = new EventTarget();
    runInNewContext(yandexMapCancellationScript, { window: target, URL });
    const overlay = vi.fn();
    target.addEventListener('unhandledrejection', overlay);
    const event = rejection(new Error('Failed to parse coverage response https://api-maps.yandex.ru/services/coverage/v2: The user aborted a request.'));
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(overlay).not.toHaveBeenCalled();
    target.dispatchEvent(rejection(new Error('An actual application failure')));
    expect(overlay).toHaveBeenCalledOnce();
  });
  it('prevents SDK cancellation from opening the global error overlay after map teardown', () => {
    const target = new EventTarget();
    installYandexMapCancellationHandler(target);
    installYandexMapCancellationHandler(target);
    const overlay = vi.fn();
    target.addEventListener('unhandledrejection', overlay);
    const event = rejection(new Error('Failed to parse coverage response https://api-maps.yandex.ru/services/coverage/v2?l=map: The user aborted a request.'));
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(overlay).not.toHaveBeenCalled();
    for (const reason of [coverageError,
      new Error('Failed to parse coverage response https://api-maps.yandex.ru/services/coverage/v2: Invalid JSON.'),
      new Error('Failed to parse coverage response https://api-maps.yandex.ru.evil.test/services/coverage/v2: The user aborted a request.'),
      new Error('Failed to parse coverage response https://api.taxigr.ru/v1/orders: The user aborted a request.'),
      new TypeError('Application failed'), null]) {
      const actualFailure = rejection(reason);
      target.dispatchEvent(actualFailure);
      expect(actualFailure.defaultPrevented).toBe(false);
      expect(overlay).toHaveBeenLastCalledWith(actualFailure);
    }
  });
  it('recognizes the reported SDK failure and removes coordinates from its resource URL', () => {
    expect(yandexMapNetworkResource(coverageError)).toBe('https://api-maps.yandex.ru/services/coverage/v2');
    expect(yandexMapNetworkResource({ message: coverageError.message })).toBe('https://api-maps.yandex.ru/services/coverage/v2');
  });

  it('leaves application failures and other URLs to the normal error monitor', () => {
    for (const error of [
      new TypeError('J.at is not a function'),
      new TypeError('Failed to fetch'),
      new Error('Coverage fetch failed [https://api.taxigr.ru/v1/orders]: Load failed'),
      new Error('Coverage fetch failed [https://api-maps.yandex.ru.evil.test/services/coverage/v2]: Load failed'),
      new Error('Coverage fetch failed [https://api-maps.yandex.ru/another-service]: Load failed'),
      null,
      { message: 42 },
    ]) expect(yandexMapNetworkResource(error)).toBeNull();
  });

  it('handles a coverage failure only while the map is subscribed, without hiding it from telemetry', () => {
    const target = new EventTarget();
    const onFailure = vi.fn();
    const telemetry = vi.fn();
    const unsubscribe = subscribeToYandexMapFailures(target, onFailure);
    target.addEventListener('unhandledrejection', telemetry);
    const unrelated = rejection(new TypeError('application bug'));
    target.dispatchEvent(unrelated);
    expect(unrelated.defaultPrevented).toBe(false);
    expect(onFailure).not.toHaveBeenCalled();

    const event = rejection(coverageError);
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(YANDEX_MAP_NETWORK_MESSAGE);
    expect(telemetry).toHaveBeenCalledWith(event);

    unsubscribe();
    const afterUnmount = rejection(coverageError);
    target.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
