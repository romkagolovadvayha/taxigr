import { describe, expect, it } from 'vitest';

import { classifyWebErrorEvent } from '../src/errors/web-error-classifier';

function target(properties: Record<string, unknown>): EventTarget {
  return properties as unknown as EventTarget;
}

describe('web error classifier', () => {
  it('keeps script failures fatal and strips them from the runtime-error path', () => {
    const windowTarget = target({});
    const result = classifyWebErrorEvent(
      {
        error: undefined,
        message: '',
        target: target({ tagName: 'SCRIPT', src: 'https://taxigr.ru/entry.js?v=1' }),
      },
      windowTarget,
    );

    expect(result).toEqual({
      kind: 'resource',
      resource: {
        fatal: true,
        label: 'скрипт',
        url: 'https://taxigr.ru/entry.js?v=1',
      },
    });
  });

  it('classifies image and media failures as non-fatal resources', () => {
    const windowTarget = target({});

    expect(classifyWebErrorEvent({
      error: undefined,
      message: '',
      target: target({ tagName: 'IMG', currentSrc: 'https://taxigr.ru/car.webp' }),
    }, windowTarget)).toEqual({
      kind: 'resource',
      resource: {
        fatal: false,
        label: 'изображение',
        url: 'https://taxigr.ru/car.webp',
      },
    });
    expect(classifyWebErrorEvent({
      error: undefined,
      message: '',
      target: target({ tagName: 'AUDIO', src: 'https://taxigr.ru/ride.wav' }),
    }, windowTarget)).toEqual({
      kind: 'resource',
      resource: {
        fatal: false,
        label: 'медиафайл',
        url: 'https://taxigr.ru/ride.wav',
      },
    });
  });

  it('ignores empty resource events instead of inventing a fatal browser error', () => {
    const windowTarget = target({});

    expect(classifyWebErrorEvent({
      error: undefined,
      message: '',
      target: target({ tagName: 'IMG', src: '' }),
    }, windowTarget)).toBeNull();
    expect(classifyWebErrorEvent({
      error: undefined,
      message: '',
      target: windowTarget,
    }, windowTarget)).toBeNull();
  });

  it('preserves genuine global runtime errors', () => {
    const windowTarget = target({});
    const error = new TypeError('boom');

    expect(classifyWebErrorEvent({
      error,
      message: error.message,
      target: windowTarget,
    }, windowTarget)).toEqual({ kind: 'runtime', error });
  });
});
