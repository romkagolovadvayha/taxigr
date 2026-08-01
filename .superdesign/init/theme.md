# Theme

## Compact token summary

- Brand: `#FFD600`; pressed `#E9C400`.
- Ink: `#181818`; secondary `#6F706F`; muted `#A8AAA8`.
- Surfaces: canvas `#F4F4F2`, white `#FFFFFF`, secondary `#ECEDEB`.
- Route: `#16B96B`; success `#18A957`; danger `#E5484D`.
- Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Radii: 12, 16, 20, 24, sheet 30, pill 999.
- Type: system sans; page 28/34, section 20/26, body 16/22, caption 13/17,
  money 24/28 weight 800.
- Breakpoints: tablet 768, desktop 1100, admin table 900.
- Shadows: floating `0 8px 28px rgba(0,0,0,.10)`, subtle
  `0 2px 12px rgba(0,0,0,.06)`.

## Raw token source

```ts
export const colors = {
  brand: '#FFD600',
  brandPressed: '#E9C400',
  ink: '#181818',
  inkSecondary: '#6F706F',
  inkMuted: '#A8AAA8',
  canvas: '#F4F4F2',
  surface: '#FFFFFF',
  surfaceSecondary: '#ECEDEB',
  border: 'rgba(24,24,24,0.08)',
  borderStrong: 'rgba(24,24,24,0.18)',
  success: '#18A957',
  warning: '#F59E0B',
  danger: '#E5484D',
  info: '#2684FF',
  route: '#16B96B',
  transparent: 'transparent',
} as const;

export const spacing = {
  x1: 4, x2: 8, x3: 12, x4: 16, x5: 20, x6: 24,
  x8: 32, x10: 40, x12: 48,
} as const;

export const radius = {
  sm: 12, md: 16, lg: 20, card: 24, sheet: 30, pill: 999,
} as const;

export const typography = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.2 },
  pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
  sectionTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  bodyStrong: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: '500' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  money: {
    fontSize: 24, lineHeight: 28, fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
};

export const shadows = {
  floating: { boxShadow: '0 8px 28px rgba(0,0,0,0.10)' },
  subtle: { boxShadow: '0 2px 12px rgba(0,0,0,0.06)' },
};

export const breakpoints = { tablet: 768, desktop: 1100, adminTable: 900 };
```

Full product guidance is in `.superdesign/design-system.md`.
