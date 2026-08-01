import { describe, expect, it } from 'vitest';

import {
  DRIVER_MARKER_HEIGHT,
  DRIVER_MARKER_WIDTH,
  driverMarkerSvgMarkup,
} from '../src/components/map/driver-marker';

describe('driverMarkerSvgMarkup', () => {
  it('renders a compact top-down car without an enclosing badge', () => {
    const markup = driverMarkerSvgMarkup();

    expect(markup).toContain(`<svg width="${DRIVER_MARKER_WIDTH}" height="${DRIVER_MARKER_HEIGHT}"`);
    expect(markup).toContain('fill="#FFD600"');
    expect(markup).toContain('stroke="#181818"');
    expect(DRIVER_MARKER_HEIGHT).toBeGreaterThan(DRIVER_MARKER_WIDTH);
    expect(markup).not.toContain('<rect');
    expect(markup).not.toContain('background');
    expect(markup).not.toContain('border');
  });

  it('supports the centralized map palette', () => {
    const markup = driverMarkerSvgMarkup('#31D17E', '#F7F7F5');

    expect(markup).toContain('fill="#31D17E"');
    expect(markup).toContain('stroke="#F7F7F5"');
  });
});
