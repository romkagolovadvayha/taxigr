import { describe, expect, it } from 'vitest';

import {
  DRIVER_MARKER_HEIGHT,
  DRIVER_MARKER_WIDTH,
  driverMarkerPngMarkup,
} from '../src/components/map/driver-marker';

describe('driverMarkerPngMarkup', () => {
  it('renders a compact top-down PNG car without an enclosing badge', () => {
    const markup = driverMarkerPngMarkup();

    expect(markup).toContain('<img');
    expect(markup).toContain('src="data:image/png;base64,iVBORw0KGgo');
    expect(markup).toContain(`width="${DRIVER_MARKER_WIDTH}"`);
    expect(markup).toContain(`height="${DRIVER_MARKER_HEIGHT}"`);
    expect(DRIVER_MARKER_HEIGHT).toBeGreaterThan(DRIVER_MARKER_WIDTH);
    expect(markup).not.toContain('<svg');
    expect(markup).not.toContain('background');
    expect(markup).not.toContain('border');
  });
});
