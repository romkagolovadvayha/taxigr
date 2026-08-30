import { describe, expect, it } from 'vitest';

import { base64ByteLength, imageMimeTypeFromBase64 } from '../src/utils/image-data';

describe('image data helpers', () => {
  it('recognizes supported image signatures with or without a data URL', () => {
    expect(imageMimeTypeFromBase64('/9j/AA==')).toBe('image/jpeg');
    expect(imageMimeTypeFromBase64('data:image/png;base64,iVBORw0KGgoAAA==')).toBe('image/png');
    expect(imageMimeTypeFromBase64('UklGRgAAAABXRUJQ')).toBe('image/webp');
    expect(imageMimeTypeFromBase64('bm90LWltYWdl')).toBeNull();
  });

  it('calculates decoded size without counting the data URL or padding', () => {
    expect(base64ByteLength('YQ==')).toBe(1);
    expect(base64ByteLength('data:text/plain;base64,YWI=')).toBe(2);
    expect(base64ByteLength('YWJj')).toBe(3);
  });
});
