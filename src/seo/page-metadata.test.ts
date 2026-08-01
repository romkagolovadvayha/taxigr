import { describe, expect, it } from 'vitest';

import {
  FALLBACK_PAGE_METADATA,
  getPageMetadata,
  PAGE_METADATA,
} from './page-metadata';

describe('page metadata', () => {
  it('covers every exported application page with unique, readable metadata', () => {
    expect(Object.keys(PAGE_METADATA)).toHaveLength(30);

    const entries = Object.values(PAGE_METADATA);
    expect(new Set(entries.map((item) => item.title)).size).toBe(entries.length);
    expect(new Set(entries.map((item) => item.description)).size).toBe(entries.length);

    for (const metadata of entries) {
      expect(metadata.title.length).toBeGreaterThanOrEqual(20);
      expect(metadata.title.length).toBeLessThanOrEqual(60);
      expect(metadata.description.length).toBeGreaterThanOrEqual(50);
      expect(metadata.description.length).toBeLessThanOrEqual(160);
      expect('canonicalPath' in metadata && Boolean(metadata.canonicalPath)).toBe(
        metadata.indexable,
      );
    }
  });

  it('uses the private order metadata for every dynamic order page', () => {
    expect(getPageMetadata('/orders/ride-123')).toBe(PAGE_METADATA['/orders/[id]']);
    expect(getPageMetadata('/orders/2026-07-30')).toBe(PAGE_METADATA['/orders/[id]']);
  });

  it('keeps unknown application routes out of search results', () => {
    expect(getPageMetadata('/unknown')).toEqual(FALLBACK_PAGE_METADATA);
    expect(getPageMetadata('/unknown').indexable).toBe(false);
  });
});
