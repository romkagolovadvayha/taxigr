import { describe, expect, it } from 'vitest';
import { brandIdentity, darkColors, lightColors } from '../src/theme/tokens';

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe('application theme contrast', () => {
  for (const [name, colors] of Object.entries({ light: lightColors, dark: darkColors })) {
    it(`${name}: keeps body text and actionable labels readable`, () => {
      for (const background of [colors.canvas, colors.surface, colors.surfaceSecondary]) {
        expect(contrast(colors.ink, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.inkSecondary, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.inkMuted, background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.infoText, background)).toBeGreaterThanOrEqual(4.5);
      }
      for (const [text, background] of [
        [colors.brandInk, colors.brand], [colors.brandInkSecondary, colors.brand],
        [colors.dangerInk, colors.danger], [colors.infoText, colors.brandSoft],
      ]) expect(contrast(text!, background!)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('keeps the route symbol legible on the yellow identity', () => {
    expect(contrast(brandIdentity.ink, brandIdentity.background)).toBeGreaterThanOrEqual(4.5);
  });
});
