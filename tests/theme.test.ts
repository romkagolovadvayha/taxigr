import { afterEach, describe, expect, it } from 'vitest';

import {
  applyColorScheme,
  colors,
  darkColors,
  lightColors,
} from '../src/theme/tokens';

describe('application theme tokens', () => {
  afterEach(() => {
    applyColorScheme('light');
  });

  it('uses the light palette by default', () => {
    expect(colors.canvas).toBe(lightColors.canvas);
    expect(colors.surface).toBe(lightColors.surface);
  });

  it('updates every shared color when dark mode is enabled', () => {
    applyColorScheme('dark');

    expect(colors).toEqual(darkColors);
    expect(colors.canvas).toBe('#121212');
    expect(colors.brand).toBe(lightColors.brand);
    expect(colors.ink).not.toBe(lightColors.ink);
  });

  it('returns to the complete light palette', () => {
    applyColorScheme('dark');
    applyColorScheme('light');

    expect(colors).toEqual(lightColors);
  });
});
